/**
 * [INPUT]: depends on EnemyBase (kinematic body, damage routing) from ./EnemyBase; toon/paintedMesh from render/Materials;
 *          the 'cloud_a'/'cloud_b' textures from core/AssetManager; the director sets `seen` (True Sight) every step
 * [OUTPUT]: exports the FogJelly enemy (kind 'fogjelly') with `fog` (0..1), `seen`, FOG_R and the patrol path
 * [POS]: level-2 expansion creature (Bandstand Pier). Built around ONE player action: LOOK with the Eye (aim, True
 *        Sight) — its fog hides paint drops and the stepping posts (FogVeil in level/harbor does the hiding),
 *        and paint is lost in the fog unless WAI sees the jelly. Sibling: MegaphoneCrab (shout timing).
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { paintedMesh, toon } from '../render/Materials';

/** How far its fog reaches (flat metres from the bell). */
export const FOG_R = 4.4;
const ALT = 2.7; // hover height of the bell over its floor
const TELL = 0.85;
const STING_R = 1.8;
const PUFFS = 6;

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

/**
 * Fog Jelly: a sleepy sea jelly wrapped in a ball of sea fog. It drifts along its path; when WAI is
 * under it, its tentacles glow and a ring marks the floor — then it STINGS. Inside its fog, paint just
 * vanishes ("LOST IN THE FOG") and so does everything else: paint drops, the stepping posts across the
 * broken pier. Aim with the Eye on (True Sight) and you see straight through: the fog thins, its lantern
 * heart lights up, paint lands. A shout only shoves it (and its fog) aside.
 */
export class FogJelly extends EnemyBase {
  readonly kind = 'fogjelly';
  readonly displayName = 'Fog Jelly';
  readonly bigness = 0.24;
  /** Fog strength (1 = thick, 0 = gone: repainted). */
  fog = 1;
  /** WAI (or a host with WAI's Eye) is looking at it through True Sight right now (set by the director). */
  seen = false;
  /** Paint just vanished in its fog (the director's first-time tip). */
  onFogged: (() => void) | null = null;
  /** The floor under a point (the bell keeps ALT over it). */
  groundAt: (x: number, z: number) => number;
  private path: THREE.Vector3[];
  private leg = 0;
  private vel = new THREE.Vector3();
  private bell = new THREE.Group();
  private bellMat!: THREE.MeshToonMaterial;
  private heartMat!: THREE.MeshBasicMaterial;
  private lids: THREE.Mesh[] = [];
  private arms: { root: THREE.Group; segs: THREE.Group[] }[] = [];
  private armMat!: THREE.MeshToonMaterial;
  private puffs: THREE.Sprite[] = [];
  private ring: THREE.Mesh;
  private attackCd = 1.5;
  private absorbCd = 0;
  private swim = Math.random() * 6;
  private glowT = -1;
  private struck = false;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3, path: THREE.Vector3[], groundAt: (x: number, z: number) => number) {
    super(ctx, id, start, 170, 0.6, 0.2);
    this.path = path.length ? path : [start.clone()];
    this.groundAt = groundAt;
    this.buildLook(ctx);
    this.root.add(this.bell);
    this.paintAnchor = this.bell;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(STING_R * 0.8, STING_R, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#b49cff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.userData.noPaint = true;
    this.ring.visible = false;
    ctx.root.add(this.ring);
    this.pos.y = groundAt(start.x, start.z) + ALT - this.cOff;
    this.prevPos.copy(this.pos);
    this.place();
    this.setState('DRIFT');
  }

  // ───────────── look ─────────────
  private buildLook(ctx: GameContext): void {
    // the bell: a tall bonnet with a scalloped rim, mint glass over a lilac lining
    this.bellMat = toon({ color: '#b8fff0', emissive: '#2a5a58' });
    this.bellMat.transparent = true;
    this.bellMat.opacity = 0.82;
    const prof = [[0.001, 0.2], [0.7, 0.12], [0.82, 0.02], [0.9, 0.08], [0.84, 0.32], [0.76, 0.62], [0.58, 0.88], [0.3, 1.02], [0.001, 1.05]].map(([x, y]) => new THREE.Vector2(x, y));
    const bellG = new THREE.LatheGeometry(prof, 28);
    // scallops: the rim dips between eight lobes
    const p = bellG.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > 0.35) continue;
      const a = Math.atan2(p.getZ(i), p.getX(i));
      p.setY(i, y - (1 - Math.abs(Math.cos(a * 4))) * 0.09 * (1 - y / 0.35));
    }
    bellG.computeVertexNormals();
    const bell = paintedMesh(bellG, this.bellMat, 0.035);
    // spots on the bell (lilac freckles)
    const spots: THREE.BufferGeometry[] = [];
    const o = new THREE.Object3D();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.4;
      const r = 0.66 + (i % 2) * 0.1, y = 0.55 + (i % 3) * 0.14;
      o.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      o.lookAt(o.position.x * 2, y, o.position.z * 2);
      o.updateMatrix();
      spots.push(new THREE.SphereGeometry(0.09 - (i % 3) * 0.015, 8, 6).scale(1, 0.6, 0.35).applyMatrix4(o.matrix));
    }
    bell.add(new THREE.Mesh(mergeGeometries(spots)!, toon({ color: '#c9b6ff' })));
    // the lantern heart (its weak point): dim and grey in the fog, warm when seen
    this.heartMat = new THREE.MeshBasicMaterial({ color: '#8a86a8' });
    const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), this.heartMat);
    heart.position.y = 0.48;
    // a sleepy face on the front of the bell
    const black = new THREE.MeshBasicMaterial({ color: '#141014' });
    const white = toon({ color: '#ffffff' });
    for (const x of [-0.24, 0.24]) {
      const eye = paintedMesh(new THREE.SphereGeometry(0.12, 12, 10), white, 0.02);
      eye.scale.set(1, 1, 0.5);
      eye.position.set(x, 0.62, 0.74);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), black);
      pupil.position.set(x, 0.6, 0.8);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: '#7fd0c0' }));
      lid.scale.set(1, 1, 0.55);
      lid.position.set(x, 0.62, 0.745);
      lid.rotation.x = 0.5;
      this.lids.push(lid);
      this.bell.add(eye, pupil, lid);
    }
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 5, 12), black);
    mouth.position.set(0, 0.42, 0.8);
    // arms: four frilly oral ribbons in the middle, eight thin tentacles round the rim (three swaying segments each)
    this.armMat = toon({ color: '#c7a8ff' });
    const ribbonG = new THREE.CylinderGeometry(0.07, 0.03, 0.55, 6, 1).translate(0, -0.27, 0);
    const threadG = new THREE.CylinderGeometry(0.025, 0.015, 0.5, 5, 1).translate(0, -0.25, 0);
    const mk = (r: number, a: number, ribbon: boolean) => {
      const root = new THREE.Group();
      root.position.set(Math.cos(a) * r, 0.08, Math.sin(a) * r);
      let parent: THREE.Object3D = root;
      const segs: THREE.Group[] = [];
      for (let k = 0; k < 3; k++) {
        const seg = new THREE.Group();
        if (k > 0) seg.position.y = ribbon ? -0.52 : -0.48;
        const m = paintedMesh(ribbon ? ribbonG : threadG, this.armMat, 0, false);
        if (ribbon) m.scale.set(1 - k * 0.2, 1, 1.6 - k * 0.3);
        seg.add(m);
        parent.add(seg);
        parent = seg;
        segs.push(seg);
      }
      this.arms.push({ root, segs });
      this.bell.add(root);
    };
    for (let i = 0; i < 4; i++) mk(0.16, (i / 4) * Math.PI * 2 + 0.4, true);
    for (let i = 0; i < 6; i++) mk(0.72, (i / 6) * Math.PI * 2 + 0.3, false);
    this.bell.add(bell, heart, mouth);
    this.bell.position.y = this.cOff - 0.4;
    // the fog ball: soft lilac puffs round the bell
    for (let i = 0; i < PUFFS; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.assets.tex(i % 2 ? 'cloud_a' : 'cloud_b'), color: i % 3 ? '#e4dcf6' : '#cfeee8', transparent: true, opacity: 0.6, depthWrite: false }));
      s.userData.noPaint = true;
      s.scale.set(3.2, 2.0, 1);
      this.puffs.push(s);
      this.root.add(s);
    }
  }

  // ───────────── read-outs ─────────────
  get counterHint(): string {
    return this.seen ? 'You see right through its fog — paint its glowing heart!' : 'Paint gets lost in its fog. Aim with your Eye on (right-click / Z) to see through it';
  }

  /** The sting ring is up (Pip and the bot dodge it). */
  get stinging(): boolean {
    return this.state === 'TELL' || this.state === 'STING';
  }

  // ───────────── damage rules ─────────────
  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (this.seen) return null;
    if (this.absorbCd <= 0) {
      this.absorbCd = 1.1;
      this.ctx.effects.comic(info.point.clone().setY(info.point.y + 0.5), t('LOST IN THE FOG!'), '#cfc8e2', 0.55);
      this.onFogged?.();
    }
    return { weak: false, absorbed: true };
  }

  protected override weakPoints(): WeakPoint[] {
    return this.seen ? [{ pos: _c.copy(this.pos).setY(this.pos.y + this.cOff + 0.1), radius: 1.1, mul: 1.4 }] : [];
  }

  protected override interrupt(): void {
    this.ring.visible = false;
    if (this.state === 'TELL' || this.state === 'STING') {
      this.attackCd = 1.6;
      this.setState('DRIFT');
    }
  }

  /** Shoved (a shout, a thrown rock): it drifts away, fog and all. */
  override knock(dir: THREE.Vector3, speed: number): void {
    _v.copy(dir).setY(0);
    if (_v.lengthSq() > 1e-4) this.vel.addScaledVector(_v.normalize(), Math.max(3, speed * 0.8));
  }

  protected override finish(): void {
    this.ring.visible = false;
    super.finish();
    this.glowT = 0;
    this.vel.set(0, 1.4, 0);
  }

  // ───────────── flight ─────────────
  private place(): void {
    if (this.disposed) return;
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + this.cOff, z: this.pos.z });
  }

  private flyTo(target: THREE.Vector3, speed: number, dt: number, accel = 3): void {
    _v.copy(target).sub(this.pos);
    const d = _v.length();
    if (d > 0.05) _v.multiplyScalar(Math.min(speed, d * 2) / d);
    else _v.set(0, 0, 0);
    this.vel.lerp(_v, Math.min(1, dt * accel));
    this.pos.addScaledVector(this.vel, dt);
  }

  protected ai(dt: number, player: PlayerController): void {
    this.swim += dt;
    this.absorbCd = Math.max(0, this.absorbCd - dt);
    if (this.glowT >= 0) {
      // repainted: a clear little glow jelly floats up and away, its fog blowing off
      this.glowT += dt;
      this.fog = Math.max(0, 1 - this.glowT * 0.8);
      this.pos.addScaledVector(this.vel, dt);
      this.pos.x += Math.sin(this.glowT * 2) * dt * 0.6;
      this.place();
      if (this.glowT > 8) this.dispose();
      return;
    }
    if (this.harmless) return;
    const floor = this.groundAt(this.pos.x, this.pos.z);
    const hoverY = floor + ALT - this.cOff;
    const flat = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const valid = !player.smudged && Math.abs(player.pos.y - floor) < 3;
    if (valid && flat < 9 && !this.alerted) this.alert();
    if (this.alerted && (!valid || flat > 14)) this.alerted = false;
    this.attackCd = Math.max(0, this.attackCd - dt);
    switch (this.state) {
      case 'DRIFT': {
        if (this.alerted) {
          // drift over WAI (never far from its path)
          _c.set(player.pos.x, hoverY, player.pos.z);
          const home = this.path[this.leg];
          const off = Math.hypot(_c.x - home.x, _c.z - home.z);
          if (off > 9) _c.set(home.x + ((_c.x - home.x) / off) * 9, hoverY, home.z + ((_c.z - home.z) / off) * 9);
          this.flyTo(_c, 1.7, dt);
          if (flat < STING_R && this.attackCd <= 0) {
            this.setState('TELL');
            this.ctx.audio.play('telegraph', { pos: this.pos, pitch: 1.5, vol: 0.6 });
          }
        } else {
          const goal = this.path[this.leg];
          _c.set(goal.x, hoverY, goal.z);
          if (Math.hypot(goal.x - this.pos.x, goal.z - this.pos.z) < 0.6) this.leg = (this.leg + 1) % this.path.length;
          this.flyTo(_c, 1.1, dt, 1.5);
        }
        this.pos.y += (hoverY + Math.sin(this.swim * 1.6) * 0.25 - this.pos.y) * Math.min(1, dt * 2);
        break;
      }
      case 'TELL': {
        // hangs still; the ring under it pulses faster and faster
        this.vel.multiplyScalar(Math.exp(-5 * dt));
        this.pos.addScaledVector(this.vel, dt);
        this.ring.visible = true;
        this.ring.position.set(this.pos.x, floor + 0.07, this.pos.z);
        const k = this.stateT / TELL;
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.3 + 0.55 * Math.abs(Math.sin(this.stateT * (8 + k * 16)));
        if (this.stateT > TELL) {
          this.struck = false;
          this.setState('STING');
          this.ctx.audio.play('hush', { pos: this.pos, pitch: 1.8, vol: 0.6 });
        }
        break;
      }
      case 'STING': {
        // the bell dips, the tentacles lash the ring
        this.pos.y += (floor + 1.1 - this.cOff - this.pos.y) * Math.min(1, dt * 14);
        if (!this.struck && this.stateT > 0.12) {
          this.struck = true;
          this.ctx.effects.ring(_c.set(this.pos.x, floor + 0.08, this.pos.z), '#c7a8ff', STING_R * 1.1);
          if (flat < STING_R && Math.abs(player.pos.y - floor) < 1.6) player.takeHit(_c, 1, 2);
        }
        if (this.stateT > 0.45) {
          this.ring.visible = false;
          this.attackCd = 2.2 + Math.random();
          this.setState('DRIFT');
        }
        break;
      }
    }
    // never below its floor
    if (this.pos.y < floor + 0.4 - this.cOff) this.pos.y = floor + 0.4 - this.cOff;
    this.place();
  }

  // ───────────── animation ─────────────
  protected animate(dt: number): void {
    const pulse = Math.sin(this.swim * 2.4);
    const tell = this.state === 'TELL' ? Math.min(1, this.stateT / TELL) : 0;
    this.bell.scale.set(1 + pulse * 0.06, 1 - pulse * 0.07, 1 + pulse * 0.06);
    for (let i = 0; i < this.arms.length; i++) {
      const a = this.arms[i];
      for (let k = 0; k < a.segs.length; k++) {
        a.segs[k].rotation.x = Math.sin(this.swim * 2 + i * 0.7 + k * 0.9) * (0.18 + k * 0.08) + (this.state === 'STING' ? 0.4 : 0);
        a.segs[k].rotation.z = Math.cos(this.swim * 1.7 + i + k) * 0.12;
      }
      a.root.scale.y = 1 + tell * 0.5;
    }
    this.armMat.emissive.setRGB(tell * 0.8, tell * 0.25, tell * 0.7);
    for (const l of this.lids) l.rotation.x = this.state === 'TELL' || this.state === 'STING' ? -0.6 : 0.5 + Math.max(0, Math.sin(this.swim * 0.6)) * 0.4;
    // the heart: grey in the fog, lantern-warm when seen (or repainted)
    const warm = this.seen || this.glowT >= 0 ? 1 : 0;
    this.heartMat.color.setRGB(0.54 + warm * 0.46, 0.52 + warm * 0.36, 0.66 - warm * 0.2);
    if (this.flash > 0) this.bellMat.emissive.setRGB(0.6, 0.6, 0.6);
    else this.bellMat.emissive.setRGB(0.16, 0.35, 0.34);
    // the fog: puffs wheel slowly round the bell; True Sight thins them
    const thin = this.seen ? 0.22 : 1;
    this.puffs.forEach((s, i) => {
      const a = (i / PUFFS) * Math.PI * 2 + this.swim * 0.25;
      const r = 1.6 + (i % 2) * 0.9;
      s.position.set(Math.cos(a) * r, this.cOff - 0.6 + (i % 3) * 0.55 + Math.sin(this.swim + i) * 0.2, Math.sin(a) * r);
      const mat = s.material as THREE.SpriteMaterial;
      mat.opacity += (0.48 * this.fog * thin - mat.opacity) * Math.min(1, dt * 5);
      s.visible = mat.opacity > 0.01;
    });
    if (this.glowT >= 0) this.root.scale.multiplyScalar(Math.max(0.01, 1 - Math.max(0, this.glowT - 6) / 2));
  }

  override dispose(): void {
    this.ring.removeFromParent();
    super.dispose();
  }
}
