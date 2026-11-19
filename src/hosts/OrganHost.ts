import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import type { Organ, OrganType } from '../organs/Organ';
import type { PlayerController } from '../player/PlayerController';
import type { EdibleRegistry, Eater } from './Edible';
import { EyeVisual, LegsVisual, MouthVisual, SurfaceConform } from './OrganVisuals';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { t as tr } from '../i18n';

export type HostSize = 'small' | 'medium' | 'large';

export interface HostDef {
  id: string;
  name: string;
  size: HostSize;
  /** Bolted down: legs make it turn (if canTurn) or strain feebly. */
  anchored: boolean;
  canTurn?: boolean;
  /** Ground centre (y = bottom of the object). */
  pos: THREE.Vector3;
  half: THREE.Vector3;
  yaw?: number;
  texture?: string;
  color?: string;
  /** Custom visual (local space, origin at the body centre). */
  build?: () => THREE.Object3D;
  /** Hide the default organ visuals' socket offsets (local, from the body centre). */
  sockets?: Partial<Record<OrganType, THREE.Vector3>>;
  /** Gaze overrides. */
  gaze?: { range?: number; halfAngleDeg?: number; pitch?: number; /** Look sideways from the facing (rad). */ yaw?: number };
  /** Organs this host refuses (with a reason). */
  refuses?: Partial<Record<OrganType, string>>;
  /** Custom reaction lines. */
  lines?: Partial<Record<OrganType, string>>;
  /** No physics body (pure scenery face, e.g. a building wall whose collider exists elsewhere). */
  noCollider?: boolean;
  /** Called whenever the organ set changes. */
  onOrgans?: (host: OrganHost) => void;
  /** Called every step (special logic). */
  onStep?: (host: OrganHost, dt: number) => void;
  /** The host has its own sculpted eye (no sticker eye is shown; animate it in onRender). */
  ownEye?: boolean;
  /** Per-frame visual hook (custom rigs): reaction = the install reaction playing, if any. */
  onRender?: (host: OrganHost, dt: number, info: { reaction: { type: OrganType; t: number } | null; playerHead: THREE.Vector3 }) => void;
}

export interface Gazer {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  range: number;
  cosHalf: number;
  sourceId: string;
}

// scratch (render hot path: no per-frame allocations)
const _m4 = new THREE.Matrix4();
const _v3 = new THREE.Vector3();
const _look = new THREE.Vector2();
const _ray = new THREE.Raycaster();
const _Z = new THREE.Vector3(0, 0, 1);
const _UP = new THREE.Vector3(0, 1, 0);

const SIZE = {
  small: { standLift: 0.25, legLen: 0.42, speed: 4.6, follow: 1.7, mouthR: 0.9, bite: 6, organScale: 0.32, gazeRange: 10, gazeDeg: 26 },
  medium: { standLift: 0.8, legLen: 1.0, speed: 3.4, follow: 2.8, mouthR: 1.5, bite: 22, organScale: 0.55, gazeRange: 18, gazeDeg: 22 },
  large: { standLift: 0, legLen: 1.6, speed: 0, follow: 0, mouthR: 2.8, bite: 45, organScale: 1.4, gazeRange: 70, gazeDeg: 7 },
};

/**
 * Any prop that can receive organs. Behaviours are generic and derived from
 * (size, anchored, organs present), so combinations emerge:
 *   LEG   → walk/follow/ride (movable) · turn to face WAI (anchored+canTurn) · strain (anchored)
 *   EYE   → a gaze cone that keeps undrawn geometry real
 *   MOUTH → eats edibles and bites enemies in front of it
 * Nothing ever "does nothing": every attach plays a reaction.
 */
export class OrganHost {
  readonly id: string;
  readonly def: HostDef;
  readonly organs = new Map<OrganType, Organ>();
  /** Organs the host painted for itself (awakened faces) — not WAI's stickers. */
  readonly permanent = new Set<OrganType>();
  readonly body: RAPIER.RigidBody | null = null;
  readonly collider: RAPIER.Collider | null = null;
  private legCollider: RAPIER.Collider | null = null;
  private cc: RAPIER.KinematicCharacterController | null = null;

  readonly pos = new THREE.Vector3(); // ground centre
  private prevPos = new THREE.Vector3();
  yaw: number;
  private prevYaw: number;
  lift = 0;
  private prevLift = 0;
  private vy = 0;
  readonly delta = new THREE.Vector3();
  deltaYaw = 0;
  mode: 'follow' | 'stay' = 'follow';
  playerOnTop = false;
  /** The rider's drive input (set by the session). */
  readonly driveWish = new THREE.Vector3();
  readonly home: THREE.Vector3;
  private homeYaw: number;

  readonly root = new THREE.Group();
  readonly bodyGroup = new THREE.Group();
  private eye: EyeVisual | null = null;
  private mouth: MouthVisual | null = null;
  private legs: LegsVisual | null = null;
  private legGrow = 0;
  private legWalk = 0;
  /** Anchored hosts: where the legs come out (hip height above the ground, distance out along the facing). */
  private legHip = new THREE.Vector2(0.4, -1);
  /** Eye behaviour: idle wander / glances / tracking WAI. */
  private gazeT = 0;
  private gazeOff = new THREE.Vector2();
  private glance = 0;
  private eatTimer = 0;
  private biteCd = 0;
  private hungryTimer = -1;
  private ateSomething = false;
  private stepSound = 0;
  private focusRing: THREE.Mesh;
  private gazeCone: THREE.Group | null = null;
  private t = Math.random() * 10;
  /** Extra per-host state for special logic. */
  data: Record<string, unknown> = {};
  /** Install reaction (every organ visibly does something the moment it lands). */
  private reaction: { type: OrganType; t: number; beats: number } | null = null;
  private jelly = 0;
  private jellyV = 0;
  private hop = 0;
  private hopV = 0;
  /** Set false for silent grants (level setup). */
  cinematic = true;
  /** Held over WAI's head / flying through the air (physics off, position driven by the ThrowSystem). */
  carried = false;

  /** Small/medium loose props can be picked up and thrown (Zelda-style). */
  get liftable(): boolean {
    return !this.def.anchored && !this.def.noCollider && this.def.size !== 'large' && !this.playerOnTop;
  }

  setCarried(on: boolean): void {
    this.carried = on;
    this.collider?.setEnabled(!on);
    this.legCollider?.setEnabled(!on);
    this.vy = 0;
    this.lift = 0;
  }

  /** Drive the prop while carried/flying (pos = bottom centre). */
  holdAt(p: THREE.Vector3, yaw: number): void {
    this.pos.copy(p);
    this.yaw = yaw;
  }

  constructor(
    private ctx: GameContext,
    def: HostDef,
    private player: PlayerController,
    private edibles: EdibleRegistry,
  ) {
    this.def = def;
    this.id = def.id;
    this.pos.copy(def.pos);
    this.prevPos.copy(def.pos);
    this.home = def.pos.clone();
    this.yaw = this.prevYaw = this.homeYaw = def.yaw ?? 0;

    if (!def.noCollider) {
      const w = ctx.physics.world;
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      this.body = w.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(def.pos.x, def.pos.y + def.half.y, def.pos.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
      );
      this.collider = w.createCollider(RAPIER.ColliderDesc.cuboid(def.half.x, def.half.y, def.half.z).setFriction(1), this.body);
      ctx.physics.tag(this.collider, 'host', this);
      if (!def.anchored) {
        const sl = SIZE[def.size].standLift;
        if (sl > 0) {
          this.legCollider = w.createCollider(
            RAPIER.ColliderDesc.cuboid(def.half.x * 0.98, sl / 2, def.half.z * 0.98).setTranslation(0, -def.half.y - sl / 2, 0),
            this.body,
          );
          ctx.physics.tag(this.legCollider, 'host', this);
        }
        this.cc = w.createCharacterController(0.02);
        this.cc.enableSnapToGround(0.3);
        this.cc.enableAutostep(0.25, 0.2, false);
        this.cc.setSlideEnabled(true);
      }
    }

    // visual body
    const vis = def.build
      ? def.build()
      : def.noCollider
        ? new THREE.Group() // the building itself is the body
        : paintedMesh(
          wonkyBox(def.half.x * 2, def.half.y * 2, def.half.z * 2, 0.03, Math.floor(def.pos.x * 13 + def.pos.z * 7)),
          toon({ map: def.texture ? ctx.assets.tex(def.texture) : null, color: def.color ?? '#ffffff' }),
          0.035,
        );
    this.bodyGroup.add(vis);
    this.root.add(this.bodyGroup);
    this.root.userData.paintDynamic = true;
    this.focusRing = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.05, 32),
      new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.focusRing.rotation.x = -Math.PI / 2;
    this.focusRing.scale.setScalar(Math.max(def.half.x, def.half.z) + 0.3);
    this.root.add(this.focusRing);
    ctx.root.add(this.root);
    this.syncVisual(1);
  }

  get size(): HostSize {
    return this.def.size;
  }
  has(t: OrganType): boolean {
    return this.organs.has(t) || this.permanent.has(t);
  }
  /** Was this organ lent by WAI (vs. painted by the host itself)? */
  lent(t: OrganType): Organ | undefined {
    return this.organs.get(t);
  }
  get movable(): boolean {
    return !this.def.anchored && !!this.body;
  }
  get walking(): boolean {
    return this.movable && this.has('LEG');
  }
  /** Can be ridden & steered. */
  get drivable(): boolean {
    return this.walking && this.def.size !== 'small';
  }
  get top(): number {
    return this.pos.y + this.lift + this.def.half.y * 2;
  }
  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  /** World position of a socket. */
  socketWorld(t: OrganType): THREE.Vector3 {
    const h = this.def.half;
    const local =
      this.def.sockets?.[t]?.clone() ??
      (t === 'EYE' ? new THREE.Vector3(0, h.y * 0.5, h.z + 0.02) : t === 'MOUTH' ? new THREE.Vector3(0, -h.y * 0.3, h.z + 0.02) : new THREE.Vector3(0, -h.y, 0));
    local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return local.add(new THREE.Vector3(this.pos.x, this.pos.y + this.lift + h.y, this.pos.z));
  }
  /** Centre for interaction range checks. */
  center(): THREE.Vector3 {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.lift + this.def.half.y, this.pos.z);
  }
  /** Closest point on the host box to p (horizontal), for range checks on big walls. */
  closestPoint(p: THREE.Vector3): THREE.Vector3 {
    const local = p.clone().sub(this.center()).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    const h = this.def.half;
    local.set(THREE.MathUtils.clamp(local.x, -h.x, h.x), THREE.MathUtils.clamp(local.y, -h.y, h.y), THREE.MathUtils.clamp(local.z, -h.z, h.z));
    return local.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw).add(this.center());
  }

  // ---------------- organs ----------------
  canAccept(o: Organ): string | null {
    if (this.has(o.type)) return tr('The {host} already has one', { host: tr(this.def.name) });
    const r = this.def.refuses?.[o.type];
    return r ? tr(r) : null;
  }

  attach(o: Organ): void {
    this.organs.set(o.type, o);
    this.ensureVisual(o.type);
    this.react(o.type);
    this.startReaction(o.type);
    this.def.onOrgans?.(this);
  }

  /**
   * The moment an organ lands: the object comes alive. Body jolts (squash →
   * stretch), the organ pops in with overshoot, then an organ-specific beat:
   * EYE looks around and finds WAI · MOUTH chomps three times · LEG hops and
   * stomps. Big hosts get a camera close-up (and a reverse shot along their gaze).
   */
  startReaction(t: OrganType): void {
    this.reaction = { type: t, t: 0, beats: 0 };
    const big = this.def.size === 'large';
    this.jellyV -= big ? 2.2 : 5.5; // squash first
    this.ctx.effects.burst(this.socketWorld(t), t === 'EYE' ? '#ffe27a' : t === 'MOUTH' ? '#ff4fa3' : '#22c4c0', big ? 30 : 16, big ? 5 : 3, big ? 0.09 : 0.06);
    this.ctx.audio.play('pop', { pos: this.socketWorld(t), pitch: big ? 0.6 : 1.2 });
    if (big) this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.5);
    if (big && this.cinematic) this.closeUp(t);
  }

  private closeUp(t: OrganType): void {
    const sock = this.socketWorld(t);
    const fwd = this.forward();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    // frame the ORGAN (not the whole building): a few metres out, never inside walls
    const sz = THREE.MathUtils.clamp(Math.min(this.def.half.x, this.def.half.y), 1.4, 3);
    const safe = (dir: THREE.Vector3, dist: number) => {
      const d = dir.clone().normalize();
      const own = this.collider?.handle;
      const free = this.ctx.physics.sphereCast(sock, d, dist, 0.35, (c) => c.handle !== own && this.ctx.physics.tagOf(c) !== 'player' && this.ctx.physics.tagOf(c) !== 'host');
      return sock.clone().addScaledVector(d, Math.max(0.8, Math.min(dist, free - 0.3)));
    };
    const hero = this.def.ownEye ? 1.35 : 1;
    const d0 = fwd.clone().multiplyScalar(2.6 * hero).addScaledVector(side, this.def.ownEye ? 0.55 : 1.1).add(new THREE.Vector3(0, -0.55 * hero, 0));
    const d1 = fwd.clone().multiplyScalar(1.9 * hero).addScaledVector(side, this.def.ownEye ? 0.3 : 0.6).add(new THREE.Vector3(0, -0.35 * hero, 0));
    const shots: import('../render/CameraController').CineShot[] = [
      {
        // three-quarter close-up, slow push in
        pos: safe(d0, d0.length() * sz),
        toPos: safe(d1, d1.length() * sz),
        look: sock.clone(),
        dur: this.def.ownEye ? 2.6 : 1.5,
        fov: 42,
        toFov: 34,
        handheld: 0.03,
      },
    ];
    if (t === 'EYE' && !this.def.noCollider && !this.def.ownEye) {
      // over-the-shoulder reverse: look where the new eye looks
      const pitch = this.def.gaze?.pitch ?? 0;
      const gaze = fwd.clone().applyAxisAngle(side, pitch).normalize();
      const behind = sock.clone().addScaledVector(fwd, -sz * 1.4).addScaledVector(side, sz * 0.9).add(new THREE.Vector3(0, sz * 0.5, 0));
      shots.push({ pos: behind, look: sock.clone().addScaledVector(gaze, 14), toLook: sock.clone().addScaledVector(gaze, 24), dur: 1.3, fov: 50, toFov: 46, handheld: 0.02 });
    }
    this.ctx.camera.playCine(shots);
  }

  private animateReaction(dt: number, playerHead: THREE.Vector3): THREE.Vector2 | null {
    // body springs (always settle)
    this.jellyV += (-this.jelly * 140 - this.jellyV * 9) * dt;
    this.jelly = THREE.MathUtils.clamp(this.jelly + this.jellyV * dt, -0.35, 0.35);
    this.hopV -= 22 * dt;
    this.hop = Math.max(0, this.hop + this.hopV * dt);
    if (this.hop === 0 && this.hopV < 0) this.hopV = 0;
    const big = this.def.size === 'large';
    const amp = big ? 0.25 : 1;
    this.bodyGroup.scale.set(1 + this.jelly * 0.5 * amp, 1 - this.jelly * amp, 1 + this.jelly * 0.5 * amp);
    this.bodyGroup.position.y += this.hop;
    const r = this.reaction;
    if (!r) return null;
    r.t += dt;
    // ease-out-back: grows past full size, then settles
    const pop = (x: number) => Math.max(0.001, 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2));
    const k = pop(Math.min(1, r.t / 0.35));
    let look: THREE.Vector2 | null = null;
    if (r.type === 'EYE' && this.eye) {
      this.eye.root.scale.setScalar(this.eye.baseScale * k);
      if (r.t < 0.35) this.eye.blink();
      this.eye.wide = r.t < 1.3 ? 1 : Math.max(0, 1 - (r.t - 1.3) * 2);
      if (r.t > 0.4 && r.t < 1.3) look = _look.set(Math.sin((r.t - 0.4) * 7) * 0.9, 0.15 * Math.sin((r.t - 0.4) * 3));
      else if (r.t >= 1.3 && r.t < 2.4) {
        const sw = this.socketWorld('EYE');
        if (!this.eyeLocal(playerHead, _look)) _look.set(0, 0);
        look = _look.set(THREE.MathUtils.clamp(_look.x / 0.48, -1, 1), THREE.MathUtils.clamp(_look.y / 0.34, -1, 1));
        if (r.beats === 0) {
          r.beats = 1;
          this.eye.blink();
          this.jellyV += big ? 1 : 3;
          this.ctx.audio.play('blink', { pos: sw });
        }
      }
    } else if (r.type === 'MOUTH' && this.mouth) {
      this.mouth.root.scale.setScalar(this.mouth.baseScale * k);
      const chomps = [0.3, 0.65, 1.0];
      if (r.beats < 3 && r.t >= chomps[r.beats]) {
        {
          r.beats++;
          this.mouth.chomp();
          this.jellyV -= big ? 1.5 : 4;
          this.ctx.audio.play('jawSnap', { pos: this.socketWorld('MOUTH'), pitch: 0.9 + r.beats * 0.12 });
        }
      }
      if (r.beats === 3 && r.t > 1.4) {
        r.beats = 4;
        this.ctx.audio.play('burp', { pos: this.socketWorld('MOUTH'), vol: 0.6 });
      }
    } else if (r.type === 'LEG') {
      const movable = this.movable;
      if (r.beats === 0 && r.t > 0.35) {
        r.beats = 1;
        if (movable) this.hopV = 5.5; // springs up on its new legs
        this.jellyV += big ? 2 : 5;
        this.ctx.audio.play('shuffle', { pos: this.center() });
      }
      for (const [i, at] of [[2, 0.95], [3, 1.3]] as const) {
        if (r.beats === i - 1 && r.t > at) {
          r.beats = i;
          this.jellyV -= big ? 1.6 : 3.5;
          this.ctx.effects.ring(this.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), '#ffffff', Math.max(1.5, this.def.half.x * 3));
          this.ctx.audio.play('stomp', { pos: this.pos, vol: big ? 0.9 : 0.5, pitch: big ? 0.7 : 1.3 });
          if (big || this.def.size === 'medium') this.ctx.camera.shake = Math.max(this.ctx.camera.shake, big ? 0.45 : 0.2);
        }
      }
    }
    if (r.t > 2.6) {
      this.reaction = null;
      if (this.eye) {
        this.eye.wide = 0;
        this.eye.root.scale.setScalar(this.eye.baseScale);
      }
      if (this.mouth) this.mouth.root.scale.setScalar(this.mouth.baseScale);
    }
    return look;
  }

  /** The host keeps its own copy of an organ forever (after waking up). */
  grantPermanent(t: OrganType): void {
    this.permanent.add(t);
    this.ensureVisual(t);
    // (a wake usually follows an attach whose reaction is still playing)
    if (this.cinematic && !this.reaction) this.startReaction(t);
  }

  private ensureVisual(t: OrganType): void {
    if ((t === 'EYE' && this.eye) || (t === 'MOUTH' && this.mouth) || (t === 'LEG' && this.legs)) return;
    const s = SIZE[this.def.size];
    const h = this.def.half;
    const large = this.def.size === 'large';
    const sf = large ? Math.min(3, Math.max(1, h.y * 0.45)) : s.organScale * Math.max(0.7, Math.min(1.6, h.y * 2));
    if (t === 'EYE') {
      // sized to the face it sits on (a lamp's eye is not a crate's eye)
      const want = large ? sf : Math.min(h.x * 2 * 0.55, h.y * 2 * 0.5, 0.75) / (2 * EyeVisual.HALF_W);
      this.eye = new EyeVisual(want);
      if (!this.def.ownEye) {
        const fit = this.placeSticker('EYE', this.eye.root, EyeVisual.HALF_W, EyeVisual.HALF_H, want);
        this.eye.setConform(fit.conform);
        this.eye.root.scale.setScalar(fit.scale);
        this.eye.baseScale = fit.scale;
        this.bodyGroup.add(this.eye.root);
      }
      // faint cone showing what the eye keeps "drawn" (fades in away from the eye: no haze on the sticker)
      const range = Math.min(this.def.gaze?.range ?? s.gazeRange, 22);
      const deg = this.def.gaze?.halfAngleDeg ?? s.gazeDeg;
      const geo = new THREE.ConeGeometry(Math.tan((deg * Math.PI) / 180) * range, range, 24, 8, true);
      const gp = geo.attributes.position as THREE.BufferAttribute;
      const col = new Float32Array(gp.count * 4);
      for (let i = 0; i < gp.count; i++) {
        const f = (range / 2 - gp.getY(i)) / range; // 0 at the eye, 1 at the far end
        const a = THREE.MathUtils.smoothstep(f, 0.15, 0.5) * (1 - THREE.MathUtils.smoothstep(f, 0.7, 1));
        col.set([1, 0.95, 0.69, a * 0.055], i * 4);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
      const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      cone.rotation.x = -Math.PI / 2 + (this.def.gaze?.pitch ?? 0);
      cone.position.z = range / 2;
      cone.position.y = -Math.sin(this.def.gaze?.pitch ?? 0) * range * 0.5;
      this.gazeCone = new THREE.Group();
      this.gazeCone.add(cone);
      this.root.add(this.gazeCone);
    } else if (t === 'MOUTH') {
      const want = large ? sf : Math.min(h.x * 2 * 0.6, h.y * 2 * 0.75, 0.95) / (2 * MouthVisual.HALF_W);
      this.mouth = new MouthVisual(want);
      const fit = this.placeSticker('MOUTH', this.mouth.root, MouthVisual.HALF_W, MouthVisual.HALF_H, want);
      this.mouth.setConform(fit.conform);
      this.mouth.root.scale.setScalar(fit.scale);
      this.mouth.baseScale = fit.scale;
      this.bodyGroup.add(this.mouth.root);
      this.hungryTimer = 3.5;
      this.ateSomething = false;
    } else {
      const len = this.def.anchored ? Math.min(1.2, h.y) : s.legLen;
      this.legs = new LegsVisual(len, Math.max(0.12, h.x * 0.55), Math.max(0.05, len * 0.11));
      // half a stride per π of phase (phase advances PHASE_PER_M per metre): planted feet never slide
      this.legs.stride = Math.PI / (2 * (this.def.size === 'small' ? 14 : 5.5));
      this.legs.padsFaceFront = this.def.anchored;
      if (this.def.anchored && this.def.size !== 'large') {
        // stand on them: hips high enough for the feet to reach the ground, stuck on the front surface
        const th = Math.max(0.05, len * 0.11);
        // turning hosts stand on them; bolted ones squat and kick
        const hipY = Math.min(h.y * 2 * 0.8, th * 1.9 + len * (this.def.canTurn ? 0.82 : 0.5));
        this.legHip.set(hipY, this.frontSurfaceZ(hipY - h.y) ?? h.z * 0.9);
      }
      this.legGrow = 0;
      this.root.add(this.legs.root);
      this.mode = 'follow';
    }
  }

  /** z (bodyGroup local) of the host's front surface at local height y, by a ray against its own meshes. */
  private frontSurfaceZ(y: number): number | null {
    const meshes: THREE.Mesh[] = [];
    this.bodyGroup.traverse((o) => {
      if (o.userData.organVisual) return;
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline && m.visible) meshes.push(m);
    });
    if (!meshes.length) return null;
    const keep = this.bodyGroup.scale.clone();
    this.bodyGroup.scale.set(1, 1, 1);
    this.bodyGroup.updateWorldMatrix(true, true);
    const M = this.bodyGroup.matrixWorld;
    const o = new THREE.Vector3(0, y, this.def.half.z + 2).applyMatrix4(M);
    const d = new THREE.Vector3(0, 0, -1).transformDirection(M);
    _ray.set(o, d);
    _ray.far = this.def.half.z * 2 + 4;
    const hit = _ray.intersectObjects(meshes, false)[0];
    const z = hit ? hit.point.clone().applyMatrix4(M.clone().invert()).z : null;
    this.bodyGroup.scale.copy(keep);
    this.bodyGroup.updateWorldMatrix(false, true);
    return z;
  }

  /**
   * Stick an organ ON the host's real surface: cast from the socket back
   * along the host's facing onto its own visual meshes, orient to the surface
   * normal, shrink until the sticker fits the face, and sample the surface
   * relief under it (curved bulbs, poles, basins) so it hugs instead of
   * floating or sinking. Sets obj's local transform (bodyGroup space).
   */
  private placeSticker(t: OrganType, obj: THREE.Object3D, halfW: number, halfH: number, want: number): { scale: number; conform: SurfaceConform | null } {
    const h = this.def.half;
    const sock =
      this.def.sockets?.[t]?.clone() ??
      (t === 'EYE' ? new THREE.Vector3(0, h.y * 0.5, h.z + 0.02) : new THREE.Vector3(0, -h.y * 0.3, h.z + 0.02));
    obj.position.copy(sock);
    obj.quaternion.identity();
    const meshes: THREE.Mesh[] = [];
    this.bodyGroup.traverse((o) => {
      if (o.userData.organVisual) return;
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isOutline || !m.visible) return;
      const mat = m.material as THREE.Material;
      if (mat && mat.transparent && (mat as THREE.MeshBasicMaterial).opacity < 0.5) return;
      meshes.push(m);
    });
    obj.userData.organVisual = true;
    if (!meshes.length) return { scale: want, conform: null };
    const keepScale = this.bodyGroup.scale.clone();
    this.bodyGroup.scale.set(1, 1, 1);
    this.bodyGroup.updateWorldMatrix(true, true);
    const M = this.bodyGroup.matrixWorld.clone();
    const Mi = M.clone().invert();
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    const cast = (origin: THREE.Vector3, dir: THREE.Vector3, far: number) => {
      o.copy(origin).applyMatrix4(M);
      d.copy(dir).transformDirection(M);
      _ray.set(o, d);
      _ray.far = far;
      const hit = _ray.intersectObjects(meshes, false).find((x) => !!x.face);
      if (!hit) return null;
      const n = hit.face!.normal.clone().transformDirection(hit.object.matrixWorld).transformDirection(Mi);
      if (n.dot(dir) > 0) n.negate();
      return { dist: hit.distance, point: hit.point.clone().applyMatrix4(Mi), normal: n };
    };
    // candidate spots around the socket: keep the one where the sticker sits best (most rim on the surface)
    const frame = (c: { point: THREE.Vector3; normal: THREE.Vector3 }) => {
      const N = c.normal.clone().lerp(_Z, 0.25).normalize();
      const X = new THREE.Vector3().crossVectors(_UP, N).normalize();
      return { N, X, Y: new THREE.Vector3().crossVectors(N, X) };
    };
    const misfit = (c: { point: THREE.Vector3; normal: THREE.Vector3 }, scale: number) => {
      const { N, X, Y } = frame(c);
      let bad = 0;
      let rim = 0;
      const back = Math.max(halfW, halfH) * scale + 0.3;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const gx = Math.cos(a) * halfW * 0.9;
        const gy = Math.sin(a) * halfH * 0.9;
        const org = c.point.clone().addScaledVector(X, gx * scale).addScaledVector(Y, gy * scale).addScaledVector(N, back);
        const hit = cast(org, N.clone().negate(), back * 2 + 0.6);
        rim++;
        if (!hit || Math.abs((back - hit.dist) / scale) > 0.35) bad++;
      }
      return bad / rim;
    };
    let center: { point: THREE.Vector3; normal: THREE.Vector3 } | null = null;
    let best = Infinity;
    for (let k = 0; k < 11; k++) {
      const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.06;
      const hit = cast(sock.clone().add(new THREE.Vector3(0, dy, 1.6)), new THREE.Vector3(0, 0, -1), 3.4);
      if (!hit || hit.normal.z <= 0.35) continue;
      const score = misfit(hit, want) + Math.abs(dy) * 0.8;
      if (score < best) {
        best = score;
        center = hit;
      }
      if (score === 0) break;
    }
    let result: { scale: number; conform: SurfaceConform | null } = { scale: want, conform: null };
    if (center) {
      const { N, X, Y } = frame(center);
      obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, N));
      obj.position.copy(center.point).addScaledVector(N, 0.004);
      // shrink until the sticker's rim is mostly on the surface; then sample its relief
      const n = 7;
      const E = Math.max(halfW, halfH) * 1.05;
      let scale = want;
      for (let iter = 0; iter < 5; iter++) {
        const z = new Float32Array(n * n);
        let bad = 0;
        let rim = 0;
        let lo = 0;
        const back = E * scale + 0.3;
        for (let iy = 0; iy < n; iy++)
          for (let ix = 0; ix < n; ix++) {
            const gx = (-1 + (2 * ix) / (n - 1)) * E;
            const gy = (-1 + (2 * iy) / (n - 1)) * E;
            const org = center.point.clone().addScaledVector(X, gx * scale).addScaledVector(Y, gy * scale).addScaledVector(N, back);
            const hit = cast(org, N.clone().negate(), back * 2 + 0.6);
            const depth = hit ? (back - hit.dist) / scale : NaN;
            z[iy * n + ix] = depth;
            const e = (gx / halfW) ** 2 + (gy / halfH) ** 2;
            if (e <= 1.15 && e >= 0.35) {
              rim++;
              if (!hit || Math.abs(depth) > 0.35) bad++;
            }
            if (hit) lo = Math.min(lo, depth);
          }
        // off the edge of a pole/bulb: keep curving away (the vinyl wraps round), don't float flat
        for (let iy = 0; iy < n; iy++)
          for (const dir of [1, -1]) {
            const mid = (n - 1) / 2;
            for (let ix = mid + dir; ix >= 0 && ix < n; ix += dir) {
              const i = iy * n + ix;
              if (!Number.isNaN(z[i])) continue;
              const a = z[iy * n + ix - dir];
              const b = ix - 2 * dir >= 0 && ix - 2 * dir < n ? z[iy * n + ix - 2 * dir] : a;
              z[i] = Number.isNaN(a) ? NaN : a + Math.min(-0.05, (a - (Number.isNaN(b) ? a : b)) * 1.6);
            }
          }
        let maxAbs = 0;
        for (let i = 0; i < z.length; i++) {
          if (Number.isNaN(z[i])) z[i] = lo;
          z[i] = THREE.MathUtils.clamp(z[i], -0.8, 0.25);
          maxAbs = Math.max(maxAbs, Math.abs(z[i]));
        }
        result = { scale, conform: maxAbs > 0.012 ? new SurfaceConform(n, E, z) : null };
        if (bad / Math.max(1, rim) <= 0.25 || iter === 2) break;
        scale *= 0.84;
      }
    }
    this.bodyGroup.scale.copy(keepScale);
    this.bodyGroup.updateWorldMatrix(false, true);
    return result;
  }

  detach(t: OrganType): Organ | null {
    const o = this.organs.get(t) ?? null;
    if (!o) return null;
    this.organs.delete(t);
    if (this.permanent.has(t)) {
      this.def.onOrgans?.(this);
      return o;
    }
    if (t === 'EYE' && this.eye) {
      this.eye.root.removeFromParent();
      this.eye = null;
      if (this.gazeCone) this.root.remove(this.gazeCone);
      this.gazeCone = null;
    } else if (t === 'MOUTH' && this.mouth) {
      this.mouth.root.removeFromParent();
      this.mouth = null;
    } else if (t === 'LEG' && this.legs) {
      this.root.remove(this.legs.root);
      this.legs = null;
    }
    this.def.onOrgans?.(this);
    return o;
  }

  /** Recall is unsafe if WAI is riding a walking host that would collapse. */
  canRecall(t: OrganType): string | null {
    if (t === 'LEG' && this.playerOnTop && this.lift > 0.05) return tr("Not while you're riding it — jump off first!");
    return null;
  }

  /** `text` is the English source (i18n key); `{host}` is filled with this host's name. */
  private say(text: string, sfx?: import('../audio/Sfx').SfxName): void {
    const line = tr(text, { host: tr(this.def.name) });
    this.ctx.events.emit('host:reaction', { hostId: this.id, text: line });
    this.mouth?.talk(Math.min(2.4, 0.5 + line.length * 0.035));
    if (sfx) this.ctx.audio.play(sfx, { pos: this.center() });
  }

  private react(t: OrganType): void {
    const custom = this.def.lines?.[t];
    if (custom) {
      this.say(custom, t === 'LEG' ? 'shuffle' : t === 'EYE' ? 'blink' : 'jawSnap');
      return;
    }
    if (t === 'LEG') {
      if (this.movable) this.say(this.drivable ? 'The {host} trots after you! Stand on it to ride · E: stay/follow' : 'The {host} follows you like a puppy.', 'shuffle');
      else if (this.def.canTurn) this.say('The {host} can turn now — it watches where you go.', 'shuffle');
      else this.say('The {host} kicks its little legs… far too heavy to walk.', 'sigh');
    } else if (t === 'EYE') {
      this.say(this.def.size === 'large' ? 'The {host} opens a huge eye. Its gaze reaches far…' : 'The {host} blinks at you.', 'blink');
    } else {
      this.say('The {host} is hungry.', 'jawSnap');
    }
  }

  // ---------------- gaze ----------------
  gazer(): Gazer | null {
    if (!this.eye) return null;
    const s = SIZE[this.def.size];
    const range = this.def.gaze?.range ?? s.gazeRange;
    const deg = this.def.gaze?.halfAngleDeg ?? s.gazeDeg;
    const pitch = this.def.gaze?.pitch ?? 0;
    const f = this.forward().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.def.gaze?.yaw ?? 0);
    const dir = new THREE.Vector3(f.x * Math.cos(pitch), -Math.sin(pitch), f.z * Math.cos(pitch)).normalize();
    return { origin: this.socketWorld('EYE'), dir, range, cosHalf: Math.cos((deg * Math.PI) / 180), sourceId: this.id };
  }

  // ---------------- simulation ----------------
  /** Before the player step: compute movement & schedule the kinematic move. */
  preStep(dt: number, enemiesNear: (p: THREE.Vector3, r: number) => import('../combat/Damage').Damageable[]): void {
    this.prevPos.copy(this.pos);
    this.prevYaw = this.yaw;
    this.prevLift = this.lift;
    this.delta.set(0, 0, 0);
    this.deltaYaw = 0;
    this.t += dt;
    if (this.carried) {
      this.scheduleMove();
      return;
    }
    if (this.legs) this.legGrow = Math.min(1, this.legGrow + dt * 2.5);
    this.def.onStep?.(this, dt);

    // ---- mouth ----
    if (this.mouth) this.mouthStep(dt, enemiesNear);

    if (!this.body) return;

    // ---- legs on anchored hosts: turn to face WAI ----
    if (this.def.anchored) {
      if (this.has('LEG') && this.def.canTurn) {
        const d = this.player.pos.clone().sub(this.pos);
        const want = Math.atan2(d.x, d.z);
        let dy = want - this.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        const turn = THREE.MathUtils.clamp(dy, -1.2 * dt, 1.2 * dt);
        this.yaw += turn;
        this.deltaYaw = turn;
        if (this.legs) this.legs.phase += Math.abs(turn) * Math.max(0.6, this.def.half.x + this.def.half.z) * (this.def.size === 'small' ? 14 : 5.5);
        if (Math.abs(turn) > 0.002) {
          this.stepSound -= dt;
          if (this.stepSound <= 0) {
            this.stepSound = 0.5;
            this.ctx.audio.play('shuffle', { pos: this.center(), vol: 0.6 });
          }
        }
      }
      this.scheduleMove();
      return;
    }

    // ---- movable host ----
    const s = SIZE[this.def.size];
    const move = new THREE.Vector3();
    let wantLift = 0;
    if (this.walking) {
      if (this.playerOnTop && this.drivable) {
        // the rider steers
        if (this.driveWish.lengthSq() > 0.01) move.copy(this.driveWish).setY(0).normalize().multiplyScalar(s.speed);
        wantLift = s.standLift;
      } else if (this.mode === 'follow') {
        let target: THREE.Vector3 | null = null;
        // hungry walkers hunt edibles near WAI
        if (this.mouth) {
          const food = this.edibles.near(this.pos, 9, this.def.size as Eater)[0];
          if (food) target = food.position();
        }
        const tp = target ?? this.player.pos;
        const to = tp.clone().sub(this.pos).setY(0);
        const keep = target ? 0.6 : s.follow;
        const dist = to.length();
        if (dist > keep) move.copy(to.divideScalar(dist)).multiplyScalar(s.speed * Math.min(1, (dist - keep) / 1.5 + 0.35));
        wantLift = move.lengthSq() > 0.01 ? s.standLift : 0;
      }
    }
    // stand while ridden at rest too (so the rider stays high)
    if (this.playerOnTop && this.walking) wantLift = s.standLift;
    const dl = THREE.MathUtils.clamp(wantLift - this.lift, -1.3 * dt, 1.3 * dt);
    // only walk once mostly standing
    if (s.standLift > 0 && this.lift < s.standLift * 0.6) move.multiplyScalar(0.0);

    // face the walking direction (rider carried rotationally by the session)
    if (move.lengthSq() > 0.01) {
      const want = Math.atan2(move.x, move.z);
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turn = THREE.MathUtils.clamp(dy, -4 * dt, 4 * dt);
      this.yaw += turn;
      this.deltaYaw = turn;
    }

    // gravity + collide-and-slide (exclude the rider so lifting never pushes into it)
    this.vy = Math.max(-25, this.vy - 24 * dt);
    const desired = { x: move.x * dt, y: this.vy * dt, z: move.z * dt };
    const exclude = new Set<number>([this.collider!.handle]);
    if (this.legCollider) exclude.add(this.legCollider.handle);
    // WAI never shoves props around: their solver ignores him (his own solver stops him at them)
    exclude.add(this.player.collider.handle);
    // resting props without legs don't move at all (no solver = no drift)
    const resting = !this.legs && move.lengthSq() < 1e-4 && dl === 0 && this.vy <= -0.99;
    if (resting) {
      this.vy = -1;
      this.delta.set(0, 0, 0);
    } else if (this.cc && this.collider) {
      this.cc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => !exclude.has(c.handle));
      const mv = this.cc.computedMovement();
      if (this.cc.computedGrounded()) this.vy = -1;
      this.pos.x += mv.x;
      this.pos.z += mv.z;
      this.pos.y += mv.y;
      this.delta.set(mv.x, mv.y + dl, mv.z);
    }
    this.lift += dl;
    // standing on its new legs: the FEET rest on the ground, not the (lifted) body —
    // otherwise gravity drags the body back down and the legs sink into the floor
    if (this.legs && this.lift > 0.02 && !resting) {
      const from = new THREE.Vector3(this.pos.x, this.pos.y + this.lift + 0.4, this.pos.z);
      const hit = this.ctx.physics.raycast(from, new THREE.Vector3(0, -1, 0), this.lift + 2.5, (c) => !exclude.has(c.handle));
      if (hit && hit.point.y > this.pos.y && hit.point.y < this.pos.y + this.lift + 0.45) {
        this.delta.y += hit.point.y - this.pos.y;
        this.pos.y = hit.point.y;
        this.vy = -1;
      }
    }
    if (this.legs && (move.lengthSq() > 0.01 || Math.abs(dl) > 0)) {
      this.legs.phase += Math.hypot(this.delta.x, this.delta.z) * (this.def.size === 'small' ? 14 : 5.5);
      this.stepSound -= Math.hypot(this.delta.x, this.delta.z);
      if (this.stepSound <= 0) {
        this.stepSound = this.def.size === 'small' ? 0.35 : 0.7;
        this.ctx.audio.play('crateStep', { pos: this.center(), vol: this.def.size === 'small' ? 0.4 : 0.8, pitch: this.def.size === 'small' ? 1.6 : 1 });
      }
    }
    // fell out of the world (e.g. walked into the canal): pop back home
    if (this.pos.y < this.home.y - 1.6) {
      this.ctx.effects.burst(this.center(), PAL.turq, 12, 3);
      this.pos.copy(this.home);
      this.prevPos.copy(this.home);
      this.yaw = this.prevYaw = this.homeYaw;
      this.vy = 0;
      this.delta.set(0, 0, 0);
      this.body.setTranslation({ x: this.pos.x, y: this.pos.y + this.def.half.y + this.lift, z: this.pos.z }, true);
      this.say('The {host} fell in and swam back home.', 'pop');
    }
    this.scheduleMove();
  }

  private scheduleMove(): void {
    if (!this.body) return;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + this.def.half.y + this.lift, z: this.pos.z });
    this.body.setNextKinematicRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  }

  private mouthStep(dt: number, enemiesNear: (p: THREE.Vector3, r: number) => import('../combat/Damage').Damageable[]): void {
    const s = SIZE[this.def.size];
    this.eatTimer -= dt;
    this.biteCd = Math.max(0, this.biteCd - dt);
    const zone = this.socketWorld('MOUTH').addScaledVector(this.forward(), s.mouthR * 0.7);
    zone.y = Math.max(zone.y, this.pos.y + 0.4);
    if (this.eatTimer <= 0) {
      this.eatTimer = 0.45;
      const mouthAt = this.socketWorld('MOUTH');
      const food = this.edibles.near(zone, s.mouthR, this.def.size as Eater).find((f) => {
        const to = f.position().clone().sub(mouthAt);
        const d = to.length();
        if (d < 0.3) return true;
        const hit = this.ctx.physics.raycast(mouthAt, to.divideScalar(d), d, (c) => this.ctx.physics.tagOf(c) === 'static');
        // blocked only if a wall sits clearly before the food (rubble is itself static)
        return !hit || hit.dist > d - f.radius - 0.2;
      });
      if (food && food.eat(this.def.size as Eater)) {
        this.mouth!.chomp();
        this.ctx.audio.play('chomp', { pos: zone });
        this.ctx.effects.burst(zone, '#ffb3d1', 8, 2.5);
        this.ateSomething = true;
      }
    }
    if (this.biteCd <= 0) {
      const enemies = enemiesNear(zone, s.mouthR);
      if (enemies.length) {
        this.biteCd = 1.1;
        this.mouth!.chomp();
        this.ctx.audio.play('jawSnap', { pos: zone });
        for (const e of enemies) e.applyDamage({ amount: s.bite, point: zone, dir: this.forward(), collider: null, kind: 'hostBite' });
        this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.2);
        this.ateSomething = true;
      }
    }
    if (this.hungryTimer > 0) {
      this.hungryTimer -= dt;
      if (this.hungryTimer <= 0 && !this.ateSomething) {
        this.say('…the {host} burps. Nothing tasty nearby.', 'burp');
      }
    }
  }

  setFocused(on: boolean): void {
    (this.focusRing.material as THREE.MeshBasicMaterial).opacity = on ? 0.8 : 0;
  }

  /** Direction to a world point as eye angles (yaw right, pitch up) in the sticker eye's frame; false if behind it. */
  private eyeLocal(p: THREE.Vector3, out: THREE.Vector2): boolean {
    if (!this.eye || !this.eye.root.parent) return false;
    _m4.copy(this.eye.root.matrixWorld).invert();
    _v3.copy(p).applyMatrix4(_m4);
    if (_v3.z < 0.05) return false;
    out.set(Math.atan2(_v3.x, _v3.z), Math.atan2(_v3.y, Math.hypot(_v3.x, _v3.z)));
    return true;
  }

  /** Where the sticker eye looks: WAI when he's near and in front, else its gaze with idle saccades and glances. */
  private eyeBehaviour(dt: number, playerHead: THREE.Vector3): void {
    const eye = this.eye!;
    const large = this.def.size === 'large';
    const baseYaw = 0;
    const basePitch = -(this.def.gaze?.pitch ?? 0) * (large ? 1 : 0.5);
    this.gazeT -= dt;
    this.glance = Math.max(0, this.glance - dt);
    if (this.gazeT <= 0) {
      this.gazeT = 0.7 + Math.random() * 2.2;
      if (!large && Math.random() < 0.18) {
        this.glance = 0.6 + Math.random() * 0.6;
        this.gazeOff.set((Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.2), (Math.random() - 0.4) * 0.25);
      } else this.gazeOff.set((Math.random() - 0.5) * 0.22, (Math.random() - 0.5) * 0.12);
    }
    const near = eye.root.parent ? playerHead.distanceTo(eye.root.getWorldPosition(_v3)) : 99;
    const tracking = near < (large ? 10 : 14) && this.glance === 0 && this.eyeLocal(playerHead, _look);
    if (tracking) eye.setLook(_look.x + this.gazeOff.x * 0.25, _look.y + this.gazeOff.y * 0.25);
    else eye.setLook(baseYaw + this.gazeOff.x * (large ? 0.6 : 1), basePitch + this.gazeOff.y);
    // a sudden close WAI makes small things go wide-eyed for a moment
    if (!this.reaction) eye.wide = Math.max(0, eye.wide - dt * 1.5) + (near < 1.6 ? dt * 3 : 0);
  }

  /** Interpolated visuals + organ animation. */
  render(alpha: number, frameDt: number): void {
    this.syncVisual(alpha);
    const h = this.def.half;
    const playerHead = this.player.renderPos.clone().add(new THREE.Vector3(0, 0.8, 0));
    const reaction = this.reaction ? { type: this.reaction.type, t: this.reaction.t } : null;
    const reactLook = this.animateReaction(frameDt, playerHead);
    this.def.onRender?.(this, frameDt, { reaction, playerHead });
    if (this.eye) {
      // the eye rides on the body (bodyGroup): it squashes, hops and turns with it
      if (reactLook) this.eye.lookAt(reactLook);
      else this.eyeBehaviour(frameDt, playerHead);
      if (this.gazeCone) {
        this.gazeCone.position.copy(this.socketWorld('EYE')).sub(this.root.position);
        this.gazeCone.rotation.set(0, this.yaw + (this.def.gaze?.yaw ?? 0), 0);
      }
      const { blinked } = this.eye.update(frameDt);
      if (blinked && this.def.size === 'small' && Math.random() < 0.3) this.ctx.audio.play('blink', { pos: this.socketWorld('EYE'), vol: 0.4 });
    }
    if (this.mouth) this.mouth.update(frameDt);
    if (this.legs) {
      const walkingNow = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) > 1e-4 || Math.abs(this.yaw - this.prevYaw) > 1e-4;
      this.legWalk += ((walkingNow ? 1 : 0) - this.legWalk) * Math.min(1, frameDt * 8);
      const lift = THREE.MathUtils.lerp(this.prevLift, this.lift, alpha);
      this.legs.root.rotation.y = this.yaw;
      this.legs.root.scale.setScalar(Math.max(0.001, this.legGrow));
      if (this.def.anchored) {
        // legs stick out from the base of big objects, feet on the ground
        const hipY = this.legHip.x;
        this.legs.root.position.set(0, hipY, 0).addScaledVector(this.forward(), this.legHip.y < 0 ? h.z * 0.9 : this.legHip.y + 0.02);
        const anchoredWiggle = !this.def.canTurn ? 1 : 0;
        this.legs.pose(hipY, this.legWalk, anchoredWiggle, 0, 0, frameDt);
      } else {
        this.legs.root.position.set(0, lift, 0);
        const sl = SIZE[this.def.size].standLift;
        // resting on the ground: sits, legs stretched out in front
        const sit = sl > 0 && !this.carried ? 1 - THREE.MathUtils.clamp(lift / (sl * 0.55), 0, 1) : 0;
        this.legs.pose(lift, this.legWalk, this.carried ? 0.6 : 0, sit, h.z * 0.7, frameDt);
      }
    }
  }

  private syncVisual(alpha: number): void {
    const x = THREE.MathUtils.lerp(this.prevPos.x, this.pos.x, alpha);
    const y = THREE.MathUtils.lerp(this.prevPos.y, this.pos.y, alpha);
    const z = THREE.MathUtils.lerp(this.prevPos.z, this.pos.z, alpha);
    let dy = this.yaw - this.prevYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const yaw = this.prevYaw + dy * alpha;
    const lift = THREE.MathUtils.lerp(this.prevLift, this.lift, alpha);
    this.root.position.set(x, y, z);
    this.bodyGroup.position.set(0, this.def.half.y + lift, 0);
    this.bodyGroup.rotation.y = yaw;
    this.focusRing.position.set(0, 0.04, 0);
  }

  /** Is a point (feet) over the top face? (rotation-aware) */
  isOverTop(p: THREE.Vector3, margin = 0.05): boolean {
    const local = p.clone().sub(this.pos).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.yaw);
    return Math.abs(local.x) < this.def.half.x + margin && Math.abs(local.z) < this.def.half.z + margin;
  }

  /** Displacement to apply to a rider at `p` this step (translation + rotation about the host). */
  carryFor(p: THREE.Vector3): THREE.Vector3 {
    const out = this.delta.clone();
    if (Math.abs(this.deltaYaw) > 1e-6) {
      const rel = p.clone().sub(this.prevPos).setY(0);
      const rot = rel.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), this.deltaYaw);
      out.add(rot.sub(rel));
    }
    return out;
  }
}
