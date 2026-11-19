/**
 * [INPUT]: depends on RAPIER (capsule colliders on the boss's kinematic body) from core/PhysicsWorld; GameContext; PEN_H /
 *          PenWeak from ./RedPenLook
 * [OUTPUT]: exports PEN_SCALE, PEN_LEN, PenPose (pivot + lean + spin → quaternion; turn(): eased, with a dead zone round the nib, so WAI never swings the body), RedPenBody (segment colliders that
 *           follow the pose, weak-point world positions, segment ↔ point distances for attack shapes, pushOut()), SEGMENTS, segDist()
 * [POS]: the giant Red Pen's physical body for the souls-like roof fight, owned by RedPenBoss. The drawn pen (RedPenLook
 *        ×PEN_SCALE, ≈14 m) and these four capsules share one pose, so what you see is what you hit and what hits you:
 *        nib 0–2.4 m · grip 2.4–7 m · barrel 7–10.8 m · cap 10.8–14.1 m along the pen's axis from the nib ball.
 *        The sculpted body (RedPenModel) is fitted to these numbers; only its crown (14.4–16.5 m) has no capsule.
 *        The pose is a pivot (the nib ball, on the roof when it stands) plus a lean: Ry(leanYaw)·Rx(tilt)·Ry(spin).
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import { PEN_H, type PenWeak } from './RedPenLook';

/** The fight's Pen: ×2.2 the level-2 sky pen → ≈14 m tall. */
export const PEN_SCALE = 2.2;
export const PEN_LEN = PEN_H * PEN_SCALE;

const AX_X = new THREE.Vector3(1, 0, 0);
const AX_Y = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Body segments along the axis (m from the nib ball) and their radius. */
export const SEGMENTS = [
  { id: 'nib', from: 0.2, to: 2.4, r: 0.6 },
  { id: 'grip', from: 2.4, to: 7.0, r: 1.18 },
  { id: 'barrel', from: 7.0, to: 10.8, r: 1.12 },
  { id: 'cap', from: 10.8, to: 14.1, r: 1.26 },
] as const;

/**
 * Weak points: along the axis, out of the axis toward the face (+Z before spin), to the side (+X: the clip hangs on the
 * cap's side, off the face; sprawled, that side lies level at 1.2 m, in reach), radius.
 */
const WEAK: Record<PenWeak, { along: number; out: number; side: number; r: number }> = {
  nib: { along: 1.0, out: 0, side: 0, r: 1.3 },
  grip: { along: 4.7, out: 0, side: 0, r: 2.0 },
  clip: { along: 12.0, out: 0, side: 1.4, r: 1.5 },
  eyes: { along: 13.25, out: 1.2, side: 0, r: 1.5 },
};

export class PenPose {
  readonly pivot = new THREE.Vector3();
  /** Angle from vertical (rad): 0 stands on its nib, π/2 lies flat. */
  tilt = 0;
  /** Direction the cap leans toward (yaw, rad; 0 = +Z). */
  leanYaw = 0;
  /** Where its face (eyes, clip) points when upright (yaw, rad). */
  face = 0;
  readonly q = new THREE.Quaternion();

  /** Rebuild the quaternion: the face keeps pointing at `face` however it leans. */
  update(): THREE.Quaternion {
    this.q.setFromAxisAngle(AX_Y, this.leanYaw).multiply(_q.setFromAxisAngle(AX_X, this.tilt)).multiply(_q.setFromAxisAngle(AX_Y, this.face - this.leanYaw));
    return this.q;
  }

  /** Unit vector nib → cap. */
  axis(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(0, 1, 0).applyQuaternion(this.q);
  }

  /** World point `along` m up the axis (+ `out` m toward the face, + `side` m toward the clip's side). */
  point(along: number, out = 0, o = new THREE.Vector3(), side = 0): THREE.Vector3 {
    return o.set(side, along, out).applyQuaternion(this.q).add(this.pivot);
  }

  /**
   * Ease `leanYaw` or `face` toward the bearing to `at` (+ `offset`) at `rate`/s. WAI within 2.6 m of the nib (round
   * it, on it, jumping over it) gives no bearing: the 14 m body holds still instead of swinging side to side.
   */
  turn(key: 'leanYaw' | 'face', at: THREE.Vector3, dt: number, rate: number, offset = 0): void {
    const dx = at.x - this.pivot.x, dz = at.z - this.pivot.z;
    if (dx * dx + dz * dz < 2.6 * 2.6) return;
    const d = Math.atan2(dx, dz) + offset - this[key];
    this[key] += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * rate);
  }

  copy(p: PenPose): this {
    this.pivot.copy(p.pivot);
    this.tilt = p.tilt;
    this.leanYaw = p.leanYaw;
    this.face = p.face;
    this.q.copy(p.q);
    return this;
  }
}

/** Distance between segment a0–a1 and segment b0–b1 (closest points). */
export function segDist(a0: THREE.Vector3, a1: THREE.Vector3, b0: THREE.Vector3, b1: THREE.Vector3): number {
  const d1 = _a.subVectors(a1, a0);
  const d2 = _b.subVectors(b1, b0);
  const rx = a0.x - b0.x, ry = a0.y - b0.y, rz = a0.z - b0.z;
  const a = d1.dot(d1), e = d2.dot(d2), f = d2.x * rx + d2.y * ry + d2.z * rz;
  let s = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) return Math.hypot(rx, ry, rz);
  if (a <= 1e-9) t = THREE.MathUtils.clamp(f / e, 0, 1);
  else {
    const c = d1.x * rx + d1.y * ry + d1.z * rz;
    if (e <= 1e-9) s = THREE.MathUtils.clamp(-c / a, 0, 1);
    else {
      const b = d1.dot(d2), den = a * e - b * b;
      s = den > 1e-9 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = THREE.MathUtils.clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1);
      }
    }
  }
  const px = a0.x + d1.x * s - (b0.x + d2.x * t);
  const py = a0.y + d1.y * s - (b0.y + d2.y * t);
  const pz = a0.z + d1.z * s - (b0.z + d2.z * t);
  return Math.hypot(px, py, pz);
}

const _p0 = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _w0 = new THREE.Vector3();
const _w1 = new THREE.Vector3();

/** The Pen's capsules on the boss's own kinematic body (EnemyBase's default capsule is removed). */
export class RedPenBody {
  readonly pose = new PenPose();
  readonly colliders: RAPIER.Collider[] = [];
  /** Colliders WAI may walk through right now (a sweep passes through him; the roll's i-frames decide). */
  ghost = false;

  constructor(
    private ctx: GameContext,
    private body: RAPIER.RigidBody,
    owner: unknown,
  ) {
    const w = ctx.physics.world;
    for (const s of SEGMENTS) {
      const half = Math.max(0.05, (s.to - s.from) / 2 - s.r);
      const desc = RAPIER.ColliderDesc.capsule(half, s.r).setTranslation(0, (s.from + s.to) / 2, 0);
      const c = w.createCollider(desc, body);
      ctx.physics.tag(c, 'enemy', owner);
      this.colliders.push(c);
    }
  }

  /** Is `c` one of the Pen's own capsules? */
  owns(c: RAPIER.Collider): boolean {
    return this.colliders.includes(c);
  }

  /** Push the current pose to the physics body (next step). */
  sync(): void {
    const p = this.pose;
    p.update();
    this.body.setNextKinematicTranslation({ x: p.pivot.x, y: p.pivot.y, z: p.pivot.z });
    this.body.setNextKinematicRotation({ x: p.q.x, y: p.q.y, z: p.q.z, w: p.q.w });
  }

  /** Teleport the body (no sweep): after a reset. */
  snap(): void {
    const p = this.pose;
    p.update();
    this.body.setTranslation({ x: p.pivot.x, y: p.pivot.y, z: p.pivot.z }, true);
    this.body.setRotation({ x: p.q.x, y: p.q.y, z: p.q.z, w: p.q.w }, true);
  }

  weakPos(id: PenWeak, out = new THREE.Vector3()): THREE.Vector3 {
    const w = WEAK[id];
    return this.pose.point(w.along, w.out, out, w.side);
  }

  weakRadius(id: PenWeak): number {
    return WEAK[id].r;
  }

  /**
   * How far WAI's body (feet → head) is from the Pen's surface (negative = inside), over the segments between
   * `from` and `to` m along the axis (default: the whole pen).
   */
  gap(feet: THREE.Vector3, from = 0, to = PEN_LEN): number {
    _w0.copy(feet).setY(feet.y + 0.35);
    _w1.copy(feet).setY(feet.y + 0.95);
    let best = Infinity;
    for (const s of SEGMENTS) {
      const a = Math.max(from, s.from), b = Math.min(to, s.to);
      if (b <= a) continue;
      this.pose.point(a, 0, _p0);
      this.pose.point(b, 0, _p1);
      best = Math.min(best, segDist(_p0, _p1, _w0, _w1) - s.r - 0.33);
    }
    return best;
  }

  /** Lowest point of the pen's surface above the roof at `floorY` (for "jump over it" checks). */
  axisHeightAt(feet: THREE.Vector3): number {
    // height of the axis above the floor at WAI's horizontal distance from the pivot (straight-line lean)
    const ax = this.pose.axis(_a);
    const flat = Math.hypot(ax.x, ax.z);
    const d = Math.hypot(feet.x - this.pose.pivot.x, feet.z - this.pose.pivot.z);
    if (flat < 1e-3) return Infinity;
    const along = d / flat;
    if (along > PEN_LEN) return Infinity;
    return this.pose.pivot.y + ax.y * along;
  }

  /** Where WAI's feet must go so his capsule no longer overlaps the Pen (null = no overlap). Horizontal only. */
  pushOut(feet: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 | null {
    const g = this.gap(feet);
    if (g >= -0.02) return null;
    // closest point on the axis to WAI's waist
    const ax = this.pose.axis(_a);
    _w0.copy(feet).setY(feet.y + 0.6).sub(this.pose.pivot);
    const k = THREE.MathUtils.clamp(_w0.dot(ax), 0, PEN_LEN);
    _p0.copy(this.pose.pivot).addScaledVector(ax, k);
    _p1.set(feet.x - _p0.x, 0, feet.z - _p0.z);
    if (_p1.lengthSq() < 1e-4) _p1.set(1, 0, 0);
    _p1.normalize();
    return out.copy(feet).addScaledVector(_p1, -g + 0.05);
  }

  dispose(): void {
    for (const c of this.colliders) this.ctx.physics.untag(c);
    this.colliders.length = 0;
  }
}
