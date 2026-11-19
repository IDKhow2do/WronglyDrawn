import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import { addOutline, toon } from '../render/Materials';
import { heightAt, onIsland, LEGS, SUMMIT } from './Terrain';

/**
 * World shape for Blind Plaza (art pass, phase 2) — decor only: no colliders, nothing on a
 * play path. Layered, flat-topped slab forms instead of smooth humps and cones:
 *
 *  · far landmarks — floating mesas stacked from offset slabs, carrying our own architecture
 *    (a broken arch bridge, a ring-balcony spire, a colonnade, a domed hall), seen through haze;
 *  · the Correction Tower gets a stepped plinth and ring balconies;
 *  · slab outcrops on ground WAI can't reach (the east high ground, the hill's back);
 *  · clumps of lavender on the grass.
 *
 * Every surface uses the painted textures, so each art style restyles it like the rest.
 */
/** Tints for the slab rock of a level's landscape. */
export interface LandTint {
  rock: [string, string, string];
  cream: string;
  top: string;
}
const PLAZA_TINT: LandTint = { rock: ['#f3d2bc', '#f6dccb', '#e4dcf2'], cream: '#fff6ea', top: '#f2ead0' };

/**
 * The landscape kit: slab-built mesas and their architecture (shared by every level).
 * Returns the builders plus a `far` group already added to the level root.
 */
export function landscapeKit(ctx: GameContext, seed0 = 41, tint: LandTint = PLAZA_TINT) {
  const { root, assets } = ctx;
  let seed = seed0;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const T = (n: string) => assets.tex(n);
  const mats = {
    rockA: toon({ map: T('stone_orange'), color: tint.rock[0] }),
    rockB: toon({ map: T('stone_pink'), color: tint.rock[1] }),
    rockC: toon({ map: T('stone_purple'), color: tint.rock[2] }),
    cream: toon({ map: T('stone_cream'), color: tint.cream }),
    top: toon({ map: T('hill'), color: tint.top }),
    accent: toon({ color: '#e8473c' }),
  };
  const rocks = [mats.rockA, mats.rockB, mats.rockC];
  const far = new THREE.Group();
  far.name = 'landscape-far';
  root.add(far);

  /** One slab: an irregular flat-topped prism (7–9 sides), outlined. */
  const slab = (r: number, h: number, mat: THREE.Material, sides = 7 + Math.floor(rnd() * 3)): THREE.Mesh => {
    const g = new THREE.CylinderGeometry(r * (0.9 + rnd() * 0.08), r, h, sides, 1);
    // pull vertices around so no two slabs share a silhouette
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const jitter = Array.from({ length: sides + 1 }, () => 0.82 + rnd() * 0.3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const a = Math.atan2(z, x);
      const k = jitter[Math.round(((a + Math.PI) / (Math.PI * 2)) * sides) % (sides + 1)];
      p.setX(i, x * k);
      p.setZ(i, z * k);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.userData.noPaint = true;
    addOutline(m, Math.max(0.05, r * 0.012));
    return m;
  };

  /** A mesa: 2–5 offset slabs stepping up, a flat planted top, a short ragged underside. */
  const mesa = (r: number, layers: number, floating: boolean): { g: THREE.Group; top: number } => {
    const g = new THREE.Group();
    let y = 0;
    let rr = r;
    for (let i = 0; i < layers; i++) {
      // tall walls, few steps: mesas, not a stack of plates
      const h = r * (0.42 + rnd() * 0.3);
      const s = slab(rr, h, rocks[(i + Math.floor(rnd() * 3)) % 3]);
      s.position.set((rnd() - 0.5) * r * 0.12, y + h / 2, (rnd() - 0.5) * r * 0.12);
      s.rotation.y = rnd() * Math.PI;
      g.add(s);
      y += h;
      rr *= 0.62 + rnd() * 0.18;
    }
    const cap = slab(rr * 1.02, r * 0.04, mats.top);
    cap.position.y = y + r * 0.02;
    g.add(cap);
    if (floating) {
      // an underside of two stepped, narrowing slabs (no point: a cut-off rock, not a pyramid)
      const u1 = slab(r * 0.78, r * 0.3, mats.rockA);
      u1.position.y = -r * 0.15;
      const u2 = slab(r * 0.45, r * 0.32, mats.rockB);
      u2.position.y = -r * 0.45;
      g.add(u1, u2);
    }
    return { g, top: y + r * 0.04 };
  };

  // ───────────── architecture on the far mesas ─────────────
  const arch = (span: number, h: number, thick: number): THREE.Group => {
    const g = new THREE.Group();
    const legW = thick * 1.2;
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, h, thick), mats.cream);
      leg.position.set((sx * (span + legW)) / 2, h / 2, 0);
      addOutline(leg, 0.12);
      g.add(leg);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(span / 2 + legW / 2, legW / 2, 6, 24, Math.PI), mats.cream);
    ring.position.y = h;
    ring.scale.z = thick / legW;
    addOutline(ring, 0.12);
    g.add(ring);
    return g;
  };

  const spire = (h: number): THREE.Group => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.045, h * 0.07, h, 10), mats.cream);
    shaft.position.y = h / 2;
    addOutline(shaft, 0.15);
    g.add(shaft);
    for (let i = 0; i < 3; i++) {
      const y = h * (0.45 + i * 0.2);
      const r = h * (0.2 - i * 0.04);
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h * 0.02, 20), mats.cream);
      deck.position.y = y;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, h * 0.008, 4, 28), mats.cream);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y + h * 0.03;
      addOutline(deck, 0.12);
      g.add(deck, ring);
    }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.08, h * 0.16), mats.accent);
    flag.position.set(h * 0.05, h * 0.92, 0);
    (flag.material as THREE.Material).side = THREE.DoubleSide;
    g.add(flag);
    return g;
  };

  const colonnade = (len: number, h: number): THREE.Group => {
    const g = new THREE.Group();
    const n = 7;
    for (let i = 0; i < n; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.06, h * 0.07, h, 8), mats.cream);
      c.position.set(-len / 2 + (i / (n - 1)) * len, h / 2, 0);
      addOutline(c, 0.1);
      g.add(c);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(len + h * 0.3, h * 0.12, h * 0.3), mats.cream);
    beam.position.y = h + h * 0.06;
    addOutline(beam, 0.12);
    g.add(beam);
    return g;
  };

  const domeHall = (r: number): THREE.Group => {
    const g = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, r * 0.9, 16), mats.cream);
    drum.position.y = r * 0.45;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.cream);
    dome.position.y = r * 0.9;
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.05, 4, 24), mats.accent);
    band.rotation.x = Math.PI / 2;
    band.position.y = r * 0.9;
    addOutline(drum, 0.12);
    addOutline(dome, 0.12);
    g.add(drum, dome, band);
    return g;
  };

  return { root, rnd, mats, far, slab, mesa, arch, spire, colonnade, domeHall };
}

export function buildLandscape(ctx: GameContext, tower: THREE.Object3D | null): void {
  const { root, rnd, mats, far, mesa, arch, spire, colonnade, domeHall } = landscapeKit(ctx);
  // [angle (rad, 0 = +x), distance, height, radius, layers, what sits on top]
  type Top = 'arch' | 'spire' | 'colonnade' | 'dome' | 'bare';
  const SPOTS: [number, number, number, number, number, Top][] = [
    [0.35, 150, -14, 16, 3, 'spire'],
    [1.25, 175, -4, 12, 2, 'colonnade'],
    [2.2, 140, -22, 18, 3, 'dome'],
    [2.85, 190, 2, 10, 2, 'bare'],
    [3.6, 160, -12, 14, 3, 'arch'],
    [4.35, 200, 8, 9, 2, 'bare'],
    [5.3, 165, -10, 15, 3, 'colonnade'],
    [5.85, 135, -18, 11, 2, 'bare'],
  ];
  const tops: THREE.Vector3[] = [];
  for (const [a, d, y, r, layers, top] of SPOTS) {
    const m = mesa(r, layers, true);
    m.g.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    m.g.rotation.y = rnd() * Math.PI;
    far.add(m.g);
    const at = new THREE.Vector3(0, m.top, 0);
    const piece =
      top === 'spire' ? spire(r * 3.2) : top === 'colonnade' ? colonnade(r * 1.1, r * 0.55) : top === 'dome' ? domeHall(r * 0.45) : top === 'arch' ? arch(r * 0.8, r * 0.9, r * 0.12) : null;
    if (piece) {
      piece.position.copy(at);
      m.g.add(piece);
    }
    tops.push(m.g.position.clone().add(new THREE.Vector3(0, m.top, 0)));
  }

  // a broken arch bridge reaching from one mesa toward its neighbour (the gap between them is the point)
  {
    const a = tops[4];
    const b = tops[3];
    const dir = b.clone().sub(a).setY(0);
    const len = dir.length();
    dir.normalize();
    const bridge = new THREE.Group();
    const spans = 4;
    for (let i = 0; i < spans; i++) {
      const piece = arch(len / (spans + 1.6) - 1.2, 7 + i * 0.6, 1.4);
      piece.position.set(0, 0, i * (len / (spans + 1.6)));
      piece.rotation.y = Math.PI / 2;
      bridge.add(piece);
    }
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, (len * spans) / (spans + 1.6)), mats.cream);
    deck.position.set(0, 7 + (len / (spans + 1.6) - 1.2) / 2 + 1.6, (len * spans) / (spans + 1.6) / 2 - len / (spans + 1.6) / 2);
    addOutline(deck, 0.12);
    bridge.add(deck);
    bridge.position.copy(a);
    bridge.lookAt(a.clone().add(dir));
    far.add(bridge);
  }

  // ───────────── the Correction Tower: a stepped plinth and ring balconies ─────────────
  if (tower) {
    const plinth = mesa(16, 3, false);
    plinth.g.position.y = -plinth.top + 0.5;
    tower.add(plinth.g);
    for (let i = 0; i < 3; i++) {
      const r = 10 - i * 1.2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.35, 4, 32), mats.cream);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 14 + i * 9;
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 24, 1, true), mats.cream);
      deck.position.y = 14 + i * 9 - 0.4;
      (deck.material as THREE.Material).side = THREE.DoubleSide;
      tower.add(ring, deck);
    }
  }

  // ───────────── outcrops on ground WAI can't reach ─────────────
  const onPath = (x: number, z: number) =>
    LEGS.some((l) => x > l.x0 - 3 && x < l.x1 + 3 && z > Math.min(l.z0, l.z1) - 4 && z < Math.max(l.z0, l.z1) + 4) || Math.hypot(x - SUMMIT.x, z - SUMMIT.z) < SUMMIT.r + 4;
  const OUT: [number, number, number][] = [
    [34, -16, 4.5], [44, -28, 6], [38, -44, 5], [51, -12, 3.5], [30, -50, 4], [47, -40, 3],
  ];
  for (const [x, z, r] of OUT) {
    if (!onIsland(x, z) || onPath(x, z)) continue;
    const m = mesa(r, 2 + Math.floor(rnd() * 2), false);
    m.g.position.set(x, heightAt(x, z).y - 0.4, z);
    m.g.rotation.y = rnd() * Math.PI;
    root.add(m.g);
  }

  // ───────────── lavender on the grass ─────────────
  const blade = new THREE.ConeGeometry(0.07, 0.55, 4);
  blade.translate(0, 0.27, 0);
  const lav = new THREE.InstancedMesh(blade, toon({ color: '#a98bdc' }), 900);
  lav.userData.noPaint = true;
  lav.name = 'lavender';
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let tries = 0; tries < 6000 && n < 900; tries++) {
    const cx = -55 + rnd() * 110;
    const cz = -58 + rnd() * 30;
    if (!onIsland(cx, cz) || onPath(cx, cz)) continue;
    const h = heightAt(cx, cz);
    if (h.zone !== 'grass') continue;
    // a clump: 8–14 blades leaning outward
    const k = 8 + Math.floor(rnd() * 7);
    for (let j = 0; j < k && n < 900; j++) {
      const a = rnd() * Math.PI * 2;
      const rr = rnd() * 0.45;
      const x = cx + Math.cos(a) * rr;
      const z = cz + Math.sin(a) * rr;
      dummy.position.set(x, heightAt(x, z).y - 0.02, z);
      dummy.rotation.set(Math.sin(a) * 0.35 * rr * 2, rnd() * 3, Math.cos(a) * 0.35 * rr * 2);
      dummy.scale.setScalar(0.7 + rnd() * 0.7);
      dummy.updateMatrix();
      lav.setMatrixAt(n++, dummy.matrix);
    }
  }
  lav.count = n;
  lav.instanceMatrix.needsUpdate = true;
  root.add(lav);
}

/** Mute Harbor (art pass, phase 4): sea stacks around the island, far mesas with lighthouses — decor only. */
export function buildHarborLandscape(ctx: GameContext, islandR = 62): void {
  const { rnd, mats, far, slab, mesa, arch, colonnade, spire } = landscapeKit(ctx, 77, {
    rock: ['#e9b9a8', '#dcaec4', '#bcaee2'],
    cream: '#ffe9d6',
    top: '#d6c4a6',
  });

  /** A distant lighthouse: tapered tower, a gallery ring, a lit lamp room, a cap. */
  const lighthouse = (h: number): THREE.Group => {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.07, h * 0.11, h, 12), mats.cream);
    shaft.position.y = h / 2;
    addOutline(shaft, 0.15);
    for (let i = 0; i < 3; i++) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(h * (0.1 - i * 0.012), h * (0.105 - i * 0.012), h * 0.07, 12), mats.accent);
      band.position.y = h * (0.25 + i * 0.25);
      g.add(band);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.12, h * 0.03, 16), mats.cream);
    gallery.position.y = h;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.055, h * 0.055, h * 0.1, 10), new THREE.MeshBasicMaterial({ color: '#ffe08a' }));
    lamp.position.y = h + h * 0.065;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(h * 0.075, h * 0.1, 10), mats.accent);
    cap.position.y = h + h * 0.165;
    addOutline(gallery, 0.12);
    g.add(shaft, gallery, lamp, cap);
    return g;
  };

  // ── sea stacks: tall slab columns rising out of the cloud sea around the island's torn edge ──
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.3 + rnd() * 0.3;
    const d = islandR + 14 + rnd() * 22;
    const col = new THREE.Group();
    let y = -42;
    const topY = -6 + rnd() * 12;
    let r = 4 + rnd() * 3.5;
    while (y < topY) {
      const h = Math.min(topY - y, 5 + rnd() * 6);
      const s = slab(r, h, [mats.rockA, mats.rockB, mats.rockC][Math.floor(rnd() * 3)]);
      s.position.set((rnd() - 0.5) * 0.8, y + h / 2, (rnd() - 0.5) * 0.8);
      s.rotation.y = rnd() * Math.PI;
      col.add(s);
      y += h;
      r *= 0.88 + rnd() * 0.1;
    }
    const cap = slab(r * 1.05, 0.5, mats.top);
    cap.position.y = y + 0.25;
    col.add(cap);
    col.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    far.add(col);
  }

  // ── far mesas in the dusk haze: lighthouses, an arch, a colonnade, a spire ──
  type Top = 'lighthouse' | 'arch' | 'colonnade' | 'spire' | 'bare';
  const SPOTS: [number, number, number, number, number, Top][] = [
    [0.6, 165, -16, 14, 3, 'lighthouse'],
    [1.5, 190, -6, 11, 2, 'arch'],
    [2.5, 150, -20, 16, 3, 'colonnade'],
    [3.4, 200, -2, 10, 2, 'lighthouse'],
    [4.3, 175, -12, 13, 3, 'spire'],
    [5.2, 160, -18, 12, 2, 'bare'],
  ];
  for (const [a, d, y, r, layers, top] of SPOTS) {
    const m = mesa(r, layers, true);
    m.g.position.set(Math.cos(a) * d, y, Math.sin(a) * d);
    m.g.rotation.y = rnd() * Math.PI;
    far.add(m.g);
    const piece =
      top === 'lighthouse' ? lighthouse(r * 2.2) : top === 'arch' ? arch(r * 0.8, r * 0.9, r * 0.12) : top === 'colonnade' ? colonnade(r * 1.1, r * 0.55) : top === 'spire' ? spire(r * 3) : null;
    if (piece) {
      piece.position.y = m.top;
      m.g.add(piece);
    }
  }
}
