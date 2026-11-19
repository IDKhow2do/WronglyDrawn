/**
 * [INPUT]: depends on Difficulty (hitDamage, invuln, heal share) from meta/Difficulty; PLAYER (maxHp) from
 *          player/PlayerController; Companion (her body: hp, invuln, down, shown, squash) from ./Companion
 * [OUTPUT]: exports PipHealth (canBeHit, lose, heal, fall, step, restore; onSmudged / onRedraw hooks) and SMUDGE
 * [POS]: her hearts. The same rules as WAI's (PlayerController.takeHit / heal and the sessions' smudge): the same
 *        maximum, the same hit costs and blink, the same heal share. Companion.takeHit asks it for the numbers and
 *        does the shove; CoopPartner answers onRedraw (the pencil draws her back in next to WAI).
 *        Her smudge never reaches a session, so FightReset (the boss refill) only ever hears WAI's.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 *
 * Smudge timeline: hearts at 0 → 'blink' (SMUDGE.blink s, WAI's smudge look) → 'away' (rubbed out, hidden) →
 * onRedraw() until it succeeds → restore(): full hearts, SMUDGE.invuln s of blink, `down` back to 0.
 * `down` stays the one "out of play" flag every reader already checks (aggro, moves, goofs, swagger).
 */
import { Difficulty } from '../meta/Difficulty';
import { PLAYER } from '../player/PlayerController';
import type { Companion } from './Companion';

export const SMUDGE = {
  /** WAI's smudge blink before he is redrawn (the sessions' smudgeTimer) */
  blink: 1.6,
  /** rubbed out, before the pencil draws her again */
  away: 1.6,
  /** blink after she is back (WAI's respawn invuln) */
  invuln: 2,
  /** the pencil's redraw (Coop.spawnIn, 0.9 + 0.38 s): the blink starts once she has popped up */
  drawIn: 1.3,
};

export class PipHealth {
  phase: 'ok' | 'blink' | 'away' | 'redraw' = 'ok';
  private t = 0;
  /** heal fractions bank up until they make a whole half heart (WAI's rule) */
  private healBank = 0;
  /** seconds since her hearts last changed (the heart tag shows for a while after a change) */
  changedAgo = 99;
  /** hearts just ran out (Coop: event, line, aggro off) */
  onSmudged: (() => void) | null = null;
  /** rubbed out long enough: put her back next to WAI; false = not now, ask again next step */
  onRedraw: (() => boolean) | null = null;

  constructor(private b: Companion) {}

  get max(): number {
    return PLAYER.maxHp;
  }

  get smudged(): boolean {
    return this.phase !== 'ok';
  }

  /** Not blinking, not out, not rolling, fully drawn. */
  canBeHit(): boolean {
    const b = this.b;
    return b.invuln <= 0 && !this.smudged && !b.dodging && b.shown && b.squash > 0.9;
  }

  /** A hit landed: WAI's cost and blink. Returns the half hearts it cost. */
  lose(base: number): number {
    const b = this.b;
    const dmg = Difficulty.hitDamage(base);
    b.hp = Math.max(0, b.hp - dmg);
    b.invuln = Difficulty.s.invuln;
    this.changedAgo = 0;
    if (b.hp <= 0) this.smudge();
    return dmg;
  }

  /** Fell off the canvas / into the water / the pit: one half heart, never the last one (WAI's fall rule). */
  fall(): void {
    const b = this.b;
    if (this.smudged) return;
    b.hp = Math.max(1, b.hp - 1);
    this.changedAgo = 0;
  }

  /** Half hearts of healing, scaled by the difficulty like WAI's. */
  heal(amount: number): void {
    const b = this.b;
    if (this.smudged || b.hp >= this.max) return;
    this.healBank += amount * Difficulty.s.heal;
    const whole = Math.floor(this.healBank + 1e-6);
    if (whole <= 0) return;
    this.healBank -= whole;
    b.hp = Math.min(this.max, b.hp + whole);
    this.changedAgo = 0;
  }

  private smudge(): void {
    const b = this.b;
    this.phase = 'blink';
    this.t = SMUDGE.blink;
    b.down = SMUDGE.blink + SMUDGE.away;
    b.timesDown++;
    this.onSmudged?.();
  }

  /** Per fixed step (Companion.step). */
  step(dt: number): void {
    const b = this.b;
    this.changedAgo += dt;
    if (b.hp > this.max) b.hp = this.max; // a boon taken away
    if (this.phase === 'ok') return;
    this.t -= dt;
    b.down = Math.max(0.001, b.down - dt);
    if (this.phase === 'blink' && this.t <= 0) {
      this.phase = 'away';
      this.t = SMUDGE.away;
      b.erase();
    } else if (this.phase === 'away' && this.t <= 0) this.phase = 'redraw';
    if (this.phase === 'redraw' && this.onRedraw?.()) this.restore();
  }

  /** Back in play with full hearts. */
  restore(): void {
    const b = this.b;
    this.phase = 'ok';
    b.down = 0;
    b.hp = this.max;
    b.invuln = SMUDGE.invuln + SMUDGE.drawIn;
    this.healBank = 0;
    this.changedAgo = 0;
  }
}
