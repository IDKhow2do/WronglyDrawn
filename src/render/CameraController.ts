/**
 * [INPUT]: depends on three; PhysicsWorld (sphere casts, raycasts) from core/PhysicsWorld; Rapier collider type
 * [OUTPUT]: exports CameraController (follow / first-person aim camera, cinematics: playCine / queueCine / stopCine) and CineShot
 * [POS]: the one game camera, updated by main.ts every frame after the session's render(). Sessions steer it through its
 *        fields: giant framing (main.ts), extraDistance / extraHeight + yaw / pitch (render/LockOn in the souls fight),
 *        softLimit (merged rock batches + big creatures' drawn bodies, main.ts), cineProbeUp (stacked interiors), guard
 *        (a last push-out of the final camera spot: the souls fight keeps it out of the 14 m Pen and above the roof).
 *        The follow camera has one boom with one smoothed length: level colliders are its hard limit (creatures'
 *        colliders are not), softLimit and the line of sight to WAI its soft limits (docs/regression/CAMERA.md).
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '../core/PhysicsWorld';

/** One camera shot of a cinematic: optional push from pos→toPos, look→toLook. */
const UP = new THREE.Vector3(0, 1, 0);
export interface CineShot {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  dur: number;
  fov?: number;
  toPos?: THREE.Vector3;
  toLook?: THREE.Vector3;
  toFov?: number;
  /** Tiny hand-held wobble. */
  handheld?: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Radius of the follow camera's sweeps along the boom (m). */
const BOOM_R = 0.28;
/** After the boom came in, it waits this long (s) before it eases back out. */
const BOOM_HOLD = 0.3;
/** Shortest boom a creature's body can push the camera to (m): closer, WAI drops out of the bottom of the frame. */
const BODY_MIN = 2.2;

/**
 * Third-person shoulder camera that eases INTO WAI's own eye when aiming
 * (first person), and back out on release. Both modes share yaw/pitch, so
 * the blend never jumps. Sphere-cast collision keeps the near plane out of walls.
 */
export class CameraController {
  yaw = Math.PI;
  /** Positive = looking down. */
  pitch = 0.22;
  followDistance = 5.0;
  readonly shoulder = 0.55;
  targetHeight = 1.15;
  /** 0..1: a giant is close — pull back and up so it towers without making you crane your neck. */
  giant = 0;
  /** Extra pull-back / lift (m) on top of the giant framing: the souls fight's lock-on eases these in (render/LockOn). */
  extraDistance = 0;
  extraHeight = 0;
  /** Moves the final camera position out of places it must never be (set by a session, null = none). */
  guard: ((pos: THREE.Vector3) => void) | null = null;
  private giantS = 0;
  /** WAI's eye height (first-person anchor). */
  eyeHeight = 0.74;
  aimT = 0; // 0 = follow, 1 = first person
  aiming = false;
  sensitivity = 0.0024;
  /** Boom length under the hard limit (level geometry) and under the soft limits (bodies, line of sight). */
  private distance = 5;
  private softD = 5;
  private hold = { hard: 0, soft: 0 };
  /** Hysteresis states of the boom's two yes/no choices. */
  private shoulderIn = false;
  private raised = false;
  private lvl: { ph: PhysicsWorld; blocker?: (c: RAPIER.Collider) => boolean; fn: (c: RAPIER.Collider) => boolean } | null = null;
  private smoothed = new THREE.Vector3();
  private init = false;
  shake = 0;
  private kick = 0; // recoil pitch kick
  fovPunch = 0;
  /** Extra look bias toward a point (monster roar "pull"). */
  private pull: { target: THREE.Vector3; t: number } | null = null;
  override: { pos: THREE.Vector3; look: THREE.Vector3; fov?: number } | null = null;
  /** Distance from camera to WAI's head this frame (to hide the model when too close). */
  closeness = 10;
  private cine: { shots: CineShot[]; i: number; t: number } | null = null;
  private ret: { pos: THREE.Vector3; quat: THREE.Quaternion; fov: number; t: number } | null = null;
  private cineT = 0;
  private lastPhysics: PhysicsWorld | null = null;
  private raise = 0;
  private lastBlocker: ((c: RAPIER.Collider) => boolean) | undefined;
  private clock = 0;
  /** When the player last steered the camera (auto-swing waits for a quiet mouse). */
  private lastLook = -10;
  /** Swing toward open space when squeezed (tests can turn it off to compare). */
  autoSwing = true;
  /** 0..1 share of the shoulder offset in use (slides in beside walls). */
  private shoulderK = 1;
  /** Last frame's collision numbers (debug / tests). */
  dbg = { free: 0, shoulder: 0, raise: 0 };
  /**
   * Extra "walls" that have no collider of their own, as free distances from `from` along `dir` (Infinity = none
   * before `max`): `wall` = merged rock batches (they can't fade: the boom may come in close to WAI), `body` = big
   * creatures' drawn bodies, far larger than their colliders (the boom stops at BODY_MIN so WAI stays framed; a body
   * the camera still ends up in fades).
   */
  softLimit: ((from: THREE.Vector3, dir: THREE.Vector3, max: number) => { wall: number; body: number }) | null = null;
  private lastPlayer = new THREE.Vector3();
  private heading = new THREE.Vector3();

  /** Play a short sequence of shots, then glide back to gameplay. */
  playCine(shots: CineShot[], opts?: { gameplay?: boolean }): void {
    if (!shots.length) return;
    this.cine = { shots, i: 0, t: 0 };
    this.cineGameplay = !!opts?.gameplay;
    this.ret = null;
  }

  /** Cut any cinematic and glide back to gameplay. */
  stopCine(): void {
    if (!this.cine) return;
    this.cine = null;
    this.ret = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, t: 0 };
  }

  /** Append shots after whatever cinematic is playing (or start one). */
  queueCine(shots: CineShot[]): void {
    if (this.cine) this.cine.shots.push(...shots);
    else this.playCine(shots);
  }

  get inCine(): boolean {
    return !!this.cine;
  }
  /** A story cinematic (not a quick gameplay camera move like TAG): WAI holds still, the HUD steps aside. */
  get storyCine(): boolean {
    return !!this.cine && !this.cineGameplay;
  }
  private cineGameplay = false;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  applyMouse(dx: number, dy: number): void {
    if (Math.abs(dx) + Math.abs(dy) > 0.5) this.lastLook = this.clock;
    const sens = this.sensitivity * (1 - 0.35 * this.aimT);
    this.yaw -= dx * sens;
    this.pitch += dy * sens;
    // free look: up to ~75° up in both modes (the follow camera slides low behind WAI)
    const min = -1.3;
    const max = THREE.MathUtils.lerp(1.1, 1.35, this.aimT);
    this.pitch = THREE.MathUtils.clamp(this.pitch, min, max);
  }

  basis(): { forward: THREE.Vector3; right: THREE.Vector3 } {
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    return { forward, right };
  }

  lookDir(): THREE.Vector3 {
    const p = this.pitch + this.kick;
    const cp = Math.cos(p);
    return new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(p), Math.cos(this.yaw) * cp).normalize();
  }

  recoil(amount: number): void {
    this.kick = Math.min(0.12, this.kick - amount);
  }

  pullToward(target: THREE.Vector3, seconds = 0.6): void {
    this.pull = { target: target.clone(), t: seconds };
  }

  snapTo(playerPos: THREE.Vector3): void {
    this.smoothed.copy(playerPos).add(new THREE.Vector3(0, this.targetHeight, 0));
    this.init = true;
  }

  /** Where the follow camera would sit for this player position (no collision). */
  idealPosition(playerPos: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
    const dir = this.lookDir();
    const { right } = this.basis();
    return out
      .copy(playerPos)
      .add(new THREE.Vector3(0, this.targetHeight, 0))
      .addScaledVector(right, this.shoulder)
      .addScaledVector(dir, -this.followDistance);
  }

  update(
    playerPos: THREE.Vector3,
    dt: number,
    physics: PhysicsWorld | null,
    blocker?: (c: RAPIER.Collider) => boolean,
  ): void {
    if (!Number.isFinite(dt)) dt = 0;
    this.clock += dt;
    this.updateInner(playerPos, dt, physics, blocker);
    // NaN guard: one bad frame (a NaN target, a zero-length look) must not freeze the view forever
    const c = this.camera;
    const bad = (v: { x: number; y: number; z: number }) => !Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z);
    if (bad(c.position) || !Number.isFinite(c.quaternion.w) || !Number.isFinite(c.fov)) {
      if (!Number.isFinite(this.yaw)) this.yaw = 0;
      if (!Number.isFinite(this.pitch)) this.pitch = 0.2;
      if (!Number.isFinite(this.raise)) this.raise = 0;
      if (!Number.isFinite(this.giantS)) this.giantS = 0;
      this.ret = null;
      this.pull = null;
      const p = bad(playerPos) ? new THREE.Vector3() : playerPos;
      c.position.set(p.x - Math.sin(this.yaw) * 5, p.y + 2.5, p.z - Math.cos(this.yaw) * 5);
      c.quaternion.identity();
      c.fov = Number.isFinite(c.fov) ? c.fov : 60;
      c.lookAt(p.x, p.y + 1.2, p.z);
      c.updateProjectionMatrix();
      console.warn('[camera] recovered from a non-finite pose');
    }
  }

  private updateInner(
    playerPos: THREE.Vector3,
    dt: number,
    physics: PhysicsWorld | null,
    blocker?: (c: RAPIER.Collider) => boolean,
  ): void {
    this.lastPhysics = physics;
    this.lastBlocker = blocker;
    // giant framing: a higher, farther vantage eases in when a big monster is close
    this.giantS += (this.giant - this.giantS) * (1 - Math.exp(-dt * 2.5));
    this.followDistance = 5 + this.giantS * 1.8 + this.extraDistance;
    this.targetHeight = 1.15 + this.giantS * 0.75 + this.extraHeight;
    // aim blend (≈0.25 s each way)
    this.aimT = THREE.MathUtils.clamp(this.aimT + (this.aiming ? dt : -dt) / 0.25, 0, 1);
    this.kick += (0 - this.kick) * Math.min(1, dt * 12);
    this.fovPunch += (0 - this.fovPunch) * Math.min(1, dt * 6);

    if (this.override) {
      this.camera.position.copy(this.override.pos);
      this.guard?.(this.camera.position);
      this.camera.lookAt(this.override.look);
      if (this.override.fov) {
        this.camera.fov = this.override.fov;
        this.camera.updateProjectionMatrix();
      }
      return;
    }

    // monster pull: gently bias yaw toward the threat
    if (this.pull) {
      this.pull.t -= dt;
      const d = this.pull.target.clone().sub(playerPos);
      const want = Math.atan2(d.x, d.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, dt * 2.5);
      if (this.pull.t <= 0) this.pull = null;
    }

    const target = playerPos.clone().add(new THREE.Vector3(0, this.targetHeight, 0));
    if (!this.init) this.snapTo(playerPos);
    const kxz = 1 - Math.exp(-dt * 16);
    const ky = 1 - Math.exp(-dt * 9);
    this.smoothed.x += (target.x - this.smoothed.x) * kxz;
    this.smoothed.z += (target.z - this.smoothed.z) * kxz;
    this.smoothed.y += (target.y - this.smoothed.y) * ky;

    const dir = this.lookDir();
    const { right } = this.basis();

    // --- follow position: ONE boom (pivot → back along the view) with ONE smoothed length ---
    // Hard limit = level colliders (sphere casts) and merged rock batches (softLimit.wall). Soft limits = creatures' drawn bodies (softLimit.body) and the line
    // of sight to WAI's head: eased in, never snapped. The hard one snaps in: the camera never sits in a wall.
    // Both lengths hold a moment before they ease back out, and every yes/no choice below (shoulder in, rise over the
    // head) has hysteresis: an edge hit on one frame and missed on the next can no longer saw the camera back and forth.
    // Creatures' colliders are left out of the casts: a body charging through WAI put the pivot inside it and the
    // camera collapsed into his head, inside the body. Their drawn bodies push softly instead; when the camera still
    // ends up in one, the body fades (OcclusionFader, main.ts).
    const level = this.levelBlocker(physics, blocker);
    const pivot = this.smoothed.clone().addScaledVector(right, this.shoulder);
    // first make sure the shoulder offset itself doesn't go into a wall
    let shoulderFree = this.shoulder;
    if (physics) {
      // same ball size as the backward sweep below (a smaller one here left the pivot touching the
      // wall, so the back sweep started "inside" it and the camera collapsed into WAI's head)
      const s = physics.sphereCast(this.smoothed, right, this.shoulder, 0.3, level);
      shoulderFree = Math.max(0, s - 0.06);
      pivot.copy(this.smoothed).addScaledVector(right, shoulderFree);
    }
    let hard = this.followDistance;
    let soft = this.followDistance;
    if (physics) {
      const back = dir.clone().negate();
      let free = physics.sphereCast(pivot, back, this.followDistance, BOOM_R, level);
      // the over-the-shoulder offset can put the sweep into a wall that WAI's centre line clears
      // (a railing or a tower right beside him): slide the shoulder in until there's room again
      if (free < this.followDistance * 0.7) {
        const fc = physics.sphereCast(this.smoothed, back, this.followDistance, BOOM_R, level);
        if (fc > free + 0.8) this.shoulderIn = true;
        else if (fc < free + 0.3) this.shoulderIn = false;
      } else this.shoulderIn = false;
      const wantShoulder = this.shoulderIn ? 0 : 1;
      this.shoulderK += (wantShoulder - this.shoulderK) * (1 - Math.exp(-dt * (wantShoulder < this.shoulderK ? 12 : 2)));
      if (this.shoulderK < 0.999) {
        pivot.copy(this.smoothed).addScaledVector(right, shoulderFree * this.shoulderK);
        free = physics.sphereCast(pivot, back, this.followDistance, BOOM_R, level);
      }
      // squeezed (a wall, a tower, a railing right behind WAI): drift the yaw toward the side with
      // open space, so the camera swings out instead of collapsing into WAI's head. Never while
      // the player is steering, never when aiming.
      // WAI's travel direction (smoothed), for "fall in behind him" when squeezed
      if (dt > 0) {
        const v = playerPos.clone().sub(this.lastPlayer).setY(0).divideScalar(dt);
        if (v.lengthSq() < 400) this.heading.lerp(v, Math.min(1, dt * 6));
      }
      this.lastPlayer.copy(playerPos);
      const squeezed = free < this.followDistance * 0.6;
      const quiet = this.aimT < 0.1 && this.clock - this.lastLook > 0.7 && dt > 0;
      if (this.autoSwing && squeezed && quiet && this.heading.lengthSq() > 1) {
        // moving: the path WAI just walked is open — ease the yaw round behind his heading
        // (only straight behind, and only when that is clearly more open than the current view —
        // picking among several angles flip-flopped frame to frame)
        const h0 = Math.atan2(this.heading.x, this.heading.z);
        const b = new THREE.Vector3(-Math.sin(h0), back.y, -Math.cos(h0)).normalize();
        const fh = physics.sphereCast(pivot, b, this.followDistance, BOOM_R, level);
        if (fh > free + 0.3) {
          const dy = Math.atan2(Math.sin(h0 - this.yaw), Math.cos(h0 - this.yaw));
          this.yaw += dy * Math.min(1, dt * 2.4);
        }
      } else if (this.autoSwing && squeezed && quiet) {
        // standing: swing toward the side with open space
        let best = 0;
        let bestFree = free + 0.9;
        for (const off of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05]) {
          const b = back.clone().applyAxisAngle(UP, off);
          const f = physics.sphereCast(pivot, b, this.followDistance, BOOM_R, level);
          // prefer the smaller turn when it's nearly as good
          if (f > bestFree + Math.abs(off) * 0.8) {
            bestFree = f;
            best = off;
          }
        }
        if (best !== 0) this.yaw += best * Math.min(1, dt * 1.6);
      }
      // backed against a wall: rise over WAI's head (there's nearly always headroom) instead of
      // clamping into the wall — a camera inside geometry renders a black screen
      // (rises once the lift wins clearly; comes down only when the low boom has room again or the lift stops helping)
      let raiseWant = 0;
      if (free < 2.6 || this.raised) {
        const head = physics.sphereCast(pivot, UP, 2.2, 0.24, level);
        const lift = Math.max(0, head - 0.12);
        if (lift > 0.2) {
          const hp = pivot.clone().addScaledVector(UP, lift);
          const gain = physics.sphereCast(hp, back, this.followDistance, BOOM_R, level) - free;
          if (gain > (free < 1.6 ? 0.3 : 0.9)) this.raised = true;
          else if (gain < 0.15 || free >= 3.2) this.raised = false;
          if (this.raised) raiseWant = lift;
        } else this.raised = false;
      }
      this.raise += (raiseWant - this.raise) * (1 - Math.exp(-dt * (raiseWant > this.raise ? 10 : 3)));
      if (this.raise > 0.01) {
        const head = physics.sphereCast(pivot, UP, this.raise + 0.1, 0.24, level);
        pivot.addScaledVector(UP, Math.min(this.raise, Math.max(0, head - 0.12)));
        free = physics.sphereCast(pivot, back, this.followDistance, BOOM_R, level);
      }
      // never closer than the near plane, never further than the free space
      hard = Math.max(0.15, free - 0.08);
      // big creatures' drawn bodies (and merged rock batches): stop short of them, but keep WAI framed
      if (this.softLimit) {
        const f = this.softLimit(pivot, back, hard);
        // a rock is a wall (snaps, like a collider); a body is soft (eases, and fades if the camera still gets in)
        if (f.wall < hard) hard = Math.max(1.2, f.wall - 0.3);
        if (f.body < hard) soft = Math.max(BODY_MIN, f.body - 0.3);
      }
      // line of sight to WAI's head: the boom can be clear while a wall top or a corner still hides him
      if (this.aimT < 0.5) soft = Math.min(soft, this.sightLimit(physics, level, pivot, back, Math.min(soft, hard)));
      this.dbg = { free, shoulder: shoulderFree * this.shoulderK, raise: this.raise };
    }
    this.distance = this.track(this.distance, hard, dt, 'hard');
    this.softD = this.track(this.softD, soft, dt, 'soft');
    const followPos = pivot.clone().addScaledVector(dir, -Math.min(this.distance, this.softD));

    // --- first-person position: inside WAI's eye ---
    const fpPos = new THREE.Vector3(playerPos.x, playerPos.y + this.eyeHeight, playerPos.z).addScaledVector(
      new THREE.Vector3(dir.x, 0, dir.z).normalize(),
      0.12,
    );

    const e = ease(this.aimT);
    this.camera.position.lerpVectors(followPos, fpPos, e);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const s = this.shake * this.shake * 0.25 * (1 - this.giantS * 0.45);
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
    }
    this.camera.lookAt(this.camera.position.clone().add(dir));
    // portrait phones: widen the vertical FOV so the horizontal view stays usable
    const aspect = this.camera.aspect;
    const base = aspect < 1.2 ? 62 + (1.2 - aspect) * 28 : 62;
    const fov = THREE.MathUtils.lerp(base, base - 8, e) + this.fovPunch;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    // a larger near plane in third person = much finer depth precision far away (no flicker)
    this.camera.near = e > 0.5 ? 0.03 : 0.22;
    this.applyCine(dt);
    // a session's last word on the camera spot (gameplay, cut-ins and story shots alike): e.g. never inside a giant
    this.guard?.(this.camera.position);
    this.camera.updateProjectionMatrix();
    this.closeness = this.camera.position.distanceTo(target);
  }

  /**
   * One boom length toward its limit. Coming in: the hard limit snaps (a wall), the soft one eases in fast. Going out:
   * only after the limit has stayed clear for BOOM_HOLD, then slowly. A limit that flickers keeps the boom still.
   */
  private track(cur: number, lim: number, dt: number, k: 'hard' | 'soft'): number {
    if (lim < cur) {
      this.hold[k] = BOOM_HOLD;
      return k === 'hard' ? lim : cur + (lim - cur) * (1 - Math.exp(-dt * 14));
    }
    this.hold[k] -= dt;
    return this.hold[k] > 0 ? cur : cur + (lim - cur) * (1 - Math.exp(-dt * 3));
  }

  /** The session's camera filter without creatures (their bodies are soft limits, not walls). */
  private levelBlocker(ph: PhysicsWorld | null, blocker?: (c: RAPIER.Collider) => boolean): ((c: RAPIER.Collider) => boolean) | undefined {
    if (!ph) return blocker;
    if (!this.lvl || this.lvl.ph !== ph || this.lvl.blocker !== blocker)
      this.lvl = { ph, blocker, fn: (c) => ph.tagOf(c) !== 'enemy' && (blocker ? blocker(c) : true) };
    return this.lvl.fn;
  }

  /**
   * Longest boom (≤ max, in 0.3 m steps) from whose end WAI's head is in clear view. A hit within 0.6 m of the head is
   * the wall WAI leans on, not a blocker. The answer depends on the geometry only, never on this frame's boom length
   * (the old check moved the camera off the boom and fed that back: it sawed between two lengths).
   */
  private sightLimit(ph: PhysicsWorld, level: ((c: RAPIER.Collider) => boolean) | undefined, pivot: THREE.Vector3, back: THREE.Vector3, max: number): number {
    const head = this.smoothed;
    const p = new THREE.Vector3();
    const to = new THREE.Vector3();
    for (let d = max; d > 0.9; d -= 0.3) {
      p.copy(pivot).addScaledVector(back, d);
      to.subVectors(p, head);
      const len = to.length();
      if (len < 1.2) return d;
      to.divideScalar(len);
      const hit = ph.raycast(head, to, len, level);
      if (!hit || hit.dist <= 0.6 || hit.dist >= len - 0.1) return d;
    }
    return Math.min(max, 0.9);
  }

  /**
   * How far above a cine spot the "ground under the camera" probe starts. Outdoors 40 m (over any roof); an
   * interior level (Limp Works, stacked floors) sets ≈1.5 m, or the ceiling above counts as the ground.
   */
  cineProbeUp = 40;

  private solved = new WeakSet<CineShot>();

  /**
   * Blocker for a shot looking at `look`: the level blocks the view, but the SUBJECT itself never
   * does — whatever solid body the look point sits inside (a boss, a building's face) is skipped,
   * otherwise the sweep "hits" the subject at once and drags the camera inside it (black screen).
   */
  private cineBlocker(look: THREE.Vector3): ((c: RAPIER.Collider) => boolean) | undefined {
    const ph = this.lastPhysics;
    const base = this.lastBlocker;
    if (!ph) return base;
    const skip = new Set<number>();
    ph.world.intersectionsWithPoint({ x: look.x, y: look.y, z: look.z }, (c) => {
      skip.add(c.handle);
      const b = c.parent();
      if (b) for (let i = 0; i < b.numColliders(); i++) skip.add(b.collider(i).handle);
      return true;
    });
    if (!skip.size) return base;
    return (c) => !skip.has(c.handle) && (base ? base(c) : true);
  }
  /** Shots the planner found a clear spot for (no per-frame pull-in needed). */
  private clearShots = new WeakSet<CineShot>();

  /** Is this camera spot usable: above the ground/roofs under it, and with a clear view of `look`? */
  private shotClear(pos: THREE.Vector3, look: THREE.Vector3): boolean {
    const ph = this.lastPhysics;
    if (!ph) return true;
    // the top surface under this spot (ground, a platform, a roof): the camera must sit above it
    const top = new THREE.Vector3(pos.x, Math.max(pos.y, look.y) + this.cineProbeUp, pos.z);
    const down = ph.raycast(top, new THREE.Vector3(0, -1, 0), 80, this.lastBlocker);
    if (down && pos.y < down.point.y + 0.45) return false;
    // line of sight from the camera to the subject (the subject may sit on / in a surface: allow a little)
    const to = look.clone().sub(pos);
    const d = to.length();
    if (d < 0.5) return true;
    to.divideScalar(d);
    let inside = false;
    ph.world.intersectionsWithPoint({ x: pos.x, y: pos.y, z: pos.z }, () => {
      inside = true;
      return false;
    });
    if (inside) return false;
    const free = ph.sphereCast(pos, to, d, 0.22, this.cineBlocker(look));
    return free >= d - Math.min(1.2, d * 0.35);
  }

  /**
   * Plan a shot once, when it starts (framing rules: keep the authored distance and lens,
   * stay above ground, keep the subject in clear view). If the authored spot is buried or
   * blocked, swing around the subject and rise until it's clear, instead of pushing the
   * camera into the subject's face every frame.
   */
  private solveShot(sh: CineShot): void {
    if (this.solved.has(sh)) return;
    this.solved.add(sh);
    if (!this.lastPhysics) return;
    const lookEnd = sh.toLook ?? sh.look;
    const ok = (q: THREE.Quaternion, lift: number) => {
      const a = sh.look.clone().add(sh.pos.clone().sub(sh.look).applyQuaternion(q)).add(new THREE.Vector3(0, lift, 0));
      if (!this.shotClear(a, sh.look)) return null;
      let b: THREE.Vector3 | undefined;
      if (sh.toPos) {
        b = lookEnd.clone().add(sh.toPos.clone().sub(lookEnd).applyQuaternion(q)).add(new THREE.Vector3(0, lift, 0));
        if (!this.shotClear(b, lookEnd)) return null;
      }
      return { a, b };
    };
    // framing distance: never closer than ~2.4 m to the subject (a close-up still needs context)
    const MIN = this.cineGameplay ? 0 : 2.4;
    const grow = (p: THREE.Vector3, l: THREE.Vector3) => {
      const o = p.clone().sub(l);
      if (o.length() < MIN) p.copy(l).add(o.lengthSq() > 1e-6 ? o.setLength(MIN) : new THREE.Vector3(0, MIN * 0.5, MIN));
    };
    grow(sh.pos, sh.look);
    if (sh.toPos) grow(sh.toPos, lookEnd);
    const off = sh.pos.clone().sub(sh.look);
    const dist = Math.max(0.5, off.length());
    const side = new THREE.Vector3().crossVectors(off, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const yaws = [0, 0.4, -0.4, 0.85, -0.85, 1.4, -1.4, 2.1, -2.1, Math.PI];
    const tilts = [0, 0.3, 0.6];
    for (const tilt of tilts)
      for (const yaw of yaws) {
        const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw).multiply(new THREE.Quaternion().setFromAxisAngle(side, -tilt));
        // raising the camera = rotating the offset up around the subject; also try a plain lift for low spots
        for (const lift of tilt === 0 ? [0, Math.max(0, 1.2 - off.y)] : [0]) {
          const r = ok(q, lift);
          if (r) {
            this.clearShots.add(sh);
            sh.pos = r.a;
            if (r.b) sh.toPos = r.b;
            return;
          }
        }
      }
    // nothing clear at this distance: a high, wider look down from above the subject
    const high = sh.look.clone().add(new THREE.Vector3(off.x, 0, off.z).setLength(dist * 0.6)).add(new THREE.Vector3(0, dist * 0.9 + 1.5, 0));
    sh.pos = high;
    if (sh.toPos) sh.toPos = high.clone().add(new THREE.Vector3(0, -0.3, 0));
    sh.fov = Math.max(sh.fov ?? 50, 50);
  }

  private applyCine(dt: number): void {
    this.cineT += dt;
    if (this.cine) {
      const c = this.cine;
      const sh = c.shots[c.i];
      if (c.t === 0) this.solveShot(sh);
      c.t += dt;
      const k = ease(Math.min(1, c.t / sh.dur));
      const pos = sh.toPos ? sh.pos.clone().lerp(sh.toPos, k) : sh.pos.clone();
      const look = sh.toLook ? sh.look.clone().lerp(sh.toLook, k) : sh.look.clone();
      // never inside walls: sweep from the subject out to the wanted spot (shots planned clear skip this)
      if (this.lastPhysics && !this.clearShots.has(sh)) {
        const to = pos.clone().sub(look);
        const d = to.length();
        if (d > 0.8) {
          to.divideScalar(d);
          // start the sweep a little off the subject (it often sits on the ground / inside a model)
          const from = look.clone().addScaledVector(to, 0.6);
          const free = 0.6 + this.lastPhysics.sphereCast(from, to, d - 0.6, 0.25, this.cineBlocker(look));
          // last resort only (the shot was planned clear): never closer than 1.6 m
          if (free < d) pos.copy(look).addScaledVector(to, Math.max(Math.min(1.6, d), free - 0.15));
        }
      }
      if (sh.handheld) pos.add(new THREE.Vector3(Math.sin(this.cineT * 1.7) * sh.handheld, Math.sin(this.cineT * 2.3) * sh.handheld * 0.6, 0));
      this.camera.position.copy(pos);
      this.camera.lookAt(look);
      const fov = sh.toFov !== undefined ? THREE.MathUtils.lerp(sh.fov ?? 50, sh.toFov, k) : (sh.fov ?? 50);
      this.camera.fov = fov;
      if (this.shake > 0) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake * 0.1, (Math.random() - 0.5) * this.shake * 0.1, 0));
      if (c.t >= sh.dur) {
        c.i++;
        c.t = 0;
        if (c.i >= c.shots.length) {
          this.cine = null;
          this.ret = { pos: this.camera.position.clone(), quat: this.camera.quaternion.clone(), fov: this.camera.fov, t: 0 };
        }
      }
      return;
    }
    if (this.ret) {
      // glide from the last cinematic pose back to the gameplay camera — unless that straight
      // line would pass through the level (then it's a clean cut, never a trip through a house)
      if (this.ret.t === 0 && this.lastPhysics) {
        const to = this.camera.position.clone().sub(this.ret.pos);
        const d = to.length();
        if (d > 0.5) {
          to.divideScalar(d);
          const free = this.lastPhysics.sphereCast(this.ret.pos, to, d, 0.2, this.lastBlocker);
          if (free < d - 0.3) this.ret = null;
        }
      }
    }
    if (this.ret) {
      this.ret.t += dt / 0.55;
      const k = ease(Math.min(1, this.ret.t));
      this.camera.position.lerpVectors(this.ret.pos, this.camera.position, k);
      this.camera.quaternion.slerpQuaternions(this.ret.quat, this.camera.quaternion.clone(), k);
      this.camera.fov = THREE.MathUtils.lerp(this.ret.fov, this.camera.fov, k);
      if (this.ret.t >= 1) this.ret = null;
    }
  }

  /** Ray through the screen centre. */
  aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return { origin: this.camera.position.clone(), dir };
  }
}
