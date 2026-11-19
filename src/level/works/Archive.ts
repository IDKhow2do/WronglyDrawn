/**
 * [INPUT]: depends on FloorBuild/floorShell/finishFloor/dropTrail/floorCrown/region/holeRailing/WorksLists from ./WorksShell;
 *          cabinet/paperStack/screen/sign/stairs/girder/hangingLamp from ./WorksKit; block/lathe/latheHull/tube/v2/StaticBatch from
 *          ../harbor/HarborKit; WORKS/FY/IN/stairStep from ./WorksLayout; Checkpoint/Crown from ../Collectibles
 * [OUTPUT]: exports buildArchive() → BuiltArchive (the catalogue gate lock, the roof-stair grille, the top of the pencil stair,
 *           the Archivist's crown, update)
 * [POS]: F3 of Limp Works, the archive of crossed-out drawings: filing-shelf stacks (their tops hold crowns: Long Legs),
 *        walls of pinned drawings with red Xs, the Reading Room (Compass Spinners), the card-catalogue DOOR (two hinged
 *        cabinet leaves in a steel frame, a red CLOSED tape; it swings open into the Index; solid shut and open) to the
 *        Index (the Archivist, Guardian 3) and the caged stair to the roof behind its CLOSED grille (floor to ceiling;
 *        it slides up into the ceiling when the Archivist wakes).
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import { Checkpoint, type Crown } from '../Collectibles';
import { StaticBatch, block, lathe, latheHull, v2 } from '../harbor/HarborKit';
import { cabinet, paperStack, screen, sign, stairs, type WorksMats } from './WorksKit';
import { FY, IN, WORKS, stairStep } from './WorksLayout';
import { dropTrail, floorCrown, floorShell, holeRailing, newFloor, region, type FloorBuild, type WorksLists } from './WorksShell';
import type { Lock } from './ConveyorHall';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface BuiltArchive {
  f: FloorBuild;
  /** The card-catalogue gate between the Reading Room and the Index. */
  gate: Lock;
  /** The roof stair's CLOSED grille (lifts when the Archivist wakes). */
  grille: Lock;
  /** The pencil stair's top (shown once the Inspector has drawn it). */
  showStairTop(): void;
  crownArchivist: Crown;
  checkpointAt: THREE.Vector3;
  update(dt: number, time: number): void;
}

/** A double-sided filing shelf along z at x (z0..z1), h tall: uprights, five boards, binders and paper on them. */
function shelfRow(B: StaticBatch, solid: boolean, f: FloorBuild, x: number, z0: number, z1: number, h: number, seed: number): void {
  const { mats } = f;
  const y = f.y;
  const len = z1 - z0, cz = (z0 + z1) / 2, d = 1.2;
  let s = seed * 7 + 1;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let z = z0; z <= z1 + 0.01; z += len / Math.max(1, Math.round(len / 2.2))) for (const sx of [-1, 1]) B.add(new THREE.BoxGeometry(0.1, h, 0.1).translate(x + sx * (d / 2 - 0.05), y + h / 2, z), mats.steelDark, 0.02);
  const levels = 5;
  for (let i = 0; i < levels; i++) {
    const yy = y + 0.12 + (i * (h - 0.12)) / (levels - 1);
    B.add(block(d, 0.06, len, 0.004, seed + i, 2).translate(x, yy, cz), mats.steel, i === levels - 1 ? 0.03 : 0.015);
    if (i === levels - 1) break;
    // binders and boxes on both faces of the board
    for (const face of [-1, 1]) {
      let z = z0 + 0.15;
      while (z < z1 - 0.4) {
        const w = 0.18 + r() * 0.5;
        const hh = 0.32 + r() * 0.18;
        const k = r();
        const m = k < 0.45 ? mats.cream : k < 0.7 ? mats.steel : k < 0.85 ? mats.red : mats.cabinet;
        if (r() < 0.12) paperStack(B, V(x + face * 0.28, yy + 0.03, z + 0.3), 3 + Math.floor(r() * 4), mats, seed * 31 + i * 7 + z);
        else B.add(new THREE.BoxGeometry(0.46, hh, w - 0.03).translate(x + face * 0.3, yy + 0.03 + hh / 2, z + w / 2), m, 0);
        z += w + (r() < 0.2 ? 0.25 : 0.02);
      }
    }
  }
  if (solid) f.phys.addStaticBox(V(x, y + h / 2, cz), V(d / 2, h / 2, len / 2));
}

/** A cork board of pinned drawings on a wall (each sheet a 2 cm board, the Red Pen's X on every one). */
function pinBoard(B: StaticBatch, mats: WorksMats, c: THREE.Vector3, n: THREE.Vector3, w: number, h: number, seed: number): void {
  const yaw = Math.atan2(n.x, n.z);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0) => B.add(g.applyQuaternion(q).translate(c.x, c.y, c.z), m, ink);
  put(block(w, h, 0.1, 0.005, seed, 1).translate(0, 0, 0.05), mats.wood, 0.03);
  const cols = Math.max(1, Math.floor(w / 1.0)), rows = Math.max(1, Math.floor(h / 1.0));
  let k = seed;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const g = new THREE.BoxGeometry(0.72, 0.72, 0.02);
      const kk = k++ % 4;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let v = 0; v < uv.count; v++) uv.setXY(v, (kk % 2) * 0.5 + uv.getX(v) * 0.5, (kk < 2 ? 0.5 : 0) + uv.getY(v) * 0.5);
      g.rotateZ(((k * 37) % 9 - 4) * 0.03);
      put(g.translate(-w / 2 + (i + 0.5) * (w / cols), -h / 2 + (j + 0.5) * (h / rows), 0.12), mats.paper);
      put(new THREE.SphereGeometry(0.035, 6, 4).translate(-w / 2 + (i + 0.5) * (w / cols), -h / 2 + (j + 0.5) * (h / rows) + 0.3, 0.14), mats.red);
    }
}

export function buildArchive(ctx: GameContext, L: WorksLists): BuiltArchive {
  const f = newFloor(ctx, 2);
  const { B, mats, phys } = f;
  const y = FY[2];
  const W = WORKS;
  floorShell(f, {
    holes: [W.hole2],
    ceilHoles: [W.hole3],
    noWindows: [{ x0: 13, x1: 24, z0: -12, z1: -2 }],
    lamps: [[-15, -16], [-6, -12], [6, -12], [-5, 6], [5, 12], [-5, 13], [16, 4], [16, -16]],
  });
  holeRailing(f, W.hole2, ['e', 's']);

  // ───────────── the stacks: double shelves in rows (their tops are long-jump perches) ─────────────
  const sh = 2.6;
  for (const [i, x] of [-7.5, -3.5, 0.5, 4.5, 8.5].entries()) {
    shelfRow(B, true, f, x, -20.6, -13.2, sh, i * 3 + 1);
    shelfRow(B, true, f, x, -11.2, -3.2, sh, i * 3 + 2);
  }
  // the stacks' east side: a full shelf wall (the Index is entered only through the catalogue)
  shelfRow(B, true, f, 10.6, -IN + 0.2, -1.6, sh + 1.4, 40);
  floorCrown(f, L, 'crown-w3-shelf1', V(-3.5, y + sh + 0.9, -17), 'On top of a filing shelf in the stacks');
  floorCrown(f, L, 'crown-w3-shelf2', V(4.5, y + sh + 0.9, -6.5), 'On top of another filing shelf, near the Reading Room');
  f.marks.add(1, V(-1.5, y + 0.01, -12.2), V(0, 1, 0), 2.0, 0.6);

  // walls of pinned drawings (all crossed out)
  pinBoard(B, mats, V(-IN + 0.02, y + 3.6, -16.5), V(1, 0, 0), 4, 3, 1);
  pinBoard(B, mats, V(-IN + 0.02, y + 3.6, 12), V(1, 0, 0), 5, 3, 5);
  pinBoard(B, mats, V(-2, y + 3.6, -IN + 0.02), V(0, 0, 1), 6, 3, 9);
  pinBoard(B, mats, V(16, y + 3.6, -IN + 0.02), V(0, 0, 1), 5, 3, 13);
  const s1 = sign('CHILDREN’S DRAWINGS — CORRECTED', 6, 0.7, '#f3ead6', '#d8283a');
  s1.position.set(-14.5, y + 6.6, -IN + 0.08);
  f.group.add(s1);

  // ───────────── the Reading Room: desks round an open floor, a globe ─────────────
  for (const [x, z, yaw] of [[-8.6, 4, Math.PI / 2], [-8.6, 9, Math.PI / 2], [-8.6, 14, Math.PI / 2], [3, 16.2, 0], [-3, 16.2, 0]] as [number, number, number][]) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const put = (g: THREE.BufferGeometry, m: THREE.Material, ink = 0.03, hull?: THREE.BufferGeometry) => B.add(g.applyQuaternion(q).translate(x, y, z), m, ink, hull?.applyQuaternion(q).translate(x, y, z));
    put(block(2.4, 0.1, 1.1, 0.005, x + z, 1).translate(0, 0.8, 0), mats.wood);
    for (const sx of [-1.05, 1.05]) put(new THREE.BoxGeometry(0.12, 0.78, 0.9).translate(sx, 0.39, 0), mats.steelDark, 0.02);
    const lampP = [v2(0.12, 0), v2(0.14, 0.05), v2(0.03, 0.08), v2(0.03, 0.5), v2(0.22, 0.62), v2(0.26, 0.7)];
    put(lathe(lampP, 12, 0).translate(0.7, 0.85, -0.2), mats.brass, 0, latheHull(lampP, 12, 0, 0.02).translate(0.7, 0.85, -0.2));
    paperStack(B, V(x, y + 0.85, z).add(V(-0.4, 0, 0.1).applyQuaternion(q)), 3, mats, x * 13 + z);
    phys.addStaticBox(V(x, y + 0.45, z), V(yaw ? 0.55 : 1.2, 0.45, yaw ? 1.2 : 0.55));
  }
  {
    // the globe on a brass stand (a crown on top for a long-legged climber)
    const gx = -7.6, gz = 0.6;
    const stand = [v2(0.6, 0), v2(0.62, 0.08), v2(0.2, 0.14), v2(0.12, 0.6), v2(0.18, 1.1), v2(0.001, 1.14)];
    B.add(lathe(stand, 14, 0).translate(gx, y, gz), mats.brass, 0, latheHull(stand, 14, 0, 0.03).translate(gx, y, gz));
    B.add(new THREE.SphereGeometry(0.9, 20, 14).translate(gx, y + 2.0, gz), mats.paper, 0.04);
    B.add(new THREE.TorusGeometry(1.0, 0.05, 6, 28).rotateY(0.4).translate(gx, y + 2.0, gz), mats.brass, 0.015);
    phys.addStaticCylinder(V(gx, y + 1.45, gz), 1.45, 0.9);
    floorCrown(f, L, 'crown-w3-globe', V(gx, y + 2.9 + 0.8, gz), 'On top of the globe in the Reading Room');
  }
  f.marks.add(2, V(0, y + 0.01, 10), V(0, 1, 0), 3.0, 0);
  f.marks.add(0, V(6, y + 0.01, 5), V(0, 1, 0), 2.2, 0.4);
  region(L, 'The Reading Room', W.reading.x0, y - 1, W.reading.z0, W.reading.x1, y + 8, W.reading.z1);

  // ───────────── the card catalogue: a wall of drawer cabinets with a sliding gate ─────────────
  const cx = W.catalogueX;
  for (let z = 2.4; z < 17.6; z += 1.0) {
    if (z > 7.9 && z < 11.1) continue;
    cabinet(B, null, V(cx, y, z), -Math.PI / 2, 2.4, mats, 0.95, 0.8);
  }
  phys.addStaticBox(V(cx, y + 1.3, 5.1), V(0.45, 1.3, 3.2));
  phys.addStaticBox(V(cx, y + 1.3, 14.6), V(0.45, 1.3, 3.45));
  // the screen above the cabinets keeps long legs from hopping the catalogue
  screen(B, phys, V(cx, y + 2.4, 1.8), V(cx, y + 2.4, 17.8), y + 2.4, FY[3] - 0.62, mats);
  screen(B, phys, V(cx, y, -1.6), V(cx, y, 1.8), y, FY[3] - 0.62, mats);
  // the gate: a DOOR of two cabinet leaves on hinges (a steel frame, brass handles at the seam, a red CLOSED tape
  // crossed over it); it swings open into the Index. The collider matches the closed leaves until they are half open.
  const hingeX = cx + 0.42;
  const leaves: { g: THREE.Group; dir: number }[] = [];
  for (const [hz, zs, dir] of [[7.95, [8.35, 9.1], 1], [11.05, [10.0, 10.75], -1]] as [number, number[], number][]) {
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, y, hz);
    const inner = new THREE.Group();
    inner.position.set(-hingeX, -y, -hz);
    const gB = new StaticBatch();
    for (const z of zs) cabinet(gB, null, V(cx, y, z), -Math.PI / 2, 2.4, mats, 0.75, 0.8);
    // the brass door handle on the seam side, a full-height bar
    const seamZ = dir > 0 ? 9.47 : 9.63;
    gB.add(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 8).translate(cx - 0.47, y + 1.25, seamZ), mats.brass, 0.015);
    for (const m of gB.flush(inner, 'works-catalogue-door')) m.castShadow = true;
    pivot.add(inner);
    pivot.userData.noPaint = true;
    f.group.add(pivot);
    leaves.push({ g: pivot, dir });
  }
  // the frame: two steel posts at the hinges and a lintel under the screen (it reads as a doorway before it opens)
  for (const z of [7.88, 11.12]) B.add(new THREE.BoxGeometry(0.95, 2.5, 0.12).translate(cx, y + 1.25, z), mats.steelDark, 0.02);
  B.add(new THREE.BoxGeometry(0.95, 0.16, 3.36).translate(cx, y + 2.42, 9.5), mats.steelDark, 0.02);
  // a red CLOSED tape crossed over the door on the Reading Room side (it tears when the door opens)
  const tape = new THREE.Group();
  {
    const tm = new THREE.MeshStandardMaterial({ color: '#d8283a', roughness: 0.7 });
    for (const r of [0.62, -0.62]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.16, 3.4), tm);
      bar.position.set(cx - 0.5, y + 1.25, 9.5);
      bar.rotation.x = r;
      tape.add(bar);
    }
    const tag = sign('CLOSED', 1.0, 0.36, '#d8283a', '#ffffff');
    tag.position.set(cx - 0.53, y + 1.25, 9.5);
    tag.rotation.y = -Math.PI / 2;
    tape.add(tag);
    tape.userData.noPaint = true;
    f.group.add(tape);
  }
  let gateCol: RAPIER.Collider | null = phys.addStaticBox(V(cx, y + 1.3, 9.5), V(0.45, 1.3, 1.6));
  const s2 = sign('CARD CATALOGUE', 2.6, 0.5, '#f3ead6', '#2a4be0');
  s2.position.set(cx - 0.46, y + 2.85, 9.5);
  s2.rotation.y = -Math.PI / 2;
  f.group.add(s2);
  let gateT = -1;
  let gateOpen = false;
  const gate: Lock = {
    get open() {
      return gateOpen;
    },
    unlock() {
      if (gateOpen) return;
      gateOpen = true;
      gateT = 0;
      tape.visible = false;
      ctx.effects.burst(V(cx - 0.5, y + 1.3, 9.5), '#d8283a', 16, 4, 0.08);
      ctx.audio.play('gateOpen', { pos: V(cx, y, 9.5), vol: 0.8 });
    },
  };

  // ───────────── the Index (east): filing cabinets round the Archivist ─────────────
  for (const [x, z] of [[20.6, 6], [20.6, 7], [20.6, 8], [20.6, 12], [20.6, 13], [13, -20.6], [14, -20.6], [18, -20.6], [19, -20.6]] as [number, number][]) {
    const yaw = x > 20 ? -Math.PI / 2 : 0;
    cabinet(B, phys, V(x, y, z), yaw, x > 20 ? 1.9 : 2.6, mats);
  }
  for (const [x, z, n] of [[13, 15, 6], [14, 15.6, 4], [19.5, -2, 8], [12.2, -15, 5]] as [number, number, number][]) paperStack(B, V(x, y, z), n, mats, x + z * 3);
  f.marks.add(1, V(14, y + 0.01, 3), V(0, 1, 0), 2.4, 0.2);
  region(L, 'The Index', W.index.x0, y - 1, W.index.z0, W.index.x1, y + 8, W.index.z1);
  region(L, 'The Archive', -IN, y - 1, -IN, IN, y + 8, IN);

  // ───────────── the roof stair (caged, behind a CLOSED grille) ─────────────
  const st = W.stair3;
  stairs(B, phys, st, mats, 0, 12);
  const topSteps = new THREE.Group();
  {
    const tB = new StaticBatch();
    stairs(tB, null, W.stair2, mats, 12, W.stair2.n);
    for (const m of tB.flush(topSteps, 'works-stair2-top')) m.castShadow = true;
    topSteps.visible = false;
    f.group.add(topSteps);
  }
  screen(B, phys, V(st.foot.x - 0.2, y, st.foot.z - st.hw - 0.25), V(W.hole3.x1, y, st.foot.z - st.hw - 0.25), y, FY[3] - 0.62, mats);
  screen(B, phys, V(W.hole3.x1 + 0.1, y, st.foot.z - st.hw - 0.25), V(W.hole3.x1 + 0.1, y, IN - 0.05), y, FY[3] - 0.62, mats);
  const GRILLE_H = FY[3] - 0.62 - y;
  const grilleG = new THREE.Group();
  let grilleCol: RAPIER.Collider | null = null;
  {
    // floor to ceiling (a 3.2 m grille alone is a Long-Legs hop onto the stair)
    const gx = st.foot.x - 0.15, z0 = st.foot.z - st.hw - 0.2, z1 = IN - 0.05, gh = GRILLE_H;
    const gB = new StaticBatch();
    for (let z = z0 + 0.15; z < z1; z += 0.32) gB.add(new THREE.CylinderGeometry(0.035, 0.035, gh, 6).translate(gx, y + gh / 2, z), mats.red, 0.012);
    for (const yy of [0.3, 1.6, 2.9, 4.6, 6.4, gh - 0.1]) gB.add(new THREE.BoxGeometry(0.08, 0.1, z1 - z0).translate(gx, y + yy, (z0 + z1) / 2), mats.steelDark, 0.015);
    for (const m of gB.flush(grilleG, 'works-grille')) m.castShadow = true;
    const s3 = sign('CLOSED FOR CORRECTION', 2.8, 0.5, '#d8283a', '#ffffff');
    s3.position.set(gx - 0.08, y + 2.2, (z0 + z1) / 2);
    s3.rotation.y = -Math.PI / 2;
    grilleG.add(s3);
    grilleG.userData.noPaint = true;
    f.group.add(grilleG);
    grilleCol = phys.addStaticBox(V(gx, y + gh / 2, (z0 + z1) / 2), V(0.12, gh / 2, (z1 - z0) / 2));
  }
  let grilleT = -1;
  let grilleOpen = false;
  const grille: Lock = {
    get open() {
      return grilleOpen;
    },
    unlock() {
      if (grilleOpen) return;
      grilleOpen = true;
      grilleT = 0;
      if (grilleCol) {
        phys.untag(grilleCol);
        phys.world.removeCollider(grilleCol, false);
        grilleCol = null;
      }
      ctx.audio.play('gateOpen', { pos: st.foot, vol: 0.8 });
    },
  };

  // ───────────── checkpoints, collectibles ─────────────
  const cpAt = V(-16, y, -15.5);
  L.checkpoints.push(new Checkpoint(ctx, 'cp-archive', cpAt, Math.PI / 2), new Checkpoint(ctx, 'cp-index', V(12.6, y, 12.5), Math.PI));
  for (const c of L.checkpoints.slice(-2)) f.group.attach(c.root);
  const crownArchivist = floorCrown(f, L, 'crown-w3-archivist', W.archivist.clone().add(V(-3.6, 1.3, 2.4)), 'Wake the Archivist: lend it your Eye and SHOUT into its horn');
  crownArchivist.hidden = true;
  dropTrail(f, L, 'drop-w3-arrive3', [V(-17, y, -16), V(-12, y, -12.2), V(-1.5, y, -12.2)], 1.8);
  dropTrail(f, L, 'drop-w3-aisle3', [V(-1.5, y, -12.2), V(-1.5, y, 1.5), V(2, y, 6)], 1.8);
  dropTrail(f, L, 'drop-w3-index', [V(12.6, y, 9.5), V(13.5, y, 0), V(13.5, y, -5)], 1.8);
  dropTrail(f, L, 'drop-w3-stair3', [stairStep(st, 1), stairStep(st, 6), stairStep(st, 11)], 1.4);

  // (LimpWorks flushes the floor once the Guardians have added their models: finishFloor)
  f.washer.add(mats.steel, '#ffe9a8');
  f.washer.add(mats.steelDark, '#5fd6b0');
  f.washer.add(mats.brick, '#ffd6c8');
  f.washer.add(mats.red, '#ffd23a');
  f.washer.add(mats.cabinet, '#b8a8ff');
  f.washer.add(mats.cream, '#fff2b8');

  return {
    f,
    gate,
    grille,
    showStairTop() {
      topSteps.visible = true;
    },
    crownArchivist,
    checkpointAt: cpAt,
    update(dt) {
      if (gateT >= 0 && gateT < 1) {
        // the two leaves swing open into the Index (eased, a little overshoot), the collider goes at half way
        gateT = Math.min(1, gateT + dt * 0.62);
        const k = gateT < 1 ? 1 - Math.pow(1 - gateT, 3) * Math.cos(gateT * 5) : 1;
        for (const l of leaves) l.g.rotation.y = l.dir * k * 1.75;
        if (gateT > 0.45 && gateCol) {
          phys.untag(gateCol);
          phys.world.removeCollider(gateCol, false);
          gateCol = null;
        }
        if (gateT >= 1) {
          // the open leaves stand against the Index side: solid as drawn
          for (const l of leaves) {
            const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), l.dir * 1.75);
            const c = V(cx - hingeX, 1.25, l.dir * 0.775).applyQuaternion(q).add(V(hingeX, y, l.g.position.z));
            phys.addStaticBox(c, V(0.4, 1.2, 0.76), q);
          }
        }
      }
      if (grilleT >= 0 && grilleT < 1) {
        // it slides up into the ceiling and is gone
        grilleT = Math.min(1, grilleT + dt * 0.5);
        grilleG.position.y = (1 - (1 - grilleT) ** 3) * (GRILLE_H + 0.2);
        grilleG.visible = grilleT < 1;
      }
      f.washer.update(dt);
    },
  };
}
