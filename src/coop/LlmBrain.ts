import type { CoopPartner, CoopCommand } from './Coop';
import { parseCompletion, promptTail, splitFace, trimReply, type CoopReply, type Face, type OrderTag } from './prompt';
import { DEEPSEEK_MODEL, checkPlayerKey, describeStatus, getPlayerKey } from './KeyStore';
import { LlmHttpError, chatCompletion, errorReason } from './LlmClient';
import { getLang } from '../i18n';

const ENDPOINT = '/api/coop';

/**
 * The partner's LLM commander: every few seconds (2.4 s in a fight, 8 s otherwise) it sends her
 * memory (Journal) + a compact observation to a model, gets
 * back tool calls (the CoopCommand set) + an optional chat line, and applies them as orders
 * that last a few seconds. Steering, aiming and dodging always stay in-game.
 *
 * Two routes, picked by probe():
 *   via 'key'    — the player's own DeepSeek key (KeyStore): the browser calls
 *                  https://api.deepseek.com/chat/completions directly. The key only ever travels
 *                  in that request's Authorization header.
 *   via 'server' — no player key: the dev-server proxy `/api/coop` (server/coopApi.ts), if it
 *                  has a key of its own.
 * Neither / an error / a timeout → `live` goes false and the rule brain takes over.
 */
export class LlmBrain {
  status: 'off' | 'probing' | 'ready' | 'unavailable' | 'error' = 'off';
  via: 'key' | 'server' | '' = '';
  model = '';
  lastError = '';
  /** the player's key was refused / unreachable (shown in the pause panel); '' = fine or no key */
  keyError = '';
  lastMs = 0;
  turns = 0;
  okTurns = 0;
  /** last request/response (debugging, docs) — never contains the key */
  lastExchange: { observation: unknown; reply: CoopReply } | null = null;
  /** a chat took over the connection: the aborted planning call is not an error */
  private preempted = false;
  private t = 1;
  private pending = false;
  private retryAt = 0;
  private ctrl: AbortController | null = null;
  private disposed = false;
  private probeSeq = 0;
  /** the key is bad (401/402): don't use it again until the player changes it */
  private keyDead = false;

  constructor(private p: CoopPartner) {}

  /** The LLM is the one giving orders right now. */
  get live(): boolean {
    return this.status === 'ready';
  }

  /** the dev server's own key/model has a problem (shown in the panel); '' = fine or not configured */
  serverError = '';
  /** the provider's model list does not contain the configured model id (it may still work) */
  modelUnlisted = false;
  private serverModel = '';

  /** Is the dev server's own model usable? (GET /api/coop?check=1 → it asks the provider's /models with ITS key) */
  private async probeServer(): Promise<boolean> {
    this.serverError = '';
    this.modelUnlisted = false;
    const r = await fetch(`${ENDPOINT}?check=1`, { method: 'GET', cache: 'no-store' });
    const j = (await r.json()) as { configured?: boolean; model?: string; check?: { ok?: boolean; status?: number; modelListed?: boolean | null; error?: string } };
    this.serverModel = j.model ?? '';
    if (!r.ok || !j.configured) return false;
    this.model = this.serverModel;
    const c = j.check;
    if (c && !c.ok) {
      // a refused key is final; a network hiccup is not (the first real call will tell)
      if (c.status === 401 || c.status === 402 || c.status === 403) {
        this.serverError = describeStatus(c.status);
        return false;
      }
    } else if (c?.modelListed === false) this.modelUnlisted = true;
    return true;
  }

  private probing: Promise<void> | null = null;
  /** Resolves when the current probe (if any) has finished. */
  whenProbed(): Promise<void> {
    return this.probing ?? Promise.resolve();
  }

  probe(): Promise<void> {
    const p = (this.probing = this.doProbe().finally(() => {
      if (this.probing === p) this.probing = null;
    }));
    return p;
  }

  /** (Re)choose the route. Called at spawn, when the brain is switched to Auto and when the key changes. */
  private async doProbe(): Promise<void> {
    const seq = ++this.probeSeq;
    this.status = 'probing';
    this.keyError = '';
    this.keyDead = false;
    const key = getPlayerKey();
    if (key) {
      const c = await checkPlayerKey(key);
      if (this.disposed || seq !== this.probeSeq) return;
      if (c.ok) {
        this.via = 'key';
        this.model = DEEPSEEK_MODEL;
        this.status = 'ready';
        this.p.event(`LLM brain online (${this.model}, player key)`, false);
        return;
      }
      this.keyError = c.error;
      this.keyDead = c.fatal;
      this.p.event(`player key not usable (${c.error})`, false);
    }
    // no (working) player key → the dev server's own model, if it has one
    try {
      const ok = await this.probeServer();
      if (this.disposed || seq !== this.probeSeq) return;
      this.via = ok ? 'server' : '';
      this.status = this.via ? 'ready' : 'unavailable';
      if (this.status === 'ready') this.p.event(`LLM brain online (${this.model})`, false);
    } catch {
      if (!this.disposed && seq === this.probeSeq) {
        this.via = '';
        this.status = 'unavailable';
      }
    }
  }

  /** Seconds between DECIDE calls: brisk in a fight, lazy otherwise (she is lazy; tokens are rice). */
  private planGap(): number {
    const p = this.p;
    const wai = p.s.player;
    const fight = p.s.enemies.some((e) => !e.disposed && e.engaged && p.fightable(e) && e.pos.distanceTo(wai.pos) < 22);
    return fight ? 2.4 : 8;
  }

  /** A chat / remark call is in flight (planning waits; one request at a time keeps the cache prefix linear). */
  talking = false;
  private lastRemarkAt = 0;
  private remarkEvents = 0;
  private lastDecision = '';
  remarks = 0;
  skips = 0;

  /** Something changed that the model should hear about soon (a standing order): plan within `s` seconds. */
  nudge(s: number): void {
    this.t = Math.min(this.t, s);
  }

  /** The player's key can be used for chat right now. */
  get canChat(): boolean {
    if (this.via === 'server') return this.status === 'ready' || this.status === 'error';
    return this.via === 'key' && !this.keyDead && (this.status === 'ready' || this.status === 'error') && !!getPlayerKey();
  }

  update(dt: number): void {
    if (this.status === 'error' && this.p.time > this.retryAt) {
      // a key that failed for a temporary reason gets another check; otherwise just resume
      if (this.keyError && !this.keyDead && getPlayerKey()) void this.probe();
      else this.status = 'ready';
    }
    if (this.status !== 'ready' || this.pending || this.talking) return;
    this.t -= dt;
    if (this.t > 0) return;
    const p = this.p;
    const s = p.s;
    if (s.story.locked || s.ctx.camera.inCine || s.completed) {
      this.t = 1;
      return;
    }
    // now and then, instead of deciding: a remark of her own about what just happened
    const j = p.journal;
    if (this.via && p.time - this.lastRemarkAt > 32 && j.totalEvents - this.remarkEvents >= 2 && !p.bubble.busy && !p.mood.asleep) {
      this.t = 2.5;
      void this.remark();
      return;
    }
    this.t = this.planGap();
    void this.tick();
  }

  /** The state the model sees at the very end of the prompt (small: the history is in the journal). */
  private state(): Record<string, unknown> {
    const o = this.p.observe() as Record<string, unknown>;
    delete o.events;
    delete o.pipSaid;
    return o;
  }

  /** A failed call: remember why (never the key), decide whether the key is dead. */
  private failed(e: unknown): string {
    const why = errorReason(e);
    this.lastError = why;
    const refused = e instanceof LlmHttpError && (e.status === 401 || e.status === 402 || e.status === 403);
    if (this.via === 'key') {
      if (refused) this.keyDead = true;
      this.keyError = why;
    } else if (this.via === 'server' && refused) {
      // the server's key is bad: stop calling it (rules only) until the next probe
      this.serverError = why;
      this.via = '';
      this.status = 'unavailable';
    }
    return why;
  }

  /** One DECIDE turn over the chosen route. */
  private async ask(signal: AbortSignal): Promise<CoopReply> {
    const p = this.p;
    const state = this.state();
    this.lastExchange = { observation: state, reply: { ok: false } };
    const r = await chatCompletion('plan', { route: this.via as 'key' | 'server', ask: 'DECIDE', lang: getLang(), messages: p.journal.messages(promptTail('DECIDE', state)) }, { signal });
    return { ok: true, ...parseCompletion({ choices: [{ message: r.message }] }), model: this.model, ms: r.totalMs };
  }

  private async tick(): Promise<void> {
    this.pending = true;
    this.turns++;
    const p = this.p;
    const ctrl = (this.ctrl = new AbortController());
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const t0 = performance.now();
    try {
      const reply = await this.ask(ctrl.signal);
      if (this.disposed) return;
      this.lastMs = Math.round(performance.now() - t0);
      if (this.lastExchange) this.lastExchange.reply = reply;
      this.okTurns++;
      if (this.via === 'key') this.keyError = '';
      const done: string[] = [];
      for (const c of (reply.calls ?? []).slice(0, 3)) {
        const cmd = { type: c.name, ...(c.args ?? {}) } as CoopCommand;
        const res = p.act(cmd, 'llm');
        done.push(`${c.name}${c.args?.target ? ' ' + String(c.args.target) : ''} → ${res}`);
      }
      // what she decided becomes part of her memory (only when it changes)
      const decision = done.join('; ');
      if (decision && decision !== this.lastDecision) p.journal.note(`I decided: ${decision}`);
      this.lastDecision = decision;
      if (reply.say) {
        const line = trimReply(reply.say).text;
        if (line) {
          p.say(line, true, reply.face);
          p.journal.note(`I said: "${line}"`);
          this.lastRemarkAt = p.time;
          this.remarkEvents = p.journal.totalEvents;
        }
      }
    } catch (e) {
      if (this.disposed) return;
      if (this.preempted) {
        this.preempted = false;
        return;
      }
      const why = this.failed(e);
      p.event(`LLM brain offline (${why}); rules take over`, false);
      if (this.via === 'key' && this.keyDead) {
        // a refused key will not get better: look for the dev server's model, else rules
        void this.probeFallback();
      } else if (!this.via) {
        /* the server's key was refused: rules only (failed() switched the route off) */
      } else {
        // back off; the rule brain carries on meanwhile
        this.status = 'error';
        this.retryAt = p.time + 12;
      }
    } finally {
      clearTimeout(timer);
      this.pending = false;
    }
  }

  /**
   * A streamed spoken line (CHAT answer or REMARK): the bubble types as tokens arrive.
   * Resolves with the final line ('' = she chose to stay quiet / nothing usable); throws on failure
   * before any text arrived. Gives up after `firstTokenMs` without a first token.
   */
  private async speak(kind: 'CHAT' | 'REMARK', question: string, firstTokenMs = 8000): Promise<{ text: string; face?: Face; order?: OrderTag }> {
    const p = this.p;
    const req = { route: this.via as 'key' | 'server', ask: kind, lang: getLang(), messages: p.journal.messages(promptTail(kind, this.state(), question)) };
    const ctrl = (this.ctrl = new AbortController());
    let got = false, stopped = false;
    let text = '';
    let face: Face | undefined;
    let order: OrderTag | undefined;
    const first = setTimeout(() => {
      if (!got) ctrl.abort();
    }, firstTokenMs);
    const hard = setTimeout(() => ctrl.abort(), firstTokenMs + 7000);
    try {
      await chatCompletion(kind === 'CHAT' ? 'chat' : 'remark', req, {
        signal: ctrl.signal,
        onDelta: (raw) => {
          if (stopped || this.disposed) return;
          if (/^\s*\[skip/i.test(raw)) return;
          const f = splitFace(raw);
          if (f.pending) return;
          // the order tag comes before the line: carry it out as soon as it is readable (CHAT only)
          if (f.order && !order && kind === 'CHAT') {
            order = f.order;
            this.onOrder?.(order);
          }
          const tr = trimReply(f.text);
          if (!tr.text) return;
          got = true;
          text = tr.text;
          face = f.face ?? face;
          p.bubble.stream(p.name, text, face ?? 'portrait', true);
          // long enough: ignore the rest (max_tokens bounds it; the stream is left to finish so its usage block arrives)
          if (tr.cut) stopped = true;
        },
      });
    } catch (e) {
      // our own "that's enough" abort, or a late cut-off with text already on screen, is not a failure
      if (!got) throw e;
    } finally {
      clearTimeout(first);
      clearTimeout(hard);
    }
    if (this.via === 'key') this.keyError = '';
    return { text, face, order };
  }

  /** A chat answer carried an order tag ([do:…]): the partner applies it at once. */
  onOrder: ((o: OrderTag) => void) | null = null;

  /** WAI typed something. Returns null when the LLM could not answer (the caller falls back to a canned line). */
  async chat(question: string): Promise<{ text: string; face?: Face; order?: OrderTag } | null> {
    if (!this.canChat) return null;
    if (this.pending) {
      // a planning call in flight gives way
      this.preempted = true;
      this.ctrl?.abort();
    }
    this.talking = true;
    try {
      const r = await this.speak('CHAT', question);
      if (this.disposed || !r.text) return null;
      this.lastRemarkAt = this.p.time;
      this.remarkEvents = this.p.journal.totalEvents;
      if (this.status === 'error') this.status = 'ready';
      return r;
    } catch (e) {
      if (this.disposed) return null;
      const why = this.failed(e);
      this.p.event(`chat failed (${why})`, false);
      if (this.keyDead) void this.probeFallback();
      return null;
    } finally {
      this.talking = false;
    }
  }

  /** Something of her own to say about the latest journal entries (or [skip]). */
  private async remark(): Promise<void> {
    const p = this.p;
    this.talking = true;
    this.lastRemarkAt = p.time;
    this.remarkEvents = p.journal.totalEvents;
    try {
      const r = await this.speak('REMARK', '', 6000);
      if (this.disposed) return;
      if (r.text) {
        this.remarks++;
        p.bubble.finish();
        p.journal.addRemark(`[${r.face ?? 'portrait'}] ${r.text}`);
      } else this.skips++;
    } catch (e) {
      if (this.disposed) return;
      const why = this.failed(e);
      p.event(`remark failed (${why})`, false);
      if (this.keyDead) void this.probeFallback();
      else {
        this.status = 'error';
        this.retryAt = p.time + 12;
      }
    } finally {
      this.talking = false;
    }
  }

  /**
   * A live roast (Roast.ts): a REMARK about something WAI just did, with a director's note. The note and the moment
   * only ever go into the volatile tail, so the cached prefix stays as it is. Resolves with the line, or null
   * (no model / busy / failed → the caller uses a canned line).
   */
  async roast(about: string, note: string): Promise<string | null> {
    if (!this.via || this.talking || (this.status !== 'ready' && this.status !== 'error')) return null;
    const p = this.p;
    if (this.pending) {
      this.preempted = true;
      this.ctrl?.abort();
    }
    this.talking = true;
    try {
      const r = await this.speak('REMARK', `${about}. Director's note: ${note}. A fresh line, not one you said before.`, 6000);
      if (this.disposed || !r.text) return null;
      this.remarks++;
      this.lastRemarkAt = p.time;
      this.remarkEvents = p.journal.totalEvents;
      p.bubble.finish();
      p.journal.addRemark(`[${r.face ?? 'portrait'}] ${r.text}`);
      return r.text;
    } catch (e) {
      if (!this.disposed) p.event(`roast failed (${this.failed(e)})`, false);
      return null;
    } finally {
      this.talking = false;
    }
  }

  /** The key died mid-session: keep its error for the panel, try the server route. */
  private async probeFallback(): Promise<void> {
    const err = this.keyError;
    const seq = ++this.probeSeq;
    this.status = 'probing';
    try {
      const ok = await this.probeServer();
      if (this.disposed || seq !== this.probeSeq) return;
      this.via = ok ? 'server' : '';
      this.status = this.via ? 'ready' : 'unavailable';
    } catch {
      if (!this.disposed && seq === this.probeSeq) {
        this.via = '';
        this.status = 'unavailable';
      }
    }
    this.keyError = err;
  }

  dispose(): void {
    this.disposed = true;
    this.ctrl?.abort();
  }
}
