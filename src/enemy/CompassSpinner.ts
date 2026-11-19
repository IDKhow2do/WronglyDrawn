/**
 * [INPUT]: depends on EnemyBase (KCC body, weak points, stagger/TAG via holdStagger, the room leash) from ./EnemyBase;
 *          buildCompass/makeLine/fillRing/makeFlower/closeFx (model, pooled floor lines, the closing flash) from ./CompassLook;
 *          compassTuning (plant, turn, margin, damage, cooldown) from meta/Difficulty; screenMark from render/ScreenMarks
 * [OUTPUT]: exports the CompassSpinner enemy (kind 'compass') and its bot read-outs `circle` (+ `drawn`), `pencilAngle`,
 *           `planted`, `counterHint` (English source: callers wrap it in t())
 * [POS]: level-3 creature (Limp Works). It draws EXACT RED CIRCLES. It plants its needle and rules a circle round WAI,
 *        `margin` m wider than his distance, so he starts INSIDE; one turn of the pencil closes it, and everything still
 *        inside on foot is CORRECTED (a heavy hit). Counter: get out before it closes (cross where the pencil has not
 *        drawn yet, or JUMP the drawn line: stepping on it hurts), or paint the planted NEEDLE (×3) to topple it:
 *        STUCK, a TAG window, the circle is wiped. Fair circles only: the ring stays on the floor in front of a wall
 *        behind WAI, and a WAI with no way out gets flanked first. Echoes RedGramophone's tonearm SWEEP.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { buildCompass, closeFx, fillRing, flowerAt, makeFlower, makeLine, FLOWER_SEGS, LEG, PENCIL, UPPER, type CompassParts } from './CompassLook';
import { compassTuning } from '../meta/Difficulty';
import { screenMark } from '../render/ScreenMarks';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { PAL } from '../render/PaintTextures';

// ───────────── tuning ─────────────
const HP = 280; // ≥ 150: EnemyBase staggers it at every quarter
const SEE = 13; // alert range
const R_MIN = 2.5, R_MAX = 7.2; // circle radius = distance to WAI + margin, clamped
// plant (the tell) / turn (one sweep of the pencil) / margin / damage / cooldown: COMPASS rows in meta/Difficulty
const CIRCLE_T = 1.6; // the closed circle stays (its line still hurts on foot) …
const FADE_T = 0.6; // … and fades out over the last part
const CLOSE_KNOCK = 7; // the closing hit throws WAI out over the line
const LIFT_T = 0.6; // needle pulled out, legs close
const STUCK_T = 2.6; // toppled: the TAG window
const SWEEP_BAND = 0.6; // |dist − R| for the passing pencil
const SWEEP_FEET = 0.45; // feet above the floor: higher = jumped it
const LINE_BAND = 0.4; // |dist − R| for the drawn line
const LINE_FEET = 0.45;
const NEEDLE_MUL = 3; // weak point while planted
const OFF_MUL = 0.5; // paint anywhere else
const STUCK_MUL = 1.5; // toppled: all of it is open
const TOPPLE = 0.16; // needle paint (share of maxHp) in one plant that topples it
const STRIDE = 1.1; // walking: distance between the feet
const WALK = 1.3, CHASE = 2.2;
const LINE_W = 0.13;
const LINE_LIFT = 0.026, PREVIEW_LIFT = 0.021, FLOWER_LIFT = 0.024;
const FLOWER_T = 4.2; // calm: time to draw the rainbow flower
const SEGS = 160;
const TAU = Math.PI * 2;

const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _h = new THREE.Vector3();
const _k = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/**
 * COMPASS SPINNER: a 2.2 m drafting compass that walks by pivoting leg over leg. When WAI is near it PLANTS its
 * needle and spreads the pencil leg out to his distance (a faint red circle shows the line), then SPINS: the
 * pencil sweeps round twice, drawing a solid red circle. The passing pencil scratches a WAI standing on the line —
 * JUMP it. The circle stays a few seconds and hurts on foot (jump over it). While planted the NEEDLE is its weak
 * point (×3): paint it enough and the compass TOPPLES — STUCK, TAG IT. Repainted, it draws a rainbow flower.
 */
export class CompassSpinner extends EnemyBase {
  readonly kind = 'compass';
  readonly displayName = 'Compass Spinner';
  readonly bigness = 0.4;
  /** The red circle (bots): centre on the floor, radius, `active` = the drawn line or the passing pencil hurts. */
  readonly circle = { center: new THREE.Vector3(), r: 0, active: false, drawn: 0 };
  /** Current pencil sweep angle (world yaw from the needle, rad). */
  pencilAngle = 0;
  private look: CompassParts;
  private line: THREE.Mesh;
  private preview: THREE.Mesh;
  private flower: THREE.Mesh;
  private attackCd = 1.5;
  private wander = new THREE.Vector3();
  private spinFrom = 0;
  private spinDir = 1;
  private needleDmg = 0;
  private lineHit = false;
  private toppled = false;
  private calmT = 0;
  private wob = 0;
  private scratchT = 0;
  private flank = Math.random() < 0.5 ? -1 : 1;
  private flankT = 0;
  // the gait: world feet, the pivot foot stays put while the free one swings half a circle over it
  private footN = new THREE.Vector3();
  private footP = new THREE.Vector3();
  private pivotIsNeedle = true;
  private stepK = 0;
  private stepFrom = 0;
  private stepSign = 1;
  /** Feet at the start of a plant / lift (blended from). */
  private fromN = new THREE.Vector3();
  private fromP = new THREE.Vector3();
  private spread = 0; // shown pencil radius while planted
  private tipK = 0;
  private twirl = 0;
  private readonly wpNeedle: WeakPoint[] = [{ pos: new THREE.Vector3(), radius: 0.6, mul: NEEDLE_MUL }];
  private readonly wpStuck: WeakPoint[] = [{ pos: new THREE.Vector3(), radius: 1.8, mul: STUCK_MUL }];
  private readonly none: WeakPoint[] = [];

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, HP, 0.35, 0.6);
    this.look = buildCompass(ctx.assets);
    this.root.add(this.look.rig);
    this.paintAnchor = this.look.rig;
    this.line = makeLine(SEGS, '#ff1f2e', 1, LINE_LIFT);
    this.preview = makeLine(SEGS, '#ff3a48', 0.25, PREVIEW_LIFT);
    this.flower = makeFlower(FLOWER_LIFT);
    ctx.root.add(this.line, this.preview, this.flower);
    this.wander.copy(start);
    this.footN.copy(start).x -= STRIDE / 2;
    this.footP.copy(start).x += STRIDE / 2;
    this.stepFrom = Math.atan2(this.footP.x - this.footN.x, this.footP.z - this.footN.z);
  }

  // ───────────── read-outs ─────────────
  /** Needle in the floor (PLANT / SPIN / CIRCLE): the needle is the weak point. */
  get planted(): boolean {
    return this.state === 'PLANT' || this.state === 'SPIN' || this.state === 'CIRCLE';
  }

  get counterHint(): string {
    switch (this.state) {
      case 'PLANT':
        return 'It is drawing a circle round you — get OUT before it closes!';
      case 'SPIN':
        return 'Get out of the circle before it closes — JUMP the red line, or paint the NEEDLE!';
      case 'CIRCLE':
        return 'Don’t walk over the red line — JUMP it! Paint the NEEDLE to topple it';
      case 'STUCK':
        return 'It toppled over — spray it, then TAG IT!';
    }
    return 'Wait for it to plant its needle, then paint the needle';
  }

  // ───────────── damage rules ─────────────
  private needleBase(out: THREE.Vector3): THREE.Vector3 {
    return out.copy(this.circle.center).setY(this.circle.center.y + 0.25);
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (this.state === 'STUCK' || info.kind !== 'paint') return null;
    const onNeedle = this.planted && info.point.distanceTo(this.needleBase(_v)) < this.wpNeedle[0].radius;
    if (!onNeedle) {
      info.amount *= OFF_MUL;
      if (Math.random() < 0.04) this.ctx.effects.comic(_v.copy(info.point).setY(info.point.y + 0.5), t('CLANG!'), '#d8dcf0', 0.5);
    }
    return null;
  }

  protected override weakPoints(): WeakPoint[] {
    if (this.planted) {
      this.needleBase(this.wpNeedle[0].pos);
      return this.wpNeedle;
    }
    if (this.toppled && this.staggerT > 0) {
      this.wpStuck[0].pos.copy(this.pos).setY(this.pos.y + 0.5);
      return this.wpStuck;
    }
    return this.none;
  }

  protected override onHit(info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: weak ? 1.3 : 1.7, vol: 0.45 });
    if (!weak || !this.planted || this.hp <= 0) return;
    this.needleDmg += info.amount * NEEDLE_MUL;
    if (this.needleDmg >= TOPPLE * this.maxHp) this.topple();
  }

  private topple(): void {
    this.hideLines();
    this.toppled = true;
    this.setState('STUCK');
    this.holdStagger(STUCK_T);
    this.tagSpent = false;
    const top = _v.copy(this.pos).setY(this.pos.y + 2.2);
    this.ctx.effects.comic(top, t('TOPPLED!'), PAL.turq, 0.9);
    this.ctx.effects.burst(_v.copy(this.circle.center).setY(this.circle.center.y + 0.2), '#d8dcf0', 12, 3);
    this.ctx.audio.play('crash', { pos: this.pos, pitch: 1.6, vol: 0.6 });
    this.ctx.audio.play('dizzy', { pos: this.pos });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.25);
  }

  /** Cancel the plant / spin / circle: the line vanishes and the needle comes out. */
  protected override interrupt(): void {
    if (!this.planted) return;
    this.hideLines();
    this.attackCd = 1.6;
    this.beginLift();
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  protected override finish(): void {
    this.hideLines();
    this.toppled = false;
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  calm(): void {
    this.hideLines();
    this.setState('CALM');
    this.calmT = 0;
    this.circle.center.copy(this.pos);
    this.flower.position.set(this.pos.x, this.pos.y + FLOWER_LIFT, this.pos.z);
    this.flower.geometry.setDrawRange(0, 0);
    this.flower.visible = true;
    (this.flower.material as THREE.MeshBasicMaterial).opacity = 1;
    this.fromN.copy(this.footN);
    this.fromP.copy(this.footP);
  }

  private hideLines(): void {
    this.line.visible = this.preview.visible = false;
    this.circle.active = false;
    this.lineHit = false;
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') {
      this.calmT += dt;
      this.move(0, 0, dt);
      return;
    }
    if (this.toppled) {
      // the TAG window ran out: it rights itself and pulls the needle out
      this.toppled = false;
      this.attackCd = 1.8;
      this.beginLift();
      this.ctx.audio.play('pop', { pos: this.pos, pitch: 0.8 });
    }
    _v.copy(player.pos).sub(this.pos).setY(0);
    const d = _v.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2.4;
    this.attackCd = Math.max(0, this.attackCd - dt);
    const C = compassTuning();
    const near = R_MAX - C.margin; // WAI closer than this: the circle goes round him
    let vx = 0, vz = 0;
    switch (this.state) {
      case 'IDLE': {
        // outside its room: the way home is through the door
        const to = this.homeward(this.wander, _k);
        _a.copy(to).sub(this.pos).setY(0);
        if (_a.length() < 0.5) this.wander.set(this.home.x + (Math.random() - 0.5) * 7, this.home.y, this.home.z + (Math.random() - 0.5) * 7);
        else {
          _a.normalize();
          vx = _a.x * WALK;
          vz = _a.z * WALK;
          this.faceToward(to, dt, 3);
        }
        if (valid && d < SEE && this.roomAllows(player.pos) && this.canSee(player.pos, 1.8)) this.alert();
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 18 || !this.roomAllows(player.pos)) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.faceToward(player.pos, dt, 5);
        const n = d > 0.01 ? 1 / d : 0;
        const blocked = d < 9 && !this.canSee(player.pos, 1.8);
        this.flankT -= dt;
        if (this.flankT > 0) {
          // WAI has a wall right behind him: it walks round him (at ~4 m) until his way out runs along open floor
          const keep = (d - 4) * 0.8;
          vx = (_v.z * this.flank + _v.x * keep) * n * CHASE;
          vz = (-_v.x * this.flank + _v.z * keep) * n * CHASE;
        } else if (d > near - 0.4 || blocked) {
          vx = _v.x * n * CHASE;
          vz = _v.z * n * CHASE;
        } else if (d < 2) {
          vx = -_v.x * n * WALK;
          vz = -_v.z * n * WALK;
        }
        if (this.attackCd <= 0 && d > 1.2 && d < near && !blocked) {
          // fair circles only: WAI must have open floor to run out over the line (no wall right behind him)
          const r = this.fairRadius(player, d, C.margin);
          if (r > 0) this.beginPlant(player, r);
          else {
            this.attackCd = 0.3;
            if (this.flankT <= 0) this.flankT = 1.4;
          }
        }
        if (this.flankT > 0 && this.move(vx, vz, dt) < CHASE * dt * 0.2) this.flank *= -1; // a wall that way: round the other way
        if (this.flankT > 0) return;
        break;
      }
      case 'PLANT': {
        // preview pulses faster as the tell runs out
        (this.preview.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.4 * Math.abs(Math.sin(this.stateT * (6 + this.stateT * 14)));
        if (this.stateT > C.plant) {
          this.setState('SPIN');
          this.circle.active = true;
          this.line.visible = true;
          this.line.geometry.setDrawRange(0, 0);
          (this.line.material as THREE.MeshBasicMaterial).opacity = 1;
          (this.preview.material as THREE.MeshBasicMaterial).opacity = 0.45;
          this.ctx.audio.play('whoosh', { pos: this.pos, pitch: 0.9 });
        }
        break;
      }
      case 'SPIN': {
        const k = Math.min(1, this.stateT / C.turn);
        const prev = this.pencilAngle;
        // ease in/out a little: it winds up, then whirls
        const e = k < 0.12 ? (k * k) / 0.24 : k > 0.88 ? 1 - ((1 - k) * (1 - k)) / 0.24 : k - 0.06;
        this.pencilAngle = this.spinFrom + this.spinDir * (e / 0.88) * TAU;
        const drawn = Math.min(1, Math.abs(this.pencilAngle - this.spinFrom) / TAU);
        this.circle.drawn = drawn;
        this.line.geometry.setDrawRange(0, Math.floor(drawn * SEGS) * 6);
        // the pencil scratching round: faster as it closes
        this.scratchT -= dt;
        if (this.scratchT <= 0) {
          this.scratchT = 0.3 - k * 0.15;
          this.ctx.audio.play('erase', { pos: this.footP, pitch: 1.4 + k * 0.8, vol: 0.8 });
        }
        this.sweepCheck(player, prev);
        this.lineCheck(player, drawn);
        if (k >= 1) {
          this.preview.visible = false;
          this.line.geometry.setDrawRange(0, SEGS * 6);
          this.close(player);
          this.setState('CIRCLE');
        }
        break;
      }
      case 'CIRCLE': {
        const fade = Math.max(0, this.stateT - (CIRCLE_T - FADE_T)) / FADE_T;
        (this.line.material as THREE.MeshBasicMaterial).opacity = 1 - fade;
        if (fade < 0.5) this.lineCheck(player, 1);
        else this.circle.active = false;
        if (this.stateT > CIRCLE_T) {
          this.hideLines();
          this.attackCd = C.cd * (0.8 + Math.random() * 0.4);
          this.beginLift();
        }
        break;
      }
      case 'LIFT': {
        if (this.stateT > LIFT_T) this.setState(this.alerted ? 'CHASE' : 'IDLE');
        break;
      }
    }
    this.move(vx, vz, dt);
  }

  /**
   * The circle's radius for WAI at distance d: d + margin, clamped; shrunk so the line stays on the floor in front of a
   * wall behind WAI (the ring never runs through bricks). 0 = no fair circle from here: he would have under 0.8 m to get
   * out (backed against a wall); the compass walks round him instead.
   */
  private fairRadius(player: PlayerController, d: number, margin: number): number {
    let r = THREE.MathUtils.clamp(d + margin, R_MIN, R_MAX);
    _a.copy(this.pos).setY(this.pos.y + 0.5);
    _b.copy(player.pos).sub(this.pos).setY(0).normalize();
    const wall = this.ctx.physics.raycast(_a, _b, r + 0.6, (c) => this.ctx.physics.tagOf(c) === 'static');
    if (wall) r = Math.min(r, wall.dist - 0.4);
    return r >= d + 0.8 && r >= R_MIN ? r : 0;
  }

  private beginPlant(player: PlayerController, r: number): void {
    this.setState('PLANT');
    this.needleDmg = 0;
    this.circle.center.copy(this.pos);
    this.circle.r = r;
    this.circle.active = false;
    this.circle.drawn = 0;
    const toWai = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    this.spinFrom = toWai + Math.PI; // starts behind, so WAI sees it coming round
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.pencilAngle = this.spinFrom;
    for (const m of [this.line, this.preview]) {
      fillRing(m, r, this.spinFrom, this.spinDir, LINE_W);
      m.position.set(this.pos.x, this.pos.y + (m === this.line ? LINE_LIFT : PREVIEW_LIFT), this.pos.z);
    }
    this.preview.geometry.setDrawRange(0, SEGS * 6);
    this.preview.visible = true;
    this.line.visible = false;
    this.lineHit = false;
    this.fromN.copy(this.footN);
    this.fromP.copy(this.footP);
    this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.1 });
    this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 1.2, vol: 0.6 });
    this.ctx.effects.burst(_v.copy(this.pos).setY(this.pos.y + 0.1), '#d8dcf0', 6, 2);
  }

  private beginLift(): void {
    this.setState('LIFT');
    this.fromN.copy(this.footN);
    this.fromP.copy(this.footP);
  }

  /** The pencil passes WAI's bearing while his feet are low on the line: SCRATCH. */
  private sweepCheck(player: PlayerController, prev: number): void {
    const c = this.circle.center;
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (Math.abs(dist - this.circle.r) > SWEEP_BAND || player.pos.y - c.y > SWEEP_FEET) return;
    const bearing = Math.atan2(dx, dz);
    const span = wrap(this.pencilAngle - prev);
    const off = wrap(bearing - prev);
    const passed = span >= 0 ? off >= 0 && off <= span : off <= 0 && off >= span;
    if (!passed) return;
    // knocked outward, off the line (from the needle's side)
    if (player.takeHit(c, compassTuning().line, 4)) {
      this.lineHit = true; // this crossing has had its hit
      this.ctx.effects.comic(_b.copy(player.pos).setY(player.pos.y + 1.8), t('SCRATCH!'), PAL.red, 0.8);
      this.ctx.audio.play('crash', { pos: player.pos, pitch: 1.9, vol: 0.45 });
    }
  }

  /** WAI on foot on the drawn part of the line: one half heart per crossing (his invuln respected). */
  private lineCheck(player: PlayerController, drawn: number): void {
    const c = this.circle.center;
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const dist = Math.hypot(dx, dz);
    const feet = player.pos.y - c.y;
    let on = Math.abs(dist - this.circle.r) < LINE_BAND && feet > -0.6 && feet < LINE_FEET;
    if (on && drawn < 1) {
      const rel = (((Math.atan2(dx, dz) - this.spinFrom) * this.spinDir) % TAU + TAU) % TAU;
      on = rel <= drawn * TAU;
    }
    if (!on) {
      this.lineHit = false;
      return;
    }
    if (this.lineHit) return;
    // pushed off the line, OUT of the circle (the way the counter goes: it never shuts him in)
    if (player.takeHit(c, compassTuning().line, 5)) {
      this.lineHit = true;
      this.ctx.effects.comic(_b.copy(player.pos).setY(player.pos.y + 1.8), t('OFF THE LINE!'), PAL.red, 0.75);
    }
  }

  /** The pencil meets its start: the circle CLOSES. Everything inside on foot is corrected, the room hears it. */
  private close(player: PlayerController): void {
    const c = this.circle.center, r = this.circle.r;
    closeFx(this.ctx.effects.sound, c, r);
    this.ctx.effects.ring(_a.copy(c).setY(c.y + 0.05), '#ffffff', r - 0.2);
    this.ctx.audio.play('stampHit', { pos: c, pitch: 0.7, vol: 1.1 });
    this.ctx.audio.play('stomp', { pos: c, pitch: 0.75, vol: 0.8 });
    this.ctx.audio.play('smallBell', { pos: c, pitch: 1.0, vol: 0.9 });
    const far = this.ctx.camera.camera.position.distanceTo(c);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4 * Math.max(0, 1 - far / 18));
    if (player.smudged) return;
    const dist = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
    const feet = player.pos.y - c.y;
    if (dist > r - LINE_BAND || feet < -0.6 || feet > 0.7) return;
    if (!player.takeHit(c, compassTuning().hit, CLOSE_KNOCK)) return;
    this.lineHit = true;
    this.ctx.effects.comic(_b.copy(player.pos).setY(player.pos.y + 1.9), t('CORRECTED!'), PAL.red, 1.0);
    this.ctx.audio.play('crash', { pos: player.pos, pitch: 1.2, vol: 0.6 });
    this.ctx.time.hitstop(0.09);
    screenMark('circle');
  }

  // ───────────── animation ─────────────
  protected animate(dt: number): void {
    this.wob += dt;
    const floor = this.renderPos.y;
    const L = this.look;
    let tipWant = 0;
    let twirlV = 0;
    switch (this.state) {
      case 'PLANT':
      case 'SPIN':
      case 'CIRCLE': {
        const k = this.state === 'PLANT' ? Math.min(1, this.stateT / (compassTuning().plant * 0.7)) : 1;
        const kk = k * k * (3 - 2 * k);
        this.footN.lerpVectors(this.fromN, this.circle.center, kk);
        this.spread = THREE.MathUtils.lerp(STRIDE, this.circle.r, kk);
        const a = this.pencilAngle;
        _a.set(this.circle.center.x + Math.sin(a) * this.spread, this.circle.center.y, this.circle.center.z + Math.cos(a) * this.spread);
        this.footP.lerpVectors(this.fromP, _a, kk);
        if (this.state === 'PLANT') this.footN.y += Math.max(0, Math.sin(k * Math.PI)) * 0.25; // the stab
        break;
      }
      case 'STUCK':
        tipWant = 1;
        this.standFeet(0);
        break;
      case 'CALM': {
        const k = Math.min(1, this.calmT / FLOWER_T);
        const c = this.circle.center;
        if (k < 1) {
          this.flower.geometry.setDrawRange(0, Math.floor(k * FLOWER_SEGS) * 6);
          const blend = Math.min(1, this.calmT * 3);
          this.footN.lerpVectors(this.fromN, c, blend);
          flowerAt(k, _a).add(c);
          this.footP.lerpVectors(this.fromP, _a, blend);
        } else {
          // done: a happy twirl on the needle, pencil kicked up
          this.flower.geometry.setDrawRange(0, FLOWER_SEGS * 6);
          twirlV = 5;
          this.footN.copy(c);
          _a.set(c.x + 0.6, c.y + 0.25 + Math.abs(Math.sin(this.wob * 4)) * 0.2, c.z);
          this.footP.copy(_a);
        }
        break;
      }
      case 'LIFT': {
        const k = Math.min(1, this.stateT / LIFT_T);
        _a.copy(this.renderPos);
        _b.copy(this.fromP).sub(this.fromN).setY(0);
        if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0);
        _b.setLength(STRIDE);
        _h.copy(_a).addScaledVector(_b, -0.5);
        _k.copy(_a).addScaledVector(_b, 0.5);
        this.footN.lerpVectors(this.fromN, _h, k);
        this.footP.lerpVectors(this.fromP, _k, k);
        this.footN.y += Math.sin(k * Math.PI) * 0.2; // yank
        this.pivotIsNeedle = true;
        this.stepK = 0;
        this.stepFrom = Math.atan2(_b.x, _b.z);
        break;
      }
      default:
        this.gait(dt, floor);
    }
    this.tipK += (tipWant - this.tipK) * Math.min(1, dt * (tipWant ? 7 : 4));
    this.twirl = twirlV ? this.twirl + dt * twirlV : this.twirl * Math.max(0, 1 - dt * 6);
    this.pose();
    // toppled: the whole compass falls back onto the floor (with a small bounce), eyes rolling
    const down = STUCK_T - this.staggerT; // seconds on the floor (stateT is frozen while it reels)
    const bounce = this.state === 'STUCK' ? Math.abs(Math.sin(down * 9)) * Math.max(0, 0.7 - down) * 0.15 : 0;
    L.rig.rotation.set(-this.tipK * 1.38 + bounce, this.twirl, 0);
    // lying down, its middle stays over the body (where paint lands on it)
    L.rig.position.set(0, this.tipK * 0.06, this.tipK * 0.85);
    const dizzy = this.state === 'STUCK' || this.state === 'STUNNED';
    const angry = this.state === 'PLANT' || this.state === 'SPIN' ? 0.25 : 0;
    const calm = this.state === 'CALM';
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      const p = L.pupils[i], b = L.brows[i];
      if (dizzy) p.position.set(s * 0.07 + Math.cos(this.wob * 12 + i) * 0.015, 0.055 + Math.sin(this.wob * 12 + i) * 0.015, 0.126);
      else p.position.set(s * 0.065, calm ? 0.06 : 0.05, 0.126);
      b.rotation.z = calm ? -s * 0.3 : s * (0.45 + angry);
      b.position.y = calm ? 0.125 : 0.11 - angry * 0.02;
    }
    const f = this.flash > 0 ? 0.7 : 0;
    for (const m of L.flashMats) m.emissive.setRGB(f, f, f);
  }

  /** Both feet on the floor around the body, legs a stride apart (local X), for the STUCK pose. */
  private standFeet(yaw: number): void {
    const p = this.root.position;
    const c = Math.cos(this.root.rotation.y + yaw), s = Math.sin(this.root.rotation.y + yaw);
    // local ±X → world
    this.footN.set(p.x - c * STRIDE * 0.5, this.renderPos.y, p.z + s * STRIDE * 0.5);
    this.footP.set(p.x + c * STRIDE * 0.5, this.renderPos.y, p.z - s * STRIDE * 0.5);
  }

  /** Compass walk: the pivot foot stays planted, the free foot swings a half circle over it to land ahead. */
  private gait(dt: number, floor: number): void {
    const mx = this.pos.x - this.prevPos.x, mz = this.pos.z - this.prevPos.z;
    const speed = Math.hypot(mx, mz) / Math.max(1e-3, dt);
    const pivot = this.pivotIsNeedle ? this.footN : this.footP;
    const free = this.pivotIsNeedle ? this.footP : this.footN;
    // drifted too far from the body (knocked, teleported): re-plant the feet round it
    const midX = (pivot.x + free.x) / 2, midZ = (pivot.z + free.z) / 2;
    if (Math.hypot(midX - this.renderPos.x, midZ - this.renderPos.z) > STRIDE * 1.2) {
      this.standFeet(Math.PI / 2);
      this.stepFrom = this.facing + Math.PI;
      this.stepK = 0;
      return;
    }
    pivot.y = floor;
    if (speed < 0.25 && this.stepK === 0) {
      free.y = floor;
      return;
    }
    // travel yaw from the body motion (or facing when it's settling a step)
    const yaw = speed > 0.25 ? Math.atan2(mx, mz) : this.facing;
    // aim the step so the free foot lands ahead of the body
    let delta = wrap(yaw - this.stepFrom);
    if (this.stepSign > 0 && delta < 0) delta += TAU;
    if (this.stepSign < 0 && delta > 0) delta -= TAU;
    if (Math.abs(delta) > 1.6 * Math.PI) delta -= Math.sign(delta) * TAU; // it turned round: step back the short way
    this.stepK = Math.min(1, this.stepK + (Math.max(speed, 1.2) * dt) / STRIDE);
    const k = this.stepK;
    const e = k * k * (3 - 2 * k);
    const a = this.stepFrom + delta * e;
    free.set(pivot.x + Math.sin(a) * STRIDE, floor + Math.sin(k * Math.PI) * 0.28, pivot.z + Math.cos(a) * STRIDE);
    if (k >= 1) {
      free.y = floor;
      this.pivotIsNeedle = !this.pivotIsNeedle;
      this.stepFrom = Math.atan2(pivot.x - free.x, pivot.z - free.z);
      this.stepK = 0;
      this.ctx.audio.play('step', { pos: free, pitch: 1.6, vol: 0.25 });
    }
  }

  /** Pose the rig from the two world feet: hinge above them, legs aimed, pencil knee bent toward the floor. */
  private pose(): void {
    const L = this.look;
    // world → root-local (yaw + translation; the reel's tilt and the jelly scale stay on the root)
    const n = this.toLocal(this.footN, _a);
    const p = this.toLocal(this.footP, _b);
    // the hinge: over the needle side of the gap, high enough for the rigid needle leg
    _d.set(p.x - n.x, 0, p.z - n.z);
    const gap = _d.length();
    if (gap > 1e-3) _d.divideScalar(gap);
    else _d.set(1, 0, 0);
    // walking: the hinge sits over the middle; spread wide, it leans only a little off the needle
    const off = gap <= STRIDE ? gap / 2 : Math.max(0.3, STRIDE / 2 - (gap - STRIDE) * 0.25);
    const rise = Math.sqrt(Math.max(0.01, LEG * LEG - off * off));
    _h.copy(n).addScaledVector(_d, off);
    _h.y = n.y + rise; // the needle leg is rigid
    // needle leg
    _e.copy(n).sub(_h).normalize();
    L.needleLeg.position.copy(_h);
    L.needleLeg.quaternion.setFromUnitVectors(DOWN, _e);
    // pencil: the knee bends so the pencil stands steeper than the leg (like a real compass's knee joint)
    _v.copy(p).sub(_h).normalize();
    _k.copy(_v).lerp(DOWN, 0.55).normalize(); // pencil direction
    const kneeX = p.x - _k.x * PENCIL, kneeY = p.y - _k.y * PENCIL, kneeZ = p.z - _k.z * PENCIL;
    L.knee.position.set(kneeX, kneeY, kneeZ);
    L.knee.quaternion.setFromUnitVectors(DOWN, _k);
    _v.set(kneeX - _h.x, kneeY - _h.y, kneeZ - _h.z);
    const legLen = _v.length();
    _v.divideScalar(Math.max(1e-3, legLen));
    L.pencilLeg.position.copy(_h);
    L.pencilLeg.quaternion.setFromUnitVectors(DOWN, _v);
    const ext = Math.max(0.06, legLen - UPPER);
    L.extension.scale.y = ext * 0.55;
    L.extensionInner.position.y = -UPPER - ext * 0.5;
    L.extensionInner.scale.y = ext * 0.5;
    // the head: yaw so its X axis runs needle → pencil, roll onto the legs' bisector
    const yaw = Math.atan2(-_d.z, _d.x);
    const bx = _e.x * _d.x + _e.z * _d.z + (_v.x * _d.x + _v.z * _d.z);
    const by = _e.y + _v.y;
    L.head.position.copy(_h);
    L.head.rotation.order = 'YZX';
    L.head.rotation.set(0, yaw, Math.atan2(bx, -by) * 0.6);
  }

  /** World → root-local (yaw + translation + the jelly scale; the reel's tilt stays on the root). */
  private toLocal(w: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const rp = this.root.position, ry = this.root.rotation.y, sc = this.root.scale.y || 1;
    const c = Math.cos(ry), s = Math.sin(ry);
    const x = w.x - rp.x, z = w.z - rp.z;
    return out.set((x * c - z * s) / sc, (w.y - rp.y) / sc, (x * s + z * c) / sc);
  }

  override dispose(): void {
    for (const m of [this.line, this.preview, this.flower]) {
      m.removeFromParent();
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    super.dispose();
  }
}
