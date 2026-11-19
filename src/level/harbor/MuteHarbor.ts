import * as THREE from 'three';
import { ni } from '../../render/geom';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RAPIER } from '../../core/PhysicsWorld';
import type { GameContext } from '../../core/Context';
import type { AssetManager } from '../../core/AssetManager';
import { Quality } from '../../render/Quality';
import { PAL, facadeCanvas, labelCanvas, toTexture, type FacadeKind } from '../../render/PaintTextures';
import { addOutline, mergeStaticInk, decal, paintedMesh, toon, wonkyBox } from '../../render/Materials';
import type { HostDef, OrganHost } from '../../hosts/OrganHost';
import type { UndrawnSolid } from '../../hosts/Undrawn';
import type { Edible } from '../../hosts/Edible';
import { Checkpoint, Crown, PaintDrop, TagSpot } from '../Collectibles';
import { wonkyBuilding, type WonkyBuilt } from '../WonkyBuilding';
import type { Region } from '../BlindPlaza';
import type { SpringSpot } from '../Ambient';
import { makeCrown } from '../BlindPlaza';
import type { Shoutable } from './Shout';
import { t } from '../../i18n';
import { buildHarborLandscape } from '../Landscape';
import {
  ARENA, BELL_BRIDGE_Z, CHANNELS, DUSK, HY, LIGHTHOUSE, PONTOON_Z, SQUARE, buildHarborTerrain, channelX, harborHeight, jettyStair, onHarbor, waterDepth,
} from './HarborTerrain';
import { StaticBatch, bunting, dropFlatInk, ensureKitTextures, tube } from './HarborKit';
import { buildClockTower } from './ClockTower';
import { lighthouseHorn, paperBoatColliders, paperBoatModel } from './HarborArt';
import { buildLantern } from './LanternRoom';
import {
  barrelGeo, bridgeDeckGeo, buildBigAwning, buildBridgeFrame, buildBridgePiers, buildFerry, buildGateArch, buildGateBell, buildStairParapet, buildStall,
  buildBuoy, buildSailBoat, canopyGeos, dressLighthouse, harborMats, lighthouseShaftMat, portcullisGeo, resetHarborMats,
} from './HarborModels';

/**
 * [INPUT]: depends on HarborTerrain (heights, zones), HarborModels (set-piece visuals + the ferry's and the lost boats' solid shapes),
 *          HarborArt (the lighthouse's Tripo foghorn, the exit paper boat and its solids), LanternRoom (the lamp room's
 *          glazing, lens and doodle eyes),
 *          HarborKit, ClockTower, WonkyBuilding, Collectibles, PhysicsWorld (static boxes and hulls)
 * [OUTPUT]: exports HARBOR (layout), buildMuteHarbor(), harborTitlePose(), ensureTextures() and the
 *           HarborBuilt / LevelApi / Fork types
 * [POS]: level 2's geometry and colliders; HarborSession builds it, BandstandPier adds the second district.
 *        Colliders live here, made from the drawn shapes, so feet rest on what is drawn.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 *
 * MUTE HARBOR — level 2. A harbour town at dusk on the next torn piece of canvas.
 * The Eraser's crumbs drifted out to sea and grew into THE HUSH, which ate every sound:
 * bells, gulls, the ferry's foghorn, the lighthouse's song. Ships can't find their way home
 * and the town's faces can't speak (their mouths are rubbed out).
 *
 *   pier (arrival door) → landing (Chomper Bin: MOUTH) → BELL GATE (shout!) → market quay
 *     → FOGHORN FERRY (lend the Mouth)       → the lost boats come home and moor across the west channel: hop deck to deck
 *     → old town → grand stair → CLOCK SQUARE (make the 3 tuning forks hum together) → the bell rings
 *     → BELL BRIDGE drops over the north channel → headland → LIGHTHOUSE (big shout ×2) → it sings
 *     → THE HUSH rises → arena on the headland → paper boat at the jetty → exit
 *   Optional: east boardwalk (Peeping Lamp: EYE, echo grotto, net-shed moth nest, sea stack), lagoon buoy,
 *   mailbox, rooftops.
 */
export const HARBOR = {
  spawn: new THREE.Vector3(2, HY.quay + 0.13, 47.5),
  spawnYaw: Math.PI,
  killY: -14,
  arena: new THREE.Vector3(ARENA.x, HY.headland, ARENA.z),
  arenaR: ARENA.r,
  /** The paper boat's deck at the jetty (after the Hush is repainted). */
  completeTrigger: new THREE.Box3(new THREE.Vector3(channelX(CHANNELS.mouth, ARENA.z) - 0.7, -0.5, ARENA.z - 3.2), new THREE.Vector3(channelX(CHANNELS.mouth, ARENA.z) + 3, 4.5, ARENA.z + 3.2)),
  /** Out at sea in the fog, north of the island: where the Hush waits. */
  hushAtSea: new THREE.Vector3(10, 9, -82),
  hushOverHead: new THREE.Vector3(ARENA.x, HY.headland + 3, ARENA.z - 4),
};

/** The title-screen drift over the harbour (dusk, the lighthouse and the Hush in the fog). */
export function harborTitlePose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
  const sx = Math.sin(time * 0.16);
  const sy = Math.sin(time * 0.23 + 1.3);
  return {
    // from above the landing, over the market gate: the quay, the lagoon, the lighthouse on its headland
    pos: new THREE.Vector3(-4 + sx * 1.4, 17 + sy * 0.25, 52 - sx * 0.4),
    look: new THREE.Vector3(6 + sx * 0.8, 3 + sy * 0.3, -36),
    fov: 52 + Math.sin(time * 0.11) * 1.2,
  };
}

export interface LevelApi {
  addHost(def: HostDef): OrganHost;
  addUndrawn(id: string, center: THREE.Vector3, half: THREE.Vector3, yaw?: number, color?: string): UndrawnSolid;
  addEdible(e: Edible): void;
}

export interface Fork {
  pos: THREE.Vector3;
  humT: number;
  root: THREE.Group;
  prongs: THREE.Mesh[];
  glow: THREE.Mesh;
}

export interface HarborBuilt {
  hosts: Record<string, OrganHost>;
  crowns: Crown[];
  /** Crowns the session reveals (story / secrets). */
  special: { nest: Crown; mail: Crown; ferry: Crown };
  /** True-Sight steps up the sea stack. */
  undrawnSteps: UndrawnSolid[];
  drops: PaintDrop[];
  checkpoints: Checkpoint[];
  regions: Region[];
  tags: TagSpot[];
  paintedGazers: { origin: THREE.Vector3; dir: THREE.Vector3; range: number; cosHalf: number; sourceId: string }[];
  eyeSpots: WonkyBuilt['eyeSpots'];
  perches: THREE.Vector3[];
  springSpots: SpringSpot[];
  shoutables: Shoutable[];
  forks: Fork[];
  spawns: {
    chomper: THREE.Vector3;
    lamp: THREE.Vector3;
    moths: { pos: THREE.Vector3; group: string; alt?: number }[];
    grubs: THREE.Vector3[];
  };
  groundAt(x: number, z: number): number;
  /** Positions for the story camera / guide. */
  spots: {
    door: THREE.Vector3;
    gateBell: THREE.Vector3;
    ferry: THREE.Vector3;
    pontoon: THREE.Vector3;
    pontoonWest: THREE.Vector3;
    pontoonEast: THREE.Vector3;
    /** The moored boats' deck tops, market side first (the crossing's stepping stones). */
    decks: THREE.Vector3[];
    stairBottom: THREE.Vector3;
    stairTop: THREE.Vector3;
    bell: THREE.Vector3;
    clockFace: THREE.Vector3;
    bridge: THREE.Vector3;
    bridgeWest: THREE.Vector3;
    bridgeEast: THREE.Vector3;
    cocoon: THREE.Vector3;
    spiralStart: THREE.Vector3;
    lamp: THREE.Vector3;
    lampOut: THREE.Vector3;
    jetty: THREE.Vector3;
    boat: THREE.Vector3;
  };
  /** Helix of the lighthouse stair: point at parameter k (0 bottom → 1 gallery). */
  spiralAt(k: number): THREE.Vector3;
  spiralParam(p: THREE.Vector3): number;
  readonly gateOpen: boolean;
  readonly cocoonBurst: boolean;
  readonly bridgeDown: boolean;
  /** The lost boats are moored across the west channel and their decks are solid (the crossing is open). */
  readonly pontoonReady: boolean;
  openArrivalDoor(): void;
  closeArrivalDoor(): void;
  openGate(): void;
  bringBoats(): void;
  lowerBellBridge(): void;
  ringClockBell(): void;
  burstCocoon(): void;
  lightLighthouse(): void;
  lockArena(on: boolean): void;
  bringExitBoat(): void;
  /** The paper boat that takes WAI on (story/LevelOutro sails it away after the level is complete). */
  readonly exitBoat: THREE.Object3D;
  /** District lights (lantern strings): 'market' | 'old' | 'head' | 'all'. */
  lightUp(district: string): void;
  /** The town finds its voice: the rubbed-out mouths come back. */
  wakeTown(): void;
  update(dt: number, camPos: THREE.Vector3): void;
}

// ───────────── textures (made once, cached in the asset manager) ─────────────
const FACADES: [string, number, FacadeKind, string, string[]][] = [
  ['h2_teeth', 61, 'teeth', DUSK.teal, [DUSK.neon, DUSK.peach, DUSK.indigo]],
  ['h2_nose', 67, 'nose', DUSK.coral, [DUSK.indigo, DUSK.neon, DUSK.lamp]],
  ['h2_cyclops', 71, 'cyclops', DUSK.indigo, [DUSK.teal, DUSK.neon, DUSK.peach]],
  ['h2_sleepy', 73, 'sleepy', DUSK.lilac, [DUSK.neon, DUSK.teal, DUSK.coral]],
  ['h2_crowns', 79, 'crowns', DUSK.neon, [DUSK.indigo, DUSK.lamp, DUSK.teal]],
  ['h2_plain', 83, 'plain', DUSK.deepTeal, [DUSK.coral, DUSK.lilac, DUSK.lamp]],
];

/** The Hush rubbed the faces' mouths out: a grey eraser smear over the lower half, "shh…" scribbled on it. */
function muteCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  const W = c.width;
  g.save();
  g.globalAlpha = 0.86;
  g.fillStyle = '#cfc8e2';
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(W * (0.12 + i * 0.1), W * (0.66 + Math.sin(i * 1.7) * 0.04), W * 0.13, W * 0.11, Math.sin(i) * 0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(120,110,170,0.6)';
  g.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    g.beginPath();
    const y = W * (0.56 + (i / 14) * 0.24);
    g.moveTo(W * 0.06, y);
    g.lineTo(W * 0.94, y + Math.sin(i) * 6);
    g.stroke();
  }
  g.fillStyle = '#5a4bd1';
  g.font = `bold ${Math.round(W * 0.09)}px "Marker Felt", "Comic Sans MS", sans-serif`;
  g.textAlign = 'center';
  g.fillText('shh…', W * 0.5, W * 0.72);
  g.restore();
  return c;
}

function duskSkyCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 512;
  const g = c.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#120c3a');
  gr.addColorStop(0.28, '#2c1f78');
  gr.addColorStop(0.46, '#6a3aa8');
  gr.addColorStop(0.56, '#d1508f');
  gr.addColorStop(0.64, '#ff7a6b');
  gr.addColorStop(0.72, '#ffb38a');
  gr.addColorStop(1, '#6a5fb8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 512);
  return c;
}

/** Dusk boardwalk planks: calm mauve boards, inked gaps, a few paint flecks (the shared wood is too loud here). */
function plankCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  let s = 13;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const tones = ['#a77a92', '#946a84', '#b48aa0', '#9c7290', '#a98096'];
  for (let i = 0; i < 8; i++) {
    g.fillStyle = tones[i % tones.length];
    g.fillRect(0, i * 32, 256, 32);
    // grain
    g.strokeStyle = 'rgba(60,30,60,0.18)';
    g.lineWidth = 1.5;
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      const y = i * 32 + 6 + k * 6 + r() * 3;
      g.moveTo(0, y);
      for (let x = 0; x <= 256; x += 32) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 1.5);
      g.stroke();
    }
    // the gap + a butt joint per board
    g.fillStyle = '#3a2440';
    g.fillRect(0, i * 32 + 30, 256, 2);
    const jx = (i * 97) % 256;
    g.fillRect(jx, i * 32, 2, 30);
    g.fillStyle = '#2a1830';
    for (const nx of [jx - 6, jx + 8]) {
      g.beginPath();
      g.arc(nx, i * 32 + 15, 1.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // paint flecks
  for (let i = 0; i < 14; i++) {
    g.fillStyle = ['#1fb5b0', '#ff7a6b', '#ffe08a', '#ff3fa4'][i % 4];
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 1.5 + r() * 3.5, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  return c;
}

export function ensureTextures(assets: AssetManager): void {
  if (assets.textures.has('h2_teeth')) return;
  const planks = toTexture(plankCanvas());
  planks.name = 'h2_planks';
  assets.textures.set('h2_planks', planks);
  for (const [name, seed, kind, base, acc] of FACADES) {
    const c = facadeCanvas(seed, kind, base, acc);
    const t1 = toTexture(c);
    t1.name = name;
    assets.textures.set(name, t1);
    const t2 = toTexture(muteCanvas(c));
    t2.name = `${name}_mute`;
    assets.textures.set(`${name}_mute`, t2);
  }
  const sky = toTexture(duskSkyCanvas());
  sky.wrapS = sky.wrapT = THREE.ClampToEdgeWrapping;
  sky.name = 'h2_sky';
  assets.textures.set('h2_sky', sky);
}

// ───────────── the level ─────────────
export function buildMuteHarbor(ctx: GameContext, api: LevelApi): HarborBuilt {
  const { root, physics, assets } = ctx;
  ensureTextures(assets);
  ensureKitTextures(assets);
  resetHarborMats();
  const KM = harborMats(assets);
  const T = (n: string) => assets.tex(n);
  const anims: ((dt: number, time: number) => void)[] = [];
  let time = 0;

  // ───────────── dusk light, sky, fog ─────────────
  root.add(new THREE.HemisphereLight('#a99cff', '#ff8f86', 1.35));
  root.add(new THREE.AmbientLight('#ffe6f0', 0.32));
  const sun = new THREE.DirectionalLight('#ffb48a', 2.0);
  sun.position.set(-70, 34, 22);
  sun.target.position.set(0, 0, -5);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { near: 1, far: 200 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  Quality.setSun(sun);
  ctx.scene.fog = new THREE.Fog('#8a6fc0', 80, 230);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.MeshBasicMaterial({ map: T('h2_sky'), side: THREE.BackSide, fog: false, depthWrite: false })));
  // the setting sun: a fat coral disc low in the west, a halo around it
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ color: '#ffcf8a', fog: false, depthWrite: false }));
  sunDisc.position.set(-250, 18, 90);
  sunDisc.lookAt(0, 10, 0);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(30, 40), new THREE.MeshBasicMaterial({ color: '#ff7a6b', fog: false, depthWrite: false, transparent: true, opacity: 0.35 }));
  halo.position.copy(sunDisc.position).multiplyScalar(1.01);
  halo.lookAt(0, 10, 0);
  root.add(halo, sunDisc);
  // stars in the indigo half of the sky
  {
    const P: number[] = [];
    let s = 5;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2, e = 0.35 + r() * 1.1;
      P.push(Math.cos(a) * Math.cos(e) * 280, Math.sin(e) * 280, Math.sin(a) * Math.cos(e) * 280);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#fff4d6', size: 1.6, sizeAttenuation: false, fog: false, depthWrite: false }));
    root.add(stars);
  }
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 24; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T(i % 2 ? 'cloud_a' : 'cloud_b'), fog: false, transparent: true, depthWrite: false, color: i % 3 === 0 ? '#ffb3c8' : i % 3 === 1 ? '#b8a8ff' : '#ff9e8a' }));
    const a = (i / 24) * Math.PI * 2;
    const low = i % 3 === 0;
    const r = low ? 34 + (i % 5) * 14 : 115 + (i % 4) * 20;
    s.position.set(Math.cos(a) * r, low ? -22 - (i % 4) * 5 : 30 + (i % 3) * 14, Math.sin(a) * r);
    s.scale.set(low ? 64 : 52, low ? 26 : 22, 1);
    root.add(s);
    clouds.push(s);
  }
  anims.push((dt) => clouds.forEach((c, i) => (c.position.x += dt * (0.4 + (i % 3) * 0.25))));
  // the sea fog where the lost ships drift (south-west and north): soft lilac banks
  const fogBanks: THREE.Sprite[] = [];
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T('cloud_a'), color: '#cdbff0', transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
    const north = i < 8;
    const k = north ? i : i - 8;
    s.position.set(north ? -30 + k * 10 : -40 - k * 6, -2 + (k % 3) * 1.5, north ? -78 - (k % 2) * 8 : 60 + k * 5);
    s.scale.set(34, 12, 1);
    root.add(s);
    fogBanks.push(s);
  }
  anims.push((_dt, tt) => fogBanks.forEach((f, i) => (f.position.y = -2 + (i % 3) * 1.5 + Math.sin(tt * 0.3 + i) * 0.6)));

  // ───────────── the island ─────────────
  const terrain = buildHarborTerrain(ctx);
  const G = terrain.groundAt;
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, G(x, z) + dy, z);
  const eyeSpots: WonkyBuilt['eyeSpots'] = [];
  const muted: { mat: THREE.MeshToonMaterial; to: THREE.Texture }[] = [];
  const footMin = (x: number, z: number, w: number, d: number) => Math.min(G(x - w / 2, z - d / 2), G(x + w / 2, z - d / 2), G(x - w / 2, z + d / 2), G(x + w / 2, z + d / 2), G(x, z));
  const house = (x: number, z: number, w: number, d: number, h: number, yaw: number, facade: string, side: string, opts: { eyes?: boolean; mute?: boolean; seed?: number; flatRoof?: boolean; door?: boolean } = {}) => {
    const mute = opts.mute ?? true;
    const seed = opts.seed || Math.floor(x * 31 + z * 17);
    const roofColor = ['#ff7a6b', '#1fb5b0', '#6a5be0', '#ff4fa8', '#2b8fb8', '#ffb38a'][seed % 6]; // tiles are tinted from a neutral base now
    const b = wonkyBuilding(ctx, { x, z, w, d, h, yaw, ground: footMin(x, z, w * 1.1, d * 1.1), facade: mute ? `${facade}_mute` : facade, side, eyes: opts.eyes, seed, flatRoof: opts.flatRoof, door: opts.door, roofColor });
    eyeSpots.push(...b.eyeSpots);
    if (mute) {
      const mats = b.front.material as THREE.MeshToonMaterial[];
      const front = mats[4];
      const to = T(facade).clone();
      to.needsUpdate = true;
      to.wrapS = to.wrapT = THREE.RepeatWrapping;
      to.repeat.copy(front.map!.repeat);
      muted.push({ mat: front, to });
    }
    return b;
  };
  const batch = new StaticBatch();
  /** A static solid box (batched visual + collider). */
  const solid = (c: THREE.Vector3, half: THREE.Vector3, mat: THREE.Material, yaw = 0, outline = 0.04) => {
    batch.box(c, half, mat, yaw, outline);
    physics.addStaticBox(c.clone(), half.clone(), yaw);
  };
  /** A sloped walkway (invisible ramp collider + its visual plank). */
  const ramp = (a: THREE.Vector3, b: THREE.Vector3, width: number, mat: THREE.Material | null, thick = 0.2) => {
    const along = b.clone().sub(a);
    const len = along.length();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), along.clone().normalize());
    // keep the plank's "up" as close to world up as possible (roll-free)
    const fwd = along.clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), fwd).normalize();
    const up = new THREE.Vector3().crossVectors(fwd, right).normalize();
    q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
    const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(up, -thick / 2);
    physics.addStaticBox(mid, new THREE.Vector3(width / 2, thick / 2, len / 2 + 0.03), q);
    if (mat) {
      const m = paintedMesh(new THREE.BoxGeometry(width, thick, len), mat, 0.03);
      m.position.copy(mid);
      m.quaternion.copy(q);
      root.add(m);
      return m;
    }
    return null;
  };

  const wood = toon({ map: T('h2_planks') });
  const darkWood = toon({ map: T('wood'), color: '#a77a8a' });
  const stoneCream = toon({ map: T('stone_cream'), color: '#e8dcff' });
  const brass = toon({ map: T('h2_p_brass') });
  const inkMat = toon({ color: '#2a2230' });

  const hosts: Record<string, OrganHost> = {};
  const H = (def: HostDef) => (hosts[def.id] = api.addHost(def));
  const shoutables: Shoutable[] = [];
  const crowns: Crown[] = [];
  const crown = (id: string, x: number, y: number, z: number, hint: string, hidden = false) => {
    const c = new Crown(ctx, id, new THREE.Vector3(x, y, z), hint);
    c.hidden = hidden;
    crowns.push(c);
    return c;
  };
  const reveal = (c: Crown) => {
    if (!c.hidden) return;
    c.hidden = false;
    ctx.effects.burst(c.pos, '#ffd23a', 16, 3);
  };

  // ───────────── arrival pier + the door from Blind Plaza ─────────────
  solid(new THREE.Vector3(2, HY.quay - 0.14, 52), new THREE.Vector3(3, 0.26, 5.6), wood, 0, 0.05);
  for (const [px, pz] of [[-0.6, 47.5], [4.6, 47.5], [-0.6, 57.2], [4.6, 57.2]]) {
    const far = pz > 50;
    const len = far ? 9 : 4;
    const post = paintedMesh(new THREE.CylinderGeometry(0.22, far ? 0.16 : 0.25, len, 8), darkWood, 0.03);
    post.position.set(px, HY.quay + 0.5 - len / 2, pz);
    root.add(post);
    physics.addStaticCylinder(new THREE.Vector3(px, HY.quay + 0.35, pz), 0.24, 0.24);
  }
  for (const [x0, y0, x1, y1] of [[-0.6, -0.4, 4.6, -5.4], [4.6, -0.4, -0.6, -5.4]]) {
    const a = new THREE.Vector3(x0, y0, 57.2), b = new THREE.Vector3(x1, y1, 57.2);
    const brace = paintedMesh(new THREE.BoxGeometry(0.16, a.distanceTo(b), 0.16), darkWood, 0.02);
    brace.position.copy(a).lerp(b, 0.5);
    brace.rotation.z = Math.atan2(-(b.x - a.x), b.y - a.y);
    root.add(brace);
  }
  // the doorway WAI steps out of: Blind Plaza's tower door, standing alone at the end of the pier
  const doorAt = new THREE.Vector3(2, HY.quay + 0.12, 55.6);
  const doorFrame = new THREE.Group();
  doorFrame.position.copy(doorAt);
  const frameMat = toon({ map: T('stone_purple'), color: '#c8b8ff' });
  for (const sx of [-1.55, 1.55]) {
    const post = paintedMesh(wonkyBox(0.5, 3.6, 0.6, 0.04, sx > 0 ? 3 : 4), frameMat, 0.04);
    post.position.set(sx, 1.8, 0);
    doorFrame.add(post);
  }
  const lintel = paintedMesh(wonkyBox(3.9, 0.55, 0.7, 0.05, 7), frameMat, 0.04);
  lintel.position.set(0, 3.85, 0);
  doorFrame.add(lintel);
  const dc = makeCrown(1.1, PAL.yellow, assets);
  dc.position.set(0, 4.3, 0);
  dc.rotation.z = -0.15;
  doorFrame.add(dc);
  // through the doorway: Blind Plaza's bright day sky (where WAI came from)
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.5), new THREE.MeshBasicMaterial({ map: T('sky'), fog: false }));
  portal.position.set(0, 1.78, 0.05);
  portal.rotation.y = Math.PI;
  doorFrame.add(portal);
  const portalBack = portal.clone();
  portalBack.rotation.y = 0;
  portalBack.position.z = -0.05;
  doorFrame.add(portalBack);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-1.3, 0, -0.12);
  const doorTex = new THREE.CanvasTexture(labelCanvas('◉ OPEN ◉', PAL.red, PAL.white, 256, 128));
  doorTex.colorSpace = THREE.SRGBColorSpace;
  const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.5, 0.16), [toon({ color: PAL.red }), toon({ color: PAL.red }), toon({ color: PAL.red }), toon({ color: PAL.red }), toon({ color: PAL.red }), toon({ map: doorTex })]);
  addOutline(doorPanel, 0.03);
  doorPanel.position.set(1.3, 1.78, 0);
  doorPivot.add(doorPanel);
  doorFrame.add(doorPivot);
  root.add(doorFrame);
  for (const sx of [-1.55, 1.55]) physics.addStaticBox(doorAt.clone().add(new THREE.Vector3(sx, 1.8, 0)), new THREE.Vector3(0.25, 1.8, 0.3));
  physics.addStaticBox(doorAt.clone().add(new THREE.Vector3(0, 1.8, -0.05)), new THREE.Vector3(1.3, 1.8, 0.1)); // you can't walk back through (yet)
  let doorOpen = 0;
  let doorWant = 0;

  // ───────────── landing → bell gate → market ─────────────
  // the sea wall: market halls and fences across z ≈ 33, one arched gate with a little bell
  house(-10, 31, 8, 5, 7, Math.PI, 'h2_teeth', 'stone_blue', { eyes: true, seed: 201 });
  house(13, 31, 12, 5, 8, Math.PI, 'h2_crowns', 'stone_pink', { seed: 202 });
  house(25, 31, 9, 5, 7.5, Math.PI, 'h2_nose', 'stone_orange', { eyes: true, seed: 203 });
  house(36.5, 31, 8, 5, 7, Math.PI, 'h2_cyclops', 'stone_purple', { seed: 204 });
  const fenceMat = toon({ map: T('wood'), color: '#7fd0d8' });
  const fence = (x0: number, x1: number, z: number, h = 2.7) => {
    solid(new THREE.Vector3((x0 + x1) / 2, HY.quay + h / 2, z), new THREE.Vector3(Math.abs(x1 - x0) / 2, h / 2, 0.18), fenceMat, 0, 0.04);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1.4) {
      batch.add(new THREE.ConeGeometry(0.22, 0.5, 4).translate(x, HY.quay + h + 0.2, z), fenceMat, 0.02);
    }
  };
  fence(-15.6, -14, 31.2);
  fence(-6, -1.3, 31.2);
  fence(5.3, 7, 31.2);
  fence(17.5, 20.5, 31.2);
  fence(29.5, 32.5, 31.2);
  fence(40.5, 49.5, 31.2);
  // the gate arch + portcullis
  const gateX = 2;
  const gateZ = 31.2;
  for (const sx of [-3.2, 3.2]) physics.addStaticBox(new THREE.Vector3(gateX + sx, HY.quay + 2.2, gateZ), new THREE.Vector3(0.45, 2.2, 0.55));
  buildGateArch(batch, assets, gateX, HY.quay, gateZ);
  {
    const tex = new THREE.CanvasTexture(labelCanvas('MARKET · 市集', DUSK.teal, PAL.white, 320, 72));
    tex.colorSpace = THREE.SRGBColorSpace;
    const signM = new THREE.MeshBasicMaterial({ map: tex });
    // readable from both sides (the board is between them)
    for (const side of [1, -1]) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 0.9), signM);
      sign.position.set(gateX, HY.quay + 5.0, gateZ + 0.33 + side * 0.07);
      if (side < 0) sign.rotation.y = Math.PI;
      root.add(sign);
    }
  }
  const portcullis = new THREE.Group();
  {
    const { bars, studs } = portcullisGeo();
    const bm = new THREE.Mesh(mergeGeometries(bars.map((g) => ni(g)))!, KM.iron);
    bm.castShadow = true;
    portcullis.add(bm, new THREE.Mesh(mergeGeometries(studs.map((g) => ni(g)))!, KM.brass));
  }
  portcullis.position.set(gateX, HY.quay, gateZ);
  root.add(portcullis);
  const gateCollider = physics.addStaticBox(new THREE.Vector3(gateX, HY.quay + 2, gateZ), new THREE.Vector3(2.8, 2, 0.2), 0, 'gate');
  // the little gate bell hangs in the arch (it can't ring — nobody's shouting)
  const gateBell = buildGateBell(assets);
  gateBell.position.set(gateX, HY.quay + 6.0, gateZ);
  root.add(gateBell);
  // its chain up to the arch
  batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.75, 4).translate(gateX, HY.quay + 6.72, gateZ), KM.ink, 0);
  const gateBellPos = gateBell.position.clone();
  let gateT = -1;
  let gateSwing = 0;
  let gateOpened = false;
  shoutables.push({
    pos: gateBellPos.clone().setY(HY.quay + 4.5),
    radius: 2.2,
    enabled: () => !gateOpened,
    onShout: () => {
      gateOpened = true;
      gateSwing = 1;
      gateT = 0;
      physics.untag(gateCollider);
      physics.world.removeCollider(gateCollider, false);
      ctx.audio.play('smallBell', { pos: gateBellPos });
      ctx.audio.play('gateOpen', { pos: gateBellPos });
      ctx.effects.comic(gateBellPos.clone().add(new THREE.Vector3(0, 1, 0)), t('DING!'), '#ffe08a', 1);
      ctx.events.emit('harbor:gate', {});
      return true;
    },
  });
  // landing props
  const barrel = (x: number, z: number, col: string) => {
    const { body, hull, hoops } = barrelGeo();
    const y = G(x, z);
    batch.add(body.translate(x, y, z), toon({ map: T('wood'), color: col }), 0, hull.translate(x, y, z));
    for (const h of hoops) batch.add(h.translate(x, y, z), KM.iron, 0);
    physics.addStaticCylinder(new THREE.Vector3(x, y + 0.55, z), 0.55, 0.5);
  };
  barrel(-9, 42, '#7fd0d8');
  barrel(-8.2, 43, '#ff9e8a');
  barrel(10, 41, '#b49cff');
  // the fish-market awning (crown on top — a painted spring gets you up)
  const awningY = HY.quay + 3.1;
  physics.addStaticBox(new THREE.Vector3(12.5, awningY, 39), new THREE.Vector3(2.6, 0.12, 1.8));
  buildBigAwning(batch, assets, new THREE.Vector3(12.5, awningY, 39), new THREE.Vector3(2.6, 0.12, 1.8), HY.quay);
  for (const [ax, az] of [[10.2, 37.5], [14.8, 37.5], [10.2, 40.5], [14.8, 40.5]]) physics.addStaticCylinder(new THREE.Vector3(ax, HY.quay + (awningY - HY.quay) / 2, az), (awningY - HY.quay) / 2, 0.1);
  crown('crown-awning', 12.5, awningY + 0.9, 39, 'On the fish-market awning (paint the spring)');

  // ───────────── market quay ─────────────
  house(-8, 20, 6, 6, 7.5, Math.PI / 2, 'h2_sleepy', 'stone_purple', { eyes: true, seed: 211 });
  house(17, 20, 7, 6, 8.5, -Math.PI / 2, 'h2_plain', 'stone_blue', { seed: 212 });
  house(17, 9, 6, 6, 7, -Math.PI / 2, 'h2_teeth', 'stone_pink', { eyes: true, seed: 213 });
  // fish stalls with striped awnings
  const stall = (x: number, z: number, yaw: number, stripe: string) => {
    buildStall(batch, assets, x, G(x, z), z, yaw, stripe, Math.abs(Math.round(x * 3 + z)));
    // solid up to its awning (the camera never slips under it)
    physics.addStaticBox(new THREE.Vector3(x, G(x, z) + 1.2, z + 0.1 * Math.cos(yaw)), new THREE.Vector3(1.3, 1.2, 0.85), yaw);
  };
  stall(-3, 24, 0, 'h2_stripe_neon');
  stall(7, 24, 0, 'h2_stripe_teal');
  stall(10, 15, -Math.PI / 2, 'h2_stripe_coral');

  // ───────────── the Foghorn Ferry (Guardian 1) ─────────────
  const ferryAt = new THREE.Vector3(2, HY.water - 0.2, 1.6);
  let ferryHorn: THREE.Group | null = null;
  {
    // the paddle steamer itself: HarborModels.ts (deck at the quay's height = the collider's top)
    const { hull, horn, solids } = buildFerry(assets);
    hull.position.copy(ferryAt);
    root.add(hull);
    anims.push((_dt, tt) => {
      hull.position.y = ferryAt.y + Math.sin(tt * 1.1) * 0.06;
      hull.rotation.z = Math.sin(tt * 0.8) * 0.015;
    });
    // the ferry is solid piece by piece in its drawn shape (hull — its deck level with the quay — deckhouse,
    // roofs, wheelhouse, bay window, casing, paddle boxes, funnel, horn, crate): feet rest on what is drawn.
    // The colliders hold the rest pose; the hull's bob (±6 cm) and roll (±0.015 rad) are drawing only.
    for (const g of solids) {
      const m = new THREE.Mesh(g);
      m.position.copy(ferryAt);
      physics.addStaticHull(m);
    }
    // mooring lines to the quay's bollards
    for (const [fx, bx] of [[4.7, 7], [-4.7, -2]]) {
      const a = ferryAt.clone().add(new THREE.Vector3(fx, 2.06, 1.7));
      const b = new THREE.Vector3(bx, HY.quay + 0.6, 5.4);
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.35, 0));
      batch.add(tube([a, mid, b], 0.04, 10, 5), KM.timber, 0);
    }
    ferryHorn = horn;
  }
  H({
    id: 'ferry',
    name: 'Foghorn Ferry',
    size: 'large',
    anchored: true,
    noCollider: true,
    pos: ferryAt.clone().add(new THREE.Vector3(0, 1.6, 2.15)),
    half: new THREE.Vector3(5.4, 1.6, 0.2),
    yaw: 0,
    sockets: { EYE: new THREE.Vector3(-1.2, 1.4, 0.35), MOUTH: new THREE.Vector3(2.6, 1.2, 0.5), LEG: new THREE.Vector3(0, -1.6, 0.3) },
    lines: {
      MOUTH: 'The Foghorn Ferry takes a huuuge breath…',
      EYE: 'The Foghorn Ferry blinks its portholes. It can see the fog fine — it needs a VOICE to call the boats home.',
      LEG: 'The Foghorn Ferry paddles… it’s tied to the quay. It needs a MOUTH, not legs.',
    },
  });

  // ───────────── the lagoon: bell buoy + stepping rafts ─────────────
  const raftTop = toon({ map: T('wood'), color: '#ffb38a' });
  const raftFloat = toon({ color: '#7fd0d8' });
  const raft = (x: number, z: number, top: number, w = 1.6) => {
    solid(new THREE.Vector3(x, top - 0.2, z), new THREE.Vector3(w / 2, 0.2, w / 2), raftTop, Math.sin(x * 3) * 0.4, 0.03);
    for (const [bx, bz] of [[-0.5, 0], [0.5, 0]]) {
      batch.add(new THREE.CylinderGeometry(0.3, 0.3, Math.max(0.4, top - HY.water + 0.4), 8).translate(x + bx * w * 0.6, (top - 0.4 + HY.water - 0.4) / 2, z + bz), raftFloat, 0.02);
    }
  };
  // the first raft sat 1 m inside the ferry's stern (its collider in the hull's): it floats clear of it now
  raft(-5.0, 3.6, 0.2);
  raft(-4.4, 1.0, 0.1);
  raft(-6.2, -1.8, 0.2);
  raft(-5.6, -4.8, 0.3, 1.8);
  const buoyAt = new THREE.Vector3(-3.2, HY.water, -7.2);
  const buoy = buildBuoy(assets);
  {
    buoy.position.copy(buoyAt);
    root.add(buoy);
    physics.addStaticCylinder(buoyAt.clone().add(new THREE.Vector3(0, 0.6, 0)), 0.6, 1.0);
    anims.push((_dt, tt) => {
      buoy.position.y = buoyAt.y + Math.sin(tt * 1.3) * 0.08;
      buoy.rotation.z = Math.sin(tt * 0.9) * 0.08;
    });
  }
  const buoyCrown = crown('crown-buoy', -5.6, 1.05, -4.8, 'Ring the bell buoy in the lagoon', true);
  shoutables.push({
    pos: buoyAt.clone().add(new THREE.Vector3(0, 1.4, 0)),
    radius: 1.4,
    enabled: () => buoyCrown.hidden && !buoyCrown.collected,
    onShout: () => {
      ctx.audio.play('smallBell', { pos: buoyAt, pitch: 0.8 });
      ctx.effects.comic(buoyAt.clone().add(new THREE.Vector3(0, 2.8, 0)), t('DONG!'), '#ffe08a', 0.9);
      reveal(buoyCrown);
      ctx.events.emit('toast', { text: t('The bell buoy rings — and bobs up a crown!'), kind: 'good' });
      return true;
    },
  });

  // ───────────── the west channel: the lost boats come home and moor across it ─────────────
  // The three boats ARE the crossing (nothing is drawn over them). They moor side by side, square to the
  // channel's banks: beam 2.35 m, 0.25 m between gunwales, 0.23 m off each quay wall. Gaps stay narrower than
  // WAI (0.66 m): he steps or hops over them and never slips down between two hulls. Their decks step up from
  // the market quay (0.6) to the old quay (1.5): −0.15 · 0.2 · 0.55 (0.35 m steps: walk or hop), and the old
  // quay is a 0.95 m jump (WAI jumps 1.35 m). Colliders hold the rest pose; the docked bob (±3 cm) is drawing only.
  const pcx = channelX(CHANNELS.west, PONTOON_Z);
  const chAlong = new THREE.Vector3(CHANNELS.west.bx - CHANNELS.west.ax, 0, CHANNELS.west.bz - CHANNELS.west.az).normalize();
  const chAcross = new THREE.Vector3(chAlong.z, 0, -chAlong.x); // old town (west) → market (east)
  const pMid = new THREE.Vector3(pcx, 0, PONTOON_Z);
  const pWest = pMid.clone().addScaledVector(chAcross, -(CHANNELS.west.half + 0.6)).setY(HY.oldQuay);
  const pEast = pMid.clone().addScaledVector(chAcross, CHANNELS.west.half + 0.6).setY(HY.quay);
  const boatYaw = Math.atan2(-chAlong.x, -chAlong.z); // bows toward the lagoon: the way they sailed in
  const BOAT_BEAM = 2.35 / 2.704; // buildSailBoat's beam is 2.704 m
  const BOAT_DECKS = [-0.15, 0.2, 0.55]; // deck tops, market side first
  const boats: { g: THREE.Group; solids: THREE.BufferGeometry[]; from: THREE.Vector3; to: THREE.Vector3; t: number; delay: number; bob: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const { g, solids } = buildSailBoat(assets, ['h2_p_coral', 'h2_p_teal', 'h2_p_brass'][i], i + 1);
    const deck = BOAT_DECKS[i];
    // the waterline sits 0.3 (boat units) above the keel: the deck stands 1.1 units above the water
    const sy = (deck - HY.water) / 1.1;
    g.scale.set(BOAT_BEAM, sy, 1 + i * 0.1);
    const to = pMid.clone().addScaledVector(chAcross, 2.6 - i * 2.6).setY(deck - 0.8 * sy);
    const from = to.clone().addScaledVector(chAlong, 30 + i * 5).setY(to.y - 0.1);
    g.position.copy(from);
    g.rotation.y = boatYaw;
    g.visible = false;
    root.add(g);
    boats.push({ g, solids, from, to, t: -1, delay: i * 0.5, bob: i * 2.1 });
  }
  // a pair of bollards beside each landing (the mooring lines tie to them): east −along, east +along, west…
  const landingBollards: [number, number][] = [];
  for (const [end, out] of [[pEast, 1], [pWest, -1]] as const)
    for (const s of [-1, 1]) {
      const q = end.clone().addScaledVector(chAcross, out * 0.2).addScaledVector(chAlong, s * 1.9);
      landingBollards.push([q.x, q.z]);
    }
  let pontoonState = -1; // -1 waiting · 0 boats sailing · 2 moored (decks solid)
  /** Moored: the decks become solid and mooring lines tie the outer boats to the landing bollards. */
  const mooring = () => {
    for (const b of boats) {
      b.g.position.copy(b.to);
      b.g.rotation.set(0, boatYaw, 0);
      b.g.updateMatrixWorld(true);
      for (const geo of b.solids) {
        const m = new THREE.Mesh(geo);
        m.position.copy(b.to);
        m.rotation.y = boatYaw;
        m.scale.copy(b.g.scale);
        physics.addStaticHull(m);
      }
    }
    // the fenders: one solid block in each gap (boat to boat, boat to quay wall), 0.1 m under the lower deck.
    // The hulls taper below the deck, so without it WAI could slide down between two of them into the water.
    const half = (BOAT_BEAM * 2.704) / 2;
    const gaps: [number, number, number][] = [
      [2.6 + half - 0.15, CHANNELS.west.half + 0.75, BOAT_DECKS[0]],
      [half - 0.15, 2.6 - half + 0.15, BOAT_DECKS[0]],
      [-2.6 + half - 0.15, -half + 0.15, BOAT_DECKS[1]],
      [-CHANNELS.west.half - 0.75, -2.6 - half + 0.15, BOAT_DECKS[2]],
    ];
    const gapYaw = Math.atan2(chAlong.x, chAlong.z); // box x → chAcross
    for (const [a, b, deck] of gaps) {
      const top = deck - 0.1, bottom = HY.water - 0.6;
      const c = pMid.clone().addScaledVector(chAcross, (a + b) / 2).setY((top + bottom) / 2);
      physics.addStaticBox(c, new THREE.Vector3(Math.abs(b - a) / 2, (top - bottom) / 2, 1.3), gapYaw);
    }
    // boat space is turned half round (bows north): its −x is the market side, its −z the south
    for (const [b, side] of [[boats[0], 1], [boats[2], -1]] as const)
      for (const s of [-1, 1]) {
        const a = new THREE.Vector3(-side * 1.25, 0.8, -s * 1.2).applyMatrix4(b.g.matrixWorld);
        const post = landingBollards[(side > 0 ? 0 : 2) + (s > 0 ? 1 : 0)];
        const top = new THREE.Vector3(post[0], G(post[0], post[1]) + 0.65, post[1]);
        const mid = a.clone().lerp(top, 0.5).add(new THREE.Vector3(0, -0.3, 0));
        root.add(paintedMesh(tube([a, mid, top], 0.04, 10, 5), KM.timber, 0));
      }
  };
  // docked: a gentle bob (drawing only)
  anims.push((_dt, tt) => {
    if (pontoonState !== 2) return;
    for (const b of boats) {
      b.g.position.y = b.to.y + Math.sin(tt * 1.4 + b.bob) * 0.03;
      b.g.rotation.z = Math.sin(tt * 0.9 + b.bob) * 0.012;
    }
  });

  // ───────────── old town ─────────────
  house(-40, 26, 8, 7, 9, Math.PI / 2, 'h2_nose', 'stone_orange', { eyes: true, seed: 221 });
  // a flat-roofed house (the rooftop crown; a painted spring gets you up)
  const roofHouse = house(-41, 12, 7, 8, 8, Math.PI / 2, 'h2_crowns', 'stone_blue', { seed: 222, flatRoof: true });
  house(-44, -2, 6, 8, 8.5, Math.PI / 2, 'h2_teeth', 'stone_purple', { eyes: true, seed: 223 });
  house(-38, 38, 7, 6, 7, Math.PI * 0.7, 'h2_plain', 'stone_pink', { seed: 224 });
  house(-22.5, -4, 6, 5, 7, Math.PI, 'h2_cyclops', 'stone_pink', { seed: 225 });
  // the grand stair: painted step stripes over the ramp (terrain) + low walls along it
  {
    const stepM = toon({ map: T('stone_cream'), color: '#ffd2c2' });
    for (let i = 0; i < 14; i++) {
      const z = 1.5 - i;
      const y = HY.oldQuay + ((2 - z) / 14) * (HY.square - HY.oldQuay);
      batch.add(new THREE.BoxGeometry(5.6, 0.06, 0.18).translate(-30, y + 0.04, z), stepM, 0);
    }
    for (const sx of [-33.3, -26.7]) solid(new THREE.Vector3(sx, HY.oldQuay + 0.9, -3), new THREE.Vector3(0.28, 0.9, 5.2), stoneCream, 0, 0.03);
  }

  // ───────────── clock square (Guardian 2) ─────────────
  house(-46, -22, 8, 9, 10, Math.PI / 2, 'h2_sleepy', 'stone_blue', { eyes: true, seed: 231 });
  house(-45, -36, 7, 7, 9, Math.PI / 4, 'h2_cyclops', 'stone_orange', { seed: 232 });
  house(-20, -40, 7, 6, 8.5, -Math.PI * 0.9, 'h2_teeth', 'stone_purple', { eyes: true, seed: 233 });
  house(-19, -16, 6, 6, 7.5, -Math.PI / 2, 'h2_crowns', 'stone_pink', { seed: 234 });
  // the clock tower on the north side of the square
  const towerX = -33, towerZ = -41.5;
  const towerBase = G(towerX, towerZ);
  const towerH = 15;
  physics.addStaticBox(new THREE.Vector3(towerX, towerBase + towerH / 2, towerZ), new THREE.Vector3(3, towerH / 2 + 0.6, 3));
  const bellPos = new THREE.Vector3(towerX, towerBase + towerH + 1.6, towerZ);
  // the dust cocoon the Hush wrapped around the bell
  const bellCocoon = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshStandardMaterial({ color: '#cfc8e2', transparent: true, opacity: 0.85, roughness: 1 }));
  bellCocoon.position.copy(bellPos);
  bellCocoon.userData.noPaint = true;
  root.add(bellCocoon);
  // the clock face (south side): a sleepy face — its hands are its brows
  const clockFaceAt = new THREE.Vector3(towerX, towerBase + towerH - 4.2, towerZ + 3.05);
  // the tower itself (ClockTower.ts): plinth, shaft, clock stage, belfry + bell, spire
  const clockTower = buildClockTower(root, assets, { x: towerX, z: towerZ, base: towerBase, bellPos, facePos: clockFaceAt });
  const { bigBell, clockFace, handH, handM } = clockTower;
  let bellSwing = 0;
  let clockAwake = false;
  shoutables.push({
    pos: bellPos.clone(),
    radius: 2.4,
    enabled: () => !clockAwake,
    onShout: () => {
      ctx.effects.comic(bellPos.clone().add(new THREE.Vector3(0, 2.5, 0)), t('…mmf'), '#b49cff', 0.9);
      ctx.audio.play('hush', { pos: bellPos, vol: 0.5 });
      ctx.events.emit('harbor:bellMuffled', {});
      return true;
    },
  });
  // the three tuning forks around the square
  const forks: Fork[] = [];
  for (const [fx, fz] of [[-41, -21], [-24, -16.5], [-26.5, -32]] as [number, number][]) {
    const g = new THREE.Group();
    const y0 = G(fx, fz);
    const plinth = paintedMesh(new THREE.CylinderGeometry(0.7, 0.85, 0.8, 10), stoneCream, 0.03);
    plinth.position.y = 0.4;
    const stem = paintedMesh(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8), brass, 0.02);
    stem.position.y = 1.35;
    const yoke = paintedMesh(new THREE.TorusGeometry(0.42, 0.11, 6, 12, Math.PI), brass, 0.02);
    yoke.rotation.z = Math.PI;
    yoke.position.y = 1.95;
    g.add(plinth, stem, yoke);
    const prongs: THREE.Mesh[] = [];
    for (const sx of [-0.42, 0.42]) {
      const pr = paintedMesh(new THREE.BoxGeometry(0.2, 1.7, 0.2), brass, 0.02);
      pr.position.set(sx, 2.8, 0);
      g.add(pr);
      prongs.push(pr);
    }
    const glow = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 28), new THREE.MeshBasicMaterial({ color: '#5ff4e6', transparent: true, opacity: 0, depthWrite: false }));
    glow.position.y = 2.8;
    glow.userData.noPaint = true;
    g.add(glow);
    g.position.set(fx, y0, fz);
    g.rotation.y = Math.atan2(SQUARE.x - fx, SQUARE.z - fz);
    root.add(g);
    physics.addStaticCylinder(new THREE.Vector3(fx, y0 + 0.5, fz), 0.5, 0.8);
    physics.addStaticBox(new THREE.Vector3(fx, y0 + 2.4, fz), new THREE.Vector3(0.6, 1.3, 0.15), g.rotation.y);
    const f: Fork = { pos: new THREE.Vector3(fx, y0 + 2.3, fz), humT: 0, root: g, prongs, glow };
    forks.push(f);
    shoutables.push({
      pos: f.pos,
      radius: 1.0,
      enabled: () => !clockAwake,
      onShout: () => {
        f.humT = 10;
        ctx.audio.play('forkHum', { pos: f.pos });
        ctx.effects.ring(f.pos.clone(), '#5ff4e6', 2.4, new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), g.rotation.y));
        ctx.effects.comic(f.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('HMMMM'), '#5ff4e6', 0.7);
        ctx.events.emit('harbor:fork', { n: forks.filter((x) => x.humT > 0).length });
        return true;
      },
    });
  }
  // the mailbox (lend it your Mouth: it coughs up a crown)
  H({
    id: 'mailbox',
    name: 'Mailbox',
    size: 'small',
    anchored: true,
    pos: at(-36, -13),
    half: new THREE.Vector3(0.3, 0.55, 0.3),
    yaw: Math.PI * 0.85,
    color: DUSK.coral,
    texture: 'stone_blue',
    sockets: { EYE: new THREE.Vector3(0, 0.35, 0.32), MOUTH: new THREE.Vector3(0, 0.05, 0.32) },
  });
  const mailCrown = crown('crown-mailbox', -35.2, G(-35.2, -14.4) + 0.8, -14.4, 'The square’s mailbox has something stuck in its throat', true);

  // ───────────── the Bell Bridge over the north channel ─────────────
  const ncx = channelX(CHANNELS.north, BELL_BRIDGE_Z);
  const bWest = new THREE.Vector3(ncx - CHANNELS.north.half - 0.4, HY.square, BELL_BRIDGE_Z);
  const bEast = new THREE.Vector3(ncx + CHANNELS.north.half + 0.4, HY.headland, BELL_BRIDGE_Z);
  const bLen = bWest.distanceTo(bEast);
  const bridgePivot = new THREE.Group();
  bridgePivot.position.copy(bWest);
  const bridgeDeck = paintedMesh(bridgeDeckGeo(bLen), toon({ map: T('h2_planks'), color: '#ffe0d0' }), 0.05);
  bridgeDeck.visible = false; // erased: only its iron frame is left until the bell rings
  const bridgeFrame = buildBridgeFrame(assets, bLen);
  bridgePivot.add(bridgeDeck, bridgeFrame);
  const bSlope = Math.atan2(bEast.y - bWest.y, bEast.x - bWest.x);
  bridgePivot.rotation.z = Math.PI / 2.15;
  root.add(bridgePivot);
  // the west abutment (where the bridge is hinged) + towers with little bells
  for (const sz of [-2.4, 2.4]) {
    physics.addStaticBox(new THREE.Vector3(bWest.x - 0.6, HY.square + 1.6, BELL_BRIDGE_Z + sz), new THREE.Vector3(0.45, 1.6, 0.45));
    // the far bank's lamp piers (beside the bridge's mouth, off the walking line)
    physics.addStaticBox(new THREE.Vector3(bEast.x + 0.6, HY.headland + 0.75, BELL_BRIDGE_Z + sz), new THREE.Vector3(0.39, 0.75, 0.39));
  }
  buildBridgePiers(batch, assets, bWest, bEast);
  const bridgeMid = bWest.clone().lerp(bEast, 0.5);
  const bridgeCollider = physics.addStaticBox(bridgeMid.clone().add(new THREE.Vector3(0, -0.18, 0)), new THREE.Vector3(bLen / 2, 0.18, 1.8), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bSlope));
  bridgeCollider.setEnabled(false);
  // side rails while lowered (you can't fall off the bridge sideways)
  const bridgeRails = [-1.85, 1.85].map((sz) =>
    physics.addStaticBox(bridgeMid.clone().add(new THREE.Vector3(0, 0.55, sz)), new THREE.Vector3(bLen / 2, 0.55, 0.1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), bSlope)),
  );
  for (const c of bridgeRails) c.setEnabled(false);
  let bridgeT = -1;

  // ───────────── the headland: arena, lighthouse, jetty ─────────────
  const arenaC = HARBOR.arena.clone();
  // parapet with three gaps: west (from the bridge), north (to the lighthouse), east (jetty stairs)
  const gaps = [Math.PI, -Math.PI / 2, 0];
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2;
    if (gaps.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.36)) continue;
    const x = ARENA.x + Math.cos(a) * (ARENA.r - 0.3), z = ARENA.z + Math.sin(a) * (ARENA.r - 0.3);
    physics.addStaticBox(new THREE.Vector3(x, HY.headland + 0.45, z), new THREE.Vector3(0.9, 0.45, 0.28), -a + Math.PI / 2);
    // visual: a mitred block whose ends meet its neighbours' exactly (straight 1.8 m boxes overlapped
    // 10 cm at a shallow angle and their faces z-fought at every joint)
    const seg = new THREE.BoxGeometry(1.8, 0.9, 0.56);
    const sp = seg.attributes.position as THREE.BufferAttribute;
    const tanH = Math.tan(Math.PI / 34);
    for (let k = 0; k < sp.count; k++) sp.setX(k, Math.sign(sp.getX(k)) * (ARENA.r - 0.3 + sp.getZ(k)) * tanH);
    seg.computeVertexNormals();
    batch.add(seg.rotateY(-a + Math.PI / 2).translate(x, HY.headland + 0.45, z), stoneCream, 0.03);
  }
  // a painted compass rose on the arena floor
  {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.translate(256, 256);
    g.strokeStyle = '#231b52';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(0, 0, 230, 0, Math.PI * 2);
    g.stroke();
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      g.fillStyle = i % 2 ? DUSK.teal : DUSK.coral;
      g.beginPath();
      g.moveTo(0, -(i % 2 ? 150 : 220));
      g.lineTo(28, 0);
      g.lineTo(-28, 0);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const rose = decal(tex, 13, 13, 0.85);
    rose.rotation.x = -Math.PI / 2;
    rose.position.set(ARENA.x, HY.headland + 0.03, ARENA.z);
    root.add(rose);
  }
  // arena lock: dust heaps fill the three gaps + an invisible rim
  const arenaColliders: RAPIER.Collider[] = [];
  let arenaLocked = false;
  let dustT = -1;
  const dustWall = new THREE.Group();
  {
    const m1 = new THREE.MeshStandardMaterial({ color: '#cfc8e2', roughness: 1 });
    const m2 = new THREE.MeshStandardMaterial({ color: '#e6def4', roughness: 1 });
    for (const g of gaps)
      for (let i = 0; i < 12; i++) {
        const a = g + (i / 11 - 0.5) * 0.7;
        const r = ARENA.r - 0.3 + (Math.random() - 0.5) * 0.6;
        const s = 0.35 + Math.random() * 0.4;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), i % 3 ? m1 : m2);
        m.position.set(Math.cos(a) * r, s * 0.6 + (i % 4) * 0.3, Math.sin(a) * r);
        m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        m.userData.noPaint = true;
        dustWall.add(m);
      }
    dustWall.position.copy(arenaC);
    dustWall.visible = false;
    root.add(dustWall);
  }

  // the lighthouse
  const LH = LIGHTHOUSE;
  const lhBase = HY.headland;
  const towerR = (y: number) => THREE.MathUtils.lerp(LH.r0, LH.r1, THREE.MathUtils.clamp((y - lhBase) / (LH.top - lhBase), 0, 1));
  {
    const H0 = LH.top - lhBase;
    const shaft = paintedMesh(new THREE.CylinderGeometry(LH.r1, LH.r0, H0 + 1, 24), lighthouseShaftMat(assets), 0.08);
    shaft.position.set(LH.x, lhBase + H0 / 2 - 0.5, LH.z);
    shaft.castShadow = true;
    root.add(shaft);
    physics.addStaticCylinder(new THREE.Vector3(LH.x, lhBase + H0 / 2, LH.z), H0 / 2, LH.r0 - 0.05);
  }
  // the spiral stair: 1.75 turns from the south foot up to the gallery (a ramp of short tilted slabs)
  const TURNS = 1.75;
  const th0 = Math.PI / 2;
  const SEG = 56;
  const spiralY = (k: number) => lhBase + k * (LH.top - lhBase);
  /** A point in the open air just outside the stair's railing, at the stair's height. */
  const besideSpiral = (k: number) => {
    const th = th0 + k * TURNS * Math.PI * 2;
    return new THREE.Vector3(LH.x + Math.cos(th) * 7.4, spiralY(k), LH.z + Math.sin(th) * 7.4);
  };
  const spiralAt = (k: number) => {
    const th = th0 + k * TURNS * Math.PI * 2;
    const y = spiralY(k);
    const r = towerR(y) + 1.1;
    return new THREE.Vector3(LH.x + Math.cos(th) * r, y, LH.z + Math.sin(th) * r);
  };
  {
    const stepMat = toon({ map: T('wood'), color: '#ffd8c0' });
    const railMat = inkMat;
    const stepGeos: THREE.BufferGeometry[] = [];
    const railGeos: THREE.BufferGeometry[] = [];
    const plinthGeos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < SEG; i++) {
      const k0 = i / SEG, k1 = (i + 1) / SEG;
      const a = spiralAt(k0), b = spiralAt(k1);
      const along = b.clone().sub(a);
      const len = along.length();
      const fwd = along.clone().normalize();
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const radial = mid.clone().sub(new THREE.Vector3(LH.x, mid.y, LH.z)).normalize();
      const up = new THREE.Vector3().crossVectors(radial, fwd).normalize();
      if (up.y < 0) up.negate();
      const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fwd));
      const w = 2.2;
      const c = mid.clone().addScaledVector(up, -0.12);
      physics.addStaticBox(c, new THREE.Vector3(w / 2, 0.12, len / 2 + 0.05), q);
      const sg = new THREE.BoxGeometry(w, 0.24, len + 0.06);
      sg.applyQuaternion(q);
      sg.translate(c.x, c.y, c.z);
      stepGeos.push(sg);
      // the low part of the stair sits on a curved stone plinth (nothing to get stuck under)
      const under = c.y - 0.12 - lhBase;
      if (under > 0.05 && under < 2.6) {
        const bq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, new THREE.Vector3(0, 1, 0), new THREE.Vector3().crossVectors(right, new THREE.Vector3(0, 1, 0)).normalize()));
        const bc = new THREE.Vector3(c.x, lhBase + under / 2 - 0.05, c.z);
        physics.addStaticBox(bc, new THREE.Vector3(w / 2, under / 2 + 0.05, len / 2 + 0.05), bq);
        const pg = new THREE.BoxGeometry(w, under + 0.1, len + 0.08);
        pg.applyQuaternion(bq);
        pg.translate(bc.x, bc.y, bc.z);
        plinthGeos.push(pg);
      }
      // outer railing (collider + a post and a rail piece) — open on the first, ground-level steps
      if (i < 2) continue;
      const ro = mid.clone().addScaledVector(radial, w / 2 + 0.05);
      physics.addStaticBox(ro.clone().add(new THREE.Vector3(0, 0.55, 0)), new THREE.Vector3(0.06, 0.55, len / 2 + 0.05), q);
      const rg = new THREE.BoxGeometry(0.09, 0.09, len + 0.05);
      rg.applyQuaternion(q);
      rg.translate(ro.x, ro.y + 1.05, ro.z);
      railGeos.push(rg);
      if (i % 2 === 0) {
        const pg = new THREE.BoxGeometry(0.08, 1.05, 0.08);
        pg.translate(ro.x, ro.y + 0.52, ro.z);
        railGeos.push(pg);
      }
    }
    const steps = new THREE.Mesh(mergeGeometries(stepGeos.map((g) => ni(g)))!, stepMat);
    steps.castShadow = steps.receiveShadow = true;
    steps.name = 'spiral-steps';
    root.add(steps);
    if (plinthGeos.length) {
      const plinth = new THREE.Mesh(mergeGeometries(plinthGeos.map((g) => ni(g)))!, toon({ map: T('stone_cream'), color: '#c8b8ff' }));
      plinth.castShadow = plinth.receiveShadow = true;
      plinth.name = 'spiral-plinth';
      root.add(plinth);
    }
    const rails = new THREE.Mesh(mergeGeometries(railGeos.map((g) => ni(g)))!, railMat);
    rails.name = 'spiral-rails';
    root.add(rails);
  }
  // the gallery ring at the top + its railing
  const galleryY = LH.top;
  {
    // the stair's last ~2 rad run up under the gallery: the floor is open there (a stairwell), so
    // there's always headroom on the way up
    const HOLE = 2.1; // world angles (−HOLE, 0) are open
    const ring = new THREE.Mesh(new THREE.RingGeometry(LH.r1 - 0.2, LH.r1 + 2.6, 36, 1, HOLE, Math.PI * 2 - HOLE).rotateX(-Math.PI / 2), toon({ map: T('wood'), color: '#ffd8c0' }));
    (ring.material as THREE.Material).side = THREE.DoubleSide;
    ring.position.set(LH.x, galleryY + 0.01, LH.z);
    root.add(ring);
    const under = new THREE.Mesh(new THREE.CylinderGeometry(LH.r1 + 2.6, LH.r1 + 0.4, 0.5, 36, 1, true, Math.PI / 2 + HOLE, Math.PI * 2 - HOLE), toon({ map: T('h2_p_indigo') }));
    (under.material as THREE.Material).side = THREE.DoubleSide;
    under.position.set(LH.x, galleryY - 0.25, LH.z);
    root.add(under);
    const inHole = (a: number) => {
      const w = Math.atan2(Math.sin(a), Math.cos(a));
      return w < 0.05 && w > -HOLE - 0.05;
    };
    for (let i = 0; i < 36; i++) {
      const a = ((i + 0.5) / 36) * Math.PI * 2;
      if (!inHole(a)) physics.addStaticBox(new THREE.Vector3(LH.x + Math.cos(a) * (LH.r1 + 1.2), galleryY - 0.15, LH.z + Math.sin(a) * (LH.r1 + 1.2)), new THREE.Vector3(1.45, 0.15, 0.4), -a);
      // railing all round except over the stairwell and where the stair steps off (east)
      if (inHole(a) || Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.3) continue;
      const rx = LH.x + Math.cos(a) * (LH.r1 + 2.55), rz = LH.z + Math.sin(a) * (LH.r1 + 2.55);
      physics.addStaticBox(new THREE.Vector3(rx, galleryY + 0.6, rz), new THREE.Vector3(0.1, 0.6, 0.5), -a);
      if (i % 2 === 0) batch.add(new THREE.BoxGeometry(0.1, 1.1, 0.1).translate(rx, galleryY + 0.55, rz), inkMat, 0);
    }
    const railTop = new THREE.Mesh(new THREE.TorusGeometry(LH.r1 + 2.55, 0.06, 5, 48, Math.PI * 2 - HOLE - 0.3), inkMat);
    railTop.rotation.x = Math.PI / 2;
    railTop.rotation.z = 0.3;
    railTop.position.set(LH.x, galleryY + 1.1, LH.z);
    root.add(railTop);
  }
  // the lamp room: timber glazing with drawn glints, a Fresnel lens, a brass horn (its mouth) and two sleepy doodle eyes (LanternRoom.ts)
  const lampAt = new THREE.Vector3(LH.x, galleryY + 2.1, LH.z);
  const lantern = buildLantern(assets, { lampAt, galleryY, faceAngle: Math.atan2(0.66, 0.75) });
  root.add(lantern.root);
  // door, windows, the lamp room's drum / glazing bars / domed roof: HarborModels.ts
  dressLighthouse(batch, assets, {
    x: LH.x,
    z: LH.z,
    base: lhBase,
    galleryY,
    r0: LH.r0,
    radiusAt: towerR,
    faceAngle: Math.atan2(0.66, 0.75),
    stairPass: (theta) => {
      const d = (((theta - th0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const out: number[] = [];
      for (let n = 0; n < 3; n++) {
        const k = (d + n * Math.PI * 2) / (TURNS * Math.PI * 2);
        if (k <= 1) out.push(spiralY(k));
      }
      return out;
    },
  });
  physics.addStaticCylinder(lampAt.clone(), 1.5, 2.05);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(4, 40, 20, 1, true).translate(0, -20, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  beam.position.copy(lampAt);
  beam.visible = false;
  beam.userData.noPaint = true;
  root.add(beam);
  const lampFace = new THREE.Group();
  {
    lampFace.add(lantern.eyes.group);
    // its mouth: a riveted brass foghorn (Tripo, HarborArt.ts); a plain cone if the model is missing
    const horn = lighthouseHorn(assets) ?? paintedMesh(new THREE.CylinderGeometry(0.75, 0.22, 1.2, 14, 1, true).rotateX(Math.PI / 2), brass, 0.03);
    if (horn instanceof THREE.Mesh) (horn.material as THREE.Material).side = THREE.DoubleSide;
    horn.position.set(0, -0.55, 0.5);
    lampFace.add(horn);
    // the facing: south-east, toward the stair's arrival and the arena
    const faceDir = new THREE.Vector3(0.75, 0, 0.66).normalize();
    lampFace.position.copy(lampAt).addScaledVector(faceDir, 2.05);
    lampFace.lookAt(lampFace.position.clone().add(faceDir));
    root.add(lampFace);
    // the foghorn's bell stands out over the gallery: solid where it is drawn (no walking through the brass)
    if (horn.name === 'lighthouse-horn') {
      lampFace.updateMatrixWorld(true);
      physics.addStaticBox(lampFace.localToWorld(new THREE.Vector3(-0.3, -0.85, 0.75)), new THREE.Vector3(0.95, 0.95, 0.5), lampFace.quaternion);
    }
  }
  const lampMouth = lampFace.position.clone().add(new THREE.Vector3(0, -0.5, 0));
  /** A camera look point just outside the lamp room (looking INTO the tower collider blacks the shot out). */
  const lampOut = lampFace.position.clone().addScaledVector(new THREE.Vector3(0.75, 0, 0.66).normalize(), 1.6).add(new THREE.Vector3(0, 0.2, 0));
  let lighthouseLit = false;
  let beamT = -1;
  shoutables.push({
    pos: lampMouth,
    radius: 1.6,
    needsBig: true,
    enabled: () => !lighthouseLit,
    onShout: (big, from) => {
      // it has to hear you up close: from the gallery, not from the ground
      if (from.y < galleryY - 0.5) {
        ctx.effects.comic(lampMouth.clone().add(new THREE.Vector3(0, 1.4, 0)), t('…too far'), '#b49cff', 0.8);
        ctx.events.emit('harbor:lampFar', {});
        return true;
      }
      if (!big) {
        ctx.effects.comic(lampMouth.clone().add(new THREE.Vector3(0, 1.4, 0)), t('…too quiet'), '#b49cff', 0.8);
        ctx.events.emit('harbor:lampQuiet', {});
        return true;
      }
      ctx.events.emit('harbor:lamp', {});
      return true;
    },
  });
  // the big-shout cocoon over the stair's foot
  const cocoonAt = spiralAt(0.035).add(new THREE.Vector3(0, 0.9, 0));
  const cocoon = new THREE.Group();
  {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.7, 1), new THREE.MeshStandardMaterial({ color: '#cfc8e2', transparent: true, opacity: 0.9, roughness: 1 }));
    m.scale.set(1.2, 1, 1.2);
    cocoon.add(m);
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + Math.random() * 0.2, 0), new THREE.MeshStandardMaterial({ color: '#efeaf6', roughness: 1 }));
      const a = Math.random() * 6.28;
      c.position.set(Math.cos(a) * 1.8, (Math.random() - 0.3) * 1.4, Math.sin(a) * 1.8);
      cocoon.add(c);
    }
    cocoon.traverse((o) => (o.userData.noPaint = true));
    cocoon.position.copy(cocoonAt);
    root.add(cocoon);
  }
  const cocoonCollider = physics.addStaticBox(cocoonAt.clone(), new THREE.Vector3(1.6, 1.6, 1.6), Math.atan2(cocoonAt.x - LH.x, cocoonAt.z - LH.z), 'gate');
  let cocoonGone = false;
  shoutables.push({
    pos: cocoonAt,
    radius: 1.8,
    needsBig: true,
    enabled: () => !cocoonGone,
    onShout: (big) => {
      if (!big) {
        ctx.effects.comic(cocoonAt.clone().add(new THREE.Vector3(0, 2.2, 0)), t('…mmf'), '#b49cff', 0.8);
        ctx.events.emit('harbor:cocoonQuiet', {});
        return true;
      }
      api_burstCocoon();
      return true;
    },
  });
  const api_burstCocoon = () => {
    if (cocoonGone) return;
    cocoonGone = true;
    physics.untag(cocoonCollider);
    physics.world.removeCollider(cocoonCollider, false);
    cocoon.visible = false;
    ctx.effects.burst(cocoonAt, '#e6def4', 40, 6, 0.12);
    ctx.audio.play('crumble', { pos: cocoonAt, vol: 1 });
    ctx.effects.comic(cocoonAt.clone().add(new THREE.Vector3(0, 2.4, 0)), t('BURST!'), '#ffe08a', 1);
    ctx.events.emit('harbor:cocoon', {});
  };

  // the jetty (east side, down on the mouth channel) where the paper boat docks
  const jettyY = HY.jetty;
  const mcx = channelX(CHANNELS.mouth, ARENA.z);
  const bankX = mcx - CHANNELS.mouth.half;
  {
    solid(new THREE.Vector3(bankX + 1.9, jettyY - 0.15, ARENA.z), new THREE.Vector3(1.9, 0.15, 3.6), wood, 0, 0.04);
    for (const [dx, dz] of [[0.4, -3.3], [3.4, -3.3], [0.4, 3.3], [3.4, 3.3]]) {
      const p = paintedMesh(new THREE.CylinderGeometry(0.16, 0.16, 4.5, 8), darkWood, 0.02);
      p.position.set(bankX + dx, jettyY - 2.2, ARENA.z + dz);
      root.add(p);
    }
    // stairs down from the headland: visual steps + one ramp collider
    const { top, foot } = jettyStair(); // HarborTerrain cuts the headland down along it
    ramp(top, foot, 2.4, null, 0.25);
    const stepM = toon({ map: T('stone_cream'), color: '#e8dcff' });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const k = (i + 0.5) / n;
      const p = top.clone().lerp(foot, k);
      const s = paintedMesh(new THREE.BoxGeometry(top.distanceTo(foot) / n + 0.02, 0.3, 2.4), stepM, 0.02);
      s.position.set(p.x, p.y - 0.12, p.z);
      root.add(s);
    }
    for (const sz of [-1.35, 1.35]) {
      physics.addStaticBox(new THREE.Vector3((top.x + foot.x) / 2 + 0.4, (HY.headland + jettyY) / 2 - 0.2, ARENA.z + sz), new THREE.Vector3((foot.x - top.x) / 2 + 0.6, 1.4, 0.15));
      buildStairParapet(batch, assets, top, foot, ARENA.z + sz);
    }
  }
  const jettySpot = new THREE.Vector3(bankX + 1.9, jettyY, ARENA.z);
  // the paper boat that takes WAI on (hidden until the end)
  const boatDock = new THREE.Vector3(mcx + 0.6, HY.water, ARENA.z);
  const exitBoat = new THREE.Group();
  exitBoat.name = 'paper-boat';
  // the Tripo boat (HarborArt.ts) lies along its own +Z and docks bow-south (yaw 0); the old code boat lay along X (yaw π/2)
  const boatModel = paperBoatModel(assets);
  const boatRestYaw = boatModel ? 0 : Math.PI / 2;
  if (boatModel) {
    exitBoat.add(boatModel);
    exitBoat.rotation.y = boatRestYaw;
    exitBoat.position.set(channelX(CHANNELS.mouth, -64), HY.water - 0.2, -64);
    exitBoat.visible = false;
    exitBoat.traverse((o) => (o.userData.noPaint = true));
    root.add(exitBoat);
  } else {
    const paper = toon({ color: '#fff6e6' });
    const hullShape = new THREE.Shape();
    hullShape.moveTo(-3.4, 1.2);
    hullShape.lineTo(3.4, 1.2);
    hullShape.lineTo(2.2, -0.3);
    hullShape.lineTo(-2.2, -0.3);
    hullShape.closePath();
    const hg = new THREE.ExtrudeGeometry(hullShape, { depth: 3.4, bevelEnabled: false });
    hg.translate(0, 0, -1.7);
    const hull = new THREE.Mesh(hg, paper);
    addOutline(hull, 0.05);
    const sailShape = new THREE.Shape();
    sailShape.moveTo(-2.2, 0);
    sailShape.lineTo(2.2, 0);
    sailShape.lineTo(0, 3.6);
    sailShape.closePath();
    // a thin solid, not a flat double-sided shape: the ink hull of a zero-thickness shape lies in its
    // very plane and z-fights the cloth (the whole sail flickered black/yellow at the jetty)
    const sail = new THREE.Mesh(new THREE.ExtrudeGeometry(sailShape, { depth: 0.06, bevelEnabled: false }).translate(0, 0, -0.03), toon({ color: '#ffe08a' }));
    sail.position.y = 1.2;
    addOutline(sail, 0.03);
    // scribbled "WAI" on the sail + a crown
    const deckM = paintedMesh(new THREE.BoxGeometry(6.4, 0.12, 3.2), toon({ color: '#ffe9d6' }), 0.02);
    deckM.position.y = 1.0;
    const cr = makeCrown(0.9, DUSK.neon);
    cr.position.set(0, 4.9, 0);
    exitBoat.add(hull, sail, deckM, cr);
    exitBoat.rotation.y = Math.PI / 2;
    exitBoat.position.set(channelX(CHANNELS.mouth, -64), HY.water - 0.2, -64);
    exitBoat.visible = false;
    exitBoat.traverse((o) => (o.userData.noPaint = true));
    root.add(exitBoat);
  }
  let exitT = -1;
  const exitFrom = exitBoat.position.clone();
  // docked, the boat is solid in its drawn shape (floor, gunwales, mast); the code boat keeps its jetty-level deck
  const exitColliders = boatModel
    ? paperBoatColliders(physics, boatDock.clone().setY(HY.water - 0.2))
    : [physics.addStaticBox(new THREE.Vector3(boatDock.x, jettyY - 0.1, boatDock.z), new THREE.Vector3(1.6, 0.12, 3.2))];
  for (const c of exitColliders) c.setEnabled(false);

  // ───────────── the east boardwalk (optional) ─────────────
  house(30, 20, 8, 6, 7, -Math.PI / 2, 'h2_plain', 'stone_orange', { seed: 241 });
  house(46, 14, 7, 7, 8, -Math.PI / 2, 'h2_sleepy', 'stone_purple', { eyes: true, seed: 242 });
  house(40, -26, 8, 6, 6, Math.PI / 2, 'h2_teeth', 'stone_blue', { eyes: true, seed: 243 });
  house(48, -36, 6, 6, 5.5, Math.PI * 0.6, 'h2_crowns', 'stone_pink', { seed: 244 });
  // boardwalk planks pattern: a few painted rails along the mouth edge
  for (let z = -10; z < 26; z += 6) {
    const x = Math.max(channelX(CHANNELS.mouth, Math.min(z, -12)) + CHANNELS.mouth.half + 0.6, 22);
    if (waterDepth(x - 1.5, z) <= 0) continue;
    solid(new THREE.Vector3(x, HY.board + 0.45, z), new THREE.Vector3(0.12, 0.45, 2.6), fenceMat, 0, 0.02);
  }
  // the echo grotto: a hollow sea rock that shouts back
  const grottoAt = new THREE.Vector3(53, HY.board, 4);
  {
    const rockM = toon({ map: T('stone_purple'), color: '#8a7ad8' });
    const rock = paintedMesh(new THREE.DodecahedronGeometry(3.2, 1), rockM, 0.06);
    rock.scale.set(1, 0.9, 1.3);
    rock.position.copy(grottoAt).add(new THREE.Vector3(1.5, 1.8, 0));
    root.add(rock);
    // the collider IS the rock (a box 1.3 m inside it let the camera and WAI into the stone)
    if (!physics.addStaticHull(rock)) physics.addStaticBox(rock.position.clone(), new THREE.Vector3(3.0, 2.7, 3.9));
    // the dark "mouth" on the rock's west face, where you can actually see it
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(1.1, 18), new THREE.MeshBasicMaterial({ color: '#120c3a' }));
    mouth.scale.set(0.9, 1.2, 1);
    {
      const from = rock.position.clone().add(new THREE.Vector3(-8, -0.4, 0));
      rock.updateWorldMatrix(true, false);
      const hit = new THREE.Raycaster(from, new THREE.Vector3(1, 0, 0), 0, 10).intersectObject(rock, false)[0];
      mouth.position.copy(hit ? hit.point.add(new THREE.Vector3(-0.06, 0, 0)) : grottoAt.clone().add(new THREE.Vector3(-1.85, 1.4, 0)));
    }
    mouth.rotation.y = -Math.PI / 2;
    root.add(mouth);
  }
  const grottoCrown = crown('crown-grotto', grottoAt.x - 2.2, grottoAt.y + 0.8, grottoAt.z, 'Something in the east rocks wants to shout back', true);
  let grottoT = -1;
  shoutables.push({
    pos: grottoAt.clone().add(new THREE.Vector3(-0.6, 1.4, 0)),
    radius: 1.6,
    enabled: () => grottoCrown.hidden && !grottoCrown.collected && grottoT < 0,
    onShout: () => {
      grottoT = 0;
      return true;
    },
  });
  // the sea stack crown (stairs nobody drew — True Sight shows them)
  const stackZ = -44;
  const stackX = channelX(CHANNELS.mouth, stackZ);
  {
    const st = paintedMesh(new THREE.CylinderGeometry(1.4, 2.0, 7.5, 9), toon({ map: T('stone_purple'), color: '#b8a8ff' }), 0.05);
    st.position.set(stackX, HY.water + 2.2, stackZ);
    root.add(st);
    physics.addStaticCylinder(new THREE.Vector3(stackX, HY.water + 2.2, stackZ), 3.75, 1.45);
  }
  const stackTop = HY.water + 5.95;
  const stackCrown = crown('crown-stack', stackX, stackTop + 0.8, stackZ, 'On the sea stack — up steps only an Eye can see', true);
  // until the boats come home the west channel is the story's wall: an invisible curtain over the
  // water on the old-town side (a run + JET HOVER used to skip the ferry Guardian entirely)
  const channelCurtain: RAPIER.Collider[] = [];
  {
    const W = CHANNELS.west;
    for (let z = W.az; z < W.bz; z += 4) {
      const zc = z + 2;
      const x = channelX(W, zc) - W.half * 0.55;
      const yaw = Math.atan2(W.bx - W.ax, W.bz - W.az);
      channelCurtain.push(physics.addStaticBox(new THREE.Vector3(x, HY.water + 6, zc), new THREE.Vector3(0.15, 6.5, 2.2), yaw, 'barrier'));
    }
  }
  const undrawnSteps: UndrawnSolid[] = [];
  {
    const eastBank = stackX + CHANNELS.mouth.half;
    const n = 3;
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / (n + 1);
      const x = THREE.MathUtils.lerp(eastBank + 0.4, stackX + 1.2, k);
      const y = THREE.MathUtils.lerp(HY.terrace, stackTop, k) - 0.15;
      undrawnSteps.push(api.addUndrawn(`stack-step-${i}`, new THREE.Vector3(x, y, stackZ + (i % 2 ? 0.6 : -0.6)), new THREE.Vector3(0.75, 0.15, 0.75), 0, DUSK.teal));
    }
  }

  // ───────────── lanterns: the town's lights (dark until its district finds its voice) ─────────────
  const lanternSets = new Map<string, THREE.MeshBasicMaterial[]>();
  const lanterns = (a: THREE.Vector3, b: THREE.Vector3, district: string, n = 9) => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const k = i / 16;
      const p = a.clone().lerp(b, k);
      p.y -= Math.sin(k * Math.PI) * 1.0;
      pts.push(p);
    }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: PAL.black })));
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 1; i < n; i++) {
      const k = i / n;
      const p = a.clone().lerp(b, k);
      p.y -= Math.sin(k * Math.PI) * 1.0 + 0.32;
      const g = new THREE.SphereGeometry(0.22, 8, 6);
      g.scale(1, 1.25, 1);
      g.translate(p.x, p.y, p.z);
      geos.push(g);
      // paper-lantern fittings: a cap, a foot ring and a tassel
      batch.add(new THREE.CylinderGeometry(0.07, 0.11, 0.1, 6).translate(p.x, p.y + 0.29, p.z), KM.ink, 0);
      batch.add(new THREE.CylinderGeometry(0.09, 0.06, 0.07, 6).translate(p.x, p.y - 0.29, p.z), KM.ink, 0);
      batch.add(new THREE.CylinderGeometry(0.02, 0.02, 0.2, 4).translate(p.x, p.y - 0.42, p.z), KM.brass, 0);
    }
    const mat = new THREE.MeshBasicMaterial({ color: '#4a3f6a', fog: true });
    const m = new THREE.Mesh(mergeGeometries(geos)!, mat);
    m.userData.noPaint = true;
    root.add(m);
    let list = lanternSets.get(district);
    if (!list) lanternSets.set(district, (list = []));
    list.push(mat);
  };
  lanterns(new THREE.Vector3(-14, 6, 31), new THREE.Vector3(-1, 5.5, 31), 'market');
  lanterns(new THREE.Vector3(-6, 6.5, 22), new THREE.Vector3(14, 6.5, 22), 'market', 11);
  lanterns(new THREE.Vector3(14, 6.5, 12), new THREE.Vector3(-5, 5.5, 12), 'market');
  // 1 m off the old-town wall: the lanterns used to press into it
  lanterns(new THREE.Vector3(-36, 7.5, 26), new THREE.Vector3(-36, 7.5, 6), 'old');
  lanterns(new THREE.Vector3(-42, 9.5, -22), new THREE.Vector3(-22, 9, -16), 'old', 11);
  lanterns(new THREE.Vector3(-21, 9, -38), new THREE.Vector3(-42, 9.5, -32), 'old', 11);
  lanterns(new THREE.Vector3(-1, 7, -30.5), new THREE.Vector3(18, 7, -30.5), 'head', 10);
  lanterns(new THREE.Vector3(26, 6, 10), new THREE.Vector3(42, 6.5, 10), 'east');
  bunting(root, new THREE.Vector3(-6, 7.2, 27), new THREE.Vector3(13, 7.6, 27.5));
  bunting(root, new THREE.Vector3(13.5, 7, 17), new THREE.Vector3(-5, 6.6, 18));
  bunting(root, new THREE.Vector3(-13, 6.6, 34.5), new THREE.Vector3(7, 6.8, 34.5));
  bunting(root, new THREE.Vector3(-42, 11.5, -27), new THREE.Vector3(-22, 11, -26));
  bunting(root, new THREE.Vector3(-36.5, 9.5, 14), new THREE.Vector3(-24, 8, 20));
  // tied to the boardwalk house's south wall (from its west wall it ran 3 m through the house)
  bunting(root, new THREE.Vector3(28.6, 7, 15.75), new THREE.Vector3(43, 7.2, 13));
  const lightUp = (d: string) => {
    const cols = ['#ffe08a', '#ff3fa4', '#5ff4e6', '#ff7a6b'];
    for (const [k, list] of lanternSets) if (d === 'all' || k === d) list.forEach((m, i) => m.color.set(cols[i % cols.length]));
  };

  // ───────────── hosts: props ─────────────
  const crate = (id: string, x: number, z: number, yaw = 0) => H({ id, name: 'Crate', size: 'medium', anchored: false, pos: at(x, z), half: new THREE.Vector3(0.75, 0.55, 0.75), yaw, texture: 'wood', color: '#ffd2c2' });
  crate('crate-landing', 6.5, 44, 0.3);
  crate('crate-market', 12, 27, -0.2);
  crate('crate-old', -35, 18, 0.4);
  crate('crate-square', -27, -27, 0.1);
  crate('crate-board', 36, 2, 0.6);
  const small = (id: string, name: string, x: number, z: number, color: string, h = 0.32, w = 0.28) =>
    H({ id, name, size: 'small', anchored: false, pos: at(x, z), half: new THREE.Vector3(w, h, w), color, texture: 'stone_cream' });
  small('bucket-market', 'Bucket', -6, 14, DUSK.teal);
  small('cone-landing', 'Traffic Cone', -2, 38, PAL.orange, 0.38, 0.22);
  small('bin-old', 'Bin', -30, 12, '#9fd8e6', 0.42, 0.3);
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
        const seat = paintedMesh(wonkyBox(2.2, 0.16, 0.84, 0.04, 5), wood, 0.03);
        seat.position.y = 0.1;
        const back = paintedMesh(wonkyBox(2.2, 0.5, 0.12, 0.05, 6), toon({ map: T('h2_p_coral') }), 0.03);
        back.position.set(0, 0.42, -0.36);
        g.add(seat, back);
        for (const sx of [-0.9, 0.9]) {
          const l = paintedMesh(new THREE.BoxGeometry(0.12, 0.42, 0.7), inkMat, 0.02);
          l.position.set(sx, -0.21, 0);
          g.add(l);
        }
        return g;
      },
    });
  bench('bench-market', 2, 11, Math.PI);
  bench('bench-square', -36, -30, Math.PI * 0.4);
  const lampPost = (id: string, x: number, z: number, yaw: number) =>
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
        const post = paintedMesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), inkMat, 0.03);
        const base = paintedMesh(new THREE.CylinderGeometry(0.32, 0.4, 0.5, 8), toon({ map: T('h2_p_teal') }), 0.03);
        base.position.y = -1.95;
        const arm = paintedMesh(new THREE.TorusGeometry(0.4, 0.06, 6, 10, Math.PI), inkMat, 0.02);
        arm.position.set(0, 2.1, 0.4);
        arm.rotation.y = Math.PI / 2;
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 10), new THREE.MeshBasicMaterial({ color: '#ffd27a' }));
        bulb.position.set(0, 1.8, 0.8);
        addOutline(bulb, 0.03);
        g.add(post, base, arm, bulb);
        return g;
      },
    });
  lampPost('lamp-landing', -6, 46, Math.PI / 2);
  lampPost('lamp-market', -9, 8, Math.PI / 2);
  lampPost('lamp-old', -25, 4, -Math.PI / 2);
  lampPost('lamp-head', -1.5, -26, 0);

  // ───────────── crowns (OPTIONAL) ─────────────
  const ferryCrown = crown('crown-ferry', 7.2, HY.quay + 0.8, 7, 'Wake the Foghorn Ferry', true);
  const clockCrown = crown('crown-clock', -33, G(-33, -36.6) + 0.8, -36.6, 'Make the Clock Tower ring', true);
  crown('crown-lamp', LH.x - 3.6, galleryY + 0.8, LH.z - 2.4, 'On the lighthouse gallery, round the back');
  const nestCrown = crown('crown-nest', 46, HY.terrace + 0.8, -18, 'Clear the Hush Moth nest by the net sheds', true);
  crown('crown-roof', -41, roofHouse.roofTop + 0.8, 12, 'On an old-town rooftop (a spring helps)');

  // ───────────── paint drops ─────────────
  const drops: PaintDrop[] = [];
  const dropLine = (pts: number[][], color: string, lift = 0.6) =>
    pts.forEach(([x, z, y], i) => {
      const d = new PaintDrop(ctx, `h2-drop-${drops.length}-${i}`, new THREE.Vector3(x, (y ?? G(x, z)) + lift, z), color);
      drops.push(d);
      api.addEdible(d);
    });
  dropLine([[2, 44], [2, 41], [2, 38], [2, 35]], DUSK.teal);
  dropLine([[2, 27], [2, 23], [2, 19], [2, 15]], DUSK.neon);
  dropLine([[-10.2, PONTOON_Z], [-21.5, PONTOON_Z], [-27, 10], [-30, 4]], PAL.yellow);
  dropLine([[-30, -2], [-30, -6], [-30, -10]], DUSK.coral);
  dropLine([[-36, -20], [-32, -18], [-28, -22]], DUSK.teal);
  dropLine([[-18, -30], [-14, -30], [0, -30], [4, -32]], DUSK.neon);
  dropLine([[30, 8], [34, 6], [38, 4], [42, 2]], DUSK.lilac);
  dropLine([[-5.0, 3.6, 0.2], [-4.4, 1.0, 0.1], [-6.2, -1.8, 0.2]], PAL.yellow, 0.5);
  {
    const pts: number[][] = [];
    for (const k of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) {
      const p = spiralAt(k);
      pts.push([p.x, p.z, p.y]);
    }
    dropLine(pts, DUSK.coral, 0.55);
  }

  // ───────────── checkpoints ─────────────
  const checkpoints: Checkpoint[] = [
    new Checkpoint(ctx, 'h2-cp-pier', at(-0.4, 44.2), Math.PI),
    new Checkpoint(ctx, 'h2-cp-market', at(6, 18), Math.PI),
    new Checkpoint(ctx, 'h2-cp-oldquay', at(-26, 12), -Math.PI / 2),
    new Checkpoint(ctx, 'h2-cp-square', at(-28, -13), Math.PI),
    new Checkpoint(ctx, 'h2-cp-headland', at(1, -27), Math.PI),
    new Checkpoint(ctx, 'h2-cp-lighthouse', at(8, -46), Math.PI),
    new Checkpoint(ctx, 'h2-cp-board', at(30, 4), Math.PI / 2),
  ];

  // ───────────── graffiti tags + springs ─────────────
  const tags: TagSpot[] = [];
  const paintedGazers: HarborBuilt['paintedGazers'] = [];

  // ───────────── decoration: bollards, nets, buoys on the quays ─────────────
  const bollardMat = toon({ map: T('metal_dark'), color: '#d8c8ff' });
  const bollardCap = toon({ color: DUSK.neon });
  for (const [bx, bz] of [[-8, 5.8], [-2, 5.4], [7, 5.4], [12, 6.2], [-13, 18], [-13, 24], [-21.5, 5], [-22, 22], ...landingBollards] as [number, number][]) {
    if (!onHarbor(bx, bz) || waterDepth(bx, bz) > -0.3) continue;
    const gy = G(bx, bz);
    batch.add(new THREE.CylinderGeometry(0.24, 0.3, 0.8, 10).translate(bx, gy + 0.4, bz), bollardMat, 0.03);
    batch.add(new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(bx, gy + 0.8, bz), bollardCap, 0.02);
    physics.addStaticCylinder(new THREE.Vector3(bx, gy + 0.45, bz), 0.45, 0.28);
  }
  // nets drying on frames along the boardwalk
  for (const [nx, nz] of [[26, 14], [34, 18]] as [number, number][]) {
    const gy = G(nx, nz);
    const netTex = T('h2_net').clone();
    netTex.needsUpdate = true;
    netTex.repeat.set(2, 1.2);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8, 6, 1), new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }));
    {
      // it sags between its posts
      const np = net.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < np.count; i++) np.setY(i, np.getY(i) - Math.cos((np.getX(i) / 1.5) * (Math.PI / 2)) * 0.22);
    }
    net.userData.noPaint = true;
    net.position.set(nx, gy + 1.4, nz);
    net.rotation.y = Math.PI / 2;
    root.add(net);
    for (const dz of [-1.5, 1.5]) {
      const p = paintedMesh(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), darkWood, 0.01);
      p.position.set(nx, gy + 1.2, nz + dz);
      root.add(p);
      physics.addStaticCylinder(p.position.clone(), 1.2, 0.1);
    }
  }
  // grass tufts / flower boxes (merged)
  {
    const geos: THREE.BufferGeometry[] = [];
    let s = 19;
    const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 180; i++) {
      const x = -55 + r() * 110, z = -58 + r() * 108;
      if (!onHarbor(x, z)) continue;
      const h = harborHeight(x, z);
      if (h.zone !== 'grass') continue;
      const g = new THREE.ConeGeometry(0.18 + r() * 0.12, 0.5 + r() * 0.4, 4);
      g.translate(x, h.y + 0.25, z);
      geos.push(ni(g));
    }
    if (geos.length) {
      const tufts = new THREE.Mesh(mergeGeometries(geos)!, toon({ color: '#3fbf9a' }));
      tufts.name = 'harbor-tufts';
      root.add(tufts);
    }
  }
  // distant islands in the dusk (and the next canvas piece: a lit factory chimney, far off)
  {
    // far mesas, lighthouses and sea stacks: Landscape.ts (art pass, phase 4)
    buildHarborLandscape(ctx);
    const works = new THREE.Group();
    const chim = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 46, 10), toon({ map: T('metal_dark'), color: '#ffb38a' }));
    chim.position.y = 23;
    addOutline(chim, 0.25);
    works.add(chim);
    works.position.set(-150, -10, -150);
    root.add(works);
  }

  // ───────────── more town: the old town's back streets, the keeper's hut, the net sheds ─────────────
  house(-52, -12, 6, 7, 8, Math.PI / 2, 'h2_nose', 'stone_pink', { seed: 251 });
  house(-27, -51, 8, 6, 9, 0.1, 'h2_plain', 'stone_blue', { eyes: true, seed: 252 });
  house(-41, -50, 7, 6, 8, -0.2, 'h2_teeth', 'stone_orange', { seed: 253 });
  house(-54, 2, 6, 6, 7, Math.PI / 2, 'h2_cyclops', 'stone_purple', { seed: 254 });
  house(1, -50, 4.5, 4.5, 4.5, 0.3, 'h2_sleepy', 'stone_cream', { seed: 255, eyes: true });
  house(30, -22, 6, 6, 6.5, Math.PI / 2, 'h2_crowns', 'stone_orange', { seed: 256 });
  // lollipop trees (trunk + painted canopy) and sea rocks, batched; trunks/rocks are solid
  const trunkM = toon({ map: T('wood'), color: '#8a5a8e' });
  const canopyM = [KM.teal, KM.coral, toon({ map: T('h2_p_indigo'), color: '#c8b8ff' })];
  const rockM = toon({ map: T('stone_purple'), color: '#9a8ae0' });
  const tree = (x: number, z: number, h = 3.2, k = 0) => {
    const y = G(x, z);
    batch.add(new THREE.CylinderGeometry(0.16, 0.22, h, 6).translate(x, y + h / 2, z), trunkM, 0.03);
    for (const cg of canopyGeos(1.1 + (k % 2) * 0.3, k + 1)) batch.add(cg.translate(x, y + h + 0.6, z), canopyM[k % 3], 0.05);
    physics.addStaticCylinder(new THREE.Vector3(x, y + h / 2, z), h / 2, 0.25);
  };
  const rock = (x: number, z: number, r: number, k = 0) => {
    const y = G(x, z);
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1, 0.7, 1.1).rotateY(k);
    batch.add(g.translate(x, y + r * 0.35, z), rockM, 0.05);
    physics.addStaticCylinder(new THREE.Vector3(x, y + r * 0.35, z), r * 0.6, r * 0.85);
  };
  // (two trees moved 1.2–1.7 m: their canopies sat in a neighbour's eave / wall)
  for (const [x, z, k] of [[-22, -27, 0], [-42, -15, 1], [-24, -36, 2], [-50, -30, 3], [-36, -46, 4], [-15, -52, 5], [-50, 26, 1], [-28, 30, 2], [-44, 44, 0], [5.2, -49, 1], [22, -46, 2], [-2, -40, 0], [34.8, -30, 1], [52, -26, 2], [34, -8, 0], [40, 26, 1]] as [number, number, number][])
    if (onHarbor(x, z) && waterDepth(x, z) < -1.5) tree(x, z, 3 + (k % 3) * 0.6, k);
  for (const [x, z, r, k] of [[22, -55, 1.6, 0], [26, -50, 1.2, 1], [-4, -55, 1.4, 2], [52, -12, 1.3, 1], [54, 18, 1.5, 0], [-56, -18, 1.4, 2], [-48, 38, 1.2, 1], [8, 47, 1.0, 0]] as [number, number, number, number][])
    if (onHarbor(x, z) && waterDepth(x, z) < -1.2) rock(x, z, r, k);
  // drying racks of fish by the net sheds
  for (const [x, z] of [[44, -30], [36, -38]] as [number, number][]) {
    const y = G(x, z);
    for (const dz of [-1.2, 1.2]) batch.add(new THREE.BoxGeometry(0.12, 2, 0.12).translate(x, y + 1, z + dz), trunkM, 0.02);
    batch.add(new THREE.BoxGeometry(0.1, 0.1, 2.6).translate(x, y + 1.9, z), trunkM, 0.02);
    for (let i = 0; i < 4; i++) batch.add(new THREE.SphereGeometry(0.16, 8, 6).scale(0.6, 1.8, 0.4).translate(x, y + 1.5, z - 0.9 + i * 0.6), canopyM[i % 3], 0.02);
    physics.addStaticBox(new THREE.Vector3(x, y + 1, z), new THREE.Vector3(0.15, 1, 1.3));
  }

  batch.flush(root);

  // ───────────── regions (area titles) ─────────────
  const R = (name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => ({ name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  const regions: Region[] = [
    R('The Arrival Pier', -6, -2, 44, 10, 20, 62),
    R('The Landing', -16, -2, 32, 50, 20, 44),
    R('Market Quay', -12, -2, 4, 22, 20, 32),
    R('The Lagoon', -14, -6, -18, 14, 20, 4),
    R('Old Town Quay', -60, -2, -8, -19, 4, 50),
    R('Clock Square', -60, 3.5, -50, -14, 30, -8),
    R('The Bell Bridge', -14, 2, -34, -3, 20, -26),
    R('The Headland', -3, 2.5, -60, 26, 30, -20),
    R('The Lighthouse', 6, 6, -58, 20, 40, -44),
    R('The Boardwalk', 22, -2, -12, 60, 20, 30),
    R('The Net Sheds', 20, 2.2, -50, 60, 20, -12),
  ];

  // ───────────── story hooks ─────────────
  const built: HarborBuilt = {
    hosts,
    crowns,
    special: { nest: nestCrown, mail: mailCrown, ferry: ferryCrown },
    undrawnSteps,
    drops,
    checkpoints,
    regions,
    tags,
    paintedGazers,
    eyeSpots,
    shoutables,
    forks,
    perches: [at(-4, 26), at(8, 12), at(-30, 20), at(-38, -14), new THREE.Vector3(LH.x + 3, galleryY, LH.z + 2), at(30, 10), at(5, -40), at(-26, -36), at(44, -20), at(-2, 40)],
    springSpots: [
      { pos: at(9.2, 42), target: new THREE.Vector3(12.5, awningY + 0.2, 39) }, // landing → the awning crown
      { pos: at(-37, 18), target: new THREE.Vector3(-41, roofHouse.roofTop, 12) }, // old quay → the rooftop crown
    ],
    spawns: {
      chomper: at(24, 38),
      lamp: at(33, 13),
      moths: [
        { pos: at(-31, 10), group: 'oldquay' },
        { pos: at(-35, 4), group: 'oldquay' },
        { pos: at(-36, -24), group: 'square' },
        { pos: at(-27, -20), group: 'square' },
        { pos: at(-30, -30), group: 'square' },
        { pos: besideSpiral(0.36), group: 'spiral' },
        { pos: besideSpiral(0.78), group: 'spiral' },
        { pos: at(44, -20), group: 'nest' },
        { pos: at(47, -24), group: 'nest' },
        { pos: at(42, -16), group: 'nest' },
        { pos: at(49, -18), group: 'nest' },
      ],
      grubs: [at(-44, 20), at(-46, 8), at(36, -2)],
    },
    groundAt: G,
    spots: {
      door: doorAt.clone(),
      gateBell: gateBellPos.clone(),
      ferry: ferryAt.clone().add(new THREE.Vector3(0, 2, 0)),
      pontoon: new THREE.Vector3(pcx, 0.6, PONTOON_Z),
      pontoonWest: pWest.clone(),
      pontoonEast: pEast.clone(),
      decks: boats.map((b) => b.to.clone().setY(b.to.y + 0.8 * b.g.scale.y)),
      stairBottom: new THREE.Vector3(-30, HY.oldQuay, 3.5),
      stairTop: new THREE.Vector3(-30, HY.square, -13),
      bell: bellPos.clone(),
      clockFace: clockFaceAt.clone(),
      bridge: bridgeMid.clone(),
      bridgeWest: bWest.clone().add(new THREE.Vector3(-1.2, 0, 0)),
      bridgeEast: bEast.clone().add(new THREE.Vector3(1.4, 0, 0)),
      cocoon: cocoonAt.clone(),
      // the stair's foot: just before its first step (it climbs westward from the south door)
      spiralStart: (() => {
        const th = th0 - 0.42;
        const r = towerR(lhBase) + 1.1;
        return new THREE.Vector3(LH.x + Math.cos(th) * r, lhBase, LH.z + Math.sin(th) * r);
      })(),
      lamp: lampMouth.clone(),
      lampOut: lampOut.clone(),
      jetty: jettySpot.clone(),
      boat: boatDock.clone().setY(jettyY),
    },
    spiralAt,
    spiralParam(p: THREE.Vector3) {
      // nearest helix parameter for a point on (or near) the stair
      let best = 0, bd = Infinity;
      for (let i = 0; i <= 112; i++) {
        const k = i / 112;
        const q = spiralAt(k);
        const d = Math.hypot(q.x - p.x, (q.y - p.y) * 2.5, q.z - p.z);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      return best;
    },
    get gateOpen() {
      return gateOpened;
    },
    get cocoonBurst() {
      return cocoonGone;
    },
    get bridgeDown() {
      return bridgeT >= 1;
    },
    get pontoonReady() {
      return pontoonState === 2;
    },
    openArrivalDoor() {
      doorWant = 1;
      ctx.audio.play('gateOpen', { pos: doorAt, pitch: 1.3 });
    },
    closeArrivalDoor() {
      doorWant = 0;
    },
    openGate() {
      shoutables[0].onShout(false, gateBellPos);
    },
    bringBoats() {
      if (pontoonState >= 0) return;
      pontoonState = 0;
      for (const c of channelCurtain) c.setEnabled(false);
      for (const b of boats) {
        b.g.visible = true;
        b.t = 0;
      }
    },
    lowerBellBridge() {
      if (bridgeT >= 0) return;
      bridgeT = 0;
      bridgeDeck.visible = true;
      bridgeDeck.scale.set(0.001, 1, 1);
      ctx.audio.play('gateOpen', { pos: bridgeMid });
    },
    ringClockBell() {
      if (clockAwake) return;
      clockAwake = true;
      bellSwing = 1;
      bellCocoon.visible = false;
      ctx.effects.burst(bellPos, '#e6def4', 40, 7, 0.12);
      ctx.audio.play('bigBell', { pos: bellPos, vol: 1 });
      ctx.effects.ring(bellPos.clone(), '#ffe08a', 9, new THREE.Vector3(0, 0, 1));
      const smear = clockFace.getObjectByName('clock-smear');
      const mouth = clockFace.getObjectByName('clock-mouth');
      if (smear) smear.visible = false;
      if (mouth) mouth.visible = true;
      clockTower.setLit(true);
      for (const f of forks) f.humT = 0;
      reveal(clockCrown);
    },
    burstCocoon: api_burstCocoon,
    lightLighthouse() {
      if (lighthouseLit) return;
      lighthouseLit = true;
      beamT = 0;
      beam.visible = true;
      lantern.wake();
      ctx.audio.play('sing', { pos: lampAt, vol: 1 });
      ctx.effects.burst(lampAt, '#ffe08a', 50, 8, 0.12);
    },
    lockArena(on: boolean) {
      if (on === arenaLocked) return;
      arenaLocked = on;
      if (on) {
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2;
          const x = ARENA.x + Math.cos(a) * (ARENA.r - 0.3), z = ARENA.z + Math.sin(a) * (ARENA.r - 0.3);
          arenaColliders.push(physics.addStaticBox(new THREE.Vector3(x, HY.headland + 2.4, z), new THREE.Vector3(0.95, 2.4, 0.3), -a + Math.PI / 2, 'barrier'));
        }
        dustWall.visible = true;
        dustT = 0;
        ctx.audio.play('stomp', { pos: arenaC, pitch: 0.7 });
      } else {
        for (const c of arenaColliders) {
          physics.untag(c);
          physics.world.removeCollider(c, false);
        }
        arenaColliders.length = 0;
        dustT = -1;
        ctx.effects.burst(arenaC.clone().setY(arenaC.y + 1), '#e6def4', 24, 4, 0.1);
        dustWall.visible = false;
      }
    },
    exitBoat,
    bringExitBoat() {
      if (exitT >= 0) return;
      exitT = 0;
      exitBoat.visible = true;
    },
    lightUp,
    wakeTown() {
      for (const m of muted) {
        m.mat.map = m.to;
        m.mat.needsUpdate = true;
      }
      muted.length = 0;
      lightUp('all');
    },
    update(dt, camPos) {
      time += dt;
      for (const a of anims) a(dt, time);
      for (const c of crowns) c.update(dt, camPos);
      lantern.update(dt, camPos);
      for (const tg of tags) tg.update(dt);
      // arrival door
      doorOpen += (doorWant - doorOpen) * Math.min(1, dt * 3);
      doorPivot.rotation.y = -doorOpen * 1.9;
      // the gate rises, its little bell swings
      if (gateT >= 0 && gateT < 1) {
        gateT = Math.min(1, gateT + dt * 0.8);
        portcullis.position.y = HY.quay + gateT * 3.9;
      }
      gateSwing *= Math.exp(-1.6 * dt);
      gateBell.rotation.z = Math.sin(time * 12) * 0.5 * gateSwing;
      // the lost boats sail up the channel and moor across it
      if (pontoonState === 0) {
        let all = true;
        for (const b of boats) {
          if (b.t < 0) continue;
          b.t = Math.min(1, b.t + dt / 5);
          const k = THREE.MathUtils.smoothstep(Math.max(0, b.t - b.delay / 5) / (1 - b.delay / 5), 0, 1);
          b.g.position.lerpVectors(b.from, b.to, k);
          b.g.position.y += Math.sin(time * 2 + b.bob) * 0.05 * (1 - k);
          b.g.rotation.y = boatYaw + (k < 1 ? Math.sin(time * 1.3 + b.bob) * 0.05 * (1 - k) : 0);
          if (k < 1) all = false;
        }
        if (all) {
          pontoonState = 2;
          mooring();
          ctx.audio.play('stomp', { pos: pMid, pitch: 1.4, vol: 0.6 });
          ctx.events.emit('harbor:boatsDocked', {});
        }
      }
      // the bell bridge swings down (deck sketched in as it falls)
      if (bridgeT >= 0 && bridgeT < 1) {
        bridgeT = Math.min(1, bridgeT + dt * 0.55);
        const k = 1 - Math.pow(1 - bridgeT, 2);
        bridgePivot.rotation.z = THREE.MathUtils.lerp(Math.PI / 2.15, bSlope, k);
        bridgeDeck.scale.x = Math.max(0.001, Math.min(1, bridgeT * 1.6));
        if (bridgeT >= 1) {
          bridgeCollider.setEnabled(true);
          for (const c of bridgeRails) c.setEnabled(true);
          ctx.audio.play('stomp', { pos: bridgeMid, pitch: 0.8 });
          ctx.effects.burst(bridgeMid, '#ffe08a', 16, 4, 0.08);
        }
      }
      // the big bell swings, the clock's hands spin back to the right time once it's awake
      bellSwing *= Math.exp(-0.6 * dt);
      bigBell.rotation.x = Math.sin(time * 3.2) * 0.3 * bellSwing;
      if (clockAwake) {
        handM.rotation.z -= dt * (0.2 + bellSwing * 6);
        handH.rotation.z -= dt * (0.02 + bellSwing * 0.6);
      } else {
        bellCocoon.rotation.y += dt * 0.2;
      }
      // tuning forks: hum + count down
      for (const f of forks) {
        if (f.humT > 0) {
          f.humT = Math.max(0, f.humT - dt);
          const k = Math.min(1, f.humT / 2);
          const jig = Math.sin(time * 60) * 0.04 * k;
          f.prongs[0].position.x = -0.42 - jig;
          f.prongs[1].position.x = 0.42 + jig;
          (f.glow.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(time * 8));
          f.glow.scale.setScalar(1 + ((time * 1.5) % 1) * 0.8);
        } else (f.glow.material as THREE.MeshBasicMaterial).opacity = 0;
      }
      // lighthouse beam sweeps once lit
      if (beamT >= 0) {
        beamT += dt;
        beam.rotation.y = beamT * 0.6;
        (beam.material as THREE.MeshBasicMaterial).opacity = Math.min(0.16, beamT * 0.1);
      }
      // arena dust heaps rise
      if (dustT >= 0 && dustT < 1) {
        dustT = Math.min(1, dustT + dt * 2.2);
        dustWall.position.y = HY.headland - 2.2 * (1 - dustT) + Math.sin(dustT * Math.PI) * 0.25;
      }
      // the sea-stack crown shows up once an Eye has drawn its steps (no hover-skipping the puzzle)
      if (stackCrown.hidden && !stackCrown.collected && undrawnSteps.some((u) => u.solid)) reveal(stackCrown);
      // the grotto shouts back after a beat
      if (grottoT >= 0 && grottoT < 2) {
        const before = grottoT;
        grottoT += dt;
        if (before < 0.9 && grottoT >= 0.9) {
          ctx.effects.comic(grottoAt.clone().add(new THREE.Vector3(-1.5, 3, 0)), t('…EY!  …EY!'), '#5ff4e6', 1);
          ctx.audio.play('shout', { pos: grottoAt, pitch: 0.7, vol: 0.6 });
        }
        if (before < 1.6 && grottoT >= 1.6) {
          ctx.audio.play('spit', { pos: grottoAt });
          reveal(grottoCrown);
          ctx.events.emit('toast', { text: t('The echo grotto shouts back — and spits out a crown!'), kind: 'good' });
        }
      }
      // the paper boat sails up the mouth to the jetty
      if (exitT >= 0 && exitT < 1) {
        exitT = Math.min(1, exitT + dt / 6);
        const k = THREE.MathUtils.smoothstep(exitT, 0, 1);
        exitBoat.position.lerpVectors(exitFrom, boatDock.clone().setY(HY.water - 0.2), k);
        exitBoat.rotation.y = Math.atan2(boatDock.x - exitFrom.x, boatDock.z - exitFrom.z) * (1 - k) + boatRestYaw * k;
        if (exitT >= 1) for (const c of exitColliders) c.setEnabled(true);
      }
      if (exitT >= 1) exitBoat.position.y = HY.water - 0.2 + Math.sin(time * 1.2) * 0.05;
      // the ferry's horn quivers once awake
      if (ferryHorn) ferryHorn.scale.y = 1 + (hosts.ferry?.has('MOUTH') ? Math.sin(time * 9) * 0.02 : 0);
    },
  };
  dropFlatInk(ctx.root);
  mergeStaticInk(ctx.root);
  Quality.trimCasters(ctx.root);
  return built;
}
