/**
 * [INPUT]: depends on RAPIER (KCC) from core/PhysicsWorld; GameContext; Cape; WaiModel; Difficulty (hit damage,
 *          invulnerability, healing share) from meta/Difficulty; PlayBody (the mechanism contract) from ./PlayBody
 * [OUTPUT]: exports PlayerController (WAI's movement, dodge, jet, slam, takeHit, heal, gate; a PlayBody) and the PLAYER tuning
 * [POS]: WAI's gameplay state; WaiModel is the view. Every hit and every heal passes takeHit()/heal(), so the
 *        difficulty scales them here once for all creatures, hazards and pickups. `gate` (PlayerGate, null outside
 *        the souls-like Red Pen fight) may refuse rolls / jumps / sprint (stamina), set the roll's i-frames and recovery,
 *        turn WAI toward a lock-on target and let a sweeping giant pass through him. On a stair's nosing ramp the
 *        model sinks onto the drawn tread (treadBelowRamp); the body stays on the ramp.
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import { Cape, makeCapeTie } from './Cape';
import { t } from '../i18n';
import { WaiModel, type WaiAction } from './WaiModel';
import { Difficulty } from '../meta/Difficulty';
import type { PlayerGate } from './PlayerGate';
import type { PlayBody } from './PlayBody';

export const PLAYER = {
  radius: 0.33,
  halfHeight: 0.2,
  get centerOffset() {
    return this.radius + this.halfHeight;
  },
  walkSpeed: 4.4,
  sprintSpeed: 6.6,
  longLegsSprint: 8.4,
  aimSpeedMul: 0.62,
  gravity: 24,
  jumpHeight: 1.35, // base: can't reach 2.8 m roofs
  longLegsJump: 2.9, // with Leg Sticker worn
  groundAccel: 42,
  airAccel: 16,
  maxHp: 6, // half hearts (3 hearts)
  dodgeSpeed: 10,
  dodgeTime: 0.42,
  dodgeInvuln: 0.34,
  dodgeCooldown: 0.55,
  /** JET HOVER: press Space in mid-air, hold to spray a paint jet downward (once per airtime). */
  jetTime: 1.25,
  jetFall: -0.6,
  /** PAINT SLAM: C in mid-air — a short hang, then a straight dive that splashes paint on landing. */
  slamHang: 0.16,
  slamSpeed: 28,
  slamMinHeight: 0.7,
  slamRecover: 0.28,
};

const UP = new THREE.Vector3(0, 1, 0);
const AX_X = new THREE.Vector3(1, 0, 0);
const _q = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
const _probe = new THREE.Vector3();

/**
 * WAI's kinematic character controller (Rapier KCC). Gameplay state only;
 * WaiModel is the view. Abilities are read from the inventory every step
 * (Long Legs when the Leg Sticker is worn).
 */
export class PlayerController implements PlayBody {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  private cc: RAPIER.KinematicCharacterController;
  readonly model: WaiModel;

  readonly pos = new THREE.Vector3();
  private prevPos = new THREE.Vector3();
  readonly renderPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  vy = 0;
  facing = Math.PI;
  private prevFacing = Math.PI;
  grounded = false;
  private wasGrounded = false;
  justLanded = false;
  groundCollider: RAPIER.Collider | null = null;
  /** The model's drop (m) from a nosing ramp onto the drawn tread under it (view only; the body stays on the ramp). */
  private stairSink = 0;
  private stairSinkTo = 0;
  /** Last position that was safe ground (for respawn after falling in the canal). */
  readonly lastSafe = new THREE.Vector3();

  hp = PLAYER.maxHp;
  invuln = 0;
  private knock = new THREE.Vector3();
  private coyote = 0;
  private jumpBuffer = 0;
  action: WaiAction = 'none';
  actionT = 0;
  private actionDur = 0;
  lockTimer = 0;
  /** Finisher leap: keeps horizontal velocity while locked. */
  private leapT = 0;
  private leapVel = new THREE.Vector3();
  private perfectCd = 0;
  /** Fresh paint under WAI's feet (set by the session) → paint surfing. */
  paintUnder: (() => number) | null = null;
  surfing = false;
  private surfFx = 0;
  private surfSeen = false;
  holdingPurify = false;
  smudged = false;
  frozen = false;
  aiming = false;
  mouthful = false;
  /** Input direction while riding (handed to the host being driven). */
  readonly driveWish = new THREE.Vector3();
  driving = false;
  private dodgeT = 0;
  readonly cape = new Cape();
  private dodgeCd = 0;
  private dodgeDir = new THREE.Vector3();
  private stepAccum = 0;
  private distAccum = 0;
  private fallStartY = 0;
  // --- JET HOVER ---
  jetting = false;
  /** Seconds of jet used this airtime (refills on landing). */
  jetUsed = 0;
  private jetFx = 0;
  private jetPaint = 0;
  /** Session: drain paint for the jet; returns the paint colour, or null when the can is empty. */
  onJet: ((dt: number) => string | null) | null = null;
  // --- PAINT SLAM ---
  /** 0 none · 1 hang (flip) · 2 diving */
  slam = 0;
  private slamT = 0;
  private slamFromY = 0;
  /** Session: the slam landed (paint splash + damage). */
  onSlam: ((at: THREE.Vector3, drop: number) => void) | null = null;
  /** A fight's own rules (src/level/works/SoulsFight); null everywhere else. */
  gate: PlayerGate | null = null;

  constructor(
    private ctx: GameContext,
    spawn: THREE.Vector3,
    spawnYaw: number,
  ) {
    const w = ctx.physics.world;
    const c = spawn.clone().add(new THREE.Vector3(0, PLAYER.centerOffset + 0.02, 0));
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setFriction(0), this.body);
    ctx.physics.tag(this.collider, 'player', this);
    this.cc = w.createCharacterController(0.02);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.cc.enableAutostep(0.55, 0.15, false); // the level's stairs have 0.5 m steps: walk up them, no jumping
    this.cc.enableSnapToGround(0.25);
    this.cc.setApplyImpulsesToDynamicBodies(false);
    this.cc.setSlideEnabled(true);

    this.model = new WaiModel(ctx.assets);
    ctx.root.add(this.model.root);
    ctx.root.add(this.cape.mesh);
    this.model.capeAnchor.add(makeCapeTie());
    this.pos.copy(spawn);
    this.prevPos.copy(spawn);
    this.renderPos.copy(spawn);
    this.lastSafe.copy(spawn);
    this.facing = this.prevFacing = spawnYaw;
  }

  get longLegs(): boolean {
    return this.ctx.inventory.worn('LEG');
  }

  get dodging(): boolean {
    return this.dodgeT > 0;
  }

  private get center(): THREE.Vector3 {
    const t = this.body.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }

  playAction(a: WaiAction, duration: number, lock = 0): void {
    this.action = a;
    this.actionT = 0;
    this.actionDur = duration;
    if (lock > 0) this.lockTimer = Math.max(this.lockTimer, lock);
  }

  faceDir(dir: THREE.Vector3): void {
    if (dir.lengthSq() < 1e-6) return;
    this.facing = Math.atan2(dir.x, dir.z);
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  /** Damage in half hearts. Returns true if it landed. */
  /** Jump toward a direction, covering `dist` metres (TAG finisher). */
  leap(dir: THREE.Vector3, dist: number, vy: number): void {
    this.vy = vy;
    this.grounded = false;
    const air = (2 * vy) / PLAYER.gravity;
    this.leapVel.copy(dir).setY(0).normalize().multiplyScalar(dist / Math.max(0.3, air));
    this.leapT = air;
    this.cape.gust.add(new THREE.Vector3(0, -20, 0)).addScaledVector(dir, -25);
  }

  takeHit(from: THREE.Vector3, damage = 1, knock = 8): boolean {
    // PERFECT DODGE: the hit lands in the first instants of a dodge → Paint Time
    if (this.dodging && PLAYER.dodgeTime - this.dodgeT < Math.min(0.26, this.gate?.iframes ?? 0.26) && this.perfectCd <= 0) {
      this.perfectCd = 1.5;
      this.ctx.events.emit('player:perfect', { from: from.clone() });
      return false;
    }
    if (this.invuln > 0 || this.smudged || this.frozen || (this.dodging && !this.gate)) return false;
    damage = Difficulty.hitDamage(damage);
    this.hp = Math.max(0, this.hp - damage);
    this.invuln = Difficulty.s.invuln;
    const away = this.pos.clone().sub(from).setY(0);
    if (away.lengthSq() < 1e-4) away.copy(this.forward()).negate();
    away.normalize();
    this.knock.copy(away).multiplyScalar(knock);
    this.vy = Math.max(this.vy, 4 + knock * 0.15);
    this.grounded = false;
    this.holdingPurify = false;
    this.slam = 0;
    this.jetting = false;
    this.playAction('hurt', 0.45, 0.25);
    this.dodgeT = 0;
    this.gate?.onHit(damage, knock, from);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.9);
    this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.7, 0)), '#ff2f86', 14, 4);
    this.ctx.audio.play('hurt');
    this.ctx.time.hitstop(0.06);
    this.ctx.camera.fovPunch = Math.min(this.ctx.camera.fovPunch, -5); // a punch-in, like being shoved
    this.ctx.camera.recoil(0.06);
    this.ctx.events.emit('player:damaged', { hp: this.hp, from: from.clone(), heavy: damage >= 2 });
    return true;
  }

  /** Half hearts of healing scaled by the difficulty; fractions bank up until they make a whole half heart. */
  private healBank = 0;

  heal(amount: number): void {
    if (this.hp >= PLAYER.maxHp) return;
    this.healBank += amount * Difficulty.s.heal;
    const whole = Math.floor(this.healBank + 1e-6);
    if (whole <= 0) return;
    this.healBank -= whole;
    this.hp = Math.min(PLAYER.maxHp, this.hp + whole);
    this.ctx.events.emit('player:healed', { hp: this.hp });
  }

  /** Slide WAI sideways to `feet` (resolving an overlap) without touching his velocity or state. */
  nudgeTo(feet: THREE.Vector3): void {
    const c = this.center;
    const to = { x: feet.x, y: c.y, z: feet.z };
    this.body.setTranslation(to, true);
    this.body.setNextKinematicTranslation(to);
    this.pos.x = feet.x;
    this.pos.z = feet.z;
  }

  teleport(feet: THREE.Vector3, yaw?: number): void {
    const c = feet.clone().add(new THREE.Vector3(0, PLAYER.centerOffset + 0.02, 0));
    this.body.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
    this.body.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z });
    this.pos.copy(feet);
    this.prevPos.copy(feet);
    this.renderPos.copy(feet);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.knock.set(0, 0, 0);
    this.dodgeT = 0;
    this.slam = 0;
    this.jetting = false;
    if (yaw !== undefined) this.facing = this.prevFacing = yaw;
  }

  /**
   * One fixed step. `carry` = displacement of the platform WAI stands on.
   * When `driving`, WASD steers the host instead of WAI (driveWish).
   */
  step(dt: number, carry: THREE.Vector3, onMovingPlatform: boolean, drivable: boolean): void {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    const input = this.ctx.input;
    this.invuln = Math.max(0, this.invuln - dt);
    this.lockTimer = Math.max(0, this.lockTimer - dt);
    this.perfectCd = Math.max(0, this.perfectCd - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    if (this.action !== 'none') {
      this.actionT += dt;
      if (this.action !== 'purify' && this.actionT >= this.actionDur) this.action = 'none';
    }
    this.model.setFlash(this.invuln > 0 && Math.floor(this.invuln * 14) % 2 === 0 ? 0.7 : 0);

    const locked = this.lockTimer > 0 || this.holdingPurify || this.smudged || this.frozen;
    const { forward, right } = this.ctx.camera.basis();
    const wish = new THREE.Vector3();
    if (!locked) {
      if (input.isDown('KeyW')) wish.add(forward);
      if (input.isDown('KeyS')) wish.sub(forward);
      if (input.isDown('KeyD')) wish.add(right);
      if (input.isDown('KeyA')) wish.sub(right);
      const vm = input.virtualMove;
      if (Math.hypot(vm.x, vm.y) > 0.12) wish.addScaledVector(forward, vm.y).addScaledVector(right, vm.x);
    }
    if (wish.lengthSq() > 1) wish.normalize();

    // riding a legged host: WASD drives it, WAI stays put on top
    this.driving = drivable && onMovingPlatform && this.grounded;
    this.driveWish.copy(this.driving ? wish : new THREE.Vector3());
    let sprint = input.isDown('ShiftLeft') || input.isDown('ShiftRight') || Math.hypot(input.virtualMove.x, input.virtualMove.y) > 0.92;
    let speed = sprint ? (this.longLegs ? PLAYER.longLegsSprint : PLAYER.sprintSpeed) : PLAYER.walkSpeed;
    if (this.gate) {
      if (sprint) sprint = this.gate.sprint(dt, wish.lengthSq() > 0.01 && this.grounded);
      speed = (sprint ? (this.longLegs ? PLAYER.longLegsSprint : PLAYER.sprintSpeed) : PLAYER.walkSpeed) * this.gate.speedMul;
    }
    if (this.aiming) speed *= PLAYER.aimSpeedMul;
    // PAINT SURFING: sprint across your own fresh paint and WAI skates on it
    this.surfing = sprint && this.grounded && wish.lengthSq() > 0.1 && (this.paintUnder?.() ?? 0) >= 3;
    if (this.surfing) {
      speed *= 1.6;
      this.surfFx -= dt;
      if (this.surfFx <= 0) {
        this.surfFx = 0.05;
        this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.08, 0)), ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0'][Math.floor(Math.random() * 4)], 2, 1.5, 0.05, 6);
      }
      if (!this.surfSeen) {
        this.surfSeen = true;
        this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('PAINT SURF!'), '#22c4c0', 0.7);
      }
      this.cape.gust.addScaledVector(wish, -18 * dt);
    }
    const wishVel = this.driving ? new THREE.Vector3() : wish.clone().multiplyScalar(speed);

    // --- dodge roll ---
    const cPress = !locked && input.consumePressed('KeyC');
    if (cPress && !this.grounded && this.slam === 0 && this.leapT <= 0 && !this.dodging && this.heightAboveGround() > PLAYER.slamMinHeight) {
      // PAINT SLAM: hang, flip, dive
      this.slam = 1;
      this.slamT = 0;
      this.slamFromY = this.pos.y;
      this.jetting = false;
      this.vel.set(0, 0, 0);
      this.ctx.audio.play('slamDive', { vol: 0.8 });
      this.cape.gust.add(new THREE.Vector3(0, 25, 0));
    }
    if (cPress && this.dodgeCd <= 0 && this.grounded && (!this.gate || this.gate.tryDodge())) {
      this.dodgeT = PLAYER.dodgeTime;
      this.dodgeCd = PLAYER.dodgeTime + PLAYER.dodgeCooldown;
      this.dodgeDir.copy(wish.lengthSq() > 0 ? wish : this.forward().negate());
      this.invuln = Math.max(this.invuln, this.gate ? this.gate.iframes : PLAYER.dodgeInvuln);
      this.playAction('dodge', PLAYER.dodgeTime);
      this.ctx.audio.play('dodge');
      this.cape.gust.addScaledVector(this.dodgeDir, -40).add(new THREE.Vector3(0, 10, 0));
      this.faceDir(this.dodgeDir);
    }
    if (this.slam > 0) {
      // slam: no steering (a commitment), straight down
      this.slamT += dt;
      this.vel.set(0, 0, 0);
    } else if (this.leapT > 0) {
      this.leapT -= dt;
      this.vel.copy(this.leapVel);
    } else if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      if (this.dodgeT <= 0 && this.gate) this.lockTimer = Math.max(this.lockTimer, this.gate.recovery);
      this.vel.copy(this.dodgeDir).multiplyScalar(PLAYER.dodgeSpeed * (0.5 + 0.5 * (this.dodgeT / PLAYER.dodgeTime)));
    } else {
      const accel = this.grounded ? PLAYER.groundAccel : PLAYER.airAccel;
      const dv = wishVel.clone().sub(this.vel.clone().setY(0));
      const maxDv = accel * dt;
      if (dv.length() > maxDv) dv.setLength(maxDv);
      this.vel.add(dv);
    }
    this.vel.y = 0;

    // facing: aim = face the camera; otherwise face the movement
    const faceAt = this.gate?.faceTarget;
    if (this.aiming) {
      this.faceDir(forward);
    } else if (faceAt && !this.dodging && this.lockTimer <= 0) {
      // locked on: WAI keeps facing the target while he strafes
      let d = Math.atan2(faceAt.x - this.pos.x, faceAt.z - this.pos.z) - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    } else if (wish.lengthSq() > 0.01 && this.action !== 'attack' && !this.dodging && !this.driving) {
      const target = Math.atan2(wish.x, wish.z);
      let d = target - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 14);
    }

    // --- jump (buffer + coyote) ---
    if (input.consumePressed('Space') && !locked) this.jumpBuffer = 0.14;
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.coyote = this.grounded ? 0.12 : Math.max(0, this.coyote - dt);
    if (this.jumpBuffer > 0 && this.coyote > 0 && !this.dodging && (!this.gate || this.gate.tryJump())) {
      const h = this.longLegs ? PLAYER.longLegsJump : PLAYER.jumpHeight;
      this.vy = Math.sqrt(2 * PLAYER.gravity * h);
      this.jumpBuffer = 0;
      this.coyote = 0;
      this.grounded = false;
      this.ctx.audio.play(this.longLegs ? 'bigJump' : 'jump', { vol: 0.7 });
      this.ctx.events.emit('player:jumped');
      // jumping off a ridden host carries its momentum a little
      this.vel.add(new THREE.Vector3(carry.x, 0, carry.z).divideScalar(dt).multiplyScalar(0.8));
    }

    // --- JET HOVER: Space pressed in mid-air (not a coyote jump), held to keep spraying down ---
    if (this.grounded) this.jetUsed = 0;
    const airOk = !this.grounded && !locked && !this.dodging && this.slam === 0 && this.leapT <= 0;
    if (airOk && !this.jetting && this.jumpBuffer > 0 && this.coyote <= 0 && this.jetUsed < PLAYER.jetTime * 0.5) this.jetting = true;
    if (this.jetting && (!airOk || !input.isDown('Space') || this.jetUsed >= PLAYER.jetTime)) this.jetting = false;
    let jetColor: string | null = null;
    if (this.jetting) {
      jetColor = this.onJet ? this.onJet(dt) : '#22c4c0';
      if (!jetColor) {
        this.jetting = false;
        this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('OUT OF PAINT!'), '#ff2448', 0.5);
      }
    }
    this.ctx.audio.loop('jet', this.jetting, 'spray', 0.55);

    if (this.slam === 1) {
      this.vy = this.slamT < PLAYER.slamHang ? 2.5 : -PLAYER.slamSpeed;
      if (this.slamT >= PLAYER.slamHang) this.slam = 2;
    } else if (this.slam === 2) {
      this.vy = -PLAYER.slamSpeed;
    } else if (this.jetting && jetColor) {
      this.jetUsed += dt;
      // a little lift at the start, then a slow, steerable float
      const want = this.jetUsed < 0.18 ? 3 : PLAYER.jetFall;
      this.vy += (want - this.vy) * Math.min(1, dt * 12);
      this.jetFx -= dt;
      this.jetPaint -= dt;
      if (this.jetFx <= 0) {
        this.jetFx = 0.04;
        this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), jetColor, 3, 5, 0.06, 14, _down);
      }
      if (this.jetPaint <= 0) {
        // the jet really paints the ground under WAI (surfable afterwards)
        this.jetPaint = 0.09;
        const hit = this.ctx.physics.raycast(this.center, _down, 7, (c) => c.handle !== this.collider.handle && this.ctx.physics.tagOf(c) !== 'player');
        if (hit) this.ctx.effects.splat(hit.point, hit.normal, jetColor, 0.45 + Math.random() * 0.3, _down, { drip: 0.2 });
      }
      this.cape.gust.add(new THREE.Vector3(0, 30 * dt, 0));
    } else if (this.grounded && this.vy <= 0) {
      this.vy = onMovingPlatform ? 0 : -1.5;
    } else {
      this.vy = Math.max(-30, this.vy - PLAYER.gravity * dt);
    }
    this.knock.multiplyScalar(Math.exp(-dt * 7));

    const desired = new THREE.Vector3(
      (this.vel.x + this.knock.x) * dt + carry.x,
      this.vy * dt + carry.y,
      (this.vel.z + this.knock.z) * dt + carry.z,
    );
    // stairs step-up only on foot: mid-air it hooked WAI onto ledges and let him climb walls
    const stepOk = !PlayerController.strictGround || (this.grounded && this.vy <= 0.5);
    if (stepOk !== this.autostepOn) {
      if (stepOk) this.cc.enableAutostep(0.55, 0.15, false);
      else this.cc.disableAutostep();
      this.autostepOn = stepOk;
    }
    this.cc.computeColliderMovement(
      this.collider,
      { x: desired.x, y: desired.y, z: desired.z },
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (c) => c.handle !== this.collider.handle && !this.gate?.passable(c),
    );
    const mv = this.cc.computedMovement();
    const c = this.center;
    const next = new THREE.Vector3(c.x + mv.x, c.y + mv.y, c.z + mv.z);
    this.body.setNextKinematicTranslation({ x: next.x, y: next.y, z: next.z });
    if (this.vy > 0 && mv.y - carry.y < this.vy * dt * 0.5) this.vy = 0; // bonked head

    this.wasGrounded = this.grounded;
    this.grounded = this.cc.computedGrounded();
    // Rapier also reports "grounded" when the round bottom of the capsule hangs on a wall's edge or a
    // ledge lip — that let WAI chain jumps (and refill the jet) straight up walls. Real ground is a
    // walkable surface under his feet.
    // Hanging on an edge: push him off it (away from the edge), so he drops instead of
    // perching. Only if he's truly wedged for 1.5 s does it count as ground again — WAI can
    // never be stuck unable to jump.
    // Only when landing after rising (a jump or the jet): walking across stepped slabs, dropping
    // off a stair lip or crossing a gap keeps the old (engine) behaviour — the exploit always
    // starts with catching an edge on the way up.
    if (!this.wasGrounded && this.vy > 0.5) this.airRose = true;
    // Still going up (jump / jet / bounce): that's never "standing". The engine counts a wall WAI
    // slides up as ground, which refilled the jump mid-air — a free double jump up any wall.
    if (PlayerController.strictGround && this.grounded && this.vy > 0.5) this.grounded = false;
    if (PlayerController.strictGround && this.grounded && !this.wasGrounded && this.airRose && !this.supported(next)) {
      this.perchT += dt;
      this.vy = Math.max(this.vy, -4); // held up by the edge: don't bank a huge fall speed
      let px = 0;
      let pz = 0;
      for (let i = 0; i < this.cc.numComputedCollisions(); i++) {
        const col = this.cc.computedCollision(i);
        if (!col) continue;
        px += col.normal1.x;
        pz += col.normal1.z;
      }
      const pl = Math.hypot(px, pz);
      if (pl > 1e-3) {
        next.x += (px / pl) * 3 * dt;
        next.z += (pz / pl) * 3 * dt;
        this.body.setNextKinematicTranslation({ x: next.x, y: next.y, z: next.z });
      }
      if (this.perchT < 1.5) this.grounded = false;
    } else this.perchT = 0;
    if (this.grounded) this.airRose = false;
    this.justLanded = this.grounded && !this.wasGrounded;
    if (!this.grounded && this.wasGrounded) this.fallStartY = this.pos.y;
    if (this.slam > 0 && this.grounded) {
      // PAINT SLAM lands: splash + short recovery (punishable if you whiff)
      const feet = new THREE.Vector3(next.x, next.y - PLAYER.centerOffset, next.z);
      const drop = Math.max(0, this.slamFromY - feet.y);
      this.slam = 0;
      this.lockTimer = Math.max(this.lockTimer, PLAYER.slamRecover);
      this.invuln = Math.max(this.invuln, 0.2);
      this.ctx.audio.play('slamLand', { vol: 1 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.6);
      this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 3);
      this.ctx.time.hitstop(0.05);
      this.onSlam?.(feet, drop);
    }
    if (this.justLanded) {
      const fell = this.fallStartY - next.y;
      this.vy = Math.max(this.vy, -1.5);
      this.ctx.effects.burst(next.clone().setY(next.y - PLAYER.centerOffset + 0.05), '#f6e8d0', 6, 1.6, 0.06, 6);
      this.ctx.audio.play('land', { vol: Math.min(1, 0.4 + fell * 0.15) });
      if (fell > 2.5) this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.35);
    }
    this.pos.set(next.x, next.y - PLAYER.centerOffset, next.z);
    this.stairSinkTo = this.grounded ? this.treadBelowRamp() : 0;

    // footsteps + distance
    const moved = Math.hypot(mv.x - carry.x, mv.z - carry.z);
    if (this.grounded && !this.dodging) {
      this.stepAccum += moved;
      const stride = sprint ? 0.75 : 0.55;
      if (this.stepAccum > stride) {
        this.stepAccum = 0;
        this.ctx.audio.play('step', { vol: 0.55 });
      }
    }
    this.distAccum += moved;
    if (this.distAccum > 1) {
      this.ctx.events.emit('player:moved', { distance: this.distAccum });
      this.distAccum = 0;
    }
  }

  private autostepOn = true;
  /** Edge-perch / mid-air-step protection (tests switch it off to compare with the old movement). */
  static strictGround = true;
  private perchT = 0;
  /** This airborne stretch included going up (jump / jet / bounce). */
  private airRose = false;

  /** A walkable (≤ 50°) surface right under the capsule's feet (centre or a little around it). */
  private supported(center: THREE.Vector3): boolean {
    const r = PLAYER.radius * 0.55;
    const reach = PLAYER.centerOffset + 0.22;
    for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      _probe.set(center.x + ox, center.y, center.z + oz);
      const hit = this.ctx.physics.raycast(_probe, _down, reach, (c) => c.handle !== this.collider.handle && this.ctx.physics.tagOf(c) !== 'player');
      // dist 0 = the ray starts inside something solid (standing in / on it): that's support too
      if (hit && (hit.dist < 0.02 || hit.normal.y >= 0.64)) return true;
    }
    return false;
  }

  /**
   * Standing on a stair's invisible nosing ramp (PhysicsWorld.addNosingRamp): how far the drawn tread lies below the
   * feet (0 elsewhere). Mid-tread the ramp rides up to half a riser over the step; the model sinks onto the step.
   */
  private treadBelowRamp(): number {
    const ph = this.ctx.physics;
    const me = this.collider.handle;
    const on = ph.raycast(this.center, _down, PLAYER.centerOffset + 0.15, (c) => c.handle !== me);
    if (!on || !ph.isNosingRamp(on.collider)) return 0;
    const tread = ph.raycast(this.center, _down, PLAYER.centerOffset + 0.7, (c) => c.handle !== me && !ph.isNosingRamp(c));
    return tread ? THREE.MathUtils.clamp(this.pos.y - tread.point.y, 0, 0.6) : 0;
  }

  /** Feet → ground below (m); Infinity over the void. */
  private heightAboveGround(): number {
    const hit = this.ctx.physics.raycast(this.center, _down, 40, (c) => c.handle !== this.collider.handle);
    return hit ? hit.dist - PLAYER.centerOffset : Infinity;
  }

  probeGround(): void {
    if (!this.grounded) {
      this.groundCollider = null;
      return;
    }
    const c = this.center;
    let best: { collider: RAPIER.Collider; dist: number } | null = null;
    for (const [ox, oz] of [
      [0, 0],
      [0.22, 0],
      [-0.22, 0],
      [0, 0.22],
      [0, -0.22],
    ]) {
      const hit = this.ctx.physics.raycast(
        new THREE.Vector3(c.x + ox, c.y, c.z + oz),
        new THREE.Vector3(0, -1, 0),
        PLAYER.centerOffset + 0.2,
        (col) => col.handle !== this.collider.handle,
      );
      if (hit && (!best || hit.dist < best.dist)) best = { collider: hit.collider, dist: hit.dist };
    }
    this.groundCollider = best?.collider ?? null;
  }

  enforceAbove(topY: number): void {
    const c = this.center;
    const minC = topY + PLAYER.centerOffset + 0.005;
    if (c.y < minC) {
      this.body.setTranslation({ x: c.x, y: minC, z: c.z }, true);
      this.pos.y = topY + 0.005;
    }
  }

  render(alpha: number, frameDt: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
    let df = this.facing - this.prevFacing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.model.root.position.copy(this.renderPos);
    this.stairSink += (this.stairSinkTo - this.stairSink) * (1 - Math.exp(-frameDt * 16));
    this.model.root.position.y -= this.stairSink;
    this.model.root.quaternion.setFromAxisAngle(UP, this.prevFacing + df * alpha);
    // procedural poses for the new moves: slam = front flip then nose-down dive; jet = lean back + wobble
    if (this.slam === 1) this.model.root.quaternion.multiply(_q.setFromAxisAngle(AX_X, Math.min(1, this.slamT / PLAYER.slamHang) * Math.PI * 2));
    else if (this.slam === 2) this.model.root.quaternion.multiply(_q.setFromAxisAngle(AX_X, 0.25));
    else if (this.jetting) this.model.root.quaternion.multiply(_q.setFromAxisAngle(AX_X, -0.18 + Math.sin(performance.now() / 60) * 0.05));
    const speed = Math.hypot(this.vel.x, this.vel.z) / PLAYER.sprintSpeed;
    this.model.update(frameDt, {
      speed: this.driving ? 0 : speed,
      grounded: this.grounded,
      vy: this.vy,
      action: this.holdingPurify ? 'purify' : this.action,
      actionT: this.actionT,
      justLanded: this.justLanded,
      aim: this.ctx.camera.aimT,
      longLegs: this.longLegs,
    });
    // hide WAI when the camera is inside / very close (first person, tight corners)
    const cam = this.ctx.camera;
    const hide = cam.aimT > 0.35 || cam.closeness < 0.75;
    const blink = this.smudged && Math.floor(performance.now() / 80) % 2 === 0;
    this.model.root.visible = !hide && !blink;
    this.cape.update(frameDt, this.model.capeAnchor, this.model.root.visible && this.model.root.scale.x > 0.01);
  }
}
