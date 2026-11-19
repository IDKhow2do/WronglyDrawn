/**
 * [INPUT]: depends on RAPIER (KCC) from core/PhysicsWorld; PlaySession from level/Session; PLAYER (maxHp) from
 *          player/PlayerController; PlayBody from player/PlayBody; CompanionModel, CoopSpray, NavGrid, PipHealth (her hearts),
 *          PipWorld (floors that carry her, push-outs, spring routes) and autoDodge from this module
 * [OUTPUT]: exports Companion (her body: steering, navigation, dodge, slam, hover, takeHit / heal / leap; a PlayBody),
 *           COMPANION (tuning) and ATTACK_STATES
 * [POS]: the partner's body, a kinematic character like WAI's. CoopPartner writes her intents and steps it right
 *        after WAI; enemies with her aggro and the world's mechanisms (springs, presses) treat her as a PlayBody.
 *        Hearts, smudge and return are PipHealth's rules; what she stands on is PipWorld's.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type RAPIER_T from '@dimforge/rapier3d-compat';
import type { PlaySession as GameSession } from '../level/Session';
import type { EnemyBase } from '../enemy/EnemyBase';
import { CompanionModel, PIP } from './CompanionModel';
import { CoopSpray } from './CoopSpray';
import { NavGrid, Edge, type NavPath } from './NavGrid';
import { PipHealth } from './PipHealth';
import { PipWorld } from './PipWorld';
import { autoDodge } from './AutoDodge';
import { PLAYER } from '../player/PlayerController';
import type { PlayBody } from '../player/PlayBody';
import { t } from '../i18n';

export const COMPANION = {
  radius: 0.28,
  halfHeight: 0.18,
  get centerOffset() {
    return this.radius + this.halfHeight;
  },
  walk: 4.2,
  run: 7.2, // a little faster than WAI's sprint so it can keep up
  /** far behind: a catch-up dash (WAI with Long Legs sprints 8.4) */
  sprint: 8.8,
  gravity: 24,
  jump: 1.3,
  accel: 36,
  /** WAI's maximum (PipHealth: the same hearts) */
  get maxHp() {
    return PLAYER.maxHp;
  },
  dodgeSpeed: 9,
  dodgeTime: 0.38,
  sprayRange: 7.5,
};

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
/** World geometry Pip walks on / can't walk through (never water, creatures, WAI). */
const SOLID = new Set(['static', 'host', 'gate', 'undrawn', 'barrier']);
const TRAIL_MAX = 160;

/** Attack states: an enemy keeps its current target until it is back in a neutral state. */
export const ATTACK_STATES = new Set(['AIM', 'BEAM', 'TELL', 'LUNGE', 'CHEW', 'KICK', 'STOMP', 'CHARGE_TELL', 'CHARGE', 'RUB_TELL', 'RUB', 'SHOWER', 'SLAM', 'DAZED', 'CROUCH', 'LEAP', 'PIN', 'ROLL_TELL', 'ROLL', 'SQUIRT_TELL', 'FLICK_TELL', 'LINE_TELL', 'CROSS_TELL', 'LINE', 'CROSS', 'OPEN', 'BLARE', 'CATCH', 'RETURN', 'STING', 'BLARE_TELL', 'SWEEP_TELL', 'SWEEP', 'INHALE', 'HUSH', 'TELL_RUN', 'RUN', 'SNAP_TELL', 'SNAP', 'PLANT', 'SPIN', 'CIRCLE', 'RULE_TELL', 'RULE', 'STAB_TELL', 'STAB', 'BLOT', 'TILE_TELL', 'CROSS']);

/**
 * The partner's body (蓝色大肥鱼; "Pip" in the code): a small kinematic character (Rapier KCC, like WAI's / the hosts') that the
 * brain drives with intents (go here, spray that, jump, dodge). Everything frame-level
 * lives here: steering + WAI-trail navigation, ledge safety, stuck → teleport, auto-dodge
 * of telegraphed attacks. Enemies with her aggro see the PlayerController they expect (pos, vel, grounded,
 * smudged, collider, takeHit, leap).
 */
export class Companion implements PlayBody {
  readonly body: RAPIER_T.RigidBody;
  readonly collider: RAPIER_T.Collider;
  private cc: RAPIER_T.KinematicCharacterController;
  readonly model = new CompanionModel();
  readonly spray: CoopSpray;

  readonly pos = new THREE.Vector3();
  private prevPos = new THREE.Vector3();
  readonly renderPos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  vy = 0;
  facing = 0;
  private prevFacing = 0;
  grounded = false;

  hp = COMPANION.maxHp;
  invuln = 0;
  /** smudged: seconds of the smudge left (0 = in play; PipHealth runs it) */
  down = 0;
  readonly health = new PipHealth(this);
  readonly world: PipWorld;
  /** a thrown jump (spring, shake-off): seconds left and its velocity */
  private leapT = 0;
  private leapVel = new THREE.Vector3();
  private carryV = new THREE.Vector3();
  private knockV = new THREE.Vector3();
  private hurtFlash = 0;
  cheerT = 0;
  private dodgeT = 0;
  private dodgeCd = 0;
  private dodgeDir = new THREE.Vector3();
  private jumpReq = false;
  // ── PAINT SLAM (like WAI's C in mid-air): 0 none · 1 hang · 2 dive ──
  slam = 0;
  private slamT = 0;
  private slamFromY = 0;
  private slamQueued = false;
  /** the dive landed (Moves paints + hits around her feet) */
  onSlamLand: ((at: THREE.Vector3, drop: number) => void) | null = null;

  // ── intents (written by the brain, read every step) ──
  /** Where to go (null = stay). */
  goal: THREE.Vector3 | null = null;
  run = false;
  /** Point to paint (null = not spraying). */
  sprayTarget: THREE.Vector3 | null = null;
  /** Creature being painted (its collider is excluded from line-of-sight checks). */
  sprayEnemy: EnemyBase | null = null;
  /** Where to face when idle. */
  lookAt: THREE.Vector3 | null = null;

  // ── navigation ──
  private trail: THREE.Vector3[] = [];
  private trailCursor = -1;
  private lastWai = new THREE.Vector3(1e9, 0, 0);
  private navT = 0;
  private navPoint = new THREE.Vector3();
  private navDirect = true;
  private stuckT = 0;
  private bestGoalD = Infinity;
  private lastGoal = new THREE.Vector3(1e9, 0, 0);
  /** her map (lazily baked from the level's colliders) + the route she is walking */
  readonly nav: NavGrid;
  private path: NavPath | null = null;
  private pathI = 0;
  private lookJ = 0;
  private pathAge = 0;
  private job: Generator<void, NavPath | null, void> | null = null;
  private jobGoal = new THREE.Vector3(1e9, 0, 0);
  private navFailAt = -99;
  private clock = 0;
  /** what is left of the way to the goal (path length when on a route) — the progress watchdog's yardstick */
  private remain = Infinity;
  /** a running jump over a gap: seconds left / take-off height */
  private gapT = 0;
  private gapFromY = 0;
  private hoverUsed = 0;
  hovering = false;
  private hoverFx = 0;
  /** the route's next edge is a drop / gap: walking off the edge is meant */
  private ledgeOk = false;
  private slowDrop = false;
  /** sprint when far behind */
  catchUp = false;
  readonly navStats = { paths: 0, fails: 0, jumps: 0, gaps: 0, drops: 0, hovers: 0, replans: 0, unstick: 0 };
  private blockedT = 0;
  private hopCd = 0;
  private whistleCd = 0;
  private losT = 0;
  private losOk = false;
  sprayingNow = false;
  /** stats for tests / observe() */
  teleports = 0;
  lastTeleport = '';
  readonly teleportLog: string[] = [];
  /** where she was when she had to be drawn back in (tests) */
  readonly teleportAt: string[] = [];
  /** the last failed route searches (tests) */
  readonly navFailLog: string[] = [];
  maxStuck = 0;
  timesDown = 0;
  onHurt: (() => void) | null = null;
  onTeleport: (() => void) | null = null;
  /** Owner proxy on Pip's collider: WAI's paint / thrown rocks are absorbed (no friendly fire, no paint on Pip). */
  readonly proxy = {
    damageable: true as const,
    coopBuddy: true,
    applyDamage: () => {
      this.onPoked?.();
      return { weak: false, absorbed: true };
    },
  };
  /** Spawn-in (driven by Coop): hidden until the pencil starts, then a flat sticker (squash ≈ 0), then she pops up to 1. */
  shown = true;
  squash = 1;
  /** WAI's paint landed on her (she has opinions). */
  onPoked: (() => void) | null = null;
  /** Cosmetic moods written by Mood.ts, read by the model every frame (0..1 each). */
  readonly mood = { excited: 0, sleepy: 0, hide: 0, /** waiting for an answer to come to her (a hook for the model: head tilt) */ think: 0 };

  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private tmpC = new THREE.Vector3();
  private wish = new THREE.Vector3();
  private muzzleW = new THREE.Vector3();

  constructor(
    private s: GameSession,
    at: THREE.Vector3,
  ) {
    const w = s.physics.world;
    const c = at.clone().add(new THREE.Vector3(0, COMPANION.centerOffset + 0.02, 0));
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(c.x, c.y, c.z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(COMPANION.halfHeight, COMPANION.radius).setFriction(0), this.body);
    s.physics.tag(this.collider, 'player', this.proxy);
    this.cc = w.createCharacterController(0.02);
    this.cc.setUp({ x: 0, y: 1, z: 0 });
    this.cc.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.cc.setMinSlopeSlideAngle((35 * Math.PI) / 180);
    this.cc.enableAutostep(0.55, 0.12, false); // the town's 0.5 m stairs
    this.cc.enableSnapToGround(0.3);
    this.cc.setApplyImpulsesToDynamicBodies(false);
    this.cc.setSlideEnabled(true);
    this.pos.copy(at);
    this.prevPos.copy(at);
    this.renderPos.copy(at);
    this.facing = this.prevFacing = s.player.facing;
    s.ctx.root.add(this.model.root);
    const wai = s.player.collider.handle;
    const own = this.collider.handle;
    this.spray = new CoopSpray(s.ctx, PIP.paint, (col) => col.handle !== own && col.handle !== wai && s.physics.tagOf(col) !== 'water');
    this.nav = new NavGrid(s);
    this.world = new PipWorld(s, this);
  }

  /** Is she lost for real (no route to the goal, or no progress along it for a long time)? */
  navStuck(): boolean {
    if (!this.goal) return false;
    return (this.clock - this.navFailAt < 4 && !this.path) || this.stuckT > 5 || this.blockedT > 4;
  }

  /** The route she is walking (debug draw / tests). */
  route(): { pts: number[][]; i: number; kinds: number[] } | null {
    const P = this.path;
    return P ? { pts: P.pts.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]), i: this.pathI, kinds: P.kinds.slice() } : null;
  }

  // ───────── PlayerController look-alike (enemies call these when Pip has their aggro) ─────────
  get smudged(): boolean {
    return this.down > 0;
  }

  get dodging(): boolean {
    return this.dodgeT > 0;
  }

  /** A hit: WAI's cost and blink (PipHealth), WAI's shove. */
  takeHit(from: THREE.Vector3, damage = 1, knock = 8): boolean {
    if (!this.health.canBeHit()) return false;
    this.health.lose(damage);
    this.hurtFlash = 1;
    const away = this.tmpA.copy(this.pos).sub(from).setY(0);
    if (away.lengthSq() < 1e-4) away.set(Math.sin(this.facing), 0, Math.cos(this.facing)).negate();
    this.knockV.copy(away.normalize()).multiplyScalar(knock);
    this.vy = Math.max(this.vy, 4 + knock * 0.15);
    this.grounded = false;
    this.leapT = 0;
    this.s.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), PIP.body, 12, 4);
    this.s.ctx.audio.play('squeak', { pos: this.pos, pitch: 1.6, vol: 0.7 });
    if (this.down > 0) this.s.ctx.audio.play('smudged', { pos: this.pos, vol: 0.6, pitch: 1.3 });
    else this.onHurt?.();
    return true;
  }

  heal(amount: number): void {
    this.health.heal(amount);
  }

  /** Thrown along `dir` (a spring, a boss shaking her off): WAI's leap. */
  leap(dir: THREE.Vector3, dist: number, vy: number): void {
    this.vy = vy;
    this.grounded = false;
    const air = (2 * vy) / COMPANION.gravity;
    this.leapVel.copy(dir).setY(0).normalize().multiplyScalar(dist / Math.max(0.3, air));
    this.leapT = air;
    this.gapT = 0;
    this.slam = 0;
  }

  get leaping(): boolean {
    return this.leapT > 0;
  }

  get centerOffset(): number {
    return COMPANION.centerOffset;
  }

  /** Slide sideways to `feet` (a push-out) without touching her velocity. */
  nudgeTo(feet: THREE.Vector3): void {
    const c = this.body.translation();
    this.body.setTranslation({ x: feet.x, y: c.y, z: feet.z }, true);
    this.body.setNextKinematicTranslation({ x: feet.x, y: c.y, z: feet.z });
    this.pos.x = feet.x;
    this.pos.z = feet.z;
  }

  /** Never below a host's top (the sessions' riding rule). */
  enforceAbove(topY: number): void {
    const c = this.body.translation();
    const minC = topY + COMPANION.centerOffset + 0.005;
    if (c.y < minC) {
      this.body.setTranslation({ x: c.x, y: minC, z: c.z }, true);
      this.pos.y = topY + 0.005;
    }
  }

  /** Smudged: the kid's eraser rubs her out (hidden until the pencil draws her again). */
  erase(): void {
    this.s.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffffff', 14, 3.5);
    this.shown = false;
    this.sprayTarget = null;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  requestJump(): void {
    this.jumpReq = true;
  }

  /** A goof's pose (Goofs.ts writes it, the model reads it): face-plant, seeing stars, a salute. */
  readonly pose = { trip: 0, dizzy: 0, salute: 0 };

  /** Skid along `dir` (a slip on fresh paint): carried like a knock-back. */
  slide(dir: THREE.Vector3, speed: number): void {
    this.knockV.copy(dir).setY(0).normalize().multiplyScalar(speed);
  }

  /** Solid, dry ground `dist` metres along `dir` (goofs check before a slide). */
  safeAhead(dir: THREE.Vector3, dist: number): boolean {
    return this.groundAhead(dir, dist) && !this.wallAhead(dir, dist);
  }

  /** Bounce off something she walked into. */
  knockBack(from: THREE.Vector3, strength: number): void {
    const away = this.tmpA.copy(this.pos).sub(from).setY(0);
    if (away.lengthSq() < 1e-4) away.set(-Math.sin(this.facing), 0, -Math.cos(this.facing));
    this.knockV.copy(away.normalize()).multiplyScalar(strength);
    this.vy = Math.max(this.vy, 3);
    this.grounded = false;
  }

  /** PAINT SLAM: hop (if on the ground), a short hang at the top, then a straight dive that splashes on landing. */
  private slamTo: THREE.Vector3 | null = null;
  requestSlam(to?: THREE.Vector3 | null): boolean {
    if (this.down > 0 || this.slam > 0 || this.dodgeT > 0) return false;
    // a pounce: the dive comes down on `to`
    this.slamTo = to ? to.clone() : null;
    if (this.grounded) this.jumpReq = true;
    this.slamQueued = true;
    return true;
  }

  /** JET HOVER on purpose: a hop that floats on her paint jet for a moment. */
  requestHover(): boolean {
    if (this.down > 0 || !this.grounded) return false;
    this.jumpReq = true;
    this.gapT = 1.6;
    this.gapFromY = this.pos.y + 1.0;
    this.hoverUsed = 0;
    return true;
  }

  /** Roll away (perpendicular to `from`'s line toward Pip, picking the side away from danger). */
  requestDodge(dir: THREE.Vector3): boolean {
    if (this.dodgeCd > 0 || this.down > 0 || !this.grounded) return false;
    this.dodgeDir.copy(dir).setY(0).normalize();
    // never roll off a ledge or into a wall: try the other side
    if (!this.groundAhead(this.dodgeDir, 2.2) || this.wallAhead(this.dodgeDir, 2.2)) this.dodgeDir.negate();
    if (!this.groundAhead(this.dodgeDir, 2.2)) return false;
    this.dodgeT = COMPANION.dodgeTime;
    this.dodgeCd = COMPANION.dodgeTime + 0.5;
    this.invuln = Math.max(this.invuln, 0.3);
    this.s.ctx.audio.play('dodge', { pos: this.pos, pitch: 1.4, vol: 0.6 });
    return true;
  }

  /** Pop next to WAI (a free spot on his floor, never inside him or a wall). False = no room, try later. */
  teleportNear(anchor: THREE.Vector3, yawHint: number, reason = 'regroup', quiet = false): boolean {
    const p = this.s.physics;
    const blocker = (col: RAPIER_T.Collider) => {
      const tg = p.tagOf(col) ?? '';
      return SOLID.has(tg) || tg === 'enemy';
    };
    let spot: THREE.Vector3 | null = null;
    const from = anchor.clone().setY(anchor.y + 0.7);
    const dir = new THREE.Vector3();
    // behind WAI first (out of his way), then around him
    for (const r of [1.8, 1.3, 2.6]) {
      for (const da of [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI / 2, -Math.PI / 2, Math.PI * 0.25, -Math.PI * 0.25, 0]) {
        const a = yawHint + da;
        dir.set(Math.sin(a), 0, Math.cos(a));
        if (p.raycast(from, dir, r + COMPANION.radius + 0.1, blocker)) continue;
        const c = anchor.clone().addScaledVector(dir, r);
        const g = p.raycast(c.setY(anchor.y + 1.2), DOWN, 2.6, (col) => SOLID.has(p.tagOf(col) ?? '') && p.tagOf(col) !== 'barrier');
        if (!g || Math.abs(g.point.y - anchor.y) > 0.8 || g.normal.y < 0.7) continue;
        // head room for the capsule
        if (p.raycast(g.point.clone().setY(g.point.y + 0.05), UP, 1.0, blocker)) continue;
        spot = g.point;
        break;
      }
      if (spot) break;
    }
    if (!spot) return false;
    this.lastTeleport = reason;
    const was = this.pos.clone();
    const fx = this.s.ctx.effects;
    if (!quiet) fx.burst(this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffffff', 10, 3);
    const c = spot.clone().add(new THREE.Vector3(0, COMPANION.centerOffset + 0.03, 0));
    this.body.setTranslation({ x: c.x, y: c.y, z: c.z }, true);
    this.body.setNextKinematicTranslation({ x: c.x, y: c.y, z: c.z });
    this.pos.copy(spot);
    this.prevPos.copy(spot);
    this.renderPos.copy(spot);
    this.vel.set(0, 0, 0);
    this.knockV.set(0, 0, 0);
    this.vy = 0;
    this.trailCursor = -1;
    this.stuckT = 0;
    this.blockedT = 0;
    this.bestGoalD = Infinity;
    this.path = null;
    this.job = null;
    this.gapT = 0;
    this.teleports++;
    this.teleportLog.push(reason);
    this.teleportAt.push(`${reason}@${was.x.toFixed(1)},${was.y.toFixed(1)},${was.z.toFixed(1)}`);
    if (this.teleportAt.length > 20) this.teleportAt.shift();
    if (this.teleportLog.length > 20) this.teleportLog.shift();
    if (!quiet) {
      fx.burst(spot.clone().add(new THREE.Vector3(0, 0.5, 0)), PIP.body, 14, 3.5);
      fx.ring(spot.clone().add(new THREE.Vector3(0, 0.05, 0)), PIP.body, 1.4);
      this.s.ctx.audio.play('pop', { pos: spot, vol: 0.5, pitch: 1.3 });
    }
    this.onTeleport?.();
    return true;
  }

  // ───────── navigation helpers ─────────
  private solid = (col: RAPIER_T.Collider): boolean => SOLID.has(this.s.physics.tagOf(col) ?? '');

  private groundAhead(dir: THREE.Vector3, dist: number): boolean {
    const p = this.tmpC.copy(this.pos).addScaledVector(dir, dist).setY(this.pos.y + 0.8);
    const g = this.s.physics.raycast(p, DOWN, 2.6, this.solid);
    // water is not ground (the sea bed under it would be)
    return !!g && g.point.y > this.pos.y - 1.7 && !this.s.inWater(this.tmpC.copy(g.point).setY(g.point.y - 0.05));
  }

  private wallAhead(dir: THREE.Vector3, dist: number): boolean {
    const o = this.tmpC.copy(this.pos).setY(this.pos.y + 0.75);
    return !!this.s.physics.raycast(o, dir, dist, this.solid);
  }

  /** Can Pip walk straight from a to b? (no wall at knee height along the slope, no gap) */
  private clearPath(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const ph = this.s.physics;
    const from = this.tmpA.copy(a).setY(a.y + 0.75);
    const dir = this.tmpB.copy(b).setY(b.y + 0.75).sub(from);
    const len = dir.length();
    if (len < 0.3) return true;
    if (Math.abs(b.y - a.y) > Math.max(1.2, len * 0.75)) return false;
    dir.divideScalar(len);
    if (ph.raycast(from, dir, len, this.solid)) return false;
    // gaps (canal, roof edges, the side of a pier): ground every ~0.6 m
    const n = Math.min(14, Math.floor(len / 0.6));
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      const q = this.tmpC.copy(a).lerp(b, k);
      const g = ph.raycast(q.setY(q.y + 1.2), DOWN, 2.8, this.solid);
      if (!g || this.s.inWater(g.point.setY(g.point.y - 0.05))) return false;
    }
    return true;
  }

  /** Record WAI's footsteps: Pip can always walk where WAI walked. */
  private recordTrail(): void {
    const p = this.s.player;
    if (p.pos.distanceTo(this.lastWai) > 5) {
      // WAI teleported / respawned: old breadcrumbs no longer connect
      this.trail.length = 0;
      this.trailCursor = -1;
    }
    this.lastWai.copy(p.pos);
    if (!p.grounded || !p.groundCollider) return;
    const tag = this.s.physics.tagOf(p.groundCollider);
    if (tag !== 'static' && tag !== 'gate' && tag !== 'undrawn') return;
    const last = this.trail[this.trail.length - 1];
    if (last && last.distanceTo(p.pos) < 0.9) return;
    if (this.trail.length >= TRAIL_MAX) {
      const old = this.trail.shift()!;
      old.copy(p.pos);
      this.trail.push(old);
      if (this.trailCursor > 0) this.trailCursor--;
    } else this.trail.push(p.pos.clone());
  }

  /** Start (or restart) a route search toward `goal` (it runs a couple of ms per step, see pumpJob). */
  private lastJobAt = -99;
  private partialUntil = -99;
  private startJob(goal: THREE.Vector3): void {
    // not from mid-air (no floor to start from), not more than ~2× a second, not right after a failure
    if (!this.grounded || this.clock - this.lastJobAt < 0.45 || this.clock - this.navFailAt < 1.2) return;
    this.lastJobAt = this.clock;
    this.jobGoal.copy(goal);
    this.job = this.nav.search(this.pos.clone(), goal.clone());
    this.navStats.replans++;
  }

  /** Pull the route search along for at most ~2 ms. */
  private pumpJob(): void {
    if (!this.job) return;
    const t0 = performance.now();
    for (;;) {
      const r = this.job.next();
      if (r.done) {
        this.job = null;
        if (r.value) {
          this.path = r.value;
          // only part of the way exists (the rest is up undrawn stairs / out of reach): don't keep asking
          if (r.value.pts[r.value.pts.length - 1].distanceTo(this.jobGoal) > 2) this.partialUntil = this.clock + 3;
          this.pathAge = 0;
          this.pathI = 0;
          this.lookJ = 0;
          this.syncPath(40);
          this.navStats.paths++;
          this.bestGoalD = Infinity;
        } else {
          this.navFailAt = this.clock;
          this.navStats.fails++;
          const f = (v: THREE.Vector3) => `${v.x.toFixed(1)},${v.y.toFixed(1)},${v.z.toFixed(1)}`;
          this.navFailLog.push(`${f(this.pos)}→${f(this.jobGoal)} g=${this.grounded ? 1 : 0}`);
          if (this.navFailLog.length > 12) this.navFailLog.shift();
        }
        return;
      }
      if (performance.now() - t0 > 2) return;
    }
  }

  /** Nearest route point to her (same floor) in a window ahead of where she was. */
  private syncPath(window = 16): void {
    const P = this.path;
    if (!P) return;
    let bi = this.pathI, bd = Infinity;
    const end = Math.min(P.pts.length - 1, this.pathI + window);
    for (let i = Math.max(0, this.pathI - 2); i <= end; i++) {
      const q = P.pts[i];
      const dy = Math.abs(q.y - this.pos.y);
      if (dy > 1.3) continue;
      const d = Math.hypot(q.x - this.pos.x, q.z - this.pos.z) + dy;
      if (d < bd - 0.05 || (Math.abs(d - bd) < 0.05 && i > bi)) {
        bd = d;
        bi = i;
      }
    }
    this.pathI = bi;
    // knocked off the route: look for a new one
    if (bd > 3.5 && !this.job) this.startJob(this.lastGoal);
  }

  /** Re-plan (a few times per second): straight line if clear, else her route (nav grid), else WAI's trail. */
  private plan(goal: THREE.Vector3): void {
    const flat = Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z);
    if (Math.abs(goal.y - this.pos.y) < 1 && flat < 30 && this.clearPath(this.pos, goal)) {
      this.navDirect = true;
      this.navPoint.copy(goal);
      this.trailCursor = -1;
      this.remain = flat;
      return;
    }
    this.navDirect = false;
    const P = this.path;
    const end = P ? P.pts[P.pts.length - 1] : null;
    const off = end ? end.distanceTo(goal) : Infinity;
    // a route that no longer leads to the goal (WAI moved on) or is old: look for a fresh one
    if (((off > 2 && this.clock > this.partialUntil) || this.pathAge > 6) && this.clock - this.navFailAt > 1.2 && (!this.job || this.jobGoal.distanceTo(goal) > 3)) this.startJob(goal);
    if (P && off < 8) {
      this.lookahead();
      return;
    }
    this.trailPlan(goal);
  }

  /** The farthest route point she can walk to in a straight line, never past a jump / drop / gap. */
  private lookahead(): void {
    const P = this.path!;
    const next = Math.min(P.pts.length - 1, this.pathI + 1);
    let f = next;
    while (f < P.pts.length - 1 && P.kinds[f + 1] === Edge.Walk) f++;
    if (P.kinds[next] !== Edge.Walk) {
      this.lookJ = next;
      return;
    }
    for (const k of [12, 7, 4, 2]) {
      const j = Math.min(f, next + k);
      if (j <= next) continue;
      const q = P.pts[j];
      if (Math.abs(q.y - this.pos.y) < 1.1 && this.clearPath(this.pos, q)) {
        this.lookJ = j;
        return;
      }
    }
    this.lookJ = next;
  }

  /** Old fallback: march along WAI's breadcrumbs (no route found yet / none exists). */
  private trailPlan(goal: THREE.Vector3): void {
    const T = this.trail;
    if (!T.length) {
      // no route and no footsteps to follow: walking blind toward him ends in the water; wait for a route
      // (or, if none turns up, the pencil draws her next to him — Coop.step)
      this.navPoint.copy(this.navFailAt > this.clock - 4 && goal.distanceTo(this.pos) > 8 ? this.pos : goal);
      return;
    }
    // cursor: nearest reachable breadcrumb (once), then march toward the newest ones
    if (this.trailCursor < 0 || this.trailCursor >= T.length) {
      let bi = -1, bd = Infinity;
      for (let i = 0; i < T.length; i++) {
        const d = T[i].distanceToSquared(this.pos) + (T.length - i) * 0.02;
        if (d < bd) {
          bd = d;
          bi = i;
        }
      }
      this.trailCursor = bi;
    }
    // shortcuts: skip ahead if a later crumb is in plain sight
    for (const k of [8, 4, 2]) {
      const j = Math.min(T.length - 1, this.trailCursor + k);
      if (j > this.trailCursor && T[j].distanceTo(this.pos) < 9 && this.clearPath(this.pos, T[j])) {
        this.trailCursor = j;
        break;
      }
    }
    this.navPoint.copy(T[this.trailCursor]);
  }

  /** On a route: where to head this step (+ jumps / drops / gaps on the way). */
  private followRoute(dt: number): THREE.Vector3 {
    const P = this.path!;
    this.syncPath();
    const last = P.pts.length - 1;
    const next = Math.min(last, this.pathI + 1);
    if (this.lookJ < next) this.lookJ = next;
    const kind = P.kinds[next];
    const tgt = kind === Edge.Walk ? P.pts[Math.min(this.lookJ, last)] : P.pts[next];
    const here = P.pts[this.pathI];
    const toNext = Math.hypot(P.pts[next].x - this.pos.x, P.pts[next].z - this.pos.z);
    this.remain = P.rest[next] + toNext;
    this.ledgeOk = kind === Edge.Drop || kind === Edge.Gap;
    // step off a ledge at a walk (no flying past the landing)
    this.slowDrop = kind === Edge.Drop && toNext < 2;
    if (this.grounded && this.dodgeT <= 0) {
      if (kind === Edge.Jump && toNext < 0.95 && P.pts[next].y > this.pos.y + 0.4) {
        this.jumpReq = true;
        this.navStats.jumps++;
      } else if (kind === Edge.Gap && Math.hypot(here.x - this.pos.x, here.z - this.pos.z) < 0.4 && this.gapT <= 0) {
        // a running jump: full speed toward the far side, then the hover catches a short fall
        const d = this.tmpA.set(P.pts[next].x - this.pos.x, 0, P.pts[next].z - this.pos.z).normalize();
        this.vel.copy(d).multiplyScalar(COMPANION.run);
        this.jumpReq = true;
        this.gapT = 1.4;
        this.gapFromY = this.pos.y;
        this.navStats.gaps++;
      }
    }
    void dt;
    return tgt;
  }

  // ───────── per fixed step ─────────
  step(dt: number, canAct: boolean): void {
    const s = this.s;
    const wai = s.player;
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    this.cheerT = Math.max(0, this.cheerT - dt);
    this.dodgeCd = Math.max(0, this.dodgeCd - dt);
    this.recordTrail();
    this.health.step(dt);
    const downNow = this.down > 0;
    const carry = this.carryV;
    const platform = this.world.carry(dt, carry);

    // ── steering ──
    this.clock += dt;
    this.pathAge += dt;
    this.nav.tick(dt);
    this.pumpJob();
    this.ledgeOk = false;
    this.slowDrop = false;
    const wish = this.wish.set(0, 0, 0);
    let speed = 0;
    if (!downNow && canAct && this.goal) {
      const g = this.goal;
      const flat = Math.hypot(g.x - this.pos.x, g.z - this.pos.z);
      // a new destination restarts the progress watchdog
      if (this.lastGoal.distanceToSquared(g) > 1.5) {
        this.lastGoal.copy(g);
        this.bestGoalD = Infinity;
        this.stuckT = Math.min(this.stuckT, 0.6);
      }
      if (flat > 0.45 || Math.abs(g.y - this.pos.y) > 1.2) {
        this.navT -= dt;
        if (this.navT <= 0) {
          this.navT = 0.25;
          this.plan(g);
        }
        let np: THREE.Vector3;
        if (this.navDirect) {
          np = g;
          this.remain = flat;
        } else if (this.path && this.path.pts[this.path.pts.length - 1].distanceTo(g) < 8) np = this.followRoute(dt);
        else {
          // breadcrumb reached → next one
          if (this.trailCursor >= 0 && Math.hypot(this.navPoint.x - this.pos.x, this.navPoint.z - this.pos.z) < 0.8) {
            this.trailCursor = Math.min(this.trail.length - 1, this.trailCursor + 1);
            if (this.trail[this.trailCursor]) this.navPoint.copy(this.trail[this.trailCursor]);
          }
          np = this.navPoint;
          this.remain = flat;
        }
        wish.set(np.x - this.pos.x, 0, np.z - this.pos.z);
        const wl = wish.length();
        if (wl > 1e-3) wish.divideScalar(wl);
        speed = this.catchUp ? COMPANION.sprint : this.run ? COMPANION.run : COMPANION.walk;
        if (this.slowDrop) speed = Math.min(speed, COMPANION.walk * 0.7);
        // arrive gently
        if (this.navDirect && flat < 1.5) speed *= Math.max(0.35, flat / 1.5);
        // progress watchdog (stuck → hop → re-plan → … → last resort: drawn in next to WAI)
        if (this.remain < this.bestGoalD - 0.4) {
          this.bestGoalD = this.remain;
          this.stuckT = 0;
        } else this.stuckT += dt;
      } else {
        this.bestGoalD = Infinity;
        this.stuckT = 0;
      }
    } else {
      this.bestGoalD = Infinity;
      this.stuckT = 0;
    }
    // personal space: never stand in WAI's way
    const toWai = this.tmpA.set(this.pos.x - wai.pos.x, 0, this.pos.z - wai.pos.z);
    const dw = toWai.length();
    if (!downNow && dw < 1.3 && Math.abs(this.pos.y - wai.pos.y) < 1.5) {
      toWai.divideScalar(Math.max(dw, 0.01));
      wish.addScaledVector(toWai, (1.3 - dw) * 1.6);
      speed = Math.max(speed, COMPANION.walk * 0.8);
    }
    if (wish.lengthSq() > 1) wish.normalize();
    // ledge safety (except when the trail says WAI hopped down here)
    if (wish.lengthSq() > 0.01 && this.grounded && !this.ledgeOk && !this.groundAhead(this.tmpB.copy(wish).normalize(), 0.7)) {
      const goingDown = !!this.goal && this.goal.y < this.pos.y - 1 && !this.path;
      if (!goingDown) wish.set(0, 0, 0);
    }
    const wantMove = wish.lengthSq() > 0.04 && speed > 0.5;
    if (!wantMove && !this.goal) this.blockedT = 0;
    const st = Math.max(this.stuckT, this.blockedT);
    this.maxStuck = Math.max(this.maxStuck, st);
    if (st > 1.2 && this.grounded && this.hopCd <= 0) {
      this.jumpReq = true;
      this.hopCd = 1;
      // a route that does not work here (a crate, a closed gate): forget this bit of the map and look again
      if (this.path && st > 2 && !this.job) {
        const P = this.path;
        this.nav.invalidate(P.pts[Math.min(P.pts.length - 1, this.pathI + 1)], 1.2);
        this.navStats.unstick++;
        this.startJob(this.goal ?? this.lastGoal);
      }
    }
    this.hopCd -= dt;

    // ── velocity ──
    if (this.leapT > 0) {
      this.leapT -= dt;
      this.vel.copy(this.leapVel);
    } else if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.vel.copy(this.dodgeDir).multiplyScalar(COMPANION.dodgeSpeed * (0.5 + 0.5 * (this.dodgeT / COMPANION.dodgeTime)));
    } else {
      const want = this.tmpB.copy(wish).multiplyScalar(speed);
      const dv = want.sub(this.tmpC.copy(this.vel).setY(0));
      // mid-gap she keeps her run-up (a player's jump keeps its momentum)
      const maxDv = (this.grounded ? COMPANION.accel : this.gapT > 0 ? 4 : 12) * dt;
      if (dv.length() > maxDv) dv.setLength(maxDv);
      this.vel.add(dv);
    }
    this.vel.y = 0;
    if (this.jumpReq && this.grounded && !downNow && this.leapT <= 0) {
      this.vy = Math.sqrt(2 * COMPANION.gravity * COMPANION.jump);
      this.grounded = false;
      s.ctx.audio.play('jump', { pos: this.pos, pitch: 1.5, vol: 0.4 });
    }
    this.jumpReq = false;
    // PAINT SLAM: start once she is up in the air, hang, dive
    if (this.slamQueued && !this.grounded && this.vy < 2.5 && this.slam === 0) {
      this.slamQueued = false;
      this.slam = 1;
      this.slamT = 0;
      this.slamFromY = this.pos.y;
      s.ctx.audio.play('slamDive', { pos: this.pos, vol: 0.5, pitch: 1.4 });
    }
    if (this.slamQueued && this.grounded && !this.jumpReq) this.slamQueued = false;
    if (this.slam > 0) {
      this.slamT += dt;
      this.vel.set(0, 0, 0);
      if (this.slamTo) {
        const dx = this.slamTo.x - this.pos.x, dz = this.slamTo.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.2) this.vel.set(dx, 0, dz).multiplyScalar(Math.min(7, d * 5) / d);
      }
      this.vy = this.slam === 1 && this.slamT < 0.16 ? 2.5 : -24;
      if (this.slamT >= 0.16) this.slam = 2;
    }
    // JET HOVER (like WAI's): a running jump that comes up short floats on a jet of her paint for a moment
    this.gapT = Math.max(0, this.gapT - dt);
    if (this.grounded) {
      this.hoverUsed = 0;
      if (this.vy <= 0) this.gapT = 0;
    }
    this.hovering = this.slam === 0 && !this.grounded && this.gapT > 0 && this.vy < 0.5 && this.pos.y < this.gapFromY + 0.25 && this.hoverUsed < 1.1 && !downNow;
    if (this.hovering) {
      if (this.hoverUsed === 0) this.navStats.hovers++;
      this.hoverUsed += dt;
      this.vy += (-0.6 - this.vy) * Math.min(1, dt * 12);
      this.hoverFx -= dt;
      if (this.hoverFx <= 0) {
        this.hoverFx = 0.05;
        s.ctx.effects.burst(this.tmpC.copy(this.pos).setY(this.pos.y + 0.05), PIP.paint, 3, 4, 0.06, 12, DOWN);
      }
      s.ctx.audio.loop('pipJet', true, 'spray', 0.35);
    } else if (this.slam === 0) {
      s.ctx.audio.loop('pipJet', false, 'spray', 0.35);
      if (this.grounded && this.vy <= 0) this.vy = platform ? 0 : -1.5;
      else this.vy = Math.max(-30, this.vy - COMPANION.gravity * dt);
    }
    this.knockV.multiplyScalar(Math.exp(-dt * 7));

    // ── facing: spray target > movement > look target ──
    let face: THREE.Vector3 | null = null;
    if (this.sprayTarget && !downNow) face = this.tmpC.copy(this.sprayTarget).sub(this.pos);
    else if (this.vel.lengthSq() > 0.5 && this.dodgeT <= 0) face = this.tmpC.copy(this.vel);
    else if (this.lookAt) face = this.tmpC.copy(this.lookAt).sub(this.pos);
    if (face && !downNow && face.x * face.x + face.z * face.z > 1e-4) {
      let d = Math.atan2(face.x, face.z) - this.facing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.facing += d * Math.min(1, dt * 12);
    }

    // ── KCC move ──
    const own = this.collider.handle;
    const desired = { x: (this.vel.x + this.knockV.x) * dt + carry.x, y: this.vy * dt + carry.y, z: (this.vel.z + this.knockV.z) * dt + carry.z };
    this.cc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => c.handle !== own);
    const mv = this.cc.computedMovement();
    // pushing but not moving (wall, ledge guard, a crate) → blocked
    const intended = Math.hypot(desired.x, desired.z);
    if (wantMove && this.dodgeT <= 0 && intended > 1e-4 && Math.hypot(mv.x, mv.z) < intended * 0.3) this.blockedT += dt;
    else if (wantMove && this.grounded) this.blockedT = Math.max(0, this.blockedT - dt * 2);
    const tr = this.body.translation();
    const nx = tr.x + mv.x, ny = tr.y + mv.y, nz = tr.z + mv.z;
    this.body.setNextKinematicTranslation({ x: nx, y: ny, z: nz });
    if (this.vy > 0 && mv.y - carry.y < this.vy * dt * 0.5) this.vy = 0;
    this.grounded = this.cc.computedGrounded();
    if (this.grounded && this.vy <= 0) this.leapT = 0;
    this.pos.set(nx, ny - COMPANION.centerOffset, nz);
    if (this.slam === 2 && this.grounded) {
      this.slam = 0;
      this.onSlamLand?.(this.pos.clone(), Math.max(0, this.slamFromY - this.pos.y));
    } else if (this.slam > 0 && (this.slamT > 2.5 || downNow)) this.slam = 0;

    // ── spray ──
    this.sprayingNow = false;
    if (this.sprayTarget && !downNow && canAct && this.dodgeT <= 0) {
      const tgt = this.sprayTarget;
      const m = this.muzzle();
      const dist = m.distanceTo(tgt);
      this.losT -= dt;
      if (this.losT <= 0) {
        this.losT = 0.2;
        const ex = this.sprayEnemy?.collider.handle ?? -1;
        const dir = this.tmpA.copy(tgt).sub(m).normalize();
        const blocked = s.physics.raycast(m, dir, Math.max(0, dist - 0.6), (c) => c.handle !== ex && SOLID.has(s.physics.tagOf(c) ?? ''));
        // never paint through WAI (friendly courtesy: no paint stream across his face)
        const wc = this.tmpB.copy(wai.pos).setY(wai.pos.y + 0.6);
        const along = THREE.MathUtils.clamp(wc.clone().sub(m).dot(dir), 0, dist);
        const across = wc.distanceTo(this.tmpC.copy(m).addScaledVector(dir, along));
        this.losOk = !blocked && across > 0.75;
      }
      let df = Math.atan2(tgt.x - this.pos.x, tgt.z - this.pos.z) - this.facing;
      df = Math.atan2(Math.sin(df), Math.cos(df));
      // a veiled Hush moth soaks paint up: Pip can't shout, but he can WHISTLE it ringing
      const se = this.sprayEnemy as unknown as { veiled?: boolean; onShout?: (big: boolean, from: THREE.Vector3) => void } | null;
      this.whistleCd -= dt;
      const isMoth = (this.sprayEnemy as unknown as { kind?: string } | null)?.kind === 'hushmoth';
      if (se?.veiled && !isMoth) {
        // a veiled boss: paint just soaks in and a whistle is far too small for it — that's WAI's SHOUT to do
      } else if (se?.veiled && typeof se.onShout === 'function') {
        if (this.losOk && dist < COMPANION.sprayRange + 1 && this.whistleCd <= 0) {
          this.whistleCd = 3.2;
          se.onShout(false, this.pos);
          s.ctx.effects.comic(this.pos.clone().add(this.tmpA.set(0, 1.4, 0)), t('TWEEET!'), PIP.body, 0.55);
          s.ctx.audio.play('squeak', { pos: this.pos, pitch: 2.2, vol: 0.7 });
        }
      } else if (this.losOk && dist < COMPANION.sprayRange + 0.5 && Math.abs(df) < 0.5) {
        this.spray.emit(dt, m, tgt);
        this.sprayingNow = true;
      }
    }
    this.spray.update(dt);
  }

  /** World muzzle (computed, not read from the scene graph: valid inside fixed steps). */
  muzzle(): THREE.Vector3 {
    const f = this.forward(this.tmpA);
    return this.muzzleW.set(this.pos.x + f.x * 0.42 + f.z * 0.18, this.pos.y + 0.55, this.pos.z + f.z * 0.42 - f.x * 0.18);
  }

  /** Is Pip lost (fell in the canal / off the island / stuck too long)? */
  needsRescue(): string | null {
    const p = this.pos;
    if (p.y < this.s.killY + 4) return 'fell';
    if (this.s.inWater(p)) return 'canal';
    if (this.stuckT > 7) return 'no-progress';
    if (this.blockedT > 5.5) return 'blocked';
    return null;
  }

  /** Automatic dodging of telegraphed attacks (runs every step, whatever the brain wants): see ./AutoDodge. */
  autoDodge(enemies: EnemyBase[]): string | null {
    return autoDodge(this, enemies);
  }

  render(alpha: number, frameDt: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
    let df = this.facing - this.prevFacing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.model.root.position.copy(this.renderPos);
    this.model.root.quaternion.setFromAxisAngle(UP, this.prevFacing + df * alpha);
    // smudged: WAI's smudge blink (PlayerController.render)
    this.model.root.visible = this.shown && !(this.down > 0 && Math.floor(performance.now() / 80) % 2 === 0);
    // drawn flat on the ground first, a little wider while flat (it's a doodle), then up with an overshoot
    const sq = this.squash;
    const wide = 1 + Math.max(0, 1 - sq) * 0.25;
    this.model.root.scale.set(wide, Math.max(0.02, sq), wide);
    const flash = this.invuln > 0 && this.down <= 0 && Math.floor(this.invuln * 14) % 2 === 0 ? 0.5 : 0;
    let pitch = 0;
    if (this.sprayTarget) {
      const dy = this.sprayTarget.y - (this.pos.y + 0.55);
      pitch = Math.atan2(dy, Math.max(0.5, Math.hypot(this.sprayTarget.x - this.pos.x, this.sprayTarget.z - this.pos.z)));
    }
    this.model.update(frameDt, {
      speed: Math.hypot(this.vel.x, this.vel.z) / COMPANION.run,
      grounded: this.grounded,
      vy: this.vy,
      spraying: this.sprayingNow,
      down: 0,
      hurt: this.down > 0 ? 1 : Math.max(this.hurtFlash, flash),
      cheer: this.cheerT > 0 ? 1 : 0,
      aimPitch: THREE.MathUtils.clamp(pitch, -0.8, 0.9),
      excited: this.mood.excited,
      sleepy: this.mood.sleepy,
      hide: this.mood.hide,
      trip: this.pose.trip,
      dizzy: this.pose.dizzy,
      salute: this.pose.salute,
      mps: Math.hypot(this.vel.x, this.vel.z),
      turn: df * 60,
    });
    this.spray.render();
  }

  dispose(): void {
    this.spray.dispose();
    this.model.dispose();
    try {
      this.s.physics.untag(this.collider);
      this.s.physics.world.removeCharacterController(this.cc);
      this.s.physics.world.removeRigidBody(this.body);
    } catch {
      /* the world may already be freed */
    }
  }
}
