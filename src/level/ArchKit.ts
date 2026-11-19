import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import { addOutline, toon } from '../render/Materials';

/**
 * Architecture kit (art pass, phase 3): cream stonework that dresses the plain sides and
 * roofs of the wonky houses so no background house reads as a flat-coloured block.
 *  · arched windows (cream surround, keystone, dark glass) on the side walls
 *  · a ring balcony high on one side
 *  · a cupola on the ridge (instead of some chimneys)
 *  · a striped awning over the door
 *  · one red banner — the single accent colour
 * Visual only (no colliders); everything stays flush with the walls or above head height.
 * All pieces use painted textures, so each art style restyles them.
 */

export interface WallFrame {
  /** the walls' own bend (bulge, taper, twist, lean): a point on the unbent box → where it ends up */
  at(x: number, y: number, z: number): THREE.Vector3;
  /** the twist angle at height y (pieces turn with the wall) */
  twist(y: number): number;
  H: number;
  w: number;
  d: number;
}

interface KitMats {
  cream: THREE.Material;
  glass: THREE.Material;
  red: THREE.Material;
  awning: THREE.Material;
  metal: THREE.Material;
}

const cache = new WeakMap<AssetManager, KitMats>();

function stripes(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 8;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#f6ead6' : '#e0574a';
    g.fillRect(i * 8, 0, 8, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.name = 'awning';
  return t;
}

function mats(assets: AssetManager): KitMats {
  let m = cache.get(assets);
  if (!m) {
    m = {
      cream: toon({ map: assets.tex('stone_cream'), color: '#fff8ee' }),
      glass: toon({ color: '#2a2440' }),
      red: toon({ color: '#d8443a' }),
      awning: toon({ map: stripes() }),
      metal: toon({ color: '#3a3346' }),
    };
    (m.red as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    (m.awning as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    cache.set(assets, m);
  }
  return m;
}

const ink = (m: THREE.Mesh, t = 0.035) => {
  addOutline(m, t).userData.staticInk = true;
  m.userData.noPaint = true;
  return m;
};

/** An arched window: surround + keystone + glass, built facing +z at the origin. */
function archWindow(k: KitMats, w: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const glassShape = new THREE.Shape();
  glassShape.moveTo(-w / 2, 0);
  glassShape.lineTo(-w / 2, h - w / 2);
  glassShape.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
  glassShape.lineTo(w / 2, 0);
  glassShape.lineTo(-w / 2, 0);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(glassShape, 12), k.glass);
  glass.position.z = 0.02;
  g.add(glass);
  const t = 0.16;
  // surround: two jambs, the arch, a sill
  for (const sx of [-1, 1]) {
    const j = ink(new THREE.Mesh(new THREE.BoxGeometry(t, h - w / 2, 0.12), k.cream));
    j.position.set(sx * (w / 2 + t / 2), (h - w / 2) / 2, 0.06);
    g.add(j);
  }
  const arch = ink(new THREE.Mesh(new THREE.TorusGeometry(w / 2 + t / 2, t / 2, 4, 16, Math.PI), k.cream));
  arch.position.set(0, h - w / 2, 0.06);
  arch.scale.z = 0.75;
  g.add(arch);
  const key = ink(new THREE.Mesh(new THREE.BoxGeometry(t * 1.3, t * 1.8, 0.16), k.cream));
  key.position.set(0, h + t * 0.4, 0.08);
  g.add(key);
  const sill = ink(new THREE.Mesh(new THREE.BoxGeometry(w + t * 3, t * 0.8, 0.22), k.cream));
  sill.position.set(0, -t * 0.4, 0.1);
  g.add(sill);
  // a muntin cross
  const mv = new THREE.Mesh(new THREE.BoxGeometry(0.05, h - 0.1, 0.04), k.cream);
  mv.position.set(0, (h - 0.1) / 2, 0.05);
  const mh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.04), k.cream);
  mh.position.set(0, (h - w / 2) * 0.6, 0.05);
  g.add(mv, mh);
  return g;
}

/** Half-ring balcony with a railing, built against a wall facing +z. */
function balcony(k: KitMats, r: number): THREE.Group {
  const g = new THREE.Group();
  const deck = ink(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.92, 0.22, 16, 1, false, -Math.PI / 2, Math.PI), k.cream));
  g.add(deck);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(r * 0.96, 0.045, 4, 18, Math.PI), k.metal);
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = 0.85;
  g.add(rail);
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 4), k.metal);
    p.position.set(Math.cos(a) * r * 0.96, 0.42, Math.sin(a) * r * 0.96);
    g.add(p);
  }
  // corbels under the deck
  for (const sx of [-0.55, 0, 0.55]) {
    const c = ink(new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 4), k.cream), 0.02);
    c.rotation.x = Math.PI;
    c.position.set(sx * r, -0.38, 0.18);
    g.add(c);
  }
  return g;
}

function cupola(k: KitMats, r: number): THREE.Group {
  const g = new THREE.Group();
  const drum = ink(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, r * 1.3, 10), k.cream));
  drum.position.y = r * 0.65;
  g.add(drum);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.35, r * 0.7), k.glass);
    win.position.set(Math.sin(a) * r * 1.01, r * 0.7, Math.cos(a) * r * 1.01);
    win.rotation.y = a;
    g.add(win);
  }
  const dome = ink(new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), k.cream));
  dome.position.y = r * 1.3;
  g.add(dome);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.7, 6), k.metal);
  finial.position.y = r * 2.6;
  g.add(finial);
  return g;
}

function awning(k: KitMats, w: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, 0.95, 1, 1);
  const tex = (k.awning as THREE.MeshStandardMaterial).map;
  if (tex) tex.repeat.set(w / 1.2, 1);
  const m = ink(new THREE.Mesh(geo, k.awning), 0.02);
  m.rotation.x = -Math.PI / 2 + 0.55; // slopes out and down
  return m;
}

function banner(k: KitMats, h: number): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6), k.metal);
  pole.rotation.x = Math.PI / 2;
  pole.position.set(0, 0, 0.6);
  g.add(pole);
  const shape = new THREE.Shape();
  shape.moveTo(-0.45, 0);
  shape.lineTo(0.45, 0);
  shape.lineTo(0.45, -h);
  shape.lineTo(0, -h + 0.45);
  shape.lineTo(-0.45, -h);
  shape.lineTo(-0.45, 0);
  const cloth = ink(new THREE.Mesh(new THREE.ShapeGeometry(shape), k.red), 0.02);
  cloth.position.set(0, -0.05, 1.05);
  cloth.rotation.y = Math.PI / 2;
  g.add(cloth);
  return g;
}

/**
 * Dress a wonky house. `frame` describes its bent walls (local space: front = +z).
 * `rnd` is the house's own seeded random, so every rebuild looks the same.
 */
export function dressWithKit(
  assets: AssetManager,
  group: THREE.Group,
  f: WallFrame,
  rnd: () => number,
  opts: { roofRidgeY: number | null; ridgeAlongX: boolean; door: { x: number; y: number } | null; replacedChimney: boolean; ridgeAt?: ((a: number) => THREE.Vector3) | null },
): void {
  const k = mats(assets);
  // every kit piece is static on its wall: WonkyBuilding merges them per material (batchStatic)
  const before = new Set(group.children);
  const markBatch = () => {
    for (const c of group.children) {
      if (before.has(c)) continue;
      c.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) o.userData.batch = true;
      });
    }
  };
  const floors = Math.max(1, Math.floor((f.H - 2.6) / 3.2));
  // arched windows on both side walls (±x), one row per floor above the ground floor
  for (const side of [-1, 1]) {
    const across = f.d - 1.8;
    const cols = Math.max(1, Math.min(3, Math.floor(across / 2.3)));
    for (let fl = 0; fl < floors; fl++) {
      const y = 2.9 + fl * 3.2;
      if (y + 2 > f.H - 0.4) break;
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.15) continue; // a gap here and there
        const zz = cols === 1 ? 0 : -across / 2 + ((c + 0.5) / cols) * across;
        const win = archWindow(k, 0.95, 1.75);
        win.position.copy(f.at(side * (f.w / 2 + 0.03), y + 0.9, zz)).setY(y);
        win.rotation.y = side * (Math.PI / 2) + f.twist(y + 0.9);
        group.add(win);
      }
    }
  }
  // a ring balcony high on one side
  if (f.H > 7 && rnd() < 0.7) {
    const side = rnd() < 0.5 ? -1 : 1;
    const y = f.H - 2.6;
    const b = balcony(k, Math.min(1.3, f.d * 0.22));
    b.position.copy(f.at(side * (f.w / 2 + 0.02), y, (rnd() - 0.5) * f.d * 0.3));
    b.rotation.y = side * (Math.PI / 2) + f.twist(y);
    group.add(b);
  }
  // cupola on the ridge: sunk into the roof at the ridge's real (crooked, sagging) position
  if (opts.roofRidgeY !== null && opts.replacedChimney && opts.ridgeAt) {
    const c = cupola(k, Math.min(0.85, Math.min(f.w, f.d) * 0.12));
    const along = (rnd() - 0.5) * (opts.ridgeAlongX ? f.w : f.d) * 0.4;
    c.position.copy(opts.ridgeAt(along)).add(new THREE.Vector3(0, -0.45, 0));
    group.add(c);
  }
  // striped awning over the door
  if (opts.door) {
    const a = awning(k, 2.4);
    const y = opts.door.y + 1.55;
    a.position.copy(f.at(opts.door.x, y, f.d / 2 + 0.42));
    a.rotation.y = f.twist(y);
    a.rotation.order = 'YXZ';
    group.add(a);
  }
  // the single red accent: a banner on one corner, on some houses only
  if (rnd() < 0.45) {
    const side = rnd() < 0.5 ? -1 : 1;
    const y = f.H - 1.2;
    const b = banner(k, Math.min(3.2, f.H * 0.32));
    // on a SIDE wall, near the back corner: never over the painted face on the front
    // (it used to hang across the face and catch the spray meant for the eyes)
    b.position.copy(f.at(side * (f.w / 2), y, -f.d / 2 + 0.7));
    b.rotation.y = side * (Math.PI / 2) + f.twist(y);
    group.add(b);
  }
  markBatch();
}
