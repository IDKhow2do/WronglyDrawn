/**
 * [INPUT]: depends on buildTerrain/Y/SUMMIT/GORGE from ./Terrain; wonkyBuilding, buildFountain, buildLandscape, dressIsland;
 *          buildQuarter from ./plaza/CrossedQuarter; Checkpoint/Crown/PaintDrop from ./Collectibles; PhysicsWorld (static boxes);
 *          jumpFlight from ./JumpFlight (the ladder tag's steps and the sky stairs)
 * [OUTPUT]: exports buildBlindPlaza() → BuiltLevel, LEVEL (spawn, summit), Region, LevelApi, makeCrown
 * [POS]: level 1's GEOMETRY: the island, its houses, stairs, hosts' bodies, the summit arena and the Gate Tower.
 *        GameSession builds it once and runs the gameplay on top. Stepped stairs carry an invisible nosing ramp
 *        (PhysicsWorld.addNosingRamp): the 0.55 m auto-step alone stalls a slow stick tilt. Jump-up flights
 *        (the sky stairs, the ladder tag's steps) are jumpFlight blocks: one straight run, nothing overhead.
 *        The sealed tower door's collider closes the doorway up to the lintel; openArchDoor() removes it.
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { crownModel } from './PropModels';
import type { AssetManager } from '../core/AssetManager';
import { Quality } from '../render/Quality';
import type { GameContext } from '../core/Context';
import { RAPIER } from '../core/PhysicsWorld';
import { PAL, labelCanvas } from '../render/PaintTextures';
import { t } from '../i18n';
import { addOutline, mergeStaticInk, decal, paintedMesh, toon, wonkyBox } from '../render/Materials';
import type { HostDef, OrganHost } from '../hosts/OrganHost';
import type { UndrawnSolid } from '../hosts/Undrawn';
import type { Edible } from '../hosts/Edible';
import { Checkpoint, Crown, PaintDrop, Rubble, TagSpot } from './Collectibles';
import { dressIsland } from './Dressing';
import { buildFountain } from './Fountain';
import { buildLandscape } from './Landscape';
import { buildTerrain, cliffMaterial, gorgeX, GAPS, GORGE, LEGS, SUMMIT, Y } from './Terrain';
import { wonkyBuilding, type WonkyBuilt } from './WonkyBuilding';
import { buildQuarter, type BuiltQuarter } from './plaza/CrossedQuarter';
import { jumpFlight } from './JumpFlight';

/**
 * BLIND PLAZA v3 — "The Torn Canvas". A floating island (the map IS the
 * island: nothing exists past its torn edge; falling off = redrawn at the last
 * spray can). Real terrain tiers, see Terrain.ts and docs/LEVEL1_V3.md.
 *
 *   harbor (spawn, south) → hub (Statue, fountain) ─┬─ west: canal gorge → bastion (Gatehouse)
 *                                                    ├─ east: workyard terrace (mutant) → rooftop (lamp)
 *                                                    └─ north: Sleepy Cliff + switchback road (3 erased gaps)
 *                                                         → upper town → SUMMIT (the Eraser)
 *                                                         └─ hairpin 2 → sunken lane → the CROSSED-OUT QUARTER
 *                                                            (east high ground, plaza/CrossedQuarter.ts)
 */
export const LEVEL = {
  spawn: new THREE.Vector3(-2, 0.13, 48),
  spawnYaw: Math.PI,
  title: 'LV. 1 · BLIND PLAZA',
  wallEye: new THREE.Vector3(-11, 9.8, -17.3),
  /** Through the opened tower door (after the Eraser is repainted). */
  completeTrigger: new THREE.Box3(new THREE.Vector3(-3, 13, -52), new THREE.Vector3(3, 18, -48.5)),
  summit: new THREE.Vector3(SUMMIT.x, Y.summit, SUMMIT.z),
  summitRadius: SUMMIT.r,
  /** Below this you fell off the island. */
  killY: -12,
};

export interface Region {
  name: string;
  box: THREE.Box3;
}

export interface LevelApi {
  addHost(def: HostDef): OrganHost;
  addUndrawn(id: string, center: THREE.Vector3, half: THREE.Vector3, yaw?: number, color?: string): UndrawnSolid;
  addEdible(e: Edible): void;
}

export interface BuiltLevel {
  hosts: Record<string, OrganHost>;
  crowns: Crown[];
  drops: PaintDrop[];
  checkpoints: Checkpoint[];
  rubble: Rubble[];
  bridge: UndrawnSolid[];
  islandPath: UndrawnSolid[];
  skyStair: UndrawnSolid[];
  shelf: UndrawnSolid[];
  regions: Region[];
  tags: TagSpot[];
  paintedGazers: { origin: THREE.Vector3; dir: THREE.Vector3; range: number; cosHalf: number; sourceId: string }[];
  spawns: {
    mutant: THREE.Vector3;
    lamp: THREE.Vector3;
    starterLamp: THREE.Vector3;
    chomper: THREE.Vector3;
    grubs: THREE.Vector3[];
    nest: THREE.Vector3;
    eraser: THREE.Vector3;
  };
  /** Building facades that can watch WAI (ambient life). */
  eyeSpots: WonkyBuilt['eyeSpots'];
  /** Where paper-bird flocks sit. */
  perches: THREE.Vector3[];
  /** Sketched spring outlines (paint them real) and where they throw you. */
  springSpots: { pos: THREE.Vector3; target: THREE.Vector3; need?: number }[];
  groundAt(x: number, z: number): number;
  openArchDoor(): void;
  /** Boss fight: crumb wall in the summit's south gap + an invisible rim above the parapet. */
  lockArena(on: boolean): void;
  lowerDrawbridge(): void;
  wakeWallFacade(): void;
  collapseScaffold(): boolean;
  /** Redraw erased road stretch i (0..2); returns the gap centre for the camera. */
  redrawRoad(i: number): THREE.Vector3;
  roadGapCenter(i: number): THREE.Vector3;
  scaffoldPos: THREE.Vector3;
  update(dt: number, camPos: THREE.Vector3): void;
  benchCrown: Crown;
  /** The Crossed-Out Quarter (second district, east high ground): see src/level/plaza. */
  quarter: BuiltQuarter;
}

export function buildBlindPlaza(ctx: GameContext, api: LevelApi): BuiltLevel {
  const { root, physics, assets } = ctx;
  const T = (n: string) => assets.tex(n);
  const anims: ((dt: number, t: number) => void)[] = [];
  let time = 0;

  // ───────────── light & sky ─────────────
  root.add(new THREE.HemisphereLight('#e2e8ff', '#c07090', 1.45));
  root.add(new THREE.AmbientLight('#ffffff', 0.35));
  const sun = new THREE.DirectionalLight('#fff0dc', 2.2);
  sun.position.set(40, 70, 30);
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { near: 1, far: 180 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  Quality.setSun(sun); // shadow size / box per graphics tier (follows the player on lower tiers)
  ctx.scene.fog = new THREE.Fog('#b6c6ff', 90, 230);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: T('sky'), side: THREE.BackSide, fog: false, depthWrite: false })));
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T(i % 2 ? 'cloud_a' : 'cloud_b'), fog: false, transparent: true, depthWrite: false }));
    const a = (i / 26) * Math.PI * 2;
    const low = i % 3 === 0; // a sea of clouds under the island
    const r = low ? 30 + (i % 5) * 14 : 110 + (i % 4) * 20;
    s.position.set(Math.cos(a) * r, low ? -22 - (i % 4) * 5 : 40 + (i % 3) * 14, Math.sin(a) * r);
    s.scale.set(low ? 60 : 50, low ? 26 : 24, 1);
    root.add(s);
    clouds.push(s);
  }
  anims.push((dt) => clouds.forEach((c, i) => (c.position.x += dt * (0.5 + (i % 3) * 0.3))));

  // ───────────── the island ─────────────
  const terrain = buildTerrain(ctx);
  const G = terrain.groundAt;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, G(x, z) + dy, z);
  const eyeSpots: WonkyBuilt['eyeSpots'] = [];
  const footMin = (x: number, z: number, w: number, d: number) => Math.min(G(x - w / 2, z - d / 2), G(x + w / 2, z - d / 2), G(x - w / 2, z + d / 2), G(x + w / 2, z + d / 2), G(x, z));
  const house = (x: number, z: number, w: number, d: number, h: number, yaw: number, facade: string, side: string, eyes = false, seed = 0) => {
    const b = wonkyBuilding(ctx, { x, z, w, d, h, yaw, ground: footMin(x, z, w * 1.1, d * 1.1), facade, side, eyes, seed: seed || Math.floor(x * 31 + z * 17) });
    eyeSpots.push(...b.eyeSpots);
    return b;
  };
  /** Sculpted Tripo house (face on its front); falls back to a wonky house if the model is missing. */
  const heroHouse = (slot: 'houseTall' | 'houseWide' | 'houseLean' | 'houseShop', x: number, z: number, yaw: number, w: number, d: number, h: number, facade: string, side: string) => {
    const m = assets.instantiateModel(slot);
    if (!m) return house(x, z, w, d, h, yaw, facade, side, true);
    const ground = footMin(x, z, w, d);
    m.position.set(x, ground - 0.25, z);
    m.rotation.y = yaw;
    m.traverse((o) => {
      (o as THREE.Mesh).castShadow = true;
    });
    root.add(m);
    // full-height collider: the top is far above anything WAI can reach
    physics.addStaticBox(new THREE.Vector3(x, ground + h / 2, z), new THREE.Vector3(w / 2, h / 2, d / 2), yaw);
    return null;
  };

  /** Solid box sitting on the ground (steps, kerbs, ledges). */
  const solid = (c: THREE.Vector3, half: THREE.Vector3, mat: THREE.Material, yaw = 0, outline = 0.04) => {
    const m = paintedMesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), mat, outline);
    m.position.copy(c);
    m.rotation.y = yaw;
    root.add(m);
    physics.addStaticBox(c.clone(), half.clone(), yaw);
    return m;
  };

  // ───────────── harbor (spawn) ─────────────
  // the dock juts out over the clouds
  const dockMat = toon({ map: T('wood') });
  // planks sit 12 cm proud of the harbor stones (never coplanar → no flicker; a tiny step WAI walks up)
  solid(new THREE.Vector3(-2, -0.14, 51.5), new THREE.Vector3(3.2, 0.26, 5), dockMat, 0, 0.05);
  const pileMat = toon({ map: T('wood') });
  for (const [px, pz] of [[-5, 47], [1, 47], [-5, 55.8], [1, 55.8]]) {
    // mooring posts poke 0.5 m above the planks (solid now), pilings hang far below the pier's end
    const far = pz > 50;
    const len = far ? 8 : 4;
    const post = paintedMesh(new THREE.CylinderGeometry(0.22, far ? 0.16 : 0.25, len, 8), pileMat, 0.03);
    post.position.set(px, 0.6 - len / 2, pz);
    root.add(post);
    physics.addStaticCylinder(new THREE.Vector3(px, 0.36, pz), 0.24, 0.24);
  }
  // cross-braces between the dangling pilings (the pier's end no longer just floats on two sticks)
  for (const [x0, y0, x1, y1] of [[-5, -0.6, 1, -4.6], [1, -0.6, -5, -4.6]]) {
    const a = new THREE.Vector3(x0, y0, 55.8), b = new THREE.Vector3(x1, y1, 55.8);
    const brace = paintedMesh(new THREE.BoxGeometry(0.16, a.distanceTo(b), 0.16), pileMat, 0.02);
    brace.position.copy(a).lerp(b, 0.5);
    brace.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y);
    root.add(brace);
  }
  for (const pz of [49.5, 53]) {
    const beam = paintedMesh(new THREE.BoxGeometry(6.2, 0.22, 0.22), pileMat, 0.02);
    beam.position.set(-2, -0.5, pz);
    root.add(beam);
  }
  house(-19, 32, 10, 8, 9, Math.PI / 2, 'facade_nose', 'stone_pink', true, 11);
  heroHouse('houseWide', 13, 32, -Math.PI / 2, 11.4, 5.9, 9, 'facade_crowns', 'stone_blue');
  heroHouse('houseShop', -18.5, 41.5, Math.PI / 2, 5.3, 3.0, 8, 'facade_teeth', 'stone_yellow');
  // harbor steps up to the hub (real steps over the slope)
  const stepMat = toon({ map: T('stone_cream') });
  for (let i = 0; i < 3; i++) solid(new THREE.Vector3(-3, (3 - i) * 0.5 - 0.25 - 0.5, 24.5 + i), new THREE.Vector3(10, 0.25 + 0.25, 0.5), stepMat, 0, 0.03);
  // their invisible ramp, 5 cm over the nosings: even the 0.25 m risers here stalled WAI at a half stick tilt
  physics.addNosingRamp([new THREE.Vector3(-3, Y.hub + 0.03, 23.8), new THREE.Vector3(-3, Y.hub + 0.03, 24.54), new THREE.Vector3(-3, Y.harbor, 27.6)], 10);

  // ───────────── hub buildings ─────────────
  heroHouse('houseLean', -24, -12.5, 0, 5.0, 3.8, 10, 'facade_cyclops', 'stone_orange');
  heroHouse('houseTall', -16, -14, 0.15, 4.2, 4.3, 12, 'facade_teeth', 'stone_pink');
  house(-22.3, 18, 8, 8, 9, Math.PI / 2, 'facade_plain_b', 'stone_purple', false, 22);
  heroHouse('houseTall', 14, 19, -Math.PI / 2, 4.2, 4.3, 12, 'facade_teeth', 'stone_pink');

  // ───────────── the Sleepy Cliff (a giant face carved into the hill) ─────────────
  const faceTex = T('facade_sleepy').clone();
  faceTex.needsUpdate = true;
  faceTex.wrapS = THREE.RepeatWrapping;
  faceTex.repeat.set(2, 1);
  const cliffSide = toon({ map: T('stone_orange') });
  const faceMats: THREE.Material[] = [cliffSide, cliffSide, cliffSide, cliffSide, toon({ map: faceTex }), cliffSide];
  const faceSlab = new THREE.Mesh(new THREE.BoxGeometry(26, 10.9, 1.4), faceMats);
  faceSlab.position.set(-11, Y.hub + 5.45 - 0.2, -18.4);
  addOutline(faceSlab, 0.08);
  root.add(faceSlab);
  const faceCol = physics.addStaticBox(faceSlab.position.clone(), new THREE.Vector3(13, 5.45, 0.7));

  // ───────────── workyard terrace ─────────────
  const roofB = wonkyBuilding(ctx, { x: 46, z: -5, w: 10, d: 8, h: Y.roof - Y.terrace, yaw: -Math.PI / 2, ground: Y.terrace, facade: 'facade_crowns', side: 'stone_blue', flatRoof: true, seed: 31, lean: 0 });
  void roofB;
  house(53, 14, 9, 6, 9, -Math.PI / 2, 'facade_cyclops', 'stone_yellow', true, 32);
  house(36, 27, 9, 7, 8, Math.PI, 'facade_plain_a', 'stone_pink', false, 33);
  // the mutant's walled yard (low painted walls, two wide gaps)
  const yardWall = toon({ map: T('stone_cream') });
  for (const [x0, z0, x1, z1] of [
    [30, 4, 38, 4.6],
    [42, 4, 49, 4.6],
    [30, 20, 49, 20.6],
    [48.4, 4, 49, 20.6],
  ] as [number, number, number, number][])
    solid(new THREE.Vector3((x0 + x1) / 2, Y.terrace + 1.2, (z0 + z1) / 2), new THREE.Vector3((x1 - x0) / 2, 1.2, (z1 - z0) / 2), yardWall, 0, 0.05);

  // ───────────── upper town + summit ─────────────
  house(-20, -27, 9, 7, 9, 0, 'facade_teeth', 'stone_orange', true, 41);
  house(-24, -41, 8, 11, 11, Math.PI / 2, 'facade_nose', 'stone_purple', true, 42);
  house(-19, -50.5, 8, 6, 8, Math.PI / 6, 'facade_plain_b', 'stone_pink', false, 43);
  house(18, -48, 8, 7, 9, -Math.PI / 5, 'facade_cyclops', 'stone_blue', true, 44);
  // summit stairs (plateau 12 → summit 14)
  for (let i = 0; i < 4; i++) solid(new THREE.Vector3(0, Y.plateau + i * 0.5 + 0.25 - 0.5, -30.6 - i * 1.1), new THREE.Vector3(3, 0.5, 0.55), stepMat, 0, 0.03);
  // its invisible ramp: one straight run 10 cm over the nosings, plateau foot → 6 cm over the summit floor
  // (it must clear the terrain's lip at the summit's edge, z ≈ −33.7). A 0.5 m riser beats the 0.55 m
  // auto-step only at a brisk walk: a slow stick tilt stalled on the 2nd step.
  physics.addNosingRamp([new THREE.Vector3(0, Y.summit + 0.06, -34.6), new THREE.Vector3(0, Y.summit + 0.06, -33.8), new THREE.Vector3(0, Y.plateau, -29.27)], 3);
  // summit parapet (low wall, waist high, gap to the south)
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - Math.PI / 2), Math.cos(a - Math.PI / 2))) < 0.42) continue; // south entrance
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.3) continue; // tower door (north)
    const x = SUMMIT.x + Math.cos(a) * (SUMMIT.r - 0.3), z = SUMMIT.z + Math.sin(a) * (SUMMIT.r - 0.3);
    solid(new THREE.Vector3(x, Y.summit + 0.45, z), new THREE.Vector3(1.05, 0.45, 0.3), stepMat, -a + Math.PI / 2, 0.03);
  }

  // boss-fight lock: a heap of pink eraser crumbs that rises in the south gap
  const arenaColliders: RAPIER.Collider[] = [];
  let arenaLocked = false;
  let crumbT = -1;
  const crumbWall = new THREE.Group();
  {
    const crumbMat = toon({ color: '#ff9ec4' });
    const darker = toon({ color: '#e4789f' });
    const gapA = Math.PI / 2; // south
    for (let i = 0; i < 26; i++) {
      const a = gapA + (i / 25 - 0.5) * 0.84;
      const r = SUMMIT.r - 0.3 + (Math.random() - 0.5) * 0.6;
      const s = 0.35 + Math.random() * 0.45;
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 3 ? crumbMat : darker);
      m.position.set(Math.cos(a) * r, s * 0.6 + (i % 4) * 0.35, Math.sin(a) * r);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      m.castShadow = true;
      m.userData.noPaint = true;
      crumbWall.add(m);
    }
    crumbWall.position.set(SUMMIT.x, Y.summit, SUMMIT.z);
    crumbWall.visible = false;
    root.add(crumbWall);
  }

  // the Gate Tower behind the summit (its door opens when the Eraser is repainted)
  const tower = assets.instantiateModel('gateTower');
  const towerAt = new THREE.Vector3(0, Y.summit, -52.5);
  if (tower) {
    tower.position.copy(towerAt);
    // the pink Eraser fights right in front of this tower: push the tower cooler and a touch darker
    // so the boss's silhouette separates from it (it used to vanish pink-on-pink)
    tower.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!m || !(o as THREE.Mesh).isMesh || !m.color) return;
      const c = m.clone();
      c.color.multiply(new THREE.Color('#9aa8e8'));
      (o as THREE.Mesh).material = c;
    });
    root.add(tower);
  } else {
    const tw = paintedMesh(wonkyBox(9, 15, 6, 0.04, 77), toon({ map: T('stone_purple') }), 0.08);
    tw.position.copy(towerAt).add(new THREE.Vector3(0, 7.5, 0));
    root.add(tw);
  }
  physics.addStaticBox(towerAt.clone().add(new THREE.Vector3(-3.9, 7.5, -0.2)), new THREE.Vector3(1.6, 7.5, 2.8));
  physics.addStaticBox(towerAt.clone().add(new THREE.Vector3(3.9, 7.5, -0.2)), new THREE.Vector3(1.6, 7.5, 2.8));
  physics.addStaticBox(towerAt.clone().add(new THREE.Vector3(0, 11.5, -0.2)), new THREE.Vector3(2.4, 3.5, 2.8));
  const doorTex = new THREE.CanvasTexture(labelCanvas('◉  SEALED  ◉', PAL.red, PAL.white, 256, 128));
  doorTex.colorSpace = THREE.SRGBColorSpace;
  const doorMats = [PAL.red, PAL.red, PAL.red, PAL.red].map((c) => toon({ color: c }));
  const door = new THREE.Mesh(new THREE.BoxGeometry(5, 5.6, 0.3), [...doorMats, toon({ map: doorTex }), toon({ color: PAL.red })]);
  door.position.copy(towerAt).add(new THREE.Vector3(0, 2.8, 2.7));
  addOutline(door, 0.04);
  root.add(door);
  // the sealed door's collider reaches up to the lintel box (y +8): the 2.4 m slot over the 5.6 m door let a WAI who
  // jumped off the Eraser's head drop in behind the door mid-fight (docs/regression/ARENAS.md)
  const doorCollider = physics.addStaticBox(towerAt.clone().add(new THREE.Vector3(0, 4, 2.7)), new THREE.Vector3(2.5, 4, 0.15), 0, 'gate');
  let doorT = -1;

  // ───────────── canal gorge ─────────────
  const gx = gorgeX;
  // stairs down to the towpath (along the gorge wall)
  const towStairs = (zTop: number, dir: 1 | -1, xOff = 6.55) => {
    // stairs set off the wall run all the way to it: no 0.9 m slot behind them to get wedged in
    const wallOff = GORGE.halfWater + GORGE.towpath;
    const fill = Math.max(0, wallOff - (xOff + 0.7)) / 2;
    for (let i = 0; i < 8; i++) {
      const z = zTop + dir * i;
      // flush against the gorge wall, leaving a walkway along the water (no towpath dead-ends)
      const x = gx(z) + xOff + fill;
      const top = Y.hub - 0.5 - i * 0.5;
      const h = top - Y.towpath;
      solid(new THREE.Vector3(x, Y.towpath + h / 2, z), new THREE.Vector3(0.7 + fill, h / 2, 0.5), stepMat, 0, 0.03);
    }
    // invisible ramp along the step nosings (one piece per step, following the gorge's curve):
    // 0.5 m steps on flat ground defeat the controller's auto-step — this walks you up smoothly
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 8; k++) {
      const z = zTop - dir * 0.5 + dir * k;
      // sits a hair above the nosings (rides over the terrain mesh's little lips at the wall)
      pts.push(new THREE.Vector3(gx(z) + xOff + fill, Y.hub - 0.5 * k + 0.22, z));
    }
    // a long, gentle foot that lands on the towpath a metre past the last step
    const zf = zTop + dir * 8.5;
    pts.push(new THREE.Vector3(gx(zf) + xOff + fill, Y.towpath, zf));
    physics.addNosingRamp(pts, 0.7 + fill);
  };
  towStairs(17.5, 1);
  towStairs(-14.5, 1, 5.6); // off the wall (the terrain mesh slants there); top joins the hub at the gorge's south end, foot opens onto the towpath
  // kerb along the hub's gorge edge (openings: stairs, bridge, drawbridge)
  const kerbMat = toon({ map: T('terrace'), color: '#e8d8ff' });
  for (let z = -15; z < 26; z += 2) {
    const zc = z + 1;
    if ((zc > -15.5 && zc < -2.5) || (zc > 9 && zc < 15) || (zc > 16.5 && zc < 26.5)) continue;
    const x = gx(zc) + 4.4 + 2.8 + 0.25;
    solid(new THREE.Vector3(x, Y.hub + 0.35, zc), new THREE.Vector3(0.22, 0.35, 1.0), kerbMat, Math.atan(0.03), 0.02);
  }
  // the canal island (crown) and its stepping stones
  const islandZ = 27;
  const rock = paintedMesh(new THREE.CylinderGeometry(1.5, 2.0, 3.6, 9), toon({ map: T('stone_purple') }), 0.05);
  rock.position.set(gx(islandZ), Y.towpath - 1.8, islandZ);
  root.add(rock);
  physics.addStaticCylinder(rock.position.clone(), 1.8, 1.6);

  // drawbridge (lowered by the awakened Gatehouse): hinged on the bastion
  const dbZ = -5;
  const dbFrom = new THREE.Vector3(gx(dbZ) - 4.4 - 0.2, Y.bastion, dbZ);
  const dbTo = new THREE.Vector3(gx(dbZ) + 4.4 + 2.8, Y.hub, dbZ);
  const dbLen = dbFrom.distanceTo(dbTo);
  const bridgeMesh = paintedMesh(new THREE.BoxGeometry(dbLen, 0.4, 3), toon({ map: T('wood') }), 0.05);
  const bridgePivot = new THREE.Group();
  bridgePivot.position.copy(dbFrom);
  bridgeMesh.position.set(dbLen / 2, -0.2, 0);
  bridgePivot.add(bridgeMesh);
  const dbSlope = Math.atan2(dbTo.y - dbFrom.y, dbTo.x - dbFrom.x);
  bridgePivot.rotation.z = Math.PI / 2.1;
  root.add(bridgePivot);
  const dbMid = dbFrom.clone().lerp(dbTo, 0.5);
  const bridgeCollider = physics.addStaticBox(dbMid.clone().add(new THREE.Vector3(0, -0.2, 0)), new THREE.Vector3(dbLen / 2, 0.2, 1.5), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), dbSlope));
  bridgeCollider.setEnabled(false);
  let bridgeT = -1;

  // ───────────── Gatehouse on its bastion ─────────────
  const gateB = wonkyBuilding(ctx, { x: -51, z: -5, w: 11, d: 7, h: 10, yaw: Math.PI / 2, ground: Y.bastion, facade: 'facade_gatehouse', side: 'stone_orange', door: false, seed: 51, lean: 0 });
  void gateB;
  house(-50, 18, 9, 8, 9, Math.PI / 2, 'facade_nose', 'stone_pink', true, 52);
  house(-46, 32, 6, 6, 7, Math.PI / 3, 'facade_crowns', 'stone_yellow', false, 53);

  const rubble: Rubble[] = [];

  // ───────────── statue (host: large, anchored, turns its head) ─────────────
  const statueAt = new THREE.Vector3(-17, Y.hub, 7);
  // Statue v2 (Tripo, in parts): plinth → head (+ crown); eyeball + stone lid are rigged so the eye can open
  const plinthModel = assets.instantiateModel('statuePlinth', { pivot: 'raw' });
  const headModel = assets.instantiateModel('statueHead', { pivot: 'raw' });
  const v2 = !!(plinthModel && headModel);
  const PLINTH_TOP = 2.37;
  if (v2) {
    plinthModel!.position.copy(statueAt);
    root.add(plinthModel!);
    physics.addStaticCylinder(new THREE.Vector3(statueAt.x, statueAt.y + 1.0, statueAt.z), 1.0, 1.7);
    physics.addStaticCylinder(new THREE.Vector3(statueAt.x, statueAt.y + 2.2, statueAt.z), 0.17, 1.2);
  } else {
    const ped = paintedMesh(new THREE.CylinderGeometry(2.6, 2.8, 1.2, 14), toon({ map: T('stone_orange') }), 0.06);
    ped.position.set(statueAt.x, statueAt.y + 0.6, statueAt.z);
    const ped2 = paintedMesh(new THREE.CylinderGeometry(1.4, 1.6, 0.6, 10), toon({ map: T('stone_blue') }), 0.05);
    ped2.position.set(statueAt.x, statueAt.y + 1.5, statueAt.z);
    const neck = paintedMesh(wonkyBox(1.1, 1.6, 1.0, 0.05, 41), toon({ map: T('stone_cream') }), 0.05);
    neck.position.set(statueAt.x, statueAt.y + 2.6, statueAt.z);
    root.add(ped, ped2, neck);
    physics.addStaticCylinder(new THREE.Vector3(statueAt.x, statueAt.y + 0.6, statueAt.z), 0.6, 2.8);
    physics.addStaticCylinder(new THREE.Vector3(statueAt.x, statueAt.y + 1.5, statueAt.z), 0.3, 1.6);
    physics.addStaticBox(new THREE.Vector3(statueAt.x, statueAt.y + 2.6, statueAt.z), new THREE.Vector3(0.55, 0.8, 0.5));
  }
  const hosts: Record<string, OrganHost> = {};
  const H = (def: HostDef) => (hosts[def.id] = api.addHost(def));

  // statue rig (body-local: origin at the head's centre, face +Z)
  const HEAD_HALF = 1.5;
  const EYE_AT = new THREE.Vector3(0.11, -HEAD_HALF + 2.304, 0.644);
  const eyeRig = new THREE.Group();
  const lidRig = new THREE.Group();
  const statueRig = { eyeRig, lidRig, lid: -Math.PI / 2, look: new THREE.Vector2(), blinkT: 0, nextBlink: 3, dream: 0 };
  // lid angle convention (see docs/ASSETS.md): closed −π/2 · sleepy −0.8 · open +π/2 (about the head's lateral axis)
  const setLid = (a: number) => (lidRig.rotation.x = -a);

  H({
    id: 'statue',
    name: 'Blind Statue',
    size: 'large',
    anchored: true,
    canTurn: true,
    pos: v2 ? new THREE.Vector3(statueAt.x, statueAt.y + PLINTH_TOP, statueAt.z) : new THREE.Vector3(statueAt.x, statueAt.y + 3.4, statueAt.z),
    half: v2 ? new THREE.Vector3(1.0, HEAD_HALF, 0.85) : new THREE.Vector3(1.2, 1.05, 1.0),
    yaw: 0,
    ownEye: v2,
    sockets: v2
      ? { EYE: EYE_AT.clone().add(new THREE.Vector3(0, 0, 0.45)), MOUTH: new THREE.Vector3(0.05, -0.55, 0.92), LEG: new THREE.Vector3(0, -HEAD_HALF, 0) }
      : { EYE: new THREE.Vector3(0.1, 0.35, 1.02), MOUTH: new THREE.Vector3(0.1, -0.5, 1.02), LEG: new THREE.Vector3(0, -1.05, 0) },
    gaze: { range: 45, halfAngleDeg: 10, pitch: -0.12 },
    build: () => {
      const g = new THREE.Group();
      if (v2) {
        headModel!.position.y = -HEAD_HALF;
        g.add(headModel!);
        const crown = assets.instantiateModel('statueCrown', { pivot: 'raw' });
        if (crown) {
          crown.position.set(0.026, -HEAD_HALF + 2.98 - 0.04, -0.099);
          crown.rotation.z = -0.06;
          g.add(crown);
        }
        const eye = assets.instantiateModel('statueEye', { pivot: 'raw' });
        eyeRig.position.copy(EYE_AT);
        if (eye) {
          eye.scale.multiplyScalar(0.92); // clean gap under the brow
          eyeRig.add(eye);
        }
        const lid = assets.instantiateModel('statueLid', { pivot: 'raw' });
        lidRig.position.copy(EYE_AT);
        if (lid) lidRig.add(lid);
        setLid(-Math.PI / 2);
        g.add(eyeRig, lidRig);
        return g;
      }
      const head = paintedMesh(wonkyBox(2.4, 2.1, 2.0, 0.07, 42, 0.05), toon({ map: T('stone_pink') }), 0.07);
      g.add(head);
      const scar = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16), new THREE.MeshBasicMaterial({ color: '#ffc6dc' }));
      scar.scale.set(1.2, 0.7, 1);
      scar.position.set(0.1, 0.35, 1.01);
      scar.name = 'blind-smear';
      g.add(scar);
      const crown = makeCrown(1.9, PAL.yellow, assets);
      crown.position.y = 1.25;
      crown.rotation.z = -0.15;
      g.add(crown);
      return g;
    },
    onRender: (host, dt, { reaction, playerHead }) => {
      if (!v2) return;
      const R = statueRig;
      const awake = host.has('EYE');
      const sw = host.socketWorld('EYE');
      let lidWant: number;
      let look = new THREE.Vector2();
      if (reaction && reaction.type === 'EYE') {
        // the awakening: lid trembles, heaves open (overshoot), eye darts around, then finds WAI
        const t = reaction.t;
        if (t < 0.55) lidWant = -Math.PI / 2 + Math.sin(t * 60) * 0.05 * (t / 0.55);
        else lidWant = -Math.PI / 2 + Math.PI * Math.min(1.08, ((t - 0.55) / 0.7) ** 0.6);
        if (t > 1.0 && t < 1.9) look.set(Math.sin((t - 1.0) * 9) * 0.5, Math.cos((t - 1.0) * 5) * 0.15);
        else if (t >= 1.9) {
          const l = playerHead.clone().sub(sw).applyAxisAngle(new THREE.Vector3(0, 1, 0), -host.yaw).normalize();
          look.set(l.x, l.y);
        }
        R.lid += (lidWant - R.lid) * Math.min(1, dt * (t < 0.55 ? 30 : 9));
      } else if (awake) {
        // awake: mostly holds its gaze; follows WAI when near; blinks now and then
        R.nextBlink -= dt;
        if (R.nextBlink <= 0) {
          R.nextBlink = 3 + Math.random() * 4;
          R.blinkT = 0.22;
        }
        R.blinkT = Math.max(0, R.blinkT - dt);
        lidWant = R.blinkT > 0 ? -Math.PI / 2 : Math.PI / 2;
        if (playerHead.distanceTo(sw) < 11) {
          const l = playerHead.clone().sub(sw).applyAxisAngle(new THREE.Vector3(0, 1, 0), -host.yaw).normalize();
          look.set(l.x, l.y);
        } else look.set(Math.sin(performance.now() / 2300) * 0.08, -0.08);
        R.lid += (lidWant - R.lid) * Math.min(1, dt * (R.blinkT > 0 ? 40 : 12));
      } else {
        // asleep: heavy lid, eye rolling in a dream underneath; snore wobble
        R.dream += dt;
        lidWant = -Math.PI / 2 + 0.06 + Math.sin(R.dream * 1.3) * 0.04;
        look.set(Math.sin(R.dream * 0.7) * 0.4, Math.sin(R.dream * 1.1) * 0.15);
        R.lid += (lidWant - R.lid) * Math.min(1, dt * 6);
      }
      R.look.lerp(new THREE.Vector2(THREE.MathUtils.clamp(look.x, -0.5, 0.5), THREE.MathUtils.clamp(look.y, -0.35, 0.35)), Math.min(1, dt * 8));
      eyeRig.rotation.set(-R.look.y, R.look.x, 0, 'YXZ');
      setLid(R.lid);
    },
    refuses: {},
    lines: {
      LEG: 'The Blind Statue’s pedestal grinds… it can turn its head now.',
      MOUTH: 'The Blind Statue mumbles. It wants to SEE, not talk.',
    },
  });


  // ───────────── the three Guardians ─────────────
  // Sleepy Cliff: its gaze looks south-west at the canal (it paints the bridge there)
  H({
    id: 'sleepyWall',
    name: 'Sleepy Cliff',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: new THREE.Vector3(-11, Y.hub, -17.55),
    half: new THREE.Vector3(13, 5.25, 0.2),
    yaw: 0,
    sockets: { EYE: new THREE.Vector3(0, 3.0, 0.5), MOUTH: new THREE.Vector3(0, -2.4, 0.5), LEG: new THREE.Vector3(0, -5.25, 0.6) },
    gaze: { range: 70, halfAngleDeg: 12, pitch: 0.24, yaw: -0.67 },
    lines: {
      MOUTH: 'The Sleepy Cliff yawns enormously… and goes back to sleep. It needs to SEE.',
    },
  });
  physics.tag(faceCol, 'static', hosts.sleepyWall);
  H({
    id: 'gatehouse',
    name: 'Gatehouse',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: new THREE.Vector3(-47.3, Y.bastion, -5),
    half: new THREE.Vector3(5.5, 5, 0.2),
    yaw: Math.PI / 2,
    sockets: { EYE: new THREE.Vector3(0, 2.6, 0.3), MOUTH: new THREE.Vector3(0, -2.2, 0.3), LEG: new THREE.Vector3(0, -5, 0.3) },
    lines: {
      EYE: 'The Gatehouse peeks around. It sees fine — but it has no MOUTH to call the bridge down.',
    },
  });
  const gag = paintedMesh(wonkyBox(3.2, 1.4, 0.4, 0.1, 9), toon({ color: '#ffb3d1', map: T('stone_cream') }), 0.05);
  gag.position.set(-47.15, Y.bastion + 2.9, -5);
  gag.rotation.y = Math.PI / 2;
  root.add(gag);

  // ───────────── props (all hosts) ─────────────
  const crate = (id: string, x: number, z: number, yaw = 0, name = 'Crate') =>
    H({ id, name, size: 'medium', anchored: false, pos: at(x, z), half: new THREE.Vector3(0.75, 0.55, 0.75), yaw, texture: 'wood' });
  crate('crate-hub-a', 5, 10, 0.3);
  crate('crate-hub-b', -7, -5, -0.2);
  crate('crate-yard-a', 34, 9, 0.1);
  crate('crate-yard-b', 35.5, -7.5, 0.6);
  crate('crate-quay', -47, 24, 0.2);
  H({ id: 'dumpster', name: 'Dumpster', size: 'medium', anchored: false, pos: at(26, 14), half: new THREE.Vector3(1.1, 0.7, 0.75), yaw: Math.PI / 2, texture: 'metal_dark', color: '#7ad0a0' });
  const bench = (id: string, x: number, z: number, yaw: number) =>
    H({
      id,
      name: 'Bench',
      size: 'medium',
      anchored: false,
      pos: at(x, z),
      half: new THREE.Vector3(1.1, 0.42, 0.42),
      yaw,
      build: () => {
        const g = new THREE.Group();
        const seat = paintedMesh(wonkyBox(2.2, 0.16, 0.84, 0.04, 5), toon({ map: T('wood') }), 0.03);
        seat.position.y = 0.1;
        const back = paintedMesh(wonkyBox(2.2, 0.5, 0.12, 0.05, 6), toon({ color: PAL.turq }), 0.03);
        back.position.set(0, 0.42, -0.36);
        g.add(seat, back);
        for (const sx of [-0.9, 0.9]) {
          const l = paintedMesh(new THREE.BoxGeometry(0.12, 0.42, 0.7), toon({ color: '#2a2230' }), 0.02);
          l.position.set(sx, -0.21, 0);
          g.add(l);
        }
        return g;
      },
    });
  bench('bench-hub', -6, 19, Math.PI);
  bench('bench-street', 4.5, 36, -Math.PI / 2);
  bench('bench-yard', 32, 0, 0);
  const small = (id: string, name: string, x: number, z: number, color: string, h = 0.32, w = 0.28) =>
    H({ id, name, size: 'small', anchored: false, pos: at(x, z), half: new THREE.Vector3(w, h, w), color, texture: 'stone_cream' });
  small('bucket-a', 'Bucket', 3, 13, PAL.turq);
  small('bucket-b', 'Bucket', -12, 0, PAL.yellow);
  small('cone-a', 'Traffic Cone', -6, 41, PAL.orange, 0.38, 0.22);
  small('cone-b', 'Traffic Cone', 4, 44, PAL.orange, 0.38, 0.22);
  small('barrel', 'Barrel', 40, -9, PAL.red, 0.45, 0.35);
  small('bin-quay', 'Bin', -45, 12, '#9fd8e6', 0.42, 0.3);
  H({
    id: 'mailbox',
    name: 'Mailbox',
    size: 'small',
    anchored: true,
    pos: at(-8, 36),
    half: new THREE.Vector3(0.3, 0.55, 0.3),
    yaw: Math.PI / 2,
    color: PAL.cobalt,
    texture: 'stone_blue',
    sockets: { EYE: new THREE.Vector3(0, 0.35, 0.32), MOUTH: new THREE.Vector3(0, 0.05, 0.32) },
  });
  const lamp = (id: string, x: number, z: number, yaw: number) =>
    H({
      id,
      name: 'Street Lamp',
      size: 'medium',
      anchored: true,
      canTurn: true,
      pos: at(x, z),
      half: new THREE.Vector3(0.32, 2.2, 0.32),
      yaw,
      sockets: { EYE: new THREE.Vector3(0, 1.75, 0.45), MOUTH: new THREE.Vector3(0, 0.6, 0.34), LEG: new THREE.Vector3(0, -2.2, 0) },
      gaze: { range: 16, halfAngleDeg: 30, pitch: 0.35 },
      build: () => {
        const g = new THREE.Group();
        const dark = toon({ color: '#2a2230' });
        const post = paintedMesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), dark, 0.03);
        const base = paintedMesh(new THREE.CylinderGeometry(0.32, 0.4, 0.5, 8), toon({ color: PAL.orange }), 0.03);
        base.position.y = -1.95;
        const arm = paintedMesh(new THREE.TorusGeometry(0.4, 0.06, 6, 10, Math.PI), dark, 0.02);
        arm.position.set(0, 2.1, 0.4);
        arm.rotation.y = Math.PI / 2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffe27a' }));
        bulb.position.set(0, 1.8, 0.8);
        addOutline(bulb, 0.03);
        g.add(post, base, arm, bulb);
        return g;
      },
    });
  lamp('lamp-street', -9, 44, Math.PI / 2);
  lamp('lamp-hub-nw', -19, -8, Math.PI * 0.75);
  lamp('lamp-hub-e', 16, 3, -Math.PI / 2);
  lamp('lamp-yard', 29, 7, Math.PI / 2);
  H({
    id: 'fountain',
    name: 'Fountain',
    size: 'large',
    anchored: true,
    pos: at(-2, 4),
    half: new THREE.Vector3(1.8, 0.55, 1.8),
    yaw: Math.PI,
    texture: 'stone_blue',
    sockets: { EYE: new THREE.Vector3(0, 0.3, 1.82), MOUTH: new THREE.Vector3(0, -0.1, 1.82) },
    build: () => buildFountain(T),
  });
  H({ id: 'roof-tank', name: 'Water Tank', size: 'medium', anchored: true, pos: new THREE.Vector3(44.5, Y.roof + 0.12, -8), half: new THREE.Vector3(1.0, 1.0, 1.0), color: '#9fd8e6', texture: 'metal_dark' });

  // ───────────── scaffold → ramp to the rooftop ─────────────
  const scaffoldPos = new THREE.Vector3(39.4, Y.terrace, -2.5);
  const scaffold = new THREE.Group();
  const pole = toon({ color: '#5b4636' });
  for (const [sx, sz] of [[-0.6, -1.2], [0.6, -1.2], [-0.6, 1.2], [0.6, 1.2]]) {
    const p = paintedMesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 6), pole, 0.015);
    p.position.set(sx, 2.2, sz);
    scaffold.add(p);
  }
  for (const y of [1.4, 2.8, 4.1]) {
    const plank = paintedMesh(new THREE.BoxGeometry(1.3, 0.08, 2.6), toon({ map: T('wood') }), 0.02);
    plank.position.y = y;
    plank.rotation.x = (Math.random() - 0.5) * 0.1;
    scaffold.add(plank);
  }
  scaffold.position.copy(scaffoldPos);
  root.add(scaffold);
  const scaffoldCollider = physics.addStaticBox(scaffoldPos.clone().add(new THREE.Vector3(0, 2.2, 0)), new THREE.Vector3(0.65, 2.2, 1.3));
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(labelCanvas('WOBBLY!', PAL.cream, PAL.black, 256, 72)), side: THREE.DoubleSide }));
  sign.position.set(-0.7, 1.0, 0);
  sign.rotation.y = -Math.PI / 2;
  scaffold.add(sign);
  let scaffoldDown = false;
  let ramp: THREE.Mesh | null = null;

  // ───────────── undrawn geometry ─────────────
  const bridge: UndrawnSolid[] = [];
  {
    const bz = 12;
    const xa = gx(bz) + 4.4 + 2.8;
    const xb = gx(bz) - 4.4;
    for (let i = 0; i < 6; i++) {
      const k = (i + 0.5) / 6;
      const x = xa + (xb - xa) * k;
      const y = Y.hub + (Y.bank - Y.hub) * k - 0.25;
      bridge.push(api.addUndrawn(`bridge-${i}`, new THREE.Vector3(x, y, bz), new THREE.Vector3(((xa - xb) / 12) * 1.02, 0.25, 1.6), 0, PAL.turq));
    }
  }
  const islandPath: UndrawnSolid[] = [];
  for (const [i, dx] of [3.3, 1.9].entries()) islandPath.push(api.addUndrawn(`island-${i}`, new THREE.Vector3(gx(islandZ) + dx, Y.towpath - 0.2, islandZ), new THREE.Vector3(0.6, 0.2, 0.6), 0, PAL.yellow));
  // the sky stairs: one straight undrawn flight north from the plaza into the ledge (right of the face)
  const skyFlight = jumpFlight(new THREE.Vector3(5, Y.hub, -16.3), Math.PI, Y.hub + 5.75);
  const skyStair = skyFlight.blocks.map((b, i) => api.addUndrawn(`sky-${i}`, b.center, b.half, b.yaw, PAL.pink));
  solid(new THREE.Vector3(5, Y.hub + 5.55, -17.2), new THREE.Vector3(1.3, 0.2, 0.9), toon({ map: T('stone_cream') }), 0, 0.03);
  const shelf = [api.addUndrawn('shelf', new THREE.Vector3(7.6, 2.4, 34), new THREE.Vector3(0.6, 0.15, 1.2), 0, PAL.orange)];
  const lesson = [
    api.addUndrawn('lesson-0', new THREE.Vector3(-6, 0.3, 39), new THREE.Vector3(0.8, 0.3, 0.8), 0.2, PAL.yellow),
    api.addUndrawn('lesson-1', new THREE.Vector3(-7.6, 0.75, 37.4), new THREE.Vector3(0.8, 0.3, 0.8), -0.3, PAL.yellow),
  ];
  void lesson;

  // ───────────── the erased road: three holes to the sky (redrawn by the Guardians) ─────────────
  const gapCenter = (i: number) => {
    const g = GAPS[i];
    const z = (g.z0 + g.z1) / 2;
    const l = LEGS[i];
    const k = (z - l.z0) / (l.z1 - l.z0);
    return new THREE.Vector3((g.x0 + g.x1) / 2, l.y0 + (l.y1 - l.y0) * k, z);
  };
  const gapMarks: THREE.Object3D[] = [];
  for (let i = 0; i < 3; i++) {
    // dashed pencil outline of the missing road + eraser crumbs at the edges
    const c = gapCenter(i);
    const len = GAPS[i].z1 - GAPS[i].z0;
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(5, 0.4, len)),
      new THREE.LineDashedMaterial({ color: '#3a2a4a', dashSize: 0.4, gapSize: 0.25 }),
    );
    box.computeLineDistances();
    box.position.copy(c).add(new THREE.Vector3(0, -0.2, 0));
    root.add(box);
    gapMarks.push(box);
    for (let k = 0; k < 8; k++) {
      const crumb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.32), toon({ color: k % 2 ? '#ff9ec4' : '#ffc6dc' }));
      const edge = k < 4 ? GAPS[i].z1 + 0.35 : GAPS[i].z0 - 0.35;
      crumb.position.set(GAPS[i].x0 + 0.6 + Math.random() * 4, 0, edge + (Math.random() - 0.5) * 0.4);
      crumb.position.y = G(crumb.position.x, crumb.position.z) + 0.1;
      crumb.rotation.y = Math.random() * 3;
      root.add(crumb);
    }
  }
  // each erased stretch is a real pit, not a paper-thin cut: rock walls going down, a torn paper
  // lip over the cut's ragged edge, and the blank sky showing through at the bottom
  const gapPits: THREE.Group[] = [];
  {
    const wallMat = toon({ map: T('stone_purple'), color: '#c9b0ff' });
    (wallMat as THREE.Material).side = THREE.DoubleSide;
    const cliffMat = cliffMaterial(ctx);
    cliffMat.side = THREE.DoubleSide;
    const skyMat = new THREE.MeshBasicMaterial({ map: T('sky'), fog: false });
    const lipMat = new THREE.MeshStandardMaterial({ color: '#fff6e6', roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const DEPTH = 3.2;
    for (let i = 0; i < 3; i++) {
      const gp = GAPS[i];
      const l = LEGS[i];
      const ry = (z: number) => l.y0 + ((l.y1 - l.y0) * (z - l.z0)) / (l.z1 - l.z0);
      const grp = new THREE.Group();
      const quad = (P: number[], a: number[], b: number[], c: number[], d: number[]) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
      const mk = (P: number[], mat: THREE.Material, uvOf: (x: number, y: number, z: number) => [number, number]) => {
        const wg = new THREE.BufferGeometry();
        wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        const uv: number[] = [];
        for (let v = 0; v < P.length; v += 3) uv.push(...uvOf(P[v], P[v + 1], P[v + 2]));
        wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        wg.computeVertexNormals();
        const m = new THREE.Mesh(wg, mat);
        m.userData.noPaint = true;
        return m;
      };
      // side faces: the hedges' cliff, all the way up to the hedge top (they stay after the road is redrawn)
      const SP: number[] = [];
      const N = 8;
      for (let k = 0; k < N; k++) {
        const za = gp.z0 + ((gp.z1 - gp.z0) * k) / N, zb = gp.z0 + ((gp.z1 - gp.z0) * (k + 1)) / N;
        for (const [x, out] of [[gp.x0 + 0.02, -0.4], [gp.x1 - 0.02, 0.4]]) {
          const ta = G(x + out, za) + 0.01, tb = G(x + out, zb) + 0.01;
          quad(SP, [x, ta, za], [x, tb, zb], [x, ry(zb) - DEPTH, zb], [x, ry(za) - DEPTH, za]);
        }
      }
      const sides = mk(SP, cliffMat, (_x, y, z) => [z / 6, y / 6]);
      sides.name = `gap-sides-${i}`;
      root.add(sides); // not in the pit group: never hidden
      const EP: number[] = [];
      for (const z of [gp.z0 + 0.02, gp.z1 - 0.02]) quad(EP, [gp.x0, ry(z) + 0.01, z], [gp.x1, ry(z) + 0.01, z], [gp.x1, ry(z) - DEPTH, z], [gp.x0, ry(z) - DEPTH, z]);
      grp.add(mk(EP, wallMat, (x, y) => [x / 3, y / 3]));
      // the sky at the bottom (sloped like the road)
      const zc = (gp.z0 + gp.z1) / 2;
      const sky = new THREE.Mesh(new THREE.PlaneGeometry(gp.x1 - gp.x0, Math.hypot(gp.z1 - gp.z0, ry(gp.z1) - ry(gp.z0))), skyMat);
      sky.rotation.x = -Math.PI / 2 + Math.atan2(ry(gp.z0) - ry(gp.z1), gp.z1 - gp.z0);
      sky.position.set((gp.x0 + gp.x1) / 2, ry(zc) - DEPTH + 0.05, zc);
      sky.userData.noPaint = true;
      grp.add(sky);
      // torn paper lips over both cut ends (ragged inner edge)
      const LP: number[] = [];
      for (const [z, dir] of [[gp.z0, 1], [gp.z1, -1]] as [number, number][]) {
        const M = 14;
        for (let k = 0; k < M; k++) {
          const xa = gp.x0 + 0.25 + ((gp.x1 - gp.x0 - 0.5) * k) / M, xb = gp.x0 + 0.25 + ((gp.x1 - gp.x0 - 0.5) * (k + 1)) / M;
          const ia = 0.35 + 0.25 * Math.abs(Math.sin(k * 2.3 + i)), ib = 0.35 + 0.25 * Math.abs(Math.sin((k + 1) * 2.3 + i));
          const o = -0.3 * dir;
          const p = (x: number, dz: number) => [x, ry(z + dz) + 0.035, z + dz];
          LP.push(...p(xa, o), ...p(xb, o), ...p(xb, ib * dir), ...p(xa, o), ...p(xb, ib * dir), ...p(xa, ia * dir));
        }
      }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(LP, 3));
      lg.computeVertexNormals();
      const lip = new THREE.Mesh(lg, lipMat);
      lip.userData.noPaint = true;
      grp.add(lip);
      root.add(grp);
      gapPits.push(grp);
    }
  }
  const roadFilled = [false, false, false];
  const redrawn: { mesh: THREE.Mesh; t: number }[] = [];

  // ───────────── collectibles (all OPTIONAL — the story path never needs them) ─────────────
  const crowns: Crown[] = [];
  const crown = (id: string, x: number, y: number, z: number, hint: string) => {
    const c = new Crown(ctx, id, new THREE.Vector3(x, y, z), hint);
    crowns.push(c);
    return c;
  };
  crown('crown-chimney', 48.6, Y.roof + 2.25, -2.6, 'On a chimney above the rooftop');
  crown('crown-arch', 5, Y.hub + 6.3, -17.2, 'On a cliff ledge — up stairs nobody drew');
  const mailCrown = crown('crown-mailbox', -6.8, 0.8, 36, 'Something hungry swallowed it long ago');
  mailCrown.hidden = true;
  const benchCrown = crown('crown-bench', -6, Y.hub + 0.6, 19, 'Under something that would rather be walking');
  benchCrown.hidden = true;
  crown('crown-shelf', 7.6, 3.1, 34, 'On a shelf only an eye could see');
  const wallCrown = crown('crown-wall', -11, Y.hub + 0.8, -15.6, 'Wake the Sleepy Cliff');
  wallCrown.hidden = true;
  const gateCrown = crown('crown-gate', -45.5, Y.bastion + 0.8, -5, 'Give the Gatehouse its voice back');
  gateCrown.hidden = true;
  const nestCrown = crown('crown-nest', -21, Y.hub + 0.8, -6, 'Clear the grub nest');
  nestCrown.hidden = true;
  crown('crown-ledge', 50, Y.roof + 0.8, -8.6, 'Up on the workyard rooftop');
  crown('crown-island', gx(islandZ), Y.towpath + 1.3, islandZ, 'An island in the canal');
  const lampCrown = crown('crown-lamp', 47, Y.roof + 0.9, -2, 'Repaint the Peeping Lamp on the rooftop');
  lampCrown.hidden = true;
  const tagCrown = crown('crown-tag', -13.4, 0.8, 30, 'Fill in the crown graffiti');
  tagCrown.hidden = true;
  crown('crown-plateau', -6, Y.plateau + 0.8, -46, 'High in the upper town');
  // a chimney stub on the rooftop for the chimney crown
  solid(new THREE.Vector3(48.6, Y.roof + 0.85, -2.6), new THREE.Vector3(0.5, 0.85, 0.5), toon({ map: T('stone_cream') }), 0, 0.04);

  const drops: PaintDrop[] = [];
  const dropLine = (pts: number[][], color: string, lift = 0.6) =>
    pts.forEach(([x, z, y], i) => {
      const d = new PaintDrop(ctx, `drop-${drops.length}-${i}`, new THREE.Vector3(x, (y ?? G(x, z)) + lift, z), color);
      drops.push(d);
      api.addEdible(d);
    });
  dropLine([[-2, 45], [-2, 42], [-2, 39], [-2, 33], [-2, 30]], PAL.cobalt);
  dropLine([[-6, 37.4, 1.05], [-7.6, 37.4, 1.05], [-6.8, 36.6, 1.05]], PAL.yellow); // on the undrawn lesson step
  dropLine([[-2 + 4, 4], [-2, 8], [-2 - 4, 4], [-2, 0]], PAL.hotpink);
  dropLine([[gx(20) + 6, 22], [gx(20) + 6, 26], [gx(20) + 6, 30], [gx(20) + 6, 34]], PAL.turq);
  dropLine([[-48, 6], [-48, 2], [-46, -1]], PAL.pink);
  dropLine([[21, 20], [21, 16], [21, 12], [21, 9]], PAL.orange);
  dropLine([[44, -3, Y.roof], [46, -5, Y.roof], [48, -7, Y.roof]], PAL.yellow);
  dropLine([[12, -20], [12, -22], [18, -32], [18, -28], [24, -22], [24, -34]], PAL.cobalt);
  dropLine([[-4, -38], [4, -38], [-14, -30]], PAL.hotpink);

  const checkpoints: Checkpoint[] = [
    new Checkpoint(ctx, 'cp-harbor', at(2, 40), Math.PI),
    new Checkpoint(ctx, 'cp-hub', at(2, 13), Math.PI),
    new Checkpoint(ctx, 'cp-yard', at(26, 2), Math.PI / 2),
    new Checkpoint(ctx, 'cp-roof', new THREE.Vector3(44, Y.roof, -3), 0),
    new Checkpoint(ctx, 'cp-quay', at(-45, 15), Math.PI),
    new Checkpoint(ctx, 'cp-road', at(12, -16), Math.PI),
    new Checkpoint(ctx, 'cp-summit', at(0, -31), Math.PI),
  ];

  // ───────────── decoration ─────────────
  addBunting(root, new THREE.Vector3(-14, 8, 30), new THREE.Vector3(8.5, 8.5, 33));
  addBunting(root, new THREE.Vector3(-19.5, 8.5, -9), new THREE.Vector3(12, 7, 15));
  addBunting(root, new THREE.Vector3(-20, 8, 14), new THREE.Vector3(10, 9, 16));
  addBunting(root, new THREE.Vector3(30, 9, 4), new THREE.Vector3(48, 9, 4));
  addBunting(root, new THREE.Vector3(-8, Y.plateau + 6, -34), new THREE.Vector3(8, Y.plateau + 6, -34));
  const fe = decal(T('floor_eye'), 3.4, 3.4, 0.8);
  fe.rotation.x = -Math.PI / 2;
  fe.position.set(-9, Y.hub + 0.03, 10);
  root.add(fe);
  const fe2 = decal(T('floor_eye'), 2.6, 2.6, 0.7);
  fe2.rotation.x = -Math.PI / 2;
  fe2.rotation.z = 0.6;
  fe2.position.set(7, Y.hub + 0.03, -6);
  root.add(fe2);
  for (const [bx, bz] of [[-6, 22.5], [2, 22.5], [-12, 14], [10, 9], [10, -4], [-16, -6], [-13, -15]] as [number, number][]) {
    const gy = G(bx, bz);
    const b = paintedMesh(new THREE.CylinderGeometry(0.26, 0.3, 0.95, 10), toon({ map: T('metal_dark'), color: '#ffd0c0' }), 0.03);
    b.position.set(bx, gy + 0.475, bz);
    const cap = paintedMesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), toon({ color: PAL.red }), 0.02);
    cap.position.y = 0.47;
    b.add(cap);
    root.add(b);
    physics.addStaticCylinder(new THREE.Vector3(bx, gy + 0.55, bz), 0.55, 0.3);
  }
  // rocks, crags, mesas, shrubs, story props and every grass tuft (merged, tiled; see Dressing.ts)
  const dressing = dressIsland(ctx, G);
  for (let i = 0; i < 70; i++) {
    const gx2 = -28 + ((i * 37) % 80);
    const gz2 = -55 + ((i * 53) % 100);
    const x = gx2 + Math.sin(i) * 0.8, z = gz2 + Math.cos(i * 1.7) * 0.8;
    const y0 = G(x, z);
    if (y0 < -1) continue;
    dressing.tuft(x, y0, z, 0.35 + (i % 3) * 0.12);
  }
  dressing.flush();
  // grub nest (eraser crumbs) in the hub's north-west corner
  const nestAt = at(-21, -6);
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), toon({ color: i % 2 ? '#ff9ec4' : '#ffc6dc' }));
    c.position.set(nestAt.x + (Math.random() - 0.5) * 2, nestAt.y + 0.15, nestAt.z + (Math.random() - 0.5) * 2);
    c.rotation.y = Math.random() * 3;
    root.add(c);
  }
  buildDistant(ctx);

  // ───────────── graffiti tag spots (what you paint becomes real) ─────────────
  const paintedGazers: BuiltLevel['paintedGazers'] = [];
  const tags: TagSpot[] = [];
  // ladder up the rooftop building's front (it faces −x)
  const ladderTag = new TagSpot(ctx, 'tag-ladder', new THREE.Vector3(41.55, Y.terrace + 2.4, -7.2), new THREE.Vector3(-1, 0, 0), 1.6, 3.4, 'ladder', 60);
  // it pops out as one straight flight of wooden steps beside the art, running east into the roof's edge
  // (the old three rungs zigzagged up the wall: the third hung over the first and WAI's head hit it)
  ladderTag.onDone = () => {
    const rungMat = toon({ map: T('wood'), color: PAL.orange });
    for (const b of jumpFlight(new THREE.Vector3(41.9, Y.terrace, -5.3), Math.PI / 2, Y.roof).blocks) {
      solid(b.center, b.half, rungMat, b.yaw, 0.03);
      ctx.effects.burst(b.center.clone().setY(b.center.y + b.half.y), PAL.orange, 10, 3);
    }
    ctx.events.emit('toast', { text: t('The painted ladder became REAL! Hop up the steps.'), kind: 'good' });
  };
  tags.push(ladderTag);
  const crownTag = new TagSpot(ctx, 'tag-crown', new THREE.Vector3(-14.95, 3.0, 30), new THREE.Vector3(1, 0, 0), 2.0, 1.4, 'crown', 50);
  crownTag.onDone = () => {
    tagCrown.hidden = false;
    ctx.events.emit('toast', { text: t('Your graffiti crown pops off the wall — it’s real!'), kind: 'good' });
  };
  tags.push(crownTag);
  const eyeTag = new TagSpot(ctx, 'tag-eye', new THREE.Vector3(8.2, Y.hub + 3.4, -17.6), new THREE.Vector3(0, 0, 1), 2.2, 1.4, 'eye', 55);
  eyeTag.onDone = () => {
    // it stares at the middle of the sky stairs; 42° each way takes in the whole flight
    const eyeAt = new THREE.Vector3(8.2, Y.hub + 3.4, -17.3);
    const mid = skyFlight.blocks[Math.floor(skyFlight.blocks.length / 2)].center;
    paintedGazers.push({ origin: eyeAt, dir: mid.clone().sub(eyeAt).normalize(), range: 20, cosHalf: Math.cos((42 * Math.PI) / 180), sourceId: 'painted-eye' });
    ctx.events.emit('toast', { text: t('Your painted eye OPENS — and it can see the stairs nobody drew!'), kind: 'good' });
  };
  tags.push(eyeTag);

  const R = (name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  const regions: Region[] = [
    R('The Harbor', -14, -2, 26, 8, 20, 58),
    R('Blind Plaza', -29, -1, -18, 19, 30, 26),
    R('Canal Gorge', -42, -6, -18, -28, 30, 44),
    R('Gatehouse Bastion', -60, -2, -18, -42, 30, 40),
    R('The Workyard', 19, 3, -10, 58, 8.5, 40),
    R('The Rooftop', 40, 8.5, -12, 52, 30, 2),
    R('Switchback Road', 8, -1, -40, 28, 30, -18),
    R('Upper Town', -40, 10, -58, 8, 30, -18),
    R('The Summit', -10, 13, -55, 10, 30, -33),
  ];

  // the second district (opened by the Gatehouse's redrawn road): built before the ink merge
  const quarter = buildQuarter(ctx, api, { G, crowns, drops, checkpoints, eyeSpots });
  regions.unshift(...quarter.regions);

  mergeStaticInk(ctx.root);
  Quality.trimCasters(ctx.root);
  return {
    quarter,
    hosts,
    crowns,
    drops,
    checkpoints,
    rubble,
    bridge,
    islandPath,
    skyStair,
    shelf,
    regions,
    tags,
    paintedGazers,
    benchCrown,
    eyeSpots,
    groundAt: G,
    perches: [at(-8, 14), at(6, -10), at(3, 42), new THREE.Vector3(-6, Y.plateau, -40), at(-46, 26), at(36, 24), at(-14, -2), new THREE.Vector3(4, Y.summit, -40), at(26, -2), at(-40, 6)],
    springSpots: [
      { pos: at(4.6, 38), target: new THREE.Vector3(7.4, 2.6, 34.4) }, // harbor → the orange shelf crown
      { pos: at(6.6, -13), target: new THREE.Vector3(5, Y.hub + 5.8, -17.1) }, // hub → the cliff ledge crown
      { pos: at(16.5, -6), target: new THREE.Vector3(25, Y.terrace, -6) }, // hub → workyard shortcut
      { pos: new THREE.Vector3(gx(30) + 6, Y.towpath, 30), target: new THREE.Vector3(-26.5, Y.hub, 25) }, // towpath → back up
      ...quarter.springs, // the quarter's East Walk → over the red barricade into Inkwell Square
    ],
    spawns: {
      mutant: at(40, 12),
      lamp: new THREE.Vector3(47, Y.roof, -3.5),
      starterLamp: at(7, 18),
      chomper: at(-47, 10),
      grubs: [at(4, -8), at(-14, -2), at(-48, 4), at(-49, 22)],
      nest: nestAt,
      eraser: new THREE.Vector3(SUMMIT.x, Y.summit, SUMMIT.z - 3),
    },
    scaffoldPos,
    roadGapCenter: gapCenter,
    redrawRoad(i: number) {
      const c = gapCenter(i);
      if (roadFilled[i]) return c;
      roadFilled[i] = true;
      const g = GAPS[i];
      const l = LEGS[i];
      const len = g.z1 - g.z0;
      const slope = Math.atan2(l.y1 - l.y0, Math.abs(l.z1 - l.z0)) * Math.sign(l.z0 - l.z1);
      const tex = T('terrace').clone();
      tex.needsUpdate = true;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, len / 2.5);
      const m = paintedMesh(new THREE.BoxGeometry(g.x1 - g.x0, 0.6, len + 0.3), toon({ map: tex, color: '#fff2c8' }), 0.04);
      m.position.copy(c).add(new THREE.Vector3(0, -0.26, 0));
      m.rotation.x = slope;
      m.scale.set(1, 1, 0.001);
      root.add(m);
      redrawn.push({ mesh: m, t: 0 });
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), slope);
      physics.addStaticBox(c.clone().add(new THREE.Vector3(0, -0.3, 0)), new THREE.Vector3((g.x1 - g.x0) / 2, 0.3, len / 2 + 0.15), q);
      gapMarks[i].visible = false;
      gapPits[i].visible = false;
      ctx.audio.play('reveal', { pos: c, vol: 1 });
      ctx.audio.play('purifyDone', { pos: c });
      for (const col of ['#ffd23a', '#ff4fa3', '#22c4c0']) ctx.effects.burst(c, col, 14, 5, 0.08);
      return c;
    },
    wakeWallFacade() {
      const t2 = T('facade_awake').clone();
      t2.needsUpdate = true;
      t2.wrapS = THREE.RepeatWrapping;
      t2.repeat.set(2, 1);
      faceMats[4] = toon({ map: t2 });
      faceSlab.material = faceMats;
    },
    lockArena(on: boolean) {
      if (on === arenaLocked) return;
      arenaLocked = on;
      if (on) {
        // invisible rim: you can't be knocked (or jump) off the summit mid-fight
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2;
          const x = SUMMIT.x + Math.cos(a) * (SUMMIT.r - 0.3), z = SUMMIT.z + Math.sin(a) * (SUMMIT.r - 0.3);
          arenaColliders.push(physics.addStaticBox(new THREE.Vector3(x, Y.summit + 2.4, z), new THREE.Vector3(0.95, 2.4, 0.3), -a + Math.PI / 2, 'barrier'));
        }
        // the south gap fills with a heap of eraser crumbs (visible: you know you're locked in)
        crumbWall.visible = true;
        crumbT = 0;
        ctx.audio.play('stomp', { pos: crumbWall.position, pitch: 0.7 });
      } else {
        for (const c of arenaColliders) {
          physics.untag(c);
          physics.world.removeCollider(c, false);
        }
        arenaColliders.length = 0;
        crumbT = -1;
        ctx.effects.burst(crumbWall.position.clone().setY(crumbWall.position.y + 1), '#ffc6dc', 24, 4, 0.1);
        crumbWall.visible = false;
      }
    },
    openArchDoor() {
      if (doorT >= 0) return;
      doorT = 0;
      physics.untag(doorCollider);
      physics.world.removeCollider(doorCollider, false);
      ctx.audio.play('gateOpen', { pos: door.position });
    },
    lowerDrawbridge() {
      if (bridgeT >= 0) return;
      bridgeT = 0;
      ctx.audio.play('gateOpen', { pos: dbMid });
    },
    collapseScaffold() {
      if (scaffoldDown) return false;
      scaffoldDown = true;
      physics.untag(scaffoldCollider);
      physics.world.removeCollider(scaffoldCollider, false);
      // ramp from the terrace up to the rooftop edge (the building's front is at x≈41.6)
      const a = new THREE.Vector3(35.2, Y.terrace, -2.5);
      const b = new THREE.Vector3(41.7, Y.roof + 0.05, -2.5);
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), b.clone().sub(a).normalize());
      ramp = paintedMesh(new THREE.BoxGeometry(len, 0.2, 2.6), toon({ map: T('wood') }), 0.03);
      ramp.position.copy(mid);
      ramp.quaternion.copy(qq);
      root.add(ramp);
      const rc = RAPIER.ColliderDesc.cuboid(len / 2, 0.1, 1.3).setTranslation(mid.x, mid.y, mid.z).setRotation({ x: qq.x, y: qq.y, z: qq.z, w: qq.w });
      physics.tag(physics.world.createCollider(rc), 'static');
      ctx.audio.play('crash', { pos: scaffoldPos });
      ctx.audio.play('crumble', { pos: scaffoldPos });
      ctx.effects.burst(scaffoldPos.clone().add(new THREE.Vector3(0, 2, 0)), '#c9a27a', 30, 6, 0.1);
      scaffold.visible = false;
      ctx.events.emit('toast', { text: t('The scaffold collapsed into a ramp up to the roof!'), kind: 'good' });
      return true;
    },
    update(dt, camPos) {
      time += dt;
      if (crumbT >= 0 && crumbT < 1) {
        // the crumbs heave up out of the ground with a little overshoot
        crumbT = Math.min(1, crumbT + dt * 2.2);
        const k = crumbT;
        crumbWall.position.y = Y.summit - 2.2 * (1 - k) + Math.sin(k * Math.PI) * 0.25;
      }
      for (const a of anims) a(dt, time);
      quarter.update(dt);
      for (const c of crowns) c.update(dt, camPos);
      for (const tg of tags) tg.update(dt);
      if (doorT >= 0 && doorT < 1) {
        doorT = Math.min(1, doorT + dt * 0.6);
        door.position.y = towerAt.y + 2.8 - doorT * 5.7;
      }
      if (bridgeT >= 0 && bridgeT < 1) {
        bridgeT = Math.min(1, bridgeT + dt * 0.7);
        bridgePivot.rotation.z = THREE.MathUtils.lerp(Math.PI / 2.1, dbSlope, bridgeT);
        if (bridgeT >= 1) bridgeCollider.setEnabled(true);
      }
      // freshly redrawn road unrolls along its length
      for (const r of redrawn) {
        if (r.t >= 1) continue;
        r.t = Math.min(1, r.t + dt * 1.3);
        const k = 1 - Math.pow(1 - r.t, 3);
        r.mesh.scale.set(1, 1, Math.max(0.001, k));
      }
      gag.visible = !hosts.gatehouse.has('MOUTH');
    },
  };
}

export function makeCrown(size: number, color: string, assets?: AssetManager): THREE.Object3D {
  return crownModel(assets, size, color);
}

function addBunting(root: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3): void {
  const n = 16;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(t * Math.PI) * 1.2;
    pts.push(p);
  }
  root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: PAL.black })));
  const cols = [PAL.red, PAL.yellow, PAL.turq, PAL.pink, PAL.cobalt, PAL.orange].map((c) => new THREE.Color(c));
  // all flags of one string: a single vertex-coloured mesh (was one draw call per flag)
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
  root.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
}

/** Far away: other torn canvas islands drifting in the sky, and the Correction Tower (next level). */
function buildDistant(ctx: GameContext): void {
  const { root, assets } = ctx;
  // the floating mesas, far architecture, outcrops and lavender live in Landscape.ts
  const tower = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 42, 10), toon({ map: assets.tex('stone_purple') }));
  shaft.position.y = 21;
  addOutline(shaft, 0.25);
  const cr = makeCrown(11, PAL.yellow, assets);
  cr.position.y = 43;
  tower.add(shaft, cr);
  tower.position.set(30, 0, -190);
  root.add(tower);
  buildLandscape(ctx, tower);
}
