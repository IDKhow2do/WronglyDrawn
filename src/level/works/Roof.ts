/**
 * [INPUT]: depends on FloorBuild/floorShell/finishFloor/floorCrown/region/holeRailing/WorksLists from ./WorksShell;
 *          girder/pipe/stairs from ./WorksKit; block/lathe/latheHull/tube/v2 from ../harbor/HarborKit; WORKS/FY/IN from ./WorksLayout;
 *          Checkpoint from ../Collectibles; SoulsArena / dressArena from ./SoulsArena
 * [OUTPUT]: exports buildRoof() → BuiltRoof (ring: the souls fight's ink curtain + gate, the boss's crown, the flag, update)
 * [POS]: the top of the Correction Tower: an open roof under the dawn sky with the drawn city all round. The
 *        arena is a painted correction circle in the middle, ringed by a curtain of wet red ink with one gate facing
 *        the checkpoint (SoulsArena); scaffolds, a giant ink bottle, a water tank, chimneys and a flagpole stand round
 *        it; the stair from F3 arrives in the SE.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import { Checkpoint, type Crown } from '../Collectibles';
import { block, lathe, latheHull, tube, v2 } from '../harbor/HarborKit';
import { girder, pipe, stairs } from './WorksKit';
import { FY, IN, WORKS } from './WorksLayout';
import { SoulsArena, dressArena } from './SoulsArena';
import { floorCrown, floorShell, holeRailing, newFloor, region, type FloorBuild, type WorksLists } from './WorksShell';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export interface BuiltRoof {
  f: FloorBuild;
  crownPen: Crown;
  /** The ink curtain round the arena (gate, seal, dissolve). */
  ring: SoulsArena;
  checkpointAt: THREE.Vector3;
  update(dt: number, time: number): void;
}

export function buildRoof(ctx: GameContext, L: WorksLists): BuiltRoof {
  const f = newFloor(ctx, 3);
  const { B, mats, phys } = f;
  const y = FY[3];
  const W = WORKS;
  floorShell(f, { roof: true, holes: [W.hole3] });
  holeRailing(f, W.hole3, ['n', 'w']);
  // the stair's last steps come up through the hatch (built here: drawn with the roof)
  stairs(B, phys, W.stair3, mats, 12, W.stair3.n);

  // ───────────── the arena: a huge red correction circle on blueprint grid ─────────────
  const A = W.arena;
  f.marks.add(2, V(A.x, y + 0.012, A.z), V(0, 1, 0), W.arenaR * 2.35, 0.2);
  f.marks.add(3, V(A.x + 7.5, y + 0.014, A.z + 6.5), V(0, 1, 0), 3.4, -0.3);
  f.marks.add(1, V(A.x - 8, y + 0.014, A.z - 6), V(0, 1, 0), 3.0, 0.5);
  // studs round the ring (short brass bollards at the foot of the ink curtain; none in the gate)
  const studs = 40;
  for (let i = 0; i < studs; i++) {
    const a = (i / studs) * Math.PI * 2;
    const x = A.x + Math.sin(a) * (W.arenaR + 0.9), z = A.z + Math.cos(a) * (W.arenaR + 0.9);
    if (Math.hypot(x - W.gate.x, z - W.gate.z) < 3) continue;
    B.add(lathe([v2(0.16, 0), v2(0.18, 0.05), v2(0.12, 0.08), v2(0.12, 0.3), v2(0.001, 0.34)], 8, 0).translate(x, y, z), mats.brass, 0.02);
  }
  // the souls fight's stage: the wet-ink curtain with its gate, and the props round it
  const ring = new SoulsArena(f);
  dressArena(f);

  // ───────────── the corners: water tank, chimneys, the flagpole ─────────────
  {
    const tx = 16.4, tz = -16.4;
    for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) girder(B, V(tx + dx, y, tz + dz), V(tx + dx * 0.8, y + 4, tz + dz * 0.8), 0.28, 0.24, mats.steelDark);
    const tank = [v2(0.001, 0), v2(2.0, 0), v2(2.1, 0.15), v2(2.1, 3.0), v2(2.2, 3.1), v2(1.6, 3.9), v2(0.4, 4.5), v2(0.001, 4.6)];
    B.add(lathe(tank, 22, 0.015).translate(tx, y + 4, tz), mats.wood, 0, latheHull(tank, 22, 0.015, 0.05).translate(tx, y + 4, tz));
    for (const yy of [0.8, 1.8, 2.6]) B.add(new THREE.TorusGeometry(2.14, 0.06, 6, 30).rotateX(Math.PI / 2).translate(tx, y + 4 + yy, tz), mats.steelDark, 0.015);
    phys.addStaticBox(V(tx, y + 2, tz), V(1.8, 2, 1.8));
    phys.addStaticCylinder(V(tx, y + 6.2, tz), 2.3, 2.15);
  }
  for (const [cx, cz, h] of [[-17, -17, 4.6], [-14.2, -18, 3.4]] as [number, number, number][]) {
    B.add(block(1.6, h, 1.6, 0.02, cx + cz, 1.2).translate(cx, y + h / 2, cz), mats.brick, 0.04);
    B.add(block(1.9, 0.3, 1.9, 0.01, cx - cz, 1).translate(cx, y + h + 0.15, cz), mats.steelDark, 0.03);
    phys.addStaticBox(V(cx, y + h / 2, cz), V(0.8, h / 2, 0.8));
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4, 12, 4).translate(1.2, 0, 0), new THREE.MeshStandardMaterial({ color: '#d8283a', side: THREE.DoubleSide, roughness: 0.8 }));
  {
    const fx = -17, fz = 16.5;
    const pole = [v2(0.18, 0), v2(0.2, 0.2), v2(0.08, 0.3), v2(0.07, 7.4), v2(0.16, 7.5), v2(0.001, 7.75)];
    B.add(lathe(pole, 10, 0).translate(fx, y, fz), mats.steel, 0, latheHull(pole, 10, 0, 0.025).translate(fx, y, fz));
    phys.addStaticCylinder(V(fx, y + 3.7, fz), 3.7, 0.2);
    flag.position.set(fx + 0.1, y + 6.6, fz);
    flag.castShadow = true;
    flag.userData.noPaint = true;
    f.group.add(flag);
  }
  // a pipe run along the north parapet, vents
  pipe(B, [V(-19, y + 0.5, -20.6), V(12, y + 0.5, -20.6)], 0.22, mats.red, mats.steelDark, 4);
  for (const [x, z] of [[-6, -19.6], [6, -19.6], [19.6, 4]]) {
    const vent = [v2(0.3, 0), v2(0.32, 0.9), v2(0.6, 1.1), v2(0.62, 1.2), v2(0.001, 1.25)];
    B.add(lathe(vent, 12, 0).translate(x, y, z), mats.steel, 0, latheHull(vent, 12, 0, 0.03).translate(x, y, z));
    phys.addStaticCylinder(V(x, y + 0.6, z), 0.6, 0.6);
  }
  B.add(tube([V(-12, y + 0.05, 19), V(-4, y + 0.05, 19.4), V(4, y + 0.05, 20.6)], 0.08, 12, 6), mats.rubber, 0.02);

  // ───────────── checkpoint, crown, region ─────────────
  const cpAt = V(15.2, y, 14.6);
  L.checkpoints.push(new Checkpoint(ctx, 'cp-roof', cpAt, Math.PI));
  f.group.attach(L.checkpoints[L.checkpoints.length - 1].root);
  const crownPen = floorCrown(f, L, 'crown-w3-pen', V(A.x, y + 1.3, A.z), 'Repaint THE RED PEN');
  crownPen.hidden = true;
  region(L, 'The Roof', -IN - 1, y - 1.5, -IN - 1, IN + 1, y + 20, IN + 1);

  // (LimpWorks flushes the floor once the Guardians have added their models: finishFloor)
  f.washer.add(mats.steel, '#ffe0f0');
  f.washer.add(mats.steelDark, '#7fc8ff');
  f.washer.add(mats.brick, '#ffd8a8');
  f.washer.add(mats.red, '#ffd23a');

  const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
  const base = Float32Array.from(pos.array as Float32Array);
  return {
    f,
    crownPen,
    ring,
    checkpointAt: cpAt,
    update(dt, time) {
      // the flag ripples (vertex z from x, no allocation)
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3];
        pos.setZ(i, Math.sin(time * 4 + x * 2.2) * 0.12 * (x / 2.4));
      }
      pos.needsUpdate = true;
      f.washer.update(dt);
    },
  };
}
