/**
 * [INPUT]: depends on soulsTuning() (the souls rows) from meta/Difficulty
 * [OUTPUT]: exports Stamina (value, frac, spend, drain, update, refill, out, flash)
 * [POS]: WAI's stamina in the souls-like Red Pen fight only (src/level/works/SoulsFight owns the one instance; nothing
 *        else reads it). A spend needs any stamina left (souls rule: the last roll may dig the bar to zero); an empty
 *        bar refuses rolls and jumps until it refills. Spraying slows the refill (Difficulty SOULS.sprayRegen).
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import { soulsTuning } from '../meta/Difficulty';

export class Stamina {
  value = 0;
  /** Seconds since the last spend (the refill waits for regenDelay). */
  private since = 99;
  /** 0..1 red pulse on the bar after a refused action (HUD). */
  flash = 0;
  /** Seconds out of breath (WAI pants; set when the bar hits zero). */
  out = 0;

  constructor() {
    this.refill();
  }

  get max(): number {
    return soulsTuning().stamina;
  }

  get frac(): number {
    return this.value / this.max;
  }

  refill(): void {
    this.value = this.max;
    this.since = 99;
    this.out = 0;
  }

  /** Spend `cost` if any stamina is left. Returns false (and flashes the bar) if empty. */
  spend(cost: number): boolean {
    if (this.value < 1) {
      this.flash = 1;
      return false;
    }
    this.value = Math.max(0, this.value - cost);
    this.since = 0;
    if (this.value <= 0) this.out = 0.7;
    return true;
  }

  /** Continuous spend (sprint). Returns false when nothing is left. */
  drain(perSec: number, dt: number): boolean {
    if (this.value <= 0) return false;
    this.value = Math.max(0, this.value - perSec * dt);
    this.since = 0;
    if (this.value <= 0) this.out = 0.7;
    return true;
  }

  update(dt: number, spraying: boolean): void {
    const s = soulsTuning();
    if (this.value > s.stamina) this.value = s.stamina;
    this.since += dt;
    this.flash = Math.max(0, this.flash - dt * 2.5);
    this.out = Math.max(0, this.out - dt);
    if (this.since < s.regenDelay) return;
    this.value = Math.min(s.stamina, this.value + s.regen * dt * (spraying ? s.sprayRegen : 1));
  }
}
