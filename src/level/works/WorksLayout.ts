/**
 * [INPUT]: depends on three (Vector3) only
 * [OUTPUT]: exports FY/SLAB/IN (floor heights, slab, inner wall face), Rect + inRect, WORKS (every layout constant:
 *           spawn, the door + doorOut landing, floor rects, belts, lift shaft, pit, platforms, stairs, the Index home room, guardians,
 *           spawns, arena), floorOf(), stairStep()
 * [POS]: the single source of level-3 geometry numbers. Every works/ file reads positions from here, so the
 *        floors, the director, the guide, the bots and the dev panel agree on one map.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Floor tops: F1 Conveyor Hall, F2 Stamping Floor, F3 Archive, the Roof (NavGrid scans from y 32 down). */
export const FY = [0, 9, 18, 27] as const;
/** Slab thickness: a floor's ceiling is the next floor's top minus this. */
export const SLAB = 0.6;
/** Inner face of the tower walls (|x|, |z|). */
export const IN = 21.6;

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export const inRect = (r: Rect, x: number, z: number, m = 0): boolean => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

/** Which floor a height belongs to (0..3). */
export function floorOf(y: number): number {
  if (y < FY[1] - 1.2) return 0;
  if (y < FY[2] - 1.2) return 1;
  if (y < FY[3] - 1.2) return 2;
  return 3;
}

/** One straight stair: `n` steps of 0.5 m rise and 1 m run from `foot` along `dir` (unit, horizontal). */
export interface Stair {
  foot: THREE.Vector3;
  dir: THREE.Vector3;
  n: number;
  /** half width across the run */
  hw: number;
}

/** Step k (0-based) of a stair: its tread centre (top surface). */
export function stairStep(s: Stair, k: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.copy(s.foot).addScaledVector(s.dir, 0.5 + k).setY(s.foot.y + 0.5 * (k + 1));
}

const Y1 = FY[0], Y2 = FY[1], Y3 = FY[2], Y4 = FY[3];

export const WORKS = {
  // 5.8 m inside the tower door: the shoulder camera behind WAI (4.3–4.9 m back) stays inside the hall: the title
  // push-in (main.ts → camera.idealPosition) never meets the wall or the door
  spawn: V(0, Y1, 15.8),
  spawnYaw: Math.PI,
  killY: -12,
  /** The tower door in the south wall (level 1's tower door, from the inside). */
  door: V(0, Y1, IN),
  /** On the landing outside the door, where WAI steps off the paper boat (the intro only). */
  doorOut: V(0, Y1, IN + 2.4),

  // ───────────── F1 · the Conveyor Hall ─────────────
  entry: { x0: -IN, x1: IN, z0: 12, z1: IN } as Rect,
  /** The Loading Dock: a 2.6 m ledge right across the hall (only Long Legs jump it). */
  dock: { x0: -IN, x1: IN, z0: 8, z1: 12 } as Rect,
  dockY: 2.6,
  beltFloor: { x0: -IN, x1: IN, z0: -14, z1: 8 } as Rect,
  /** Conveyor beds (top y, half depth in z, x span, speed m/s along +x × dir). */
  belts: [
    { z: 3.8, half: 1.3, x0: -17, x1: 17, top: 1.0, speed: 2.0, dir: 1 },
    { z: -6.2, half: 1.3, x0: -17, x1: 17, top: 1.0, speed: 2.0, dir: -1 },
  ],
  north1: { x0: -IN, x1: IN, z0: -IN, z1: -14 } as Rect,
  /** The freight-lift shaft (NE corner) and its cage. */
  shaft: { x0: 14, x1: IN, z0: -IN, z1: -14 } as Rect,
  cage: V(17.8, Y1, -17.8),
  cageHalf: 3.4,
  /** The red CORRECT tape in front of the lift (z) until the belt floor is quiet. */
  tapeZ: -13.6,
  /** The shredder hopper hanging from F1's ceiling under F2's pit. */
  hopperY: 5.2,

  // ───────────── F2 · the Stamping Floor ─────────────
  liftTop: V(17.8, Y2, -17.8),
  /** The STAMP RUN lane along the east wall (optional challenge). */
  stampRun: { x0: 16.4, x1: IN, z0: -9, z1: 17 } as Rect,
  stampRunStart: V(19, Y2, -10.5),
  stampRunEnd: V(19, Y2, 18.6),
  /** The shredder pit across the floor (falls → redrawn at the last spray can). */
  pit: { x0: -8, x1: 8, z0: -IN, z1: IN } as Rect,
  pitBottom: 5.8,
  /** Hanging crooked platforms over the pit (centre of the top, the rim spot a Ruler Snake measures from). */
  platforms: [
    { c: V(2.2, Y2, -1), anchor: V(9.4, Y2, -1), half: 1.75, crown: false },
    { c: V(-4.0, Y2, 0.2), anchor: V(-9.4, Y2, 0.2), half: 1.75, crown: false },
    { c: V(0.6, Y2, -12.5), anchor: V(9.4, Y2, -12.5), half: 1.6, crown: true },
  ],
  /** The gangway the Inspector drops over the pit (shortcut back east). */
  gangwayZ: -18,
  stair2: { foot: V(-19.9, Y2, 8), dir: V(0, 0, -1), n: 18, hw: 1.5 } as Stair,
  /** The F3 slab hole over the top of stair 2. */
  hole2: { x0: -IN, x1: -18.2, z0: -10, z1: -4 } as Rect,
  inspector: V(-11.5, Y2, -14.5),
  inspectorYaw: -0.62,

  // ───────────── F3 · the Archive ─────────────
  arrive3: V(-19.9, Y3, -12.6),
  stacks: { x0: -10, x1: 10, z0: -IN, z1: -1 } as Rect,
  reading: { x0: -10, x1: 10, z0: 2, z1: 17 } as Rect,
  index: { x0: 10, x1: IN, z0: -IN, z1: 17 } as Rect,
  /** The card-catalogue barrier between the Reading Room and the Index (x). */
  catalogueX: 10,
  /** The Index as its creatures' home room: walled by the catalogue (x 10) and the tower; the door is the gate (z 7.9–11.1). */
  indexRoom: { x0: 10, x1: IN, z0: -IN, z1: IN, doorIn: V(12, Y3, 9.5), doorOut: V(8.4, Y3, 9.5) },
  archivist: V(17, Y3, -6.5),
  archivistYaw: -Math.PI / 2,
  stair3: { foot: V(-6, Y3, 19.9), dir: V(1, 0, 0), n: 18, hw: 1.5 } as Stair,
  hole3: { x0: 6, x1: 12.2, z0: 18.2, z1: IN } as Rect,

  // ───────────── the Roof ─────────────
  arena: V(0, Y4, -2.5),
  /** The souls-fight ring (a curtain of wet red ink, docs/level3/SOULS.md): room for a 14 m Pen to swing. */
  arenaR: 17,
  /** The way in: a gap in the ink curtain facing the roof checkpoint (yaw = facing into the ring). */
  gate: V(0 + 17 * 0.664, Y4, -2.5 + 17 * 0.747),
  gateYaw: Math.atan2(-0.664, -0.747),
  roofArrive: V(14.2, Y4, 19.6),

  // ───────────── creatures ─────────────
  spawns: {
    mutant: V(-12, Y1, 15),
    pressBelt: [V(-6, Y1, -1.2), V(7, Y1, -1.2)],
    pressLift: V(7, Y1, -18),
    snakesPit: [V(10.4, Y2, 3.5), V(-10.4, Y2, -3)],
    pressWest: V(-15, Y2, 12),
    snakeWest: V(-15.5, Y2, -4),
    compassReading: [V(-4, Y3, 9), V(5, Y3, 12)],
    compassIndex: V(15, Y3, 8),
    snakeIndex: V(13, Y3, -14),
    pressIndex: V(16, Y3, 2),
    pen: V(0, Y4, -8),
  },
};
