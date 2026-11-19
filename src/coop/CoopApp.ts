/**
 * [INPUT]: 会话、玩家的搭档选项，以及当前构建模式。
 * [OUTPUT]: 搭档、暂停菜单及角落画面。TapTap 包仅使用内置搭档。
 * [POS]: 搭档生命周期与界面入口；规则和远程调用由各自模块执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { PlaySession as GameSession } from '../level/Session';
import { onLangChange, t } from '../i18n';
import { CoopPartner, COOP_SCHEMA, type CoopBrainPref, type CoopCommand } from './Coop';
import { DEEPSEEK_MODEL, setPlayerModel, apiBase, checkPlayerKey, clearPlayerKey, hasPlayerKey, plausibleKey, setDevBase, setPlayerKey, usingMock, type KeyCheck } from './KeyStore';
import { Journal } from './Journal';
import { ChatBar } from './Chat';
import { cachePct, kTokens, lastCallLabel, llmStats, onLlmCall, resetLlmStats } from './LlmClient';
import { faceUrl } from './SpeechBubble';
import { PipView } from './PipView';

const KEY_ON = 'wd.coop';
const KEY_BRAIN = 'wd.coop.brain';
const BUILT_IN_ONLY = import.meta.env.MODE === 'taptap';

function load(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function save(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

/**
 * App-level glue for the AI partner: the on/off choice (remembered in localStorage,
 * default off), the "AI Partner" row in the pause menu, and window.WD_COOP for external AIs.
 * main.ts only calls attach(session) whenever a new GameSession is built.
 */
export class CoopApp {
  enabled = load(KEY_ON) === '1';
  brain: CoopBrainPref = BUILT_IN_ONLY || load(KEY_BRAIN) === 'rules' ? 'rules' : 'auto';
  private session: GameSession | null = null;
  private row: HTMLDivElement | null = null;
  /** her memory of the current run: survives level changes, reset when a level is (re)started from scratch */
  readonly journal = new Journal();
  private lastLevel = '';
  private chatBar: ChatBar | null = null;
  private toastWatch: MutationObserver | null = null;
  /** the "↑1.2k ↓38 · cache 91%" chip next to her bubble after each call (key panel toggle) */
  showChip = load('wd.coop.chip') !== '0';
  private chipHooked = false;
  /** the bring-your-own-key panel under the row */
  private keyBox: HTMLDivElement | null = null;
  private keyOpen = this.enabled;
  private checking = false;
  /** result of the last "Save" check (shown while no partner is around to use the key) */
  private lastCheck: KeyCheck | null = null;
  /** a message about the input itself (empty / malformed / storage refused) */
  private inputError = '';

  get partner(): CoopPartner | null {
    return (this.session?.coop as CoopPartner | null | undefined) ?? null;
  }

  attach(s: GameSession | null): void {
    // a new run = the same level built again (restart / new game); another level = the run goes on
    if (s) {
      const lv = String(s.levelId);
      if (this.lastLevel === '' || lv === this.lastLevel) this.journal.reset();
      this.lastLevel = lv;
    }
    this.session = s;
    this.mountMenu();
    this.mountChat();
    if (s && this.enabled && !s.coop) this.spawn(s);
    this.refresh();
  }

  private spawn(s: GameSession): void {
    const p = (s.coop = new CoopPartner(s, this.brain, this.journal));
    // the probe (key check / server) finishes a moment later: show its result in the menu
    if (this.brain === 'auto') void p.llm.whenProbed().then(() => this.refresh());
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    save(KEY_ON, on ? '1' : '0');
    const s = this.session;
    if (s) {
      if (on && !s.coop) this.spawn(s);
      if (!on && s.coop) {
        s.coop.dispose();
        s.coop = null;
      }
    }
    this.refresh();
  }

  setBrain(b: CoopBrainPref): void {
    if (BUILT_IN_ONLY) return;
    this.brain = b;
    save(KEY_BRAIN, b);
    const p = this.partner;
    if (p) {
      p.brainPref = b;
      if (b === 'auto' && (p.llm.status === 'off' || p.llm.status === 'unavailable' || (hasPlayerKey() && p.llm.via !== 'key'))) void p.llm.probe().then(() => this.refresh());
    }
    this.refresh();
  }

  private ui: { inkHit(angle: number, heavy: boolean): void } | null = null;
  /**
   * Called once per rendered frame from main.ts (the `// PIP-HOOK` line), after the main render: the corner view
   * of her, and the HUD hand-off for her goofs (blue ink blots when she sprays the camera).
   */
  frame(renderer: import('../render/Renderer').Renderer, ui: { inkHit(angle: number, heavy: boolean): void }, dt: number): void {
    this.ui = ui;
    const p = this.partner;
    if (p && !p.goofs.inkHit) p.goofs.inkHit = (angle, heavy) => this.blueInk(angle, heavy);
    this.pip ??= new PipView();
    this.pip.update(p, renderer, dt, this.pipOn);
  }

  /** the corner view of her (PipView) and its on/off switch (pause menu, remembered) */
  pip: PipView | null = null;
  pipOn = load('wd.coop.pip') !== '0';

  /** The HUD's ink blots (UI.inkHit, unchanged), recoloured to her paint blue. */
  private blueInk(angle: number, heavy: boolean): void {
    if (!this.ui) return;
    const before = new Set(document.querySelectorAll('.ink-blot'));
    this.ui.inkHit(angle, heavy);
    const fresh = [...document.querySelectorAll<HTMLElement>('.ink-blot')].filter((el) => !before.has(el));
    for (const el of fresh) el.classList.add('coop-blot');
    this.flood(fresh[0]);
  }

  private floodAt = 0;
  /**
   * A face full of paint: her spray covers the whole screen, with about a tenth of it left clear at random
   * (FLOOD_CLEAR cells of the grid). Blots are copies of a HUD blot, so they share its look and its parent.
   */
  private flood(model: HTMLElement | undefined): void {
    const now = performance.now();
    if (!model?.parentElement || now - this.floodAt < 1000) return;
    this.floodAt = now;
    const COLS = 6, ROWS = 4, FLOOD_CLEAR = 4;
    const clear = new Set<number>();
    while (clear.size < FLOOD_CLEAR) clear.add(Math.floor(Math.random() * COLS * ROWS));
    for (let i = 0; i < COLS * ROWS; i++) {
      if (clear.has(i)) continue;
      const el = model.cloneNode(true) as HTMLElement;
      el.classList.add('coop-flood');
      el.style.left = `${((i % COLS) + 0.5 + (Math.random() - 0.5) * 0.3) * (100 / COLS)}%`;
      el.style.top = `${(Math.floor(i / COLS) + 0.5 + (Math.random() - 0.5) * 0.3) * (100 / ROWS)}%`;
      el.style.width = el.style.height = '27vw';
      el.style.setProperty('--rot', `${Math.random() * 360}deg`);
      el.style.animationDelay = `${Math.random() * 0.18}s`;
      model.parentElement.appendChild(el);
      setTimeout(() => el.remove(), 3600);
    }
  }

  /** The chat bar (Enter) + a watcher for boon picks (they only show up as a toast). */
  private mountChat(): void {
    if (!this.chatBar) this.chatBar = new ChatBar(() => this.partner);
    if (!this.chipHooked) {
      this.chipHooked = true;
      onLlmCall(() => {
        if (this.showChip) this.partner?.bubble.chip(lastCallLabel((pct) => t('cache {pct}%', { pct }), (n) => t('thinking {n}', { n: kTokens(n) })));
      });
    }
    if (this.toastWatch) return;
    const toasts = document.querySelector('#ui-root .toasts');
    if (!toasts) return;
    this.toastWatch = new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes) {
          const hit = /^(?:Boon: |增益：)(.+)$/.exec((n as HTMLElement).textContent ?? '');
          if (hit && this.partner) this.partner.event(`WAI picked a boon: ${hit[1]}`, true, { key: true });
        }
    });
    this.toastWatch.observe(toasts, { childList: true });
  }

  /** "cache 82% · 0.3 s / 0.9 s": prompt-cache hit rate and the last call's first-token / total time. */
  private perfLabel(): string {
    if (!llmStats.calls) return '';
    const c = cachePct();
    const sec = (ms: number) => (ms / 1000).toFixed(ms < 9950 ? 1 : 0);
    const parts: string[] = [];
    if (c.total !== null) parts.push(t('cache {pct}%', { pct: c.total }));
    // the last spoken (streamed) line when there is one, else the last planning call
    const talk = llmStats.byKind.chat ?? llmStats.byKind.remark;
    parts.push(talk ? t('first word {a} s / done {b} s', { a: sec(talk.ttftMs), b: sec(talk.totalMs) }) : t('{b} s', { b: sec(llmStats.lastTotalMs) }));
    // tokens: last call and the session's total (↑ prompt, ↓ completion)
    if (llmStats.usageReports) parts.push(t('last ↑{a} ↓{b} · total ↑{c} ↓{d}', { a: kTokens(llmStats.lastPromptTokens), b: kTokens(llmStats.lastCompletionTokens), c: kTokens(llmStats.promptTokens), d: kTokens(llmStats.completionTokens) }));
    if (llmStats.reasoningTokens) parts.push(t('thinking {n}', { n: kTokens(llmStats.reasoningTokens) }));
    return ` · ${parts.join(' · ')}`;
  }

  /** A human-readable brain status for the menu. */
  private brainLabel(): string {
    const p = this.partner;
    if (this.brain === 'rules') return t('Built-in');
    if (!p) return t('Auto');
    const l = p.llm;
    if (l.status === 'ready') return `${t('LLM')} · ${l.model}`;
    if (l.status === 'error') return `${t('Built-in')} (${t('LLM offline')})`;
    if (l.status === 'probing') return '…';
    return `${t('Built-in')} (${t('no LLM key')})`;
  }

  /** The status line of the key panel: connected / no key → built-in brain / error. */
  private keyStatus(): { cls: 'ok' | 'none' | 'err' | 'busy'; text: string } {
    if (this.inputError) return { cls: 'err', text: t(this.inputError) };
    const p = this.partner;
    const l = p?.llm;
    const viaServer = !!l && this.brain === 'auto' && l.via === 'server' && (l.status === 'ready' || l.status === 'error');
    const fallback = viaServer ? t("the dev server's model") : t('built-in brain');
    // no browser key, but the dev server has one: she is fully connected through /api/coop
    const serverLine = viaServer ? t('Connected · {model} (dev server key)', { model: l!.model }) + (l!.modelUnlisted ? ` · ${t('model id not in the provider list')}` : '') + this.perfLabel() : '';
    if (!hasPlayerKey()) {
      if (viaServer) return { cls: 'ok', text: serverLine };
      if (l?.serverError && this.brain === 'auto') return { cls: 'err', text: t('Dev server key error: {err} → {what}', { err: t(l.serverError), what: t('built-in brain') }) };
      return { cls: 'none', text: t('No key → {what}', { what: fallback }) };
    }
    if (this.checking || (l && this.brain === 'auto' && l.status === 'probing')) return { cls: 'busy', text: t('Checking the key…') };
    const err = l && this.brain === 'auto' ? l.keyError : this.lastCheck && !this.lastCheck.ok ? this.lastCheck.error : '';
    if (err) return { cls: 'err', text: t('Key error: {err} → {what}', { err: t(err), what: fallback }) };
    if (l && this.brain === 'auto' && l.via === 'key' && (l.status === 'ready' || l.status === 'error')) return { cls: 'ok', text: t('Connected · {model} (your key)', { model: usingMock() ? `${DEEPSEEK_MODEL} @ ${new URL(apiBase()).host} (test mock)` : DEEPSEEK_MODEL }) + this.perfLabel() };
    if (p && this.brain === 'rules') return { cls: 'none', text: t('Key saved — switch the brain to Auto to use it') };
    if (!p) return { cls: this.lastCheck?.ok ? 'ok' : 'none', text: this.lastCheck?.ok ? t('Key works — turn the partner ON to use it') : t('Key saved — turn the partner ON to use it') };
    return { cls: 'none', text: t('Key saved') };
  }

  private async saveKey(): Promise<void> {
    const input = this.keyBox?.querySelector('.coop-key-in') as HTMLInputElement | null;
    if (!input) return;
    const key = input.value.trim();
    this.inputError = '';
    this.lastCheck = null;
    if (!key) this.inputError = 'Paste a key first';
    else if (!plausibleKey(key)) this.inputError = "That doesn't look like an API key";
    else if (!setPlayerKey(key)) this.inputError = 'This browser refused to store the key';
    // the field never keeps (or shows) the key once it is handled
    input.value = '';
    if (this.inputError) return this.refresh();
    this.checking = true;
    this.refresh();
    const p = this.partner;
    if (p && this.brain === 'auto') {
      // the partner's own probe checks the key (one request, not two)
      await p.llm.probe();
      this.lastCheck = p.llm.keyError ? { ok: false, error: p.llm.keyError, fatal: true } : { ok: true };
    } else this.lastCheck = await checkPlayerKey(key);
    this.checking = false;
    this.refresh();
  }

  private clearKey(): void {
    clearPlayerKey();
    this.inputError = '';
    this.lastCheck = null;
    const input = this.keyBox?.querySelector('.coop-key-in') as HTMLInputElement | null;
    if (input) input.value = '';
    const p = this.partner;
    this.refresh();
    if (p && this.brain === 'auto') void p.llm.probe().then(() => this.refresh());
  }

  /** Our row in the pause panel + the key panel under it (built here; UI.ts stays untouched). */
  private mountMenu(): void {
    if (this.row) return;
    const panel = document.querySelector('#ui-root .pause .panel:not(.book-panel)');
    const before = panel?.querySelector('.resume');
    if (!panel || !before) return;
    const row = document.createElement('div');
    row.className = 'lang-row coop-row';
    row.innerHTML = '<span class="coop-l"></span> <button class="lang-btn coop-on"></button> <button class="lang-btn coop-brain"></button> <button class="lang-btn coop-key-toggle"></button> <button class="lang-btn coop-pip-toggle"></button>';
    row.querySelector('.coop-on')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setEnabled(!this.enabled);
      if (this.enabled) this.keyOpen = true;
      this.refresh();
    });
    row.querySelector('.coop-brain')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setBrain(this.brain === 'auto' ? 'rules' : 'auto');
    });
    row.querySelector('.coop-pip-toggle')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pipOn = !this.pipOn;
      save('wd.coop.pip', this.pipOn ? '1' : '0');
      this.refresh();
    });
    row.querySelector('.coop-key-toggle')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.keyOpen = !this.keyOpen;
      this.refresh();
    });
    panel.insertBefore(row, before);
    this.row = row;
    onLangChange(() => this.refresh());
    if (BUILT_IN_ONLY) {
      row.querySelector<HTMLButtonElement>('.coop-brain')!.disabled = true;
      row.querySelector<HTMLButtonElement>('.coop-key-toggle')!.hidden = true;
      return;
    }

    const box = document.createElement('div');
    box.className = 'coop-key';
    box.innerHTML = `<img class="coop-key-face" alt="" draggable="false" src="${faceUrl('portrait')}">
      <div class="coop-key-main">
        <div class="coop-key-title"></div>
        <div class="coop-key-line"><input class="coop-key-in" type="password" name="wd-coop-deepseek-key" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="200">
          <button class="lang-btn coop-key-save"></button><button class="lang-btn coop-key-clear"></button></div>
        <label class="coop-chip-line"><input type="checkbox" class="coop-chip-on"><span class="coop-chip-label"></span></label>
        <div class="coop-key-line coop-model-line"><span class="coop-model-label"></span><input class="coop-model-in" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="80"></div>
        <div class="coop-key-status" role="status"></div>
        <div class="coop-key-note"></div>
      </div>`;
    (box.querySelector('.coop-key-face') as HTMLImageElement).addEventListener('error', (e) => ((e.target as HTMLElement).style.display = 'none'));
    const input = box.querySelector('.coop-key-in') as HTMLInputElement;
    const chipOn = box.querySelector('.coop-chip-on') as HTMLInputElement;
    chipOn.checked = this.showChip;
    chipOn.addEventListener('change', () => {
      this.showChip = chipOn.checked;
      save('wd.coop.chip', this.showChip ? '1' : '0');
    });
    chipOn.addEventListener('click', (e) => e.stopPropagation());
    // model id (default deepseek-flash): applies from the next call
    const modelIn = box.querySelector('.coop-model-in') as HTMLInputElement;
    modelIn.value = DEEPSEEK_MODEL;
    for (const ev of ['keydown', 'keyup', 'keypress'] as const) modelIn.addEventListener(ev, (e) => e.stopPropagation());
    modelIn.addEventListener('change', () => {
      setPlayerModel(modelIn.value);
      modelIn.value = DEEPSEEK_MODEL;
      const pl = this.partner?.llm;
      if (pl && pl.via === 'key') pl.model = DEEPSEEK_MODEL;
      this.refresh();
    });
    // typing a key must not drive the game (WASD, E, digits…); Enter saves, Esc still closes the menu
    for (const ev of ['keydown', 'keyup', 'keypress'] as const)
      input.addEventListener(ev, (e) => {
        if (e.code === 'Escape') return;
        e.stopPropagation();
        if (ev === 'keydown' && e.code === 'Enter') void this.saveKey();
      });
    input.addEventListener('input', () => {
      if (this.inputError) {
        this.inputError = '';
        this.refresh();
      }
    });
    box.querySelector('.coop-key-save')!.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.saveKey();
    });
    box.querySelector('.coop-key-clear')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearKey();
    });
    panel.insertBefore(box, before);
    this.keyBox = box;

    // the pause screen opens → status may have changed (LLM probed, errors)
    new MutationObserver(() => this.refresh()).observe(panel.parentElement!, { attributes: true, attributeFilter: ['class'] });
  }

  refresh(): void {
    const r = this.row;
    if (!r) return;
    r.querySelector('.coop-l')!.textContent = t('AI Partner');
    r.querySelector('.coop-on')!.textContent = this.enabled ? t('ON') : t('OFF');
    const b = r.querySelector('.coop-brain') as HTMLButtonElement;
    b.textContent = this.enabled ? this.brainLabel() : '';
    b.style.display = this.enabled ? '' : 'none';
    if (!BUILT_IN_ONLY) b.title = t('Brain: Auto uses your DeepSeek key (or the dev server’s model), else the built-in rules');
    const kt = r.querySelector('.coop-key-toggle') as HTMLButtonElement;
    kt.textContent = `${t('Key')} ${this.keyOpen ? '▴' : '▾'}`;
    kt.classList.toggle('has-key', hasPlayerKey());
    const pt = r.querySelector('.coop-pip-toggle') as HTMLButtonElement;
    pt.textContent = `${t('Corner view')} ${this.pipOn ? t('ON') : t('OFF')}`;
    pt.title = t('A small live view of her in a screen corner when she is out of sight');
    pt.style.display = this.enabled ? '' : 'none';
    const k = this.keyBox;
    if (!k) return;
    k.classList.toggle('hidden', !this.keyOpen);
    k.querySelector('.coop-key-title')!.textContent = t('Your own DeepSeek API key (optional)');
    (k.querySelector('.coop-model-label') as HTMLElement).textContent = t('Model');
    (k.querySelector('.coop-chip-label') as HTMLElement).textContent = t('Show token use next to her bubble');
    (k.querySelector('.coop-key-in') as HTMLInputElement).placeholder = hasPlayerKey() ? t('•••••• (saved)') : 'sk-…';
    k.querySelector('.coop-key-save')!.textContent = t('Save');
    const clear = k.querySelector('.coop-key-clear') as HTMLButtonElement;
    clear.textContent = t('Clear');
    clear.disabled = !hasPlayerKey();
    const st = this.keyStatus();
    const sEl = k.querySelector('.coop-key-status') as HTMLElement;
    sEl.textContent = st.text;
    sEl.dataset.state = st.cls;
    k.querySelector('.coop-key-note')!.textContent = t('Stored only in this browser (localStorage); sent only to api.deepseek.com.');
  }

  /** window.WD_COOP — the companion's observe()/act(), mirroring window.WD_AGENT. */
  api(): Record<string, unknown> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return {
      observe: () => this.partner?.observe() ?? { state: this.enabled ? 'NO_SESSION' : 'COOP_OFF' },
      act: (cmd: CoopCommand) => this.partner?.act(cmd, 'api') ?? 'co-op is off (WD_COOP.enable(true))',
      schema: COOP_SCHEMA,
      /** Say something to her (what the Enter chat bar does). Resolves with { text, face, llm, ms }. */
      chat: (text: string) => this.chatBar?.send(String(text)) ?? Promise.resolve(null),
      /** Her memory: journal events, the prompt log (append-only), chat turns. */
      memory: () => ({ ...this.journal.info(), summary: this.journal.summary, events: this.journal.events.slice(), log: this.journal.log.map((m) => ({ ...m })), chat: this.journal.chat.slice() }),
      resetMemory: () => {
        this.journal.reset();
        resetLlmStats();
      },
      /** Tests only (dev build, loopback URL): send the direct calls to a local mock instead of api.deepseek.com. */
      debugSetBase: (url: string | null) => {
        const ok = setDevBase(url);
        const p = this.partner;
        if (ok && p && this.brain === 'auto') void p.llm.probe().then(() => this.refresh());
        return ok;
      },
      enable: (on = true) => {
        this.setEnabled(on);
        return this.enabled;
      },
      setBrain: (b: CoopBrainPref) => {
        this.setBrain(b);
        return this.brain;
      },
      get enabled() {
        return self.enabled;
      },
      get partner() {
        return self.partner;
      },
      status: () => {
        const p = this.partner;
        if (!p) return { enabled: this.enabled };
        const l = p.llm;
        return {
          enabled: this.enabled,
          brain: this.brain,
          usingLlm: p.usingLlm,
          llm: {
            status: l.status,
            via: l.via,
            model: l.model,
            base: new URL(apiBase()).host,
            turns: l.turns,
            okTurns: l.okTurns,
            remarks: l.remarks,
            skips: l.skips,
            lastMs: l.lastMs,
            lastError: l.lastError,
            playerKey: hasPlayerKey(),
            keyError: l.keyError,
            // latency of direct calls: time to first token / total, last call and per kind
            serverError: l.serverError,
            modelUnlisted: l.modelUnlisted,
            calls: llmStats.calls,
            errors: llmStats.errors,
            lastKind: llmStats.lastKind,
            ttftMs: llmStats.lastTtftMs,
            totalMs: llmStats.lastTotalMs,
            byKind: llmStats.byKind,
            // tokens: last call / session total (prompt = ↑, completion = ↓)
            tokens: { lastPrompt: llmStats.lastPromptTokens, lastCompletion: llmStats.lastCompletionTokens, totalPrompt: llmStats.promptTokens, totalCompletion: llmStats.completionTokens, lastReasoning: llmStats.lastReasoningTokens, totalReasoning: llmStats.reasoningTokens, emptyReplies: llmStats.emptyReplies, reports: llmStats.usageReports, chip: this.showChip },
            lastErrorDetail: llmStats.lastErrorDetail,
            // DeepSeek prompt cache (usage.prompt_cache_hit_tokens / prompt_cache_miss_tokens)
            cache: { hitTokens: llmStats.cacheHitTokens, missTokens: llmStats.cacheMissTokens, pct: cachePct().total, lastHit: llmStats.lastHitTokens, lastMiss: llmStats.lastMissTokens, lastPct: cachePct().last, reports: llmStats.cacheReports },
          },
          standing: p.standing.mode,
          pipView: this.pip ? { on: this.pipOn, visible: this.pip.visible, reason: this.pip.reason, frames: this.pip.frames, ms: +this.pip.ms.toFixed(2) } : null,
          goofs: { active: p.goofs.active, count: p.goofs.count, log: p.goofs.log.slice(-6) },
          roasts: p.roast.log.slice(-6),
          moves: { used: p.moves.used, hits: p.moves.hits },
          nav: { ...p.pip.navStats, grid: p.pip.nav.info(), redraws: p.redraws },
          memory: this.journal.info(),
          ...p.mood.snapshot(),
          pip: { hp: p.pip.hp, down: p.pip.down, teleports: p.pip.teleports, teleportLog: p.pip.teleportLog.slice(-8), maxStuck: +p.pip.maxStuck.toFixed(2), timesDown: p.pip.timesDown, paintDealt: Math.round(p.pip.spray.damageDealt), hits: p.pip.spray.hits },
        };
      },
    };
  }
}
