import * as THREE from 'three';
import { ni } from '../render/geom';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import { toon } from '../render/Materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * BLIND PLAZA v3 terrain: a torn chunk of painted canvas floating in the sky.
 *
 *   x → east, z → south. Tiers (y):
 *   harbor 0 · hub 1.5 · terrace 4.5 · canal towpath −2.5 / water −4 · west bank 0 · bastion 3
 *   Sleepy Cliff (hub → plateau, 1.5 → 12) · switchback road 1.5 → 12 · plateau 12 · summit 14
 *   Crossed-Out Quarter (east high ground) 13, reached by a sunken lane from hairpin 2 (8.5)
 *
 * One height function drives the render mesh, the trimesh collider and every
 * prop's placement (groundAt), so nothing ever floats or sinks.
 */

// (west / east / north bulges keep every house's footprint on solid ground — no walls hanging over the void)
export const ISLAND: [number, number][] = [
  [-56, -14], [-50, -36], [-34, -52], [-12, -58.5], [10, -58], [30, -53], [46, -42], [56, -22],
  [58, 4], [56.5, 26], [42, 36], [24, 42], [9, 47], [-4, 48], [-16, 46], [-30, 41], [-40, 41], [-54, 37], [-59, 23], [-57.5, 8],
];

export const Y = { harbor: 0, hub: 1.5, terrace: 4.5, towpath: -2.5, water: -4, bed: -5.2, bank: 0, bastion: 3, plateau: 12, summit: 14, roof: 9 };

/** Canal centreline (gentle curve). */
export const gorgeX = (z: number) => -37 + z * 0.03 + Math.sin(z * 0.08) * 1.2;
export const GORGE = { z0: -18, z1: 44, halfWater: 4.4, towpath: 2.8 };
export const BASTION = { x: -48, z: -5, rx: 7, rz: 9 };
export const SUMMIT = { x: 0, z: -43, r: 9.5 };

/** Switchback road legs (x range, z range, height at z0 → z1). */
export const LEGS = [
  { x0: 9.5, x1: 14.5, z0: -18, z1: -34, y0: 1.5, y1: 5.0 },
  { x0: 15.5, x1: 20.5, z0: -34, z1: -21, y0: 5.0, y1: 8.5 },
  { x0: 21.5, x1: 26.5, z0: -21, z1: -36, y0: 8.5, y1: 12.0 },
];
export const HAIRPINS = [
  { x0: 9.5, x1: 20.5, z0: -37, z1: -34, y: 5.0 },
  { x0: 15.5, x1: 26.5, z0: -21, z1: -18, y: 8.5 },
];
/** The three erased stretches of road (one per Guardian). */
export const GAPS = LEGS.map((l) => ({ x0: l.x0 - 0.2, x1: l.x1 + 0.2, z0: -31, z1: -24.5 }));

/**
 * THE CROSSED-OUT QUARTER (level-1 expansion, see docs/level1-expansion): the east high ground.
 * A sunken lane leaves the road's second hairpin, climbs north, and comes up into the quarter.
 * The Red Pen struck a line through the quarter's street: the canvas tore along it (TEAR, a hole).
 */
export const QUARTER = {
  y: 13,
  /** lane landing, level with hairpin 2 */
  landing: { x0: 26.4, x1: 30.6, z0: -21, z1: -18.6 },
  /** lane ramp: z -21 (y 8.5) → z -29.6 (y 13) */
  ramp: { x0: 27.6, x1: 31, z0: -29.6, z1: -21 },
  /** the tear (a hole to the sky) across the Struck Street */
  tear: { x0: 38.5, x1: 44, z0: -42.5, z1: -31 },
};

/** The quarter's sunken lane (null = not on it). */
function laneAt(x: number, z: number): { y: number; zone: Zone } | null {
  const L = QUARTER.landing;
  if (inRect(x, z, L.x0, L.x1, L.z0, L.z1)) return { y: HAIRPINS[1].y, zone: 'road' };
  const R = QUARTER.ramp;
  if (inRect(x, z, R.x0, R.x1, R.z0, R.z1)) return { y: HAIRPINS[1].y + ((R.z1 - z) / (R.z1 - R.z0)) * (QUARTER.y - HAIRPINS[1].y), zone: 'road' };
  return null;
}

/** Inside the tear across the Struck Street? */
export const inTear = (x: number, z: number) => inRect(x, z, QUARTER.tear.x0, QUARTER.tear.x1, QUARTER.tear.z0, QUARTER.tear.z1);

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);

function legY(i: number, z: number): number {
  const l = LEGS[i];
  const t = THREE.MathUtils.clamp((z - l.z0) / (l.z1 - l.z0), 0, 1);
  return l.y0 + (l.y1 - l.y0) * t;
}

export type Zone = 'cobble' | 'road' | 'grass' | 'towpath' | 'bed' | 'stone';

/** The island's ground height (no props). */
export function heightAt(x: number, z: number): { y: number; zone: Zone } {
  // ── hill (north of the Sleepy Cliff) ──
  if (z < -18) {
    const lane = laneAt(x, z);
    if (lane) return lane;
    if (Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r) return { y: Y.summit, zone: 'cobble' };
    // summit stairs (plateau 12 → summit 14) on its south side
    if (inRect(x, z, -3, 3, -34.5, -30)) return { y: Y.plateau + ((-30 - z) / 4.5) * 2, zone: 'road' };
    if (inRect(x, z, 8, 27.5, -40, -18)) {
      for (let i = 0; i < 3; i++) {
        const l = LEGS[i];
        if (inRect(x, z, l.x0, l.x1, l.z0, l.z1)) return { y: legY(i, z), zone: 'road' };
      }
      for (const h of HAIRPINS) if (inRect(x, z, h.x0, h.x1, h.z0, h.z1)) return { y: h.y, zone: 'road' };
      if (inRect(x, z, 21.5, 26.5, -40, -36)) return { y: Y.plateau, zone: 'road' };
      // the shelf beyond the first hairpin joins the road's top to the upper town
      if (z < -37) return { y: Y.plateau, zone: x > 21.5 ? 'road' : 'cobble' };
      // banks between legs: a raised grassy hedge (higher than both sides → no shortcuts)
      if (x < 9.5) return { y: Y.plateau, zone: 'grass' };
      const between = x < 15.5 ? [0, 1] : x < 21.5 ? [1, 2] : [2, 2];
      const top = Math.max(legY(between[0], z), legY(between[1], z));
      return { y: Math.min(Y.plateau + 1, top + 1.3), zone: 'grass' };
    }
    if (x > 27.5) return { y: QUARTER.y, zone: 'cobble' }; // the Crossed-Out Quarter's streets
    return { y: Y.plateau, zone: x > -8 && x < 8 && z > -34 ? 'cobble' : 'grass' };
  }
  // ── canal gorge + west bank ──
  const gx = gorgeX(z);
  if (z > GORGE.z0 && z < GORGE.z1) {
    const d = x - gx;
    if (Math.abs(d) < GORGE.halfWater) return { y: Y.bed, zone: 'bed' };
    if (d > 0 && d < GORGE.halfWater + GORGE.towpath && z > -15 && z < 38) return { y: Y.towpath, zone: 'towpath' };
  }
  if (x < gx - GORGE.halfWater) {
    const e = ((x - BASTION.x) / BASTION.rx) ** 2 + ((z - BASTION.z) / BASTION.rz) ** 2;
    if (e < 1) return { y: Y.bastion, zone: 'stone' };
    // ramp up to the bastion from the south
    if (inRect(x, z, BASTION.x - 2, BASTION.x + 2, BASTION.z + BASTION.rz - 0.5, BASTION.z + BASTION.rz + 6)) {
      const t = (z - (BASTION.z + BASTION.rz - 0.5)) / 6.5;
      return { y: Y.bastion * (1 - t), zone: 'road' };
    }
    return { y: Y.bank, zone: 'cobble' };
  }
  // ── east workyard terrace + its ramp ──
  if (inRect(x, z, 19, 23, 8, 22)) return { y: Y.hub + ((22 - z) / 14) * (Y.terrace - Y.hub), zone: 'road' };
  if (x > 19 && z > -10) return { y: Y.terrace, zone: 'cobble' };
  if (x > 27.5 && z <= -10) return { y: QUARTER.y, zone: 'cobble' }; // the quarter (Inkwell Square)
  // ── harbor + steps ──
  if (inRect(x, z, -13, 7, 27, 50)) return { y: Y.harbor, zone: 'cobble' };
  if (inRect(x, z, -13, 7, 24, 27)) return { y: Y.hub - ((z - 24) / 3) * Y.hub, zone: 'cobble' };
  // ── hub (default) ──
  return { y: Y.hub, zone: 'cobble' };
}

function pointInPoly(x: number, z: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function closestOnPoly(x: number, z: number, poly: [number, number][]): [number, number] {
  let best: [number, number] = [x, z];
  let bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i];
    const [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dz = bz - az;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = ax + dx * t, pz = az + dz * t;
    const d = (px - x) ** 2 + (pz - z) ** 2;
    if (d < bd) {
      bd = d;
      best = [px, pz];
    }
  }
  return best;
}

export function onIsland(x: number, z: number): boolean {
  return pointInPoly(x, z, ISLAND);
}

const inGap = (x: number, z: number) => GAPS.some((g) => inRect(x, z, g.x0, g.x1, g.z0, g.z1)) || inTear(x, z);

export interface BuiltTerrain {
  groundAt(x: number, z: number): number;
  meshes: THREE.Mesh[];
}

/**
 * Build the island: textured ground (flat zones + painted cliffs), one trimesh
 * collider, the torn-canvas rim with drips, the rocky underside and the canal water.
 */
export function buildTerrain(ctx: GameContext): BuiltTerrain {
  const { root, physics, assets } = ctx;
  const STEP = 0.75;
  const X0 = -60, X1 = 60, Z0 = -60, Z1 = 58;
  const nx = Math.round((X1 - X0) / STEP) + 1;
  const nz = Math.round((Z1 - Z0) / STEP) + 1;
  const V = new Float32Array(nx * nz * 3);
  const inside = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      let x = X0 + i * STEP;
      let z = Z0 + j * STEP;
      const k = j * nx + i;
      if (onIsland(x, z)) inside[k] = 1;
      else [x, z] = closestOnPoly(x, z, ISLAND); // snap the rim onto the outline (smooth edge)
      const inward = inside[k] ? 0 : 0.6;
      const h = heightAt(x + (inward ? Math.sign(-x) * inward : 0), z + (inward ? Math.sign(-z) * inward : 0)).y;
      V[k * 3] = x;
      V[k * 3 + 1] = h;
      V[k * 3 + 2] = z;
    }

  // per-zone flat triangles + one cliff bucket (non-indexed, world-space UVs)
  const buckets = new Map<string, { p: number[]; n: number[]; uv: number[] }>();
  const bucket = (k: string) => {
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { p: [], n: [], uv: [] }));
    return b;
  };
  const colP: number[] = [];
  const colI: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  const pushTri = (ia: number, ib: number, ic: number) => {
    if (!inside[ia] && !inside[ib] && !inside[ic]) return;
    a.fromArray(V, ia * 3);
    b.fromArray(V, ib * 3);
    c.fromArray(V, ic * 3);
    const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
    // rim triangles (snapped onto the outline) survive if their middle is still on the island
    if (!onIsland(cx * 0.995, cz * 0.995)) return;
    if (inGap(cx, cz)) return; // erased road: a hole to the sky
    nrm.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
    if (nrm.y < 0) nrm.negate();
    const steep = nrm.y < 0.62;
    const base = colP.length / 3;
    colP.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    colI.push(base, base + 1, base + 2);
    // hedge-cliff shards leaning into an erased stretch: the pit's own walls draw that face (collider kept)
    if (steep && GAPS.some((g) => inRect(cx, cz, g.x0 - 0.45, g.x1 + 0.45, g.z0, g.z1))) return;
    const zone = heightAt(cx, cz).zone;
    // 12 m tiles: small meshes paint cheaply (no runtime chunk splitting → no hitches)
    const tile = `${Math.floor(cx / 12)}_${Math.floor(cz / 12)}`;
    const key = (steep ? 'cliff' : zone) + '|' + tile;
    const bk = bucket(key);
    for (const v of [a, b, c]) {
      bk.p.push(v.x, v.y, v.z);
      bk.n.push(nrm.x, nrm.y, nrm.z);
      if (steep) {
        // cliffs: project on the most facing vertical plane
        const u = Math.abs(nrm.x) > Math.abs(nrm.z) ? v.z : v.x;
        bk.uv.push(u / 6, v.y / 6);
      } else bk.uv.push(v.x / (zone === 'road' ? 3 : 5), v.z / (zone === 'road' ? 3 : 5));
    }
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      // alternate the diagonal so slopes don't show a single grain
      if ((i + j) % 2) {
        pushTri(k, k + nx, k + 1);
        pushTri(k + 1, k + nx, k + nx + 1);
      } else {
        pushTri(k, k + nx, k + nx + 1);
        pushTri(k, k + nx + 1, k + 1);
      }
    }

  const T = (n: string, tint?: string) => {
    const t = assets.tex(n).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return toon({ map: t, color: tint });
  };
  const mats: Record<string, THREE.Material> = {
    cobble: T('ground'),
    road: T('terrace', '#ffe9d6'),
    grass: T('hill'),
    towpath: T('terrace', '#d6c8ff'),
    bed: T('stone_purple', '#5b3b8f'),
    stone: T('stone_cream'),
    cliff: cliffMaterial(ctx),
  };
  const meshes: THREE.Mesh[] = [];
  for (const [k, bk] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bk.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bk.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bk.uv, 2));
    g.computeVertexNormals();
    const kind = k.split('|')[0];
    const m = new THREE.Mesh(g, mats[kind] ?? mats.cobble);
    m.receiveShadow = true;
    m.castShadow = kind === 'cliff' || kind === 'grass';
    m.name = `terrain-${k}`;
    root.add(m);
    meshes.push(m);
  }
  const col = physics.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(colP), new Uint32Array(colI)));
  physics.tag(col, 'static');

  buildRim(ctx);
  buildWater(ctx);

  const groundAt = (x: number, z: number) => heightAt(x, z).y;
  return { groundAt, meshes };
}

/** The painted-strata cliff material (terrain cliffs; the erased road's pit sides match it). */
export function cliffMaterial(ctx: GameContext): THREE.Material {
  return toon({ map: strataTexture(ctx.assets.tex('stone_orange'), ['#ffd08a', '#ff8fb8', '#ffb070', '#c9a8ff'], 5), color: '#ffd2c2' });
}

/** Densified island outline with outward normals (rim, edge dressing). */
export function outlinePoints(spacing = 1.2): { x: number; z: number; nx: number; nz: number }[] {
  const pts: [number, number][] = [];
  for (let i = 0; i < ISLAND.length; i++) {
    const [ax, az] = ISLAND[i];
    const [bx, bz] = ISLAND[(i + 1) % ISLAND.length];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / spacing));
    for (let k = 0; k < n; k++) pts.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  return pts.map(([x, z], i) => {
    const [px, pz] = pts[(i - 1 + pts.length) % pts.length];
    const [qx, qz] = pts[(i + 1) % pts.length];
    let nx = qz - pz, nz = -(qx - px);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    if (nx * x + nz * z < 0) (nx = -nx), (nz = -nz);
    return { x, z, nx, nz };
  });
}

/**
 * Painted strata: the base stone texture with wavy horizontal bands of tint and
 * hand-inked ledge lines (tiles horizontally; one tile = `metres` of height via v = y / metres).
 */
const strataCache = new Map<string, THREE.Texture>();
export function strataTexture(base: THREE.Texture, cols: string[], seed: number, alpha = 0.42): THREE.Texture {
  const key = `${base.name}|${cols.join()}|${seed}|${alpha}`;
  const hit = strataCache.get(key);
  if (hit) return hit.clone();
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = base.image as CanvasImageSource | undefined;
  if (img) g.drawImage(img, 0, 0, S, S);
  else {
    g.fillStyle = '#d07050';
    g.fillRect(0, 0, S, S);
  }
  let sd = seed;
  const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const n = cols.length;
  const edge = (k: number) => {
    const y0 = (k / n) * S + (r() - 0.5) * 18;
    const a1 = 5 + r() * 7, a2 = 2 + r() * 4, p1 = r() * 6.28, p2 = r() * 6.28;
    const f1 = 1 + Math.floor(r() * 3), f2 = 4 + Math.floor(r() * 4);
    return (x: number) => y0 + a1 * Math.sin((x / S) * Math.PI * 2 * f1 + p1) + a2 * Math.sin((x / S) * Math.PI * 2 * f2 + p2);
  };
  const edges = cols.map((_, k) => edge(k));
  edges.push((x: number) => edges[0](x) + S);
  for (let k = 0; k < n; k++) {
    g.save();
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = alpha;
    g.fillStyle = cols[k];
    for (const off of [-S, 0]) {
      g.beginPath();
      for (let x = 0; x <= S; x += 8) g.lineTo(x, edges[k](x) + off);
      for (let x = S; x >= 0; x -= 8) g.lineTo(x, edges[k + 1](x) + off);
      g.closePath();
      g.fill();
    }
    g.restore();
  }
  // ledge lines: a dark inked crack with a pale lip just under it, broken here and there
  for (let k = 0; k < n; k++) {
    for (const [col, w, dy, alpha] of [['#2a1630', 3.2, 0, 0.7], ['#fff1dc', 2.2, 4, 0.45]] as [string, number, number, number][]) {
      g.strokeStyle = col;
      g.globalAlpha = alpha;
      g.lineCap = 'round';
      let x = 0;
      while (x < S) {
        const len = 40 + r() * 140;
        g.lineWidth = w * (0.7 + r() * 0.6);
        g.beginPath();
        for (let xx = x; xx <= Math.min(S, x + len); xx += 6) g.lineTo(xx, edges[k](xx) + dy);
        g.stroke();
        x += len + 6 + r() * 26;
      }
    }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.name = key;
  strataCache.set(key, t);
  return t.clone();
}

/** Torn canvas edge: stepped paint strata, a paper lip, hanging drips and a craggy rock underside. */
function buildRim(ctx: GameContext): void {
  const { root, assets } = ctx;
  const pts = outlinePoints(1.2);
  const n = pts.length;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // smooth per-point noise (no saw-tooth): a few sines around the outline
  const wob = (i: number, k: number) => {
    const a = (i / n) * Math.PI * 2;
    return Math.sin(a * 7 + k * 1.3) * 0.5 + Math.sin(a * 19 + k * 2.1) * 0.3 + Math.sin(a * 43 + k) * 0.2;
  };
  // stepped strata profile: [fraction of the wall's depth, outward offset]
  const PROF: [number, number][] = [
    [0, 0], [0.06, 0.22], [0.09, -0.35], [0.22, -0.1], [0.25, -0.75], [0.42, -0.45], [0.45, -1.2], [0.62, -0.9], [0.65, -1.7], [0.82, -1.5], [0.85, -2.3], [1, -3.2],
  ];
  const R = PROF.length;
  const VBAND = [0, 0.13, 0.2, 0.33, 0.4, 0.53, 0.6, 0.73, 0.8, 0.93, 1.0, 1.2];
  const P: number[] = [], UV: number[] = [], I: number[] = [];
  const lipP: number[] = [], lipI: number[] = [];
  const tops: number[] = [], bottoms: number[] = [];
  pts.forEach(({ x, z, nx, nz }, i) => {
    const top = heightAt(x - nx * 0.8, z - nz * 0.8).y;
    const bottom = Math.min(top, 0) - 7 - (wob(i, 3) * 0.5 + 0.5) * 4 - rnd() * 0.8;
    tops.push(top);
    bottoms.push(bottom);
    const D = top - bottom;
    for (let k = 0; k < R; k++) {
      const [f, o] = PROF[k];
      const off = o + (k ? wob(i, k) * 0.35 : 0);
      const y = top - D * f + (k && k < R - 1 ? wob(i, k + 9) * 0.25 : 0);
      P.push(x + nx * off, y, z + nz * off);
      UV.push(i * 0.24, -VBAND[k]); // one painted stratum per ledge
    }
    // torn paper lip: slightly outward and ragged
    const out = 0.25 + rnd() * 0.35;
    lipP.push(x, top + 0.07, z, x + nx * out, top - 0.15 - rnd() * 0.25, z + nz * out);
  });
  for (let i = 0; i < n; i++) {
    const a = i * R, b = ((i + 1) % n) * R;
    for (let k = 0; k < R - 1; k++) I.push(a + k, a + k + 1, b + k, b + k, a + k + 1, b + k + 1);
    const la = i * 2, lb = ((i + 1) % n) * 2;
    lipI.push(la, la + 1, lb, lb, la + 1, lb + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  const strata = strataTexture(assets.tex('stone_pink'), ['#ffd08a', '#ff8fb8', '#b79cff', '#ffb070', '#8fd8d0'], 11, 0.62);
  strata.repeat.set(1, 1);
  const wall = new THREE.Mesh(g, toon({ map: strata, color: '#ffc9a8' }));
  (wall.material as THREE.Material).side = THREE.DoubleSide;
  wall.userData.noPaint = true;
  wall.name = 'island-rim';
  root.add(wall);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lipP, 3));
  lg.setIndex(lipI);
  lg.computeVertexNormals();
  const lip = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 1, side: THREE.DoubleSide }));
  lip.userData.noPaint = true;
  root.add(lip);

  // underside: a craggy inverted mountain with hanging lobes, rings from the wall's foot to a tip
  const TIP = new THREE.Vector3(0, -44, 4);
  const RINGS = 8;
  const UP: number[] = [], UUV: number[] = [], UI: number[] = [];
  const lastRing = R - 1;
  for (let i = 0; i < n; i++) {
    const bx = P[(i * R + lastRing) * 3], by = P[(i * R + lastRing) * 3 + 1], bz = P[(i * R + lastRing) * 3 + 2];
    const ang = Math.atan2(pts[i].z, pts[i].x);
    const lobe = Math.max(0, Math.sin(ang * 3 + 1) * 0.6 + Math.sin(ang * 7 + 2) * 0.45 + Math.sin(ang * 13) * 0.2);
    for (let r = 0; r <= RINGS; r++) {
      const s = r / RINGS;
      const e = 1 - Math.pow(1 - s, 1.6); // pull in fast, then taper
      const x = bx + (TIP.x - bx) * e;
      const z = bz + (TIP.z - bz) * e;
      let y = by + (TIP.y - by) * Math.pow(s, 1.25);
      y -= lobe * Math.sin(Math.PI * s) * 9; // hanging lobes
      y += Math.sin(i * 0.9 + r * 2.3) * 0.6 * Math.sin(Math.PI * s); // crag noise
      const shrink = 1 + Math.sin(i * 1.7 + r) * 0.04 * Math.sin(Math.PI * s);
      UP.push(x * shrink, y, z * shrink);
      UUV.push(x / 7 + y / 13, z / 7 + y / 17); // planar-ish: no radial stretching
    }
  }
  const RR = RINGS + 1;
  for (let i = 0; i < n; i++) {
    const a = i * RR, b = ((i + 1) % n) * RR;
    for (let r = 0; r < RINGS; r++) UI.push(a + r, b + r, a + r + 1, b + r, b + r + 1, a + r + 1);
  }
  const under = new THREE.BufferGeometry();
  under.setAttribute('position', new THREE.Float32BufferAttribute(UP, 3));
  under.setAttribute('uv', new THREE.Float32BufferAttribute(UUV, 2));
  under.setIndex(UI);
  under.computeVertexNormals();
  // hanging rock teeth (merged into the same mesh)
  const parts: THREE.BufferGeometry[] = [ni(under)];
  for (let k = 0; k < 22; k++) {
    const i = Math.floor(rnd() * n);
    const r = 2 + Math.floor(rnd() * 4);
    const v = (i * RR + r) * 3;
    const len = 4 + rnd() * 9;
    const cone = new THREE.ConeGeometry(1.2 + rnd() * 1.8, len, 6, 2);
    cone.rotateX(Math.PI);
    cone.rotateY(rnd() * 3);
    cone.translate(UP[v], UP[v + 1] - len / 2 + 1.2, UP[v + 2]);
    parts.push(ni(cone));
  }
  const underG = mergeGeometries(parts.map((p) => {
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k);
    return p;
  }))!;
  const rockTex = strataTexture(assets.tex('stone_purple'), ['#c9a8ff', '#ff9ec4', '#9a7ad8', '#ffd08a'], 23);
  const underMesh = new THREE.Mesh(underG, toon({ map: rockTex, color: '#a58ad0' }));
  (underMesh.material as THREE.Material).side = THREE.DoubleSide;
  underMesh.userData.noPaint = true;
  underMesh.name = 'island-underside';
  root.add(underMesh);

  // paint drips hanging off the rim (one merged, vertex-coloured mesh instead of ~200 draw calls)
  const cols = ['#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a', '#2a4be0'].map((c) => new THREE.Color(c));
  const drips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 3) {
    const { nx, nz } = pts[i];
    const len = 2 + rnd() * 9;
    const rad = 0.18 + rnd() * 0.2;
    // hang from the receding foot of the wall (not inside it, not out in the air)
    const v = (i * R + R - 1) * 3;
    const fx = P[v] + nx * 0.15, fz = P[v + 2] + nz * 0.15;
    const y = bottoms[i] + 1.5 - len / 2 + rnd() * 2;
    const d = ni(new THREE.CylinderGeometry(rad, 0.05, len, 6));
    d.translate(fx, y, fz);
    const blob = ni(new THREE.SphereGeometry(0.28, 8, 6));
    blob.scale(1, 1.3, 1);
    blob.translate(fx, y - len / 2, fz);
    for (const geo of [d, blob]) {
      geo.deleteAttribute('uv');
      const c = cols[(i / 3) % 5 | 0];
      const ca = new Float32Array(geo.attributes.position.count * 3);
      for (let v = 0; v < ca.length; v += 3) (ca[v] = c.r), (ca[v + 1] = c.g), (ca[v + 2] = c.b);
      geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      drips.push(geo);
    }
  }
  const dm = new THREE.Mesh(mergeGeometries(drips)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
  dm.userData.noPaint = true;
  dm.name = 'rim-drips';
  root.add(dm);
  void tops;
}

/** Where the canal's centre line leaves the island (its waterfall). */
function canalExitZ(): number {
  for (let z = 30; z < GORGE.z1 + 6; z += 0.1) if (!onIsland(gorgeX(z), z)) return z;
  return GORGE.z1;
}

function buildWater(ctx: GameContext): void {
  const P: number[] = [];
  const I: number[] = [];
  const segs = 60;
  // the water stops at the torn edge (it used to run 3 m out over the void)
  const zEnd = canalExitZ() + 0.35;
  let lastL = new THREE.Vector3(), lastR = new THREE.Vector3();
  for (let k = 0; k <= segs; k++) {
    const z = GORGE.z0 + ((zEnd - GORGE.z0) * k) / segs;
    const gx = gorgeX(z);
    const ends: THREE.Vector3[] = [];
    for (const x of [gx - GORGE.halfWater - 0.3, gx + GORGE.halfWater + 0.3]) {
      if (onIsland(x, z)) ends.push(new THREE.Vector3(x, Y.water, z));
      else {
        const [sx, sz] = closestOnPoly(x, z, ISLAND);
        ends.push(new THREE.Vector3(sx, Y.water, sz));
      }
    }
    P.push(ends[0].x, Y.water, ends[0].z, ends[1].x, Y.water, ends[1].z);
    lastL = ends[0];
    lastR = ends[1];
    if (k < segs) {
      const a = k * 2;
      I.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#2fb8d6', roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88, side: THREE.DoubleSide });
  const water = new THREE.Mesh(g, mat);
  water.userData.noPaint = true;
  water.name = 'canal-water';
  ctx.root.add(water);
  // the canal pours off the island's edge: a waterfall hanging from the lip, bowing outward as it falls
  const out = new THREE.Vector3(0, 0, 1);
  const FP: number[] = [], FI: number[] = [];
  const cols = 8, rows = 14, H = 30;
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      const p = lastL.clone().lerp(lastR, 0.08 + u * 0.84);
      const narrow = (u - 0.5) * t * 2.2; // the sheet pinches in as it falls
      const bow = Math.sin(Math.min(1, t * 3) * Math.PI * 0.5) * 2.2 + t * 1.5;
      FP.push(p.x - narrow * (lastR.x - lastL.x) / 8.8, Y.water - 0.05 - t * H + Math.sin(u * 9 + t * 5) * 0.15, p.z + out.z * bow + Math.sin(u * 7) * 0.2 * t);
      if (r < rows && c < cols) {
        const a = r * (cols + 1) + c;
        FI.push(a, a + cols + 1, a + 1, a + 1, a + cols + 1, a + cols + 2);
      }
    }
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3));
  fg.setIndex(FI);
  fg.computeVertexNormals();
  const fall = new THREE.Mesh(fg, mat);
  fall.userData.noPaint = true;
  fall.name = 'canal-waterfall';
  ctx.root.add(fall);
}
