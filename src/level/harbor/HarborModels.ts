import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import { toon } from '../../render/Materials';
import { DUSK } from './HarborTerrain';
import { StaticBatch, archFrame, block, crownGeos, lathe, latheHull, loft, loftHull, ring, roundRect, tube, v2, wonk, worldUV } from './HarborKit';

/**
 * [INPUT]: depends on StaticBatch and the loft/lathe/ring builders from ./HarborKit; toon from ../../render/Materials;
 *          DUSK from ./HarborTerrain
 * [OUTPUT]: exports buildFerry (hull, horn, solids), buildSailBoat (g, solids), the lighthouse/bridge/gate/stall
 *           builders and harborMats
 * [POS]: Mute Harbor's set pieces (after the clock tower): the Foghorn Ferry, the lighthouse's lamp-room drum and roof
 *        and dressing, the Bell Bridge, the market gate, the fish stalls and the jetty stair. Visuals
 *        only — every collider, socket and trigger stays in MuteHarbor.ts. buildFerry and buildSailBoat also
 *        return the drawn shape of each solid piece, so MuteHarbor's colliders match the drawing.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

export interface HarborMats {
  planks: THREE.Material;
  timber: THREE.Material;
  stone: THREE.Material;
  stoneWarm: THREE.Material;
  cream: THREE.Material;
  coral: THREE.Material;
  neon: THREE.Material;
  teal: THREE.Material;
  indigo: THREE.Material;
  blue: THREE.Material;
  brass: THREE.Material;
  ink: THREE.Material;
  iron: THREE.Material;
  roof: THREE.Material;
  glass: THREE.Material;
  dark: THREE.Material;
  lampOff: THREE.MeshBasicMaterial;
}

let matCache: HarborMats | null = null;
const stripeMats = new Map<string, THREE.Material>();
/** Call at the start of a level build: the pieces of one build share materials (so they batch). */
export function resetHarborMats(): void {
  matCache = null;
  stripeMats.clear();
}
export function harborMats(assets: AssetManager): HarborMats {
  if (matCache) return matCache;
  const T = (n: string) => assets.tex(n);
  const glass = toon({ map: T('h2_window') });
  glass.alphaTest = 0.5;
  const m: HarborMats = {
    planks: toon({ map: T('h2_planks') }),
    timber: toon({ map: T('wood'), color: '#a77a8a' }),
    stone: toon({ map: T('stone_cream'), color: '#c8b8ff' }),
    stoneWarm: toon({ map: T('stone_cream'), color: '#ffc9b8' }),
    cream: toon({ map: T('h2_p_cream') }),
    coral: toon({ map: T('h2_p_coral') }),
    neon: toon({ map: T('h2_p_neon') }),
    teal: toon({ map: T('h2_p_teal') }),
    indigo: toon({ map: T('h2_p_indigo') }),
    blue: toon({ map: T('h2_p_blue') }),
    brass: toon({ map: T('h2_p_brass') }),
    ink: toon({ map: T('h2_p_ink') }),
    iron: toon({ map: T('metal_dark'), color: '#b8a8e8' }),
    roof: toon({ map: T('roof'), color: DUSK.neon }),
    glass,
    dark: new THREE.MeshBasicMaterial({ color: '#1c1650' }),
    lampOff: new THREE.MeshBasicMaterial({ color: '#4a3f6a' }),
  };
  matCache = m;
  return m;
}

/** Rotate about Y then move: places a piece modelled at the origin. */
function put(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0): THREE.BufferGeometry {
  if (yaw) g.rotateY(yaw);
  return g.translate(x, y, z);
}

/** A small hanging bell (lathe), mouth down, top at y = 0. */
function bellGeo(r: number): { g: THREE.BufferGeometry; hull: THREE.BufferGeometry } {
  const p = [
    v2(0.001, 0), v2(r * 0.3, 0), v2(r * 0.46, -r * 0.12), v2(r * 0.52, -r * 0.6), v2(r * 0.7, -r * 1.05), v2(r, -r * 1.3), v2(r * 1.04, -r * 1.38),
    v2(r * 0.9, -r * 1.38), v2(r * 0.5, -r * 0.8), v2(0.001, -r * 0.3),
  ];
  return { g: lathe(p, 14, 0.015, 1), hull: latheHull(p.slice(0, 7), 14, 0.015, 0.03) };
}

// ───────────── the Foghorn Ferry ─────────────
/**
 * A tubby paddle steamer moored at the market quay. Local space: origin at `ferryAt` (0.2 below the
 * water line), +x the bow, +z the quay. The deck is at y = 2.0 (the quay's height — it's also the
 * top of the hull's collider). The level's EYE socket is at (-1.2, 4.6, 2.5) and its MOUTH socket at
 * (2.6, 4.4, 2.65) in this space: the wheelhouse's quay-side round window and the foghorn's bell are
 * built there, so a lent organ lands on something instead of hanging in the air.
 * `solids` returns the shape of every solid piece above the deck (hull space, one convex piece each, made
 * from the same rings and sizes as the drawing): MuteHarbor turns each into a hull collider, so WAI's feet
 * rest on the drawn roofs and casing instead of on one box around them.
 */
export function buildFerry(assets: AssetManager): { hull: THREE.Group; horn: THREE.Group; solids: THREE.BufferGeometry[] } {
  const M = harborMats(assets);
  const solids: THREE.BufferGeometry[] = [];
  const solid = (pts: THREE.Vector3[]) => solids.push(new THREE.BufferGeometry().setFromPoints(pts));
  const T = (n: string) => assets.tex(n);
  const hull = new THREE.Group();
  hull.name = 'ferry';
  const B = new StaticBatch();
  const plaster = toon({ map: T('stone_pink'), color: '#ffd8e8' });

  // hull: red bottom, blue sides, cream strake, timber cap rail
  const plan = roundRect(5.6, 2.1, 1.3, 5).map(([x, z]) => [x, z * (x > 2.4 ? 1 - ((x - 2.4) / 3.2) * 0.2 : 1)] as [number, number]);
  const L = (y: number, sx: number, sz = sx) => ring(plan, y, sx, sz);
  const bottom = [L(-0.95, 0.74, 0.58), L(-0.35, 0.9, 0.84), L(0.32, 0.955, 0.94)];
  const sides = [L(0.32, 0.955, 0.94), L(0.8, 0.985, 0.98), L(1.3, 1, 1)];
  const strake = [L(1.3, 1, 1), L(1.9, 1.005, 1.01)];
  // the cap rail is a rim (outer face, top, inner face): the deck shows inside it
  const rail = [L(1.9, 1.02, 1.035), L(2.06, 1.02, 1.035), L(2.06, 0.955, 0.94), L(1.99, 0.955, 0.94)];
  B.add(worldUV(loft(bottom, false, true), 3), M.coral, 0);
  B.add(worldUV(loft(sides, false), 3), M.blue, 0);
  B.add(worldUV(loft(strake, false), 3), M.cream, 0);
  B.add(worldUV(loft(rail, false, false), 2), M.timber, 0, loftHull([...bottom, sides[1], sides[2], strake[1], rail[1]], 0.07));
  // deck planks (run fore-and-aft)
  B.add(worldUV(loft([L(1.98, 0.99), L(2.0, 0.99)], true), 2.4), M.planks, 0);
  // the hull as one solid: keel to the planks' top (the cap rail's 6 cm lip stays a lip)
  solid([...bottom, ...sides, ...strake, L(2.0, 0.99)].flat());
  // portholes along the strake
  for (const sz of [-1, 1])
    for (const px of [-4.1, -2.9, 3.7]) {
      B.add(put(new THREE.TorusGeometry(0.2, 0.055, 5, 12), px, 1.6, sz * 2.13), M.brass, 0);
      const pane = new THREE.CircleGeometry(0.19, 12).translate(sz > 0 ? px : -px, 1.6, 2.125);
      if (sz < 0) pane.rotateY(Math.PI);
      B.add(pane, M.dark, 0);
    }

  // deckhouse: plaster walls, coral roof, windows, a door aft
  const CX = -1.6;
  const cab = roundRect(2.3, 1.86, 0.3, 3);
  const walls = [ring(cab, 2.0, 1, 1, CX), ring(cab, 3.0, 0.995, 0.99, CX + 0.03), ring(cab, 4.05, 0.985, 0.98, CX + 0.07)];
  B.add(worldUV(loft(walls, false), 3), plaster, 0, loftHull(walls, 0.05));
  solid(walls.flat());
  B.add(worldUV(loft([ring(cab, 2.0, 1.02, 1.025, CX), ring(cab, 2.2, 1.02, 1.025, CX)], true), 2), M.coral, 0.03);
  const roofR = [ring(cab, 4.02, 1.14, 1.16, CX + 0.07), ring(cab, 4.2, 1.14, 1.16, CX + 0.07), ring(cab, 4.42, 0.9, 0.85, CX + 0.07), ring(cab, 4.5, 0.6, 0.5, CX + 0.07)];
  B.add(worldUV(loft(roofR, true, true, 1.0), 2.5), M.coral, 0, loftHull(roofR, 0.06));
  solid(roofR.flat());
  const win = (x: number, side: number, w = 0.78) => {
    const h = w * (320 / 192);
    const g = new THREE.PlaneGeometry(w, h).translate(side > 0 ? x : -x, 3.08, 1.885);
    if (side < 0) g.rotateY(Math.PI);
    B.add(g, M.glass, 0);
    const sill = block(w + 0.24, 0.1, 0.2, 0.01, 2, 1).translate(side > 0 ? x : -x, 3.08 - h / 2 - 0.03, 1.93);
    if (side < 0) sill.rotateY(Math.PI);
    B.add(sill, M.cream, 0.02);
  };
  win(-3.3, 1);
  for (const x of [-3.3, -2.25, -1.2, -0.15]) win(x, -1);
  {
    const d = new THREE.PlaneGeometry(1.0, 1.67).translate(0, 2.86, 2.34);
    d.rotateY(-Math.PI / 2).translate(CX, 0, 0);
    B.add(d, toon({ map: T('h2_door_teal') }), 0);
  }
  // the wheelhouse: a wide bridge across the deckhouse roof, windows fore and aft, a round one on the
  // quay side (the EYE's place)
  {
    const WX = -1.2;
    B.add(block(2.0, 1.25, 4.76, 0.015, 23, 2.5).translate(WX, 4.85, 0), M.cream, 0.05);
    solids.push(new THREE.BoxGeometry(2.0, 1.25, 4.76).translate(WX, 4.85, 0));
    B.add(block(2.16, 0.14, 4.9, 0.01, 24, 2).translate(WX, 4.3, 0), M.coral, 0.03);
    const wr = roundRect(1.25, 2.6, 0.3, 3);
    const wrR = [ring(wr, 5.46, 1, 1, WX), ring(wr, 5.6, 1, 1, WX), ring(wr, 5.76, 0.8, 0.9, WX)];
    B.add(worldUV(loft(wrR, true, true, 1.0), 2.5), M.coral, 0, loftHull(wrR, 0.05));
    solid(wrR.flat());
    for (const sx of [-1, 1])
      for (const wz of [-1.5, -0.5, 0.5, 1.5]) {
        const pane = new THREE.PlaneGeometry(0.62, 0.72).translate(wz, 4.95, 1.0 + 0.02);
        pane.rotateY(sx * Math.PI / 2);
        B.add(pane.translate(WX, 0, 0), M.dark, 0);
        const fr = block(0.06, 0.8, 0.74, 0.004, 3, 1).translate(WX + sx * 1.03, 4.95, wz + 0.37);
        B.add(fr, M.ink, 0);
      }
    for (const sz of [-1, 1]) {
      B.add(new THREE.TorusGeometry(0.5, 0.085, 6, 20).translate(WX, 4.62, sz * 2.4), M.brass, 0.02);
      const pane = new THREE.CircleGeometry(0.48, 20).translate(sz > 0 ? WX : -WX, 4.62, 2.405); // 2.5 cm off the wheelhouse wall
      if (sz < 0) pane.rotateY(Math.PI);
      B.add(pane, M.dark, 0);
    }
    // a searchlight on its roof
    B.add(new THREE.CylinderGeometry(0.2, 0.26, 0.34, 10).rotateZ(Math.PI / 2).translate(WX + 0.5, 6.0, 0), M.iron, 0.02);
    B.add(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 5).translate(WX + 0.5, 5.8, 0), M.ink, 0);
    B.add(new THREE.CircleGeometry(0.19, 10).rotateY(Math.PI / 2).translate(WX + 0.675, 6.0, 0), M.lampOff, 0);
  }
  // the bay window on the quay side with its own little roof
  B.add(block(2.1, 1.5, 0.6, 0.015, 7, 2).translate(-1.2, 3.02, 2.14), M.cream, 0.04);
  B.add(block(2.34, 0.14, 0.78, 0.01, 8, 1).translate(-1.2, 3.84, 2.16), M.coral, 0.03);
  solids.push(new THREE.BoxGeometry(2.2, 1.79, 0.7).translate(-1.2, 2.0 + 1.79 / 2, 2.12), new THREE.BoxGeometry(2.34, 0.14, 0.78).translate(-1.2, 3.84, 2.16));
  B.add(block(2.2, 0.16, 0.7, 0.01, 9, 1).translate(-1.2, 2.2, 2.12), M.coral, 0.03);
  B.add(new THREE.TorusGeometry(0.56, 0.09, 6, 20).translate(-1.2, 3.0, 2.45), M.brass, 0.02);
  B.add(new THREE.CircleGeometry(0.54, 20).translate(-1.2, 3.0, 2.462), M.dark, 0); // 2 cm off the bay's face (0.8 cm fought)
  // roof clutter: a vent cowl and a skylight
  {
    const p = [v2(0.16, 0), v2(0.16, 0.5), v2(0.3, 0.72), v2(0.34, 0.95), v2(0.2, 0.98), v2(0.14, 0.7)];
    const vent = lathe(p, 10, 0, 1).translate(CX - 1.2, 4.42, 0.5);
    B.add(vent, M.teal, 0, latheHull(p.slice(0, 4), 10, 0, 0.03).translate(CX - 1.2, 4.42, 0.5));
    solids.push(vent.clone());
    B.add(block(0.9, 0.3, 0.8, 0.02, 4, 1).translate(0.15, 4.55, 0), M.cream, 0.03);
    solids.push(new THREE.BoxGeometry(0.9, 0.3, 0.8).translate(0.15, 4.55, 0));
    B.add(new THREE.PlaneGeometry(0.7, 0.6).rotateX(-Math.PI / 2).translate(0.15, 4.71, 0), M.dark, 0);
  }

  // engine casing under the funnel + the paddle boxes (the quay-side one is the MOUTH's place)
  B.add(block(3.2, 1.34, 3.3, 0.015, 15, 2.5).translate(2.3, 2.67, 0), M.indigo, 0.05);
  B.add(block(3.4, 0.14, 3.5, 0.01, 16, 2).translate(2.3, 3.4, 0), M.cream, 0.03);
  solids.push(new THREE.BoxGeometry(3.2, 1.34, 3.3).translate(2.3, 2.67, 0), new THREE.BoxGeometry(3.4, 0.14, 3.5).translate(2.3, 3.4, 0));
  const sun = toon({ map: T('h2_paddle') });
  for (const sz of [-1, 1]) {
    const box = new THREE.CylinderGeometry(1.5, 1.5, 0.95, 18, 1, false, 0, Math.PI);
    box.rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
    B.add(box.translate(2.6, 2.0, sz * 2.15), M.cream, 0.05);
    solids.push(box.clone());
    // 2.5 cm proud of the box's end cap (2.625): 1 cm z-fought from the quay at a distance
    const face = new THREE.CircleGeometry(1.4, 22, 0, Math.PI).translate(2.6 * sz, 2.02, 2.65);
    if (sz < 0) face.rotateY(Math.PI);
    B.add(face, sun, 0);
    // the wheel under it: a dark drum with paddle boards, half in the water
    const drum = new THREE.CylinderGeometry(1.2, 1.2, 0.7, 12).rotateX(Math.PI / 2);
    B.add(drum.translate(2.6, 1.35, sz * 2.18), M.ink, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pb = new THREE.BoxGeometry(0.1, 0.5, 0.78).translate(0, 1.2, 0).rotateZ(a);
      B.add(pb.translate(2.6, 1.35, sz * 2.18), M.timber, 0);
    }
  }
  // life rings on the casing's forward wall, a rope coil and a crate on the stern deck
  const ringM = toon({ map: T('h2_stripe_coral') });
  for (const sz of [-0.85, 0.85]) B.add(new THREE.TorusGeometry(0.33, 0.1, 6, 14).rotateY(Math.PI / 2).translate(3.95, 2.75, sz), ringM, 0.02);
  B.add(new THREE.TorusGeometry(0.34, 0.1, 5, 12).rotateX(Math.PI / 2).translate(-4.75, 2.1, 0.7), M.timber, 0.02);
  B.add(new THREE.TorusGeometry(0.24, 0.09, 5, 12).rotateX(Math.PI / 2).translate(-4.75, 2.26, 0.7), M.timber, 0.02);
  solids.push(new THREE.CylinderGeometry(0.44, 0.44, 0.35, 12).translate(-4.75, 2.175, 0.7)); // the rope coil, as a drum
  B.add(worldUV(wonk(new THREE.BoxGeometry(0.8, 0.7, 0.8), 0.02, 3), 1).translate(-4.55, 2.35, -0.8), M.planks, 0.03);
  solids.push(new THREE.BoxGeometry(0.8, 0.7, 0.8).translate(-4.55, 2.35, -0.8));

  // railing round the bow, the lagoon side and the stern (open to the quay)
  {
    const pts: THREE.Vector3[] = [];
    const idx: number[] = [];
    for (let i = 6; i < 24; i++) idx.push(i);
    for (let i = 0; i < 6; i++) idx.push(i);
    for (let k = 0; k < idx.length; k++) {
      const [x, z] = plan[idx[k]];
      pts.push(new THREE.Vector3(x * 0.97, 0, z * 0.96));
      // extra posts along the straight lagoon side
      if (idx[k] === 17) for (let j = 1; j < 6; j++) pts.push(new THREE.Vector3(THREE.MathUtils.lerp(plan[17][0], plan[18][0], j / 6) * 0.97, 0, plan[17][1] * 0.96));
    }
    for (const h of [2.5, 2.92]) B.add(tube(pts.map((p) => new THREE.Vector3(p.x, h, p.z)), h > 2.6 ? 0.05 : 0.03, 60, 5), h > 2.6 ? M.timber : M.ink, 0);
    pts.forEach((p, i) => {
      if (i % 2 && i !== pts.length - 1) return;
      B.add(new THREE.CylinderGeometry(0.045, 0.055, 0.94, 6).translate(p.x, 2.47, p.z), M.ink, 0);
    });
  }
  // a stubby mast at the bow: lamp + pennant
  B.add(new THREE.CylinderGeometry(0.05, 0.08, 3.4, 6).translate(4.55, 3.7, 0), M.timber, 0.02);
  B.add(new THREE.SphereGeometry(0.2, 10, 8).translate(4.55, 5.05, 0), M.lampOff, 0.03);
  {
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.lineTo(-1.0, -0.22);
    s.lineTo(0, -0.5);
    s.closePath();
    const flag = new THREE.ShapeGeometry(s).translate(4.5, 5.0, 0);
    const fm = toon({ map: T('h2_p_neon') });
    fm.side = THREE.DoubleSide;
    B.add(flag, fm, 0);
  }
  B.flush(hull, 'ferry-part');

  // the funnel + foghorn (its own group: it quivers when it bellows)
  const horn = new THREE.Group();
  {
    const H = new StaticBatch();
    const fp = [v2(0.84, 0), v2(0.88, 0.14), v2(0.74, 0.3), v2(0.66, 2.0), v2(0.7, 2.3), v2(0.8, 2.42), v2(0.68, 2.5), v2(0.56, 2.5), v2(0.5, 1.9)];
    const funnel = lathe(fp, 16, 0.015, 2);
    H.add(funnel, M.neon, 0, latheHull(fp.slice(0, 7), 16, 0.015, 0.05));
    solids.push(funnel.clone().translate(2.6, 3.47, 0)); // the group sits at (2.6, 3.47, 0): see below
    const band = [v2(0.71, 1.45), v2(0.7, 1.85)];
    H.add(lathe(band, 16, 0.015, 2), M.cream, 0);
    H.add(new THREE.TorusGeometry(0.75, 0.07, 5, 16).rotateX(Math.PI / 2).translate(0, 2.44, 0), M.ink, 0);
    // the horn: a brass trumpet pointing at the quay
    // (its bell opens at the MOUTH socket: 0.93 up, 2.56 out)
    const tp = [v2(0.1, 0), v2(0.13, 0.6), v2(0.22, 1.15), v2(0.42, 1.58), v2(0.76, 1.86), v2(0.95, 1.96), v2(0.84, 1.95), v2(0.36, 1.5), v2(0.09, 0.6)];
    const tg = lathe(tp, 16, 0.012, 2).rotateX(Math.PI / 2).translate(0, 0.93, 0.6);
    const th = latheHull(tp.slice(0, 6), 16, 0.012, 0.04).rotateX(Math.PI / 2).translate(0, 0.93, 0.6);
    H.add(tg, M.brass, 0, th);
    // solid in three convex runs (pipe, throat, bell): one hull round the whole flare would float over the pipe
    for (const [i0, i1] of [[0, 2], [2, 4], [4, 5]]) solids.push(lathe(tp.slice(i0, i1 + 1), 16, 0.012, 2).rotateX(Math.PI / 2).translate(2.6, 3.47 + 0.93, 0.6));
    H.add(new THREE.TorusGeometry(0.17, 0.05, 5, 10).translate(0, 0.93, 0.78), M.ink, 0);
    // the dark of its throat (what a lent mouth sits on) and a stay up to the funnel
    H.add(new THREE.CircleGeometry(0.74, 16).translate(0, 0.93, 2.44), M.dark, 0);
    H.add(new THREE.CylinderGeometry(0.03, 0.03, 1.5, 5).rotateX(-0.9).translate(0, 1.55, 1.25), M.ink, 0);
    // a steam whistle beside it
    H.add(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6).translate(0.95, 0.75, 0), M.brass, 0.015);
    H.add(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 8).translate(0.95, 1.6, 0), M.brass, 0.02);
    H.flush(horn, 'ferry-horn');
    horn.position.set(2.6, 3.47, 0);
    hull.add(horn);
  }
  return { hull, horn, solids };
}

// ───────────── the lighthouse ─────────────
/** Candy bands for the shaft (replaces the scribbled stripes). */
export function lighthouseShaftMat(assets: AssetManager): THREE.Material {
  const tex = assets.tex('h2_bands').clone();
  tex.needsUpdate = true;
  tex.repeat.set(4, 2);
  return toon({ map: tex, relief: 0.7 });
}

/**
 * Door, windows, lamp-room drum and the domed roof (glazing and lens: LanternRoom.ts). `stairPass(theta)` returns the
 * heights at which the spiral stair crosses that bearing (windows sit between the turns).
 */
export function dressLighthouse(
  B: StaticBatch,
  assets: AssetManager,
  o: { x: number; z: number; base: number; galleryY: number; r0: number; radiusAt: (y: number) => number; faceAngle: number; stairPass: (theta: number) => number[] },
): void {
  const M = harborMats(assets);
  const T = (n: string) => assets.tex(n);
  /** Model a piece facing +z at distance r from the axis, then swing it round to bearing theta. */
  const onShaft = (g: THREE.BufferGeometry, theta: number, r: number, y: number) => {
    g.translate(0, 0, r);
    g.rotateY(Math.PI / 2 - theta);
    return g.translate(o.x, y, o.z);
  };
  // the door at the stair's foot (south): arched frame, plank door, a dark fanlight
  {
    const th = Math.PI / 2;
    B.add(onShaft(worldUV(archFrame(1.5, 2.5, 0.24, 0.34), 1.5), th, o.r0 - 0.14, o.base), M.cream, 0.03);
    // the door 2.5 cm in front of the fanlight (5 mm apart they fought from the victory camera)
    B.add(onShaft(new THREE.PlaneGeometry(1.5, 2.2).translate(0, 1.1, 0), th, o.r0 + 0.06, o.base), toon({ map: T('h2_door_teal') }), 0);
    B.add(onShaft(new THREE.CircleGeometry(0.75, 12, 0, Math.PI).translate(0, 1.75, 0), th, o.r0 + 0.035, o.base), M.dark, 0);
    // the step's top 3 cm proud of the grass (it was flush with it)
    B.add(onShaft(block(2.1, 0.16, 0.5, 0.01, 3, 1).translate(0, 0.05, 0), th, o.r0 + 0.12, o.base), M.stone, 0.02);
  }
  // windows up the shaft, each halfway between two turns of the stair
  for (const dth of [0.8, 2.9, 5.0]) {
    const th = Math.PI / 2 + dth;
    const pass = o.stairPass(th);
    const y = pass[0] + 3.9;
    if (y > o.galleryY - 2.2) continue;
    const r = o.radiusAt(y);
    B.add(onShaft(new THREE.PlaneGeometry(0.8, 1.33), th, r + 0.05, y), M.glass, 0);
    B.add(onShaft(worldUV(archFrame(0.62, 1.2, 0.13, 0.2), 1).translate(0, -0.62, 0), th, r - 0.09, y), M.cream, 0.02);
    B.add(onShaft(block(1.1, 0.12, 0.3, 0.01, 2, 1).translate(0, -0.72, 0), th, r + 0.08, y), M.cream, 0.02);
  }
  // corbels under the gallery
  for (let i = 0; i < 14; i++) {
    const th = ((i + 0.5) / 14) * Math.PI * 2;
    const w = new THREE.Shape();
    w.moveTo(0, 0);
    w.lineTo(1.5, 0);
    w.lineTo(1.5, -0.22);
    w.lineTo(0, -1.0);
    w.closePath();
    const g = new THREE.ExtrudeGeometry(w, { depth: 0.22, bevelEnabled: false }).translate(0, 0, -0.11).rotateY(-Math.PI / 2);
    // only where the gallery has a floor (the stairwell's quarter is open)
    const wAng = Math.atan2(Math.sin(th), Math.cos(th));
    if (wAng < 0.1 || wAng > 3.0) continue;
    B.add(onShaft(g, th, o.radiusAt(o.galleryY) - 0.05, o.galleryY - 0.5), M.cream, 0.02);
  }

  // the lamp room: stone drum and an onion-ish roof with a finial
  const y0 = o.galleryY;
  const drum = [v2(2.14, 0), v2(2.2, 0.1), v2(2.08, 0.2), v2(2.08, 0.6), v2(2.2, 0.7), v2(2.2, 0.8), v2(0.001, 0.8)];
  B.add(lathe(drum, 20, 0.008, 2).translate(o.x, y0, o.z), M.cream, 0, latheHull(drum.slice(0, 6), 20, 0.008, 0.04).translate(o.x, y0, o.z));
  // glazing bars, rings, the lens's stand: LanternRoom.ts
  const roofP = [v2(0.001, -0.04), v2(2.5, -0.04), v2(2.58, 0.08), v2(2.34, 0.3), v2(1.9, 0.62), v2(1.3, 1.1), v2(0.72, 1.52), v2(0.36, 1.72), v2(0.3, 1.9), v2(0.4, 2.02), v2(0.001, 2.2)];
  B.add(lathe(roofP, 20, 0.012, 2).translate(o.x, y0 + 3.6, o.z), M.neon, 0, latheHull(roofP.slice(1), 20, 0.012, 0.06).translate(o.x, y0 + 3.6, o.z));
  // ribs down the roof
  for (let i = 0; i < 8; i++) {
    const th = (i / 8) * Math.PI * 2;
    const pts = roofP.slice(2, 9).map((p) => new THREE.Vector3(Math.cos(th) * (p.x + 0.02), y0 + 3.6 + p.y + 0.02, Math.sin(th) * (p.x + 0.02)).add(new THREE.Vector3(o.x, 0, o.z)));
    B.add(tube(pts, 0.05, 10, 4), M.cream, 0);
  }
  B.add(new THREE.SphereGeometry(0.3, 12, 9).translate(o.x, y0 + 5.95, o.z), M.brass, 0.03);
  B.add(new THREE.CylinderGeometry(0.03, 0.05, 1.3, 6).translate(o.x, y0 + 6.7, o.z), M.ink, 0.01);
  for (const g of crownGeos(0.5)) B.add(g.translate(o.x, y0 + 6.5, o.z), M.brass, 0.02);
}

// ───────────── the Bell Bridge ─────────────
/** Deck geometry: planks laid across, top at y = 0, from x = 0 to len. */
export function bridgeDeckGeo(len: number): THREE.BufferGeometry {
  const g = worldUV(new THREE.BoxGeometry(3.5, 0.3, len), 2.6);
  g.rotateY(Math.PI / 2);
  return g.translate(len / 2, -0.15, 0);
}

/** The iron-and-timber frame that's left while the deck is erased (x = 0 at the hinge). */
export function buildBridgeFrame(assets: AssetManager, len: number): THREE.Group {
  const M = harborMats(assets);
  const g = new THREE.Group();
  const B = new StaticBatch();
  const N = 6;
  for (const sz of [-1.75, 1.75]) {
    B.add(block(len, 0.3, 0.26, 0.01, 3, 1.5).translate(len / 2, -0.32, sz), M.timber, 0.03);
    B.add(block(len + 0.2, 0.14, 0.22, 0.01, 5, 1.5).translate(len / 2, 1.02, sz), M.timber, 0.03);
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * len;
      B.add(new THREE.BoxGeometry(0.16, 1.3, 0.16).translate(x, 0.36, sz), M.iron, 0.02);
      B.add(new THREE.SphereGeometry(0.13, 8, 6).translate(x, 1.17, sz), M.brass, 0.02);
      if (i === N) continue;
      // X braces between posts
      const dx = len / N, dy = 1.0;
      const L = Math.hypot(dx, dy);
      for (const s of [-1, 1]) {
        const br = new THREE.BoxGeometry(L, 0.07, 0.06).rotateZ(s * Math.atan2(dy, dx));
        B.add(br.translate(x + dx / 2, 0.42, sz + s * 0.03), M.iron, 0);
      }
    }
  }
  // cross beams under where the deck goes
  for (let i = 0; i <= N; i++) B.add(block(0.22, 0.2, 3.76, 0.01, i + 2, 1.5).translate((i / N) * len, -0.42, 0), M.timber, 0.02);
  B.flush(g, 'bridge-frame');
  return g;
}

/**
 * The bridge's gate posts: two stone piers with tiled caps and a beam between them carrying a row of
 * little bells (west, where it hinges), and a pair of low lamp piers on the far bank. World space.
 */
export function buildBridgePiers(B: StaticBatch, assets: AssetManager, west: THREE.Vector3, east: THREE.Vector3): void {
  const M = harborMats(assets);
  const sq = (h: number): [number, number][] => [[h, h], [-h, h], [-h, -h], [h, -h]];
  for (const sz of [-2.4, 2.4]) {
    const x = west.x - 0.6, z = west.z + sz, y = west.y;
    B.add(block(0.94, 3.5, 0.94, 0.025, 3 + sz, 3, 2).translate(x, y + 1.45, z), M.stone, 0.04);
    B.add(block(1.2, 0.3, 1.2, 0.015, 5, 1.5).translate(x, y + 0.15, z), M.cream, 0.03);
    B.add(block(1.16, 0.22, 1.16, 0.015, 6, 1.5).translate(x, y + 3.3, z), M.cream, 0.03);
    const cap = [ring(sq(0.68), y + 3.4, 1, 1, x, z), ring(sq(0.4), y + 3.85, 1, 1, x, z), ring(sq(0.06), y + 4.6, 1, 1, x, z)];
    B.add(worldUV(loft(cap, true, true), 1.6, 0, 0, true), M.roof, 0, loftHull(cap, 0.04));
    B.add(new THREE.SphereGeometry(0.14, 8, 6).translate(x, y + 4.68, z), M.brass, 0.02);
  }
  // the beam + three bells (the middle one biggest)
  const bx = west.x - 0.6;
  B.add(block(0.26, 0.26, 5.4, 0.012, 9, 1.5).translate(bx, west.y + 3.05, west.z), M.timber, 0.03);
  for (const [dz, r] of [[-1.0, 0.2], [0, 0.28], [1.0, 0.2]] as [number, number][]) {
    const { g, hull } = bellGeo(r);
    B.add(g.translate(bx, west.y + 2.82, west.z + dz), M.brass, 0, hull.translate(bx, west.y + 2.82, west.z + dz));
    B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 4).translate(bx, west.y + 2.88, west.z + dz), M.ink, 0);
  }
  for (const sz of [-2.4, 2.4]) {
    const x = east.x + 0.6, z = east.z + sz, y = east.y;
    B.add(block(0.78, 1.7, 0.78, 0.02, 13 + sz, 2, 1).translate(x, y + 0.65, z), M.stone, 0.04);
    B.add(block(0.98, 0.18, 0.98, 0.012, 14, 1.5).translate(x, y + 1.55, z), M.cream, 0.03);
    B.add(new THREE.SphereGeometry(0.24, 10, 8).translate(x, y + 1.86, z), M.lampOff, 0.03);
  }
}

// ───────────── the market gate ─────────────
/** The arch itself (piers + ring in one piece), plinths, imposts and a crowned keystone. World space. */
export function buildGateArch(B: StaticBatch, assets: AssetManager, x: number, y: number, z: number): void {
  const M = harborMats(assets);
  const IW = 5.5, SPRING = 4.3, T0 = 0.9, D = 1.1;
  const arch = worldUV(archFrame(IW, SPRING + IW / 2, T0, D), 3);
  B.add(arch.translate(x, y - 0.06, z - D / 2), M.stoneWarm, 0.05);
  for (const sx of [-1, 1]) {
    B.add(block(1.16, 0.5, 1.36, 0.015, 3 + sx, 1.5).translate(x + sx * 3.2, y + 0.25, z), M.cream, 0.03);
    B.add(block(1.1, 0.26, 1.3, 0.015, 5 + sx, 1.5).translate(x + sx * 3.2, y + SPRING, z), M.cream, 0.03);
  }
  const top = y + SPRING + IW / 2 + T0;
  B.add(block(0.9, 1.2, 1.3, 0.02, 7, 1.5).translate(x, top - 0.5, z), M.cream, 0.03);
  for (const g of crownGeos(0.9)) B.add(g.translate(x, top + 0.24, z), M.brass, 0.03);
  // the sign's board and its chains
  B.add(block(4.3, 1.1, 0.12, 0.012, 9, 2).translate(x, y + 5.0, z + 0.33), M.timber, 0.03);
  for (const sx of [-1.7, 1.7]) B.add(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 4).translate(x + sx, y + 6.15, z + 0.33), M.ink, 0);
}

/** The portcullis: round bars with spear points, flat straps, brass studs. Origin at the ground, centre. */
export function portcullisGeo(): { bars: THREE.BufferGeometry[]; studs: THREE.BufferGeometry[] } {
  const bars: THREE.BufferGeometry[] = [];
  const studs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const x = -2.55 + i * 0.85;
    bars.push(new THREE.CylinderGeometry(0.075, 0.075, 3.85, 6).translate(x, 2.12, 0));
    bars.push(new THREE.ConeGeometry(0.12, 0.3, 6).rotateX(Math.PI).translate(x, 0.16, 0));
    for (const y of [0.9, 2.2, 3.5]) studs.push(new THREE.SphereGeometry(0.09, 6, 5).translate(x, y, 0.1), new THREE.SphereGeometry(0.09, 6, 5).translate(x, y, -0.1));
  }
  for (const y of [0.9, 2.2, 3.5]) bars.push(new THREE.BoxGeometry(5.62, 0.18, 0.08).translate(0, y, 0));
  bars.push(new THREE.BoxGeometry(5.62, 0.2, 0.2).translate(0, 4.02, 0));
  return { bars, studs };
}

/** The gate's little bell on a bracket (mouth down; origin where it hangs from). */
export function buildGateBell(assets: AssetManager): THREE.Group {
  const M = harborMats(assets);
  const g = new THREE.Group();
  const B = new StaticBatch();
  const { g: bg, hull } = bellGeo(0.36);
  B.add(bg.translate(0, 0.3, 0), M.brass, 0, hull.translate(0, 0.3, 0));
  B.add(new THREE.TorusGeometry(0.1, 0.035, 5, 10).translate(0, 0.36, 0), M.ink, 0);
  B.add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 4).translate(0, -0.02, 0), M.ink, 0);
  B.add(new THREE.SphereGeometry(0.09, 8, 6).translate(0, -0.26, 0), M.ink, 0);
  B.flush(g, 'gate-bell');
  return g;
}

// ───────────── market stalls ─────────────
/** A scalloped awning valance: strip + teeth, UVs running along it (for the stripe texture). */
function valance(w: number, drop: number, teeth: number): THREE.BufferGeometry {
  const P: number[] = [], U: number[] = [];
  const band = drop * 0.45;
  const quad = (x0: number, x1: number) => {
    P.push(x0, 0, 0, x0, -band, 0, x1, -band, 0, x0, 0, 0, x1, -band, 0, x1, 0, 0);
    for (const x of [x0, x0, x1, x0, x1, x1]) U.push(x / w + 0.5, 0.5);
  };
  quad(-w / 2, w / 2);
  for (let i = 0; i < teeth; i++) {
    const x0 = -w / 2 + (i / teeth) * w, x1 = x0 + w / teeth;
    P.push(x0, -band, 0, (x0 + x1) / 2, -drop, 0, x1, -band, 0);
    U.push(x0 / w + 0.5, 0.5, (x0 + x1) / 2 / w + 0.5, 0.5, x1 / w + 0.5, 0.5);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  return g;
}

function stripeMat(assets: AssetManager, name: string): THREE.Material {
  const key = name;
  let m = stripeMats.get(key);
  if (!m) {
    m = toon({ map: assets.tex(name), relief: 0.5 });
    m.side = THREE.DoubleSide;
    stripeMats.set(key, m);
  }
  return m;
}

/** A fish stall: plank counter, timber posts, a striped awning with a scalloped edge, the catch on ice. */
export function buildStall(B: StaticBatch, assets: AssetManager, x: number, y: number, z: number, yaw: number, stripe: string, seed = 1): void {
  const M = harborMats(assets);
  const aw = stripeMat(assets, stripe);
  const P = (g: THREE.BufferGeometry) => put(g, x, y, z, yaw);
  B.add(P(block(2.2, 0.86, 0.96, 0.025, seed, 1.6).translate(0, 0.43, 0)), M.planks, 0.03);
  B.add(P(block(2.5, 0.1, 1.2, 0.012, seed + 1, 1.5).translate(0, 0.91, 0.02)), M.timber, 0.03);
  for (const sx of [-1.15, 1.15]) {
    B.add(P(block(0.12, 2.5, 0.12, 0.01, seed + 2, 1.5).translate(sx, 1.25, -0.42)), M.timber, 0.02);
    B.add(P(block(0.1, 1.15, 0.1, 0.01, seed + 3, 1.5).translate(sx, 1.5, 0.5)), M.timber, 0.02);
    // a side strut from the back post out to the awning's edge
    const strut = new THREE.BoxGeometry(0.07, 0.07, 1.05).rotateX(0.2).translate(sx, 2.12, 0.05);
    B.add(P(strut), M.timber, 0);
  }
  const top = new THREE.BoxGeometry(2.7, 0.07, 1.7).rotateX(0.2).translate(0, 2.27, 0.15);
  B.add(P(top), aw, 0.025);
  B.add(P(valance(2.7, 0.36, 8).translate(0, 2.08, 0.99)), aw, 0);
  // the catch: a tilted tray of ice with three painted fish
  const tray = block(1.9, 0.1, 0.72, 0.01, seed + 4, 1).rotateX(0.16).translate(0, 1.04, 0.05);
  B.add(P(tray), M.cream, 0.02);
  const fishM = [M.teal, M.coral, M.neon];
  for (let i = 0; i < 3; i++) {
    const body = new THREE.SphereGeometry(0.17, 10, 7).scale(1.9, 0.62, 0.8).rotateY(0.3 - i * 0.3).translate(-0.6 + i * 0.6, 1.16, 0.05);
    B.add(P(body), fishM[(i + seed) % 3], 0.02);
    const tail = new THREE.ConeGeometry(0.14, 0.24, 4).scale(1, 1, 0.3).rotateZ(-Math.PI / 2).translate(-0.6 + i * 0.6 - 0.38, 1.16, 0.05 + (0.3 - i * 0.3) * 0.38);
    B.add(P(tail), fishM[(i + seed) % 3], 0.015);
    B.add(P(new THREE.SphereGeometry(0.03, 5, 4).translate(-0.6 + i * 0.6 + 0.2, 1.22, 0.12)), M.ink, 0);
  }
  // a lantern under the awning's corner and a price board on the counter front
  B.add(P(new THREE.SphereGeometry(0.13, 8, 6).translate(1.0, 1.82, 0.7)), M.lampOff, 0.02);
  B.add(P(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4).translate(1.0, 2.02, 0.7)), M.ink, 0);
  B.add(P(block(0.7, 0.45, 0.05, 0.01, seed + 5, 1).translate(-0.5, 0.5, 0.5)), M.indigo, 0.02);
}

/** The fish-market awning you can stand on: a striped canopy on braced timber posts. World space. */
export function buildBigAwning(B: StaticBatch, assets: AssetManager, c: THREE.Vector3, half: THREE.Vector3, ground: number): void {
  const M = harborMats(assets);
  const aw = stripeMat(assets, 'h2_stripe_coral');
  B.add(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2).translate(c.x, c.y, c.z), aw, 0.04);
  for (const sz of [-1, 1]) {
    const v = valance(half.x * 2, 0.42, 12).translate(0, 0, half.z + 0.01);
    if (sz < 0) v.rotateY(Math.PI);
    B.add(v.translate(c.x, c.y - half.y + 0.02, c.z), aw, 0);
  }
  for (const sx of [-1, 1]) {
    const v = valance(half.z * 2, 0.42, 8).translate(0, 0, half.x + 0.01).rotateY(sx * Math.PI / 2);
    B.add(v.translate(c.x, c.y - half.y + 0.02, c.z), aw, 0);
  }
  const h = c.y - half.y - ground;
  for (const [px, pz] of [[-0.88, -0.83], [0.88, -0.83], [-0.88, 0.83], [0.88, 0.83]]) {
    const x = c.x + px * half.x, z = c.z + pz * half.z;
    B.add(block(0.16, h, 0.16, 0.01, 3, 1.5).translate(x, ground + h / 2, z), M.timber, 0.02);
    // knee braces up to the frame
    const br = new THREE.BoxGeometry(0.08, 0.9, 0.08).rotateZ(px > 0 ? 0.75 : -0.75).translate(x - Math.sign(px) * 0.3, ground + h - 0.36, z);
    B.add(br, M.timber, 0);
  }
  for (const sz of [-0.83, 0.83]) B.add(block(half.x * 2 - 0.2, 0.12, 0.12, 0.008, 5, 1.5).translate(c.x, c.y - half.y - 0.07, c.z + sz * half.z), M.timber, 0.02);
}

// ───────────── the jetty stair ─────────────
/** A raked stone parapet beside a stair running from `top` down to `foot` (along x), with a timber handrail. */
export function buildStairParapet(B: StaticBatch, assets: AssetManager, top: THREE.Vector3, foot: THREE.Vector3, z: number): void {
  const M = harborMats(assets);
  const s = new THREE.Shape();
  const x0 = top.x - 0.5, x1 = foot.x + 0.7;
  s.moveTo(x0, top.y + 0.95);
  s.lineTo(top.x + 0.2, top.y + 0.95);
  s.lineTo(foot.x, foot.y + 0.95);
  s.lineTo(x1, foot.y + 0.95);
  s.lineTo(x1, foot.y - 0.5);
  s.lineTo(x0, foot.y - 0.5);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: false }).translate(0, 0, z - 0.16);
  B.add(worldUV(g, 3), M.stone, 0.04);
  const railPts = [new THREE.Vector3(x0, top.y + 1.03, z), new THREE.Vector3(top.x + 0.2, top.y + 1.03, z), new THREE.Vector3(foot.x, foot.y + 1.03, z), new THREE.Vector3(x1, foot.y + 1.03, z)];
  for (let i = 0; i < 3; i++) {
    const a = railPts[i], b = railPts[i + 1];
    const len = a.distanceTo(b);
    const cap = block(len + 0.08, 0.14, 0.44, 0.008, i + 2, 1.5);
    cap.rotateZ(Math.atan2(b.y - a.y, b.x - a.x));
    B.add(cap.translate((a.x + b.x) / 2, (a.y + b.y) / 2, z), M.cream, 0.025);
  }
  // newel posts with ball finials
  for (const [px, py] of [[x0 + 0.2, top.y], [x1 - 0.2, foot.y]]) {
    B.add(block(0.5, 1.5, 0.5, 0.015, 7, 1.5).translate(px, py + 0.6, z), M.stone, 0.03);
    B.add(new THREE.SphereGeometry(0.24, 10, 8).translate(px, py + 1.52, z), M.brass, 0.025);
  }
}

// ───────────── small props ─────────────
/** A coopered barrel: bulged staves and two iron hoops. Base at y = 0. */
export function barrelGeo(): { body: THREE.BufferGeometry; hull: THREE.BufferGeometry; hoops: THREE.BufferGeometry[] } {
  const p = [v2(0.001, 0), v2(0.42, 0), v2(0.5, 0.3), v2(0.52, 0.55), v2(0.5, 0.82), v2(0.42, 1.1), v2(0.36, 1.1), v2(0.36, 1.04), v2(0.001, 1.04)];
  return {
    body: lathe(p, 12, 0.02, 1.4),
    hull: latheHull(p.slice(0, 6), 12, 0.02, 0.03),
    hoops: [0.26, 0.86].map((y) => new THREE.TorusGeometry(y < 0.5 ? 0.5 : 0.495, 0.03, 4, 12).rotateX(Math.PI / 2).translate(0, y, 0)),
  };
}

/** A painted tree canopy: three overlapping wobbly blobs instead of one ball. Centre at the origin. */
export function canopyGeos(r: number, seed: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const offs: [number, number, number, number][] = [[0, 0, 0, 1], [0.55, -0.2, 0.3, 0.68], [-0.5, -0.15, -0.35, 0.72]];
  offs.forEach(([x, y, z, s], i) => {
    const g = new THREE.IcosahedronGeometry(r * s, 1);
    g.scale(1, 0.86, 1);
    wonk(g, r * 0.07, seed + i * 3);
    out.push(g.translate(x * r, y * r, z * r));
  });
  return out;
}

/** The lagoon's bell buoy: a striped float, an iron cage, the bell and a lamp. Origin at the water line. */
export function buildBuoy(assets: AssetManager): THREE.Group {
  const M = harborMats(assets);
  const g = new THREE.Group();
  const B = new StaticBatch();
  const fp = [v2(0.001, -0.4), v2(0.8, -0.4), v2(1.06, -0.12), v2(1.1, 0.3), v2(0.96, 0.68), v2(0.5, 0.84), v2(0.001, 0.86)];
  B.add(lathe(fp, 14, 0.02, 2), M.neon, 0, latheHull(fp.slice(1, 6), 14, 0.02, 0.05));
  B.add(lathe([v2(1.1, 0.08), v2(1.12, 0.3), v2(1.06, 0.5)], 14, 0.02, 2), M.cream, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const c = Math.cos(a), s2 = Math.sin(a);
    B.add(tube([new THREE.Vector3(c * 0.72, 0.75, s2 * 0.72), new THREE.Vector3(c * 0.5, 1.6, s2 * 0.5), new THREE.Vector3(c * 0.16, 2.55, s2 * 0.16)], 0.05, 8, 5), M.iron, 0);
  }
  B.add(new THREE.TorusGeometry(0.52, 0.045, 5, 14).rotateX(Math.PI / 2).translate(0, 1.55, 0), M.iron, 0);
  B.add(new THREE.TorusGeometry(0.2, 0.045, 5, 10).rotateX(Math.PI / 2).translate(0, 2.5, 0), M.iron, 0);
  const { g: bg, hull } = bellGeo(0.3);
  B.add(bg.translate(0, 2.32, 0), M.brass, 0, hull.translate(0, 2.32, 0));
  B.add(new THREE.SphereGeometry(0.17, 10, 8).translate(0, 2.72, 0), M.lampOff, 0.025);
  B.flush(g, 'buoy');
  return g;
}

/**
 * One of the lost boats that come home: a clinker boat with a plank deck flush with its gunwale, a mast and a
 * patched sail. Bow at +z, the deck top at y 0.8. `solids` are its drawn shape in boat space (hull up to the
 * deck, mast): MuteHarbor turns them into colliders, so feet rest on the planks that are drawn.
 */
export function buildSailBoat(assets: AssetManager, paint: string, seed = 1): { g: THREE.Group; solids: THREE.BufferGeometry[] } {
  const M = harborMats(assets);
  const g = new THREE.Group();
  const B = new StaticBatch();
  const b = 1.3;
  const prof = [0.7, 0.9, 1, 1, 0.95, 0.82, 0.6, 0.32, 0.03];
  const plan: [number, number][] = [];
  prof.forEach((k, i) => plan.push([b * k, -1.7 + (3.4 * i) / 8]));
  for (let i = 7; i >= 0; i--) plan.push([-b * prof[i], -1.7 + (3.4 * i) / 8]);
  const L = (y: number, sx: number, sz = 1) => ring(plan, y, sx, sz);
  const hullR = [L(-0.42, 0.42, 0.86), L(-0.1, 0.78, 0.95), L(0.35, 0.96, 0.99), L(0.7, 1, 1)];
  const paintM = toon({ map: assets.tex(paint) });
  B.add(worldUV(loft(hullR, false, true, 1.0), 2), paintM, 0, loftHull([...hullR, L(0.8, 1.04, 1.01)], 0.05));
  B.add(worldUV(loft([L(0.68, 1.04, 1.01), L(0.8, 1.04, 1.01), L(0.8, 0.9, 0.97), L(0.56, 0.9, 0.97)], false, false), 1.5), M.cream, 0);
  // the deck: planks across the whole boat, flush with the gunwale (WAI hops from deck to deck)
  B.add(worldUV(loft([L(0.74, 0.9, 0.97), L(0.785, 0.9, 0.97)], true), 1.6), M.planks, 0);
  for (const z of [-0.95, 0.15]) B.add(new THREE.BoxGeometry(b * 1.7, 0.02, 0.05).translate(0, 0.79, z), M.timber, 0);
  // fenders on both sides (moored boats raft up gunwale to gunwale)
  for (const sx of [-1, 1]) for (const z of [-0.6, 0.5]) B.add(new THREE.CapsuleGeometry(0.11, 0.3, 3, 8).translate(sx * b * 1.04, 0.45, z), M.cream, 0.02);
  // mast, yard and a billowing sail with a patch
  B.add(new THREE.CylinderGeometry(0.05, 0.07, 2.9, 6).translate(0, 2.0, 1.0), M.timber, 0.015);
  B.add(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 5).rotateZ(Math.PI / 2 - 0.12).translate(0.1, 3.05, 1.06), M.timber, 0.012);
  const sail = new THREE.PlaneGeometry(1.5, 1.8, 5, 5);
  const sp = sail.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i);
    sp.setZ(i, Math.cos((x / 0.75) * (Math.PI / 2)) * Math.cos((y / 0.9) * (Math.PI / 2)) * 0.28);
    sp.setX(i, x * (1 - (y + 0.9) * 0.08));
  }
  sail.computeVertexNormals();
  const sailM = toon({ map: assets.tex('h2_p_paper') });
  sailM.side = THREE.DoubleSide;
  B.add(sail.translate(0.1, 2.1, 1.08), sailM, 0);
  const patchM = toon({ map: assets.tex(seed % 2 ? 'h2_p_neon' : 'h2_p_teal') });
  patchM.side = THREE.DoubleSide;
  B.add(new THREE.PlaneGeometry(0.4, 0.36).rotateZ(0.2).translate(0.35, 1.8, 1.33), patchM, 0);
  B.add(new THREE.SphereGeometry(0.11, 8, 6).translate(0, 3.5, 1.0), M.lampOff, 0.02);
  B.flush(g, 'boat');
  const hull = new THREE.BufferGeometry().setFromPoints([...L(-0.42, 0.42, 0.86), ...L(0.8, 1.04, 1.01)]);
  return { g, solids: [hull, new THREE.CylinderGeometry(0.08, 0.08, 2.9, 6).translate(0, 2.0, 1.0)] };
}
