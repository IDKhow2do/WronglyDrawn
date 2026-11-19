/**
 * [INPUT]: depends on PierKit (deck/stilts/fence/railing/lampPost/barricadeBoards/redCrossTexture/pierTextures);
 *          StaticBatch/bunting from ./HarborKit; wonkyBuilding from ../WonkyBuilding; Crown/PaintDrop/Checkpoint from
 *          ../Collectibles; LevelApi (addHost, addEdible) + HarborBuilt (arrays it appends to) from ./MuteHarbor
 * [OUTPUT]: exports PIER (layout constants), inPier(), inRect(), pierGround(), buildPier() and the BuiltPier surface
 *           (spawns, walkway pieces, gallery horns, Lost & Found bell, encounter locks, gate/wash/record-X hooks, update)
 * [POS]: the level-2 second district's GEOMETRY: Bandstand Pier, a pleasure pier on iron stilts over a sea of fog,
 *        behind the clock tower. HarborSession builds it right after buildMuteHarbor (its crowns, drops,
 *        checkpoint, regions, spring and shoutables join the level's lists). PierDirector owns its gameplay.
 *        Its two stairways carry an invisible nosing ramp (PhysicsWorld.addNosingRamp) over their box steps.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import type { OrganHost } from '../../hosts/OrganHost';
import { t } from '../../i18n';
import { addOutline, mergeStaticInk, paintedMesh, toon } from '../../render/Materials';
import { labelCanvas, PAL } from '../../render/PaintTextures';
import { Checkpoint, Crown, PaintDrop } from '../Collectibles';
import { wonkyBuilding } from '../WonkyBuilding';
import { StaticBatch, bunting, dropFlatInk } from './HarborKit';
import type { HarborBuilt, LevelApi } from './MuteHarbor';
import { barricadeBoards, cordon, deck, fence, lampPost, pierTextures, railing, redCrossTexture, sideBarrier, stilts, turnstile, type PierLock, type Rect } from './PierKit';

const Y = 5.85; // every deck's top (the old town's back lawn is 5.8)
const BY = 9.85; // the bandstand
/** Stairway riser ceiling (m): under WAI's snap-to-ground (0.25) and every controller's autostep (hosts 0.25, enemies 0.3). */
const STAIR_RISE = 0.2;
/** Nosing ramp lift (m) over a stairway's nosings and its top deck (a flush end stalls on the deck's lip). */
const RAMP_LIFT = 0.03;
/** Nosing ramp foot (m) in front of a stairway's first riser: a 0.23 m rise over it is a 33° leg, still walkable slowly. */
const RAMP_FOOT = 0.35;

/** The district's layout (world metres). North is −z. */
export const PIER = {
  y: Y,
  bandY: BY,
  gate: new THREE.Vector3(-47.6, Y, -49.7),
  causeway: { x0: -49.6, x1: -45.6, z0: -60, z1: -49.3 } as Rect,
  yard: { x0: -56, x1: -40, z0: -72, z1: -60 } as Rect,
  walkNear: { x0: -62, x1: -56, z0: -68, z1: -64 } as Rect,
  gap: { x0: -76, x1: -62, z0: -70, z1: -61 } as Rect,
  landing: { x0: -86, x1: -76, z0: -72, z1: -58 } as Rect,
  gallery: { x0: -86, x1: -76, z0: -58, z1: -49 } as Rect,
  link: { x0: -85, x1: -79, z0: -80, z1: -72 } as Rect,
  carousel: { x0: -90, x1: -70, z0: -98, z1: -80 } as Rect,
  arena: new THREE.Vector3(-54, BY, -88),
  arenaR: 9.5,
  /** The ramp from the carousel deck up to the bandstand (west side) and the stair down to the yard (south). */
  rampFoot: new THREE.Vector3(-76, Y, -88),
  rampTop: new THREE.Vector3(-63.3, BY, -88),
  stairTop: new THREE.Vector3(-54, BY, -78.3),
  stairFoot: new THREE.Vector3(-54, Y, -69.8),
  carousel3: new THREE.Vector3(-82, Y, -89.5),
  /** The zigzag walkway over the gap (hidden in the jellies' fog). */
  walk: [[-62, -66], [-64.6, -63.4], [-68.2, -67.8], [-71.6, -63.6], [-74.4, -67.2], [-76, -66]] as [number, number][],
  /** A side branch off the second bend to the fog crown. */
  walkSide: [[-71.6, -63.6], [-72.6, -60.4]] as [number, number][],
};

/** Is (x, z) inside a deck rect (grown by m)? */
export const inRect = (r: Rect, x: number, z: number, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

/** Is a point on (or over) the pier district? */
export function inPier(p: THREE.Vector3): boolean {
  // (the causeway starts on the island's last metre of lawn: count it from the gate on)
  return p.x < -38 && p.x > -96 && p.z > -106 && (p.z < -52.6 || (p.z < -50.3 && p.x < -45.4));
}

/** Deck height under a point (the gap counts as deck height: jellies hover over it). */
export function pierGround(x: number, z: number): number {
  const a = PIER.arena;
  if (Math.hypot(x - a.x, z - a.z) < PIER.arenaR + 0.5 || (z < -97 && Math.abs(x - a.x) < 4.5)) return BY;
  return Y;
}

export interface PierSpawns {
  yardCrabs: THREE.Vector3[];
  jellies: { at: THREE.Vector3; path: THREE.Vector3[] }[];
  carouselJelly: { at: THREE.Vector3; path: THREE.Vector3[] };
  barker: THREE.Vector3;
  carouselCrab: THREE.Vector3;
  gramophone: THREE.Vector3;
  /** Where the phase-2 crab scuttles in from (the pavilion). */
  gramoHelper: THREE.Vector3;
}

export interface GalleryHorn {
  pos: THREE.Vector3;
  root: THREE.Group;
  up: number;
  bell: THREE.Mesh;
}

export interface BuiltPier {
  spawns: PierSpawns;
  /** The walkway's visible pieces (FogVeil hides them inside a jelly's fog). */
  walkway: THREE.Object3D[];
  /** Paint drops that the fog hides too. */
  foggedDrops: PaintDrop[];
  /** The crown on the fog branch (hidden with the walkway). */
  fogCrown: Crown;
  crownGramophone: Crown;
  crownGallery: Crown;
  horns: GalleryHorn[];
  /** The Lost & Found bell on the ticket booth (shout at it: a lost Eye for an Eyeless WAI). */
  lostFound: THREE.Vector3;
  /** Encounter locks: the yard's turnstile to the Fog Walk, the velvet cordon round the carousel's spring. */
  yardLock: PierLock;
  springLock: PierLock;
  /** The Fog Lamp host (lend it the Eye: it sees through the fog for you). */
  fogLamp: OrganHost;
  checkpointAt: THREE.Vector3;
  spring: { pos: THREE.Vector3; target: THREE.Vector3; need: number };
  /** The X the Red Pen strikes over the raised Bell Bridge (shown by the sky moment, washed by the mid-boss). */
  bridgeX: THREE.Group;
  readonly gateOpen: boolean;
  readonly washed: boolean;
  /** Phase 2 of the mid-boss: the Red Pen's X appears scratched into the record. */
  showRecordX(): void;
  /** The mid-boss fight restarts (a smudge on Hard): the record is clean again. */
  hideRecordX(): void;
  openGate(): void;
  /** The Gramophone is repainted: red marks fade, barricades fold, faces get their mouths back. */
  washMarks(): void;
  update(dt: number): void;
}

export function buildPier(ctx: GameContext, api: LevelApi, level: HarborBuilt): BuiltPier {
  const { root, physics, assets } = ctx;
  pierTextures(ctx);
  const T = (n: string) => assets.tex(n);
  const group = new THREE.Group();
  group.name = 'bandstand-pier';
  root.add(group);
  const boards = toon({ map: T('pier_boards') });
  const fasciaMint = toon({ map: T('pier_stripe_mint') });
  const iron = toon({ map: T('metal_dark'), color: '#fff3e0' });
  const stiltIron = toon({ map: T('metal_dark'), color: '#7fa8b8' });
  const glass = new THREE.MeshBasicMaterial({ color: '#ffe8a8' });
  const marks: { m: THREE.Object3D; mats: THREE.Material[] }[] = [];
  const barricades: { g: THREE.Group; cols: RAPIER.Collider[] }[] = [];
  const muted: { mat: THREE.MeshStandardMaterial; to: THREE.Texture }[] = [];
  const mark = (o: THREE.Object3D) => {
    const mats: THREE.Material[] = [];
    o.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material | undefined;
      if (m) {
        m.transparent = true;
        mats.push(m);
      }
    });
    marks.push({ m: o, mats });
    return o;
  };
  /** A red X decal standing on a surface (faces `normal`). */
  const cross = (pos: THREE.Vector3, normal: THREE.Vector3, size: number, spin = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: redCrossTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.rotateZ(spin);
    m.userData.noPaint = true;
    group.add(m);
    return mark(m);
  };
  const hut = (x: number, z: number, w: number, d: number, h: number, yaw: number, facade: string, side: string, roof: string, seed: number) => {
    const b = wonkyBuilding(ctx, { x, z, w, d, h, yaw, ground: Y + 0.55, facade: `${facade}_mute`, side, roofColor: roof, seed });
    const front = (b.front.material as THREE.MeshStandardMaterial[])[4];
    const to = T(facade).clone();
    to.needsUpdate = true;
    to.wrapS = to.wrapT = THREE.RepeatWrapping;
    to.repeat.copy(front.map!.repeat);
    muted.push({ mat: front, to });
    return b;
  };

  // ───────────── decks, stilts, railings (one batch per zone: whole zones cull together) ─────────────
  const zones = { yard: new StaticBatch(), walk: new StaticBatch(), west: new StaticBatch(), carousel: new StaticBatch(), band: new StaticBatch() };
  const P = PIER;
  const dm = { boards, fascia: fasciaMint };
  deck(ctx, zones.yard, P.causeway, Y, dm, 1);
  deck(ctx, zones.yard, P.yard, Y, dm, 2);
  deck(ctx, zones.walk, P.walkNear, Y, dm, 3);
  deck(ctx, zones.west, P.landing, Y, dm, 4);
  deck(ctx, zones.west, P.gallery, Y, dm, 5);
  deck(ctx, zones.west, P.link, Y, dm, 6);
  deck(ctx, zones.carousel, P.carousel, Y, dm, 7);
  stilts(zones.yard, P.causeway, Y, stiltIron);
  stilts(zones.yard, P.yard, Y, stiltIron);
  stilts(zones.walk, P.walkNear, Y, stiltIron);
  stilts(zones.west, P.landing, Y, stiltIron);
  stilts(zones.west, P.gallery, Y, stiltIron);
  stilts(zones.west, P.link, Y, stiltIron);
  stilts(zones.carousel, P.carousel, Y, stiltIron);
  fence(ctx, zones.yard, P.causeway, Y, iron, [{ side: 's', from: -50, to: -30 }, { side: 'n', from: -50, to: -30 }]);
  fence(ctx, zones.yard, P.yard, Y, iron, [{ side: 's', from: -49.6, to: -45.6 }, { side: 'w', from: -68, to: -64 }, { side: 'n', from: -56, to: -52 }]);
  fence(ctx, zones.walk, P.walkNear, Y, iron, [{ side: 'w', from: -70, to: -60 }, { side: 'e', from: -70, to: -60 }]);
  fence(ctx, zones.west, P.landing, Y, iron, [{ side: 'e', from: -68, to: -64 }, { side: 's', from: -90, to: -70 }, { side: 'n', from: -85, to: -79 }]);
  fence(ctx, zones.west, P.gallery, Y, iron, [{ side: 'n', from: -90, to: -70 }]);
  fence(ctx, zones.west, P.link, Y, iron, [{ side: 'n', from: -90, to: -70 }, { side: 's', from: -90, to: -70 }]);
  fence(ctx, zones.carousel, P.carousel, Y, iron, [{ side: 's', from: -85, to: -79 }, { side: 'e', from: -90.2, to: -85.8 }]);

  // ───────────── the gate on the island's rim (opened by the clock's BONG) ─────────────
  const gateCol = physics.addStaticBox(new THREE.Vector3(P.gate.x, Y + 1.5, P.gate.z), new THREE.Vector3(2.0, 1.5, 0.15), 0, 'gate');
  const leaves: THREE.Group[] = [];
  let gateOpenT = -1;
  {
    const brick = toon({ map: T('h2_p_cream'), color: '#e8f4ee' });
    for (const s of [-1, 1]) {
      const px = P.gate.x + s * 2.2;
      zones.yard.add(new THREE.BoxGeometry(0.7, 3.6, 0.7).translate(px, Y + 1.5, P.gate.z), brick, 0.04);
      zones.yard.add(new THREE.BoxGeometry(0.9, 0.2, 0.9).translate(px, Y + 3.4, P.gate.z), iron, 0.03);
      zones.yard.add(new THREE.SphereGeometry(0.28, 12, 10).translate(px, Y + 3.75, P.gate.z), glass, 0.03);
      physics.addStaticBox(new THREE.Vector3(px, Y + 1.5, P.gate.z), new THREE.Vector3(0.35, 1.8, 0.35));
      // a swinging iron leaf hinged at the post
      const leaf = new THREE.Group();
      leaf.position.set(px - s * 0.35, Y, P.gate.z);
      const bars: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 5; i++) bars.push(new THREE.BoxGeometry(0.07, 2.6, 0.07).translate(-s * (0.2 + i * 0.36), 1.4, 0));
      for (const h of [0.35, 1.4, 2.5]) bars.push(new THREE.BoxGeometry(1.7, 0.08, 0.08).translate(-s * 0.88, h, 0));
      leaf.add(paintedMesh(mergeGeometries(bars)!, iron, 0, false));
      leaves.push(leaf);
      group.add(leaf);
    }
    // the arch with the pier's sign
    const arch = new THREE.TorusGeometry(2.2, 0.12, 6, 24, Math.PI).translate(P.gate.x, Y + 3.3, P.gate.z);
    zones.yard.add(arch, iron, 0.03);
    const signTex = new THREE.CanvasTexture(labelCanvas(t('BANDSTAND PIER'), '#fff1dc', '#2f6f78', 512, 128));
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 0.16), [iron, iron, iron, iron, toon({ map: signTex }), toon({ map: signTex })]);
    sign.position.set(P.gate.x, Y + 4.9, P.gate.z);
    sign.rotation.z = 0.04;
    addOutline(sign, 0.03);
    group.add(sign);
    cross(new THREE.Vector3(P.gate.x + 0.3, Y + 4.9, P.gate.z + 0.12), new THREE.Vector3(0, 0, 1), 1.8, 0.1);
  }

  // ───────────── Ticket Yard: kiosk, crates, lamps, bunting ─────────────
  hut(-44.5, -70, 3.4, 2.8, 3.4, 0, 'h2_crowns', 'stone_blue', '#5fd3b4', 301);
  // the ticket booth's Lost & Found: a brass bell on a bracket and a sign (shout at the bell)
  const lostFound = new THREE.Vector3(-43.3, Y + 2.55, -68.05);
  {
    const brassB = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
    const bell = [[0.001, 0], [0.24, 0.02], [0.2, 0.12], [0.15, 0.3], [0.1, 0.42], [0.001, 0.45]].map(([x, y]) => new THREE.Vector2(x, y));
    zones.yard.add(new THREE.LatheGeometry(bell, 14).translate(lostFound.x, lostFound.y - 0.3, lostFound.z), brassB, 0.025);
    zones.yard.add(new THREE.BoxGeometry(0.07, 0.07, 0.6).translate(lostFound.x, lostFound.y + 0.18, lostFound.z - 0.25), iron, 0.015);
    zones.yard.add(new THREE.SphereGeometry(0.06, 8, 6).translate(lostFound.x, lostFound.y - 0.34, lostFound.z), iron, 0.01);
    const lfTex = new THREE.CanvasTexture(labelCanvas(t('LOST & FOUND'), '#fff1dc', '#2f6f78', 512, 128));
    lfTex.colorSpace = THREE.SRGBColorSpace;
    const lf = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.4, 0.06), [iron, iron, iron, iron, toon({ map: lfTex }), toon({ map: lfTex })]);
    lf.position.set(-45.2, Y + 3.25, -68.5);
    addOutline(lf, 0.02);
    group.add(lf);
  }
  hut(-49.5, -70, 3.2, 2.8, 3.2, 0, 'h2_sleepy', 'stone_pink', '#ff7a8a', 302);
  for (const [x, z] of [[-55.4, -60.6], [-44, -60.6], [-40.4, -64.5]] as [number, number][]) lampPost(zones.yard, x, Y, z, iron, glass);
  bunting(group, new THREE.Vector3(-55.4, Y + 3.0, -60.6), new THREE.Vector3(-44, Y + 3.0, -60.6), 0.9);
  {
    const crate = toon({ map: T('wood'), color: '#ffe6cc' });
    for (const [x, z, s, h] of [[-41.3, -71.1, 0.9, 0], [-41.2, -70.0, 0.7, 0], [-41.3, -71.1, 0.6, 0.9]] as [number, number, number, number][]) {
      zones.yard.add(new THREE.BoxGeometry(s, s, s).translate(x, Y + h + s / 2, z), crate, 0.03);
      physics.addStaticBox(new THREE.Vector3(x, Y + h + s / 2, z), new THREE.Vector3(s / 2, s / 2, s / 2));
    }
  }
  const cpPos = new THREE.Vector3(-48.4, Y, -62.6);
  level.checkpoints.push(new Checkpoint(ctx, 'cp-pier', cpPos, Math.PI));

  // ───────────── the Fog Walk: a broken pier, a zigzag walkway nobody can see in the fog ─────────────
  const walkway: THREE.Object3D[] = [];
  const walkMat = toon({ map: T('pier_boards'), color: '#fff6ea' });
  /** A plank from a to b (`ext` metres longer at each end, tucked under the decks it meets: no wedge-shaped gaps). */
  const plank = (a: [number, number], b: [number, number], w: number, extA = 0, extB = 0) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    a = [a[0] - ux * extA, a[1] - uz * extA];
    b = [b[0] + ux * extB, b[1] + uz * extB];
    const len = L + extA + extB;
    const yaw = Math.atan2(b[1] - a[1], b[0] - a[0]);
    // 2 cm under the decks' tops (never coplanar with them where it tucks in)
    const m = paintedMesh(new THREE.BoxGeometry(len, 0.22, w), walkMat, 0.03);
    m.position.set((a[0] + b[0]) / 2, Y - 0.13, (a[1] + b[1]) / 2);
    m.rotation.y = -yaw;
    group.add(m);
    walkway.push(m);
    physics.addStaticBox(m.position.clone(), new THREE.Vector3(len / 2, 0.11, w / 2), -yaw);
  };
  const pad = (p: [number, number]) => {
    const m = paintedMesh(new THREE.CylinderGeometry(1.0, 1.0, 0.26, 14), walkMat, 0.03);
    m.position.set(p[0], Y - 0.14, p[1]);
    group.add(m);
    walkway.push(m);
    physics.addStaticCylinder(m.position.clone(), 0.13, 1.0);
    // a pile under every bend (the old pier's stumps)
    const pile = paintedMesh(new THREE.CylinderGeometry(0.3, 0.36, 9, 8), stiltIron, 0.03);
    pile.position.set(p[0], Y - 4.75, p[1]);
    group.add(pile);
  };
  P.walk.forEach((p, i) => {
    if (i > 0 && i < P.walk.length - 1) pad(p);
    if (i < P.walk.length - 1) plank(p, P.walk[i + 1], 1.6, i === 0 ? 1.2 : 0, i === P.walk.length - 2 ? 1.2 : 0);
  });
  plank(P.walkSide[0], P.walkSide[1], 1.2);
  pad(P.walkSide[1]);
  // the broken ends of the old pier: splintered boards, and the snapped stilts below
  for (const x of [P.gap.x1 + 0.3, P.gap.x0 - 0.3])
    for (let i = 0; i < 4; i++) zones.walk.add(new THREE.BoxGeometry(0.9 + (i % 2) * 0.6, 0.12, 0.7).rotateZ((i % 2 ? 0.2 : -0.15) * Math.sign(x + 69)).translate(x + (x > -69 ? -0.4 : 0.4), Y - 0.25 - i * 0.05, -69 + i * 1.6), boards, 0.02);
  const fogCrown = new Crown(ctx, 'crown-fog', new THREE.Vector3(P.walkSide[1][0], Y + 1.2, P.walkSide[1][1]), 'On a stump in the fog, off the hidden walkway');
  level.crowns.push(fogCrown);
  // the Fog Lamp: lend it your Eye and it keeps looking through the fog across the gap
  const fogLamp = api.addHost({
    id: 'fog-lamp',
    name: 'Fog Lamp',
    size: 'medium',
    anchored: true,
    canTurn: true,
    pos: new THREE.Vector3(-57.2, Y, -67.3),
    half: new THREE.Vector3(0.32, 2.1, 0.32),
    yaw: -Math.PI / 2 - 0.08,
    sockets: { EYE: new THREE.Vector3(0, 1.7, 0.45), MOUTH: new THREE.Vector3(0, 0.6, 0.34), LEG: new THREE.Vector3(0, -2.1, 0) },
    gaze: { range: 18, halfAngleDeg: 34, pitch: 0.22 },
    build: () => {
      const g = new THREE.Group();
      const prof = [[0.001, -2.1], [0.36, -2.1], [0.36, -1.9], [0.2, -1.75], [0.12, -1.3], [0.09, 1.6], [0.14, 1.7], [0.001, 1.72]].map(([x, y]) => new THREE.Vector2(x, y));
      g.add(paintedMesh(new THREE.LatheGeometry(prof, 12), iron, 0.03));
      const head = paintedMesh(new THREE.CylinderGeometry(0.34, 0.24, 0.6, 8), toon({ color: '#5fd3b4' }), 0.03);
      head.position.y = 1.95;
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), glass);
      lens.position.set(0, 1.95, 0.22);
      lens.scale.set(1, 1, 0.6);
      const cap = paintedMesh(new THREE.ConeGeometry(0.42, 0.42, 8), iron, 0.03);
      cap.position.y = 2.46;
      g.add(head, lens, cap);
      return g;
    },
  });

  // ───────────── West Landing: bathing huts, crates (a crown on top) ─────────────
  hut(-83.6, -61.4, 3.2, 3, 3.2, Math.PI / 2, 'h2_teeth', 'stone_purple', '#ff7a8a', 311);
  hut(-83.6, -66.4, 3.2, 3, 3.6, Math.PI / 2, 'h2_nose', 'stone_orange', '#5fd3b4', 312);
  for (const [x, z] of [[-76.6, -61.6], [-76.6, -70.4], [-85.4, -71.4]] as [number, number][]) lampPost(zones.west, x, Y, z, iron, glass);
  {
    const crate = toon({ map: T('wood'), color: '#d8f0ff' });
    const stack: [number, number, number, number][] = [[-77.9, -71.0, 1.1, 0], [-77.9, -69.8, 1.0, 0], [-77.9, -71.0, 0.9, 1.1], [-79.0, -70.9, 0.8, 0]];
    for (const [x, z, s, h] of stack) {
      zones.west.add(new THREE.BoxGeometry(s, s, s).translate(x, Y + h + s / 2, z), crate, 0.03);
      physics.addStaticBox(new THREE.Vector3(x, Y + h + s / 2, z), new THREE.Vector3(s / 2, s / 2, s / 2));
    }
    level.crowns.push(new Crown(ctx, 'crown-crates', new THREE.Vector3(-77.9, Y + 2.8, -71.0), 'On top of the crates on the West Landing'));
  }

  // ───────────── the Echo Gallery (optional challenge): six brass horns pop up — shout them ─────────────
  const horns: GalleryHorn[] = [];
  {
    const brass = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
    const prof = [[0.08, -0.3], [0.1, -0.05], [0.18, 0.15], [0.32, 0.3], [0.42, 0.36]].map(([x, y]) => new THREE.Vector2(x, y));
    const spots: [number, number, number][] = [[-85.3, -51, Math.PI / 2], [-85.3, -55, Math.PI / 2], [-80.8, -49.7, 0], [-76.7, -51, -Math.PI / 2], [-76.7, -55, -Math.PI / 2], [-81, -57.2, Math.PI]];
    for (const [x, z, yaw] of spots) {
      const g = new THREE.Group();
      const post = paintedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1.4, 8).translate(0, 0.7, 0), iron, 0.02);
      const hornG = new THREE.LatheGeometry(prof, 16).rotateX(Math.PI / 2 - 0.25);
      const bell = paintedMesh(hornG, brass, 0);
      (bell.material as THREE.Material).side = THREE.DoubleSide;
      bell.position.y = 1.6;
      g.add(post, bell);
      g.position.set(x, Y - 1.5, z);
      g.rotation.y = yaw + Math.PI;
      group.add(g);
      horns.push({ pos: new THREE.Vector3(x, Y + 1.0, z), root: g, up: 0, bell });
    }
    const sTex = new THREE.CanvasTexture(labelCanvas(t('ECHO GALLERY'), '#fff1dc', '#b8325a', 512, 128));
    sTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.7, 0.12), [iron, iron, iron, iron, toon({ map: sTex }), toon({ map: sTex })]);
    sign.position.set(-81, Y + 2.6, -49.7);
    addOutline(sign, 0.03);
    group.add(sign);
    for (const s of [-1, 1]) zones.west.add(new THREE.BoxGeometry(0.12, 2.6, 0.12).translate(-81 + s * 1.6, Y + 1.3, -49.7), iron, 0.02);
  }
  const crownGallery = new Crown(ctx, 'crown-gallery', new THREE.Vector3(-81, Y + 1.3, -53.4), 'Win the Echo Gallery: shout 8 of the 10 pop-up horns');
  crownGallery.hidden = true;
  level.crowns.push(crownGallery);

  // ───────────── the Carousel Deck: the carousel (cover), the red barricade, the spring ─────────────
  {
    const c = P.carousel3;
    const stripe = toon({ map: T('pier_stripe_red') });
    const base = paintedMesh(new THREE.CylinderGeometry(3.6, 3.7, 0.5, 24), toon({ map: T('stone_cream'), color: '#ffe0e8' }), 0.04);
    base.position.set(c.x, Y + 0.25, c.z);
    group.add(base);
    // the canopy: a scalloped striped cone with a gilded finial
    const cone = new THREE.ConeGeometry(4.3, 1.8, 24, 1, true);
    const canopy = paintedMesh(cone, stripe, 0); // open cone, seen from below: no hull
    (canopy.material as THREE.Material).side = THREE.DoubleSide;
    canopy.position.set(c.x, Y + 4.7, c.z);
    group.add(canopy);
    const valance = paintedMesh(new THREE.CylinderGeometry(4.3, 4.3, 0.5, 24, 1, true), toon({ map: T('pier_stripe_mint') }), 0);
    (valance.material as THREE.Material).side = THREE.DoubleSide;
    valance.position.set(c.x, Y + 3.6, c.z);
    group.add(valance);
    zones.carousel.add(new THREE.SphereGeometry(0.35, 12, 10).translate(c.x, Y + 5.8, c.z), toon({ color: '#ffd23a' }), 0.03);
    zones.carousel.add(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 12).translate(c.x, Y + 2.2, c.z), toon({ map: T('h2_p_brass') }), 0.03);
    // poles with their little horses (a box body, a head, a lathe pole each)
    const horseMats = ['#ffffff', '#ffd6e6', '#cfeee2', '#ffe8b0'].map((col) => toon({ color: col }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = c.x + Math.cos(a) * 2.8, z = c.z + Math.sin(a) * 2.8;
      zones.carousel.add(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6).translate(x, Y + 2.15, z), toon({ map: T('h2_p_brass') }), 0.015);
      const yaw = -a;
      const hm = horseMats[i % 4];
      const hy = Y + 1.3 + (i % 2) * 0.4;
      zones.carousel.add(new THREE.BoxGeometry(0.3, 0.42, 1.0).rotateY(yaw).translate(x, hy, z), hm, 0.025);
      const hx = Math.cos(a + Math.PI / 2) * 0.55, hz = Math.sin(a + Math.PI / 2) * 0.55;
      zones.carousel.add(new THREE.BoxGeometry(0.24, 0.55, 0.3).rotateY(yaw).translate(x + hx, hy + 0.35, z + hz), hm, 0.025);
    }
    physics.addStaticCylinder(new THREE.Vector3(c.x, Y + 2, c.z), 2, 3.65);
    level.crowns.push(new Crown(ctx, 'crown-carousel', new THREE.Vector3(c.x, Y + 1.6, c.z + 3.0), 'Ride the carousel… (well, walk round it)'));
  }
  for (const [x, z] of [[-89.4, -80.6], [-89.4, -97.4], [-70.6, -97.4], [-70.6, -80.6]] as [number, number][]) lampPost(zones.carousel, x, Y, z, iron, glass);
  bunting(group, new THREE.Vector3(-89.4, Y + 3.0, -80.6), new THREE.Vector3(-80, Y + 5.6, -89));
  bunting(group, new THREE.Vector3(-70.6, Y + 3.0, -97.4), new THREE.Vector3(-80, Y + 5.6, -89));
  bunting(group, new THREE.Vector3(-89.4, Y + 3.0, -97.4), new THREE.Vector3(-80, Y + 5.6, -89));

  // ───────────── the ramp up to the bandstand (west) and the stair down to the yard (south) ─────────────
  const stairway = (B: StaticBatch, a: THREE.Vector3, b: THREE.Vector3, w: number) => {
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.z - a.z, b.x - a.x);
    // risers under every controller's snap-to-ground (WAI 0.25 m): walking down stays grounded, autostep climbs them
    const n = Math.ceil(Math.abs(b.y - a.y) / STAIR_RISE);
    const lo = a.y < b.y ? a : b, hi = a.y < b.y ? b : a;
    // each step is one box, drawn and solid alike (solid down to the low deck): feet rest on the drawn tread
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const x = lo.x + (hi.x - lo.x) * k, z = lo.z + (hi.z - lo.z) * k;
      const top = lo.y + ((i + 1) / n) * (hi.y - lo.y) - 0.01;
      const h = top - (Y - 0.3);
      const c = new THREE.Vector3(x, Y - 0.3 + h / 2, z);
      const sx = len / n + 0.02;
      B.add(new THREE.BoxGeometry(sx, h, w).rotateY(-yaw).translate(c.x, c.y, c.z), boards, i === n - 1 ? 0.03 : 0);
      physics.addStaticBox(c, new THREE.Vector3(sx / 2, h / 2, w / 2), -yaw);
    }
    // the invisible nosing ramp, RAMP_LIFT over the nosings (y = lo.y + dy·(k + 1/n)) and over the top deck:
    // a slow stick tilt stalls on even these 0.2 m risers. Its flat leg runs 0.3 m onto the deck: the round
    // bandstand leaves a gap behind the top step. Its foot starts only RAMP_FOOT before the first riser: a longer
    // foot reached past the carousel barricade, and WAI wedged between the barricade's end and the foot's side.
    const dy = hi.y - lo.y;
    const at = (k: number, y = lo.y + dy * (k + 1 / n) + RAMP_LIFT) => lo.clone().lerp(hi, k).setY(y);
    physics.addNosingRamp([at(-RAMP_FOOT / len, lo.y), at(0), at((n - 1) / n), at(1 + 0.3 / len, hi.y + RAMP_LIFT)], w / 2);
    const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(w / 2 + 0.05);
    for (const s of [1, -1]) {
      const a2 = a.clone().addScaledVector(side, s), b2 = b.clone().addScaledVector(side, s);
      sideBarrier(ctx, a2, b2, Y - 0.3, hi.y + 1.2);
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        const p0 = a2.clone().lerp(b2, i / steps), p1 = a2.clone().lerp(b2, (i + 1) / steps);
        railingVisual(B, p0, p1, iron);
      }
    }
  };
  /** Rails that follow a slope (visual only: the side barrier is the collider). */
  const railingVisual = (B: StaticBatch, p0: THREE.Vector3, p1: THREE.Vector3, mat: THREE.Material) => {
    B.add(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(p0.x, p0.y + 0.55, p0.z), mat, 0.02);
    const len = p0.distanceTo(p1);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, len));
    m.position.copy(p0).lerp(p1, 0.5).setY((p0.y + p1.y) / 2 + 1.05);
    m.lookAt(p1.clone().setY(p1.y + 1.05));
    m.updateMatrix();
    B.add(m.geometry.applyMatrix4(m.matrix), mat, 0.015);
  };
  stairway(zones.carousel, P.rampFoot, P.rampTop, 4);
  stairway(zones.band, P.stairTop, P.stairFoot, 4);
  // the barricades the Gramophone's ink drew (they fold away when it is repainted)
  barricades.push(barricadeBoards(ctx, new THREE.Vector3(-76.5, Y, -90.2), new THREE.Vector3(-76.5, Y, -85.8), 2.8, boards));
  barricades.push(barricadeBoards(ctx, new THREE.Vector3(-56.3, BY, -78.6), new THREE.Vector3(-51.7, BY, -78.6), 2.8, boards));
  for (const b of barricades) group.add(b.g);
  // a second spray can by the spring: a smudge in the Gramophone fight doesn't send WAI back over the fog
  level.checkpoints.push(new Checkpoint(ctx, 'cp-carousel', new THREE.Vector3(-82, Y, -81.6), Math.PI));
  const springPos = new THREE.Vector3(-77.5, Y, -83.5);
  const spring = { pos: springPos, target: new THREE.Vector3(-60.5, BY + 2.5, -88), need: 18 };
  level.springSpots.push(spring);
  const brassLock = toon({ map: T('h2_p_brass'), color: '#fff0c0' });
  const yardLock = turnstile(ctx, new THREE.Vector3(P.yard.x0 - 0.2, Y, -66), 4, iron, brassLock);
  const springLock = cordon(ctx, springPos, 1.7, brassLock);

  // ───────────── the Bandstand: a round deck, its floor a giant record; the pavilion behind ─────────────
  let record: THREE.Mesh;
  let recordX: THREE.Mesh;
  {
    const a = P.arena;
    const R = P.arenaR;
    const top = paintedMesh(new THREE.CylinderGeometry(R, R, 0.4, 48), boards, 0.04);
    top.position.set(a.x, BY - 0.2, a.z);
    group.add(top);
    physics.addStaticCylinder(new THREE.Vector3(a.x, BY - 0.2, a.z), 0.2, R);
    zones.band.add(new THREE.CylinderGeometry(R + 0.08, R + 0.08, 0.36, 48, 1, true).translate(a.x, BY - 0.55, a.z), fasciaMint, 0);
    // posts round the rim + the parapet, with gaps west (ramp) and south (stair)
    const gaps = [Math.PI, Math.PI / 2];
    const N = 36;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
      const mid = (a0 + a1) / 2;
      if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(mid - g), Math.cos(mid - g))) < 0.27)) continue;
      const after = gaps.some((g) => Math.abs(Math.atan2(Math.sin(a0 - 0.08 - g), Math.cos(a0 - 0.08 - g))) < 0.27);
      railing(ctx, zones.band, a.x + Math.cos(a0) * (R - 0.1), a.z + Math.sin(a0) * (R - 0.1), a.x + Math.cos(a1) * (R - 0.1), a.z + Math.sin(a1) * (R - 0.1), BY, iron, after || i === 0);
    }
    // a tall invisible ring over the parapet: a jump over the tonearm never carries WAI off the bandstand
    for (let i = 0; i < 24; i++) {
      const mid = ((i + 0.5) / 24) * Math.PI * 2;
      if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(mid - g), Math.cos(mid - g))) < 0.32)) continue;
      const half = Math.tan(Math.PI / 24) * (R - 0.1);
      physics.addStaticBox(new THREE.Vector3(a.x + Math.cos(mid) * (R - 0.1), BY + 1.6, a.z + Math.sin(mid) * (R - 0.1)), new THREE.Vector3(half, 1.6, 0.08), -mid + Math.PI / 2, 'barrier');
    }
    for (let i = 0; i < 12; i++) {
      const an = (i / 12) * Math.PI * 2;
      zones.band.add(new THREE.CylinderGeometry(0.22, 0.26, BY - 0.4 + 5, 8).translate(a.x + Math.cos(an) * (R - 0.6), (BY - 0.4 - 5) / 2, a.z + Math.sin(an) * (R - 0.6)), stiltIron, 0.03);
    }
    zones.band.add(new THREE.CylinderGeometry(1.4, 1.8, BY + 5, 12).translate(a.x, (BY - 0.4 - 5) / 2, a.z), stiltIron, 0.04);
    // the record: black vinyl grooves with a red label (spins slowly)
    const c = document.createElement('canvas');
    c.width = c.height = 1024;
    const g = c.getContext('2d')!;
    g.translate(512, 512);
    g.fillStyle = '#1c1626';
    g.beginPath();
    g.arc(0, 0, 510, 0, Math.PI * 2);
    g.fill();
    for (let r = 160; r < 505; r += 7) {
      g.strokeStyle = r % 21 === 0 ? 'rgba(180,160,255,0.22)' : 'rgba(255,255,255,0.07)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, 505, -0.5, -0.2);
    g.fill();
    g.fillStyle = '#e8323c';
    g.beginPath();
    g.arc(0, 0, 150, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff1dc';
    g.font = 'bold 44px "Marker Felt", "Comic Sans MS", sans-serif';
    g.textAlign = 'center';
    g.fillText('shhh…', 0, -40);
    g.font = 'bold 30px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText(t('THE HUSH’S LULLABY'), 0, 60);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    record = new THREE.Mesh(new THREE.CircleGeometry(R - 0.45, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.35, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    record.position.set(a.x, BY + 0.02, a.z);
    record.receiveShadow = true;
    group.add(record);
    // the X the Red Pen scratches into the record in phase 2 (hidden until then)
    recordX = new THREE.Mesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: redCrossTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    recordX.position.set(a.x, BY + 0.04, a.z);
    recordX.visible = false;
    recordX.userData.noPaint = true;
    group.add(recordX);
    mark(recordX);
    // the pavilion: a round stage behind the arena, eight columns, a scalloped dome roof
    const pc = new THREE.Vector3(a.x, BY, a.z - R - 2.6);
    zones.band.add(new THREE.CylinderGeometry(3.6, 3.6, 0.5, 24).translate(pc.x, BY - 0.07, pc.z), toon({ map: T('stone_cream'), color: '#e8f4ee' }), 0.04);
    physics.addStaticCylinder(new THREE.Vector3(pc.x, BY - 0.07, pc.z), 0.25, 3.6);
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const x = pc.x + Math.cos(an) * 3.1, z = pc.z + Math.sin(an) * 3.1;
      zones.band.add(new THREE.CylinderGeometry(0.14, 0.18, 3.7, 10).translate(x, BY + 0.18 + 1.85, z), iron, 0.025);
      physics.addStaticCylinder(new THREE.Vector3(x, BY + 2.1, z), 1.8, 0.18);
    }
    const domeProf = [[3.9, 0], [3.7, 0.25], [3.3, 0.7], [2.6, 1.3], [1.6, 1.85], [0.6, 2.15], [0.001, 2.2]].map(([x, y]) => new THREE.Vector2(x, y));
    const dome = paintedMesh(new THREE.LatheGeometry(domeProf, 24), toon({ map: T('pier_stripe_mint') }), 0); // open underneath: no hull
    (dome.material as THREE.Material).side = THREE.DoubleSide;
    dome.position.set(pc.x, BY + 3.9, pc.z);
    group.add(dome);
    zones.band.add(new THREE.CylinderGeometry(4.0, 4.0, 0.3, 24, 1, true).translate(pc.x, BY + 3.85, pc.z), toon({ map: T('pier_stripe_red') }), 0);
    zones.band.add(new THREE.SphereGeometry(0.3, 12, 10).translate(pc.x, BY + 6.3, pc.z), toon({ color: '#ffd23a' }), 0.03);
    bunting(group, new THREE.Vector3(a.x - R + 0.5, BY + 3, a.z), new THREE.Vector3(pc.x - 3.6, BY + 3.8, pc.z), 1.0);
    bunting(group, new THREE.Vector3(a.x + R - 0.5, BY + 3, a.z), new THREE.Vector3(pc.x + 3.6, BY + 3.8, pc.z), 1.0);
    for (const s of [-1, 1]) lampPost(zones.band, a.x + s * (R - 0.7), BY, a.z, iron, glass);
  }
  const crownGramophone = new Crown(ctx, 'crown-gramophone', new THREE.Vector3(P.arena.x, BY + 1.3, P.arena.z - 4), 'Repaint the Red Gramophone');
  crownGramophone.hidden = true;
  level.crowns.push(crownGramophone);

  // ───────────── the sea of fog under the pier ─────────────
  {
    const fogMat = new THREE.MeshBasicMaterial({ map: T('pier_fog'), transparent: true, depthWrite: false, opacity: 0.92, color: '#efe6ff' });
    for (const [x, z, r, y] of [[-66, -78, 34, 0.6], [-56, -92, 22, -0.4], [-80, -62, 22, 0.2]] as [number, number, number, number][]) {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40).rotateX(-Math.PI / 2), fogMat);
      m.position.set(x, y, z);
      m.userData.noPaint = true;
      m.renderOrder = -1;
      group.add(m);
    }
  }

  // ───────────── the Red Pen's X over the raised Bell Bridge (drawn by the sky moment) ─────────────
  const bridgeX = new THREE.Group();
  {
    const bw = level.spots.bridgeWest;
    bridgeX.position.set(bw.x + 1.1, bw.y + 5.2, bw.z);
    bridgeX.visible = false;
    group.add(bridgeX);
  }

  // ───────────── paint drops: one trail per leg (the ones over the walkway hide in the fog) ─────────────
  const drops: PaintDrop[] = [];
  const dropLine = (pts: [number, number, number?][], color: string, fogged = false) =>
    pts.forEach(([x, z, y], i) => {
      const d = new PaintDrop(ctx, `drop-pier${drops.length}-${i}`, new THREE.Vector3(x, (y ?? pierGround(x, z)) + 0.6, z), color);
      drops.push(d);
      level.drops.push(d);
      api.addEdible(d);
      if (fogged) foggedDrops.push(d);
    });
  const foggedDrops: PaintDrop[] = [];
  dropLine([[-47.6, -52.5], [-47.6, -55.5], [-47.6, -58.5], [-46.6, -61.5]], PAL.yellow);
  dropLine([[-53, -64], [-50, -67.5], [-46, -66], [-58.5, -66]], PAL.turq);
  dropLine([[-64.6, -63.4], [-66.4, -65.6], [-68.2, -67.8], [-69.9, -65.7], [-71.6, -63.6], [-73, -65.4], [-74.4, -67.2]], PAL.hotpink, true);
  dropLine([[-78, -65], [-81, -68], [-81, -74], [-81, -77.5]], PAL.orange);
  dropLine([[-86, -84], [-86, -90], [-84, -95], [-76, -95], [-73.5, -84]], PAL.cobalt);
  dropLine([[-80, -51.5], [-82.5, -53.5], [-79.5, -55.5]], PAL.yellow);

  // ───────────── regions (area titles) ─────────────
  const R3 = (name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  level.regions.unshift(R3('The Bandstand', -64, BY - 1, -101, -44, BY + 8, -78), R3('Echo Gallery', -86, Y - 1, -58, -76, Y + 6, -49), R3('Bandstand Pier', -92, 2, -104, -38, 20, -52.6));

  // the Landscape sea stack that stood where the Fog Walk is now (it would poke through the gap)
  root.traverse((o) => {
    if (o.name !== 'landscape-far') return;
    for (const c of o.children) if (c.position.x < -50 && c.position.x > -95 && c.position.z < -50 && c.position.z > -105) c.visible = false;
  });

  // ───────────── finish: batches, ink ─────────────
  for (const [name, b] of Object.entries(zones)) b.flush(group, `pier-${name}`);
  dropFlatInk(group);
  mergeStaticInk(group);

  let washT = -1;
  let recordSpin = 0;
  return {
    spawns: {
      yardCrabs: [new THREE.Vector3(-50.5, Y, -66.5), new THREE.Vector3(-45, Y, -65.5)],
      jellies: [
        { at: new THREE.Vector3(-65, Y, -65.5), path: [new THREE.Vector3(-64, Y, -65.5), new THREE.Vector3(-69, Y, -66)] },
        { at: new THREE.Vector3(-72, Y, -65.5), path: [new THREE.Vector3(-70.5, Y, -65), new THREE.Vector3(-75, Y, -66.5)] },
      ],
      carouselJelly: { at: new THREE.Vector3(-85, Y, -85), path: [new THREE.Vector3(-85.5, Y, -84), new THREE.Vector3(-85.5, Y, -94), new THREE.Vector3(-75, Y, -94), new THREE.Vector3(-75, Y, -84)] },
      barker: new THREE.Vector3(-74.5, Y, -93),
      carouselCrab: new THREE.Vector3(-86, Y, -92),
      gramophone: P.arena.clone(),
      gramoHelper: new THREE.Vector3(P.arena.x, BY, P.arena.z - 6.5),
    },
    walkway,
    foggedDrops,
    fogCrown,
    crownGramophone,
    crownGallery,
    horns,
    fogLamp,
    lostFound,
    yardLock,
    springLock,
    checkpointAt: cpPos,
    spring,
    bridgeX,
    get gateOpen() {
      return gateOpenT >= 0;
    },
    get washed() {
      return washT >= 0;
    },
    showRecordX() {
      if (washT < 0) recordX.visible = true;
    },
    hideRecordX() {
      recordX.visible = false;
    },
    openGate() {
      if (gateOpenT >= 0) return;
      gateOpenT = 0;
      physics.untag(gateCol);
      physics.world.removeCollider(gateCol, false);
      ctx.audio.play('gateOpen', { pos: P.gate, vol: 0.8 });
    },
    washMarks() {
      if (washT >= 0) return;
      washT = 0;
      for (const b of barricades)
        for (const c of b.cols) {
          physics.untag(c);
          physics.world.removeCollider(c, false);
        }
      for (const m of marks) if (m.m.visible) ctx.effects.burst(m.m.getWorldPosition(new THREE.Vector3()), [PAL.yellow, PAL.turq, PAL.pink][marks.indexOf(m) % 3], 6, 3);
      for (const mm of muted) {
        mm.mat.map = mm.to;
        mm.mat.needsUpdate = true;
      }
      ctx.audio.play('reveal', { vol: 1 });
    },
    update(dt) {
      yardLock.update(dt);
      springLock.update(dt);
      recordSpin += dt * (washT >= 0 ? 0.6 : 0.18);
      record.rotation.y = recordSpin;
      recordX.rotation.y = recordSpin;
      if (gateOpenT >= 0 && gateOpenT < 1) {
        gateOpenT = Math.min(1, gateOpenT + dt * 0.7);
        const k = 1 - Math.pow(1 - gateOpenT, 3);
        leaves.forEach((l, i) => (l.rotation.y = (i === 0 ? -1 : 1) * k * 1.7));
      }
      if (washT < 0 || washT >= 1) return;
      washT = Math.min(1, washT + dt * 0.6);
      for (const m of marks)
        for (const mat of m.mats) {
          (mat as THREE.MeshBasicMaterial).opacity = 1 - washT;
          if (washT >= 1) m.m.visible = false;
        }
      for (const b of barricades) {
        b.g.scale.y = Math.max(0.001, 1 - washT * 1.2);
        if (washT >= 1) b.g.visible = false;
      }
    },
  };
}
