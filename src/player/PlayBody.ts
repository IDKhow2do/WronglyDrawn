/**
 * [INPUT]: depends on three (Vector3) and the Rapier Collider type
 * [OUTPUT]: exports PlayBody — the surface a world mechanism needs from a body it acts on
 * [POS]: the one contract between the world's mechanisms (springs in level/Ambient, the stamp presses in
 *        level/works/StampingFloor) and the two bodies they act on: WAI (player/PlayerController) and the co-op
 *        partner (coop/Companion). A mechanism written against PlayBody acts on both the same way. Type-only file.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

export interface PlayBody {
  /** Feet position (world). */
  readonly pos: THREE.Vector3;
  /** Horizontal velocity (m/s). */
  readonly vel: THREE.Vector3;
  /** Vertical speed (m/s). */
  vy: number;
  grounded: boolean;
  /** Hearts gone: out of play until redrawn. */
  readonly smudged: boolean;
  readonly collider: RAPIER.Collider;
  /** A hit of `damage` half hearts (before Difficulty.hitDamage). True = it landed. */
  takeHit(from: THREE.Vector3, damage?: number, knock?: number): boolean;
  /** A thrown jump along `dir` that covers `dist` metres, starting at vertical speed `vy`. */
  leap(dir: THREE.Vector3, dist: number, vy: number): void;
}
