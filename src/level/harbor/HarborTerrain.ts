/**
 * [INPUT]: depends on three; ni from render/geom; RAPIER (trimesh collider) from core/PhysicsWorld; toon from
 *          render/Materials; strataTexture from ../Terrain
 * [OUTPUT]: exports HY, DUSK, layout constants (CHANNELS, ARENA, LIGHTHOUSE, ...), channel / water / district queries,
 *           harborHeight(), jettyStair() and the ground builders
 * [POS]: level 2's ground: one height function drives the ground mesh, its trimesh collider and prop placement.
 *        MuteHarbor builds on it. The headland is cut down along the jetty stair (jettyStair()), so the ground
 *        never covers the stair's ramp collider.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import { ni } from '../../render/geom';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER } from '../../core/PhysicsWorld';
import type { GameContext } from '../../core/Context';
import { toon } from '../../render/Materials';
import { strataTexture } from '../Terrain';

/**
 * MUTE HARBOR terrain: the next torn piece of canvas — a harbour town at dusk wrapped around a lagoon.
 *
 *   x → east, z → south. One height function drives the ground mesh, its trimesh collider and every
 *   prop's placement, so nothing floats or sinks (same contract as level 1's Terrain.ts).
 *
 *            NORTH ── headland (y 4): lighthouse + the arena, between the N channel and the NE mouth
 *   WEST ── Old Town quay (y 1.5) → stairs → Clock Square plateau (y 5)
 *   CENTRE ── the lagoon (water −1.2) · its channels run out over the torn edge (waterfalls)
 *   SOUTH ── arrival pier → landing (y 0.6) → bell gate → market quay (y 0.6)
 *   EAST ── boardwalk (y 1.2) → net-shed terrace (y 3) (optional: secrets)
 */

export const HY = { water: -1.2, bed: -3.2, quay: 0.6, oldQuay: 1.5, square: 5, headland: 4, board: 1.2, terrace: 3, jetty: 0.9 };

/** Dusk palette: teal · indigo · coral · neon pink (+ the game's graffiti yellow). */
export const DUSK = {
  teal: '#1fb5b0',
  deepTeal: '#0f6f78',
  indigo: '#3a2f8f',
  night: '#231b52',
  coral: '#ff7a6b',
  peach: '#ffb38a',
  neon: '#ff3fa4',
  lilac: '#b49cff',
  lamp: '#ffe08a',
  cream: '#ffe9d6',
};

// Island outline (clockwise from the north-west). Big enough for every footprint to sit on ground.
export const HARBOR_ISLAND: [number, number][] = [
  [-56, -30], [-48, -50], [-30, -58], [-14, -60], [4, -62], [22, -60], [36, -58], [50, -46], [58, -24], [60, 2], [56, 24], [44, 38], [26, 46],
  [12, 50], [-6, 50], [-22, 52], [-36, 46], [-50, 36], [-58, 16], [-60, -8],
];

/** Water: the lagoon (ellipse) + three channels (capsules) that run out over the edge. */
export const LAGOON = { x: 0, z: -6, rx: 14, rz: 11 };
export const CHANNELS = {
  west: { ax: -12, az: -2, bx: -24, bz: 62, half: 4 },
  north: { ax: -6, az: -12, bx: -14, bz: -72, half: 4 },
  mouth: { ax: 10, az: -12, bx: 50, bz: -66, half: 4.5 },
};
/** The pontoon (boats that come home) crosses the west channel here. */
export const PONTOON_Z = 16;
/** The Bell Bridge crosses the north channel here. */
export const BELL_BRIDGE_Z = -30;
export const SQUARE = { x: -32, z: -24, r: 13 };
export const ARENA = { x: 9, z: -37, r: 9.5 };
export const LIGHTHOUSE = { x: 13, z: -51, r0: 3.4, r1: 2.8, top: 16.5 };

const inRect = (x: number, z: number, x0: number, x1: number, z0: number, z1: number) => x >= Math.min(x0, x1) && x <= Math.max(x0, x1) && z >= Math.min(z0, z1) && z <= Math.max(z0, z1);

/**
 * The jetty stair: headland top → jetty foot along +x at the arena's z (width 2.4 m; MuteHarbor builds it).
 * 5.2 m run for 3.1 m drop (31°). The old 3.2 m run (44°) was too steep for a slow walk: the controller's ground
 * snap (−1.5 m/s) beats a walk under 1.45 m/s on it.
 */
export function jettyStair(): { top: THREE.Vector3; foot: THREE.Vector3 } {
  const bankX = channelX(CHANNELS.mouth, ARENA.z) - CHANNELS.mouth.half;
  return { top: new THREE.Vector3(bankX - 4.6, HY.headland, ARENA.z), foot: new THREE.Vector3(bankX + 0.6, HY.jetty, ARENA.z) };
}
const JETTY = jettyStair();

/** Signed-ish distance from (x,z) to a channel's centre segment, and the segment parameter t. */
export function channelDist(c: { ax: number; az: number; bx: number; bz: number }, x: number, z: number): { d: number; t: number } {
  const dx = c.bx - c.ax, dz = c.bz - c.az;
  const t = THREE.MathUtils.clamp(((x - c.ax) * dx + (z - c.az) * dz) / (dx * dx + dz * dz), 0, 1);
  return { d: Math.hypot(x - (c.ax + dx * t), z - (c.az + dz * t)), t };
}

/** Centre x of a (mostly north-south) channel at depth z. */
export function channelX(c: { ax: number; az: number; bx: number; bz: number }, z: number): number {
  const t = (z - c.az) / (c.bz - c.az);
  return c.ax + (c.bx - c.ax) * t;
}

/** How far inside the water a point is (>0 = water). */
export function waterDepth(x: number, z: number): number {
  const e = Math.hypot((x - LAGOON.x) / LAGOON.rx, (z - LAGOON.z) / LAGOON.rz);
  let w = (1 - e) * Math.min(LAGOON.rx, LAGOON.rz);
  for (const c of Object.values(CHANNELS)) w = Math.max(w, c.half - channelDist(c, x, z).d);
  return w;
}

export function isWater(x: number, z: number): boolean {
  return waterDepth(x, z) > 0;
}

export type HZone = 'cobble' | 'quay' | 'bed' | 'stone' | 'board' | 'grass' | 'road' | 'plank';

/** Which side of the water a dry point is on. */
export function district(x: number, z: number): 'old' | 'head' | 'market' | 'east' {
  const wx = channelX(CHANNELS.west, z);
  if (z > -14 && x < wx) return 'old';
  if (z <= -14) {
    const nx = channelX(CHANNELS.north, z);
    if (x < nx) return 'old';
    const mx = channelX(CHANNELS.mouth, z);
    if (x < mx) return 'head';
    return 'east';
  }
  // south of the lagoon: market (centre) / east boardwalk
  const mx = channelX(CHANNELS.mouth, Math.min(z, -12));
  return x > 22 || (z < 4 && x > mx) ? 'east' : 'market';
}

/** The island's ground height (no props). */
export function harborHeight(x: number, z: number): { y: number; zone: HZone } {
  if (isWater(x, z)) return { y: HY.bed, zone: 'bed' };
  const dist = district(x, z);
  if (dist === 'old') {
    // clock square plateau + its stairs down to the quay (south-east side)
    const ds = Math.hypot(x - SQUARE.x, z - SQUARE.z);
    if (ds < SQUARE.r) return { y: HY.square, zone: 'cobble' };
    // the road east from the square to the Bell Bridge
    if (inRect(x, z, -24, channelX(CHANNELS.north, BELL_BRIDGE_Z) - CHANNELS.north.half, BELL_BRIDGE_Z - 2.6, BELL_BRIDGE_Z + 2.6)) return { y: HY.square, zone: 'road' };
    // the grand stair: quay (z ≈ 4) → square (z ≈ −11), a ramp under painted steps
    if (inRect(x, z, -33, -27, -12, 2)) return { y: HY.oldQuay + ((2 - z) / 14) * (HY.square - HY.oldQuay), zone: 'road' };
    // the back of the old town (north / west of the square): high ground, houses
    if (z < -8 || x < -46) return { y: HY.square + (z < -40 || x < -48 ? 0.8 : 0), zone: 'grass' };
    return { y: HY.oldQuay, zone: 'quay' };
  }
  if (dist === 'head') {
    // ramp from the bridge landing (y 2.4) up onto the headland plateau
    const bx = channelX(CHANNELS.north, BELL_BRIDGE_Z) + CHANNELS.north.half;
    if (inRect(x, z, bx, bx + 7, BELL_BRIDGE_Z - 2.6, BELL_BRIDGE_Z + 2.6)) return { y: 2.4 + ((x - bx) / 7) * (HY.headland - 2.4), zone: 'road' };
    // the jetty steps (east side, down to the exit jetty on the mouth): the ground drops 35 cm under the stair's
    // ramp. Uncut, the headland's edge lay over the top 1.4 m of the ramp and no walk could climb back up.
    const js = JETTY;
    if (Math.abs(z - js.top.z) < 1.9 && x > js.top.x) {
      const k = (x - js.top.x) / (js.foot.x - js.top.x);
      return { y: Math.min(HY.headland, js.top.y + k * (js.foot.y - js.top.y) - 0.35), zone: 'stone' };
    }
    if (Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r) return { y: HY.headland, zone: 'stone' };
    return { y: HY.headland, zone: z < -44 ? 'grass' : 'cobble' };
  }
  if (dist === 'east') {
    // net-shed terrace (north-east), boardwalk elsewhere; ramp between them
    if (inRect(x, z, 40, 46, -12, -4)) return { y: HY.board + ((-4 - z) / 8) * (HY.terrace - HY.board), zone: 'road' };
    if (z < -12) return { y: HY.terrace, zone: 'grass' };
    return { y: HY.board, zone: 'board' };
  }
  // market + landing (south). The bell-gate wall splits them at z ≈ 32 (props, not terrain).
  // a gentle ramp up to the east boardwalk
  if (inRect(x, z, 16, 22, 14, 26) && x > 16) return { y: HY.quay + ((x - 16) / 6) * (HY.board - HY.quay), zone: 'road' };
  return { y: HY.quay, zone: z > 33 ? 'plank' : 'quay' };
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

export function onHarbor(x: number, z: number): boolean {
  return pointInPoly(x, z, HARBOR_ISLAND);
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

export function harborOutline(spacing = 1.2): { x: number; z: number; nx: number; nz: number }[] {
  const pts: [number, number][] = [];
  const P = HARBOR_ISLAND;
  for (let i = 0; i < P.length; i++) {
    const [ax, az] = P[i];
    const [bx, bz] = P[(i + 1) % P.length];
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

/** Ground textures for the dusk island (the shared painted textures, tinted). */
function groundMats(ctx: GameContext): Record<string, THREE.Material> {
  const T = (n: string, tint?: string, rep = 1) => {
    const t = ctx.assets.tex(n).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    return toon({ map: t, color: tint });
  };
  return {
    cobble: T('ground', '#d9c6ff'),
    quay: T('terrace', '#ffd0c4'),
    road: T('terrace', '#ffe4c8'),
    stone: T('stone_cream', '#c8d8ff'),
    grass: T('hill', '#5fb8a8'),
    board: T('h2_planks'),
    plank: T('h2_planks', '#ffe6f0'),
    bed: T('stone_purple', '#2b2470'),
    cliff: toon({ map: strataTexture(ctx.assets.tex('stone_purple'), ['#5a4bd1', '#1fb5b0', '#ff7a6b', '#b49cff'], 9, 0.5), color: '#c8b8ff' }),
  };
}

export interface HarborTerrainBuilt {
  groundAt(x: number, z: number): number;
}

/** Ground mesh (per-zone tiles), one trimesh collider, the torn rim, the rocky underside, water + waterfalls. */
export function buildHarborTerrain(ctx: GameContext): HarborTerrainBuilt {
  const { root, physics } = ctx;
  const STEP = 0.75;
  const X0 = -62, X1 = 62, Z0 = -64, Z1 = 54;
  const nx = Math.round((X1 - X0) / STEP) + 1;
  const nz = Math.round((Z1 - Z0) / STEP) + 1;
  const V = new Float32Array(nx * nz * 3);
  const inside = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      let x = X0 + i * STEP;
      let z = Z0 + j * STEP;
      const k = j * nx + i;
      if (onHarbor(x, z)) inside[k] = 1;
      else [x, z] = closestOnPoly(x, z, HARBOR_ISLAND);
      const inward = inside[k] ? 0 : 0.6;
      const h = harborHeight(x + (inward ? Math.sign(-x) * inward : 0), z + (inward ? Math.sign(-z) * inward : 0)).y;
      V[k * 3] = x;
      V[k * 3 + 1] = h;
      V[k * 3 + 2] = z;
    }
  const buckets = new Map<string, { p: number[]; n: number[]; uv: number[] }>();
  const bucket = (k: string) => {
    let b = buckets.get(k);
    if (!b) buckets.set(k, (b = { p: [], n: [], uv: [] }));
    return b;
  };
  const colP: number[] = [];
  const colI: number[] = [];
  const waterP: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), tmp = new THREE.Vector3();
  const pushTri = (ia: number, ib: number, ic: number) => {
    if (!inside[ia] && !inside[ib] && !inside[ic]) return;
    a.fromArray(V, ia * 3);
    b.fromArray(V, ib * 3);
    c.fromArray(V, ic * 3);
    const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
    if (!onHarbor(cx * 0.995, cz * 0.995)) return;
    nrm.subVectors(c, b).cross(tmp.subVectors(a, b)).normalize();
    if (nrm.y < 0) nrm.negate();
    const steep = nrm.y < 0.62;
    const base = colP.length / 3;
    colP.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    colI.push(base, base + 1, base + 2);
    const zone = harborHeight(cx, cz).zone;
    // water surface over every cell that touches the lagoon / channels
    if (zone === 'bed' || a.y < HY.water || b.y < HY.water || c.y < HY.water) waterP.push(a.x, HY.water, a.z, b.x, HY.water, b.z, c.x, HY.water, c.z);
    const tile = `${Math.floor(cx / 12)}_${Math.floor(cz / 12)}`;
    const key = (steep ? 'cliff' : zone) + '|' + tile;
    const bk = bucket(key);
    for (const v of [a, b, c]) {
      bk.p.push(v.x, v.y, v.z);
      bk.n.push(nrm.x, nrm.y, nrm.z);
      if (steep) {
        const u = Math.abs(nrm.x) > Math.abs(nrm.z) ? v.z : v.x;
        bk.uv.push(u / 6, v.y / 6);
      } else bk.uv.push(v.x / (zone === 'road' ? 3 : zone === 'board' || zone === 'plank' ? 4 : 5), v.z / (zone === 'road' ? 3 : zone === 'board' || zone === 'plank' ? 2 : 5));
    }
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const k = j * nx + i;
      if ((i + j) % 2) {
        pushTri(k, k + nx, k + 1);
        pushTri(k + 1, k + nx, k + nx + 1);
      } else {
        pushTri(k, k + nx, k + nx + 1);
        pushTri(k, k + nx + 1, k + 1);
      }
    }
  const mats = groundMats(ctx);
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
    m.name = `harbor-terrain-${k}`;
    root.add(m);
  }
  const col = physics.world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(colP), new Uint32Array(colI)));
  physics.tag(col, 'static');

  buildWater(ctx, waterP);
  buildRim(ctx);
  return { groundAt: (x, z) => harborHeight(x, z).y };
}

/** Teal water with a dusk sheen; the channels pour off the torn edge as waterfalls. */
function buildWater(ctx: GameContext, P: number[]): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: '#1aa6b8', emissive: '#14306a', emissiveIntensity: 0.35, roughness: 0.12, metalness: 0.15, transparent: true, opacity: 0.86 });
  const water = new THREE.Mesh(g, mat);
  water.userData.noPaint = true;
  water.name = 'harbor-water';
  water.receiveShadow = true;
  ctx.root.add(water);
  // pink/teal glints drifting on the surface (one merged mesh)
  const glints: THREE.BufferGeometry[] = [];
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 110; i++) {
    const x = -40 + r() * 90, z = -60 + r() * 115;
    if (waterDepth(x, z) < 1 || !onHarbor(x, z)) continue;
    const q = new THREE.PlaneGeometry(0.9 + r() * 1.6, 0.12).rotateX(-Math.PI / 2).rotateY(r() * 0.4 - 0.2);
    q.translate(x, HY.water + 0.03, z);
    glints.push(q);
  }
  if (glints.length) {
    const gm = new THREE.Mesh(mergeGeometries(glints)!, new THREE.MeshBasicMaterial({ color: '#ffb3e0', transparent: true, opacity: 0.55, depthWrite: false }));
    gm.userData.noPaint = true;
    gm.name = 'water-glints';
    ctx.root.add(gm);
  }
  // waterfalls where each channel leaves the island
  for (const c of Object.values(CHANNELS)) {
    let t = 0.3;
    for (; t <= 1; t += 0.005) {
      const x = c.ax + (c.bx - c.ax) * t, z = c.az + (c.bz - c.az) * t;
      if (!onHarbor(x, z)) break;
    }
    const ex = c.ax + (c.bx - c.ax) * t, ez = c.az + (c.bz - c.az) * t;
    const dir = new THREE.Vector3(c.bx - c.ax, 0, c.bz - c.az).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const FP: number[] = [], FI: number[] = [];
    const cols = 8, rows = 14, H = 30;
    for (let rr = 0; rr <= rows; rr++) {
      const k = rr / rows;
      for (let cc = 0; cc <= cols; cc++) {
        const u = cc / cols - 0.5;
        const w = c.half * 1.7 * (1 - k * 0.45);
        const bow = Math.sin(Math.min(1, k * 3) * Math.PI * 0.5) * 2.2 + k * 1.5;
        FP.push(ex + side.x * u * w + dir.x * bow, HY.water - 0.05 - k * H + Math.sin(u * 9 + k * 5) * 0.15, ez + side.z * u * w + dir.z * bow);
        if (rr < rows && cc < cols) {
          const a0 = rr * (cols + 1) + cc;
          FI.push(a0, a0 + cols + 1, a0 + 1, a0 + 1, a0 + cols + 1, a0 + cols + 2);
        }
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(FP, 3));
    fg.setIndex(FI);
    fg.computeVertexNormals();
    const fall = new THREE.Mesh(fg, mat);
    (fall.material as THREE.Material).side = THREE.DoubleSide;
    fall.userData.noPaint = true;
    fall.name = 'harbor-waterfall';
    ctx.root.add(fall);
  }
}

/** Torn canvas edge in dusk strata, a paper lip, drips and a craggy underside. */
function buildRim(ctx: GameContext): void {
  const { root, assets } = ctx;
  const pts = harborOutline(1.2);
  const n = pts.length;
  let seed = 17;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const wob = (i: number, k: number) => {
    const a = (i / n) * Math.PI * 2;
    return Math.sin(a * 7 + k * 1.3) * 0.5 + Math.sin(a * 19 + k * 2.1) * 0.3 + Math.sin(a * 43 + k) * 0.2;
  };
  const PROF: [number, number][] = [[0, 0], [0.06, 0.22], [0.09, -0.35], [0.22, -0.1], [0.25, -0.75], [0.42, -0.45], [0.45, -1.2], [0.62, -0.9], [0.65, -1.7], [0.82, -1.5], [0.85, -2.3], [1, -3.2]];
  const R = PROF.length;
  const VBAND = [0, 0.13, 0.2, 0.33, 0.4, 0.53, 0.6, 0.73, 0.8, 0.93, 1.0, 1.2];
  const P: number[] = [], UV: number[] = [], I: number[] = [];
  const lipP: number[] = [], lipI: number[] = [];
  const bottoms: number[] = [];
  pts.forEach(({ x, z, nx, nz }, i) => {
    let top = harborHeight(x - nx * 0.8, z - nz * 0.8).y;
    if (top < HY.water) top = HY.water - 0.1; // channel mouths: the wall's top sits under the waterfall lip
    const bottom = Math.min(top, 0) - 7 - (wob(i, 3) * 0.5 + 0.5) * 4 - rnd() * 0.8;
    bottoms.push(bottom);
    const D = top - bottom;
    for (let k = 0; k < R; k++) {
      const [f, o] = PROF[k];
      const off = o + (k ? wob(i, k) * 0.35 : 0);
      const y = top - D * f + (k && k < R - 1 ? wob(i, k + 9) * 0.25 : 0);
      P.push(x + nx * off, y, z + nz * off);
      UV.push(i * 0.24, -VBAND[k]);
    }
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
  const strata = strataTexture(assets.tex('stone_purple'), ['#ff9e8a', '#ff4fa3', '#5a4bd1', '#ffb38a', '#1fb5b0'], 19, 0.62);
  const wall = new THREE.Mesh(g, toon({ map: strata, color: '#e8c0d8' }));
  (wall.material as THREE.Material).side = THREE.DoubleSide;
  wall.userData.noPaint = true;
  wall.name = 'harbor-rim';
  root.add(wall);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(lipP, 3));
  lg.setIndex(lipI);
  lg.computeVertexNormals();
  const lip = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: '#ffeedd', roughness: 1, side: THREE.DoubleSide }));
  lip.userData.noPaint = true;
  root.add(lip);
  // underside: an inverted craggy mountain
  const TIP = new THREE.Vector3(2, -46, -4);
  const RINGS = 8;
  const UP: number[] = [], UUV: number[] = [], UI: number[] = [];
  for (let i = 0; i < n; i++) {
    const v0 = (i * R + R - 1) * 3;
    const bx = P[v0], by = P[v0 + 1], bz = P[v0 + 2];
    const ang = Math.atan2(pts[i].z, pts[i].x);
    const lobe = Math.max(0, Math.sin(ang * 3 + 2) * 0.6 + Math.sin(ang * 7 + 1) * 0.45 + Math.sin(ang * 13) * 0.2);
    for (let r = 0; r <= RINGS; r++) {
      const s = r / RINGS;
      const e = 1 - Math.pow(1 - s, 1.6);
      const x = bx + (TIP.x - bx) * e;
      const z = bz + (TIP.z - bz) * e;
      let y = by + (TIP.y - by) * Math.pow(s, 1.25);
      y -= lobe * Math.sin(Math.PI * s) * 9;
      y += Math.sin(i * 0.9 + r * 2.3) * 0.6 * Math.sin(Math.PI * s);
      UP.push(x, y, z);
      UUV.push(x / 7 + y / 13, z / 7 + y / 17);
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
  const parts: THREE.BufferGeometry[] = [ni(under)];
  for (let k = 0; k < 20; k++) {
    const i = Math.floor(rnd() * n);
    const r = 2 + Math.floor(rnd() * 4);
    const v = (i * RR + r) * 3;
    const len = 4 + rnd() * 9;
    const cone = new THREE.ConeGeometry(1.2 + rnd() * 1.8, len, 6, 2);
    cone.rotateX(Math.PI);
    cone.translate(UP[v], UP[v + 1] - len / 2 + 1.2, UP[v + 2]);
    parts.push(ni(cone));
  }
  const underG = mergeGeometries(parts.map((p) => {
    for (const k of Object.keys(p.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') p.deleteAttribute(k);
    if (!p.attributes.uv) p.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
    return p;
  }))!;
  const rockTex = strataTexture(assets.tex('stone_purple'), ['#5a4bd1', '#ff7a6b', '#2b2470', '#b49cff'], 29);
  const underMesh = new THREE.Mesh(underG, toon({ map: rockTex, color: '#8a7ad8' }));
  (underMesh.material as THREE.Material).side = THREE.DoubleSide;
  underMesh.userData.noPaint = true;
  underMesh.name = 'harbor-underside';
  root.add(underMesh);
  // drips
  const cols = ['#ff3fa4', '#1fb5b0', '#ff7a6b', '#ffe08a', '#5a4bd1'].map((c) => new THREE.Color(c));
  const drips: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 3) {
    const { nx, nz } = pts[i];
    const len = 2 + rnd() * 9;
    const rad = 0.18 + rnd() * 0.2;
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
      const cc = cols[(i / 3) % 5 | 0];
      const ca = new Float32Array(geo.attributes.position.count * 3);
      for (let q = 0; q < ca.length; q += 3) (ca[q] = cc.r), (ca[q + 1] = cc.g), (ca[q + 2] = cc.b);
      geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
      drips.push(geo);
    }
  }
  const dm = new THREE.Mesh(mergeGeometries(drips)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
  dm.userData.noPaint = true;
  dm.name = 'harbor-drips';
  root.add(dm);
}
