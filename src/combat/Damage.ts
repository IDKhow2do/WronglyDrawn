import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';

export type DamageKind = 'paint' | 'spit' | 'bite' | 'hostBite' | 'crash' | 'stomp';

export interface DamageInfo {
  amount: number;
  point: THREE.Vector3;
  dir: THREE.Vector3;
  collider: RAPIER.Collider | null;
  kind: DamageKind;
  color?: string;
  /** A TAG or ENCORE stamp: a fixed bite that never starts a new reel by itself. */
  tag?: boolean;
  /** A fixed bite: weak points do not multiply it (TAG, ENCORE, PAINT SLAM). */
  fixed?: boolean;
}

export interface DamageResult {
  /** Hit a weak point (critical). */
  weak: boolean;
  /** Damage was absorbed (e.g. Chomper swallowed the shot). */
  absorbed?: boolean;
  /** This hit finished the enemy (stunned / popped). */
  finished?: boolean;
}

/** Anything paint, bites or crashes can hurt. Registered as a collider owner. */
export interface Damageable {
  readonly damageable: true;
  applyDamage(info: DamageInfo): DamageResult;
}

export function isDamageable(x: unknown): x is Damageable {
  return !!x && (x as Damageable).damageable === true;
}
