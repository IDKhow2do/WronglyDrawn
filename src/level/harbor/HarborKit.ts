import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AssetManager } from '../../core/AssetManager';
import { PAL, paintCanvas, toTexture } from '../../render/PaintTextures';
import { DUSK } from './HarborTerrain';

/**
 * Mute Harbor's modelling kit: the pieces the level's set-piece models (clock tower, ferry,
 * lighthouse, bell bridge, stalls…) are built from, in Blind Plaza's language — lofted and lathed
 * shapes with a hand-drawn wobble, painted textures tiled in world scale (never stretched over a
 * whole wall), and ink hulls merged into one mesh per model.
 */

// ───────────── static batching: one mesh per material + one shared ink hull (few draw calls) ─────────────
export const INK = new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide });

function prep(g: THREE.BufferGeometry, keepUv: boolean): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && (k !== 'uv' || !keepUv)) geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  if (keepUv && !geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
  return geo;
}

export class StaticBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private hulls: THREE.BufferGeometry[] = [];

  /**
   * Add a geometry in the batch's space (consumed). `outline` = ink thickness (0 = none); the hull
   * is the geometry scaled about its own centre, or `hull` when the shape needs a better one.
   */
  add(g: THREE.BufferGeometry, mat: THREE.Material, outline = 0.04, hull?: THREE.BufferGeometry): void {
    const geo = prep(g, true);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(geo);
    if (hull) this.hulls.push(prep(hull, false));
    else if (outline > 0) {
      geo.computeBoundingBox();
      const bb = geo.boundingBox!;
      const c = bb.getCenter(new THREE.Vector3());
      const size = bb.getSize(new THREE.Vector3());
      // a flat piece (decal, pane, flag) has no inside: its scaled "hull" lies in its own plane and
      // only z-fights it — no ink for those
      if (Math.min(size.x, size.y, size.z) < 0.005) return;
      const h = geo.clone();
      h.deleteAttribute('uv');
      h.translate(-c.x, -c.y, -c.z);
      h.scale(1 + (2 * outline) / Math.max(size.x, 0.01), 1 + (2 * outline) / Math.max(size.y, 0.01), 1 + (2 * outline) / Math.max(size.z, 0.01));
      h.translate(c.x, c.y, c.z);
      this.hulls.push(h);
    }
  }

  /** A box (centre, half extents, yaw). */
  box(c: THREE.Vector3, half: THREE.Vector3, mat: THREE.Material, yaw = 0, outline = 0.04): void {
    const g = new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2);
    g.rotateY(yaw);
    g.translate(c.x, c.y, c.z);
    this.add(g, mat, outline);
  }

  /** Every geometry added so far goes through `fn` (e.g. a model's hand-drawn lean) — hulls too. */
  warp(fn: (g: THREE.BufferGeometry) => void): void {
    for (const list of this.parts.values()) for (const g of list) fn(g);
    for (const h of this.hulls) fn(h);
  }

  flush(root: THREE.Object3D, name = 'harbor-batch'): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [mat, list] of this.parts) {
      const m = new THREE.Mesh(mergeGeometries(list)!, mat);
      m.castShadow = m.receiveShadow = true;
      m.name = name;
      root.add(m);
      out.push(m);
    }
    if (this.hulls.length) {
      const o = new THREE.Mesh(mergeGeometries(this.hulls)!, INK);
      o.userData.isOutline = true;
      o.userData.noPaint = true;
      o.name = `${name}-ink`;
      root.add(o);
    }
    this.parts.clear();
    this.hulls = [];
    return out;
  }
}

// ───────────── geometry helpers ─────────────
export function seeded(seed: number): () => number {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * Box-projected UVs in model units (one texture tile = `tile` metres), so a painted texture keeps
 * its brick/plank size on any piece instead of being stretched across it. Returns a non-indexed copy.
 */
export function worldUV(g: THREE.BufferGeometry, tile = 4, ox = 0, oy = 0, sidesOnly = false): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    n.crossVectors(b.clone().sub(a), c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const p = k === 0 ? a : k === 1 ? b : c;
      let u: number, v: number;
      if (!sidesOnly && ay >= ax && ay >= az) (u = p.x), (v = p.z);
      else if (ax >= az) (u = p.z), (v = p.y);
      else (u = p.x), (v = p.y);
      uv[(i + k) * 2] = u / tile + ox;
      uv[(i + k) * 2 + 1] = v / tile + oy;
    }
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geo;
}

/** Hand-drawn wobble: every vertex nudged by a smooth function of where it is (shared corners stay shared). */
export function wonk<T extends THREE.BufferGeometry>(g: T, amount = 0.05, seed = 1): T {
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    pos.setXYZ(
      i,
      x + amount * (Math.sin(y * 1.31 + seed) * 0.6 + Math.sin(z * 2.17 + seed * 1.7) * 0.4),
      y + amount * 0.6 * Math.sin(x * 1.73 + z * 1.19 + seed * 2.3),
      z + amount * (Math.sin(y * 1.57 + seed * 3.1) * 0.6 + Math.sin(x * 2.03 + seed * 0.7) * 0.4),
    );
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** A box with a hand-drawn wobble and world-scale UVs (the workhorse masonry / timber piece). */
export function block(w: number, h: number, d: number, amount = 0.03, seed = 1, tile = 4, seg = 1): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, seg, 1);
  wonk(g, amount, seed);
  return worldUV(g, tile, seed * 0.137, seed * 0.071);
}

/** A closed ring of points at height y (outline given as [x, z] pairs), scaled about the origin. */
export function ring(outline: [number, number][], y: number, sx = 1, sz = sx, ox = 0, oz = 0): THREE.Vector3[] {
  return outline.map(([x, z]) => new THREE.Vector3(x * sx + ox, y, z * sz + oz));
}

/** Rounded rectangle outline (half extents hx × hz, corner radius r). */
export function roundRect(hx: number, hz: number, r: number, seg = 4): [number, number][] {
  const out: [number, number][] = [];
  const corners: [number, number, number][] = [[hx - r, hz - r, 0], [-(hx - r), hz - r, Math.PI / 2], [-(hx - r), -(hz - r), Math.PI], [hx - r, -(hz - r), Math.PI * 1.5]];
  for (const [cx, cz, a0] of corners)
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  return out;
}

/** Skin a stack of rings (same point count) into a solid: sides + optional caps. Creased normals. */
export function loft(rings: THREE.Vector3[][], capTop = true, capBottom = false, crease = 0.7): THREE.BufferGeometry {
  const P: number[] = [];
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  const n = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = rings[i][j], b = rings[i][(j + 1) % n], c = rings[i + 1][(j + 1) % n], d = rings[i + 1][j];
      tri(a, c, b);
      tri(a, d, c);
    }
  const cap = (r: THREE.Vector3[], flip: boolean) => {
    const c = r.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / r.length);
    for (let j = 0; j < n; j++) (flip ? tri(c, r[j], r[(j + 1) % n]) : tri(c, r[(j + 1) % n], r[j]));
  };
  if (capTop) cap(rings[rings.length - 1], false);
  if (capBottom) cap(rings[0], true);
  // outward-facing whatever the ring order: flip everything if the signed volume is negative
  let vol = 0;
  for (let i = 0; i < P.length; i += 9) {
    vol +=
      P[i] * (P[i + 4] * P[i + 8] - P[i + 5] * P[i + 7]) -
      P[i + 1] * (P[i + 3] * P[i + 8] - P[i + 5] * P[i + 6]) +
      P[i + 2] * (P[i + 3] * P[i + 7] - P[i + 4] * P[i + 6]);
  }
  if (vol < 0)
    for (let i = 0; i < P.length; i += 9)
      for (let k = 0; k < 3; k++) {
        const t = P[i + 3 + k];
        P[i + 3 + k] = P[i + 6 + k];
        P[i + 6 + k] = t;
      }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return crease > 0 ? toCreasedNormals(g, crease) : g;
}

/** An ink hull for a lofted solid: the same rings pushed out sideways (and the ends up/down). */
export function loftHull(rings: THREE.Vector3[][], t = 0.05): THREE.BufferGeometry {
  const grown = rings.map((r, i) => {
    const c = r.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / r.length);
    return r.map((p) => {
      const d = new THREE.Vector3(p.x - c.x, 0, p.z - c.z);
      const l = d.length() || 1;
      return new THREE.Vector3(p.x + (d.x / l) * t, p.y + (i === 0 ? -t : i === rings.length - 1 ? t : 0), p.z + (d.z / l) * t);
    });
  });
  return loft(grown, true, true, 0);
}

export const v2 = (r: number, y: number) => new THREE.Vector2(r, y);

/** Lathe with a hand-drawn wobble in the radius and UVs in metres (u around, v up). */
export function lathe(pts: THREE.Vector2[], seg = 20, wobble = 0.02, tile = 4, phase = 0): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(pts, seg);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  let rMax = 0;
  for (const p of pts) rMax = Math.max(rMax, p.x);
  const around = Math.max(1, Math.round((Math.PI * 2 * rMax) / tile));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
    if (wobble) {
      const a = Math.atan2(z, x);
      const k = 1 + wobble * (Math.sin(a * 3 + 0.7 + phase) * 0.6 + Math.sin(a * 5 - 1.3 + phase * 2) * 0.4);
      pos.setXYZ(i, x * k, y, z * k);
    }
    uv.setXY(i, uv.getX(i) * around, y / tile);
  }
  if (wobble) g.computeVertexNormals();
  return g;
}

/** Ink hull for a lathe: the profile pushed out by t. */
export function latheHull(pts: THREE.Vector2[], seg = 20, wobble = 0.02, t = 0.04, phase = 0): THREE.BufferGeometry {
  const off = pts.map((p, i) => v2(p.x + t, p.y + (i === 0 ? -t : i === pts.length - 1 ? t : 0)));
  // close the ends so the back faces cover the rim
  const closed = [v2(0.001, off[0].y), ...off, v2(0.001, off[off.length - 1].y)];
  return lathe(closed, seg, wobble, 4, phase);
}

/** A round-headed (arched) outline, origin at the middle of its sill. */
export function archShape(w: number, h: number, seg = 10): THREE.Shape {
  const s = new THREE.Shape();
  const r = w / 2;
  const spring = Math.max(0.01, h - r);
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, spring);
  for (let i = 1; i <= seg; i++) {
    const a = (i / seg) * Math.PI;
    s.lineTo(Math.cos(a) * r, spring + Math.sin(a) * r);
  }
  s.closePath();
  return s;
}

/** An arched frame (surround) of thickness t and depth d, facing +z, sill at y = 0. */
export function archFrame(w: number, h: number, t = 0.16, d = 0.14): THREE.BufferGeometry {
  const outer = archShape(w + t * 2, h + t, 12);
  const hole = new THREE.Path();
  const r = w / 2;
  const spring = Math.max(0.01, h - r);
  hole.moveTo(-r, 0.001);
  hole.lineTo(-r, spring);
  for (let i = 1; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    hole.lineTo(Math.cos(a) * r, spring + Math.sin(a) * r);
  }
  hole.lineTo(r, 0.001);
  hole.closePath();
  outer.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(outer, { depth: d, bevelEnabled: false, curveSegments: 4 });
  return g;
}

/** A wall panel w × h with an arched opening cut out of it (belfry arcades, bridge gate), depth d, facing +z. */
export function archWall(w: number, h: number, openW: number, openH: number, d: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  const r = openW / 2;
  const spring = Math.max(0.01, openH - r);
  s.lineTo(-r, 0);
  s.lineTo(-r, spring);
  for (let i = 1; i <= 12; i++) {
    const a = Math.PI - (i / 12) * Math.PI;
    s.lineTo(Math.cos(a) * r, spring + Math.sin(a) * r);
  }
  s.lineTo(r, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A crown (the city's tag) as plain geometry for a batch: band + five spikes. */
export function crownGeos(size: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(size * 0.5, size * 0.46, size * 0.28, 10)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    out.push(new THREE.ConeGeometry(size * 0.15, size * (0.4 + (i % 2) * 0.16), 4).translate(Math.cos(a) * size * 0.4, size * 0.32, Math.sin(a) * size * 0.4));
  }
  return out;
}

/** A tube along a list of points (ropes, rails, mooring lines). */
export function tube(pts: THREE.Vector3[], r = 0.04, seg = 12, radial = 5): THREE.BufferGeometry {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, radial, false);
}

/**
 * Drop the inverted-hull ink of FLAT pieces (banners, awnings, flags, sails, panes — anything whose
 * geometry is thinner than 5 mm on one local axis). Such a "hull" is the shape scaled inside its own
 * plane, so it lies exactly on the cloth and z-fights it from the back (the black/red flicker on
 * the houses' banners and awnings). Run before mergeStaticInk. Returns how many it removed.
 */
export function dropFlatInk(root: THREE.Object3D): number {
  const flat: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || !m.userData.isOutline || o.name !== 'outline') return;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const s = g.boundingBox!.getSize(new THREE.Vector3());
    if (Math.min(s.x, s.y, s.z) < 0.005) flat.push(o);
  });
  for (const o of flat) o.removeFromParent();
  return flat.length;
}

/** A string of bunting between two points: one vertex-coloured mesh + its line (Blind Plaza's, in dusk colours). */
export function bunting(root: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, sag = 1.1, n = 16): void {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * sag;
    pts.push(p);
  }
  root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: PAL.black })));
  const cols = [DUSK.coral, DUSK.lamp, DUSK.teal, DUSK.neon, DUSK.lilac, PAL.yellow].map((c) => new THREE.Color(c));
  const P: number[] = [], C: number[] = [];
  for (let i = 0; i < n; i++) {
    const m = pts[i].clone().lerp(pts[i + 1], 0.5);
    const d = pts[i + 1].clone().sub(pts[i]).setY(0).normalize().multiplyScalar(0.3);
    P.push(m.x - d.x, m.y, m.z - d.z, m.x + d.x, m.y, m.z + d.z, m.x, m.y - 0.6, m.z);
    const c = cols[i % cols.length];
    for (let k = 0; k < 3; k++) C.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.userData.noPaint = true;
  root.add(m);
}

// ───────────── painted textures (made once, cached in the asset manager) ─────────────
type G2 = CanvasRenderingContext2D;
function cv(w: number, h = w): [HTMLCanvasElement, G2] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** A wobbly hand-inked line. */
function inkLine(g: G2, r: () => number, x0: number, y0: number, x1: number, y1: number, lw: number, color = '#1a1420'): void {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x0, y0);
  const mx = (x0 + x1) / 2 + (r() - 0.5) * lw * 1.5, my = (y0 + y1) / 2 + (r() - 0.5) * lw * 1.5;
  g.quadraticCurveTo(mx, my, x1, y1);
  g.stroke();
}

/** Brushy wash over a canvas region: translucent strokes of a few tones. */
function wash(g: G2, r: () => number, w: number, h: number, tones: string[], n = 60, alpha = 0.35): void {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = alpha * (0.5 + r() * 0.7);
    g.strokeStyle = tones[Math.floor(r() * tones.length) % tones.length];
    g.lineWidth = w * (0.02 + r() * 0.05);
    const x = r() * w, y = r() * h, a = (r() - 0.5) * 1.2, l = w * (0.1 + r() * 0.25);
    g.beginPath();
    g.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
    g.quadraticCurveTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** The clock's dial: cream paint, roman numerals round the rim, minute ticks, blush for its cheeks. */
function dialCanvas(): HTMLCanvasElement {
  const S = 1024;
  const [c, g] = cv(S);
  const r = seeded(77);
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
  g.clip();
  g.fillStyle = '#fff1dc';
  g.fillRect(0, 0, S, S);
  wash(g, r, S, S, ['#ffe2c2', '#ffd6e0', '#fff8ea', '#f6dcc0', '#e8d6ff'], 90, 0.4);
  // age stain round the rim
  const gr = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5);
  gr.addColorStop(0, 'rgba(160,110,170,0)');
  gr.addColorStop(1, 'rgba(160,110,170,0.38)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  g.restore();
  g.translate(S / 2, S / 2);
  // rings
  g.strokeStyle = '#1a1420';
  for (const [rad, lw] of [[S * 0.485, 14], [S * 0.4, 5], [S * 0.305, 4]] as [number, number][]) {
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i <= 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      const rr = rad + Math.sin(a * 5 + rad) * 2.2;
      if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.stroke();
  }
  // minute ticks
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const big = i % 5 === 0;
    inkLine(g, r, Math.sin(a) * S * 0.405, -Math.cos(a) * S * 0.405, Math.sin(a) * S * (big ? 0.445 : 0.428), -Math.cos(a) * S * (big ? 0.445 : 0.428), big ? 9 : 4);
  }
  // numerals
  const NUM = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.save();
    g.translate(Math.sin(a) * S * 0.352, -Math.cos(a) * S * 0.352);
    g.rotate(a + (r() - 0.5) * 0.12);
    g.font = `bold ${Math.round(S * (i % 3 === 0 ? 0.078 : 0.06))}px Georgia, "Times New Roman", serif`;
    g.fillStyle = i % 3 === 0 ? '#3a2f8f' : '#1a1420';
    g.fillText(NUM[i], 0, 0);
    g.restore();
  }
  // blush
  for (const sx of [-1, 1]) {
    const bl = g.createRadialGradient(sx * S * 0.2, S * 0.05, 0, sx * S * 0.2, S * 0.05, S * 0.085);
    bl.addColorStop(0, 'rgba(255,90,150,0.55)');
    bl.addColorStop(1, 'rgba(255,90,150,0)');
    g.fillStyle = bl;
    g.beginPath();
    g.arc(sx * S * 0.2, S * 0.05, S * 0.09, 0, Math.PI * 2);
    g.fill();
  }
  // a few paint flecks (the town's graffiti gets everywhere)
  for (let i = 0; i < 9; i++) {
    g.fillStyle = [DUSK.teal, DUSK.neon, DUSK.lamp, DUSK.coral][i % 4];
    g.globalAlpha = 0.6;
    const a = r() * Math.PI * 2, d = S * (0.12 + r() * 0.3);
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

/** An arched window: cream frame, dusk glass with streaks, mullions. Transparent outside the arch. */
function windowCanvas(lit: boolean): HTMLCanvasElement {
  const W = 192, H = 320;
  const [c, g] = cv(W, H);
  const r = seeded(lit ? 5 : 9);
  const arch = (inset: number) => {
    const rad = W / 2 - inset;
    g.beginPath();
    g.moveTo(inset, H - inset);
    g.lineTo(inset, W / 2);
    g.arc(W / 2, W / 2, rad, Math.PI, 0);
    g.lineTo(W - inset, H - inset);
    g.closePath();
  };
  arch(3);
  g.fillStyle = '#1a1420';
  g.fill();
  arch(12);
  g.fillStyle = '#fff1dc';
  g.fill();
  arch(30);
  g.fillStyle = '#1a1420';
  g.fill();
  g.save();
  arch(36);
  g.clip();
  const gr = g.createLinearGradient(0, 0, 0, H);
  if (lit) {
    gr.addColorStop(0, '#ffe9a8');
    gr.addColorStop(1, '#ffb070');
  } else {
    gr.addColorStop(0, '#3a2f8f');
    gr.addColorStop(1, '#1c1650');
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  // reflections
  g.globalAlpha = lit ? 0.45 : 0.35;
  g.strokeStyle = lit ? '#fffbe0' : '#b49cff';
  g.lineWidth = 12;
  g.lineCap = 'round';
  for (const k of [0.25, 0.5]) {
    g.beginPath();
    g.moveTo(W * (k + 0.25), H * 0.15);
    g.lineTo(W * (k - 0.1), H * 0.7);
    g.stroke();
  }
  g.globalAlpha = 1;
  g.restore();
  // mullions
  inkLine(g, r, W / 2, 34, W / 2, H - 32, 9);
  inkLine(g, r, 34, H * 0.42, W - 34, H * 0.42, 8);
  inkLine(g, r, 34, H * 0.7, W - 34, H * 0.7, 8);
  return c;
}

/** Candy stripes (awnings, lighthouse, life rings): brushy bands with inked seams. Tiles in u. */
function stripeCanvas(a: string, b: string, n = 4, seed = 3, vertical = true): HTMLCanvasElement {
  const S = 256;
  const [c, g] = cv(S);
  const r = seeded(seed);
  for (let i = 0; i < n * 2; i++) {
    g.fillStyle = i % 2 ? b : a;
    if (vertical) g.fillRect((i * S) / (n * 2), 0, S / (n * 2) + 1, S);
    else g.fillRect(0, (i * S) / (n * 2), S, S / (n * 2) + 1);
  }
  wash(g, r, S, S, ['#ffffff', '#3a1f50', a, b], 40, 0.14);
  g.strokeStyle = 'rgba(26,20,32,0.55)';
  g.lineWidth = 2.5;
  for (let i = 0; i < n * 2; i++) {
    g.beginPath();
    const p = (i * S) / (n * 2);
    if (vertical) {
      g.moveTo(p, 0);
      g.lineTo(p + (r() - 0.5) * 3, S);
    } else {
      g.moveTo(0, p);
      g.lineTo(S, p + (r() - 0.5) * 3);
    }
    g.stroke();
  }
  return c;
}

/** A plank door with strap hinges and a round window. */
function doorCanvas(base: string, dark: string): HTMLCanvasElement {
  const W = 192, H = 320;
  const [c, g] = cv(W, H);
  const r = seeded(21);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  wash(g, r, W, H, [dark, '#ffffff', base], 40, 0.2);
  for (let i = 1; i < 5; i++) inkLine(g, r, (i * W) / 5, 4, (i * W) / 5 + (r() - 0.5) * 4, H - 4, 4, dark);
  g.fillStyle = '#1a1420';
  for (const y of [H * 0.2, H * 0.78]) {
    g.fillRect(0, y - 9, W * 0.7, 18);
    g.beginPath();
    g.arc(W * 0.7, y, 13, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.arc(W / 2, H * 0.36, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = DUSK.lamp;
  g.beginPath();
  g.arc(W / 2, H * 0.36, 21, 0, Math.PI * 2);
  g.fill();
  inkLine(g, r, W / 2 - 21, H * 0.36, W / 2 + 21, H * 0.36, 4);
  inkLine(g, r, W / 2, H * 0.36 - 21, W / 2, H * 0.36 + 21, 4);
  g.fillStyle = '#ffc85a';
  g.strokeStyle = '#1a1420';
  g.lineWidth = 4;
  g.beginPath();
  g.arc(W * 0.82, H * 0.55, 11, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.lineWidth = 10;
  g.strokeRect(3, 3, W - 6, H - 6);
  return c;
}

/** A flat colour with brushwork in it: the level's "no flat blocks" paint (tiles). */
function brushed(seed: number, base: string, tones: string[]): HTMLCanvasElement {
  return paintCanvas({ seed, base, colors: tones, strokes: 34, splats: 2, drips: 1, scribbles: 0, grain: 500 });
}

/** Rope / net weave on transparent ground (drying nets). */
function netCanvas(): HTMLCanvasElement {
  const S = 256;
  const [c, g] = cv(S);
  const r = seeded(31);
  g.clearRect(0, 0, S, S);
  for (let i = -8; i <= 16; i++) {
    inkLine(g, r, i * 32, 0, i * 32 + S, S, 4, '#2a2250');
    inkLine(g, r, i * 32, 0, i * 32 - S, S, 4, '#2a2250');
  }
  g.fillStyle = '#ffe08a';
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 8; j++) {
      if ((i + j) % 3) continue;
      g.beginPath();
      g.arc(i * 32 + 16, j * 32 + 16, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  return c;
}

/** The ferry's paddle-box face: a painted sunburst over a half disc (the upper half of the canvas is used). */
function paddleCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const r = seeded(61);
  g.fillStyle = '#fff1dc';
  g.fillRect(0, 0, S, S);
  g.translate(S / 2, S / 2);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI + (i / n) * Math.PI, a1 = Math.PI + ((i + 1) / n) * Math.PI;
    g.fillStyle = i % 2 ? '#fff1dc' : [DUSK.coral, DUSK.teal, DUSK.lamp][(i / 2) % 3 | 0];
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, S * 0.5, a0, a1);
    g.closePath();
    g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  wash(g, r, S, S / 2, ['#ffffff', '#3a1f50', '#ffd6e0'], 50, 0.12);
  g.translate(S / 2, S / 2);
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    inkLine(g, r, Math.cos(a) * S * 0.2, Math.sin(a) * S * 0.2, Math.cos(a) * S * 0.47, Math.sin(a) * S * 0.47, 5);
  }
  // the roundel in the middle (where the ferry's mouth goes) and the rim
  g.fillStyle = DUSK.indigo;
  g.beginPath();
  g.arc(0, -S * 0.02, S * 0.24, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#1a1420';
  g.lineWidth = 9;
  g.stroke();
  g.strokeStyle = '#ffc85a';
  g.lineWidth = 6;
  g.beginPath();
  g.arc(0, -S * 0.02, S * 0.2, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = '#1a1420';
  g.lineWidth = 16;
  g.beginPath();
  g.arc(0, 0, S * 0.49, Math.PI, Math.PI * 2);
  g.stroke();
  return c;
}

/** Build the kit's textures once (names prefixed h2_). */
export function ensureKitTextures(assets: AssetManager): void {
  if (assets.textures.has('h2_dial')) return;
  const put = (name: string, c: HTMLCanvasElement, clamp = false) => {
    const t = toTexture(c);
    if (clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 8;
    t.name = name;
    assets.textures.set(name, t);
  };
  put('h2_dial', dialCanvas(), true);
  put('h2_window', windowCanvas(false), true);
  put('h2_window_lit', windowCanvas(true), true);
  put('h2_stripe_coral', stripeCanvas('#fff1dc', DUSK.coral, 4, 3));
  put('h2_stripe_teal', stripeCanvas('#fff1dc', DUSK.teal, 4, 5));
  put('h2_stripe_neon', stripeCanvas('#fff1dc', DUSK.neon, 4, 7));
  put('h2_stripe_lamp', stripeCanvas(DUSK.indigo, DUSK.lamp, 4, 9));
  put('h2_bands', stripeCanvas('#fff1dc', DUSK.coral, 2, 11, false));
  put('h2_door', doorCanvas('#4a3fb0', '#231b52'), true);
  put('h2_door_teal', doorCanvas(DUSK.teal, DUSK.deepTeal), true);
  put('h2_net', netCanvas());
  put('h2_paddle', paddleCanvas(), true);
  put('h2_p_coral', brushed(41, DUSK.coral, ['#ff9a86', '#ff5f6b', '#ffb38a', '#e85a70']));
  put('h2_p_cream', brushed(43, '#fff1dc', ['#ffe2c2', '#ffd6e0', '#fffaf0', '#e8d6ff']));
  put('h2_p_neon', brushed(45, DUSK.neon, ['#ff6fbd', '#e0308f', '#ff8fc8', '#c8307f']));
  put('h2_p_teal', brushed(47, DUSK.teal, ['#3fd0c8', '#128f98', '#5fe0d0', '#0f6f78']));
  put('h2_p_indigo', brushed(49, DUSK.indigo, ['#5a4bd1', '#231b52', '#6a5fd8', '#2c2478']));
  put('h2_p_blue', brushed(51, '#2f6fd0', ['#4a8fe8', '#1f4fa8', '#5aa8f0', '#2b8fb8']));
  put('h2_p_brass', brushed(53, '#ffc85a', ['#ffe08a', '#e89a30', '#fff0b0', '#d88a2a']));
  put('h2_p_ink', brushed(55, '#2a2230', ['#3a3048', '#1a1420', '#4a3f6a', '#231b52']));
  put('h2_p_paper', brushed(57, '#fff6e6', ['#ffe9d6', '#ffffff', '#f0e0ff', '#ffe08a']));
}
