/**
 * [INPUT]: depends on RAPIER (KCC, colliders) from core/PhysicsWorld; GameContext; Damage types from combat/Damage;
 *          Difficulty (paint multiplier, creature tempo) from meta/Difficulty; markActor/fitOutline from render/Materials
 * [OUTPUT]: exports the abstract EnemyBase (damage routing, stagger/TAG, repaint colours, movement, the room leash:
 *           `room` + inRoom/roomAllows/homeward, the fight restart: resetFight / restartFight / onFightReset / refilling,
 *           the "not yet" answer: onIgnored hook + shudder())
 *           and the WeakPoint and HomeRoom types
 * [POS]: the base of every creature and boss. Difficulty lives HERE so creatures inherit it without edits:
 *        maxHp = baseHp × paint multiplier (rescaled live), and ai() runs on dt × tempo (bosses: bossTempo; not during
 *        camera cut-ins; knock-backs, reels and OPENINGS states keep real time).
 *        resetFight() (called by level/FightReset when WAI is smudged on a `bossReset` difficulty) refills a boss's
 *        corruption over REFILL_SEC (AI paused, paint slides off) and asks the subclass to go back to its first phase.
 *        教学敌人的血量与攻击速度以上限 1 倍原值。Size rules (stagger, TAG damage) read baseHp, never maxHp.
 *        A creature given a `room` by its level never steps out of it in move(); its brain asks roomAllows() before a
 *        chase and walks homeward() (via the door) when it finds itself outside.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import type { Damageable, DamageInfo, DamageResult } from '../combat/Damage';
import type { PlayerController } from '../player/PlayerController';
import type { OrganType } from '../organs/Organ';
import { t } from '../i18n';
import { BOSS_HP, Difficulty } from '../meta/Difficulty';
import { BAR_MIN_HP, CreatureBars, type BarSource } from '../render/CreatureBars';
import { contactShadowTexture, fitOutline, markActor } from '../render/Materials';

const PAINT = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'];
const HIT_WORDS = ['SPLAT!', 'SPLOSH!', 'SPLOT!', 'SPLUSH!'];

const HIT_GLOW = new THREE.Color('#ffd0f0');

export interface WeakPoint {
  pos: THREE.Vector3;
  radius: number;
  mul: number;
}

/**
 * A walled room a creature belongs to (floor plan rect + its doorway). The creature never walks out of it on its
 * own feet, chases WAI only while he is in it (or within ROOM_REACH of it), and from outside walks home through
 * the door: first to `doorOut` (just outside), then to `doorIn` (just inside).
 */
export interface HomeRoom {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  doorIn: THREE.Vector3;
  doorOut: THREE.Vector3;
}
/** How far outside its room WAI may stand and still be chased (it stays in the room, at the wall or the door). */
const ROOM_REACH = 6;
/** Keep-out from the room's edge for the creature's own steps. */
const ROOM_EDGE = 0.3;

/**
 * Shared enemy plumbing: kinematic capsule + KCC movement, damage routing with
 * weak points, hit flash, "painted over" blobs, interpolation, presence.
 */
export abstract class EnemyBase implements Damageable, BarSource {
  readonly damageable = true as const;
  abstract readonly kind: string;
  abstract readonly displayName: string;
  /** 0 small … 1 huge: drives presence (shake, ink vignette, music). */
  abstract readonly bigness: number;
  readonly drops: OrganType | null = null;
  maxHp: number;
  hp: number;
  /** Corruption as drawn (Gentle). maxHp = baseHp × the difficulty's paint multiplier; size rules read baseHp. */
  readonly baseHp: number;
  /** The paint multiplier maxHp was built with (re-synced live when the difficulty changes). */
  private hpMulNow: number;
  /**
   * 教学敌人最高使用原定血量和攻击速度。轻松难度可进一步调低。
   */
  protected teaching = false;
  state = 'IDLE';
  stateT = 0;
  readonly body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  protected cc: RAPIER.KinematicCharacterController;
  readonly pos = new THREE.Vector3();
  protected prevPos = new THREE.Vector3();
  readonly renderPos = new THREE.Vector3();
  facing = 0;
  protected prevFacing = 0;
  protected vy = 0;
  readonly root = new THREE.Group();
  /** Group that paint blobs stick to (moves with the body). */
  protected paintAnchor: THREE.Object3D = this.root;
  protected flash = 0;
  /** Materials recoloured as the creature gets repainted (corrupted → vivid). */
  private repaintMats: { mat: THREE.MeshToonMaterial; from: THREE.Color; to: THREE.Color; em: THREE.Color }[] | null = null;
  private repaintShown = 0;
  /** Hit reaction springs: squash (jelly) and a flinch away from the paint. */
  private jig = 0;
  private jigV = 0;
  private flinch = new THREE.Vector3();
  private flinchV = new THREE.Vector3();
  private hitGlow = 0;
  /** Stagger: every quarter of corruption painted away, the creature reels (attack interrupted). */
  protected staggerT = 0;
  private staggerMax = 1;
  private staggersDone = 0;
  private comicCd = 0;
  private knockVel = new THREE.Vector3();
  private knockT = 0;
  private lastPaint = '#2a4be0';
  private flashCd = 0;
  readonly home: THREE.Vector3;
  /** The walled room it belongs to (null: open ground, the home-distance leash only). Set by the level. */
  room: HomeRoom | null = null;
  /** Walking home from outside its room: reached the outer door point, now going in. */
  private viaDoor = false;
  alerted = false;
  disposed = false;
  /** Set by the session to drop organs / count kills. */
  onFinished: ((e: EnemyBase) => void) | null = null;
  /** Set by the session / director: a restarted fight's outside state (summons repainted, arena marks back). */
  onFightReset: ((e: EnemyBase) => void) | null = null;
  protected cOff: number;

  constructor(
    protected ctx: GameContext,
    readonly id: string,
    start: THREE.Vector3,
    hp: number,
    radius: number,
    halfHeight: number,
  ) {
    this.baseHp = hp;
    this.hpMulNow = Difficulty.hpMul(hp);
    this.maxHp = this.hp = hp * this.hpMulNow;
    this.home = start.clone();
    this.cOff = radius + halfHeight;
    const w = ctx.physics.world;
    this.body = w.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + this.cOff + 0.02, start.z));
    this.collider = w.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), this.body);
    ctx.physics.tag(this.collider, 'enemy', this);
    this.cc = w.createCharacterController(0.03);
    this.cc.enableSnapToGround(0.4);
    this.cc.enableAutostep(0.3, 0.2, false);
    this.cc.setSlideEnabled(true);
    this.pos.copy(start);
    this.prevPos.copy(start);
    this.renderPos.copy(start);
    this.root.userData.paintDynamic = true;
    this.root.userData.noFade = true; // creatures never ghost out (the camera collides with big ones instead)
    // the renderer calls this before compiling shaders, so the actor look costs no hitch later
    this.root.userData.wdPrep = () => this.prepareLook();
    ctx.root.add(this.root);
    // ordinary creatures get the small corruption bar (bosses keep their HUD bar; swarm gets none)
    if (hp >= BAR_MIN_HP && hp < BOSS_HP) CreatureBars.for(ctx.root, ctx.camera).add(this);
  }

  // ───── the small corruption bar (render/CreatureBars reads these) ─────
  barHitAt = 0;
  barDoneAt = 0;
  get barHeight(): number {
    // over the head, but never far above a tall thin one (a lamp post's capsule reaches past its lantern)
    return Math.min(this.cOff * 2, 3.8) * this.sizeMul + 0.45;
  }

  /**
   * Bosses and mid-bosses (base paint ≥ 1000) are immovable by WAI: his body, stomps, slams, shouts and TAGs never
   * shove them. Their own scripted moves (move()) still work.
   */
  get immovable(): boolean {
    return this.baseHp >= BOSS_HP;
  }

  // ───── look (render only): actor shading, distance-fitted ink, contact shadow ─────
  private hulls: THREE.Mesh[] | null = null;
  private blob: THREE.Mesh | null = null;
  private blobGround = 0;
  private blobHasGround = false;
  private blobTick = 0;
  private static readonly DOWN = new THREE.Vector3(0, -1, 0);
  private static readonly probe = new THREE.Vector3();

  /** Idempotent: paint-ready materials tagged as an actor, plus a soft contact shadow. */
  prepareLook(): void {
    if (this.hulls) return;
    this.ctx.effects.ensurePaint()?.prepare(this.root);
    this.hulls = markActor(this.root);
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#1a0c24', map: contactShadowTexture(), transparent: true, opacity: 0.34, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    );
    blob.renderOrder = 1;
    blob.name = 'contact-shadow';
    this.blob = blob;
    this.ctx.root.add(blob);
  }

  private renderLook(): void {
    this.prepareLook();
    const cam = this.ctx.camera.camera.position;
    // ink keeps ≈1.6 px at any distance (world-unit hulls vanished below 1 px past ~25 m)
    const d = cam.distanceTo(this.root.position);
    const want = Math.min(0.14, d * 0.0021) / Math.max(0.3, this.sizeMul);
    for (const h of this.hulls!) fitOutline(h, Math.max((h.userData.ink?.base as number) ?? 0.03, want));
    const blob = this.blob!;
    blob.visible = this.root.visible && !this.disposed;
    if (!blob.visible) return;
    if (--this.blobTick <= 0) {
      this.blobTick = 8;
      const p = EnemyBase.probe.copy(this.renderPos);
      p.y += 0.6;
      const hit = this.ctx.physics.raycast(p, EnemyBase.DOWN, 8, (c) => {
        const tag = this.ctx.physics.tagOf(c);
        return tag === 'static' || tag === 'host' || tag === 'undrawn' || tag === 'gate';
      });
      this.blobHasGround = !!hit;
      if (hit) this.blobGround = hit.point.y;
    }
    const above = this.renderPos.y - this.blobGround;
    if (!this.blobHasGround || above > 4) {
      blob.visible = false;
      return;
    }
    const r = Math.max(0.7, this.bodyRadius * 2.6) * this.sizeMul * (1 - Math.min(0.5, Math.max(0, above) * 0.12));
    blob.position.set(this.root.position.x, this.blobGround + 0.03, this.root.position.z);
    blob.scale.set(r, 1, r);
    (blob.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - Math.min(1, Math.max(0, above) / 4));
  }

  get harmless(): boolean {
    return this.state === 'STUNNED' || this.state === 'CALM' || this.state === 'DEAD';
  }

  protected setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  /** World-space weak points this frame. */
  protected weakPoints(): WeakPoint[] {
    return [];
  }

  /** Override for special rules (absorbing shots…). Return null to use defaults. */
  protected preDamage(_info: DamageInfo): DamageResult | null {
    return null;
  }

  /** HP can't drop below this in one go (bosses gate their phases with it). */
  protected hpFloor(): number {
    return 0;
  }

  applyDamage(info: DamageInfo): DamageResult {
    if (this.harmless || this.refillT > 0) return { weak: false, absorbed: true };
    const pre = this.preDamage(info);
    if (pre) return pre;
    let mul = 1;
    let weak = false;
    // a TAG / ENCORE stamp is a fixed bite: weak points only count for paint, spit and slams
    // a TAG / ENCORE stamp / PAINT SLAM is a fixed bite: weak points only multiply paint and spit
    if (!info.tag && !info.fixed) for (const wp of this.weakPoints()) {
      if (info.point.distanceTo(wp.pos) < wp.radius) {
        mul = Math.max(mul, wp.mul);
        weak = true;
      }
    }
    // a TAG lands with the full weak-hit punch (flash, wobble, glow), whatever its number
    if (info.tag) weak = true;
    const before = this.repaint;
    this.hp = Math.max(this.hpFloor(), this.hp - info.amount * mul);
    this.barHitAt = performance.now();
    if (info.color) this.lastPaint = info.color;
    // comic onomatopoeia (throttled): readable "you're landing it"
    if (this.comicCd <= 0 && this.hp > 0 && !info.tag) {
      this.comicCd = weak ? 0.3 : 0.5;
      const word = weak ? t('BULLSEYE!') : t(HIT_WORDS[Math.floor(Math.random() * HIT_WORDS.length)]);
      const at = info.point.clone().add(new THREE.Vector3(0, 0.3, 0)).addScaledVector(info.dir, -0.4);
      this.ctx.effects.comic(at, word, weak ? '#ffd23a' : info.color ?? '#ffffff', (weak ? 0.75 : 0.5) * (0.7 + this.bigness * 0.5));
    }
    // stagger thresholds (big creatures only)
    if (this.baseHp >= 150 && this.hp > 0) {
      const q = Math.floor(this.repaint * 4);
      if (q > this.staggersDone && q > Math.floor(before * 4)) {
        this.staggersDone = q;
        // a quarter crossed by a TAG is used up without a new reel: no TAG → reel → TAG chains through a creature
        if (!info.tag) this.stagger(info);
      }
    }
    // flash pulses (never a constant white-out under a continuous stream)
    if (this.flashCd <= 0) {
      this.flash = weak ? 0.07 : 0.045;
      this.flashCd = weak ? 0.16 : 0.24;
    }
    // impact feel: smaller creatures wobble more, big ones shudder
    const soft = 1 - this.bigness * 0.6;
    const k = info.kind === 'paint' ? 1 : 6;
    this.jigV += (weak ? 1.1 : 0.55) * soft * k;
    const push = info.dir.clone().setY(0);
    if (push.lengthSq() > 1e-4) this.flinchV.addScaledVector(push.normalize(), (weak ? 0.5 : 0.22) * soft * k);
    this.hitGlow = Math.min(0.7, this.hitGlow + (weak ? 0.3 : 0.08));
    if (info.kind === 'spit') this.paintAt(info.point, info.color ?? '#2a4be0', 0.7);
    this.onHit(info, weak);
    if (!this.alerted) this.alert();
    if (this.hp <= 0) {
      this.finish();
      return { weak, finished: true };
    }
    return { weak };
  }

  protected onHit(_info: DamageInfo, _weak: boolean): void {}

  /** Reel back: interrupts whatever it was doing (subclasses cancel attacks in interrupt()). */
  protected stagger(info: DamageInfo): void {
    this.staggerMax = this.staggerT = 0.55 + this.bigness * 0.5;
    this.tagSpent = false; // a fresh reel = one fresh TAG
    this.interrupt();
    this.jigV += 6;
    const push = info.dir.clone().setY(0);
    if (push.lengthSq() > 1e-4) this.flinchV.addScaledVector(push.normalize(), 2.2);
    const top = this.pos.clone().add(new THREE.Vector3(0, this.cOff * 1.6, 0));
    this.ctx.effects.comic(top, t('WOBBLE!'), '#22c4c0', 0.8 + this.bigness * 0.4);
    for (const c of [this.lastPaint, PAINT[(this.staggersDone + 1) % 5]]) this.ctx.effects.burst(top, c, 12, 5, 0.08, 14);
    this.ctx.audio.play('squeak', { pos: top, pitch: 0.45 });
    this.ctx.audio.play('splat', { pos: top, vol: 0.8, pitch: 0.7 });
    this.ctx.time.hitstop(0.07);
    this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 3);
  }

  /** Top of the body (for stomping on heads). */
  get topY(): number {
    return this.pos.y + this.cOff * 2;
  }

  get bodyRadius(): number {
    return this.cOff * 0.5;
  }

  /** A thrown rock/can hit it: on a weak point, the attack being wound up is cancelled. */
  interruptBy(weak: boolean): void {
    if (!weak || this.harmless) return;
    this.interrupt();
    this.ctx.events.emit('enemy:interrupted', { id: this.id });
    this.jigV += 5;
    this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, this.cOff * 2 + 0.6, 0)), t('INTERRUPTED!'), '#22c4c0', 0.6 + this.bigness * 0.4);
  }

  /** Can WAI TAG this one right now (reeling)? */
  get canBeTagged(): boolean {
    return this.staggerT > 0.05 && this.bigness >= 0.3 && !this.harmless && !this.tagSpent;
  }

  /** Can an ENCORE chain follow a TAG right now? (the Eraser refuses at a phase gate: the roar wins) */
  get allowsEncore(): boolean {
    return true;
  }

  /** One TAG (+ its ENCORE chain) per reel: set when tagged, cleared by the next stagger. Stops TAG-mashing stagger-locks. */
  tagSpent = false;

  /** Keep reeling a little longer (the finisher is landing). */
  holdStagger(sec: number): void {
    this.staggerT = Math.max(this.staggerT, sec);
    this.staggerMax = Math.max(this.staggerMax, this.staggerT);
  }

  /** Snap out of the reel early (an ENCORE stamp slipped). */
  releaseStagger(sec = 0.05): void {
    this.staggerT = Math.min(this.staggerT, sec);
  }

  /** Shove the whole creature (big hits): slides back, decelerating. */
  knock(dir: THREE.Vector3, speed: number): void {
    if (this.immovable) {
      this.jigV += 4; // a boss shudders, it is not shoved
      return;
    }
    this.knockVel.copy(dir).setY(0).normalize().multiplyScalar(speed);
    this.knockT = 0.35;
    this.jigV += 8;
  }

  /** Cancel the current attack (stagger). Default: nothing to cancel. */
  protected interrupt(): void {}

  /**
   * Fully repainted: corruption bursts into colour. The ground around it
   * blooms with real paint, a comic "REPAINTED!" stamps in, time slows.
   */
  protected bloom(): void {
    const big = this.bigness;
    const c = this.pos.clone();
    const n = Math.round(8 + big * 16);
    const down = new THREE.Vector3(0, -1, 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      const r = 0.6 + Math.random() * (1.4 + big * 2.6);
      const from = c.clone().add(new THREE.Vector3(Math.cos(a) * r, 2, Math.sin(a) * r));
      const hit = this.ctx.physics.raycast(from, down, 5, (col) => {
        const tag = this.ctx.physics.tagOf(col);
        return tag === 'static' || tag === 'host' || tag === 'gate';
      });
      if (!hit) continue;
      const col = PAINT[(i + Math.floor(Math.random() * 2)) % 5];
      const out = new THREE.Vector3(Math.cos(a), -1.2, Math.sin(a)).normalize();
      this.ctx.effects.splat(hit.point, hit.normal, col, 0.5 + Math.random() * (0.5 + big * 0.6), out, { drip: 0.4 });
    }
    const top = c.clone().add(new THREE.Vector3(0, this.cOff * 1.8 + 0.4, 0));
    for (const col of PAINT) this.ctx.effects.burst(top, col, 6 + Math.round(big * 8), 4 + big * 4, 0.07 + big * 0.05);
    this.ctx.effects.ring(c.clone().add(new THREE.Vector3(0, 0.06, 0)), '#ffffff', 3 + big * 6);
    this.ctx.effects.comic(top.clone().add(new THREE.Vector3(0, 0.4, 0)), t('REPAINTED!'), '#ff4fa3', 0.9 + big * 0.7);
    this.ctx.audio.play('splat', { pos: c, vol: 1, pitch: 0.55 });
    this.ctx.audio.play('reveal', { pos: c, vol: 0.8 });
    this.ctx.time.hitstop(0.08 + big * 0.08);
    if (big >= 0.5) this.ctx.time.slowmo(0.35, 0.55 + big * 0.3);
    this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 4 + big * 4);
  }

  protected alert(): void {
    this.alerted = true;
    this.ctx.events.emit('enemy:noticed', { id: this.id });
  }

  /** Dev tools: repaint it instantly through the normal "finished" path (drops, events, story). */
  debugRepaint(): void {
    if (this.harmless || this.disposed || this.hp <= 0) return;
    this.hp = 0;
    this.finish();
  }

  protected finish(): void {
    this.barDoneAt = performance.now();
    this.bloom();
    this.setState('STUNNED');
    this.ctx.events.emit('enemy:stunned', { id: this.id, kind: this.kind });
    this.onFinished?.(this);
  }

  /** Real paint on the creature's body (wraps the mesh, drips). */
  protected paintAt(world: THREE.Vector3, color: string, size: number): void {
    const centre = this.pos.clone().add(new THREE.Vector3(0, this.cOff, 0));
    const dir = centre.sub(world).normalize();
    this.ctx.effects.splat(world, dir.clone().negate(), color, size, dir, { drip: 1 });
  }

  protected faceToward(target: THREE.Vector3, dt: number, rate = 8): void {
    const dx = target.x - this.pos.x;
    const dz = target.z - this.pos.z;
    if (dx * dx + dz * dz < 1e-4) return;
    const want = Math.atan2(dx, dz);
    let d = want - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += d * Math.min(1, dt * rate);
  }

  forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
  }

  protected canSee(p: THREE.Vector3, eyeHeight = 1.5): boolean {
    const from = this.pos.clone().add(new THREE.Vector3(0, eyeHeight, 0));
    const to = p.clone().add(new THREE.Vector3(0, 0.6, 0));
    const dir = to.clone().sub(from);
    const d = dir.length();
    dir.normalize();
    return !this.ctx.physics.raycast(from, dir, d, (c) => this.ctx.physics.tagOf(c) === 'static');
  }

  // ───── the room leash (HomeRoom) ─────
  /** Is `p` in its room (grown by `m`)? Always true without a room. */
  protected inRoom(p: THREE.Vector3, m = 0): boolean {
    const r = this.room;
    return !r || (p.x > r.x0 - m && p.x < r.x1 + m && p.z > r.z0 - m && p.z < r.z1 + m);
  }

  /** May it chase WAI at `p`? Only from inside its room, at WAI in it or close by. */
  protected roomAllows(p: THREE.Vector3): boolean {
    return this.inRoom(this.pos) && this.inRoom(p, ROOM_REACH);
  }

  /** Where to walk for `goal` near home: the goal itself inside the room, else the way in through the door. */
  protected homeward(goal: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const r = this.room;
    if (!r) return out.copy(goal);
    const inside = this.inRoom(this.pos);
    // coming in: right through the doorway to `doorIn` before turning (a long body snags on the jamb otherwise)
    if (this.viaDoor && Math.hypot(this.pos.x - r.doorIn.x, this.pos.z - r.doorIn.z) < 0.8) this.viaDoor = false;
    if (inside && !this.viaDoor) return out.copy(this.inRoom(goal) ? goal : this.home);
    // at the outer door point, or already in the doorway (nearer the inner point than the outer one is)
    if (!inside && !this.viaDoor && (Math.hypot(this.pos.x - r.doorOut.x, this.pos.z - r.doorOut.z) < 1.2 || Math.hypot(this.pos.x - r.doorIn.x, this.pos.z - r.doorIn.z) < 3)) this.viaDoor = true;
    return out.copy(this.viaDoor ? r.doorIn : r.doorOut);
  }

  /** Collide-and-slide move. Returns the actual horizontal distance moved. */
  /** Visual size multiplier (the repainted Eraser shrinks back into a little eraser). */
  sizeMul = 1;
  protected bodyless = false;

  /** Keep the creature visible but take it out of the physics world (nothing to bump into). */
  /**
   * Where a body of radius r at `p` must move so it no longer overlaps this creature (null = no
   * overlap). Kinematic creatures that turn or lunge into WAI otherwise leave him inside them.
   */
  pushOut(_p: THREE.Vector3, _r: number): THREE.Vector3 | null {
    // opt-in per creature (the Eraser's block); flyers like the Hush must let WAI close in on their core
    return null;
  }

  /** A gated boss ignored a hit (not fighting yet): the session's NotYet (src/level/NotYet.ts) answers it. */
  onIgnored: ((at: THREE.Vector3, how: 'paint' | 'shout', color?: string) => void) | null = null;

  /** A shrug: the hit-reaction spring alone, no damage. */
  shudder(k: number): void {
    this.jigV += k;
  }

  dropCollider(): void {
    if (this.bodyless || this.disposed) return;
    this.bodyless = true;
    // every collider on the body (a boss's extra block too) stops counting as the creature
    for (let i = 0; i < this.body.numColliders(); i++) this.ctx.physics.untag(this.body.collider(i));
    this.ctx.physics.untag(this.collider);
    this.ctx.physics.world.removeRigidBody(this.body);
  }

  protected move(vx: number, vz: number, dt: number, exclude?: number): number {
    if (this.bodyless) return 0;
    // never step out of its room (chases, runs and shoves alike); a repainted creature is free
    const R = this.room;
    if (R && !this.harmless && this.inRoom(this.pos)) {
      const nx = this.pos.x + vx * dt, nz = this.pos.z + vz * dt;
      if ((vx < 0 && nx < R.x0 + ROOM_EDGE) || (vx > 0 && nx > R.x1 - ROOM_EDGE)) vx = 0;
      if ((vz < 0 && nz < R.z0 + ROOM_EDGE) || (vz > 0 && nz > R.z1 - ROOM_EDGE)) vz = 0;
    }
    // never walk off a ledge (canal, roof edges): probe the ground ahead
    if (vx * vx + vz * vz > 1e-4) {
      const len = Math.hypot(vx, vz);
      const r = (this.collider.shape as unknown as { radius?: number }).radius ?? 0.5;
      const probe = this.pos.clone().add(new THREE.Vector3((vx / len) * (r + 0.45), 0.6, (vz / len) * (r + 0.45)));
      const ground = this.ctx.physics.raycast(probe, new THREE.Vector3(0, -1, 0), 1.6, (c) => {
        const tag = this.ctx.physics.tagOf(c);
        return tag === 'static' || tag === 'host' || tag === 'undrawn' || tag === 'gate';
      });
      if (!ground) {
        vx = 0;
        vz = 0;
      }
    }
    this.vy = Math.max(-25, this.vy - 24 * dt);
    const desired = { x: vx * dt, y: this.vy * dt, z: vz * dt };
    this.cc.computeColliderMovement(this.collider, desired, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => c.parent()?.handle !== this.body.handle && c.handle !== exclude);
    const mv = this.cc.computedMovement();
    if (this.cc.computedGrounded()) this.vy = -1;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    this.pos.set(t.x + mv.x, t.y + mv.y - this.cOff, t.z + mv.z);
    if (this.pos.y < this.home.y - 2.5) {
      // fell somewhere it shouldn't be: pop back home
      this.body.setTranslation({ x: this.home.x, y: this.home.y + this.cOff + 0.05, z: this.home.z }, true);
      this.body.setNextKinematicTranslation({ x: this.home.x, y: this.home.y + this.cOff + 0.05, z: this.home.z });
      this.pos.copy(this.home);
      this.prevPos.copy(this.home);
      this.vy = 0;
      return 0;
    }
    return Math.hypot(mv.x, mv.z);
  }

  /** Difficulty changed mid-level: rescale corruption, keeping how much is already painted away. */
  protected syncToughness(): void {
    const want = this.hpMultiplier();
    if (want === this.hpMulNow) return;
    const k = want / this.hpMulNow;
    this.hpMulNow = want;
    this.maxHp *= k;
    this.hp *= k;
  }

  protected hpMultiplier(): number {
    const scale = Difficulty.hpMul(this.baseHp);
    return this.teaching ? Math.min(1, scale) : scale;
  }

  /**
   * WAI's openings, by the state names every creature shares: harder difficulties make attacks come sooner,
   * never the openings shorter (a stuck Stapler, a chewing Chomper, a dazed boss keep their drawn length).
   */
  static readonly OPENINGS: ReadonlySet<string> = new Set(['STUCK', 'DAZED', 'DIZZY', 'TIRED', 'STRANDED', 'CHEW', 'TANGLED', 'FLIPPED', 'OPEN']);

  /**
   * Creature clock for this step: the difficulty's tempo (telegraphs, cooldowns, moves, projectiles all
   * run on it), but never faster than drawn while the camera plays a cut-in (boss intros stay fair) or in an opening.
   */
  protected get tempo(): number {
    if (this.ctx.camera.inCine || EnemyBase.OPENINGS.has(this.state)) return 1;
    const rate = Difficulty.tempoFor(this.baseHp);
    return this.teaching ? Math.min(1, rate) : rate;
  }

  // ───── 困难模式：WAI 被抹花后重开头目战 ─────
  /** Seconds the corruption takes to flow back: the boss bar visibly refills. */
  static readonly REFILL_SEC = 1.4;
  private refillT = 0;
  private refillFrom = 0;

  /** Is the corruption flowing back after a restart (AI paused, paint slides off)? */
  get refilling(): boolean {
    return this.refillT > 0;
  }

  /**
   * The boss fight starts over: the subclass goes back to its first phase (restartFight), every reel and TAG is
   * cleared, the session repaints its summons (onFightReset), and the corruption flows back to full.
   * Intro cut-ins never replay: their once-flags (`woke`, `awake`) are not part of a restart.
   */
  resetFight(): void {
    if (this.harmless || this.disposed) return;
    this.restartFight();
    this.staggerT = this.knockT = this.onTopT = 0;
    this.staggersDone = 0;
    this.tagSpent = false;
    this.refillFrom = this.hp;
    this.refillT = EnemyBase.REFILL_SEC;
    this.onFightReset?.(this);
    const top = this.pos.clone().setY(this.topY + 1);
    this.ctx.effects.comic(top, t('GOOD AS NEW!'), '#e8323c', 1.1);
    this.ctx.effects.burst(top, '#c0182c', 24, 5, 0.1);
    this.ctx.audio.play('phaseSting', { pos: this.pos, pitch: 0.8 });
    this.ctx.events.emit('toast', { text: t('{name} got all its paint back — the fight starts over!', { name: t(this.displayName) }), kind: 'warn' });
  }

  /** Subclass part of resetFight(): first phase, phase gates, attack timers, tells and its own hazards / helper gone. */
  protected restartFight(): void {}

  private onTopT = 0;
  private static readonly _off = new THREE.Vector3();

  /**
   * WAI standing (or bouncing) on a boss's head never loops a state: after a moment it bucks him off, sideways,
   * without damage. Ordinary creatures keep the stomp game.
   */
  private shakeOff(dt: number, player: PlayerController): void {
    // (the co-op partner can be the target here: she has a leap too, so she is shaken off the same way)
    if (!this.immovable || this.harmless || this.bodyless || player.smudged || typeof player.leap !== 'function') return;
    const flat = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    // standing on it, or bouncing on it (a stomp bounce peaks ~3.3 m over the head)
    const onTop = flat < this.bodyRadius * 1.6 + 0.6 && player.pos.y > this.topY - 0.5 && player.pos.y < this.topY + 4;
    this.onTopT = onTop ? this.onTopT + dt : Math.max(0, this.onTopT - dt * 0.5);
    if (this.onTopT < 0.6) return;
    this.onTopT = 0;
    const away = EnemyBase._off.set(player.pos.x - this.pos.x, 0, player.pos.z - this.pos.z);
    if (away.lengthSq() < 1e-4) away.copy(this.forward());
    player.leap(away.normalize(), this.bodyRadius * 2 + 2.2, 7);
    this.jigV += 6;
    this.ctx.effects.comic(this.pos.clone().setY(this.topY + 0.8), t('SHOO!'), '#ff8a7a', 0.8);
    this.ctx.audio.play('kick', { pos: this.pos, vol: 0.7 });
  }

  /** Per fixed step. */
  step(dt: number, player: PlayerController): void {
    this.prevPos.copy(this.pos);
    this.prevFacing = this.facing;
    this.syncToughness();
    if (this.refillT > 0) {
      // a restarted fight: the corruption flows back (eased), the boss gathers itself
      this.refillT = Math.max(0, this.refillT - dt);
      const k = 1 - this.refillT / EnemyBase.REFILL_SEC;
      this.hp = this.refillFrom + (this.maxHp - this.refillFrom) * k * k * (3 - 2 * k);
      return;
    }
    this.shakeOff(dt, player);
    const realDt = dt;
    dt *= this.tempo;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - realDt);
    this.flashCd -= realDt;
    this.comicCd -= realDt;
    // knock-backs and reels are WAI's openings: they keep real time at every difficulty
    if (this.knockT > 0) {
      this.knockT -= realDt;
      this.move(this.knockVel.x, this.knockVel.z, realDt);
      this.knockVel.multiplyScalar(Math.exp(-6 * realDt));
      if (this.staggerT > 0) this.staggerT -= realDt;
      return;
    }
    if (this.staggerT > 0) {
      // reeling: no thinking, attacks frozen (stateT doesn't run)
      this.staggerT -= realDt;
      this.stateT -= dt;
      return;
    }
    this.ai(dt, player);
    this.watchdog();
  }

  /**
   * No wind-up waits for ever: a telegraph state (…_TELL, INHALE, AIM, BEAM) that has run 15 s is a soft-lock
   * (its exit waits on something that never comes). Cancel it the way a thrown rock would.
   */
  private watchdog(): void {
    if (this.stateT < 15 || this.harmless) return;
    const s = this.state;
    if (!(s.endsWith('_TELL') || s === 'INHALE' || s === 'AIM' || s === 'BEAM')) return;
    console.warn(`[EnemyBase] ${this.id}: ${s} ran ${this.stateT.toFixed(0)} s — cancelled`);
    this.interrupt();
    if (this.state === s) this.stateT = 0;
  }

  protected abstract ai(dt: number, player: PlayerController): void;

  /** How much of the corruption has been painted away (0..1). */
  get repaint(): number {
    return 1 - this.hp / this.maxHp;
  }

  private updateRepaintColours(dt: number): void {
    if (!this.repaintMats) {
      // give every body part its own paint texture before we cache materials
      this.ctx.effects.ensurePaint()?.prepare(this.root);
      const vivid = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'];
      this.repaintMats = [];
      let i = 0;
      const seen = new Set<THREE.Material>();
      this.root.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
        if (!m || seen.has(m) || !(m as THREE.MeshToonMaterial).color || !(m as unknown as THREE.MeshStandardMaterial).isMeshStandardMaterial || o.userData.isOutline) return;
        seen.add(m);
        const textured = !!(m as unknown as THREE.MeshStandardMaterial).map;
        const to = new THREE.Color(vivid[i++ % vivid.length]);
        // textured (sculpted) parts get a lighter tint so the paint texture still shows
        if (textured) to.lerp(new THREE.Color('#ffffff'), 0.45);
        else to.lerp(m.color.clone(), 0.25);
        this.repaintMats!.push({ mat: m, from: m.color.clone(), to, em: m.emissive.clone() });
      });
    }
    const target = this.state === 'CALM' ? 1 : this.repaint;
    this.repaintShown += (target - this.repaintShown) * Math.min(1, dt * 6);
    this.hitGlow = Math.max(0, this.hitGlow - dt * 4);
    const glow = this.hitGlow * this.hitGlow;
    for (const r of this.repaintMats) {
      r.mat.color.copy(r.from).lerp(r.to, this.repaintShown * 0.85);
      r.mat.emissive.copy(r.em).lerp(HIT_GLOW, glow * 0.3);
    }
  }

  render(alpha: number, frameDt: number): void {
    this.updateRepaintColours(frameDt);
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha);
    let df = this.facing - this.prevFacing;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    // springs: jelly squash + flinch, critically-ish damped
    const dt = Math.min(0.05, frameDt);
    this.jigV += (-this.jig * 260 - this.jigV * 14) * dt;
    this.jig = THREE.MathUtils.clamp(this.jig + this.jigV * dt, -0.22, 0.22);
    this.flinchV.addScaledVector(this.flinch, -180 * dt).multiplyScalar(Math.exp(-13 * dt));
    this.flinch.addScaledVector(this.flinchV, dt);
    if (this.flinch.length() > 0.35) this.flinch.setLength(0.35);
    this.root.position.copy(this.renderPos).add(this.flinch);
    this.root.rotation.set(0, this.prevFacing + df * alpha, 0);
    this.root.scale.set(1 + this.jig * 0.5, 1 - this.jig, 1 + this.jig * 0.5).multiplyScalar(this.sizeMul);
    if (this.staggerT > 0) {
      // reel back and wobble
      const k = this.staggerT / this.staggerMax;
      const s = Math.sin((1 - k) * Math.PI);
      this.root.rotateX(-0.28 * s * (1 - this.bigness * 0.4));
      this.root.rotateZ(Math.sin(performance.now() / 45) * 0.06 * k);
    }
    this.animate(frameDt);
    this.renderLook();
  }

  protected abstract animate(dt: number): void;

  /** Is this enemy actively fighting (for music / presence)? */
  get engaged(): boolean {
    return this.alerted && !this.harmless;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.parent?.remove(this.root);
    this.blob?.removeFromParent();
    if (!this.bodyless) {
      this.ctx.physics.untag(this.collider);
      this.ctx.physics.world.removeRigidBody(this.body);
    }
  }
}
