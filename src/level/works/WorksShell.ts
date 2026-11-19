/**
 * [INPUT]: depends on StaticBatch/block/worldUV from ../harbor/HarborKit; WorksMats/MarkBatch/Washer/column/girder/windowBay/hangingLamp/railing
 *          from ./WorksKit; FY/SLAB/IN/Rect from ./WorksLayout; Quality (shadow sun); GameContext
 * [OUTPUT]: exports FloorBuild (one floor's build context), newFloor(), finishFloor(), rectsMinus(), floorShell() and
 *           buildAtmosphere() (lights, interior haze, the roof sky, and the drawn city: DrawnSkyline, whose `colour` it returns)
 * [POS]: the Correction Tower's shell: slabs (with stair / lift / pit holes), brick walls with factory windows and
 *        pilasters (and F1's arched doorway through the south wall: the way in), ceiling girders and lamps, the roof parapet. Each floor is one culling group; the four floor
 *        builders (ConveyorHall, StampingFloor, Archive, Roof) start from floorShell and add their own rooms.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { PhysicsWorld } from '../../core/PhysicsWorld';
import { Quality } from '../../render/Quality';
import { StaticBatch, block, worldUV } from '../harbor/HarborKit';
import { MarkBatch, Washer, column, girder, hangingLamp, railing, windowBay, worksMats, type WorksMats } from './WorksKit';
import { FY, IN, SLAB, type Rect } from './WorksLayout';
import { Crown, PaintDrop, type Checkpoint } from '../Collectibles';
import type { Region } from '../BlindPlaza';
import { buildSkyline, type DrawnSkyline } from './DrawnSkyline';

/** One floor under construction: everything visual goes into `group` (the culling unit). */
export interface FloorBuild {
  i: number;
  y: number;
  group: THREE.Group;
  B: StaticBatch;
  marks: MarkBatch;
  mats: WorksMats;
  washer: Washer;
  phys: PhysicsWorld;
  ctx: GameContext;
}

export function newFloor(ctx: GameContext, i: number): FloorBuild {
  const group = new THREE.Group();
  group.name = `works-floor-${i}`;
  ctx.root.add(group);
  return { i, y: FY[i], group, B: new StaticBatch(), marks: new MarkBatch(), mats: worksMats(ctx.assets), washer: new Washer(), phys: ctx.physics, ctx };
}

/** Flush the floor's batch + marks into its group (walls/slabs cast no shadow: the sun reaches inside). */
export function finishFloor(f: FloorBuild, shadowless: THREE.Material[] = []): void {
  const meshes = f.B.flush(f.group, `works-f${f.i}`);
  const noCast = new Set<THREE.Material>([f.mats.brick, f.mats.grid, f.mats.glow, ...shadowless]);
  for (const m of meshes) {
    if (noCast.has(m.material as THREE.Material)) m.castShadow = false;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
  }
  f.marks.flush(f.group, f.mats.marks);
  f.washer.fade(f.mats.marks);
}

/** The outer rect minus holes, as a list of non-overlapping rects (x strips). */
export function rectsMinus(outer: Rect, holes: Rect[]): Rect[] {
  const xs = new Set<number>([outer.x0, outer.x1]);
  for (const h of holes) {
    if (h.x0 > outer.x0 && h.x0 < outer.x1) xs.add(h.x0);
    if (h.x1 > outer.x0 && h.x1 < outer.x1) xs.add(h.x1);
  }
  const sx = [...xs].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i < sx.length - 1; i++) {
    const x0 = sx[i], x1 = sx[i + 1], mx = (x0 + x1) / 2;
    const cut = holes.filter((h) => mx > h.x0 && mx < h.x1).map((h) => [Math.max(outer.z0, h.z0), Math.min(outer.z1, h.z1)] as [number, number]).sort((a, b) => a[0] - b[0]);
    let z = outer.z0;
    for (const [a, b] of cut) {
      if (a > z + 0.01) out.push({ x0, x1, z0: z, z1: a });
      z = Math.max(z, b);
    }
    if (z < outer.z1 - 0.01) out.push({ x0, x1, z0: z, z1: outer.z1 });
  }
  return out;
}

const OUT = IN + 0.8;

export interface ShellOpts {
  /** Holes in this floor's slab (lift shaft, pit, stairwell from below). */
  holes?: Rect[];
  /** Holes in the ceiling above (the next floor's slab holes). */
  ceilHoles?: Rect[];
  /** Skip window bays whose centre lies in one of these (doors, machines against the wall). */
  noWindows?: Rect[];
  /** Ground floor: the slab is the ground (no ceiling of a floor below). */
  ground?: boolean;
  /** The roof: parapet instead of walls, no ceiling. */
  roof?: boolean;
  /** Pilaster columns that stand inside the room (x, z). */
  columns?: [number, number][];
  lamps?: [number, number][];
  /**
   * A real doorway through the south wall (+z): an arch opening `halfW` wide each side of `x`, straight up to `spring`
   * then a round head. The wall's collider stays whole (the way in is only walked in a cutscene); the pilaster
   * that would stand in it is left out.
   */
  door?: { x: number; halfW: number; spring: number };
}

/** The south wall (inner face z = IN) with an arched doorway: brick pieces round the opening, world-aligned bricks. */
function doorWall(B: StaticBatch, y: number, h: number, d: NonNullable<ShellOpts['door']>, mat: THREE.Material): void {
  const z = IN + 0.4, x0 = d.x - d.halfW, x1 = d.x + d.halfW;
  const top = d.spring + d.halfW + 0.2; // the head's crown + a course of brick
  const box = (a: number, b: number, ya: number, yb: number) => B.add(worldUV(new THREE.BoxGeometry(b - a, yb - ya, 0.8).translate((a + b) / 2, y + (ya + yb) / 2, z), 3), mat, 0);
  box(-OUT, x0, 0, h);
  box(x1, OUT, 0, h);
  box(x0, x1, top, h);
  // the spandrels: the square above the springing minus the round head
  const sp = new THREE.Shape();
  sp.moveTo(-d.halfW, d.spring);
  sp.lineTo(-d.halfW, top);
  sp.lineTo(d.halfW, top);
  sp.lineTo(d.halfW, d.spring);
  sp.absarc(0, d.spring, d.halfW, 0, Math.PI, false);
  const g = new THREE.ExtrudeGeometry(sp, { depth: 0.8, bevelEnabled: false, curveSegments: 16 });
  B.add(worldUV(g.translate(d.x, y, z - 0.4), 3), mat, 0);
}

/**
 * Slab, walls with windows, the ceiling of this floor (the underside of the slab above, built here so it is drawn
 * with this floor), ceiling girders, columns and hanging lamps. The slab collider spans y−0.6..y.
 */
export function floorShell(f: FloorBuild, o: ShellOpts): void {
  const { B, mats, phys, y } = f;
  const holes = o.holes ?? [];
  // ── the slab: a 30 cm grid-paper floor on top, one collider per strip ──
  for (const r of rectsMinus({ x0: -OUT, x1: OUT, z0: -OUT, z1: OUT }, holes)) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const g = new THREE.BoxGeometry(w, 0.3, d);
    // world-scale UVs (4 m tiles) so every strip's grid lines meet the next one
    const pos = g.attributes.position as THREE.BufferAttribute;
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + cx) / 4, -(pos.getZ(i) + cz) / 4);
    B.add(g.translate(cx, y - 0.15, cz), mats.grid, 0);
    phys.addStaticBox(new THREE.Vector3(cx, y - (o.ground ? 2 : SLAB) / 2, cz), new THREE.Vector3(w / 2, (o.ground ? 2 : SLAB) / 2, d / 2));
  }
  // slab edges round the holes: a steel lip with a hazard band (never coplanar with the floor top)
  for (const h of holes) {
    const x0 = Math.max(h.x0, -IN), x1 = Math.min(h.x1, IN), z0 = Math.max(h.z0, -IN), z1 = Math.min(h.z1, IN);
    const lip = (cx: number, cz: number, hx: number, hz: number) => B.add(new THREE.BoxGeometry(hx * 2, SLAB - 0.04, hz * 2).translate(cx, y - SLAB / 2 - 0.01, cz), mats.steelDark, 0.02);
    if (x0 > -IN + 0.1) lip(x0 + 0.06, (z0 + z1) / 2, 0.06, (z1 - z0) / 2);
    if (x1 < IN - 0.1) lip(x1 - 0.06, (z0 + z1) / 2, 0.06, (z1 - z0) / 2);
    if (z0 > -IN + 0.1) lip((x0 + x1) / 2, z0 + 0.06, (x1 - x0) / 2, 0.06);
    if (z1 < IN - 0.1) lip((x0 + x1) / 2, z1 - 0.06, (x1 - x0) / 2, 0.06);
  }
  if (o.roof) {
    // ── the roof's parapet: a brick wall with a steel coping (barrier above it keeps WAI on the roof) ──
    for (const [cx, cz, hx, hz] of [[0, -IN - 0.3, OUT, 0.35], [0, IN + 0.3, OUT, 0.35], [-IN - 0.3, 0, 0.35, IN], [IN + 0.3, 0, 0.35, IN]]) {
      B.add(block(hx * 2, 1.1, hz * 2, 0.01, cx + cz, 2).translate(cx, y + 0.55, cz), mats.brick, 0.04);
      B.add(block(hx * 2 + 0.16, 0.12, hz * 2 + 0.16, 0.005, cx - cz, 1).translate(cx, y + 1.16, cz), mats.steel, 0.03);
      phys.addStaticBox(new THREE.Vector3(cx, y + 0.6, cz), new THREE.Vector3(hx, 0.6, hz));
      phys.addStaticBox(new THREE.Vector3(cx, y + 2.6, cz), new THREE.Vector3(hx, 1.4, hz), 0, 'barrier');
    }
    return;
  }
  const top = FY[f.i + 1] - SLAB;
  const h = top - y;
  // ── walls: brick, a steel skirting and a cornice band, windows between pilasters ──
  const walls: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
    [new THREE.Vector3(0, 0, -IN - 0.4), new THREE.Vector3(OUT, 0, 0.4), new THREE.Vector3(0, 0, 1)],
    [new THREE.Vector3(0, 0, IN + 0.4), new THREE.Vector3(OUT, 0, 0.4), new THREE.Vector3(0, 0, -1)],
    [new THREE.Vector3(-IN - 0.4, 0, 0), new THREE.Vector3(0.4, 0, IN), new THREE.Vector3(1, 0, 0)],
    [new THREE.Vector3(IN + 0.4, 0, 0), new THREE.Vector3(0.4, 0, IN), new THREE.Vector3(-1, 0, 0)],
  ];
  for (const [c, hh, n] of walls) {
    const doorHere = o.door && n.z < 0 ? o.door : null;
    if (doorHere) doorWall(B, y, h, doorHere, mats.brick);
    else B.add(block(hh.x * 2, h, hh.z * 2, 0.0, c.x + c.z + f.i, 3).translate(c.x, y + h / 2, c.z), mats.brick, 0);
    phys.addStaticBox(new THREE.Vector3(c.x, y + h / 2, c.z), new THREE.Vector3(hh.x, h / 2, hh.z));
    const along = new THREE.Vector3(n.z, 0, -n.x);
    // skirting + cornice: proud of the wall face by 8 / 14 cm
    const len = IN * 2;
    const face = c.clone().addScaledVector(n, 0.4);
    const band = (yy: number, hb: number, dpt: number, m: THREE.Material) =>
      B.add(new THREE.BoxGeometry(Math.abs(along.x) * len + Math.abs(n.x) * dpt * 2, hb, Math.abs(along.z) * len + Math.abs(n.z) * dpt * 2).translate(face.x, yy, face.z), m, 0.03);
    band(y + 0.2, 0.4, 0.08, mats.steelDark);
    band(top - 0.3, 0.6, 0.14, mats.steel);
    // windows: 4 bays per wall, pilasters between them
    for (let k = 0; k < 4; k++) {
      const s = -IN + (k + 0.5) * (len / 4);
      const at = face.clone().addScaledVector(along, s).setY(y + 4.2);
      const skip = (o.noWindows ?? []).some((r) => at.x > r.x0 && at.x < r.x1 && at.z > r.z0 && at.z < r.z1);
      if (!skip) windowBay(B, at, n, 2.6, 4.2, mats);
    }
    for (let k = 0; k <= 4; k++) {
      const s = -IN + k * (len / 4);
      const p = face.clone().addScaledVector(along, Math.max(-IN + 0.3, Math.min(IN - 0.3, s))).addScaledVector(n, 0.22);
      if (doorHere && Math.abs(p.x - doorHere.x) < doorHere.halfW + 0.6) continue;
      column(B, phys, p.x, p.z, y, top, mats, false);
    }
  }
  // ── the ceiling (underside of the slab above): a box from top..top+0.25, cut round the holes ──
  for (const r of rectsMinus({ x0: -IN, x1: IN, z0: -IN, z1: IN }, o.ceilHoles ?? [])) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0;
    // world-scale UVs (4 m panels): with the box's own 0..1 UVs one 256 px plate stretched over 40 m of ceiling
    B.add(worldUV(new THREE.BoxGeometry(w, 0.25, d).translate((r.x0 + r.x1) / 2, top + 0.125, (r.z0 + r.z1) / 2), 4), mats.steelDark, 0);
  }
  // ceiling girders (east-west) every 6 m, a cross beam over the middle
  for (let z = -18; z <= 18; z += 6) {
    const inHole = (o.ceilHoles ?? []).some((r) => z > r.z0 - 0.4 && z < r.z1 + 0.4 && r.x1 - r.x0 > 10);
    if (!inHole) girder(B, new THREE.Vector3(-IN, top - 0.25, z), new THREE.Vector3(IN, top - 0.25, z), 0.5, 0.3, mats.steelDark);
  }
  for (const [x, z] of o.columns ?? []) column(B, phys, x, z, y, top, mats);
  for (const [x, z] of o.lamps ?? []) hangingLamp(B, new THREE.Vector3(x, top - 2.4, z), top - 0.5, mats);
}

/** The level-wide lists every floor appends to (the session reads them like HarborBuilt's). */
export interface WorksLists {
  crowns: Crown[];
  drops: PaintDrop[];
  checkpoints: Checkpoint[];
  regions: Region[];
}

const DROP_COLS = ['#ff4fa3', '#ffd23a', '#22c4c0', '#ff7a1a', '#2a4be0'];

/** Paint drops along a polyline, every `step` metres, `lift` above the given points (parented to the floor). */
export function dropTrail(f: FloorBuild, L: WorksLists, id: string, pts: THREE.Vector3[], step = 1.6, lift = 0.6): void {
  let n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const k = Math.max(1, Math.round(a.distanceTo(b) / step));
    for (let j = i === 0 ? 0 : 1; j <= k; j++) {
      const p = a.clone().lerp(b, j / k);
      const d = new PaintDrop(f.ctx, `${id}-${n}`, p.setY(p.y + lift), DROP_COLS[(n + i) % DROP_COLS.length]);
      f.group.attach(d.root);
      L.drops.push(d);
      n++;
    }
  }
}

/** A crown parented to the floor (culled with it). */
export function floorCrown(f: FloorBuild, L: WorksLists, id: string, at: THREE.Vector3, hint: string): Crown {
  const c = new Crown(f.ctx, id, at, hint);
  f.group.attach(c.root);
  L.crowns.push(c);
  return c;
}

/** An area title box (shown when WAI enters it). */
export function region(L: WorksLists, name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  L.regions.push({ name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
}

/** Railings round a slab hole (sides listed: 'n' | 's' | 'e' | 'w' = the open side is left out). */
export function holeRailing(f: FloorBuild, r: Rect, sides: ('n' | 's' | 'e' | 'w')[], rail?: THREE.Material): void {
  const y = f.y;
  const V = (x: number, z: number) => new THREE.Vector3(x, y, z);
  const x0 = Math.max(r.x0, -IN + 0.15), x1 = Math.min(r.x1, IN - 0.15), z0 = Math.max(r.z0, -IN + 0.15), z1 = Math.min(r.z1, IN - 0.15);
  if (sides.includes('n')) railing(f.B, f.phys, V(x0, z0 - 0.15), V(x1, z0 - 0.15), f.mats, 1.05, rail);
  if (sides.includes('s')) railing(f.B, f.phys, V(x0, z1 + 0.15), V(x1, z1 + 0.15), f.mats, 1.05, rail);
  if (sides.includes('w')) railing(f.B, f.phys, V(x0 - 0.15, z0), V(x0 - 0.15, z1), f.mats, 1.05, rail);
  if (sides.includes('e')) railing(f.B, f.phys, V(x1 + 0.15, z0), V(x1 + 0.15, z1), f.mats, 1.05, rail);
}

/**
 * Lights (hemisphere + ambient + one shadowed sun through the windows), the interior haze, the painted city
 * panorama ring outside the tower (seen through no glass: the windows paint it, the roof shows it for real),
 * and the roof's sky dome.
 */
export function buildAtmosphere(ctx: GameContext): { sky: THREE.Mesh; city: THREE.Object3D; skyline: DrawnSkyline } {
  const { root, assets } = ctx;
  root.add(new THREE.HemisphereLight('#eef0ff', '#d6b8a8', 1.3));
  root.add(new THREE.AmbientLight('#fff4ec', 0.38));
  const sun = new THREE.DirectionalLight('#fff0dc', 1.7);
  sun.position.set(-34, 70, 26);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { near: 1, far: 220 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  Quality.setSun(sun);
  ctx.scene.fog = new THREE.Fog('#d8d0e2', 34, 120);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: assets.tex('w3_sky'), side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.name = 'works-sky';
  root.add(sky);
  // the drawn city all round: layered crayon rings, sky cards, red marks that fade as the Guardians wake (DrawnSkyline.ts)
  const skyline = buildSkyline(ctx);
  const city = skyline.group;
  return { sky, city, skyline };
}
