import * as THREE from 'three';
import { ni } from '../render/geom';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER } from '../core/PhysicsWorld';
import type { GameContext } from '../core/Context';
import { PAL } from '../render/PaintTextures';
import { toon } from '../render/Materials';
import { gorgeX, GORGE, heightAt, onIsland, outlinePoints, strataTexture, Y } from './Terrain';

/**
 * Island dressing: rock outcrops and crags, stepped rock mesas, bushes, planters, rubble and a few
 * little story props. Everything is merged per material into 12 m tiles (paintable, cheap to paint,
 * a handful of draw calls) and every inked outline goes into ONE shared back-face hull mesh.
 * Anything the player can reach gets a convex collider (balls / boxes: nothing to get wedged in).
 */

const TILE = 12;
const outlineMat = new THREE.MeshBasicMaterial({ color: PAL.black, side: THREE.BackSide });

class Batch {
  private parts = new Map<string, THREE.BufferGeometry[]>();
  private hulls: THREE.BufferGeometry[] = [];
  constructor(private mats: Record<string, THREE.Material>) {}

  /** `g` is already in world space. */
  add(g: THREE.BufferGeometry, mat: string, outline = 0.05): void {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const c = bb.getCenter(new THREE.Vector3());
    const key = `${mat}|${Math.floor(c.x / TILE)}_${Math.floor(c.z / TILE)}`;
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(geo);
    if (outline > 0) {
      const size = bb.getSize(new THREE.Vector3());
      const h = geo.clone();
      h.deleteAttribute('uv');
      h.translate(-c.x, -c.y, -c.z);
      h.scale(1 + (2 * outline) / Math.max(size.x, 0.01), 1 + (2 * outline) / Math.max(size.y, 0.01), 1 + (2 * outline) / Math.max(size.z, 0.01));
      h.translate(c.x, c.y, c.z);
      this.hulls.push(h);
    }
  }

  flush(root: THREE.Object3D): number {
    let calls = 0;
    for (const [key, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list)!, this.mats[key.split('|')[0]]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = `dress-${key}`;
      root.add(m);
      calls++;
    }
    if (this.hulls.length) {
      const o = new THREE.Mesh(mergeGeometries(this.hulls)!, outlineMat);
      o.userData.isOutline = true;
      o.userData.noPaint = true;
      o.name = 'dress-outlines';
      root.add(o);
      calls++;
    }
    return calls;
  }
}

function rng(seed: number) {
  let s = seed % 2147483647 || 7;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** A faceted, hand-chipped boulder (unit-ish size before scaling). */
function rockGeo(r: () => number, detail = 0): THREE.BufferGeometry {
  const g = ni(r() < 0.5 ? new THREE.DodecahedronGeometry(1, detail) : new THREE.IcosahedronGeometry(1, detail));
  const p = g.attributes.position as THREE.BufferAttribute;
  const cache = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = cache.get(k);
    if (!o) cache.set(k, (o = [(r() - 0.5) * 0.35, (r() - 0.5) * 0.3, (r() - 0.5) * 0.35]));
    p.setXYZ(i, p.getX(i) + o[0], Math.max(-0.75, p.getY(i) + o[1]), p.getZ(i) + o[2]); // flattish base
  }
  g.computeVertexNormals();
  return g;
}

export interface Dressing {
  tuft(x: number, y: number, z: number, s?: number): void;
  flush(): void;
}

export function dressIsland(ctx: GameContext, G: (x: number, z: number) => number): Dressing {
  const { root, physics, assets } = ctx;
  const tex = (n: string, rep = 1) => {
    const t = assets.tex(n).clone();
    t.needsUpdate = true;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep, rep);
    return t;
  };
  const rockTex = strataTexture(assets.tex('stone_cream'), ['#ffd08a', '#ff9ec4', '#c9a8ff', '#ffe7b0'], 31, 0.4);
  const mats: Record<string, THREE.Material> = {
    rock: toon({ map: rockTex, color: '#ffe2d0' }),
    rockP: toon({ map: strataTexture(assets.tex('stone_purple'), ['#c9a8ff', '#ff9ec4', '#ffd08a'], 37, 0.35), color: '#d8c4ff' }),
    bush: toon({ map: tex('hill', 0.5), color: '#9fe07a' }),
    wood: toon({ map: tex('wood') }),
    stone: toon({ map: tex('stone_cream') }),
    metal: toon({ map: tex('metal_dark'), color: '#ffd0c0' }),
    red: toon({ color: PAL.red }),
    yellow: toon({ color: PAL.yellow }),
    turq: toon({ color: PAL.turq }),
    cream: toon({ color: PAL.cream }),
    pink: toon({ color: '#ff9ec4' }),
  };
  const B = new Batch(mats);
  const ball = (x: number, y: number, z: number, rad: number) => physics.tag(physics.world.createCollider(RAPIER.ColliderDesc.ball(rad).setTranslation(x, y, z)), 'static');

  /** One boulder sitting in the ground (base sunk by `sink` of its height). Optional ball collider. */
  const boulder = (r: () => number, x: number, z: number, s: number, opts: { y?: number; sy?: number; mat?: string; col?: boolean; sink?: number; yaw?: number } = {}) => {
    const sy = opts.sy ?? s * (0.6 + r() * 0.5);
    const g = rockGeo(r);
    g.scale(s * (0.8 + r() * 0.4), sy, s * (0.8 + r() * 0.4));
    g.rotateY(opts.yaw ?? r() * 6.28);
    const y0 = opts.y ?? G(x, z);
    const yc = y0 + sy * (0.75 - (opts.sink ?? 0.25) * 2);
    g.translate(x, yc, z);
    B.add(g, opts.mat ?? 'rock', 0.05);
    if (opts.col) ball(x, yc, z, Math.min(s, sy) * 0.92);
    return yc + sy;
  };
  /** A crag: a big rock with smaller ones heaped against it (silhouette pieces). */
  const crag = (seed: number, x: number, z: number, h: number, col: boolean, mat = 'rock') => {
    const r = rng(seed);
    const y = G(x, z);
    let top = boulder(r, x, z, h * 0.42, { sy: h * 0.55, mat, col, sink: 0.15 });
    // a stacked top stone, leaning
    if (h > 3) top = boulder(r, x + (r() - 0.5) * h * 0.2, z + (r() - 0.5) * h * 0.2, h * 0.24, { y: top - h * 0.18, sy: h * 0.3, mat, col: false, sink: 0 });
    for (let k = 0; k < 3; k++) {
      const a = r() * 6.28;
      const d = h * (0.38 + r() * 0.15);
      boulder(r, x + Math.cos(a) * d, z + Math.sin(a) * d, h * (0.16 + r() * 0.1), { mat, col, y });
    }
    return top;
  };
  /** Stepped rock mesa: stacked wonky slabs (boxes) with real colliders. */
  const mesa = (seed: number, x: number, z: number, w: number, d: number, steps: number, stepH: number, yaw: number) => {
    const r = rng(seed);
    let y = G(x, z) - 0.3;
    for (let i = 0; i < steps; i++) {
      const k = 1 - i * (0.7 / steps);
      const g = new THREE.BoxGeometry(w * k, stepH + 0.3, d * k, 2, 1, 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * (1 + (r() - 0.5) * 0.08), p.getY(v) + (p.getY(v) > 0 ? (r() - 0.5) * 0.12 : 0), p.getZ(v) * (1 + (r() - 0.5) * 0.08));
      g.computeVertexNormals();
      const ox = (r() - 0.5) * w * 0.12, oz = (r() - 0.5) * d * 0.12;
      g.rotateY(yaw + (r() - 0.5) * 0.15);
      const cy = y + (stepH + 0.3) / 2;
      g.translate(x + ox, cy, z + oz);
      B.add(g, i % 2 ? 'rockP' : 'rock', 0.05);
      physics.addStaticBox(new THREE.Vector3(x + ox, cy, z + oz), new THREE.Vector3((w * k) / 2 * 0.96, (stepH + 0.3) / 2, (d * k) / 2 * 0.96), yaw);
      y += stepH;
    }
    return y;
  };
  const tufts: number[] = [];
  const tuft = (x: number, y: number, z: number, s = 0.5) => tufts.push(x, y, z, s);
  const bush = (r: () => number, x: number, z: number, s: number, y?: number) => {
    const y0 = y ?? G(x, z);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.IcosahedronGeometry(s * (0.55 + r() * 0.3), 0);
      g.scale(1, 0.75, 1);
      g.translate(x + (r() - 0.5) * s, y0 + s * 0.35 + r() * s * 0.2, z + (r() - 0.5) * s);
      B.add(g, 'bush', 0.03);
    }
    tuft(x + s * 0.6, y0, z, s * 0.7);
  };

  // keep-out zones (routes, story spots, buildings): [x, z, radius]
  const KEEP: [number, number, number][] = [
    [-2, 50, 7], // dock
    [gorgeX(40), 40, 8], // waterfall notch
    [-51, -5, 9], // gatehouse
    [-48, 8, 4], // bastion ramp
    [0, -53, 7], // tower
    [53, 14, 6.5], // workyard house on the east rim
    [46, -5, 7], // rooftop building
    [-19, -50.5, 6], [18, -48, 6.5], [-24, -41, 7.5], [-20, -27, 6.5], [-50, 18, 6.5], [-46, 32, 5],
    [-19, 32, 7], [13, 32, 7], [-18.5, 41.5, 4], [36, 27, 6.5],
    // the Crossed-Out Quarter: its lane, the tear's mouth, the Inkwell Square's drop to the rooftop
    [28.5, -20, 3.5], [29.3, -26, 3.5], [41, -43, 4], [46, -11, 5],
  ];
  // the walked routes on the hill (Guide.ts ROAD, plateau part) stay clear by 2.5 m
  const ROUTE: [number, number][] = [[24, -36], [24, -40], [10.5, -40], [9.3, -36.5], [6.5, -33], [2.5, -29.5], [0, -29.5], [0, -36]];
  const segD = (x: number, z: number, [ax, az]: [number, number], [bx, bz]: [number, number]) => {
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  };
  const onRoute = (x: number, z: number) => ROUTE.some((a, i) => i > 0 && segD(x, z, ROUTE[i - 1], a) < 2.5);
  const free = (x: number, z: number, pad = 0) => !onRoute(x, z) && KEEP.every(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) > kr + pad);

  // ── 1. the island's edge: crags and boulders on the lip (a ragged silhouette, a soft barrier) ──
  {
    const r = rng(101);
    const pts = outlinePoints(1.2);
    for (let i = 0; i < pts.length; i += 5) {
      const { x, z, nx, nz } = pts[i];
      const ix = x - nx * 1.6, iz = z - nz * 1.6;
      if (!free(ix, iz) || !onIsland(ix, iz) || r() < 0.3) continue;
      if (heightAt(ix, iz).zone === 'bed' || heightAt(ix, iz).zone === 'towpath') continue;
      if (Math.abs(ix) < 14 && iz > 24) continue; // harbor front stays open
      const big = r() < 0.3;
      if (big) crag(500 + i, ix, iz, 2.2 + r() * 2.2, true);
      else boulder(r, ix, iz, 0.6 + r() * 0.7, { col: true });
      if (r() < 0.6) tuft(ix - nx * 1.2 + (r() - 0.5), G(ix, iz), iz - nz * 1.2 + (r() - 0.5), 0.5 + r() * 0.3);
      // a few rocks jutting out of the rim wall below the lip (out of reach)
      if (r() < 0.35) boulder(r, x + nx * 0.4, z + nz * 0.4, 0.7 + r() * 0.8, { y: G(ix, iz) - 2.5 - r() * 5, sink: 0, mat: 'rockP' });
    }
  }

  // ── 2. the east high ground is the Crossed-Out Quarter now (src/level/plaza): its streets stay
  //       clear; only its outer rim keeps a few rocks and bushes ──
  {
    const r = rng(77);
    for (const [x, z, s] of [[54.5, -16, 0.9], [55.2, -19.5, 0.7], [31.5, -47, 1.0], [29, -44, 0.8], [42.6, -44.2, 1.1]] as [number, number, number][]) {
      if (!onIsland(x, z)) continue;
      boulder(r, x, z, s, { col: true });
      tuft(x + 0.8, G(x, z), z + 0.5, 0.5);
    }
    // the workyard's back cliff (4.5 → 13): rock buttresses at its foot, away from the yard's props
    for (const [x, s] of [[28.6, 1.4], [30.8, 1.0], [32.6, 1.25], [52.2, 1.3], [54.4, 1.0]] as [number, number][]) boulder(r, x, -10.3 + s * 0.3, s, { col: true, sink: 0.15 });
  }

  // ── 3. the upper town / west hill: a stepped rock mesa, outcrops, bushes ──
  {
    mesa(301, -42, -32, 7, 6, 3, 0.95, 0.3);
    mesa(302, -36, -46, 5, 4.5, 2, 0.9, -0.4);
    const r = rng(303);
    for (const [x, z, h] of [[-48, -24, 3.2], [-31, -24, 2.4], [-44, -42, 3.8], [-12, -44, 2], [11, -45.5, 2.6], [-8, -54, 3]] as [number, number, number][]) crag(310 + x, x, z, h, true);
    for (let i = 0; i < 30; i++) {
      const x = -52 + r() * 62, z = -54 + r() * 34;
      if (!free(x, z, 1) || !onIsland(x, z) || heightAt(x, z).y < 11.9 || heightAt(x, z).zone === 'road') continue;
      if (Math.hypot(x, z + 43) < 12 || (x > -9 && x < 9 && z > -36)) continue; // summit + its stairs
      if (r() < 0.45) bush(r, x, z, 0.6 + r() * 0.5);
      else boulder(r, x, z, 0.4 + r() * 0.5, { col: true });
    }
    // hedges between the road's legs: shrubs along their tops (visual; the road itself stays clear)
    for (const hx of [15, 21]) for (let z = -33.5; z <= -21.5; z += 1.7) if (r() < 0.8) bush(r, hx + (r() - 0.5) * 0.2, z, 0.42 + r() * 0.12, G(hx, z));
    // west of the first leg (plateau edge): a row of rocks on the brink
    for (let z = -30.5; z < -19; z += 2.6) boulder(r, 8.4, z, 0.45 + r() * 0.25, { col: true });
  }

  // ── 4. the canal: rocks in the water against the walls (none near the bridge, drawbridge or island path) ──
  {
    const r = rng(404);
    for (let z = GORGE.z0 + 3; z < 38; z += 3.2 + r() * 2) {
      if ((z > 7 && z < 17) || (z > -9 && z < -1) || (z > 21 && z < 33)) continue;
      const gx = gorgeX(z);
      { const s0 = 1.0 + r() * 0.6; boulder(r, gx - GORGE.halfWater + 0.9, z, s0, { y: Y.bed, sy: s0 * 1.25, sink: 0, col: true, mat: 'rockP' }); }
      if (r() < 0.45 && (z < 15.5 || z > 27)) { const s1 = 0.8 + r() * 0.4; boulder(r, gx + GORGE.halfWater - 0.7, z + 1.3, s1, { y: Y.bed, sy: s1 * 1.2, sink: 0, col: true, mat: 'rockP' }); }
    }
    // tufts on the towpath's wall foot and the west bank's brink
    for (let z = -12; z < 36; z += 2.5) {
      tuft(gorgeX(z) - GORGE.halfWater - 0.5, Y.bank, z + r(), 0.45 + r() * 0.3);
      if (r() < 0.5) tuft(gorgeX(z) + GORGE.halfWater + GORGE.towpath - 0.3, Y.towpath, z + r(), 0.4);
    }
  }

  // ── 5. little stories ──
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, mat: string, yaw = 0, col = true, outline = 0.04) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(yaw);
    g.translate(x, y + h / 2, z);
    B.add(g, mat, outline);
    if (col) physics.addStaticBox(new THREE.Vector3(x, y + h / 2, z), new THREE.Vector3(w / 2, h / 2, d / 2), yaw);
  };
  const cyl = (x: number, y: number, z: number, rt: number, rb: number, h: number, mat: string, col = true, seg = 10) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y + h / 2, z);
    B.add(g, mat, 0.03);
    if (col) physics.addStaticCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, Math.max(rt, rb));
  };
  {
    const r = rng(505);
    // harbor: a fisher's corner against the west cliff — crate stack, barrels, a coil of rope
    box(-11.6, 0, 42.3, 1.2, 1.0, 1.2, 'wood', 0.2);
    box(-11.4, 0, 43.7, 1.1, 0.9, 1.1, 'wood', -0.3);
    box(-11.5, 1.0, 42.4, 0.9, 0.8, 0.9, 'wood', 0.5, true);
    cyl(-10.3, 0, 45.2, 0.38, 0.42, 0.95, 'red');
    cyl(-11.6, 0, 45.6, 0.38, 0.42, 0.95, 'turq');
    {
      const rope = new THREE.TorusGeometry(0.42, 0.12, 6, 14);
      rope.rotateX(Math.PI / 2);
      rope.translate(-4.4, 0.24, 53.5);
      B.add(rope, 'yellow', 0.02);
      const rope2 = rope.clone();
      rope2.translate(0, 0.18, 0);
      rope2.scale(1, 1, 1);
      B.add(rope2, 'yellow', 0.02);
      // a lifebuoy hanging on the far piling
      const buoy = new THREE.TorusGeometry(0.42, 0.13, 8, 16);
      buoy.translate(-0.6, -0.2, 56.66); // on the pier's end face
      B.add(buoy, 'red', 0.02);
    }
    // hub: planters with shrubs (corners away from the fights' main lanes)
    for (const [x, z] of [[-11, 21.4], [5.6, 21.4], [18, -15.6], [-26.6, 3]] as [number, number][]) {
      const y = G(x, z);
      box(x, y, z, 1.7, 0.6, 1.7, 'stone', 0, true, 0.04);
      bush(r, x, z, 0.55, y + 0.55);
      tuft(x + 0.5, y + 0.6, z - 0.4, 0.45);
    }
    // the Eraser's mess: a broken giant pencil leaning on the cliff where the road begins
    {
      const x = 17.2, z = -17.0, y = G(x, z);
      const pg = new THREE.CylinderGeometry(0.32, 0.32, 4.2, 6);
      pg.translate(0, 2.1, 0);
      const tip = new THREE.ConeGeometry(0.32, 0.9, 6);
      tip.rotateX(Math.PI);
      tip.translate(0, -0.45, 0);
      const ferrule = new THREE.CylinderGeometry(0.34, 0.34, 0.35, 6);
      ferrule.translate(0, 4.35, 0);
      const rubber = new THREE.CylinderGeometry(0.33, 0.33, 0.5, 6);
      rubber.translate(0, 4.75, 0);
      for (const [g, m] of [[pg, 'yellow'], [tip, 'cream'], [ferrule, 'metal'], [rubber, 'pink']] as [THREE.BufferGeometry, string][]) {
        g.rotateX(-0.22);
        g.rotateY(0.4);
        g.translate(x, y + 0.35, z);
        B.add(g, m, 0.03);
      }
      physics.addStaticCylinder(new THREE.Vector3(x, y + 1.2, z + 0.1), 1.2, 0.4);
    }
    // an easel with a half-painted canvas (someone was redrawing the plaza)
    {
      const x = 9.4, z = -8.6, y = G(x, z), yaw = -0.5;
      const legs: [number, number, number][] = [[-0.45, 0, 0.25], [0.45, 0, 0.25], [0, 0, -0.45]];
      for (const [lx, , lz] of legs) {
        const g = new THREE.CylinderGeometry(0.04, 0.05, 2.1, 5);
        g.rotateX(lz > 0 ? 0.12 : -0.22);
        g.rotateZ(lx * -0.2);
        g.translate(lx, 1.02, lz);
        g.rotateY(yaw);
        g.translate(x, y, z);
        B.add(g, 'wood', 0.015);
      }
      const canvas = new THREE.BoxGeometry(1.2, 0.95, 0.06);
      canvas.rotateX(-0.12);
      canvas.translate(0, 1.45, 0.32);
      canvas.rotateY(yaw);
      canvas.translate(x, y, z);
      B.add(canvas, 'cream', 0.02);
      const smear = new THREE.BoxGeometry(0.7, 0.35, 0.02);
      smear.rotateX(-0.12);
      smear.translate(-0.1, 1.5, 0.37);
      smear.rotateY(yaw);
      smear.translate(x, y, z);
      B.add(smear, 'turq', 0);
      physics.addStaticCylinder(new THREE.Vector3(x, y + 0.8, z), 0.8, 0.5);
      cyl(x + 0.9, y, z + 0.5, 0.2, 0.18, 0.4, 'red', false); // its paint pot
    }
    // workyard: lumber stack, pipe bundle, paint-can pyramid, sandbags
    {
      const y = Y.terrace;
      for (let i = 0; i < 4; i++) box(26.6, y + i * 0.22, 27 + (i % 2) * 0.1, 3.4 - i * 0.2, 0.22, 1.3, 'wood', 0.08 * (i % 2 ? 1 : -1), i === 0);
      physics.addStaticBox(new THREE.Vector3(26.6, y + 0.44, 27.05), new THREE.Vector3(1.7, 0.44, 0.7), 0);
      for (const [dx, dy] of [[0, 0.25], [0.52, 0.25], [1.04, 0.25], [0.26, 0.7], [0.78, 0.7]]) {
        const g = new THREE.CylinderGeometry(0.25, 0.25, 3.2, 10, 1, false);
        g.rotateX(Math.PI / 2);
        g.translate(26.2 + dx, y + dy, 33);
        B.add(g, 'metal', 0.02);
      }
      physics.addStaticBox(new THREE.Vector3(26.72, y + 0.48, 33), new THREE.Vector3(0.8, 0.48, 1.6), 0);
      const cans: [number, number][] = [[0, 0], [0.5, 0], [1.0, 0], [0.25, 0.55], [0.75, 0.55], [0.5, 1.1]];
      cans.forEach(([dx, dy], i) => cyl(43.5 + dx, y + dy, 33.5, 0.22, 0.22, 0.55, ['red', 'yellow', 'turq', 'pink', 'cream', 'red'][i], false));
      physics.addStaticBox(new THREE.Vector3(44, y + 0.82, 33.5), new THREE.Vector3(0.75, 0.82, 0.3), 0);
      for (let i = 0; i < 5; i++) {
        const g = new THREE.CapsuleGeometry(0.22, 0.55, 3, 6);
        g.rotateZ(Math.PI / 2);
        g.scale(1, 0.7, 1);
        g.translate(49 + (i % 3) * 0.75 + (i > 2 ? 0.38 : 0), y + 0.16 + (i > 2 ? 0.3 : 0), 25 + r() * 0.1);
        B.add(g, 'stone', 0.02);
      }
      physics.addStaticBox(new THREE.Vector3(49.9, y + 0.3, 25), new THREE.Vector3(1.3, 0.3, 0.3), 0);
    }
    // the west bank's new ground: an upturned rowboat + rubble
    {
      const x = -52.5, z = 29, y = G(x, z);
      const hull = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      hull.scale(1.0, 0.7, 2.3);
      hull.translate(x, y - 0.05, z);
      B.add(hull, 'turq', 0.04);
      physics.addStaticBox(new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0.9, 0.35, 2.1), 0);
      for (let k = 0; k < 4; k++) boulder(r, x + 2.4 + r() * 2, z - 2 + r() * 4, 0.35 + r() * 0.3, { col: true });
    }
    // eraser rubble around the road's erased stretches' approaches (visual crumbs on the hedges' feet)
    for (let k = 0; k < 10; k++) {
      const g = new THREE.BoxGeometry(0.35, 0.18, 0.28);
      g.rotateY(r() * 3);
      const x = 15 + (k % 2 ? 6 : 0) + (r() - 0.5) * 0.6, z = -32 + r() * 10;
      g.translate(x, G(x, z) + 0.09, z);
      B.add(g, 'pink', 0.015);
    }
  }

  // ── grass: tufts scattered where ground changes (cliff feet and brinks) and on the grassy hill ──
  {
    const r = rng(606);
    for (let i = 0; i < 900; i++) {
      const x = -56 + r() * 112, z = -57 + r() * 104;
      if (!onIsland(x, z)) continue;
      const h = heightAt(x, z);
      if (h.zone === 'bed' || h.zone === 'road') continue;
      const d = Math.max(Math.abs(heightAt(x + 1, z).y - h.y), Math.abs(heightAt(x - 1, z).y - h.y), Math.abs(heightAt(x, z + 1).y - h.y), Math.abs(heightAt(x, z - 1).y - h.y));
      if (h.zone === 'grass' ? r() < 0.55 : d < 0.4 || r() < 0.2) continue;
      tuft(x, h.y, z, 0.35 + r() * 0.35);
    }
  }

  // flushed by the caller once everything (its own tufts too) has been dressed
  return { tuft, flush: flushAll };

  function flushAll() {
    B.flush(root);
    // all grass tufts: one merged alpha-tested mesh (was 2 draw calls per tuft)
    if (!tufts.length) return;
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < tufts.length; i += 4) {
      const [x, y, z, s] = [tufts[i], tufts[i + 1], tufts[i + 2], tufts[i + 3]];
      for (let k = 0; k < 2; k++) {
        const p = new THREE.PlaneGeometry(s, s);
        p.translate(0, s / 2 - 0.02, 0);
        p.rotateY(k * (Math.PI / 2) + x * 0.37 + z * 0.11);
        p.translate(x, y, z);
        geos.push(p);
      }
    }
    const m = new THREE.Mesh(mergeGeometries(geos)!, tuftMaterial());
    m.userData.noPaint = true;
    m.name = 'grass-tufts';
    root.add(m);
  }
}

let tuftMat: THREE.Material | null = null;
function tuftMaterial(): THREE.Material {
  if (tuftMat) return tuftMat;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 22; i++) {
    const x = 20 + r() * 88;
    const h = 50 + r() * 70;
    g.strokeStyle = ['#c9b340', '#e0c45a', '#a8a03a', '#d8b84c', '#9fd06a'][i % 5];
    g.lineWidth = 3 + r() * 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, 128);
    g.quadraticCurveTo(x + (r() - 0.5) * 30, 128 - h * 0.6, x + (r() - 0.5) * 40, 128 - h);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  tuftMat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  return tuftMat;
}
