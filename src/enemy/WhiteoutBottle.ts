/**
 * [INPUT]: depends on EnemyBase (KCC body, damage routing, stagger/TAG) from ./EnemyBase; Lobbed from ./Lobbed;
 *          toon/paintedMesh/addOutline from render/Materials; labelCanvas/PAL from render/PaintTextures;
 *          GameContext.effects.eraseNear (blanks WAI's paint), effects.sound (the drawn roll lane); Tripo slot whiteoutBottle
 * [OUTPUT]: exports the WhiteoutBottle enemy (kind 'whiteout')
 * [POS]: level-1 expansion creature (Crossed-Out Quarter). Built around ONE player action: get behind it.
 *        Siblings: Stapler (dodge + TAG), RedInkwell (mid-boss, can call one of these in its phase 2).
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { Lobbed } from './Lobbed';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { addOutline, paintedMesh, toon } from '../render/Materials';
import { PAL, labelCanvas } from '../render/PaintTextures';
import { ARC_MODE } from '../render/SoundFx';

const _side = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// ───────────── tuning ─────────────
const TURN = 2.4; // rad/s while it tracks WAI: slow enough to run round behind it
const SQUIRT_TELL = 0.65;
const ROLL_TELL = 0.8;
const ROLL_SPEED = 8.5;
const ROLL_TIME = 1.1;
const DIZZY_TIME = 1.7;
const BACK_MUL = 2.5;
/** Cap height on the Tripo jug (its threaded neck tops out at 1.3 m). */
const CAP_Y = 1.36;

/** The correction-fluid cap: ridges round the black screw cap, and a white brush with a drip under it. */
function dressCap(cap: THREE.Group): void {
  const ink = new THREE.MeshBasicMaterial({ color: '#2a2230' });
  for (let i = 0; i < 4; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.022, 4, 18), ink);
    r.rotation.x = Math.PI / 2;
    r.position.y = 0.05 + i * 0.07;
    cap.add(r);
  }
  const white = toon({ color: PAL.white });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), new THREE.MeshBasicMaterial({ color: '#c9c0b0' }));
  stick.position.y = -0.08;
  const drip = paintedMesh(new THREE.SphereGeometry(0.07, 8, 6), white, 0.015);
  drip.scale.set(1, 1.5, 1);
  drip.position.y = -0.3;
  cap.add(stick, drip);
}

/**
 * White-out Bottle: a bottle of correction fluid that rolls over WAI's fresh paint and blanks it,
 * and squirts white blobs at him. Its hard cap faces front and blanks paint (absorbed); the soft
 * squeeze panel on its back takes ×2.5. Its roll ends in a dizzy sprawl (everything is weak).
 * Repainted, it becomes a friendly bottle that refills WAI's can when he stands next to it.
 */
export class WhiteoutBottle extends EnemyBase {
  readonly kind = 'whiteout';
  readonly displayName = 'White-out Bottle';
  readonly bigness = 0.4;
  /** WAI stood next to the friendly bottle: the session refills the can. */
  onRefill: (() => void) | null = null;
  private tip = new THREE.Group();
  private spin = new THREE.Group();
  private cap = new THREE.Group();
  private bodyMat: THREE.MeshToonMaterial;
  /** The Tripo body's materials (they flash white on a hit too). */
  private flashMats: THREE.MeshStandardMaterial[] = [];
  private labelMat: THREE.MeshToonMaterial;
  private lane: THREE.Mesh;
  private blobs: Lobbed;
  private attackCd = 1.5;
  private rollDir = new THREE.Vector3();
  private rollHit = false;
  private eraseT = 0;
  private blanked = 0;
  private wander = new THREE.Vector3();
  private refillCd = 0;
  private wob = Math.random() * 6;
  private puddles: { m: THREE.Mesh; t: number }[] = [];

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 230, 0.55, 0.45);
    const T = (n: string) => ctx.assets.tex(n);
    this.bodyMat = toon({ color: '#fbf7ee' }); // plain white: it reads as correction fluid at a glance
    // the bottle: a fat white body, a red label band, a dark neck and a brush cap
    const body = paintedMesh(new THREE.CylinderGeometry(0.4, 0.5, 1.05, 16), this.bodyMat, 0.04);
    body.position.y = 0.55;
    const labelTex = new THREE.CanvasTexture(labelCanvas(t('WHITE-OUT'), PAL.white, PAL.red, 512, 96));
    labelTex.colorSpace = THREE.SRGBColorSpace;
    this.labelMat = toon({ map: labelTex });
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.49, 0.34, 16, 1, true), this.labelMat);
    label.position.y = 0.42;
    label.rotation.y = Math.PI; // the word reads on the back (the side you should be on)
    const neck = paintedMesh(new THREE.CylinderGeometry(0.2, 0.36, 0.3, 12), toon({ map: T('metal_dark'), color: '#e8e0ff' }), 0.03);
    neck.position.y = 1.2;
    const capBody = paintedMesh(new THREE.CylinderGeometry(0.22, 0.24, 0.32, 12), toon({ color: PAL.black }), 0.03);
    capBody.position.y = 0.16;
    const brush = paintedMesh(new THREE.ConeGeometry(0.11, 0.28, 8), toon({ color: PAL.white }), 0.02);
    brush.position.y = -0.1;
    brush.rotation.x = Math.PI;
    this.cap.add(capBody, brush);
    this.cap.position.y = 1.33;
    // the hard front cap-plate: what blanks paint (curved metal visor with a yellow rim)
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.6, 0.95, 18, 1, true, -1.05, 2.1), toon({ color: '#cfd6ff' }));
    visor.position.y = 0.55;
    (visor.material as THREE.Material).side = THREE.DoubleSide;
    addOutline(visor, 0.03);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.04, 6, 24, 2.1), toon({ color: PAL.yellow }));
    rim.rotation.set(Math.PI / 2, 0, Math.PI / 2 - 1.05);
    rim.position.y = 1.02;
    // angry eyes painted on the visor
    const eyeW = toon({ color: PAL.white });
    for (const x of [-0.17, 0.17]) {
      const e = paintedMesh(new THREE.SphereGeometry(0.11, 10, 8), eyeW, 0.02);
      e.position.set(x, 0.8, 0.57);
      e.scale.z = 0.45;
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.black }));
      p.position.set(x * 0.9, 0.78, 0.62);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.03), new THREE.MeshBasicMaterial({ color: PAL.black }));
      brow.position.set(x, 0.92, 0.62);
      brow.rotation.z = x > 0 ? 0.45 : -0.45;
      for (const m of [e, p, brow]) m.userData.eyePart = true;
      this.spin.add(e, p, brow);
    }
    // the soft squeeze panel on the back (the weak point: pink, with a "squeeze" dent)
    const panel = paintedMesh(new THREE.SphereGeometry(0.34, 12, 10), toon({ color: '#ff9ec4' }), 0.03);
    panel.position.set(0, 0.62, -0.38);
    panel.scale.set(1, 1.15, 0.45);
    this.spin.add(body, label, neck, this.cap, visor, rim, panel);
    // the Tripo bottle (art pass): a fat white jug with a threaded neck replaces the code body, neck and visor;
    // its red front label reads WHITE-OUT, the ridged cap and its dripping brush stay code (they lift on the tell)
    const glb = ctx.assets.instantiateModel('whiteoutBottle');
    if (glb) {
      glb.rotation.y = -Math.PI / 2; // Tripo faces +X: the red label to the front (+Z)
      this.spin.add(glb);
      for (const m of [body, neck, visor, rim]) m.visible = false;
      glb.traverse((o) => {
        const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mm?.emissive) this.flashMats.push(mm);
      });
      // the front label, curved onto the jug's red patch: white letters on red
      const front = new THREE.CanvasTexture(labelCanvas(t('WHITE-OUT'), PAL.red, PAL.white, 512, 128));
      front.colorSpace = THREE.SRGBColorSpace;
      this.labelMat.map = front;
      label.geometry.dispose();
      label.geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.3, 20, 1, true, -0.75, 1.5);
      label.rotation.y = 0;
      label.position.y = 0.55;
      // eyes sit above the label, on the white shoulder
      for (const c of this.spin.children) if (c.userData.eyePart) c.position.set(c.position.x, c.position.y + 0.22, 0.47 + (c.position.z - 0.57));
      this.cap.position.y = CAP_Y;
      this.cap.scale.setScalar(0.78); // the jug's neck is slimmer than the old code neck
      dressCap(this.cap);
    }
    // tip (lying down for a roll) → spin (rolling about its long axis)
    this.tip.add(this.spin);
    this.spin.scale.setScalar(1.22); // a chunky bottle: reads from across a street
    this.root.add(this.tip);
    this.paintAnchor = this.spin;
    // the roll lane telegraph: a flashing white strip ahead of it
    this.lane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, ROLL_SPEED * ROLL_TIME).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    this.lane.userData.noPaint = true;
    this.lane.visible = false;
    ctx.root.add(this.lane);
    this.blobs = new Lobbed(ctx, {
      color: '#fbf7ee',
      size: 0.17,
      splash: 0.9,
      damage: 1,
      ring: false,
      onLand: (at) => this.blank(at, 1.0),
    });
    this.wander.copy(start);
  }

  // ───────────── damage rules ─────────────
  private get lying(): boolean {
    return this.state === 'ROLL' || this.state === 'DIZZY' || this.state === 'ROLL_TELL';
  }

  protected override weakPoints(): WeakPoint[] {
    if (this.state === 'DIZZY') return [{ pos: this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), radius: 1.6, mul: BACK_MUL }];
    if (this.lying) return [];
    const back = this.pos.clone().add(new THREE.Vector3(0, 0.8, 0)).addScaledVector(this.forward(), -0.55);
    return [{ pos: back, radius: 0.65, mul: BACK_MUL }];
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (this.lying || info.kind === 'stomp' || info.kind === 'crash') return null;
    // anything from the front lands on the cap-plate: blanked
    const d = info.dir.clone().setY(0);
    if (d.lengthSq() < 1e-4 || d.normalize().dot(this.forward()) > -0.35) return null;
    this.blanked++;
    if (this.blanked % 12 === 1) {
      this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), t('BLANKED!'), '#ffffff', 0.7);
      this.ctx.audio.play('erase', { pos: this.pos, vol: 0.6 });
    }
    this.ctx.effects.burst(info.point, '#ffffff', 2, 1.5, 0.05);
    if (this.blanked === 20)
      this.ctx.events.emit('toast', { text: t('Its front cap blanks your paint! Run round it and spray the soft pink back.'), kind: 'warn', at: this.pos });
    if (!this.alerted) this.alert();
    return { weak: false, absorbed: true };
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play(weak ? 'squeak' : 'hit', { pos: this.pos, pitch: weak ? 1.2 : 1.4, vol: 0.5 });
  }

  protected override interrupt(): void {
    if (this.state === 'SQUIRT_TELL' || this.state === 'ROLL_TELL' || this.state === 'ROLL') {
      this.lane.visible = false;
      this.attackCd = 1.6;
      this.setState('CHASE');
    }
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  protected override finish(): void {
    this.lane.visible = false;
    this.blobs.clear();
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  /** Friendly now: it sits where it was repainted and refills WAI's can. */
  calm(): void {
    this.setState('CALM');
    this.home.copy(this.pos);
    const tex = new THREE.CanvasTexture(labelCanvas(t('REFILL'), PAL.yellow, PAL.cobalt, 512, 96));
    tex.colorSpace = THREE.SRGBColorSpace;
    this.labelMat.map = tex;
    this.labelMat.needsUpdate = true;
  }

  // ───────────── paint blanking ─────────────
  private blank(at: THREE.Vector3, r: number): void {
    if (this.ctx.effects.eraseNear(at, r) > 0) this.ctx.audio.play('erase', { pos: at, vol: 0.5 });
    // a little white puddle that dries away (no paint record: it is the absence of paint)
    const m = new THREE.Mesh(new THREE.CircleGeometry(r * 0.75, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.position.copy(at).add(new THREE.Vector3(0, 0.04, 0));
    m.userData.noPaint = true;
    this.ctx.root.add(m);
    this.puddles.push({ m, t: 0 });
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    this.blobs.update(dt, player);
    this.updatePuddles(dt);
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') return this.friendly(dt, player);
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2.2;
    this.attackCd = Math.max(0, this.attackCd - dt);
    let vx = 0;
    let vz = 0;
    // it blanks what it rolls over, all the time
    this.eraseT -= dt;
    if (this.eraseT <= 0) {
      this.eraseT = this.state === 'ROLL' ? 0.07 : 0.35;
      if (this.ctx.effects.eraseNear(this.pos, this.state === 'ROLL' ? 1.1 : 0.85) > 0 && this.state !== 'ROLL') this.ctx.audio.play('erase', { pos: this.pos, vol: 0.35 });
    }
    switch (this.state) {
      case 'IDLE': {
        const to = this.wander.clone().sub(this.pos).setY(0);
        if (to.length() < 0.5) this.wander.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        else {
          to.normalize();
          vx = to.x * 1.3;
          vz = to.z * 1.3;
          this.faceToward(this.wander, dt, 3);
        }
        if (valid && d < 14 && this.canSee(player.pos, 1.2)) this.alert();
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 18) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.turnToward(player.pos, dt);
        // keep a squirting distance: closer than 4.5 backs off, further than 8 waddles in
        const want = d > 8 ? 1 : d < 4.5 ? -0.7 : 0;
        vx = (toP.x / Math.max(d, 0.01)) * 2.1 * want;
        vz = (toP.z / Math.max(d, 0.01)) * 2.1 * want;
        if (this.attackCd <= 0) {
          const facing = toP.clone().normalize().dot(this.forward()) > 0.8;
          if (d < 7 && facing && Math.random() < 0.45) {
            this.setState('ROLL_TELL');
            this.ctx.audio.play('telegraph', { pos: this.pos });
            this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 1.3 });
          } else if (d < 13 && facing) {
            this.setState('SQUIRT_TELL');
            this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.3 });
          }
        }
        break;
      }
      case 'SQUIRT_TELL': {
        this.turnToward(player.pos, dt);
        if (this.stateT > SQUIRT_TELL) {
          this.squirt(player);
          this.attackCd = 2.2 + Math.random() * 0.8;
          this.setState('CHASE');
        }
        break;
      }
      case 'ROLL_TELL': {
        // it tracks WAI until a beat before it goes, then the lane locks
        if (this.stateT < ROLL_TELL - 0.3) {
          this.turnToward(player.pos, dt, 4);
          this.rollDir.copy(this.forward());
        }
        this.showLane(this.stateT / ROLL_TELL);
        if (this.stateT > ROLL_TELL) {
          this.rollHit = false;
          this.setState('ROLL');
          this.ctx.audio.play('whoosh', { pos: this.pos, pitch: 1.2 });
        }
        break;
      }
      case 'ROLL': {
        this.showLane(1);
        vx = this.rollDir.x * ROLL_SPEED;
        vz = this.rollDir.z * ROLL_SPEED;
        if (!this.rollHit && valid && d < 1.15) {
          this.rollHit = true;
          player.takeHit(this.pos, 1, 8);
        }
        if (this.stateT > ROLL_TIME) {
          this.lane.visible = false;
          this.setState('DIZZY');
          this.ctx.audio.play('dizzy', { pos: this.pos });
          this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), t('DIZZY!'), PAL.turq, 0.7);
        }
        break;
      }
      case 'DIZZY': {
        if (this.stateT > DIZZY_TIME) {
          this.attackCd = 1.4;
          this.setState('CHASE');
        }
        break;
      }
    }
    const moved = this.move(vx, vz, dt);
    // a roll into a wall ends early (and a bit harder)
    if (this.state === 'ROLL' && this.stateT > 0.2 && moved < ROLL_SPEED * dt * 0.25) {
      this.stateT = ROLL_TIME;
      this.ctx.audio.play('crash', { pos: this.pos, vol: 0.6 });
      this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.2);
    }
  }

  private turnToward(p: THREE.Vector3, dt: number, rate = TURN): void {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    let d = want - this.facing;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.facing += THREE.MathUtils.clamp(d, -rate * dt, rate * dt);
  }

  private squirt(player: PlayerController): void {
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.75, 0)).addScaledVector(this.forward(), 0.3);
    const lead = player.pos.clone();
    const side = new THREE.Vector3(-this.forward().z, 0, this.forward().x);
    for (const k of [-1, 0, 1]) {
      const to = lead.clone().addScaledVector(side, k * 1.4).addScaledVector(this.forward(), k === 0 ? 0 : -0.6);
      to.y = player.grounded ? player.pos.y : this.pos.y;
      this.blobs.launch(from, to, 0.75 + Math.abs(k) * 0.08);
    }
    this.ctx.audio.play('spit', { pos: from, pitch: 1.3 });
    this.ctx.effects.burst(from, '#ffffff', 8, 3);
  }

  private showLane(k: number): void {
    this.lane.visible = true;
    const len = ROLL_SPEED * ROLL_TIME;
    this.lane.position.copy(this.pos).addScaledVector(this.rollDir, len / 2 + 0.4).setY(this.pos.y + 0.05);
    this.lane.rotation.y = Math.atan2(this.rollDir.x, this.rollDir.z);
    (this.lane.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.2 * Math.abs(Math.sin(k * 20));
    // the drawn lane (the shared doodle language, render/SoundFx): white marker edges with an ink rim,
    // and chevrons crawling the way it will roll; exactly the roll's width and length
    const fx = this.ctx.effects.sound;
    const side = _side.set(this.rollDir.z, 0, -this.rollDir.x);
    const white = fx.c('#ffffff');
    for (const s of [-1, 1]) {
      _a.copy(this.pos).addScaledVector(side, s * 0.65).addScaledVector(this.rollDir, 0.4).setY(this.pos.y + 0.08);
      fx.arc({ c: _a, u: this.rollDir, v: side, r: len, w: 0.09, color: white, mode: ARC_MODE.stroke, seed: s });
    }
    for (let i = 0; i < 5; i++) {
      const t = ((k * 2.5 + i / 5) % 1) * (len - 1) + 1;
      for (const s of [-1, 1]) {
        _b.copy(this.rollDir).multiplyScalar(-0.45).addScaledVector(side, s * 0.45).normalize();
        _a.copy(this.pos).addScaledVector(this.rollDir, t + 0.4).setY(this.pos.y + 0.09);
        fx.arc({ c: _a, u: _b, v: side, r: 0.7, w: 0.1, color: white, alpha: 0.95, mode: ARC_MODE.stroke, seed: i + s });
      }
    }
  }

  private updatePuddles(dt: number): void {
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t += dt;
      (p.m.material as THREE.MeshBasicMaterial).opacity = 0.85 * Math.max(0, 1 - p.t / 3);
      if (p.t > 3) {
        p.m.removeFromParent();
        p.m.geometry.dispose();
        (p.m.material as THREE.Material).dispose();
        this.puddles.splice(i, 1);
      }
    }
  }

  private friendly(dt: number, player: PlayerController): void {
    this.refillCd = Math.max(0, this.refillCd - dt);
    this.faceToward(player.pos, dt, 2);
    const d = player.pos.distanceTo(this.pos);
    if (d < 2.6 && this.refillCd <= 0 && this.onRefill) {
      this.refillCd = 5;
      this.onRefill();
      this.ctx.audio.play('heal', { pos: this.pos });
      this.ctx.audio.play('gulp', { pos: this.pos, pitch: 1.4, vol: 0.6 });
      this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), t('REFILL!'), PAL.yellow, 0.7);
      for (const c of [PAL.cobalt, PAL.pink, PAL.yellow, PAL.turq]) this.ctx.effects.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), c, 5, 3);
    }
    this.move(0, 0, dt);
  }

  // ───────────── look ─────────────
  protected animate(dt: number): void {
    this.wob += dt;
    const lying = this.lying ? (this.state === 'ROLL_TELL' ? Math.min(1, this.stateT / (ROLL_TELL * 0.7)) : 1) : 0;
    // lying on its side: the body's up axis turns to world X (so it rolls along its forward)
    this.tip.rotation.z = THREE.MathUtils.lerp(this.tip.rotation.z, (Math.PI / 2) * lying, Math.min(1, dt * 12));
    this.tip.position.y = 0.6 * lying;
    this.tip.position.x = 0.68 * lying;
    if (this.state === 'ROLL') this.spin.rotation.y += dt * ROLL_SPEED * 2;
    else if (this.state === 'DIZZY') this.spin.rotation.y = Math.sin(this.wob * 9) * 0.35;
    else this.spin.rotation.y *= Math.max(0, 1 - dt * 10);
    // waddle (upright), shake (squirt tell), happy bob (friendly)
    const speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    let rockZ = lying ? 0 : Math.sin(this.wob * 9) * 0.1 * Math.min(1, speed / 1.5);
    if (this.state === 'SQUIRT_TELL') rockZ = Math.sin(this.wob * 45) * 0.08;
    this.spin.rotation.z = rockZ;
    this.cap.position.y = (this.flashMats.length ? CAP_Y : 1.33) + (this.state === 'SQUIRT_TELL' ? Math.min(0.22, this.stateT * 0.5) : 0);
    if (this.state === 'CALM') this.spin.position.y = Math.abs(Math.sin(this.wob * 3)) * 0.12;
    this.bodyMat.emissive.setRGB(this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0, this.flash > 0 ? 0.6 : 0);
    for (const m of this.flashMats) m.emissive.setScalar(this.flash > 0 ? 0.45 : 0);
  }

  override dispose(): void {
    this.blobs.clear();
    this.lane.removeFromParent();
    for (const p of this.puddles) p.m.removeFromParent();
    this.puddles = [];
    super.dispose();
  }
}
