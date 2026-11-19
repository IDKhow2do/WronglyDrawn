/**
 * [INPUT]: depends on EnemyBase (KCC body, weak points, stagger, finish, the room leash) from ./EnemyBase; RulerSnakeLook/makeLane/
 *          measureTicks/strikeLine (the hinged ruler body, the red line decal, the marker ticks and strike) from ./RulerSnakeLook; RAPIER (extra ball colliders on the body);
 *          rulerTuning (reach, tell, damage, rest, cooldown) from meta/Difficulty; screenMark from render/ScreenMarks;
 *          SOUND_GLYPH (the hit burst on ctx.effects.sound) from render/SoundFx
 * [OUTPUT]: exports the RulerSnake enemy (kind 'rulersnake'), the Straightenable contract its level platforms implement,
 *           the `measuring` / `whipLine` read-outs, the onMeasured hook and `counterHint` (English source: callers wrap it in t())
 * [POS]: level-3 creature (Limp Works). It MEASURES and STRAIGHTENS. Its crooked platforms: it lies dead straight at one's
 *        anchor for 2 s and the platform snaps straight and falls. WAI: from up to `reach` m it rears, rules a red
 *        measuring line through him (ticks race down it, the aim locks), then WHIPS flat along the whole line and lies
 *        there stretched out (REST: the whole ruler takes double paint). Counter: step off the line (or jump it), then
 *        paint it while it lies flat. Varnished wood: paint slides off elsewhere (×0.6). At half repainted it is TOO BENDY
 *        to measure platforms. Siblings: CompassSpinner (circles), the level's StampPress.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { RAPIER } from '../core/PhysicsWorld';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { PAL } from '../render/PaintTextures';
import { SOUND_GLYPH } from '../render/SoundFx';
import { screenMark } from '../render/ScreenMarks';
import { rulerTuning } from '../meta/Difficulty';
import { LANE_HALF, LANE_LEN, RulerSnakeLook, SEGS, SEG_L, makeLane, measureTicks, strikeLine } from './RulerSnakeLook';

/** A level platform the Ruler Snake can straighten (the level's platform class implements it). */
export interface Straightenable {
  /** Where the snake stands to measure it (solid floor at the platform's root). */
  readonly anchor: THREE.Vector3;
  /** Centre of the platform's top surface. */
  readonly center: THREE.Vector3;
  /** Crooked and in place (can be straightened now)? */
  readonly crooked: boolean;
  /** The snake starts measuring it (the platform shows red ruler ticks for `sec`). */
  beginMeasure(sec: number): void;
  /** Measuring stopped early (the snake was staggered / painted too bendy / repainted). */
  cancelMeasure(): void;
  /** Measured: the platform snaps straight and falls (the platform owns its fall and its return). */
  straighten(): void;
}

// ───────────── tuning ─────────────
const HP = 260;
const SIGHT = 13; // alert range
const HOME_R = 12; // only platforms whose centre is this close to home
const ON_R = 2; // WAI's feet this close (horizontally) to a platform's centre = he stands on it
const MEASURE_T = 2.0; // lying straight before the platform falls
const MEASURE_CD = 3.5;
const MEASURE_MUL = 2; // paint while it measures, and while it lies stretched out after a whip
const VARNISH = 0.6; // paint anywhere else: it slides off the varnished wood
const BENDY = 0.5; // repaint at which it can never measure again
// the whip (reach / tell / damage / rest / cooldown: RULER rows in meta/Difficulty)
const AIM_LOCK = 0.35; // the line stops following WAI this long before the whip
const WHIP_T = 0.2; // the whole ruler shoots down its line in this long
const SLAM_T = 0.08; // the reared front half drops flat first
const HIT_HALF = 0.75; // half width of what the whip sweeps (the drawn line shows exactly this)
const MIN_LANE = 3; // shorter than this (a wall, a drop): no whip, it repositions
const PAST = 1.0; // the line runs this far past WAI (the base stops short of where he stood: never lands under him)
const KEEP = [2.8, 5.2]; // the distance it keeps from WAI between whips
const JUMP_CLEAR = 0.85; // WAI's feet this high over the floor: the whip passes under him
const WHIP_KNOCK = 6;
const TICK = 0.5; // the measuring ticks along the line (m)
const SPEED = { wander: 1.2, chase: 2.6, go: 2.9, calm: 1.5 };
const FRONT = { len: 0.5, pitch: 0.42, rearLen: SEG_L * 4, rearPitch: 1.0 }; // the lifted neck; the reared front half
const WEAVE = 0.55; // S-curve: heading swings ±this (rad)
const TRAIL_N = 96; // ring buffer of head positions…
const TRAIL_STEP = 0.05; // …one every 5 cm (4.8 m: more than the body)
const BALL_R = 0.19; // paint colliders along the body
const BALLS = SEGS - 1;
/** Zigzag the repainted body settles into (cumulative per joint, × repaint). */
const CROOK = [0, 0.8, -1, 0.65, -0.95, 1, -0.55, 0.9];
const VIVID = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'].map((c) => new THREE.Color(c));
const RED = new THREE.Color(PAL.red);
const HOT = new THREE.Color('#ff2a3a');

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _h = new THREE.Vector3();

/**
 * Ruler Snake: a long wooden folding ruler that slithers in S-curves. Strict and straight-laced: it MEASURES the
 * crooked platforms WAI made (lies dead straight, red ticks run along it) and they snap straight and fall. Close up
 * it rears its front half and SNAPS it down a red lane. Paint bends it crooked; fully repainted it loops about happily.
 */
export class RulerSnake extends EnemyBase {
  readonly kind = 'rulersnake';
  readonly displayName = 'Ruler Snake';
  readonly bigness = 0.4;
  /** The platform it is measuring right now (null otherwise). Bots and the director read it. */
  measuring: Straightenable | null = null;
  /** Fires when a measure completes (after the platform's straighten()). */
  onMeasured: ((p: Straightenable) => void) | null = null;

  private look: RulerSnakeLook;
  private lane: THREE.Mesh;
  private balls: RAPIER.Collider[] = [];
  // the trail: a ring buffer of head (base) positions, newest at `trailHead`
  private trail = new Float32Array(TRAIL_N * 3);
  private trailHead = 0;
  private trailCount = 0;
  // the joint chain (world), rebuilt every frame; J[k] = slab k's front joint
  private J = Array.from({ length: SEGS + 1 }, () => new THREE.Vector3());
  private roll = new Float32Array(SEGS);
  // the front (neck / reared front half): a straight piece from the base, ahead of the trail
  private frontLen = FRONT.len;
  private frontPitch = FRONT.pitch;
  private frontYaw = 0;
  private straightK = 0; // MEASURE: 0 trail … 1 dead straight
  private bendK = 0; // shown repaint (bends the body)
  private goal: Straightenable | null = null;
  private measureT = 0;
  private measureCd = 0.8;
  private bendy = false;
  private attackCd = 1;
  private laneO = new THREE.Vector3();
  private laneYaw = 0;
  private laneLen = LANE_LEN;
  private laneK = 0;
  private laneT = 0; // re-measure the line while aiming
  private tickN = 0; // measuring ticks drawn so far
  private locked = false;
  private whipGone = 0; // metres the base has travelled down the line
  private whipStall = 0;
  private hitDone = false;
  private whackT = 0; // WAI was just whipped: knocked onto the ruler, he does not count as stomping it
  private wander = new THREE.Vector3();
  private mv = new THREE.Vector3(); // this tick's ground velocity
  private feet = new THREE.Vector3(1e6, 0, 0); // WAI's feet (last step)
  private weave = 0;
  private sight = false;
  private sightT = 0;
  private repickT = 0;
  private calmC = new THREE.Vector3();
  private calmDir = 1;
  private clock = 0;
  private flickT = 1.5;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3, private targets: Straightenable[] = []) {
    super(ctx, id, start, HP, 0.3, 0.02);
    this.look = new RulerSnakeLook(this.root);
    this.lane = makeLane();
    ctx.root.add(this.lane);
    // paint lands on the whole ruler, not just the head capsule: small balls on the same kinematic body
    for (let i = 0; i < BALLS; i++) {
      const c = ctx.physics.world.createCollider(RAPIER.ColliderDesc.ball(BALL_R).setTranslation(0, -this.cOff, -(i + 0.5) * SEG_L), this.body);
      ctx.physics.tag(c, 'enemy', this);
      this.balls.push(c);
    }
    this.wander.copy(start);
    this.frontYaw = this.facing;
    this.straightTrail(start.x, start.y, start.z, this.facing);
    this.layChain(start.x, start.y, start.z);
  }

  // ───────────── read-outs ─────────────
  get counterHint(): string {
    if (this.state === 'MEASURE') return 'It is measuring: paint it now, double paint!';
    if (this.state === 'SNAP_TELL') return 'Step off its red line!';
    if (this.state === 'REST') return 'It is lying flat: paint it!';
    return 'Paint it to bend it back';
  }

  /** The whip's line (bots, tests): origin on the floor, heading, length, half width; `on` while it is drawn. */
  get whipLine(): { on: boolean; o: THREE.Vector3; yaw: number; len: number; half: number; locked: boolean } {
    return { on: this.state === 'SNAP_TELL' || this.state === 'SNAP', o: this.laneO, yaw: this.laneYaw, len: this.laneLen, half: HIT_HALF, locked: this.locked };
  }

  // ───────────── damage rules ─────────────
  protected override preDamage(info: DamageInfo): DamageResult | null {
    // knocked onto the ruler by its own whip: that landing is not a stomp
    if (info.kind === 'stomp' && this.whackT > 0) return { weak: false, absorbed: true };
    if (info.kind === 'paint' && this.state !== 'MEASURE' && this.state !== 'REST') info.amount *= VARNISH;
    return null;
  }

  protected override weakPoints(): WeakPoint[] {
    // lying dead straight (measuring a platform, or stretched out after a whip): the whole ruler is open
    if (this.state !== 'MEASURE' && this.state !== 'REST') return [];
    const out: WeakPoint[] = [];
    for (let k = 0; k < SEGS; k++) out.push({ pos: this.J[k].clone().add(this.J[k + 1]).multiplyScalar(0.5).setY(this.J[k].y + 0.12), radius: 0.45, mul: MEASURE_MUL });
    return out;
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play('hit', { pos: this.pos, pitch: weak ? 1.2 : 1.7, vol: 0.45 });
  }

  protected override interrupt(): void {
    if (this.state === 'GO_MEASURE' || this.state === 'MEASURE') this.abortMeasure(null);
    else if (this.state === 'SNAP_TELL') {
      this.attackCd = 1.5;
      this.setState('CHASE');
    } else if (this.state === 'SNAP') this.endWhip();
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  protected override finish(): void {
    this.abortMeasure(null);
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
    // loop round a point beside it
    this.calmDir = Math.random() < 0.5 ? -1 : 1;
    const s = Math.sin(this.facing + this.calmDir * Math.PI * 0.5);
    const c = Math.cos(this.facing + this.calmDir * Math.PI * 0.5);
    this.calmC.set(this.pos.x + s * 1.5, this.pos.y, this.pos.z + c * 1.5);
  }

  private abortMeasure(word: string | null): void {
    if (this.measuring) this.measuring.cancelMeasure();
    this.measuring = null;
    this.goal = null;
    this.measureCd = MEASURE_CD;
    if (this.state === 'GO_MEASURE' || this.state === 'MEASURE') this.setState('CHASE');
    if (word) this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 1.2), word, '#ff4fa3', 0.85);
  }

  // ───────────── brain ─────────────
  override step(dt: number, player: PlayerController): void {
    this.feet.copy(player.pos);
    super.step(dt, player);
    this.updateFront(dt);
    this.recordTrail();
  }

  protected ai(dt: number, player: PlayerController): void {
    this.measureCd -= dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.whackT = Math.max(0, this.whackT - dt);
    const R = rulerTuning();
    const slip = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) < 1.6 ? player.collider?.handle : undefined; // under WAI after a whip: slide out
    if (this.state === 'STUNNED') {
      this.move(0, 0, dt);
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') return this.loop(dt);
    if (!this.bendy && this.repaint >= BENDY) {
      // too bendy to measure, ever again
      this.bendy = true;
      this.abortMeasure(null);
      this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 1.3), t('TOO BENDY!'), '#ff4fa3', 0.9);
      this.ctx.audio.play('squeak', { pos: this.pos, pitch: 1.3 });
      this.ctx.audio.play('dizzy', { pos: this.pos, vol: 0.6 });
    }
    _v.copy(player.pos).sub(this.pos).setY(0);
    const d = _v.length();
    const dy = player.pos.y - this.pos.y;
    const valid = !player.smudged && Math.abs(dy) < 2.4;
    this.sightT -= dt;
    if (this.sightT <= 0) {
      this.sightT = 0.2;
      this.sight = !player.smudged && d < SIGHT + 2 && this.canSee(player.pos, 0.5);
    }
    this.mv.set(0, 0, 0);
    switch (this.state) {
      case 'IDLE': {
        // outside its room: the way home is through the door
        const to = this.homeward(this.wander, _h);
        _w.copy(to).sub(this.pos).setY(0);
        if (_w.length() < 0.5 || this.stateT > 8) {
          this.wander.set(this.home.x + (Math.random() - 0.5) * 8, this.home.y, this.home.z + (Math.random() - 0.5) * 8);
          this.stateT = 0;
        } else this.slither(to, SPEED.wander, dt);
        if (d < SIGHT && Math.abs(dy) < 6 && this.sight && this.roomAllows(player.pos)) this.alert();
        break;
      }
      case 'CHASE': {
        const target = this.pickTarget(player);
        if (target && (this.onIt(target, player) || d > R.reach)) {
          this.goal = target;
          this.setState('GO_MEASURE');
          break;
        }
        if (!valid || this.pos.distanceTo(this.home) > 18 || !this.roomAllows(player.pos)) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        let cramped = false;
        if (d > 1.6 && d < R.reach - 0.8 && this.attackCd <= 0 && this.sight) {
          this.faceToward(player.pos, dt, 8);
          if (this.measureLane(player, R.reach) >= MIN_LANE) {
            this.beginTell();
            break;
          }
          cramped = true; // a wall or a drop in the way: find a measuring spot on WAI's open side (toward home)
        }
        // between whips it keeps a measuring distance: in from far, back off from close (never into a wall)
        _w.copy(this.home).sub(player.pos).setY(0);
        if (_w.lengthSq() < 1) _w.copy(this.pos).sub(player.pos).setY(0);
        const spot = _h.copy(player.pos).addScaledVector(_w.normalize(), (KEEP[0] + KEEP[1]) / 2);
        if (d > KEEP[1]) this.slither(player.pos, SPEED.chase, dt);
        else if (d < KEEP[0] || cramped) this.slither(spot, SPEED.chase * 0.85, dt);
        else this.faceToward(player.pos, dt, 6);
        break;
      }
      case 'GO_MEASURE': {
        const g = this.goal;
        if (!g || !g.crooked || this.bendy) {
          this.abortMeasure(null);
          break;
        }
        // WAI hopped onto another crooked platform: that one first
        this.repickT -= dt;
        if (this.repickT <= 0) {
          this.repickT = 0.5;
          const t2 = this.pickTarget(player);
          if (t2 && t2 !== g && this.onIt(t2, player)) this.goal = t2;
        }
        _w.copy(this.goal!.anchor).sub(this.pos).setY(0);
        const ad = _w.length();
        if (ad < 0.35) {
          this.setState('MEASURE');
          this.measureT = 0;
          break;
        }
        if (this.stateT > 9) {
          this.abortMeasure(null); // can't get there
          break;
        }
        this.slither(this.goal!.anchor, ad < 1.2 ? SPEED.go * 0.6 : SPEED.go, dt, ad < 1.5 ? 0 : 1);
        break;
      }
      case 'MEASURE':
        this.measure(dt);
        break;
      case 'SNAP_TELL':
        this.tell(dt, player, R.tell, R.reach);
        break;
      case 'SNAP':
        return this.whip(dt, player);
      case 'REST': {
        // lies stretched out along its line; then the body creeps up under its outstretched head
        if (this.stateT > R.rest && this.frontLen > FRONT.len + 0.02) {
          const want = Math.min(1.6 * dt, this.frontLen - FRONT.len);
          const moved = this.move(Math.sin(this.laneYaw) * (want / dt), Math.cos(this.laneYaw) * (want / dt), dt, slip);
          this.frontLen -= Math.max(moved, want * 0.5);
          this.recordTrail();
          return;
        }
        if (this.stateT > R.rest) this.toChase();
        break;
      }
    }
    this.move(this.mv.x, this.mv.z, dt, slip);
  }

  private toChase(): void {
    this.attackCd = rulerTuning().cd * (0.85 + Math.random() * 0.3);
    this.setState('CHASE');
  }

  // ───────────── the whip ─────────────
  /**
   * Lay the measuring line from its base toward WAI: as long as the floor runs on (no wall, no drop, inside its room),
   * at most `reach`, PAST m beyond him. Sets laneO / laneYaw / laneLen; returns the length.
   */
  private measureLane(player: PlayerController, reach: number): number {
    const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const want = Math.min(reach, Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) + PAST);
    const ph = this.ctx.physics;
    const floor = (c: RAPIER.Collider) => ['static', 'undrawn', 'host', 'gate'].includes(ph.tagOf(c) as string);
    // a wall (or a machine) in the way, at knee height
    _w.copy(this.pos).setY(this.pos.y + 0.45);
    const wall = ph.raycast(_w, _v.set(fx, 0, fz), want, (c) => ph.tagOf(c) === 'static' || ph.tagOf(c) === 'gate');
    let len = wall ? Math.max(0, wall.dist - 0.35) : want;
    // the floor under the line, every half metre
    for (let s = 0.5; s <= len; s += 0.5) {
      _w.set(this.pos.x + fx * s, this.pos.y + 0.6, this.pos.z + fz * s);
      if (!this.inRoom(_w, -0.4) || !ph.raycast(_w, _v.set(0, -1, 0), 1.3, floor)) len = s - 0.5;
    }
    this.laneO.copy(this.pos);
    return (this.laneYaw = yaw), (this.laneLen = len);
  }

  private beginTell(): void {
    this.setState('SNAP_TELL');
    this.tickN = 0;
    this.locked = false;
    this.laneT = 0;
    this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.15 });
    this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 1.5, vol: 0.5 });
    this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 1.7), t('STRAIGHTEN UP!'), PAL.red, 0.8);
  }

  /** Reared up, stiff: the line follows WAI and ticks race down it (faster and faster); then the aim locks. */
  private tell(dt: number, player: PlayerController, tellT: number, reach: number): void {
    if (this.stateT < tellT - AIM_LOCK) {
      this.faceToward(player.pos, dt, 9);
      this.laneT -= dt;
      if (this.laneT <= 0) {
        this.laneT = 0.1;
        if (this.measureLane(player, reach) < MIN_LANE) {
          this.attackCd = 0.6;
          this.setState('CHASE');
          return;
        }
      }
    } else if (!this.locked) {
      this.locked = true;
      this.facing = this.laneYaw;
      this.ctx.audio.play('lockOn', { pos: this.pos, pitch: 0.9 });
    }
    const k = Math.min(1, this.stateT / tellT);
    const n = Math.floor(k * k * (this.laneLen / TICK)) + 1;
    if (n > this.tickN) {
      this.tickN = n;
      this.ctx.audio.play('stampTick', { pos: this.pos, pitch: 0.8 + k * 0.7, vol: 1.6 });
    }
    if (this.stateT >= tellT) {
      this.setState('SNAP');
      this.hitDone = false;
      this.whipGone = 0;
      this.whipStall = 0;
      this.ctx.audio.play('whoosh', { pos: this.pos, pitch: 1.8, vol: 1.2 });
    }
  }

  /** The whole ruler shoots flat down its line (through WAI: he is not in its way, he is what it corrects). */
  private whip(dt: number, player: PlayerController): void {
    const go = Math.max(0.6, this.laneLen - FRONT.rearLen);
    const v = go / WHIP_T;
    const fx = Math.sin(this.laneYaw), fz = Math.cos(this.laneYaw);
    const step = Math.min(v * dt, go - this.whipGone);
    const moved = step > 1e-4 ? this.move((fx * step) / dt, (fz * step) / dt, dt, player.collider?.handle) : 0;
    this.whipGone += moved;
    this.whipStall = moved < step * 0.3 ? this.whipStall + dt : 0;
    this.recordTrail();
    // what it has swept so far: from the line's start to the head
    const head = this.whipGone + FRONT.rearLen * Math.min(1, this.stateT / SLAM_T);
    if (!this.hitDone) this.sweep(player, head);
    if (this.whipGone >= go - 0.02 || this.whipStall > 0.06 || this.stateT > WHIP_T * 2) this.endWhip();
  }

  /** WAI on the swept part of the line, feet on the floor: STRAIGHTENED (knocked off the line, sideways). */
  private sweep(player: PlayerController, upTo: number): void {
    if (player.smudged) return;
    const fx = Math.sin(this.laneYaw), fz = Math.cos(this.laneYaw);
    const rx = player.pos.x - this.laneO.x, rz = player.pos.z - this.laneO.z;
    const along = rx * fx + rz * fz;
    const side = rx * fz - rz * fx;
    const dy = player.pos.y - this.laneO.y;
    if (along < -0.3 || along > upTo + 0.3 || Math.abs(side) > HIT_HALF || dy < -0.6 || dy > JUMP_CLEAR) return;
    this.hitDone = true;
    const sg = side >= 0 ? 1 : -1;
    _w.set(this.laneO.x + fx * along - fz * sg * 0.6, player.pos.y, this.laneO.z + fz * along + fx * sg * 0.6);
    if (!player.takeHit(_w, rulerTuning().hit, WHIP_KNOCK)) return;
    this.whackT = 1.6;
    this.ctx.effects.comic(_v.copy(player.pos).setY(player.pos.y + 1.7), t('STRAIGHTENED!'), PAL.red, 1.0);
    this.ctx.audio.play('stampHit', { pos: player.pos, pitch: 0.75, vol: 1.2 });
    this.ctx.audio.play('kick', { pos: player.pos, pitch: 0.7 });
    this.ctx.time.hitstop(0.09);
    screenMark('strike');
    const fxs = this.ctx.effects.sound;
    fxs.spawnGlyph({ pos: _v.copy(player.pos).setY(player.pos.y + 0.9), glyph: SOUND_GLYPH.burst, size: 1.2, color: fxs.c(PAL.red), dur: 0.35 });
  }

  /** The line is done: a wooden CLACK the room hears, dust at the head, the line flashes once; then it lies there. */
  private endWhip(): void {
    this.hitDone = true;
    const head = _h.copy(this.pos).addScaledVector(_w.set(Math.sin(this.laneYaw), 0, Math.cos(this.laneYaw)), FRONT.rearLen).setY(this.pos.y + 0.05);
    this.ctx.audio.play('stomp', { pos: head, pitch: 0.95, vol: 0.85 });
    this.ctx.audio.play('crash', { pos: head, pitch: 1.6, vol: 0.55 });
    this.ctx.audio.play('slamLand', { pos: head, pitch: 1.3, vol: 0.6 });
    const far = this.ctx.camera.camera.position.distanceTo(head);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.38 * Math.max(0, 1 - far / 16));
    this.ctx.effects.burst(head, '#e8c47a', 16, 4, 0.07);
    this.ctx.effects.ring(head, '#ffffff', 1.6);
    // the measured line, struck through in red marker for a moment (exactly the swept length and width)
    strikeLine(this.ctx.effects.sound, this.laneO, this.laneYaw, this.whipGone + FRONT.rearLen, HIT_HALF);
    this.frontPitch = 0;
    this.setState('REST');
  }

  /** Crooked platform near home it should go for: the one WAI stands on, else the one nearest WAI. */
  private pickTarget(player: PlayerController): Straightenable | null {
    if (this.bendy || this.measureCd > 0) return null;
    let best: Straightenable | null = null;
    let bestD = Infinity;
    for (const p of this.targets) {
      if (!p.crooked || Math.hypot(p.center.x - this.home.x, p.center.z - this.home.z) > HOME_R) continue;
      if (this.onIt(p, player)) return p;
      const dd = Math.hypot(p.center.x - player.pos.x, p.center.z - player.pos.z);
      if (dd < bestD) {
        bestD = dd;
        best = p;
      }
    }
    return best;
  }

  private onIt(p: Straightenable, player: PlayerController): boolean {
    return Math.hypot(player.pos.x - p.center.x, player.pos.z - p.center.z) < ON_R && player.pos.y > p.center.y - 0.5 && player.pos.y < p.center.y + 2.5;
  }

  /** At the anchor: turn to the platform, lie dead straight, count to MEASURE_T, straighten it. */
  private measure(dt: number): void {
    const g = this.goal;
    if (!g || this.bendy) return this.abortMeasure(null);
    if (!g.crooked) return this.abortMeasure(null);
    this.faceToward(g.center, dt, 4);
    this.straightK = Math.min(1, this.straightK + dt * 2.4);
    if (!this.measuring) {
      _w.copy(g.center).sub(this.pos);
      let da = Math.atan2(_w.x, _w.z) - this.facing;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) < 0.12 && this.straightK >= 1) {
        this.measuring = g;
        this.measureT = 0;
        g.beginMeasure(MEASURE_T);
        this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 1.1), t('MEASURING...'), PAL.red, 0.75);
        this.ctx.audio.play('lockOn', { pos: this.pos, pitch: 1.2 });
      } else if (this.stateT > 3) this.abortMeasure(null);
      return;
    }
    this.measureT += dt;
    if (this.measureT >= MEASURE_T) {
      const p = this.measuring;
      this.measuring = null;
      this.goal = null;
      p.straighten();
      this.onMeasured?.(p);
      this.measureCd = MEASURE_CD;
      this.ctx.effects.comic(_v.copy(g.center).setY(g.center.y + 1), t('DEAD STRAIGHT!'), PAL.red, 0.9);
      this.ctx.audio.play('smallBell', { pos: this.pos, pitch: 1.5 });
      this.ctx.audio.play('stampHit', { pos: g.center, vol: 0.6 });
      this.setState('CHASE');
    }
  }

  /** CALM: a happy bendy ruler, looping round and round. */
  private loop(dt: number): void {
    _w.copy(this.pos).sub(this.calmC).setY(0);
    const r = Math.max(0.01, _w.length());
    const tx = (-_w.z / r) * this.calmDir;
    const tz = (_w.x / r) * this.calmDir;
    const pull = (1.5 - r) * 1.5;
    const vx = tx * SPEED.calm + (_w.x / r) * pull;
    const vz = tz * SPEED.calm + (_w.z / r) * pull;
    this.faceToward(_v.set(this.pos.x + vx, this.pos.y, this.pos.z + vz), dt, 6);
    if (this.move(vx, vz, dt) < 1e-4 && this.stateT > 1) {
      this.calmDir *= -1; // blocked (a wall, a ledge): loop the other way
      this.stateT = 0;
    }
  }

  /** Head-first S-curve toward `to`: sets facing and this tick's velocity (ai's closing move applies it). */
  private slither(to: THREE.Vector3, speed: number, dt: number, weaveK = 1): void {
    _w.copy(to).sub(this.pos).setY(0);
    const len = _w.length();
    if (len < 1e-3) return;
    this.weave += dt * speed * 2.4;
    const a = Math.atan2(_w.x, _w.z) + Math.sin(this.weave) * WEAVE * weaveK;
    const vx = Math.sin(a) * speed;
    const vz = Math.cos(a) * speed;
    this.faceToward(_v.set(this.pos.x + vx, this.pos.y, this.pos.z + vz), dt, 7);
    this.mv.set(vx, 0, vz);
  }

  /** The neck / reared front half: length, pitch and heading follow the state. */
  private updateFront(dt: number): void {
    let len = FRONT.len;
    let pitch = FRONT.pitch + Math.sin(this.clock * 2.2) * 0.05;
    let yawRate = 10;
    switch (this.state) {
      case 'SNAP_TELL':
        len = FRONT.rearLen;
        pitch = FRONT.rearPitch;
        break;
      case 'SNAP':
        this.frontPitch = FRONT.rearPitch * Math.max(0, 1 - this.stateT / SLAM_T);
        this.frontYaw = this.laneYaw;
        return;
      case 'REST':
        this.frontPitch = Math.max(0, this.frontPitch - dt * 6);
        this.frontYaw = this.laneYaw;
        return;
      case 'MEASURE':
        pitch = 0;
        yawRate = 6;
        break;
      case 'STUNNED':
        pitch = -0.03;
        break;
      case 'CALM':
        len = 0.5;
        pitch = 0.5 + Math.sin(this.clock * 4) * 0.15;
        break;
    }
    if (this.staggerT > 0) pitch = 0.85;
    // reach out fast for the rear, pull back steadily
    const lr = len > this.frontLen ? 4.5 : 3;
    this.frontLen += THREE.MathUtils.clamp(len - this.frontLen, -lr * dt, lr * dt);
    this.frontPitch += (pitch - this.frontPitch) * Math.min(1, dt * (this.state === 'SNAP_TELL' ? 9 : 6));
    let dyaw = this.facing - this.frontYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.frontYaw += dyaw * Math.min(1, dt * yawRate);
    if (this.state !== 'MEASURE') this.straightK = Math.max(0, this.straightK - dt * 4);
    else if (this.straightK >= 1) this.straightTrail(this.pos.x, this.pos.y, this.pos.z, this.frontYaw);
  }

  // ───────────── the trail ─────────────
  private recordTrail(): void {
    const j = this.trailHead * 3;
    const tr = this.trail;
    const dx = this.pos.x - tr[j];
    const dy = this.pos.y - tr[j + 1];
    const dz = this.pos.z - tr[j + 2];
    if (dx * dx + dy * dy + dz * dz < TRAIL_STEP * TRAIL_STEP) return;
    this.trailHead = (this.trailHead + 1) % TRAIL_N;
    const k = this.trailHead * 3;
    tr[k] = this.pos.x;
    tr[k + 1] = this.pos.y;
    tr[k + 2] = this.pos.z;
    this.trailCount = Math.min(TRAIL_N, this.trailCount + 1);
  }

  /** Overwrite the trail with a dead-straight line behind (x, z) along heading `yaw`. */
  private straightTrail(x: number, y: number, z: number, yaw: number): void {
    const sx = Math.sin(yaw);
    const sz = Math.cos(yaw);
    for (let i = 0; i < TRAIL_N; i++) {
      const k = ((this.trailHead - i + TRAIL_N) % TRAIL_N) * 3;
      this.trail[k] = x - sx * i * TRAIL_STEP;
      this.trail[k + 1] = y;
      this.trail[k + 2] = z - sz * i * TRAIL_STEP;
    }
    this.trailCount = TRAIL_N;
  }

  /**
   * Joint chain from the base (bx, by, bz): the front piece (neck or reared half) ahead of it, then the trail at
   * SEG_L spacing; blended toward a straight line while measuring; then bent crooked by the repaint.
   */
  private layChain(bx: number, by: number, bz: number): void {
    const J = this.J;
    const fc = Math.cos(this.frontPitch) * this.frontLen;
    const sx = Math.sin(this.frontYaw);
    const sz = Math.cos(this.frontYaw);
    const hx = bx + sx * fc;
    const hy = by + Math.sin(this.frontPitch) * this.frontLen;
    const hz = bz + sz * fc;
    J[0].set(hx, hy, hz);
    // walk the polyline head → base → trail (newest first), dropping a joint every SEG_L
    let k = 1;
    let target = SEG_L;
    let acc = 0;
    let px = hx, py = hy, pz = hz;
    const tr = this.trail;
    for (let i = -1; i < this.trailCount && k <= SEGS; i++) {
      let qx = bx, qy = by, qz = bz;
      if (i >= 0) {
        const j = ((this.trailHead - i + TRAIL_N) % TRAIL_N) * 3;
        qx = tr[j];
        qy = tr[j + 1];
        qz = tr[j + 2];
        // skip trail points still at the (interpolated) base: no fold-back jitter
        if ((qx - bx) * (qx - bx) + (qz - bz) * (qz - bz) < 0.08 * 0.08) continue;
      }
      const dx = qx - px, dy = qy - py, dz = qz - pz;
      const d = Math.hypot(dx, dy, dz);
      while (k <= SEGS && acc + d >= target) {
        const f = d > 1e-6 ? (target - acc) / d : 0;
        J[k].set(px + dx * f, py + dy * f, pz + dz * f);
        k++;
        target += SEG_L;
      }
      acc += d;
      px = qx;
      py = qy;
      pz = qz;
    }
    for (; k <= SEGS; k++) J[k].set(J[k - 1].x - sx * SEG_L, by, J[k - 1].z - sz * SEG_L);
    // measuring: pull it dead straight along the front's heading
    if (this.straightK > 0) {
      const s = this.straightK;
      for (let i = 1; i <= SEGS; i++) {
        const lx = hx - sx * i * SEG_L;
        const lz = hz - sz * i * SEG_L;
        J[i].x += (lx - J[i].x) * s;
        J[i].y += (by - J[i].y) * s;
        J[i].z += (lz - J[i].z) * s;
      }
    }
    // rigid slabs: re-chain from the head at exact SEG_L, bending each joint by the repaint
    const rep = this.bendK;
    const calm = this.state === 'CALM';
    const strain = this.state === 'MEASURE' ? 1 - 0.6 * this.straightK : 1;
    let bend = 0;
    for (let i = 0; i < SEGS; i++) {
      let dx = J[i].x - J[i + 1].x;
      let dy = J[i].y - J[i + 1].y;
      let dz = J[i].z - J[i + 1].z;
      const d = Math.max(1e-5, Math.hypot(dx, dy, dz));
      dx /= d;
      dy /= d;
      dz /= d;
      bend += rep * (CROOK[i] * 0.3 * strain + Math.sin(this.clock * 2.6 + i * 1.9) * 0.08) + (calm ? Math.sin(this.clock * 5 - i * 0.9) * 0.32 : 0);
      if (this.state === 'MEASURE' && this.measuring) bend += Math.sin(this.clock * 43 + i) * 0.02 * rep * 3;
      const c = Math.cos(bend), s = Math.sin(bend);
      const rx = dx * c + dz * s;
      const rz = -dx * s + dz * c;
      J[i + 1].set(J[i].x - rx * SEG_L, J[i].y - dy * SEG_L, J[i].z - rz * SEG_L);
      this.roll[i] = rep * Math.sin(this.clock * 3 + i * 1.3) * 0.14 + (calm ? Math.sin(this.clock * 4 + i) * 0.18 : 0);
    }
    // never let a joint sink under the base's floor height
    for (let i = 1; i <= SEGS; i++) if (J[i].y < by - 0.4) J[i].y = by - 0.4;
  }

  // ───────────── look ─────────────
  protected animate(dt: number): void {
    this.clock += dt;
    const target = this.state === 'CALM' || this.state === 'STUNNED' ? 1 : this.repaint;
    this.bendK += (target - this.bendK) * Math.min(1, dt * 4);
    // the root keeps its yaw only: the chain is laid in world space (no reel tilt, no sideways squash on 3 m)
    const q = this.root.quaternion;
    const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
    this.root.rotation.set(0, yaw, 0);
    this.root.scale.set(1, this.root.scale.y, 1);
    const o = this.root.position;
    this.layChain(o.x, this.renderPos.y, o.z);
    this.look.pose(this.J, this.roll, o.x, o.y, o.z, yaw);
    // paint colliders follow the slabs (offsets from the body's centre). A ball right at WAI's feet switches off:
    // he walks over the ruler instead of standing on it (standing on an enemy collider counts as a stomp)
    if (!this.bodyless) {
      const cy = this.pos.y + this.cOff;
      const f = this.feet;
      for (let i = 0; i < BALLS; i++) {
        const a = this.J[i];
        const b = this.J[i + 1];
        const mx = (a.x + b.x) * 0.5, my = (a.y + b.y) * 0.5 + 0.1, mz = (a.z + b.z) * 0.5;
        const ball = this.balls[i];
        ball.setEnabled((mx - f.x) * (mx - f.x) + (mz - f.z) * (mz - f.z) > 0.8 * 0.8 || Math.abs(my - f.y) > 1.4);
        ball.setTranslationWrtParent({ x: mx - this.pos.x, y: my - cy, z: mz - this.pos.z });
      }
    }
    this.paintTicks();
    // face: bossy narrow eyes; squint while measuring; wide and happy when calm
    if (this.state === 'CALM') this.look.face(0.05, -0.25, dt);
    else if (this.state === 'STUNNED') this.look.face(0.9, 0, dt);
    else if (this.state === 'MEASURE') this.look.face(0.68, 0.45, dt);
    else if (this.state === 'SNAP_TELL' || this.state === 'SNAP') this.look.face(0.3, 0.6, dt);
    else this.look.face(0.5, 0.38, dt);
    this.flickT -= dt;
    if (this.flickT <= 0) this.flickT = (this.state === 'CALM' ? 0.8 : 1.8) + Math.random() * 1.6;
    this.look.flick(this.flickT < 0.3 ? Math.sin((this.flickT / 0.3) * Math.PI) : 0);
    // the measuring line: the decal at the exact swept size, and red ticks racing down it (marker strokes)
    const laneOn = this.state === 'SNAP_TELL' || this.state === 'SNAP';
    this.laneK = laneOn ? Math.min(1, this.laneK + dt * 8) : Math.max(0, this.laneK - dt * 4);
    this.lane.visible = this.laneK > 0.01;
    if (this.lane.visible) {
      this.lane.position.set(this.laneO.x, this.laneO.y + 0.035, this.laneO.z);
      this.lane.rotation.y = this.laneYaw;
      this.lane.scale.set(HIT_HALF / LANE_HALF, 1, this.laneLen / LANE_LEN);
      const k = this.state === 'SNAP_TELL' ? this.stateT / rulerTuning().tell : 1;
      (this.lane.material as THREE.MeshBasicMaterial).opacity = this.laneK * (this.locked ? 0.95 : 0.45 + 0.45 * Math.abs(Math.sin(this.clock * (9 + k * 14))));
      if (this.state === 'SNAP_TELL') measureTicks(this.ctx.effects.sound, this.laneO, this.laneYaw, Math.min(this.tickN, Math.floor(this.laneLen / TICK)), TICK, HIT_HALF, this.locked);
    }
  }

  /** Tick ink: red sweep while measuring, red flashes on the reared half, repaint colours otherwise. */
  private paintTicks(): void {
    const sweep = this.measuring ? this.measureT / MEASURE_T : -1;
    const flash = 0.6 + 0.4 * Math.abs(Math.sin(this.clock * 18));
    for (let k = 0; k < SEGS; k++) {
      const col = VIVID[k % VIVID.length];
      const paint = THREE.MathUtils.clamp(this.bendK * 1.5, 0, 1) * 0.95;
      let glow = 0;
      if (sweep >= 0 && sweep * SEGS >= SEGS - 1 - k) {
        this.look.tick(k, RED, flash);
        glow = 0.3 * flash;
      } else if (this.state === 'SNAP_TELL' && k < 4) {
        const tk = Math.min(1, this.stateT / rulerTuning().tell);
        this.look.tick(k, HOT, 0.4 + 0.5 * flash * tk);
        glow = 0.22 * flash * tk;
      } else this.look.tick(k, col, paint);
      // a red heat on the slab itself (added after EnemyBase reset the emissive this frame)
      if (glow > 0) this.look.glow(k, glow);
    }
  }

  override dispose(): void {
    if (!this.bodyless && !this.disposed) for (const c of this.balls) this.ctx.physics.untag(c);
    this.lane.removeFromParent();
    super.dispose();
  }
}
