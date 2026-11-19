import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { addOutline } from '../render/Materials';
import { Parts, lathe, xf } from '../level/PropModels';
import type { AssetManager } from '../core/AssetManager';

/**
 * Looks (visuals only) for the Hush family: the Hush Moth and the pieces of the Hush jellyfish.
 * Both are "eraser dust that learned to fly": soft lilac fur and crumbs, hot-coral and pink accents,
 * sleepy-angry faces — drawn so the creature stays readable *through* its grey dust veil.
 */

const INK = '#141014';
const rng = (seed: number) => {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};

/** Spiky unit direction → quaternion helper (cone pointing +Y rotated to `dir`). */
function pointing(dir: THREE.Vector3): THREE.Quaternion {
  return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
}
const mat4 = (p: THREE.Vector3, q: THREE.Quaternion, s = 1) => new THREE.Matrix4().compose(p, q, new THREE.Vector3(s, s, s));

/** A one-mesh, vertex-coloured, double-sided material. */
function vcMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
}

// ───────────────────────── MOTH ─────────────────────────

/** One wing (right-hand side; `sign` −1 builds the mirrored left one). Local: x out, z forward, flat in y. */
function wing(sign: 1 | -1, s: number): THREE.Mesh {
  const P = new Parts();
  const sh = (pts: [number, number][]) => {
    const shape = new THREE.Shape();
    pts.forEach(([x, y], i) => (i ? shape.lineTo(x * sign, y) : shape.moveTo(x * sign, y)));
    return shape;
  };
  /** Sample a closed outline from cubic segments, adding a scalloped trailing edge. */
  const fore: [number, number][] = [];
  const hind: [number, number][] = [];
  const cubic = (out: [number, number][], a: [number, number], b: [number, number], c: [number, number], d: [number, number], n = 10) => {
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u * u * u * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t * t * t * d[0], u * u * u * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t * t * t * d[1]]);
    }
  };
  // forewing: root → leading edge → tip → scalloped trailing edge → back to the root
  fore.push([0, 0.12]);
  cubic(fore, [0, 0.12], [0.3, 0.62], [0.95, 0.62], [1.18, 0.12]);
  for (let i = 1; i <= 3; i++) {
    const x0 = 1.18 - (i - 1) * 0.3, x1 = 1.18 - i * 0.3;
    cubic(fore, [x0, 0.12 - (i - 1) * 0.13], [x0 - 0.03, 0.0 - (i - 1) * 0.13], [x1 + 0.04, -0.12 - (i - 1) * 0.13], [x1, 0.0 - i * 0.13 + 0.0], 5);
  }
  fore.push([0, -0.1]);
  // hindwing: a rounder lobe tucked behind, scalloped edge
  hind.push([0, -0.04]);
  cubic(hind, [0, -0.04], [0.45, -0.02], [0.95, -0.2], [0.98, -0.62]);
  for (let i = 1; i <= 3; i++) {
    const x0 = 0.98 - (i - 1) * 0.3, x1 = 0.98 - i * 0.3;
    cubic(hind, [x0, -0.62 - (i - 1) * 0.03], [x0 - 0.04, -0.82], [x1 + 0.05, -0.82], [x1, -0.64 + (i - 1) * 0.06 - 0.03], 5);
  }
  hind.push([0, -0.34]);
  const ext = (shape: THREE.Shape, y: number) => new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false }).translate(0, 0, -0.015).rotateX(Math.PI / 2).translate(0, y, 0);
  P.add(ext(sh(hind), -0.004), '#8d82c6');
  P.add(ext(sh(fore), 0.004), '#a99ee0');
  // a lighter patch near the body, fuzzy
  for (let i = 0; i < 5; i++) P.add(new THREE.CircleGeometry(0.2 - i * 0.025, 12).rotateX(-Math.PI / 2), new THREE.Color('#cfc6f5').lerp(new THREE.Color('#ebe6ff'), i / 5), xf(0.18 * sign, 0.021 + i * 0.001, 0.14 - i * 0.015));
  // veins
  const vein = new THREE.Color('#7468b2');
  for (const [ang, len] of [[0.5, 1.0], [0.25, 1.05], [0.0, 0.95], [-0.25, 0.8], [-0.55, 0.7]] as const) {
    const g = new THREE.BoxGeometry(len, 0.006, 0.014).translate((len / 2) * sign, 0, 0);
    P.add(g, vein, new THREE.Matrix4().compose(new THREE.Vector3(0.05 * sign, 0.021, 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ang * sign * 0.7, 0)), new THREE.Vector3(1, 1, 1)));
  }
  // eyespot on the forewing: cream ▸ coral ▸ ink ▸ glint — the thing that looks back at you
  const spot = (x: number, z: number, r: number, y0: number) => {
    P.add(new THREE.CircleGeometry(r, 18).rotateX(-Math.PI / 2), '#fff1dc', xf(x * sign, y0, z));
    P.add(new THREE.CircleGeometry(r * 0.72, 16).rotateX(-Math.PI / 2), '#ff6f5e', xf(x * sign, y0 + 0.002, z));
    P.add(new THREE.CircleGeometry(r * 0.42, 14).rotateX(-Math.PI / 2), INK, xf(x * sign, y0 + 0.004, z));
    P.add(new THREE.CircleGeometry(r * 0.14, 8).rotateX(-Math.PI / 2), '#ffffff', xf(x * sign + 0.03 * sign, y0 + 0.006, z + 0.03));
  };
  spot(0.78, 0.2, 0.17, 0.024);
  spot(0.62, -0.42, 0.12, 0.018);
  // dust speckles
  const r = rng(11);
  for (let i = 0; i < 12; i++) P.add(new THREE.CircleGeometry(0.018 + r() * 0.03, 6).rotateX(-Math.PI / 2), '#efe9ff', xf((0.2 + r() * 0.85) * sign, 0.023, -0.4 + r() * 0.9));
  const mesh = new THREE.Mesh(mergeGeometries(P.geos)!, vcMat());
  mesh.scale.setScalar(0.78 * s);
  mesh.castShadow = true;
  const hull = addOutline(mesh, 0.012 / (0.78 * s));
  void hull;
  return mesh;
}

export interface MothLook {
  body: THREE.Group;
  /** [left, right] flap pivots (rotation.z flaps them). */
  wings: THREE.Group[];
  veil: THREE.Group;
  veilMat: THREE.MeshStandardMaterial;
}

/** The whole moth: fuzzy striped body, big sleepy eyes, feathered antennae, painted wings, dust veil. */
export function buildMothLook(s: number, crumbMat: THREE.Material, assets?: AssetManager): MothLook {
  const body = new THREE.Group();
  const glbBody = assets?.instantiateModel('mothTorso', { pivot: 'center' });
  const glbWing = assets?.instantiateModel('mothWing', { pivot: 'raw' });
  const P = new Parts();
  const fur = '#efe8ff', lilac = '#b8aee0', deep = '#7a6fb5', ink = '#3a2f66';
  // abdomen: tapered, banded
  P.add(new THREE.SphereGeometry(0.2, 16, 12), lilac, xf(0, -0.01, -0.34, 0, 0, [0.9, 0.85, 2.0]));
  for (let i = 0; i < 5; i++) {
    const z = -0.14 - i * 0.14, rr = 0.172 - i * 0.018;
    P.add(new THREE.TorusGeometry(rr, 0.018, 5, 18), i % 2 ? '#ffe0f0' : deep, xf(0, -0.01 - i * 0.004, z, 0, 0, [0.95, 0.9, 1]));
  }
  P.add(new THREE.ConeGeometry(0.06, 0.2, 8), fur, xf(0, -0.02, -0.78, 0, -Math.PI / 2));
  // thorax: a furry ball with a ruff of tufts
  P.add(new THREE.SphereGeometry(0.235, 16, 12), fur, xf(0, 0.02, 0.08));
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, b = Math.acos(2 * r() - 1);
    const d = new THREE.Vector3(Math.sin(b) * Math.cos(a), Math.cos(b) * 0.9, Math.sin(b) * Math.sin(a));
    if (d.z > 0.75 && d.y < 0.3) continue; // keep the neck line clear
    P.add(new THREE.ConeGeometry(0.055, 0.15, 5), i % 3 ? '#ffffff' : '#e2daff', mat4(new THREE.Vector3(0, 0.02, 0.08).addScaledVector(d, 0.235), pointing(d)));
  }
  // head
  P.add(new THREE.SphereGeometry(0.17, 14, 12), '#dcd3f7', xf(0, 0.05, 0.36));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const d = new THREE.Vector3(Math.cos(a) * 0.9, 0.3 + Math.sin(a) * 0.4, -0.5).normalize();
    P.add(new THREE.ConeGeometry(0.04, 0.1, 4), fur, mat4(new THREE.Vector3(0, 0.05, 0.36).addScaledVector(d, 0.17), pointing(d)));
  }
  // eyes: big whites, ink pupils with a glint, heavy sleepy lids
  for (const sx of [-1, 1]) {
    const ex = sx * 0.085, ey = 0.075, ez = 0.47;
    P.add(new THREE.SphereGeometry(0.085, 12, 10), '#fffaf0', xf(ex, ey, ez, 0, 0, [1, 1.05, 0.8]));
    P.add(new THREE.SphereGeometry(0.042, 10, 8), INK, xf(ex - sx * 0.006, ey - 0.012, ez + 0.05, 0, 0, [1, 1.1, 0.5]));
    P.add(new THREE.SphereGeometry(0.014, 6, 5), '#ffffff', xf(ex - sx * 0.02, ey + 0.012, ez + 0.075));
    P.add(new THREE.SphereGeometry(0.093, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42), deep, xf(ex, ey + 0.01, ez, 0, 0.55, [1, 1.05, 0.85]));
    // brow tuft
    P.add(new THREE.BoxGeometry(0.1, 0.022, 0.03), ink, new THREE.Matrix4().compose(new THREE.Vector3(ex, ey + 0.115, ez + 0.02), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -sx * 0.35)), new THREE.Vector3(1, 1, 1)));
    // cheek blush
    P.add(new THREE.CircleGeometry(0.03, 8), '#ff9ab8', xf(sx * 0.12, -0.03, 0.5, sx * 0.5));
  }
  // "shhh" mouth: a tiny pursed ring
  P.add(new THREE.TorusGeometry(0.026, 0.01, 5, 10), '#ff6f5e', xf(0, -0.045, 0.525, 0));
  // six little legs
  for (const [lx, lz] of [[0.09, 0.2], [0.1, 0.05], [0.08, -0.1]] as const)
    for (const sx of [-1, 1]) P.add(new THREE.CylinderGeometry(0.012, 0.008, 0.2, 5), ink, new THREE.Matrix4().compose(new THREE.Vector3(sx * lx, -0.2, lz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sx * 0.4)), new THREE.Vector3(1, 1, 1)));
  // feathered antennae: a curved spine with barbs both sides
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.07, 0.19, 0.4), new THREE.Vector3(sx * 0.14, 0.36, 0.5), new THREE.Vector3(sx * 0.27, 0.5, 0.62), new THREE.Vector3(sx * 0.4, 0.52, 0.7)]);
    P.add(new THREE.TubeGeometry(curve, 14, 0.011, 5), ink);
    for (let i = 1; i <= 8; i++) {
      const t = i / 9, p = curve.getPoint(t), tan = curve.getTangent(t);
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 0, 1)).normalize();
      const len = 0.09 * (1 - Math.abs(t - 0.45) * 0.9);
      for (const k of [-1, 1]) P.add(new THREE.CylinderGeometry(0.004, 0.009, len, 4), '#5a4a9a', mat4(p.clone().addScaledVector(side, k * len * 0.5), pointing(side.clone().multiplyScalar(k).add(tan.clone().multiplyScalar(0.6)))));
    }
  }
  if (glbBody) {
    body.add(glbBody);
  } else {
    const mesh = new THREE.Mesh(mergeGeometries(P.geos)!, vcMat());
    mesh.castShadow = true;
    body.add(mesh);
  }
  body.scale.setScalar(s);

  // wings: flap pivots on the thorax
  const wings: THREE.Group[] = [];
  const out = new THREE.Group();
  for (const side of [-1, 1] as const) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.12 * s, 0.1 * s, 0.02);
    if (glbWing) {
      const w = glbWing.clone();
      w.scale.x = side; // the GLB is a right wing; mirror for the left (three flips the winding)
      w.scale.multiplyScalar(s);
      pivot.add(w);
    } else pivot.add(wing(side, s));
    out.add(pivot);
    wings.push(pivot);
  }
  body.add(out);
  out.scale.setScalar(1 / s); // wings are already scaled by s

  // the dust veil: a ring of soft puffs and crumbs round it — see-through, so the moth reads inside
  const veil = new THREE.Group();
  const veilMat = new THREE.MeshStandardMaterial({ color: '#c9c2dc', transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
  const rr = rng(3);
  const puffs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rr() * 0.4, b = (rr() - 0.5) * 1.6;
    const g = new THREE.IcosahedronGeometry((0.1 + rr() * 0.09) * s, 1);
    puffs.push((g.index ? g.toNonIndexed() : g).translate(Math.cos(a) * 1.05 * s * Math.cos(b * 0.5), b * 0.5 * s, Math.sin(a) * 0.95 * s * Math.cos(b * 0.5)));
  }
  puffs.forEach((g) => { for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); });
  veil.add(new THREE.Mesh(mergeGeometries(puffs)!, veilMat));
  const crumbs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const a = rr() * Math.PI * 2, b = (rr() - 0.5) * 2;
    const g = new THREE.DodecahedronGeometry((0.045 + rr() * 0.05) * s, 0);
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    crumbs.push(n.translate(Math.cos(a) * 0.75 * s, b * 0.45 * s, Math.sin(a) * 0.75 * s));
  }
  veil.add(new THREE.Mesh(mergeGeometries(crumbs)!, crumbMat));
  veil.traverse((o) => (o.userData.noPaint = true));
  return { body, wings, veil, veilMat };
}

// ───────────────────────── BOSS PIECES ─────────────────────────

/** Vertex colours for the bell: lilac crown → violet belly → pink rim, with darker radial ribs. */
export function colourBell(g: THREE.BufferGeometry, radius: number): void {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const top = new THREE.Color('#b5a8f5'), mid = new THREE.Color('#8f86c8'), rim = new THREE.Color('#c473b8'), rib = new THREE.Color('#6f63b8');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = Math.min(1, Math.max(0, 1 - y / radius)); // 0 top → 1 rim
    c.copy(top).lerp(mid, Math.min(1, t * 2));
    if (t > 0.5) c.lerp(rim, (t - 0.5) * 2);
    const rib14 = Math.pow(Math.max(0, Math.cos(Math.atan2(z, x) * 14)), 6);
    c.lerp(rib, rib14 * 0.55 * Math.min(1, t * 3));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Eraser-crumb spots + a scalloped ruffle for the bell (unscaled bell space: radius R, rim at yRim). */
export function bellDecor(R: number, yRim: number): { spots: THREE.Mesh; ruffle: THREE.Mesh } {
  const P = new Parts();
  const r = rng(5);
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2, phi = 0.12 + r() * 0.85;
    const d = new THREE.Vector3(Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a));
    const rad = 0.1 + r() * 0.17;
    P.add(new THREE.SphereGeometry(rad, 8, 6), i % 4 ? '#f6f1ff' : '#ffc6dc', new THREE.Matrix4().compose(d.clone().multiplyScalar(R * 0.995), pointing(d), new THREE.Vector3(1, 0.35, 1)));
  }
  const spots = new THREE.Mesh(mergeGeometries(P.geos)!, vcMat());
  const F = new Parts();
  const N = 26;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    F.add(new THREE.SphereGeometry(0.3, 10, 8), i % 2 ? '#ff7a6b' : '#ff9a86', xf(Math.cos(a) * (R * 0.96 + 0.05), yRim, Math.sin(a) * (R * 0.96 + 0.05), 0, 0, [1, 0.8, 1]));
  }
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    F.add(new THREE.SphereGeometry(0.17, 8, 6), '#fff1dc', xf(Math.cos(a) * (R * 0.9), yRim - 0.2, Math.sin(a) * (R * 0.9)));
  }
  const ruffle = new THREE.Mesh(mergeGeometries(F.geos)!, vcMat());
  addOutline(ruffle, 0.03);
  return { spots, ruffle };
}

/** Radiating spikes round the glowing core (share the core's material so they throb together). */
export function coreSpikes(mat: THREE.Material): THREE.Mesh {
  const gs: THREE.BufferGeometry[] = [];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, rr = Math.sqrt(1 - y * y), a = i * 2.399963;
    const d = new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const g = new THREE.ConeGeometry(0.17, 0.5, 5).toNonIndexed();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    gs.push(g.applyMatrix4(mat4(d.clone().multiplyScalar(1.05), pointing(d))));
  }
  return new THREE.Mesh(mergeGeometries(gs)!, mat);
}

/** A tentacle segment: tapered tube with a cream sucker-band at the top (k = segment index, 0..5). */
export function tentacleSegment(k: number, body: THREE.Material, tip: THREE.Material, band: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const r0 = 0.27 - k * 0.032, r1 = 0.24 - k * 0.032;
  const m = new THREE.Mesh(lathe([[0.001, 0], [r0, -0.02], [r1, -0.72], [r1 * 0.9, -0.78], [0.001, -0.8]].map(([r, y]) => [r, y] as [number, number]).reverse(), 8), k === 5 ? tip : body);
  addOutline(m, 0.02);
  g.add(m);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r0 * 1.02, 0.045, 5, 10).rotateX(Math.PI / 2), band);
  ring.position.y = -0.04;
  g.add(ring);
  if (k === 5) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), tip);
    bulb.position.y = -0.82;
    addOutline(bulb, 0.025);
    g.add(bulb);
  }
  return g;
}

/** Puffs for the boss's dust shroud: see-through gaps let the bell and face show through. */
export function shroudPuffs(R: number, mat: THREE.Material): THREE.Mesh {
  const r = rng(9);
  const gs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40 && gs.length < 14; i++) {
    const a = r() * Math.PI * 2, b = (r() - 0.35) * 2.3;
    if (Math.sin(a) > 0.3 && b > -0.2) continue; // keep the face (front, +Z) clear
    const g = new THREE.IcosahedronGeometry(0.4 + r() * 0.4, 1);
    const n = g.toNonIndexed();
    for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
    gs.push(n.translate(Math.cos(a) * R * Math.cos(b * 0.55), b * R * 0.62, Math.sin(a) * R * Math.cos(b * 0.55)));
  }
  return new THREE.Mesh(mergeGeometries(gs)!, mat);
}
