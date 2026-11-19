/**
 * [INPUT]: depends on Quality (fx scale), PaintSystem (surface paint), SoundFx (hand-drawn sound batches)
 * [OUTPUT]: exports Effects (paint droplets, rings, comic words, surface splats, ctx.effects.sound)
 * [POS]: the session's one effects owner (ctx.effects). Sessions create it and call update(dt) once a frame;
 *        every gameplay system draws juice through it.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { Quality } from './Quality';
import type { AssetManager } from '../core/AssetManager';
import { PaintSystem, type SplatOpts } from './PaintSystem';
import { SoundFx } from './SoundFx';

interface Particle {
  i: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  gravity: number;
  size: number;
}

interface Comic {
  sprite: THREE.Sprite;
  life: number;
  max: number;
  vel: THREE.Vector3;
  size: number;
  spin: number;
}

const comicCache = new Map<string, THREE.CanvasTexture>();
/** Hand-lettered comic word (graffiti onomatopoeia): fat outline, drop shadow, slight tilt. */
function comicTexture(text: string, color: string): THREE.CanvasTexture {
  const key = text + color;
  const hit = comicCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 192;
  const g = c.getContext('2d')!;
  const cjk = /[\u3400-\u9fff]/.test(text);
  let size = cjk ? 104 : 118;
  g.font = `900 ${size}px "Marker Felt", "Comic Sans MS", "WD Hand", "Wawati SC", "HanziPen SC", "Hannotate SC", "KaiTi", "PingFang SC", "Hiragino Sans GB", sans-serif`;
  while (g.measureText(text).width > 460 && size > 40) {
    size -= 6;
    g.font = `900 ${size}px "Marker Felt", "Comic Sans MS", "WD Hand", "Wawati SC", "HanziPen SC", "Hannotate SC", "KaiTi", "PingFang SC", "Hiragino Sans GB", sans-serif`;
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.translate(256, 96);
  g.rotate(-0.08);
  g.fillStyle = '#141014';
  g.fillText(text, 7, 8); // drop shadow
  g.lineWidth = 22;
  g.strokeStyle = '#141014';
  g.strokeText(text, 0, 0);
  g.lineWidth = 9;
  g.strokeStyle = '#ffffff';
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  comicCache.set(key, t);
  return t;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  max: number;
  scale: number;
}

const SPLAT_COLORS = ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a'];
/** Gameplay record of where paint landed (tag spots, grubs) — independent of the GPU paint. */
const MAX_RECORDS = 6000;
const MAX_PARTICLES = 700;

/**
 * Feedback effects + the PAINT layer. Paint itself lives in PaintSystem (real
 * surface paint, per-mesh textures). Here we also keep a light CPU record of
 * every landing so gameplay (tag spots, eraser grubs) can query coverage.
 * Particles are glossy liquid blobs stretched along their velocity.
 */
export class Effects {
  private particles: Particle[] = [];
  private freeIdx: number[] = [];
  private rings: Ring[] = [];
  private comics: Comic[] = [];
  private ringGeo = new THREE.RingGeometry(0.85, 1, 32);
  readonly group = new THREE.Group();
  paint: PaintSystem | null = null;
  private records: (THREE.Vector3 | null)[] = new Array(MAX_RECORDS).fill(null);
  private recNext = 0;
  private blobs: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private color = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);
  /** Hand-drawn sound (shouts, sound attacks): one batch of arcs + one of glyphs. */
  readonly sound = new SoundFx();

  constructor(_assets: AssetManager) {
    this.group.name = 'effects';
    this.group.add(this.sound.group);
    this.group.userData.noPaint = true;
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // unlit: droplets always read as their paint colour
    this.blobs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, MAX_PARTICLES);
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.blobs.setMatrixAt(i, this.hidden);
      this.blobs.setColorAt(i, this.color.set('#ffffff'));
      this.freeIdx.push(MAX_PARTICLES - 1 - i);
    }
    this.blobs.frustumCulled = false;
    this.group.add(this.blobs);
  }

  ensurePaint(): PaintSystem | null {
    if (!this.paint && this.group.parent) this.paint = new PaintSystem(this.group.parent);
    return this.paint;
  }

  burst(pos: THREE.Vector3, color: string | number, count = 10, speed = 4, size = 0.07, gravity = 12, dir?: THREE.Vector3): void {
    this.color.set(typeof color === 'number' ? SPLAT_COLORS[color % SPLAT_COLORS.length] : color);
    count = Math.max(1, Math.round(count * Quality.s.fx));
    for (let k = 0; k < count; k++) {
      const i = this.freeIdx.pop();
      if (i === undefined) return;
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      if (dir) v.multiplyScalar(0.55).add(dir).normalize();
      v.multiplyScalar(speed * (0.5 + Math.random()));
      this.blobs.setColorAt(i, this.color);
      this.particles.push({ i, pos: pos.clone(), vel: v, life: 0, max: 0.45 + Math.random() * 0.35, gravity, size: size * (0.6 + Math.random() * 0.8) });
    }
    if (this.blobs.instanceColor) this.blobs.instanceColor.needsUpdate = true;
  }

  sparkle(pos: THREE.Vector3, color: string | number, count = 6): void {
    this.burst(pos, color, count, 1.6, 0.05, -1.5);
  }

  ring(pos: THREE.Vector3, color: string | number, scale = 1.5, normal = new THREE.Vector3(0, 1, 0)): void {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    this.group.add(m);
    this.rings.push({ mesh: m, life: 0, max: 0.45, scale });
  }

  /** Pop a comic onomatopoeia ("SPLAT!") at a world point. */
  comic(pos: THREE.Vector3, text: string, color = '#ffd23a', size = 1): void {
    if (this.comics.length > 8) {
      const old = this.comics.shift()!;
      this.group.remove(old.sprite);
      old.sprite.material.dispose();
    }
    const mat = new THREE.SpriteMaterial({ map: comicTexture(text, color), transparent: true, depthTest: false, depthWrite: false });
    const sp = new THREE.Sprite(mat);
    sp.position.copy(pos);
    sp.renderOrder = 10;
    sp.scale.set(0.001, 0.001, 1);
    this.group.add(sp);
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
    this.comics.push({ sprite: sp, life: 0, max: 0.75, vel: v, size, spin: (Math.random() - 0.5) * 0.5 });
  }

  /**
   * Paint a surface. `color` = palette index or CSS colour. `dir` = travel
   * direction (defaults to straight into the surface). Paint wraps the real
   * mesh, smears on glancing hits and drips down walls.
   */
  splat(point: THREE.Vector3, normal: THREE.Vector3, color: number | string, size = 0.35, dir?: THREE.Vector3, opts: SplatOpts = {}): void {
    const css = typeof color === 'number' ? SPLAT_COLORS[color % SPLAT_COLORS.length] : color;
    this.records[this.recNext] = point.clone();
    this.recNext = (this.recNext + 1) % MAX_RECORDS;
    const d = dir ? dir.clone().normalize() : normal.clone().negate();
    this.ensurePaint()?.splat(point, d, css, size * 0.5, { drip: opts.drip ?? 0.6, erase: opts.erase });
  }

  /** Eraser grubs rub out paint. Returns how many paint records were erased. */
  eraseNear(p: THREE.Vector3, r: number): number {
    let n = 0;
    for (let i = 0; i < MAX_RECORDS; i++) {
      const sp = this.records[i];
      if (sp && sp.distanceTo(p) < r) {
        this.records[i] = null;
        n++;
      }
    }
    if (n) this.ensurePaint()?.splat(p, new THREE.Vector3(0, -1, 0), '#000', r * 1.1, { erase: true });
    return n;
  }

  /** Count paint landings inside a sphere (graffiti tag spots). */
  coverage(p: THREE.Vector3, r: number): number {
    let n = 0;
    for (const sp of this.records) if (sp && sp.distanceTo(p) < r) n++;
    return n;
  }

  static splatColor(i: number): string {
    return SPLAT_COLORS[((i % SPLAT_COLORS.length) + SPLAT_COLORS.length) % SPLAT_COLORS.length];
  }

  update(dt: number): void {
    this.ensurePaint()?.flush(dt);
    this.sound.update(dt);
    const d = this.dummy;
    // draw only up to the highest live slot (the pool is 700 spheres: ~100k triangles when drawn whole)
    let top = -1;
    const hadAny = this.blobs.count > 0;
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.life += dt;
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      const t = p.life / p.max;
      if (t >= 1) {
        this.blobs.setMatrixAt(p.i, this.hidden);
        this.freeIdx.push(p.i);
        this.particles.splice(k, 1);
        continue;
      }
      // liquid blob: stretched along velocity, shrinking as it flies
      const sp = p.vel.length();
      const s = p.size * (1 - t * t);
      d.position.copy(p.pos);
      if (sp > 0.01) d.quaternion.setFromUnitVectors(this.up, p.vel.clone().divideScalar(sp));
      d.scale.set(s, s * (1 + Math.min(2.5, sp * 0.12)), s);
      d.updateMatrix();
      this.blobs.setMatrixAt(p.i, d.matrix);
      if (p.i > top) top = p.i;
    }
    this.blobs.count = top + 1;
    this.blobs.visible = top >= 0;
    if (top >= 0 || hadAny) this.blobs.instanceMatrix.needsUpdate = true;
    for (let i = this.comics.length - 1; i >= 0; i--) {
      const c = this.comics[i];
      c.life += dt;
      const t = c.life / c.max;
      c.vel.multiplyScalar(Math.exp(-5 * dt));
      c.sprite.position.addScaledVector(c.vel, dt);
      // stamp in (overshoot), hold, shrink away
      const pop = t < 0.18 ? (t / 0.18) * 1.35 : t < 0.3 ? 1.35 - ((t - 0.18) / 0.12) * 0.35 : 1 - Math.max(0, (t - 0.75) / 0.25) * 0.6;
      const s = c.size * pop;
      c.sprite.scale.set(s * 2.4, s * 0.9, 1);
      c.sprite.material.rotation = c.spin * (1 - t);
      c.sprite.material.opacity = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      if (t >= 1) {
        this.group.remove(c.sprite);
        c.sprite.material.dispose();
        this.comics.splice(i, 1);
      }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      const t = r.life / r.max;
      r.mesh.scale.setScalar(0.2 + t * r.scale);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (t >= 1) {
        this.group.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        this.rings.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const p of this.particles) {
      this.blobs.setMatrixAt(p.i, this.hidden);
      this.freeIdx.push(p.i);
    }
    this.particles = [];
    this.blobs.instanceMatrix.needsUpdate = true;
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings = [];
    for (const c of this.comics) this.group.remove(c.sprite);
    this.comics = [];
    this.records.fill(null);
    this.paint?.clear();
    this.sound.clear();
  }
}
