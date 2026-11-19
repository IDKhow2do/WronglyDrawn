/**
 * [INPUT]: depends on StaticBatch/block/lathe/latheHull/tube/v2/worldUV/seeded from ../harbor/HarborKit; toon from render/Materials;
 *          Quality (does the canvas have MSAA: alpha to coverage) from render/Quality;
 *          ensureWorksTextures/signCanvas from ./WorksTextures; PhysicsWorld (static colliders); Stair/stairStep from ./WorksLayout
 * [OUTPUT]: exports worksMats() + WorksMats (the wire mesh is an anti-aliased cut-out that fades to a flat tone when its
 *           diamonds turn sub-pixel), Washer, MarkBatch, and the factory kit: girder, column, pipe, railing, crate,
 *           paperStack, cabinet, hangingLamp, windowBay, stairs, stairRamp, screen, sign
 * [POS]: Limp Works' modelling kit. Every floor builds its set from these pieces into one StaticBatch per floor
 *        (one mesh per material + one shared ink hull), so a floor costs a handful of draw calls. Colliders are
 *        plain boxes placed beside the visuals; stairs add an invisible nosing ramp (stairRamp) over their box steps.
 *        The Washer turns a floor's grey steel colourful when its Guardian wakes.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetManager } from '../../core/AssetManager';
import type { PhysicsWorld } from '../../core/PhysicsWorld';
import { toon } from '../../render/Materials';
import { Quality } from '../../render/Quality';
import { StaticBatch, block, lathe, latheHull, seeded, tube, v2, worldUV } from '../harbor/HarborKit';
import { ensureWorksTextures, signCanvas } from './WorksTextures';
import { type Stair, stairStep } from './WorksLayout';

const UP = new THREE.Vector3(0, 1, 0);

export interface WorksMats {
  grid: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  steelDark: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  red: THREE.MeshStandardMaterial;
  cream: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  ruler: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  cabinet: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  bulb: THREE.MeshBasicMaterial;
  marks: THREE.MeshBasicMaterial;
  mesh: THREE.MeshStandardMaterial;
}

/** One floor's materials (each floor owns its own set so its Guardian can wash it alone). */
export function worksMats(assets: AssetManager): WorksMats {
  ensureWorksTextures(assets);
  const T = (n: string) => assets.tex(n);
  const S = (o: Parameters<typeof toon>[0]) => {
    const m = toon(o) as unknown as THREE.MeshStandardMaterial;
    if (m.normalMap) m.normalMap.anisotropy = 16; // the relief is filtered like its colour at grazing angles
    return m;
  };
  return {
    grid: S({ map: T('w3_grid'), relief: 0.4 }),
    steel: S({ map: T('w3_steel'), color: '#e8ecf6' }),
    steelDark: S({ map: T('w3_steel_dark') }),
    brick: S({ map: T('w3_brick'), color: '#ece8f2' }),
    red: S({ color: '#d8283a' }),
    cream: S({ color: '#f3ead6' }),
    brass: S({ color: '#e2b44a' }),
    rubber: S({ color: '#34303f' }),
    hazard: S({ map: T('w3_hazard') }),
    ruler: S({ map: T('w3_ruler'), relief: 0.3 }),
    paper: S({ map: T('w3_drawings'), relief: 0.2 }),
    cabinet: S({ map: T('w3_cabinet') }),
    wood: S({ map: T('wood'), color: '#e8c9a0' }),
    glow: new THREE.MeshBasicMaterial({ map: T('w3_window') }),
    bulb: new THREE.MeshBasicMaterial({ color: '#fff1c2' }),
    marks: new THREE.MeshBasicMaterial({ map: T('w3_marks'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    mesh: wireMesh(T('w3_mesh')),
  };
}

/**
 * The diamond wire mesh (stair cages, safety screens, the lift's shutter). An alpha-tested weave aliases badly once a
 * diamond is a few pixels big: the wires break up, crawl and beat against the pixel grid (and mipmapping thins its alpha
 * until whole patches vanish). Here the cut-out edge is anti-aliased from the alpha's own screen slope, and as the
 * diamonds shrink below ~6 px the weave fades into a flat see-through tone of the wire's colour (coverage: alpha to
 * coverage under MSAA, else a fixed 4×4 screen-door pattern that cannot shimmer).
 */
function wireMesh(map: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide, roughness: 0.6 });
  m.alphaToCoverage = Quality.s.antialias; // MSAA canvas (medium / high); the low tier takes the screen-door path
  m.defines = { ...(m.defines ?? {}), WD_WIRE: '' };
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <alphatest_fragment>',
      `#ifdef USE_MAP
      {
        // 4 diamonds per texture tile: how many pixels one diamond spans on screen
        vec2 wdF = fwidth( vMapUv ) * 4.0;
        float wdCellPx = 1.0 / max( max( wdF.x, wdF.y ), 1e-5 );
        float wdFlat = 1.0 - smoothstep( 3.0, 7.0, wdCellPx );
        // the cut-out edge, one pixel soft
        float wdEdge = clamp( ( diffuseColor.a - 0.45 ) / max( fwidth( diffuseColor.a ), 1e-3 ) + 0.5, 0.0, 1.0 );
        diffuseColor.a = mix( wdEdge, 0.46, wdFlat );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.05, 0.05, 0.085 ), wdFlat );
      }
      #endif
      #ifdef ALPHA_TO_COVERAGE
        if ( diffuseColor.a < 0.02 ) discard;
      #else
        {
          // screen-door: a fixed 4x4 Bayer threshold per pixel
          vec2 wdP = mod( floor( gl_FragCoord.xy ), 4.0 );
          float wdB = mod( wdP.x + wdP.y * 2.0, 4.0 ) * 0.25 + mod( wdP.y, 2.0 ) * 0.125 + mod( floor( wdP.x * 0.5 ) + wdP.y, 2.0 ) * 0.0625;
          if ( diffuseColor.a < wdB + 0.03 ) discard;
        }
      #endif`,
    );
  };
  m.customProgramCacheKey = () => 'wd-wire-mesh';
  return m;
}

// ───────────── the wash: grey corrections → colour (a Guardian wakes) ─────────────
export class Washer {
  private list: { mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; from: THREE.Color; to: THREE.Color; op?: [number, number] }[] = [];
  private k = 0;
  private on = false;

  /** Recolour `mat` to `to` when washed. */
  add(mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial, to: string): void {
    this.list.push({ mat, from: mat.color.clone(), to: new THREE.Color(to) });
  }
  /** Fade a transparent material out (the red marks). */
  fade(mat: THREE.MeshBasicMaterial): void {
    this.list.push({ mat, from: mat.color.clone(), to: mat.color.clone(), op: [mat.opacity, 0] });
  }
  get washed(): boolean {
    return this.on;
  }
  start(instant = false): void {
    this.on = true;
    if (instant) this.k = 0.999;
  }
  update(dt: number): void {
    if (!this.on || this.k >= 1) return;
    this.k = Math.min(1, this.k + dt / 2.4);
    const e = this.k * this.k * (3 - 2 * this.k);
    for (const w of this.list) {
      w.mat.color.copy(w.from).lerp(w.to, e);
      if (w.op) {
        w.mat.opacity = THREE.MathUtils.lerp(w.op[0], w.op[1], e);
        w.mat.visible = w.mat.opacity > 0.01;
      }
    }
  }
}

// ───────────── red correction marks: one merged mesh per floor ─────────────
/** 0 CORRECT stamp · 1 brushed X · 2 circle · 3 tick (quadrants of w3_marks). */
export class MarkBatch {
  private geos: THREE.BufferGeometry[] = [];

  /** A mark lying on a surface: centre, outward normal, size (m), spin about the normal. */
  add(kind: 0 | 1 | 2 | 3, c: THREE.Vector3, n: THREE.Vector3, size: number, spin = 0): void {
    const g = new THREE.PlaneGeometry(size, size);
    const u0 = (kind % 2) * 0.5, v0 = kind < 2 ? 0.5 : 0;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * 0.5, v0 + uv.getY(i) * 0.5);
    g.rotateZ(spin);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n.clone().normalize());
    g.applyQuaternion(q);
    g.translate(c.x + n.x * 0.025, c.y + n.y * 0.025, c.z + n.z * 0.025);
    this.geos.push(g);
  }

  flush(root: THREE.Object3D, mat: THREE.Material): THREE.Mesh | null {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos)!, mat);
    m.renderOrder = 1;
    m.userData.noPaint = true;
    m.name = 'works-marks';
    root.add(m);
    this.geos = [];
    return m;
  }
}

// ───────────── structure ─────────────
/** An I-beam profile (h tall, w flange, t thickness), extruded along +z by `len`. */
function iBeam(h: number, w: number, len: number, t = 0.06): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const hw = w / 2, hh = h / 2, ht = t / 2;
  s.moveTo(-hw, -hh);
  s.lineTo(hw, -hh);
  s.lineTo(hw, -hh + t);
  s.lineTo(ht, -hh + t);
  s.lineTo(ht, hh - t);
  s.lineTo(hw, hh - t);
  s.lineTo(hw, hh);
  s.lineTo(-hw, hh);
  s.lineTo(-hw, hh - t);
  s.lineTo(-ht, hh - t);
  s.lineTo(-ht, -hh + t);
  s.lineTo(-hw, -hh + t);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false, steps: 1 });
  return worldUV(g, 2);
}

/** A steel I-beam girder from a to b (web vertical), rivet plates at both ends. */
export function girder(B: StaticBatch, a: THREE.Vector3, b: THREE.Vector3, h: number, w: number, mat: THREE.Material): void {
  const len = a.distanceTo(b);
  const g = iBeam(h, w, len);
  const dir = b.clone().sub(a).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  // keep the web vertical for horizontal runs
  if (Math.abs(dir.y) < 0.9) {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(dir.x, dir.z));
    const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1)));
    q.copy(yawQ.multiply(pitch));
  }
  g.applyQuaternion(q);
  g.translate(a.x, a.y, a.z);
  B.add(g, mat, 0.03);
}

/** A riveted I-beam column with a base plate, a capital plate and four bolts (collider included). */
export function column(B: StaticBatch, phys: PhysicsWorld, x: number, z: number, y0: number, y1: number, mats: WorksMats, solid = true): void {
  girder(B, new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), 0.42, 0.36, mats.steelDark);
  B.add(block(0.8, 0.12, 0.8, 0.01, x * 7 + z, 1).translate(x, y0 + 0.06, z), mats.steel, 0.03);
  B.add(block(0.7, 0.14, 0.7, 0.01, x * 5 + z, 1).translate(x, y1 - 0.07, z), mats.steel, 0.03);
  for (const [dx, dz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) B.add(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6).translate(x + dx, y0 + 0.16, z + dz), mats.brass, 0);
  if (solid) phys.addStaticBox(new THREE.Vector3(x, (y0 + y1) / 2, z), new THREE.Vector3(0.24, (y1 - y0) / 2, 0.24));
}

/** A pipe run with bolted flanges every `every` metres. */
export function pipe(B: StaticBatch, pts: THREE.Vector3[], r: number, mat: THREE.Material, flange: THREE.Material, every = 3): void {
  B.add(tube(pts, r, Math.max(8, pts.length * 6), 10), mat, 0.03);
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = a.distanceTo(b);
    const n = Math.max(1, Math.floor(d / every));
    const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
    for (let k = 1; k < n; k++) {
      const p = a.clone().lerp(b, k / n);
      B.add(new THREE.CylinderGeometry(r * 1.45, r * 1.45, r * 0.6, 12).applyQuaternion(q).translate(p.x, p.y, p.z), flange, 0.02);
    }
  }
}

/** A steel railing from a to b at floor height y: posts, a round top rail, a mid rail, a kick plate (+ a thin collider). */
export function railing(B: StaticBatch, phys: PhysicsWorld | null, a: THREE.Vector3, b: THREE.Vector3, mats: WorksMats, h = 1.05, rail: THREE.Material = mats.red): void {
  const d = a.distanceTo(b);
  const n = Math.max(1, Math.round(d / 1.6));
  const y = a.y;
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    B.add(new THREE.CylinderGeometry(0.035, 0.045, h, 8).translate(p.x, y + h / 2, p.z), mats.steelDark, 0.02);
  }
  B.add(tube([a.clone().setY(y + h), b.clone().setY(y + h)], 0.05, 2, 8), rail, 0.02);
  B.add(tube([a.clone().setY(y + h * 0.52), b.clone().setY(y + h * 0.52)], 0.03, 2, 6), mats.steelDark, 0.015);
  const mid = a.clone().lerp(b, 0.5);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  B.add(new THREE.BoxGeometry(0.03, 0.14, d).rotateY(yaw).translate(mid.x, y + 0.09, mid.z), mats.hazard, 0.015);
  if (phys) phys.addStaticBox(new THREE.Vector3(mid.x, y + 0.6, mid.z), new THREE.Vector3(0.05, 0.6, d / 2), yaw);
}

/** A planked crate with corner battens and a stencilled drawing on two faces. */
export function crate(B: StaticBatch, phys: PhysicsWorld | null, c: THREE.Vector3, s: number, yaw: number, mats: WorksMats, seed = 1): void {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.025) => B.add(g.applyQuaternion(q).translate(c.x, c.y, c.z), m, ink);
  put(block(s, s, s, 0.012, seed, 1.2).translate(0, s / 2, 0), mats.wood, 0.03);
  const t = 0.07;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) put(new THREE.BoxGeometry(t, s + 0.02, t).translate(sx * (s / 2 - t / 2 + 0.01), s / 2, sz * (s / 2 - t / 2 + 0.01)), mats.steelDark, 0);
  for (const y of [0.05, s - 0.05]) {
    put(new THREE.BoxGeometry(s + 0.03, t, t).translate(0, y, s / 2 - t / 2 + 0.015), mats.steelDark, 0);
    put(new THREE.BoxGeometry(s + 0.03, t, t).translate(0, y, -s / 2 + t / 2 - 0.015), mats.steelDark, 0);
  }
  // a crossed-out drawing pasted on the front and the side (a 4 cm-thick label board, never flat on the face)
  const k = seed % 4;
  for (const [ry, off] of [[0, s / 2 + 0.02], [Math.PI / 2, s / 2 + 0.02]] as [number, number][]) {
    const g = new THREE.BoxGeometry(s * 0.56, s * 0.56, 0.02);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (k % 2) * 0.5 + uv.getX(i) * 0.5, (k < 2 ? 0.5 : 0) + uv.getY(i) * 0.5);
    put(g.translate(0, s * 0.52, off).rotateY(ry), mats.paper, 0);
  }
  if (phys) phys.addStaticBox(c.clone().setY(c.y + s / 2), new THREE.Vector3(s / 2, s / 2, s / 2), yaw);
}

/** A stack of loose drawings (each sheet a 2 cm slab at a slight angle; the top one shows a drawing). */
export function paperStack(B: StaticBatch, c: THREE.Vector3, n: number, mats: WorksMats, seed = 1): void {
  const r = seeded(seed * 17 + 3);
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(0.62, 0.025, 0.46);
    const k = Math.floor(r() * 4);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, (k % 2) * 0.5 + uv.getX(j) * 0.5, (k < 2 ? 0.5 : 0) + uv.getY(j) * 0.5);
    g.rotateY((r() - 0.5) * 0.5).translate(c.x + (r() - 0.5) * 0.06, c.y + 0.0125 + i * 0.026, c.z + (r() - 0.5) * 0.06);
    B.add(g, mats.paper, i === n - 1 ? 0.012 : 0);
  }
}

/** A filing cabinet (h tall): lipped top, kick plinth, drawer fronts in its texture, brass pulls in relief. */
export function cabinet(B: StaticBatch, phys: PhysicsWorld | null, c: THREE.Vector3, yaw: number, h: number, mats: WorksMats, w = 0.9, d = 0.7): void {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.03) => B.add(g.applyQuaternion(q).translate(c.x, c.y, c.z), m, ink);
  const body = new THREE.BoxGeometry(w, h - 0.12, d);
  // the drawers' texture on the front only: vertical tiling = one tile per 4 drawers ≈ 1.25 m
  const uv = body.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i) * ((h - 0.12) / 1.25));
  put(body.translate(0, 0.12 + (h - 0.12) / 2, 0), mats.cabinet);
  put(block(w + 0.06, 0.05, d + 0.06, 0.005, Math.round(c.x * 3), 1).translate(0, h + 0.025, 0), mats.steelDark, 0.02);
  put(new THREE.BoxGeometry(w - 0.06, 0.12, d - 0.06).translate(0, 0.06, 0), mats.rubber, 0.02);
  const rows = Math.max(1, Math.round((h - 0.12) / 0.3125));
  for (let i = 0; i < rows; i++) {
    const y = 0.12 + (h - 0.12) * ((i + 0.62) / rows);
    put(new THREE.CylinderGeometry(0.025, 0.025, 0.22, 6).rotateZ(Math.PI / 2).translate(0, y, d / 2 + 0.035), mats.brass, 0);
  }
  if (phys) phys.addStaticBox(c.clone().setY(c.y + h / 2), new THREE.Vector3(w / 2, h / 2, d / 2), yaw);
}

/** A hanging enamel factory lamp: cord from the ceiling, a lathed shade, a glowing bulb (no light: emissive only). */
export function hangingLamp(B: StaticBatch, at: THREE.Vector3, ceilY: number, mats: WorksMats, shade: THREE.Material = mats.cream): void {
  B.add(new THREE.CylinderGeometry(0.02, 0.02, ceilY - at.y, 5).translate(at.x, (ceilY + at.y) / 2 + 0.3, at.z), mats.rubber, 0);
  const prof = [v2(0.06, 0.32), v2(0.14, 0.26), v2(0.42, 0.04), v2(0.5, -0.04), v2(0.46, -0.06)];
  B.add(lathe(prof, 18, 0.01).translate(at.x, at.y, at.z), shade, 0, latheHull(prof, 18, 0.01, 0.025).translate(at.x, at.y, at.z));
  B.add(new THREE.SphereGeometry(0.16, 10, 8).translate(at.x, at.y - 0.02, at.z), mats.bulb, 0);
}

/**
 * A tall factory window on a wall: a riveted frame, a mullion grid, a sill, and the painted city view behind
 * (the pane sits 6 cm in front of the wall face, the bars 4 cm in front of the pane: nothing coplanar).
 * `n` = the inward normal of the wall (axis-aligned).
 */
export function windowBay(B: StaticBatch, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, mats: WorksMats): void {
  const yaw = Math.atan2(n.x, n.z);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.02) => B.add(g.applyQuaternion(q).translate(c.x, c.y, c.z), m, ink);
  const pane = new THREE.BoxGeometry(w, h, 0.02);
  const uv = pane.attributes.uv as THREE.BufferAttribute;
  const off = (Math.abs(c.x * 0.37 + c.z * 0.21) % 1) * 0.5;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, off + uv.getX(i) * 0.5, uv.getY(i));
  put(pane.translate(0, 0, 0.06), mats.glow, 0);
  const t = 0.12;
  for (const sx of [-1, 1]) put(new THREE.BoxGeometry(t, h + t * 2, 0.16).translate((sx * (w + t)) / 2, 0, 0.1), mats.steelDark);
  for (const sy of [-1, 1]) put(new THREE.BoxGeometry(w + t * 2, t, 0.16).translate(0, (sy * (h + t)) / 2, 0.1), mats.steelDark);
  const cols = Math.max(2, Math.round(w / 0.9));
  const rows = Math.max(3, Math.round(h / 0.8));
  for (let i = 1; i < cols; i++) put(new THREE.BoxGeometry(0.05, h, 0.05).translate(-w / 2 + (w * i) / cols, 0, 0.11), mats.steelDark, 0);
  for (let i = 1; i < rows; i++) put(new THREE.BoxGeometry(w, 0.05, 0.05).translate(0, -h / 2 + (h * i) / rows, 0.11), mats.steelDark, 0);
  put(block(w + 0.5, 0.14, 0.36, 0.01, Math.round(c.x + c.z), 1).translate(0, -h / 2 - 0.16, 0.18), mats.steel);
}

/** Nosing ramp lift (m) over the nosings and over the top landing (level 1's summit ramp: a flush end stalls). */
const RAMP_LIFT = 0.06;

/**
 * The invisible nosing ramp over steps k0..k1−1 of a stair (PhysicsWorld.addNosingRamp). The 0.5 m risers stall
 * the auto-step below a sprint. The nosings lie on y = foot.y + 0.5 + 0.5·a (a = metres along dir). k0 = 0 starts
 * on the floor in front of the stair; k1 = n ends with a flat leg RAMP_LIFT over the landing. Pieces of one stair
 * built on different floors (stair 3: k 0–12 on F3, 12–18 with the roof) meet at a = k.
 */
export function stairRamp(phys: PhysicsWorld, s: Stair, k0 = 0, k1 = s.n): void {
  const at = (a: number, y = s.foot.y + 0.5 + 0.5 * a + RAMP_LIFT) => s.foot.clone().addScaledVector(s.dir, a).setY(y);
  const pts = [at(k0 === 0 ? -1 - 2 * RAMP_LIFT : k0), at(k1 === s.n ? s.n - 1 : k1)];
  if (k1 === s.n) pts.push(at(s.n, s.foot.y + 0.5 * s.n + RAMP_LIFT));
  phys.addNosingRamp(pts, s.hw);
}

/**
 * A straight steel stair (steps of 0.5 m rise, 1 m run): checker-plate treads with a hazard nosing, two sloped
 * stringers, one box collider per step (top at the tread, reaching the floor below) and the nosing ramp (stairRamp).
 */
export function stairs(B: StaticBatch, phys: PhysicsWorld | null, s: Stair, mats: WorksMats, k0 = 0, k1 = s.n): void {
  const yaw = Math.atan2(s.dir.x, s.dir.z);
  const side = new THREE.Vector3(s.dir.z, 0, -s.dir.x);
  const p = new THREE.Vector3();
  for (let k = k0; k < k1; k++) {
    stairStep(s, k, p);
    const tread = block(s.hw * 2, 0.1, 0.98, 0.004, k + 1, 1.5).rotateY(yaw).translate(p.x, p.y - 0.05, p.z);
    B.add(tread, mats.steel, 0.02);
    B.add(new THREE.BoxGeometry(s.hw * 2 - 0.1, 0.04, 0.12).rotateY(yaw).translate(p.x - s.dir.x * 0.42, p.y + 0.005, p.z - s.dir.z * 0.42), mats.hazard, 0);
    if (phys) {
      const h = Math.min(4, p.y - s.foot.y);
      phys.addStaticBox(p.clone().setY(p.y - h / 2), new THREE.Vector3(s.hw, h / 2, 0.5), yaw);
    }
  }
  // a half step at the foot: a 0.5 m first rise from the floor is too tall for WAI's autostep
  if (k0 === 0) {
    const h = s.foot.clone().addScaledVector(s.dir, -0.3);
    B.add(block(s.hw * 2, 0.25, 0.6, 0.004, 97, 1.5).rotateY(yaw).translate(h.x, s.foot.y + 0.125, h.z), mats.steel, 0.02);
    if (phys) phys.addStaticBox(h.setY(s.foot.y + 0.125), new THREE.Vector3(s.hw, 0.125, 0.3), yaw);
  }
  if (phys) stairRamp(phys, s, k0, k1);
  // stringers: one sloped beam per side
  const a = stairStep(s, k0, new THREE.Vector3()).addScaledVector(s.dir, -0.5);
  const b = stairStep(s, k1 - 1, new THREE.Vector3()).addScaledVector(s.dir, 0.5);
  for (const sg of [-1, 1]) {
    const o = side.clone().multiplyScalar(sg * (s.hw + 0.06));
    girder(B, a.clone().add(o).setY(a.y - 0.75), b.clone().add(o).setY(b.y - 0.15), 0.34, 0.12, mats.steelDark);
  }
}

/**
 * A wire-mesh safety screen from a to b (floor y0 → y1): a mesh panel (flat, no ink), a steel frame (top and bottom
 * rails, posts every 3 m) and one collider. Stair cages use it so the climb starts only at the stair's foot.
 */
export function screen(B: StaticBatch, phys: PhysicsWorld | null, a: THREE.Vector3, b: THREE.Vector3, y0: number, y1: number, mats: WorksMats): void {
  const d = a.distanceTo(b);
  const yaw = Math.atan2(b.x - a.x, b.z - a.z);
  const mid = a.clone().lerp(b, 0.5);
  const h = y1 - y0;
  const panel = new THREE.PlaneGeometry(d, h).rotateY(yaw + Math.PI / 2);
  const uv = panel.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * d * 1.2, uv.getY(i) * h * 1.2);
  B.add(panel.translate(mid.x, y0 + h / 2, mid.z), mats.mesh, 0);
  for (const yy of [y0 + 0.08, y1 - 0.08]) B.add(new THREE.BoxGeometry(0.1, 0.12, d).rotateY(yaw).translate(mid.x, yy, mid.z), mats.steelDark, 0.02);
  const n = Math.max(1, Math.round(d / 3));
  for (let i = 0; i <= n; i++) {
    const p = a.clone().lerp(b, i / n);
    B.add(new THREE.BoxGeometry(0.12, h, 0.12).rotateY(yaw).translate(p.x, y0 + h / 2, p.z), mats.steelDark, 0.02);
  }
  if (phys) phys.addStaticBox(new THREE.Vector3(mid.x, y0 + h / 2, mid.z), new THREE.Vector3(0.06, h / 2, d / 2), yaw);
}

/** A painted sign plate (its own small texture). Returns the mesh (add it to a floor group). */
export function sign(text: string, w: number, h: number, bg = '#ffd23a', fg = '#1a1420'): THREE.Mesh {
  const tex = new THREE.CanvasTexture(signCanvas(text, bg, fg, 512, Math.round((512 * h) / w)));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  // one material: the front face shows the sign, every other face samples the plate's dark ink border
  const g = new THREE.BoxGeometry(w, h, 0.04);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) if (i < 16 || i >= 20) uv.setXY(i, 0.004, 0.5);
  const m = new THREE.Mesh(g, toon({ map: tex }));
  m.castShadow = false;
  m.receiveShadow = true;
  m.userData.noPaint = true;
  return m;
}
