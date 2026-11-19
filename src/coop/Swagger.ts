/**
 * [INPUT]: depends on FightLedger / FightReport from ./FightLedger; CoopPartner (rules.line, event, goofs, bubble,
 *          pip, session) from ./Coop; the line pools live in ./RuleBrain (LINES), the Chinese in i18n/zhSwagger
 * [OUTPUT]: exports Swagger (the show-off director: fight credit with her real share, small-win brags, "the user is
 *           REALLY angry now") and SWAGGER (every rate limit and threshold, one table)
 * [POS]: the personality layer of the co-op partner, beside Mood (rice / naps), Goofs (mishaps) and Roast (teasing
 *        the player). Coop.ts owns one and calls step(); Mood.poke, Goofs.sprayCam, Coop.setStance and the
 *        teleport hook report annoyances; RuleBrain.react / dodged and the crown / region events ask for brags.
 *        Its fixed lines are URGENT kinds in RuleBrain, so the memes still play while an LLM is commanding;
 *        the small-win brags are not (the model brags in its own words, per the persona in prompt.ts).
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { CoopPartner } from './Coop';
import type { Face } from './prompt';
import { FightLedger, type FightReport } from './FightLedger';

export const SWAGGER = {
  /** her share under this → "we two are so strong" (team credit, real number) */
  teamBelow: 0.3,
  /** her share at or over this → she brags about herself (real number); in between: no credit line */
  selfFrom: 0.4,
  /** at least this long between two credit lines after ordinary fights (s); boss / mid-boss fights always get one */
  creditGap: 100,
  /** chance an ordinary qualifying fight gets its credit line */
  creditChance: 0.65,
  /** at least this long between two small-win brags, and after a credit line (s) */
  bragGap: 20,
  /** chance per small win */
  bragChance: { win: 0.55, dodge: 0.5, crown: 0.8, first: 0.7 } as Record<BragWhy, number>,
  /** at least this long between two "the user is angry" lines (s) */
  angryGap: 45,
  /** after it: no goofs for this long (s) */
  behave: 60,
  /** …and no small-win brags for this long (s) */
  behaveQuiet: 30,
  /** "wake up / come here" this many times within `nagWindow` s = nagged */
  nagCount: 2,
  nagWindow: 20,
  /** a queued line waits at most this long for a free bubble / the end of a cutscene, then is dropped (s) */
  maxWait: 25,
};

export type BragWhy = 'win' | 'dodge' | 'crown' | 'first';
export type AnnoyWhy = 'flood' | 'poked' | 'nagged' | 'lost';

const BRAG_KIND: Record<BragWhy, string> = { win: 'bragWin', dodge: 'bragDodge', crown: 'bragCrown', first: 'bragFirst' };

interface Queued {
  kind: string;
  face: Face;
  vars?: Record<string, string | number>;
  /** seconds before it may play */
  delay: number;
  /** seconds it has waited after the delay */
  waited: number;
}

export class Swagger {
  readonly ledger: FightLedger;
  private queue: Queued[] = [];
  private lastCredit = -999;
  private lastBrag = -999;
  private lastAngry = -999;
  private quietUntil = 0;
  private orders: number[] = [];
  /** WAI's feet last step, and when he last jumped across the map (respawn, checkpoint, warp) */
  private waiAt = { x: 0, z: 0, seen: false };
  private waiJumpAt = -999;
  /** lines spoken per kind (tests / the spam check) */
  readonly said: Record<string, number> = {};
  /** the last lines with their time (tests / status) */
  readonly log: string[] = [];

  constructor(private p: CoopPartner) {
    this.ledger = new FightLedger(p);
    this.ledger.onEnd = (r) => this.fightOver(r);
  }

  /** Say one fixed line now (forced: it is a beat, not chatter). Returns false when it could not play. */
  speak(kind: string, face: Face, vars?: Record<string, string | number>): boolean {
    const ok = this.p.rules.line(kind, undefined, true, face, vars);
    if (ok) {
      this.said[kind] = (this.said[kind] ?? 0) + 1;
      this.log.push(`${this.p.time.toFixed(0)}s ${kind}: ${this.p.bubble.current}`);
      if (this.log.length > 30) this.log.shift();
    }
    return ok;
  }

  /** A small win: maybe a brag (rate-limited). True = she bragged (the caller skips its own line). */
  brag(why: BragWhy): boolean {
    const now = this.p.time;
    if (now < this.quietUntil || now - this.lastBrag < SWAGGER.bragGap || now - this.lastCredit < SWAGGER.bragGap) return false;
    if (this.p.usingLlm || this.p.bubble.busy || Math.random() >= SWAGGER.bragChance[why]) return false;
    // half the time the generic catchphrases ("I really am too good at this"), else one for the moment
    const kind = Math.random() < 0.5 ? 'brag' : BRAG_KIND[why];
    if (!this.speak(kind, why === 'crown' ? 'rice' : 'portrait')) return false;
    this.lastBrag = now;
    return true;
  }

  /** She clearly annoyed WAI: "Uh-oh, the user is REALLY angry now", then she behaves for a while. */
  annoyed(why: AnnoyWhy): void {
    const p = this.p;
    const now = p.time;
    if (now - this.lastAngry < SWAGGER.angryGap) return;
    // WAI was the one who left (a respawn at a checkpoint, a level warp): her catching up is not her fault
    if (why === 'lost' && now - this.waiJumpAt < 8) return;
    this.lastAngry = now;
    p.event(`I think I really annoyed WAI (${why === 'flood' ? 'I flooded his screen with paint' : why === 'poked' ? 'he sprayed me' : why === 'nagged' ? 'he had to call me again and again' : 'I wandered off and had to be redrawn next to him'}), so I am behaving for a bit`, true, { blame: 'cheeky' });
    p.goofs.hush(SWAGGER.behave);
    this.quietUntil = now + SWAGGER.behaveQuiet;
    this.queue.push({ kind: 'angry', face: 'caught', delay: why === 'lost' ? 1.2 : 0.6, waited: 0 });
  }

  /** WAI gave a standing order: "wake up" / "come here" again and again = nagging. */
  ordered(mode: string): void {
    if (mode !== 'wake' && mode !== 'follow') return;
    const now = this.p.time;
    this.orders = this.orders.filter((t) => now - t < SWAGGER.nagWindow);
    this.orders.push(now);
    if (this.orders.length >= SWAGGER.nagCount) {
      this.orders.length = 0;
      this.annoyed('nagged');
    }
  }

  private fightOver(r: FightReport): void {
    const p = this.p;
    const pct = r.fish > 0 ? Math.max(1, Math.round(r.share * 100)) : 0;
    if (!r.real) return;
    // the fact, for her memory and the model (it may only ever quote this number)
    p.event(`fight won (${r.foes.slice(0, 3).join(', ')}${r.boss ? ', a boss fight' : ''}, ${Math.round(r.secs)} s): WAI painted ${Math.round(r.wai)}, I painted ${Math.round(r.fish)}, my damage share ${pct}%`, true, { key: true });
    const now = p.time;
    const kind = r.share < SWAGGER.teamBelow ? 'credit' : r.share >= SWAGGER.selfFrom ? 'creditSelf' : '';
    if (!kind) return;
    if (!r.boss && (now - this.lastCredit < SWAGGER.creditGap || Math.random() >= SWAGGER.creditChance)) return;
    this.lastCredit = now;
    this.queue.push({ kind, face: kind === 'credit' ? 'rice' : 'portrait', vars: { pct }, delay: 0.4, waited: 0 });
  }

  /** May a queued line show now? (not in a cutscene, not while she is being drawn in, not smudged) */
  private canSpeak(): boolean {
    const p = this.p;
    const s = p.s;
    return !s.story.locked && !s.ctx.camera.inCine && !s.completed && !s.frozen && p.pip.shown && p.pip.squash > 0.9 && p.pip.down <= 0;
  }

  step(dt: number): void {
    this.ledger.step();
    const w = this.p.s.player.pos;
    const a = this.waiAt;
    if (a.seen && Math.hypot(w.x - a.x, w.z - a.z) > 6) this.waiJumpAt = this.p.time;
    a.x = w.x;
    a.z = w.z;
    a.seen = true;
    const q = this.queue[0];
    if (!q) return;
    if (q.delay > 0) {
      q.delay -= dt;
      return;
    }
    q.waited += dt;
    if (q.waited > SWAGGER.maxWait) {
      this.queue.shift();
      return;
    }
    // a free bubble (her last line had its reading time), or after 6 s whatever is there
    if (!this.canSpeak() || (this.p.bubble.busy && q.waited < 6)) return;
    this.queue.shift();
    this.speak(q.kind, q.face, q.vars);
  }
}
