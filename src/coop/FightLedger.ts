/**
 * [INPUT]: depends on EnemyBase (repaint, baseHp, engaged, disposed) from enemy/EnemyBase; BOSS_HP from meta/Difficulty;
 *          reads the session (enemies, player) through CoopPartner from ./Coop
 * [OUTPUT]: exports FightLedger (per-fight paint totals: WAI vs the partner), FightReport, FIGHT (thresholds) and
 *           paintDone() (a creature's painted-away corruption in base paint units)
 * [POS]: the bookkeeping half of the partner's show-off personality. Swagger.ts reads the reports and speaks.
 *        It edits no shared combat file: it POLLS every creature's repaint each step for the total, and the
 *        partner's own hits report their amount through mine() (CoopSpray.onHitEnemy, Moves.noteHit).
 *        WAI's share = total − hers, so stomps, hosts and TAGs all count as his.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type { EnemyBase } from '../enemy/EnemyBase';
import { BOSS_HP } from '../meta/Difficulty';
import type { CoopPartner } from './Coop';

/** What makes a fight, and what makes one worth talking about. */
export const FIGHT = {
  /** no paint for this long, nobody engaged and no unfinished foe of this fight near WAI: the fight is over (s) */
  quietEnd: 3,
  /** no paint for this long: over, whatever is still around — except a boss still fighting near WAI (s) */
  giveUp: 15,
  /** a "real" fight: at least this much paint in all (base units; a grub is 16, a Stapler 220) */
  minPaint: 90,
  /** …and at least this long from the first to the last stroke (s) */
  minSecs: 4,
  /** the most of a fight's paint that may be hers (author: she is there for fun, 5–20 % of the output, never the carry) */
  shareCap: 0.2,
  /** paint she may land before WAI has landed any (so she is not visibly useless at the start of a fight) */
  headStart: 12,
  /** an engaged creature, or an unfinished one that took paint in this fight, this close to WAI keeps it open (m) */
  near: 22,
};

export interface FightReport {
  /** paint by WAI (everything that was not hers) and by her, in base units */
  wai: number;
  fish: number;
  /** her share of the total, 0..1 */
  share: number;
  /** first stroke → last stroke (s) */
  secs: number;
  /** creatures fully repainted in it */
  finished: number;
  /** a boss or mid-boss (base paint ≥ BOSS_HP) took paint in it */
  boss: boolean;
  /** ids of the creatures that took paint */
  foes: string[];
  /** worth a comment: real, won, and long enough (see FIGHT) */
  real: boolean;
}

/** Corruption painted away, in base paint units (repaint × baseHp): difficulty rescaling never reads as damage. */
export function paintDone(o: unknown): number {
  const e = o as { repaint?: number; baseHp?: number; kind?: string };
  if (e.kind === undefined || typeof e.repaint !== 'number' || typeof e.baseHp !== 'number') return 0;
  return e.repaint * e.baseHp;
}

interface Open {
  t0: number;
  last: number;
  total: number;
  fish: number;
  finished: number;
  boss: boolean;
  foes: Set<EnemyBase>;
  bossDown: boolean;
}

export class FightLedger {
  private prev = new Map<EnemyBase, number>();
  private cur: Open | null = null;
  /** finished fights, newest last (tests / status) */
  readonly history: FightReport[] = [];
  /** a fight just ended (Swagger listens) */
  onEnd: ((r: FightReport) => void) | null = null;

  constructor(private p: CoopPartner) {}

  /** Her own hit landed: `amount` = the paint it took off (paintDone after − before). */
  mine(amount: number): void {
    if (!(amount > 0)) return;
    this.open().fish += amount;
  }

  /** How much more paint she may land right now and stay under FIGHT.shareCap of this fight (CoopMoves.cap asks). */
  room(): number {
    const c = this.cur;
    if (!c) return FIGHT.headStart;
    const wai = Math.max(0, c.total - c.fish);
    return Math.max(0, FIGHT.headStart + (FIGHT.shareCap / (1 - FIGHT.shareCap)) * wai - c.fish);
  }

  /** The fight in progress, if any (status / tests). */
  get live(): { secs: number; wai: number; fish: number } | null {
    const c = this.cur;
    return c ? { secs: c.last - c.t0, wai: Math.max(0, c.total - c.fish), fish: c.fish } : null;
  }

  private open(): Open {
    const now = this.p.time;
    return (this.cur ??= { t0: now, last: now, total: 0, fish: 0, finished: 0, boss: false, foes: new Set(), bossDown: false });
  }

  step(): void {
    const p = this.p;
    const s = p.s;
    const now = p.time;
    // poll: every creature's paint since the last step (a refill or a respawn only lowers it: not counted)
    for (const e of s.enemies) if (!this.prev.has(e)) this.prev.set(e, paintDone(e));
    for (const [e, before] of this.prev) {
      const after = paintDone(e);
      if (after > before + 1e-6) {
        const c = this.open();
        c.total += after - before;
        c.last = now;
        c.foes.add(e);
        const big = e.baseHp >= BOSS_HP;
        if (big) c.boss = true;
        if (e.repaint >= 0.999) {
          c.finished++;
          if (big) c.bossDown = true;
        }
      }
      this.prev.set(e, after);
      if (e.disposed) this.prev.delete(e);
    }
    const c = this.cur;
    if (!c) return;
    const quiet = now - c.last;
    const near = (e: EnemyBase) => !e.disposed && p.fightable(e) && e.pos.distanceTo(s.player.pos) < FIGHT.near;
    // (a creature that only paused — shielded, refilling, not engaged for a moment — does not split the fight in two)
    const open = s.enemies.some((e) => near(e) && e.engaged) || [...c.foes].some((e) => near(e) && e.repaint < 0.999);
    // a boss / mid-boss still up and fighting near WAI: its long phases (cut-ins, shields) never time the fight out
    const bossUp = [...c.foes].some((e) => e.baseHp >= BOSS_HP && near(e) && e.engaged && e.repaint < 0.999);
    if ((c.bossDown && quiet > 0.5) || (quiet > FIGHT.quietEnd && !open) || (quiet > FIGHT.giveUp && !bossUp)) this.close(c);
  }

  private close(c: Open): void {
    this.cur = null;
    const total = Math.max(c.total, c.fish);
    const fish = Math.min(c.fish, total);
    const secs = c.last - c.t0;
    const r: FightReport = {
      wai: total - fish,
      fish,
      share: total > 0 ? fish / total : 0,
      secs,
      finished: c.finished,
      boss: c.boss,
      foes: [...c.foes].map((e) => e.id),
      real: c.finished > 0 && total >= FIGHT.minPaint && secs >= FIGHT.minSecs,
    };
    this.history.push(r);
    if (this.history.length > 20) this.history.shift();
    this.onEnd?.(r);
  }
}
