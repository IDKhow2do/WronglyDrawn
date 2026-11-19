/**
 * [INPUT]: depends on batchStatic (frame merge) from render/SceneOptimizer; EnemyBase (KCC body, stagger/TAG via holdStagger, weakPoints/preDamage, the room leash) from ./EnemyBase;
 *          buildPressLook/PRESS and the floor-mark textures from ./StampPressLook; RAPIER (sensor toggle, the
 *          head collider) from core/PhysicsWorld; PlayerController (takeHit, nudgeTo, collider) from player; stampTuning (hop length /
 *          time, shockwave radius) from meta/Difficulty
 * [OUTPUT]: exports the StampPress enemy (kind 'stamppress'), its `ramUp` read-out and the onStamp hook
 * [POS]: level-3 creature (Limp Works, inside the Correction Tower). Built around ONE player action: sprint UNDER
 *        the raised ram, between its legs, to its back (long Legs make it comfortable). It stalls, its stamp
 *        stuck to the floor: TAG window, ink pad on its back ×2.5. Each slam also sends a shockwave ring (r stampTuning().shockR,
 *        drawn round the landing mark in the tell): jump it or be under / behind the ram. StampPressLook.ts holds the model.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { batchStatic } from '../render/SceneOptimizer';
import { t } from '../i18n';
import { RAPIER } from '../core/PhysicsWorld';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { PAL } from '../render/PaintTextures';
import { stampTuning } from '../meta/Difficulty';
import { PRESS, buildPressLook, correctMarkTexture, happyMarkTextures, landMarkTexture, type PressLook } from './StampPressLook';

// ───────────── tuning ─────────────
const HP = 320;
const BODY_R = 0.85; // capsule radius (footprint ≈ 2.2 × 1.8 m with the legs)
const BODY_HH = 0.45; // capsule half height → 2.6 m tall
const SEE_R = 13;
const KEEP_NEAR = 5; // CHASE keeps WAI in this band
const KEEP_FAR = 6;
const TELL_T = 0.8; // wheel spins, ram winds up, the landing outline shows
const HOPS = 4;
const RISE_T = 0.07; // ram leaves the floor…
const FALL_T = 0.07; // …and comes back down at the end of the hop
const DOWN_T = 0.32; // pressed into the floor between hops (solid)
const REST_H = 0.8; // stamp face height while walking (too low to pass)
const UP_H = 1.58; // face height while hopping: a 1.5 m gap for WAI
const WIND_H = 1.72; // wound up high in the tell
const STUCK_T = 2.6;
const FRONT_MUL = 0.3; // paint on the front / ram is stamped away
const WEAK_MUL = 2.5; // the ink pad, while stuck
const WEAK_R = 0.75;
const KNOCK = 7;
// the slam's shockwave: a ring round the stamp that hurts anyone on the floor inside it (jump it, or be under / behind the ram)
const SHOCK_R0 = 3.4; // the ring mesh's drawn radius (scaled to stampTuning().shockR)
const SHOCK_KNOCK = 6;
// danger box at a slam (local): under the frame or in the marked rectangle; behind the back legs is safe
const HIT_HX = 1.15;
const HIT_HZ = 1.1;
// "under it" box for the pass-through check
const UNDER_HX = 1.0;
const UNDER_HZ = 0.9;
const PASSED_Z = -1.2;
const MARKS = 8;
const MARK_LIFE = 4;
const MARK_FADE = 1;
const MARK_W = 0.98;
const MARK_D = 0.69;
const CALM_SIZE = 0.6;
const CALM_STAMP_T = 1.7;

// scratch (no per-frame allocation)
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _l = new THREE.Vector3();

interface Mark {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
}

/**
 * Stamp Press: a cast-iron bench press stomping about on four crooked legs. It keeps a few metres off WAI,
 * then WINDS UP (hand-wheel spins, ram hauled high, a red outline marks where it lands) and STAMP-RUNS at
 * him in four hops, slamming CORRECT into the floor at each. Between slams the ram is up and there is a
 * gap between its legs: sprint UNDER it to its back and it stalls, stamp stuck to the floor — TAG IT and
 * spray the ink pad on its back. Get caught under a slam and WAI is CORRECTED.
 */
export class StampPress extends EnemyBase {
  readonly kind = 'stamppress';
  readonly displayName = 'Stamp Press';
  readonly bigness = 0.5;
  /** Called on every slam (a fresh vector: keep it). */
  onStamp: ((at: THREE.Vector3) => void) | null = null;
  private look: PressLook;
  private headCol: RAPIER.Collider;
  private sensor = false;
  private marks: Mark[] = [];
  private markNext = 0;
  private marker: THREE.Mesh;
  private markerMat: THREE.MeshBasicMaterial;
  private markerAt = new THREE.Vector3();
  private shock: THREE.Mesh;
  private shockMat: THREE.MeshBasicMaterial;
  private ramH = REST_H;
  private hopping = false;
  private hopIdx = 0;
  private runT = 0;
  private hopDir = new THREE.Vector3();
  private attackCd = 1.6;
  private wander = new THREE.Vector3();
  private seeT = 0;
  private sees = false;
  private under = false; // WAI went in under the raised ram (from the front) this run
  private stuck = false;
  private stuckEnd = 0;
  private clock = 0;
  private frontHits = 0;
  private hintCd = 0;
  private stuckTold = false;
  private phase = 0;
  private spin = 0;
  private calmT = 0;
  private calmPrint = 0;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, HP, BODY_R, BODY_HH);
    this.look = buildPressLook();
    // the frame's static parts (direct children of the rig) merge into one mesh per material (perf: 5 presses)
    for (const c of this.look.rig.children) if ((c as THREE.Mesh).isMesh) c.userData.batch = true;
    batchStatic(this.look.rig);
    this.root.add(this.look.rig);
    this.paintAnchor = this.look.rig;
    // the crown is solid even while the ram is up (paint keeps landing on it; WAI ducks under it)
    this.headCol = ctx.physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.28, 0.82).setTranslation(0, PRESS.crownY + 0.25 - this.cOff, 0), this.body);
    ctx.physics.tag(this.headCol, 'enemy', this);
    // floor prints: a small reused pool (CORRECT in red ink; flowers once it is calm)
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < MARKS; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: correctMarkTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 1;
      mesh.visible = false;
      mesh.userData.noPaint = true;
      mesh.name = 'stamp-print';
      ctx.root.add(mesh);
      this.marks.push({ mesh, mat, age: MARK_LIFE + MARK_FADE });
    }
    // the landing telegraph
    this.markerMat = new THREE.MeshBasicMaterial({ map: landMarkTexture(), transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.marker = new THREE.Mesh(new THREE.PlaneGeometry(MARK_W * 1.3, MARK_D * 1.45).rotateX(-Math.PI / 2), this.markerMat);
    this.marker.renderOrder = 2;
    this.marker.visible = false;
    this.marker.userData.noPaint = true;
    ctx.root.add(this.marker);
    // the shockwave's reach, drawn round the landing mark (the tell shows how far the slam carries)
    this.shockMat = new THREE.MeshBasicMaterial({ color: '#d8283a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.shock = new THREE.Mesh(new THREE.RingGeometry(SHOCK_R0 - 0.4, SHOCK_R0, 48).rotateX(-Math.PI / 2), this.shockMat);
    this.shock.renderOrder = 2;
    this.shock.userData.noPaint = true;
    this.marker.add(this.shock);
    this.wander.copy(start);
  }

  // ───────────── read-outs ─────────────
  /** The ram is up between slams: the gap between its legs is open (and its body lets WAI through). */
  get ramUp(): boolean {
    return this.state === 'RUN' && this.hopping && this.runT > RISE_T && this.runT < stampTuning().hopT - FALL_T * 0.5;
  }

  get counterHint(): string {
    if (this.ramUp) return 'The ram is UP — sprint under it to its back!';
    if (this.stuck) return 'Its stamp is stuck — spray the ink pad on its back, then TAG IT!';
    return 'When it stamp-runs at you, sprint under the raised ram (long Legs help)';
  }

  // ───────────── damage rules ─────────────
  protected override weakPoints(): WeakPoint[] {
    if (!this.stuck || this.staggerT <= 0) return [];
    return [{ pos: this.local(PRESS.inkPad, new THREE.Vector3()), radius: WEAK_R, mul: WEAK_MUL }];
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (this.stuck || info.kind !== 'paint') return null;
    this.toLocal(info.point, _l);
    const onRam = Math.abs(_l.x) < PRESS.faceHX + 0.15 && Math.abs(_l.z) < PRESS.faceHZ + 0.15 && _l.y > this.ramH - 0.1 && _l.y < this.ramH + PRESS.ramTop + 0.1;
    if (_l.z < 0.3 && !onRam) return null;
    info.amount *= FRONT_MUL;
    this.frontHits++;
    if (Math.random() < 0.04) this.ctx.effects.comic(_v.copy(info.point).setY(info.point.y + 0.5), t('STAMPED OUT!'), PAL.red, 0.5);
    if (this.frontHits >= 14 && this.hintCd <= 0) {
      this.hintCd = 16;
      this.frontHits = 0;
      this.ctx.events.emit('toast', { text: t('Its stamp CORRECTS paint off its front! When it stamp-runs, sprint UNDER the raised ram to its back (long Legs help).'), kind: 'warn', at: this.pos });
    }
    return null;
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'hitWeak' : 'hit', { pos: this.pos, pitch: weak ? 1.0 : 0.8, vol: 0.5 });
  }

  protected override interrupt(): void {
    if (this.state === 'TELL_RUN' || this.state === 'RUN') {
      this.hopping = false;
      this.marker.visible = false;
      this.setSensor(false);
      this.attackCd = 1.8;
      this.setState('CHASE');
    } else if (this.stuck) {
      // a stagger mid-STUCK must not cut the TAG window short
      this.holdStagger(Math.max(0, this.stuckEnd - this.clock));
    }
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  protected override finish(): void {
    this.hopping = false;
    this.stuck = false;
    this.marker.visible = false;
    this.setSensor(false);
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
    this.calmT = 0;
    this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 2.4), t('APPROVED!'), PAL.yellow, 0.9);
  }

  override step(dt: number, player: PlayerController): void {
    this.clock += dt;
    this.hintCd -= dt;
    super.step(dt, player);
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') return this.calmAi(dt);
    if (this.stuck) {
      // the TAG window ran out: it wrenches the stamp off the floor
      this.stuck = false;
      this.attackCd = 1.6;
      this.setState('CHASE');
      this.ctx.audio.play('pop', { pos: this.pos, pitch: 0.6 });
    }
    _v.copy(player.pos).sub(this.pos).setY(0);
    const d = _v.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2.4;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.seeT -= dt;
    if (this.seeT <= 0) {
      this.seeT = 0.2;
      this.sees = valid && d < SEE_R + 4 && this.canSee(player.pos, 2.2);
    }
    let vx = 0;
    let vz = 0;
    // its own steps never ride up onto (or shove) WAI: it strides over him while the ram is up and
    // resolveOverlap() slides him out once it is solid again
    const exclude = player.collider?.handle;
    switch (this.state) {
      case 'IDLE': {
        // outside its room: the way home is through the door
        const to = this.homeward(this.wander, _l);
        _w.copy(to).sub(this.pos).setY(0);
        if (_w.length() < 0.5) this.wander.set(this.home.x + (Math.random() - 0.5) * 7, this.home.y, this.home.z + (Math.random() - 0.5) * 7);
        else {
          _w.normalize();
          vx = _w.x * 1.2;
          vz = _w.z * 1.2;
          this.faceToward(to, dt, 3);
        }
        if (valid && d < SEE_R && this.sees && this.roomAllows(player.pos)) this.alert();
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 20 || !this.roomAllows(player.pos)) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.faceToward(player.pos, dt, 5);
        const n = d > 0.01 ? 1 / d : 0;
        if (d > KEEP_FAR || (!this.sees && d > 2.5)) {
          vx = _v.x * n * 2.4;
          vz = _v.z * n * 2.4;
        } else if (d < KEEP_NEAR) {
          vx = -_v.x * n * 1.8;
          vz = -_v.z * n * 1.8;
        }
        if (this.attackCd <= 0 && d < 9.5 && this.sees) {
          this.setState('TELL_RUN');
          this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 0.8 });
          this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 0.9, vol: 0.7 });
        }
        break;
      }
      case 'TELL_RUN': {
        this.faceToward(player.pos, dt, 8);
        this.showMarker(this.pos.x + Math.sin(this.facing) * stampTuning().hopD, this.pos.z + Math.cos(this.facing) * stampTuning().hopD);
        if (this.stateT > TELL_T) {
          this.setState('RUN');
          this.hopIdx = 0;
          this.under = false;
          this.startHop(player);
        }
        break;
      }
      case 'RUN': {
        this.runT += dt;
        if (this.hopping) {
          const k = this.runT;
          this.ramH = k < RISE_T ? UP_H * (k / RISE_T) : k > stampTuning().hopT - FALL_T ? UP_H * Math.max(0, (stampTuning().hopT - k) / FALL_T) ** 2 : UP_H + Math.sin((k / stampTuning().hopT) * Math.PI) * 0.06;
          const sp = stampTuning().hopD / stampTuning().hopT;
          vx = this.hopDir.x * sp;
          vz = this.hopDir.z * sp;
          this.faceToward(_w.copy(this.pos).add(this.hopDir), dt, 10);
          this.setSensor(this.runT > RISE_T * 0.5); // open until the slam itself: WAI is never shoved out from under a falling ram
          if (this.watchPass(player)) return;
          if (this.runT >= stampTuning().hopT) {
            // a pass must finish inside one window: out past the frame's middle at the slam still counts
            this.toLocal(player.pos, _l);
            if (this.under && _l.z < -UNDER_HZ && Math.abs(_l.x) < UNDER_HX + 0.6) {
              this.stall(player);
              return;
            }
            this.under = false;
            this.slam(player, true);
          }
        } else {
          this.ramH = 0;
          if (this.runT >= DOWN_T) {
            if (++this.hopIdx >= HOPS) {
              this.marker.visible = false;
              this.attackCd = 2.2 + Math.random() * 1.2;
              this.setState('CHASE');
            } else this.startHop(player);
          }
        }
        break;
      }
      case 'STUCK':
        break;
    }
    this.move(vx, vz, dt, exclude);
    this.resolveOverlap(player);
  }

  private startHop(player: PlayerController): void {
    this.hopping = true;
    this.runT = 0;
    // re-aim each hop (at most ~40° off the way it already faces)
    _w.copy(player.pos).sub(this.pos).setY(0);
    const want = _w.lengthSq() > 1e-4 ? Math.atan2(_w.x, _w.z) : this.facing;
    let da = Math.atan2(Math.sin(want - this.facing), Math.cos(want - this.facing));
    da = THREE.MathUtils.clamp(da, -0.7, 0.7);
    const a = this.facing + da;
    this.hopDir.set(Math.sin(a), 0, Math.cos(a));
    this.showMarker(this.pos.x + this.hopDir.x * stampTuning().hopD, this.pos.z + this.hopDir.z * stampTuning().hopD);
    this.ctx.audio.play('jump', { pos: this.pos, pitch: 0.5, vol: 0.6 });
  }

  /** WAI went under the raised ram from the front and came out at its back → it stalls. */
  private watchPass(player: PlayerController): boolean {
    if (Math.abs(player.pos.y - this.pos.y) > 1.4) return false;
    this.toLocal(player.pos, _l);
    const inside = Math.abs(_l.x) < UNDER_HX && Math.abs(_l.z) < UNDER_HZ;
    if (inside && this.ramUp && !this.under && _l.z > -0.3) this.under = true;
    if (this.under && (_l.z > UNDER_HZ + 0.5 || Math.abs(_l.x) > UNDER_HX + 0.6)) this.under = false; // backed out / went round
    if (this.under && _l.z < PASSED_Z && Math.abs(_l.x) < UNDER_HX + 0.6) {
      this.stall(player);
      return true;
    }
    return false;
  }

  private stall(player: PlayerController): void {
    this.slam(player, false);
    this.stuck = true;
    this.under = false;
    this.setState('STUCK');
    this.holdStagger(STUCK_T);
    this.stuckEnd = this.clock + STUCK_T;
    this.tagSpent = false;
    this.ctx.effects.comic(_v.copy(this.pos).setY(this.pos.y + 2.9), t('WHERE?'), PAL.turq, 0.9);
    this.ctx.audio.play('jawSnap', { pos: this.pos, pitch: 0.6 });
    this.ctx.audio.play('crash', { pos: this.pos, vol: 0.5, pitch: 1.2 });
    if (!this.stuckTold) {
      this.stuckTold = true;
      this.ctx.events.emit('toast', { text: t('It lost you — and its stamp is STUCK! Spray the ink pad on its back, then TAG IT!'), kind: 'good', at: this.pos });
    }
  }

  /** The ram hits the floor: a CORRECT print, a shake, and WAI under it gets CORRECTED. */
  private slam(player: PlayerController, hurt: boolean): void {
    this.hopping = false;
    this.runT = 0;
    this.ramH = 0;
    this.marker.visible = false;
    this.setSensor(false);
    this.print(correctMarkTexture(), 1);
    const at = this.pos.clone();
    this.ctx.audio.play('stampHit', { pos: at });
    this.ctx.audio.play('stomp', { pos: at, pitch: 0.6, vol: 0.7 });
    this.ctx.effects.ring(_v.copy(at).setY(at.y + 0.05), '#ffffff', 2.4);
    this.ctx.effects.ring(_v.copy(at).setY(at.y + 0.06), '#d8283a', stampTuning().shockR - 0.2); // Effects.ring grows to 0.2 + scale m: the hit radius
    this.ctx.effects.burst(_v.copy(at).setY(at.y + 0.1), '#c9c2d8', 10, 3, 0.07);
    const far = this.ctx.camera.camera.position.distanceTo(at);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.4 * Math.max(0, 1 - far / 16));
    this.onStamp?.(at);
    if (!hurt || player.smudged) return;
    this.toLocal(player.pos, _l);
    if (Math.abs(_l.x) < HIT_HX && _l.z < HIT_HZ && _l.z > -UNDER_HZ && Math.abs(player.pos.y - this.pos.y) < 1.3 && player.takeHit(this.pos, 1, KNOCK)) {
      this.ctx.effects.comic(_v.copy(player.pos).setY(player.pos.y + 1.8), t('CORRECTED!'), PAL.red, 0.95);
      this.ctx.audio.play('squeak', { pos: player.pos, pitch: 0.7 });
      return;
    }
    // the shockwave: on the floor within shockR (a jump clears it; WAI right behind the back legs is past it)
    const flat = Math.hypot(player.pos.x - at.x, player.pos.z - at.z);
    const behind = _l.z < -UNDER_HZ - 0.2 && Math.abs(_l.x) < UNDER_HX + 0.6;
    if (flat < stampTuning().shockR && !behind && player.pos.y < this.pos.y + 0.35 && player.grounded && player.takeHit(at, 1, SHOCK_KNOCK)) {
      this.ctx.effects.comic(_v.copy(player.pos).setY(player.pos.y + 1.8), t('SHOCKWAVE!'), PAL.red, 0.85);
    }
  }

  private calmAi(dt: number): void {
    this.calmT += dt;
    if (!this.bodyless && this.sizeMul < 0.8) this.dropCollider(); // little now: nothing to bump into
    this.calmPrint -= dt;
    if (this.calmPrint <= 0 && this.sizeMul < 0.7) {
      this.calmPrint = CALM_STAMP_T;
      const tx = happyMarkTextures();
      const tex = tx[Math.floor(Math.random() * tx.length)];
      // a happy little print just in front of it
      this.print(tex, 0.85, Math.sin(this.facing) * 0.9 * this.sizeMul, Math.cos(this.facing) * 0.9 * this.sizeMul, Math.random() * Math.PI * 2);
      this.ctx.audio.play('pop', { pos: this.pos, pitch: 1.4, vol: 0.4 });
      this.facing += (Math.random() - 0.5) * 1.6;
    }
  }

  // ───────────── helpers ─────────────
  private setSensor(on: boolean): void {
    if (on === this.sensor || this.bodyless) return;
    this.sensor = on;
    this.collider.setSensor(on);
  }

  /** Solid again with WAI inside its footprint (the ram just came down): slide him out. */
  private resolveOverlap(player: PlayerController): void {
    if (this.sensor || this.bodyless || typeof (player as Partial<PlayerController>).nudgeTo !== 'function') return;
    if (Math.abs(player.pos.y - this.pos.y) > 2.2) return;
    _w.copy(player.pos).sub(this.pos).setY(0);
    const d = _w.length();
    const min = BODY_R + 0.34;
    if (d >= min - 0.03) return;
    if (d > 1e-3) _w.multiplyScalar(1 / d);
    else _w.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    player.nudgeTo(_v.copy(this.pos).addScaledVector(_w, min).setY(player.pos.y));
  }

  private showMarker(x: number, z: number): void {
    this.markerAt.set(x, this.pos.y + 0.035, z);
    this.marker.visible = true;
  }

  /** Leave a print on the floor (pool reuse, oldest first). Offsets are world-space. */
  private print(tex: THREE.Texture, scale: number, ox = 0, oz = 0, yaw = this.facing): void {
    const m = this.marks[this.markNext];
    this.markNext = (this.markNext + 1) % MARKS;
    if (m.mat.map !== tex) {
      m.mat.map = tex;
      m.mat.needsUpdate = true;
    }
    m.age = 0;
    m.mat.opacity = 0.95;
    m.mesh.visible = true;
    m.mesh.position.set(this.pos.x + ox, this.pos.y + 0.02 + this.markNext * 0.0015, this.pos.z + oz);
    m.mesh.rotation.set(0, yaw, 0);
    const sq = tex === correctMarkTexture();
    m.mesh.scale.set(MARK_W * scale * (sq ? 1 : 0.75), 1, MARK_D * scale * (sq ? 1 : 1.05));
  }

  /** Local-frame point (its +Z forward) → world. */
  private local(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const k = this.sizeMul;
    return out.set(this.pos.x + (p.x * c + p.z * s) * k, this.pos.y + p.y * k, this.pos.z + (-p.x * s + p.z * c) * k);
  }

  /** World → local frame. */
  private toLocal(p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    return out.set(dx * c - dz * s, p.y - this.pos.y, dx * s + dz * c);
  }

  // ───────────── animation ─────────────
  protected animate(dt: number): void {
    const L = this.look;
    const speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    this.phase += dt * (3 + speed * 3.2);
    const time = this.clock;
    // prints fade out
    for (const m of this.marks) {
      if (!m.mesh.visible) continue;
      m.age += dt;
      if (m.age > MARK_LIFE) m.mat.opacity = 0.95 * Math.max(0, 1 - (m.age - MARK_LIFE) / MARK_FADE);
      if (m.age > MARK_LIFE + MARK_FADE) m.mesh.visible = false;
    }
    if (this.marker.visible) {
      this.marker.position.copy(this.markerAt);
      this.marker.rotation.y = this.facing;
      const pulse = this.state === 'TELL_RUN' ? 8 + (this.stateT / TELL_T) * 14 : 18;
      this.markerMat.opacity = 0.45 + 0.5 * Math.abs(Math.sin(time * pulse));
      this.shockMat.opacity = 0.45 + 0.4 * Math.abs(Math.sin(time * pulse));
      this.shock.scale.setScalar(stampTuning().shockR / SHOCK_R0);
    }
    // ram height: the brain drives it in the run (snappy); elsewhere it eases
    let lift = 0;
    let crouch = 0;
    switch (this.state) {
      case 'IDLE':
      case 'CHASE':
        this.ramH += (REST_H + Math.sin(time * 2.2) * 0.04 - this.ramH) * Math.min(1, dt * 5);
        lift = Math.abs(Math.sin(this.phase)) * 0.05 * Math.min(1, speed / 1.5);
        break;
      case 'TELL_RUN': {
        const k = Math.min(1, this.stateT / (TELL_T * 0.7));
        this.ramH += (WIND_H + Math.sin(time * 40) * 0.02 - this.ramH) * Math.min(1, dt * 10);
        crouch = 0.12 * k;
        break;
      }
      case 'RUN':
        if (this.hopping) lift = Math.sin(Math.min(1, this.runT / stampTuning().hopT) * Math.PI) * 0.32;
        else crouch = 0.08 * Math.max(0, 1 - this.runT / DOWN_T);
        break;
      case 'STUCK':
        // tugging at the stuck stamp: the frame heaves up, the ram stays glued down
        this.ramH = 0;
        lift = Math.abs(Math.sin(time * 9)) * 0.16;
        break;
      case 'STUNNED':
        this.ramH += (0.5 - this.ramH) * Math.min(1, dt * 4);
        break;
      case 'CALM': {
        const c = Math.max(0, CALM_STAMP_T - this.calmPrint);
        const hop = c < 0.35 ? Math.sin((c / 0.35) * Math.PI) : 0;
        lift = hop * 0.25;
        this.ramH += ((hop > 0 ? 0.15 : 0.9) - this.ramH) * Math.min(1, dt * 14);
        break;
      }
    }
    L.rig.position.y = lift - crouch;
    const planted = this.state === 'STUCK' || (this.state === 'RUN' && !this.hopping);
    L.ram.position.y = planted ? -L.rig.position.y : this.ramH;
    const top = L.ram.position.y + PRESS.ramTop;
    L.bellows.position.y = top - 0.02;
    L.bellows.scale.y = Math.max(0.04, PRESS.crownY + 0.02 - top);
    // the hand-wheel: spins hard in the tell, turns with each hop, idles; happy twirls when calm
    const want = this.state === 'TELL_RUN' ? 16 : this.state === 'RUN' ? (this.hopping ? -9 : 0) : this.state === 'CALM' ? 2.5 : this.state === 'STUCK' ? Math.sin(time * 6) * 8 : 0.6;
    this.spin += (want - this.spin) * Math.min(1, dt * 6);
    L.wheel.rotation.y += this.spin * dt;
    // gauge eyes: needles dip to red when it winds up, spin dizzy when stuck, point up when calm
    for (let i = 0; i < L.needles.length; i++) {
      const s = i === 0 ? -1 : 1;
      let a = s * 0.55; // angry: tips pointing in
      if (this.state === 'TELL_RUN' || this.state === 'RUN') a = s * 1.2 + Math.sin(time * 50 + i) * 0.08;
      else if (this.state === 'STUCK' || this.state === 'STUNNED') a = time * (i ? 9 : -7);
      else if (this.state === 'CALM') a = Math.sin(time * 3 + i) * 0.3;
      L.needles[i].rotation.z = a;
    }
    for (let i = 0; i < L.brows.length; i++) {
      const b = L.brows[i];
      const s = i === 0 ? -1 : 1;
      const angry = this.state === 'CALM' ? -0.25 : this.state === 'STUCK' || this.state === 'STUNNED' ? -0.1 : 0.42;
      b.rotation.z = -s * angry;
      b.position.y = PRESS.crownY + 0.44 + (this.state === 'STUCK' ? 0.06 + Math.sin(time * 7) * 0.02 : this.state === 'CALM' ? 0.05 : 0);
    }
    L.inkLid.rotation.x = 2.3 + (this.state === 'STUCK' ? Math.sin(time * 14) * 0.12 : 0);
    // legs: a stomping trot, tucked mid-hop, braced when it slams, scrabbling when stuck
    const walk = Math.min(1, speed / 1.6);
    const tuck = this.state === 'RUN' && this.hopping ? Math.sin(Math.min(1, this.runT / stampTuning().hopT) * Math.PI) : 0;
    for (let i = 0; i < L.legs.length; i++) {
      const front = i < 2 ? 1 : -1;
      const side = i % 2 ? 1 : -1;
      const swing = Math.sin(this.phase + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.35 * walk;
      const scrab = this.state === 'STUCK' ? Math.sin(time * 18 + i * 1.7) * 0.35 : 0;
      const bend = crouch * 2.5 + tuck * 0.5;
      L.legs[i].pose(-front * (0.6 + bend * 0.5) + swing + scrab, front * (0.75 + bend), side * (0.15 + tuck * 0.12));
    }
    // shrink into a little stamp once calm
    if (this.state === 'CALM') this.sizeMul += (CALM_SIZE - this.sizeMul) * Math.min(1, dt * 2);
    const f = this.flash > 0 ? 0.7 : this.state === 'TELL_RUN' && Math.sin(time * 30) > 0.3 ? 0.25 : 0;
    L.frameMat.emissive.setRGB(f, f * (this.state === 'TELL_RUN' ? 0.2 : 1), f * (this.state === 'TELL_RUN' ? 0.2 : 1));
  }

  override dispose(): void {
    if (this.disposed) return;
    for (const m of this.marks) {
      m.mesh.removeFromParent();
      m.mat.dispose();
    }
    this.marks[0]?.mesh.geometry.dispose();
    this.marker.removeFromParent();
    this.marker.geometry.dispose();
    this.markerMat.dispose();
    this.shock.geometry.dispose();
    this.shockMat.dispose();
    if (!this.bodyless) this.ctx.physics.untag(this.headCol);
    super.dispose();
  }
}
