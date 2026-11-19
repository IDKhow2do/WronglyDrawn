/**
 * [INPUT]: depends on AssetManager.instantiateModel (Tripo slot rubberStamp) from core/AssetManager;
 *          StampInkFx + StampLook from render/StampInkFx (the print, droplets, splat ring, dust, gold flash);
 *          the view camera and a level-geometry ray test (optional): see through the stamp when a tight room puts the
 *          camera against it, hide prints behind walls
 * [OUTPUT]: exports StampFx (the TAG / ENCORE rubber stamp: wind-up, slam, squash, bounce, lift, slip; StampFx.height(size), handleY
 *           for camera framing) and re-exports StampLook
 * [POS]: the visual of every TAG and ENCORE stamp. CombatDirector owns one and drives it with windUp() / slam();
 *        StampFx owns the stamp body and its StampInkFx batch. It reads no gameplay state and changes none.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { StampInkFx, type StampLook } from '../render/StampInkFx';

export type { StampLook };

/** The stamp at size 1 (metres): total height, side stretch (Tripo made it slim; the world draws it chunky), lean. */
const BODY = { height: 1.6, widen: 1.45, lean: 0.07 };
/** The die drops in the last part of the wind-up, so contact lands on the frame CombatDirector calls slam(). */
const DROP = 0.06;
/** How far the stamp tips toward WAI: it slaps the creature's upper front, where the camera can read the print. */
const TILT = 0.5;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A big chunky rubber stamp that winds up over a creature and SLAMS onto it: the readable beat for every TAG /
 * ENCORE stamp. One instance, reused. The pivot is the centre of the die face (y = 0 in the body).
 *
 *  windUp(top, size, dur, yaw, opts): pops in above `top`, rises and cocks back, then drops onto the creature's surface
 *                                     (found on `opts.on`) exactly at `dur`
 *  slam(ok):                          ok → squash, print, bounce, lift; slip → skids off spinning
 */
export class StampFx {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private ink = new StampInkFx();
  private plain: THREE.Material[] = [];
  private gold: THREE.Material[] = [];
  private meshes: { mesh: THREE.Mesh; plain: THREE.Material; gold: THREE.Material }[] = [];
  /** half the die face's width at size 1 (the print's half size) */
  private dieHalf = 0.4;
  private state: 'idle' | 'wind' | 'slam' | 'hold' | 'lift' | 'slip' = 'idle';
  private t = 0;
  private dur = 0.3;
  private size = 1;
  private yaw = 0;
  private tilt = 0;
  private spin = new THREE.Vector3();
  private look: StampLook = {};
  private on: THREE.Object3D | null = null;
  private anchor: THREE.Object3D | null = null;
  private top = new THREE.Vector3();
  /** half the creature's narrowest width: the seal is never wider than the body it lands on */
  private bodyHalf = Infinity;
  private contact = new THREE.Vector3();
  private normal = new THREE.Vector3(0, 1, 0);
  private ray = new THREE.Raycaster();
  private mid = new THREE.Vector3();
  private eyeAt = new THREE.Vector3();

  /** `blocked(from, to)`: is level geometry between two points (hides prints behind walls; optional). */
  constructor(parent: THREE.Object3D, assets?: AssetManager, private eye?: THREE.Camera, blocked?: (from: THREE.Vector3, to: THREE.Vector3) => boolean) {
    const model = assets?.instantiateModel('rubberStamp', { pivot: 'bottom' }) ?? null;
    if (model) this.dressModel(model);
    else this.buildFallback();
    this.body.rotation.order = 'YXZ';
    this.body.traverse((o) => (o.userData.noPaint = true));
    this.root.add(this.body);
    this.root.visible = false;
    this.root.renderOrder = 5;
    this.root.rotation.order = 'YXZ';
    this.root.name = 'tag-stamp';
    parent.add(this.root);
    parent.add(this.ink.mesh);
    if (eye && blocked) this.ink.watch(eye, blocked);
  }

  /** The stamp's height in metres at `size`. */
  static height(size: number): number {
    return BODY.height * THREE.MathUtils.clamp(size, 0.5, 2.6);
  }

  /** World height of the knob when the stamp stands on its contact (after windUp): what a TAG camera must fit. */
  get handleY(): number {
    return this.contact.y + BODY.height * this.size * Math.cos(this.tilt);
  }

  // ───────────────────────── the body ─────────────────────────

  /** The Tripo stamp: scaled, widened, every material cloned twice (plain and Golden Stamp). */
  private dressModel(model: THREE.Object3D): void {
    model.scale.set(BODY.height * BODY.widen, BODY.height, BODY.height * BODY.widen);
    const lean = new THREE.Group();
    lean.rotation.z = BODY.lean;
    lean.add(model);
    this.body.add(lean);
    model.updateMatrixWorld(true);
    // the die's half width: the widest point of the lowest tenth of the body
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position');
      const inv = new THREE.Matrix4().copy(model.matrixWorld).invert().multiply(m.matrixWorld);
      for (let i = 0; i < pos.count; i += 7) {
        v.fromBufferAttribute(pos, i).applyMatrix4(inv);
        if (v.y * BODY.height < 0.1) box.expandByPoint(v);
      }
      m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox!;
      const src = (m.material as THREE.MeshStandardMaterial).clone();
      src.transparent = true;
      const dieTop = bb.min.y + (bb.max.y - bb.min.y) * 0.3;
      const plain = stampMaterial(src, dieTop, false);
      const gold = stampMaterial(src, dieTop, true);
      this.meshes.push({ mesh: m, plain, gold });
      this.plain.push(plain);
      this.gold.push(gold);
      m.material = plain;
    });
    if (!box.isEmpty()) this.dieHalf = Math.max(0.25, Math.min(box.max.x - box.min.x, box.max.z - box.min.z) * BODY.height * BODY.widen * 0.5);
  }

  /** Code stamp when the model is missing: turned handle, brass collar, wooden block, thick pink rubber die. */
  private buildFallback(): void {
    const part = (geo: THREE.BufferGeometry, color: string, y: number, rubber = false) => {
      const plain = new THREE.MeshToonMaterial({ color, transparent: true });
      const gold = new THREE.MeshToonMaterial({ color: rubber ? color : '#ffcf3a', emissive: rubber ? '#000' : '#7a4a00', transparent: true });
      const mesh = new THREE.Mesh(geo, plain);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.meshes.push({ mesh, plain, gold });
      this.plain.push(plain);
      this.gold.push(gold);
      this.body.add(mesh);
      return mesh;
    };
    const w = 0.5;
    part(new THREE.BoxGeometry(w * 1.7, 0.3, w * 1.7), '#ff4fa3', 0.15, true);
    part(new THREE.BoxGeometry(w * 2, 0.26, w * 2), '#e8a85a', 0.43);
    part(new THREE.TorusGeometry(0.2, 0.05, 8, 20).rotateX(Math.PI / 2), '#d9a422', 0.6);
    const prof = [[0.0, 0], [0.17, 0], [0.15, 0.15], [0.12, 0.35], [0.16, 0.5], [0.27, 0.7], [0.3, 0.85], [0.24, 0.98], [0.0, 1.03]];
    part(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 14), '#f2b24a', 0.58);
    this.dieHalf = w * 0.85;
    this.body.rotation.z = BODY.lean;
  }

  private setGold(on: boolean): void {
    for (const e of this.meshes) e.mesh.material = on ? e.gold : e.plain;
  }

  private setOpacity(o: number): void {
    for (const m of this.plain) m.opacity = o;
    for (const m of this.gold) m.opacity = o;
  }

  // ───────────────────────── driving ─────────────────────────

  /**
   * Start a stamp over `top`. `faceYaw` turns the stamp toward WAI. `opts.on` is the creature: the die lands on
   * its real surface (upper front), and the print sticks to it. `opts.look` = gold / PERFECT / FRENZY.
   */
  windUp(top: THREE.Vector3, size: number, dur: number, faceYaw: number, opts: { on?: THREE.Object3D; look?: StampLook } = {}): void {
    this.size = StampFx.height(size) / BODY.height;
    this.dur = Math.max(0.12, dur);
    this.yaw = faceYaw;
    this.look = opts.look ?? {};
    this.on = opts.on ?? null;
    this.top.copy(top);
    this.findContact(top);
    this.setGold(!!this.look.gold);
    this.state = 'wind';
    this.t = 0;
    this.root.visible = true;
    this.step(0);
  }

  /**
   * Where the die meets the creature: aim along the tipped axis through the middle of its body and take the first
   * surface. No creature or no hit: `top`, die flat (the old behaviour).
   */
  private findContact(top: THREE.Vector3): void {
    const toWai = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.contact.copy(top);
    this.normal.copy(UP);
    this.tilt = 0;
    this.anchor = this.on;
    this.bodyHalf = Infinity;
    const on = this.on;
    if (!on) return;
    on.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(on);
    if (box.isEmpty()) return;
    const dims = box.getSize(new THREE.Vector3());
    this.bodyHalf = Math.min(dims.x, dims.z) * 0.5;
    const n = UP.clone().addScaledVector(toWai, Math.tan(TILT)).normalize();
    const mid = box.getCenter(new THREE.Vector3());
    mid.y = Math.min(top.y, mid.y + (box.max.y - mid.y) * 0.35);
    const reach = dims.length() + 2;
    this.ray.set(mid.clone().addScaledVector(n, reach), n.clone().negate());
    this.ray.far = reach * 1.2;
    const meshes: THREE.Object3D[] = [];
    on.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && !m.userData.isOutline && (m.material as THREE.Material).side !== THREE.BackSide) meshes.push(m);
    });
    const hit = this.ray.intersectObjects(meshes, false)[0];
    if (!hit) return;
    this.contact.copy(hit.point);
    this.normal.copy(n);
    // the print rides on the part it hit (a lid that snaps shut takes its print along); skinned parts ride the root
    this.anchor = (hit.object as THREE.SkinnedMesh).isSkinnedMesh ? on : hit.object;
    this.tilt = TILT;
  }

  slam(ok: boolean): void {
    if (this.state === 'idle') return;
    this.state = ok ? 'slam' : 'slip';
    this.t = 0;
    this.spin.set((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 6, 6 + Math.random() * 4);
    // the creature moved under the wind-up (a crouch, a lid): find its surface again at the moment of contact
    this.findContact(this.top);
    if (ok) {
      // contact: print now, so a hit-stop freezes on the squash with the ink already out
      const half = this.dieHalf * this.size;
      this.ink.print(this.anchor, this.contact, this.normal, half, this.yaw, this.look, Math.min(half, Math.max(0.25, this.bodyHalf * 0.8)));
      this.ink.update(0);
    } else this.ink.scuff(this.contact, this.dieHalf * this.size);
    this.step(0);
  }

  step(dt: number): void {
    this.ink.update(dt);
    if (this.state === 'idle') return;
    this.t += dt;
    const s = this.size;
    const r = this.root;
    const b = this.body;
    const big = this.look.perfect || this.look.frenzy;
    r.position.copy(this.contact);
    r.rotation.set(this.tilt, this.yaw, 0);
    b.scale.setScalar(s);
    b.rotation.set(0, 0, 0);
    b.position.set(0, 0, 0);
    const hi = 0.35 + s * (big ? 1.35 : 1.15);
    let alpha = 1;
    if (this.state === 'wind') {
      const drop = Math.min(DROP, this.dur * 0.2);
      const rise = this.dur - drop;
      if (this.t < rise) {
        // pop in (overshoot), rise with a stretch, cock back, shiver at the top (anticipation)
        const k = this.t / rise;
        const pop = Math.min(1, this.t / 0.1);
        const over = pop < 1 ? pop * 1.15 : 1.15 - 0.15 * Math.min(1, (this.t - 0.1) / 0.08);
        const e = 1 - (1 - k) * (1 - k);
        const st = 1 + 0.12 * Math.sin(Math.min(1, k * 1.6) * Math.PI);
        b.scale.set(s * over / Math.sqrt(st), s * over * st, s * over / Math.sqrt(st));
        b.position.y = 0.25 + hi * e;
        b.rotation.x = -0.5 * e;
        b.rotation.z = (0.05 + 0.1 * k * k) * Math.sin(this.t * (big ? 70 : 46));
      } else {
        // the drop: fast, stretched along the fall
        const k = Math.min(1, (this.t - rise) / drop);
        const kk = k * k;
        b.position.y = (0.25 + hi) * (1 - kk);
        b.rotation.x = -0.5 * (1 - kk);
        b.scale.set(s * 0.86, s * 1.28, s * 0.86);
      }
    } else if (this.state === 'slam' || this.state === 'hold') {
      // squash on contact, a small bounce, settle; then lift (the ENCORE window reads the next press meanwhile)
      if (this.state === 'slam') this.state = 'hold';
      const t = this.t;
      const sq = Math.exp(-t * 13) * (big ? 0.45 : 0.36) * Math.cos(t * 26);
      b.scale.set(s * (1 + sq * 0.7), s * (1 - sq), s * (1 + sq * 0.7));
      const bounce = t > 0.05 ? Math.max(0, Math.sin((t - 0.05) * Math.PI / 0.16)) * Math.exp(-(t - 0.05) * 6) * s * 0.16 : 0;
      b.position.y = bounce;
      b.rotation.z = Math.sin(t * 30) * Math.exp(-t * 10) * 0.08;
      if (t > 0.24) {
        this.state = 'lift';
        this.t = 0;
      }
    } else if (this.state === 'lift') {
      // springs up and shrinks away (no half-transparent body hanging over the print)
      const k = Math.min(1, this.t / 0.3);
      b.position.y = s * 1.6 * k * k;
      b.rotation.x = -0.3 * k;
      b.scale.setScalar(s * (1 - k * k * k));
      if (k >= 1) this.hide();
    } else if (this.state === 'slip') {
      // skids off the side, spinning, and falls away
      const k = Math.min(1, this.t / 0.55);
      b.position.set(s * 1.8 * k, s * (1.4 - 3 * k * k), 0);
      b.rotation.set(this.spin.x * this.t, this.spin.y * this.t, this.spin.z * this.t);
      alpha = 1 - k * k;
      if (k >= 1) this.hide();
    }
    this.setOpacity(alpha * this.nearFade());
  }

  /** A camera right against the stamp (a tight room) sees through it instead of into the wood. */
  private nearFade(): number {
    if (!this.eye) return 1;
    const r = BODY.height * 0.55 * this.size;
    this.body.updateWorldMatrix(true, false);
    const c = this.body.localToWorld(this.mid.set(0, BODY.height * 0.5, 0));
    const d = c.distanceTo(this.eye.getWorldPosition(this.eyeAt));
    return THREE.MathUtils.clamp((d - r * 0.7) / (r * 0.5 + 0.5), 0.15, 1);
  }

  hide(): void {
    this.state = 'idle';
    this.root.visible = false;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.ink.dispose();
    this.root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    for (const m of [...this.plain, ...this.gold]) m.dispose();
  }
}

/** The rubber die's own pink (linear): Tripo painted dice-like dots on it, the shader paints them over. */
const DIE_PINK = new THREE.Color('#ee4a8e');

/**
 * The stamp's material, from the Tripo one. Below `dieTop` (mesh-local y) the rubber die is repainted flat pink with
 * a little of the texture's shading (no dice dots). `gold` = the Golden Stamp: handle, collar and block pushed to gold
 * (light → bright gold, dark → deep amber, a little glow); the die stays rubber.
 */
function stampMaterial(src: THREE.MeshStandardMaterial, dieTop: number, gold: boolean): THREE.MeshStandardMaterial {
  const m = src.clone();
  m.emissive = new THREE.Color('#000000');
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDieTop = { value: dieTop };
    sh.uniforms.uDiePink = { value: DIE_PINK };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vStampY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStampY = position.y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vStampY;\nuniform float uDieTop;\nuniform vec3 uDiePink;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float stampL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        float stampBody = step(uDieTop, vStampY);
        // the die: flat rubber pink, the texture's light only as a faint mottle (the dots were its darkest spots)
        diffuseColor.rgb = mix(uDiePink * (0.9 + 0.2 * smoothstep(0.1, 0.6, stampL)), diffuseColor.rgb, stampBody);
        vec3 stampGold = mix(vec3(0.42, 0.2, 0.02), vec3(0.98, 0.7, 0.1), smoothstep(0.1, 0.75, stampL));
        float stampIsGold = stampBody * ${gold ? '1.0' : '0.0'};
        diffuseColor.rgb = mix(diffuseColor.rgb, stampGold, stampIsGold);`,
      )
      // the die keeps its smooth vertex normal too (the dots were also pressed into the normal map)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(nonPerturbedNormal, normal, stampBody));')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += stampGold * 0.12 * stampIsGold;');
  };
  m.customProgramCacheKey = () => (gold ? 'tag-stamp-gold' : 'tag-stamp');
  return m;
}
