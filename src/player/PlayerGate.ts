/**
 * [INPUT]: depends on three (Vector3) and the Rapier Collider type only
 * [OUTPUT]: exports the PlayerGate interface
 * [POS]: the one seam between PlayerController and a fight that changes WAI's rules (today only the souls-like Red Pen
 *        fight, src/level/works/SoulsFight). PlayerController.gate is null everywhere else, so every rule below
 *        leaves no trace outside that fight. The gate decides; the controller only asks.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import type * as THREE from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';

export interface PlayerGate {
  /** A roll is asked for: spend stamina and say yes, or refuse (empty bar). */
  tryDodge(): boolean;
  /** A jump is asked for (same deal). */
  tryJump(): boolean;
  /** Sprinting this step (`moving` = the stick is pushed): drains stamina; false = walk speed. */
  sprint(dt: number, moving: boolean): boolean;
  /** Seconds of invulnerability a roll gives (the honest i-frames; the rest of the roll can be hit). */
  readonly iframes: number;
  /** Seconds WAI is locked after a roll ends. */
  readonly recovery: number;
  /** Move speed × this (1 = normal; less while out of breath). */
  readonly speedMul: number;
  /** Lock-on: WAI faces this point while walking (null = face the movement). */
  readonly faceTarget: THREE.Vector3 | null;
  /** May WAI's capsule pass through this collider this step (a giant body that sweeps through him)? */
  passable(c: Collider): boolean;
  /** A hit landed (after damage): the fight may stagger or knock WAI down. */
  onHit(damage: number, knock: number, from: THREE.Vector3): void;
}
