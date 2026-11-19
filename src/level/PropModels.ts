import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline, toon } from '../render/Materials';
import type { AssetManager } from '../core/AssetManager';

/**
 * Dedicated models for the three small "hero props": the golden crown, the paint drop and the
 * spray-can checkpoint. Each is built from lathes / extrusions in a handful of colours and merged
 * into one vertex-coloured mesh (+ one ink hull), so they cost a draw call or two.
 */

/** Collects geometries with a flat colour each, then merges them. */
export class Parts {
  geos: THREE.BufferGeometry[] = [];

  add(g: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4): this {
    const n = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    if (m) n.applyMatrix4(m);
    if (!n.attributes.normal) n.computeVertexNormals();
    const c = new THREE.Color(color);
    const a = new Float32Array(n.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) {
      a[i] = c.r;
      a[i + 1] = c.g;
      a[i + 2] = c.b;
    }
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    this.geos.push(n);
    return this;
  }

  /** Another Parts' geometry, transformed (keeps its colours). */
  addParts(o: Parts, m: THREE.Matrix4): this {
    for (const g of o.geos) {
      const c = g.clone();
      c.applyMatrix4(m);
      this.geos.push(c);
    }
    return this;
  }

  mesh(outline = 0.02): THREE.Mesh {
    const mat = toon({ color: '#ffffff' }) as unknown as THREE.MeshStandardMaterial;
    mat.vertexColors = true;
    const mesh = new THREE.Mesh(mergeGeometries(this.geos)!, mat);
    mesh.castShadow = true;
    if (outline > 0) addOutline(mesh, outline);
    return mesh;
  }
}

export const lathe = (pts: [number, number][], seg = 28): THREE.BufferGeometry => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), seg);
const M = new THREE.Matrix4();
/** translate · rotY · rotX · scale */
export function xf(x = 0, y = 0, z = 0, ry = 0, rx = 0, s: number | [number, number, number] = 1): THREE.Matrix4 {
  const sc = typeof s === 'number' ? ([s, s, s] as const) : s;
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0, 'YXZ')), new THREE.Vector3(...sc));
}
void M;

// ───────────────────────── crown ─────────────────────────

/** Parts of the crown: radius ≈ 0.5, band centred on y = 0 (height 0.32), spikes up to ≈ +0.66. */
function crownParts(color: THREE.ColorRepresentation): Parts {
  const gold = new THREE.Color(color);
  const deep = gold.clone().multiplyScalar(0.7).offsetHSL(-0.015, 0.05, 0);
  const pale = gold.clone().lerp(new THREE.Color('#fff2b8'), 0.55);
  const velvet = '#ff3f95';
  const P = new Parts();
  const H = 0.32;
  const y0 = -H / 2;
  // band: a real ring with wall thickness, flaring upwards
  P.add(lathe([[0.4, y0], [0.5, y0 + H], [0.45, y0 + H], [0.35, y0]], 40), gold, xf());
  // rolled rims + an embossed stripe
  P.add(new THREE.TorusGeometry(0.4, 0.04, 8, 40).rotateX(Math.PI / 2), pale, xf(0, y0, 0));
  P.add(new THREE.TorusGeometry(0.5, 0.034, 8, 40).rotateX(Math.PI / 2), pale, xf(0, y0 + H, 0));
  P.add(new THREE.TorusGeometry(0.455, 0.016, 6, 40).rotateX(Math.PI / 2), deep, xf(0, y0 + H * 0.5, 0));
  // velvet cap seen between the spikes
  P.add(new THREE.SphereGeometry(0.44, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), velvet, xf(0, y0 + H - 0.02, 0, 0, 0, [1, 0.5, 1]));
  P.add(new THREE.SphereGeometry(0.065, 10, 8), pale, xf(0, y0 + H + 0.2, 0));
  const tipCols = ['#ff3f95', '#33d6c8', '#ff8a3a', '#6fa0ff', '#ff3f95'];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tall = i === 0 ? 0.52 : i % 2 ? 0.4 : 0.46;
    // main spike: flared foot, slender body, round pearl on top
    const spike = lathe([[0.15, 0], [0.145, 0.04], [0.09, 0.16], [0.05, tall * 0.7], [0.032, tall - 0.04], [0.001, tall]], 10);
    P.add(spike, gold, xf(Math.sin(a) * 0.47, y0 + H, Math.cos(a) * 0.47, a, 0.2));
    P.add(new THREE.SphereGeometry(0.062, 10, 8), tipCols[i], xf(Math.sin(a) * (0.47 + Math.sin(0.2) * tall), y0 + H + Math.cos(0.2) * tall + 0.03, Math.cos(a) * (0.47 + Math.sin(0.2) * tall), a));
    // a small scallop between this spike and the next
    const b = a + Math.PI / 5;
    P.add(lathe([[0.1, 0], [0.07, 0.07], [0.001, 0.17]], 8), deep, xf(Math.sin(b) * 0.485, y0 + H, Math.cos(b) * 0.485, b, 0.28));
    // a gem set in a bezel on the band
    const gem = i === 0 ? 0.095 : 0.065;
    const gx = Math.sin(a) * 0.435, gz = Math.cos(a) * 0.435;
    P.add(new THREE.TorusGeometry(gem * 1.25, gem * 0.28, 6, 14), pale, xf(gx, y0 + H * 0.5, gz, a, 0, [1, 1, 1.0]));
    P.add(new THREE.OctahedronGeometry(gem, 0), tipCols[(i + 2) % 5], xf(Math.sin(a) * 0.455, y0 + H * 0.5, Math.cos(a) * 0.455, a, 0, [1, 1.25, 0.7]));
    // pearl studs along the lower rim
    const pa = a + Math.PI / 5;
    P.add(new THREE.SphereGeometry(0.03, 8, 6), pale, xf(Math.sin(pa) * 0.425, y0 + H * 0.5, Math.cos(pa) * 0.425));
  }
  return P;
}

/**
 * The golden graffiti crown: flared band with rim rolls and bezel-set gems, five tall spikes
 * with pearl tips alternating with little scallops, a pink velvet cap. Diameter ≈ 1 × `size`,
 * band centred on the origin.
 */
export function buildCrownModel(size = 1, color: THREE.ColorRepresentation = '#ffcf3a'): THREE.Group {
  const g = new THREE.Group();
  g.name = 'CrownModel';
  const m = crownParts(color).mesh(0.018);
  g.add(m);
  g.scale.setScalar(size);
  return g;
}

// ───────────────────────── paint drop ─────────────────────────

/**
 * A fat glossy droplet of fresh paint with a curled tip, a swirl band of lighter paint round its
 * belly, a crescent highlight and two little satellite beads. Spins around Y. ≈ 0.4 tall, origin
 * at its middle.
 */
export function buildPaintDropModel(color: string): THREE.Group {
  const g = new THREE.Group();
  g.name = 'PaintDropModel';
  const base = new THREE.Color(color);
  // teardrop profile, bottom → tip
  const pts: THREE.Vector2[] = [];
  const N = 28;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const r = Math.sin(Math.pow(t, 0.7) * Math.PI) * 0.2 * (1 - 0.35 * t);
    pts.push(new THREE.Vector2(Math.max(0.002, r), -0.15 + t * 0.42));
  }
  const geo = new THREE.LatheGeometry(pts, 24);
  // curl the tip sideways
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = Math.max(0, p.getY(i) - 0.05);
    p.setX(i, p.getX(i) + k * k * 1.7);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.08, emissive: color, emissiveIntensity: 0.26 });
  const body = new THREE.Mesh(geo, mat);
  const ink = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide }));
  ink.scale.setScalar(1.1);
  body.add(ink);
  g.add(body);
  // swirl band: a lighter ribbon spiralling round the belly
  const light = base.clone().lerp(new THREE.Color('#ffffff'), 0.45);
  const swirlPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, a = t * Math.PI * 2.2 + 0.4, y = -0.1 + t * 0.2;
    const r = Math.sin(Math.pow((y + 0.15) / 0.42, 0.7) * Math.PI) * 0.2 * (1 - 0.35 * ((y + 0.15) / 0.42)) + 0.006;
    swirlPts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(swirlPts), 36, 0.014, 5), new THREE.MeshBasicMaterial({ color: light })));
  // highlights
  const white = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const dab = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), white);
  dab.position.set(-0.075, 0.02, 0.13);
  dab.scale.set(0.8, 1.9, 0.45);
  dab.rotation.z = 0.35;
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), white);
  dot.position.set(-0.04, 0.115, 0.115);
  g.add(dab, dot);
  // satellite beads
  for (const [x, y, z, r] of [[0.19, 0.1, -0.06, 0.035], [0.25, -0.02, 0.05, 0.024]] as const) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    b.position.set(x, y, z);
    const bi = new THREE.Mesh(b.geometry, new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide }));
    bi.scale.setScalar(1.25);
    b.add(bi);
    g.add(b);
  }
  return g;
}

// ───────────────────────── checkpoint ─────────────────────────

export interface CheckpointModel {
  root: THREE.Group;
  /** The spray nozzle button: turns pink and hops when the checkpoint is active. */
  cap: THREE.Mesh;
  capY: number;
}

/**
 * A big painted spray can standing in its own puddle of paint: dented body, silver rims, a yellow
 * label with a pink zig-zag edge, a crown stencil and drips, and a clicky nozzle on top (≈ 1.05 tall).
 */
export function buildCheckpointModel(): CheckpointModel {
  const root = new THREE.Group();
  root.name = 'CheckpointModel';
  const P = new Parts();
  const cobalt = '#2a4be0', cobaltLight = '#5f7bff', steel = '#cfd3e6', yellow = '#ffd23a', pink = '#ff3f95', ink = '#1a1224';
  // can body: base rim, belly, shoulder, neck
  P.add(lathe([[0, 0], [0.25, 0], [0.275, 0.03], [0.27, 0.09], [0.275, 0.72], [0.25, 0.84], [0.17, 0.92], [0.13, 0.95], [0.13, 0.99], [0, 0.99]], 28), cobalt);
  // a lighter vertical stripe (the light catching the tin)
  P.add(new THREE.CylinderGeometry(0.281, 0.281, 0.5, 6, 1, true, -0.35, 0.7), cobaltLight, xf(0, 0.38, 0));
  // silver rims
  P.add(new THREE.TorusGeometry(0.27, 0.025, 6, 28).rotateX(Math.PI / 2), steel, xf(0, 0.05, 0));
  P.add(new THREE.TorusGeometry(0.255, 0.024, 6, 28).rotateX(Math.PI / 2), steel, xf(0, 0.8, 0));
  P.add(new THREE.TorusGeometry(0.135, 0.02, 6, 20).rotateX(Math.PI / 2), steel, xf(0, 0.945, 0));
  // label band + pink zig-zag edge
  P.add(new THREE.CylinderGeometry(0.283, 0.283, 0.36, 28, 1, true), yellow, xf(0, 0.42, 0));
  P.add(new THREE.TorusGeometry(0.284, 0.014, 5, 28).rotateX(Math.PI / 2), ink, xf(0, 0.6, 0));
  P.add(new THREE.TorusGeometry(0.284, 0.014, 5, 28).rotateX(Math.PI / 2), ink, xf(0, 0.24, 0));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    P.add(new THREE.ConeGeometry(0.062, 0.1, 3), pink, xf(Math.sin(a) * 0.288, 0.19, Math.cos(a) * 0.288, a, Math.PI));
  }
  // crown stencil on the front of the label: a flat 5-point silhouette
  const cs = new THREE.Shape();
  const cp: [number, number][] = [[-0.5, -0.32], [-0.5, 0.3], [-0.25, 0.02], [0, 0.5], [0.25, 0.02], [0.5, 0.3], [0.5, -0.32]];
  cp.forEach(([x, y], i) => (i ? cs.lineTo(x, y) : cs.moveTo(x, y)));
  P.add(new THREE.ExtrudeGeometry(cs, { depth: 0.1, bevelEnabled: false }), pink, xf(0, 0.42, 0.285, 0, 0, [0.14, 0.14, 0.12]));
  for (const x of [-0.5, 0, 0.5]) P.add(new THREE.SphereGeometry(0.014, 6, 5), ink, xf(x * 0.14, 0.42 + (x === 0 ? 0.07 : 0.042), 0.3));

  // drips running down the can from the label
  for (const [a, len, col] of [[0.9, 0.2, pink], [2.4, 0.13, yellow], [4.0, 0.25, pink], [5.3, 0.15, yellow]] as const) {
    const d = new THREE.CapsuleGeometry(0.022, len, 4, 8);
    P.add(d, col, xf(Math.sin(a) * 0.282, 0.24 - len / 2, Math.cos(a) * 0.282, a));
    P.add(new THREE.SphereGeometry(0.034, 8, 6), col, xf(Math.sin(a) * 0.284, 0.24 - len - 0.02, Math.cos(a) * 0.284, a, 0, [1, 1.3, 0.6]));
  }
  // splat of paint on the ground: a lobed puddle with a few drops flicked out
  const shape = new THREE.Shape();
  const L = 11;
  for (let i = 0; i <= L * 8; i++) {
    const a = (i / (L * 8)) * Math.PI * 2;
    const r = 0.62 + Math.sin(a * L * 0.5) * 0.07 + Math.sin(a * 3 + 1) * 0.07;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const puddle = new THREE.ExtrudeGeometry(shape, { depth: 0.035, bevelEnabled: false }).rotateX(-Math.PI / 2);
  P.add(puddle, pink, xf(0, -0.002, 0));
  P.add(new THREE.CircleGeometry(0.4, 18).rotateX(-Math.PI / 2), yellow, xf(0.03, 0.04, 0.02));
  for (const [x, z, r] of [[0.78, 0.2, 0.07], [-0.7, 0.45, 0.05], [0.4, -0.75, 0.06], [-0.2, 0.85, 0.045]] as const)
    P.add(new THREE.CylinderGeometry(r, r, 0.03, 10), pink, xf(x, 0.0, z));
  root.add(P.mesh(0.022));

  // nozzle: a clicky actuator (this is what lights up)
  const capMat = toon({ color: '#9aa0b4' });
  const cap = new THREE.Mesh(lathe([[0.09, 0], [0.11, 0.02], [0.1, 0.1], [0.06, 0.13], [0, 0.135]], 14), capMat);
  cap.castShadow = true;
  addOutline(cap, 0.014);
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.12), new THREE.MeshBasicMaterial({ color: ink }));
  spout.position.set(0, 0.07, 0.09);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(0.014, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  hole.position.set(0, 0.07, 0.151);
  cap.add(spout, hole);
  const capY = 0.99;
  cap.position.y = capY;
  root.add(cap);
  return { root, cap, capY };
}

// ───────────────────────── Tripo GLB first, procedural as fallback ─────────────────────────

/** The crown: Tripo GLB when loaded (diameter ≈ `size`, centred), else the procedural one. */
export function crownModel(assets: AssetManager | undefined, size = 1, color: THREE.ColorRepresentation = '#ffcf3a'): THREE.Object3D {
  const glb = assets?.instantiateModel('crown', { pivot: 'center' });
  if (!glb) return buildCrownModel(size, color);
  glb.scale.setScalar(size);
  return glb;
}

/** The paint drop: Tripo GLB tinted towards `color`, else the procedural droplet. */
export function paintDropModel(assets: AssetManager | undefined, color: string): THREE.Object3D {
  const glb = assets?.instantiateModel('paintDrop', { pivot: 'center' });
  if (!glb) return buildPaintDropModel(color);
  const tint = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.5);
  glb.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    mat.color.copy(tint);
    mat.emissive = new THREE.Color(color);
    mat.emissiveIntensity = 0.22;
    m.material = mat;
  });
  return glb;
}
