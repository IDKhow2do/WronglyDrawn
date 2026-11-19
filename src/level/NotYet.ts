/**
 * [INPUT]: depends on GameContext (effects, audio); EnemyBase (onIgnored hook, shudder(), pos) from enemy/EnemyBase; t from i18n
 * [OUTPUT]: exports NotYet (watch()) and NotYetLook
 * [POS]: the one rule "a boss that is not fighting yet answers a hit", shared by GameSession (the Eraser, and the Red
 *        Inkwell over its barricades), HarborSession (the Hush) and SoulsFight (the Red Pen behind its ink).
 *        A gated boss calls its onIgnored hook from preDamage / onShout instead of swallowing the hit. NotYet answers
 *        at once, on the boss: the paint slides off, it shrugs, it says its word (at most every SHOW_CD s). Then one
 *        toast names what is missing (the same line at most every LINE_CD s). This is feedback to the player's own action:
 *        it does not wait for the "stuck for 25 s" guidance rule (src/ui/Guide.ts).
 * [PROTOCOL]: Update this header on change, then check docs/regression/ARENAS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { EnemyBase } from '../enemy/EnemyBase';
import { t } from '../i18n';

/** How a gated boss shows it is ignoring the hit: its word and its colour. */
export interface NotYetLook {
  word: string;
  color: string;
}

/** The line the player reads, or null when nothing needs saying (the fight is about to start). Asked on every hit. */
export type NotYetReason = () => { text: string; params?: Record<string, string | number> } | null;

/** Seconds between two reactions on the boss (a spray lands many hits a second). */
const SHOW_CD = 0.8;
/** Seconds before the same line is said again. */
const LINE_CD = 20;
const UP = new THREE.Vector3(0, 1, 0);

export class NotYet {
  private shownAt = new Map<EnemyBase, number>();
  /** Keyed by the line's English text: the same line at most every LINE_CD s, a new reason at once. */
  private saidAt = new Map<string, number>();

  constructor(
    private ctx: GameContext,
    private toast: (text: string, kind: 'info' | 'warn' | 'good', params?: Record<string, string | number>) => void,
    /** Session clock in seconds (play time: it stands still in menus). */
    private now: () => number,
  ) {}

  /** Answer every ignored hit on `e` with its look and, when due, the reason line. */
  watch(e: EnemyBase, look: NotYetLook, reason: NotYetReason): void {
    e.onIgnored = (at, how, color) => this.answer(e, look, reason, at, how, color);
  }

  private answer(e: EnemyBase, look: NotYetLook, reason: NotYetReason, at: THREE.Vector3, how: 'paint' | 'shout', color?: string): void {
    const now = this.now();
    const fx = this.ctx.effects;
    if (now - (this.shownAt.get(e) ?? -1e9) >= SHOW_CD) {
      this.shownAt.set(e, now);
      // the paint (or the shout's ripple) runs off it, it shrugs, it says its word
      if (how === 'paint') fx.burst(at, color ?? '#ffffff', 8, 1.6, 0.07, 14, UP.clone().negate());
      else fx.ring(at, look.color, 2.2);
      e.shudder(5);
      fx.comic(at.clone().setY(at.y + 0.8), t(look.word), look.color, 0.8);
      this.ctx.audio.play('denied', { pos: at, vol: 0.55 });
    }
    // asked on every hit (a reason may act: the Hush starts its fight when hit from its plaza's edge)
    const line = reason();
    if (!line || now - (this.saidAt.get(line.text) ?? -1e9) < LINE_CD) return;
    this.saidAt.set(line.text, now);
    this.toast(line.text, 'warn', line.params);
  }
}
