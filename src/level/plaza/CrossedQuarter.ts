/**
 * [INPUT]: depends on QUARTER/inTear/cliffMaterial from ../Terrain; Crown/PaintDrop/Checkpoint from ../Collectibles;
 *          wonkyBuilding from ../WonkyBuilding; toon/paintedMesh/addOutline from render/Materials;
 *          LevelApi.addUndrawn (True-Sight planks and stairs) from ../BlindPlaza; jumpFlight (the kiosk steps) from ../JumpFlight
 * [OUTPUT]: exports buildQuarter() and the BuiltQuarter surface (spawns, springs, inSquare, washMarks, update)
 * [POS]: the level-1 second district's GEOMETRY and props, built inside buildBlindPlaza (before the
 *        static ink merge). Its gameplay (encounters, mid-boss, statue gate) lives in QuarterDirector.
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import type { RAPIER } from '../../core/PhysicsWorld';
import { t } from '../../i18n';
import { addOutline, paintedMesh, toon, wonkyBox } from '../../render/Materials';
import { PAL, labelCanvas } from '../../render/PaintTextures';
import { Checkpoint, Crown, PaintDrop } from '../Collectibles';
import type { LevelApi, Region } from '../BlindPlaza';
import { cliffMaterial, QUARTER } from '../Terrain';
import { wonkyBuilding, type WonkyBuilt } from '../WonkyBuilding';
import { jumpFlight } from '../JumpFlight';

const QY = QUARTER.y;

/**
 * The rock pillars Landscape.ts stands on the east high ground ([x, z, radius], its OUT list).
 * They are visual only there; the quarter gives them colliders so the streets wind between them.
 * The middle one is "the Blot", the quarter's landmark, with the Red Pen's giant cross on it.
 */
const PILLARS: [number, number, number][] = [
  [34, -16, 4.5],
  [44, -28, 6],
  [51, -12, 3.5],
  [47, -40, 3],
  [38, -44, 5],
  [30, -50, 4],
];

export interface QuarterSpawns {
  yardStapler: THREE.Vector3;
  yardGrubs: THREE.Vector3[];
  /** lands on WAI as he steps off the planks over the tear */
  tearStapler: THREE.Vector3;
  /** the East Walk: a lamp (hidden from the yard and the tear by the Blot) and a bottle that blanks the spring */
  walkLamp: THREE.Vector3;
  walkBottle: THREE.Vector3;
  inkwell: THREE.Vector3;
  /** where the Inkwell's phase-2 White-out Bottle rolls in from */
  inkwellHelper: THREE.Vector3;
}

export interface BuiltQuarter {
  spawns: QuarterSpawns;
  springs: { pos: THREE.Vector3; target: THREE.Vector3; need?: number }[];
  regions: Region[];
  crownInkwell: Crown;
  /** where WAI is redrawn after falling into the tear */
  checkpointAt: THREE.Vector3;
  /** Is p in Inkwell Square, on the Inkwell's side of the red barricades (none on the straight line to it)? */
  inSquare(p: THREE.Vector3): boolean;
  /** The Inkwell is repainted: every red mark fades, the red barricades fold away. */
  washMarks(): void;
  readonly washed: boolean;
  update(dt: number): void;
}

/** A red pen cross, brushed (two strokes with drips), on a transparent canvas. */
let crossTex: THREE.CanvasTexture | null = null;
function redCrossTexture(): THREE.CanvasTexture {
  if (crossTex) return crossTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    for (const [w, col, a] of [[40, '#7a0d1a', 0.5], [30, '#e8323c', 1], [8, '#ff8a8f', 0.6]] as [number, string, number][]) {
      g.globalAlpha = a;
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(x0, y0);
      g.quadraticCurveTo((x0 + x1) / 2 + 10, (y0 + y1) / 2 - 8, x1, y1);
      g.stroke();
    }
    // drips off the stroke
    g.globalAlpha = 1;
    g.fillStyle = '#e8323c';
    for (let i = 0; i < 3; i++) {
      const k = 0.25 + i * 0.25;
      const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k;
      g.fillRect(x - 3, y, 6, 18 + i * 9);
      g.beginPath();
      g.arc(x, y + 20 + i * 9, 5, 0, Math.PI * 2);
      g.fill();
    }
  };
  stroke(34, 40, 222, 214);
  stroke(222, 36, 38, 218);
  crossTex = new THREE.CanvasTexture(c);
  crossTex.colorSpace = THREE.SRGBColorSpace;
  return crossTex;
}

/** Crossed-out boards: cream planks with the red cross over them. */
let boardTex: THREE.CanvasTexture | null = null;
function boardTexture(): THREE.CanvasTexture {
  if (boardTex) return boardTex;
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 5; i++) {
    g.fillStyle = ['#f6e8d0', '#efd9b8', '#f9efdc', '#e9d2ae', '#f3e2c4'][i];
    g.fillRect(0, (i * H) / 5, W, H / 5 - 4);
    g.fillStyle = '#2a1630';
    g.fillRect(0, ((i + 1) * H) / 5 - 4, W, 4);
  }
  g.drawImage(redCrossTexture().image as HTMLCanvasElement, W / 2 - H / 2 - 10, -6, H + 20, H + 12);
  boardTex = new THREE.CanvasTexture(c);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  return boardTex;
}

export function buildQuarter(
  ctx: GameContext,
  api: LevelApi,
  kit: { G: (x: number, z: number) => number; crowns: Crown[]; drops: PaintDrop[]; checkpoints: Checkpoint[]; eyeSpots: WonkyBuilt['eyeSpots'] },
): BuiltQuarter {
  const { root, physics, assets } = ctx;
  const T = (n: string) => assets.tex(n);
  const at = (x: number, z: number, dy = 0) => new THREE.Vector3(x, kit.G(x, z) + dy, z);
  const marks: THREE.Mesh[] = []; // everything red that washes off
  const barricades: { g: THREE.Object3D; cols: RAPIER.Collider[]; a: [number, number]; b: [number, number] }[] = [];
  let washT = -1;

  const solid = (c: THREE.Vector3, half: THREE.Vector3, mat: THREE.Material | THREE.Material[], yaw = 0, outline = 0.04) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), mat);
    if (outline > 0) addOutline(m, outline);
    m.position.copy(c);
    m.rotation.y = yaw;
    m.castShadow = true;
    root.add(m);
    const col = physics.addStaticBox(c.clone(), half.clone(), yaw);
    return { m, col };
  };
  /** A red cross decal standing on a surface (faces `normal`). */
  const cross = (pos: THREE.Vector3, normal: THREE.Vector3, size: number, spin = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: redCrossTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide }));
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.rotateZ(spin);
    m.userData.noPaint = true;
    root.add(m);
    marks.push(m);
    return m;
  };
  /** A wall of crossed-out boards from a to b (it folds away when the marks wash off). */
  const barricade = (a: [number, number], b: [number, number], h: number, washes: boolean) => {
    const A = new THREE.Vector3(a[0], QY, a[1]);
    const B = new THREE.Vector3(b[0], QY, b[1]);
    const len = A.distanceTo(B);
    const yaw = Math.atan2(B.x - A.x, B.z - A.z) + Math.PI / 2;
    const mid = A.clone().lerp(B, 0.5);
    const g = new THREE.Group();
    const side = toon({ map: T('wood'), color: '#e8d2b0' });
    const front = toon({ map: boardTexture() });
    const board = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.35), [side, side, side, side, front, front]);
    board.position.y = h / 2;
    addOutline(board, 0.05);
    g.add(board);
    for (const s of [-0.5, 0.5]) {
      const post = paintedMesh(new THREE.BoxGeometry(0.3, h + 0.5, 0.45), toon({ map: T('wood') }), 0.03);
      post.position.set(s * (len - 0.2), (h + 0.5) / 2, 0);
      g.add(post);
    }
    g.position.copy(mid);
    g.rotation.y = yaw;
    root.add(g);
    // the collider stands a little above the boards: no hopping over (the spring's arc clears it)
    const ch = h + 0.4;
    const col = physics.addStaticBox(mid.clone().setY(QY + ch / 2), new THREE.Vector3(len / 2, ch / 2, 0.25), yaw);
    if (washes) barricades.push({ g, cols: [col], a, b });
    return g;
  };

  // ───────────── rock pillars (Landscape's mesas) become solid ─────────────
  for (const [x, z, r] of PILLARS) physics.addStaticCylinder(new THREE.Vector3(x, QY + 6, z), 6.5, r);

  // ───────────── the sunken lane: fence, arch ─────────────
  {
    // a crooked picket fence along the quarter's west brink (no dropping onto the road or into its erased pit)
    const wood = toon({ map: T('wood'), color: '#f0d8c0' });
    const z0 = -21.2, z1 = -50;
    for (let z = z0; z > z1; z -= 2) {
      const y = kit.G(27.75, z);
      const post = paintedMesh(new THREE.BoxGeometry(0.16, 1.3, 0.16), wood, 0.02);
      post.position.set(27.75, y + 0.6, z);
      post.rotation.z = Math.sin(z * 1.7) * 0.08;
      root.add(post);
      for (const ry of [0.45, 0.95]) {
        const rail = paintedMesh(new THREE.BoxGeometry(0.08, 0.12, 2.05), wood, 0.015);
        rail.position.set(27.75, kit.G(27.75, z - 1) + ry, z - 1);
        rail.rotation.x = Math.atan2(kit.G(27.75, z - 2) - y, 2) * -1;
        root.add(rail);
      }
    }
    // one invisible barrier per stretch (the lane climbs, the street is flat)
    const ramp = QUARTER.ramp;
    const rampLen = ramp.z1 - ramp.z0;
    const slope = Math.atan2(QY - 8.5, rampLen);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), slope);
    physics.addStaticBox(new THREE.Vector3(27.7, (8.5 + QY) / 2 + 1.6, (ramp.z0 + ramp.z1) / 2), new THREE.Vector3(0.12, 1.6, rampLen / 2 + 0.2), q, 'barrier');
    physics.addStaticBox(new THREE.Vector3(27.7, QY + 1.6, (ramp.z0 + z1) / 2), new THREE.Vector3(0.12, 1.6, (ramp.z0 - z1) / 2), 0, 'barrier');
    // the quarter's gate: two posts and a crossed-out sign over the top of the lane
    const postMat = toon({ map: T('stone_purple') });
    for (const x of [27.2, 31.4]) solid(new THREE.Vector3(x, QY + 1.9, ramp.z0 - 0.2), new THREE.Vector3(0.35, 1.9, 0.35), postMat, 0, 0.04);
    const signTex = new THREE.CanvasTexture(labelCanvas(t('THE QUARTER'), PAL.cream, PAL.black, 512, 128));
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.BoxGeometry(5, 1.1, 0.25), [postMat, postMat, postMat, postMat, toon({ map: signTex }), toon({ map: signTex })]);
    sign.position.set(29.3, QY + 4.1, ramp.z0 - 0.2);
    sign.rotation.z = -0.06;
    addOutline(sign, 0.04);
    root.add(sign);
    cross(new THREE.Vector3(29.3, QY + 4.1, ramp.z0 + 0.0), new THREE.Vector3(0, 0, 1), 2.2, 0.1);
    cross(new THREE.Vector3(29.3, QY + 4.1, ramp.z0 - 0.4), new THREE.Vector3(0, 0, -1), 2.2, -0.1);
  }

  // ───────────── the landmark: the Red Pen's cross drawn on the sky over the quarter ─────────────
  // (the sky is canvas too). A sprite, so it reads from the hub, the road and the summit alike.
  let skyCross: THREE.Sprite;
  {
    skyCross = new THREE.Sprite(new THREE.SpriteMaterial({ map: redCrossTexture(), transparent: true, depthWrite: false, fog: false }));
    skyCross.position.set(PILLARS[1][0], QY + 17, PILLARS[1][1]);
    skyCross.scale.set(15, 15, 1);
    skyCross.userData.noPaint = true;
    root.add(skyCross);
    // smaller crosses on the other pillars, each facing the street it watches
    for (const [i, face] of [[0, [1, 0, -0.4]], [2, [-1, 0, -0.6]], [4, [0.4, 0, 1]], [3, [-0.6, 0, 1]]] as [number, number[]][]) {
      const [x, z, r] = PILLARS[i];
      const n = new THREE.Vector3(...(face as [number, number, number])).normalize();
      cross(new THREE.Vector3(x, QY + 2.8, z).addScaledVector(n, r * 0.9), n, 3.2, i * 0.3);
    }
  }

  // ───────────── houses ─────────────
  const houseA = wonkyBuilding(ctx, { x: 33.6, z: -24.6, w: 5, d: 4, h: 7, yaw: Math.PI, ground: QY, facade: 'facade_plain_b', side: 'stone_pink', eyes: true, seed: 71 });
  const houseB = wonkyBuilding(ctx, { x: 40.6, z: -12.7, w: 4.4, d: 4, h: 6.5, yaw: Math.PI / 2, ground: QY, facade: 'facade_nose', side: 'stone_yellow', eyes: true, seed: 72 });
  kit.eyeSpots.push(...houseA.eyeSpots, ...houseB.eyeSpots);
  cross(new THREE.Vector3(33.6, QY + 3.8, -26.65), new THREE.Vector3(0, 0, -1), 3.6, 0.05);
  cross(new THREE.Vector3(42.85, QY + 3.4, -12.7), new THREE.Vector3(1, 0, 0), 3.2, -0.08);

  // ───────────── Gate Yard: a kiosk with a crown up True-Sight stairs ─────────────
  {
    const kx = 35.6, kz = -35.0;
    const kioskMat = toon({ map: T('stone_blue'), color: '#d8e4ff' });
    solid(new THREE.Vector3(kx, QY + 1.5, kz), new THREE.Vector3(0.85, 1.5, 0.85), kioskMat, 0.2, 0.05);
    const roof = paintedMesh(new THREE.ConeGeometry(1.35, 0.7, 4), toon({ color: PAL.orange }), 0.04);
    roof.position.set(kx, QY + 3.35, kz);
    roof.rotation.y = Math.PI / 4 + 0.2;
    root.add(roof);
    physics.addStaticBox(new THREE.Vector3(kx, QY + 3.1, kz), new THREE.Vector3(1.0, 0.1, 1.0), 0.2);
    cross(new THREE.Vector3(kx - 0.86, QY + 1.6, kz), new THREE.Vector3(-1, 0, 0.2), 1.5);
    // one straight undrawn flight from the north (the checkpoint's side) into the roof's edge, square to the
    // kiosk's north face; the crossed-out west face stays in view
    const into = Math.PI + 0.2; // heading −z, turned with the kiosk (yaw 0.2)
    const edge = new THREE.Vector3(kx - Math.sin(into) * 1.0, QY, kz - Math.cos(into) * 1.0);
    jumpFlight(edge, into, QY + 3.2).blocks.forEach((b, i) => api.addUndrawn(`quarter-stair-${i}`, b.center, b.half, b.yaw, PAL.pink));
    // a knee-high rail round the roof, open to the steps: a running jump onto the 2 m roof stops at it
    const railMat = toon({ map: T('wood'), color: '#f0d8c0' });
    for (const [lx, lz, hx, hz] of [[0, -0.94, 1.0, 0.06], [0.94, 0, 0.06, 1.0], [-0.94, 0, 0.06, 1.0]]) {
      const c = new THREE.Vector3(lx, 0, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.2).add(new THREE.Vector3(kx, QY + 3.475, kz));
      solid(c, new THREE.Vector3(hx, 0.275, hz), railMat, 0.2, 0.03);
    }
    kit.crowns.push(new Crown(ctx, 'crown-kiosk', new THREE.Vector3(kx, QY + 4.4, kz), 'On a kiosk, up stairs nobody drew'));
  }

  // ───────────── the tear: where the red line struck through the street, the canvas came apart ─────────────
  const tear = QUARTER.tear;
  {
    const DEPTH = 4;
    const wallMat = cliffMaterial(ctx) as THREE.MeshStandardMaterial;
    wallMat.side = THREE.DoubleSide;
    const P: number[] = [];
    const quad = (a: number[], b: number[], c: number[], d: number[]) => P.push(...a, ...b, ...c, ...a, ...c, ...d);
    const top = QY + 0.02, bot = QY - DEPTH;
    quad([tear.x0, top, tear.z0], [tear.x0, top, tear.z1], [tear.x0, bot, tear.z1], [tear.x0, bot, tear.z0]);
    quad([tear.x1, top, tear.z0], [tear.x1, top, tear.z1], [tear.x1, bot, tear.z1], [tear.x1, bot, tear.z0]);
    quad([tear.x0, top, tear.z0], [tear.x1, top, tear.z0], [tear.x1, bot, tear.z0], [tear.x0, bot, tear.z0]);
    quad([tear.x0, top, tear.z1], [tear.x1, top, tear.z1], [tear.x1, bot, tear.z1], [tear.x0, bot, tear.z1]);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const uv: number[] = [];
    for (let v = 0; v < P.length; v += 3) uv.push((P[v] + P[v + 2]) / 6, P[v + 1] / 6);
    wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    wg.computeVertexNormals();
    const walls = new THREE.Mesh(wg, wallMat);
    walls.userData.noPaint = true;
    walls.name = 'quarter-tear-walls';
    root.add(walls);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(tear.x1 - tear.x0, tear.z1 - tear.z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T('sky'), fog: false }));
    sky.position.set((tear.x0 + tear.x1) / 2, bot + 0.05, (tear.z0 + tear.z1) / 2);
    sky.userData.noPaint = true;
    root.add(sky);
    // the red line itself, along both torn edges
    const lineMat = new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
    for (const x of [tear.x0 - 0.35, tear.x1 + 0.35]) {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.5, tear.z1 - tear.z0 + 1.2).rotateX(-Math.PI / 2), lineMat.clone());
      line.position.set(x, QY + 0.04, (tear.z0 + tear.z1) / 2);
      line.rotation.y = x < 40 ? 0.012 : -0.01;
      line.userData.noPaint = true;
      root.add(line);
      marks.push(line);
    }
    // knee-high kerbs along both torn edges (no walking off by accident mid-fight), open where the planks are
    const kerbMat = toon({ map: T('stone_cream'), color: '#ffd6d6' });
    for (const x of [tear.x0 - 0.25, tear.x1 + 0.25])
      for (const [za, zb] of [[tear.z0, -38.3], [-34.9, tear.z1]] as [number, number][]) solid(new THREE.Vector3(x, QY + 0.3, (za + zb) / 2), new THREE.Vector3(0.25, 0.3, (zb - za) / 2), kerbMat, 0, 0.03);
    // True-Sight planks across it (a bridge nobody drew) — or jet-hover over
    const pz = -36.6;
    const n = 4;
    const span = tear.x1 - tear.x0 + 0.6;
    for (let i = 0; i < n; i++) {
      const x = tear.x0 - 0.3 + (span * (i + 0.5)) / n;
      api.addUndrawn(`quarter-plank-${i}`, new THREE.Vector3(x, QY - 0.2, pz), new THREE.Vector3(span / n / 2 + 0.02, 0.2, 1.5), 0, PAL.turq);
    }
    kit.crowns.push(new Crown(ctx, 'crown-tear', new THREE.Vector3(41.25, QY + 1.4, -40.6), 'Hovering over the torn street'));
    // a street lamp on the west bank: lend it your Eye and it keeps looking at the planks for you
    api.addHost({
      id: 'lamp-tear',
      name: 'Street Lamp',
      size: 'medium',
      anchored: true,
      canTurn: true,
      pos: at(37.3, -38.7),
      half: new THREE.Vector3(0.32, 2.2, 0.32),
      yaw: Math.atan2(41.25 - 37.3, pz + 38.7),
      sockets: { EYE: new THREE.Vector3(0, 1.75, 0.45), MOUTH: new THREE.Vector3(0, 0.6, 0.34), LEG: new THREE.Vector3(0, -2.2, 0) },
      gaze: { range: 16, halfAngleDeg: 30, pitch: 0.35 },
      build: () => {
        const g = new THREE.Group();
        const dark = toon({ color: '#2a2230' });
        const post = paintedMesh(new THREE.CylinderGeometry(0.1, 0.16, 4.2, 8), dark, 0.03);
        const base = paintedMesh(new THREE.CylinderGeometry(0.32, 0.4, 0.5, 8), toon({ color: PAL.turq }), 0.03);
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
    // the tear's ends: short crossed-out fences (no walking round it between the pillars)
    barricade([37.6, -30.7], [40.2, -30.7], 1.8, false);
    barricade([41.8, -42.7], [44.8, -42.7], 1.8, false);
  }

  // ───────────── barricades that the washed marks take down ─────────────
  // Gate Yard ↔ Inkwell Square (between the pillars A and the Blot): the shortcut back
  barricade([35.8, -18.4], [41.2, -24.7], 2.6, true);
  // the East Walk's end: a painted spring throws WAI over it into the square
  barricade([48.6, -24.4], [55.8, -24.4], 2.6, true);

  // ───────────── checkpoint, paint drops ─────────────
  const cpPos = new THREE.Vector3(32.2, QY, -30.6);
  kit.checkpoints.push(new Checkpoint(ctx, 'cp-quarter', cpPos, Math.PI / 2));
  const dropLine = (pts: number[][], color: string) =>
    pts.forEach(([x, z, y], i) => {
      const d = new PaintDrop(ctx, `drop-q${kit.drops.length}-${i}`, new THREE.Vector3(x, (y ?? kit.G(x, z)) + 0.6, z), color);
      kit.drops.push(d);
      api.addEdible(d);
    });
  dropLine([[28.6, -19.8], [29.3, -23], [29.3, -25.8], [29.3, -28.4]], PAL.yellow);
  dropLine([[30.5, -33.5], [33.5, -36.5], [36.8, -32]], PAL.turq);
  dropLine([[39.8, -36.6, QY], [41.25, -36.6, QY], [42.7, -36.6, QY]], PAL.hotpink); // over the planks: a lure
  dropLine([[47.2, -35.4], [50, -33.5], [52.4, -30.5], [53.2, -27.2]], PAL.orange);
  dropLine([[42, -20.5], [50.5, -20], [44, -12], [49, -13.5]], PAL.cobalt);

  // the Inkwell's crown (revealed when it is repainted)
  const crownInkwell = new Crown(ctx, 'crown-inkwell', new THREE.Vector3(46.5, QY + 1.2, -19.6), 'Repaint the Red Inkwell');
  crownInkwell.hidden = true;
  kit.crowns.push(crownInkwell);

  // a few ink bottles and pen-nib bollards in the square (cover from the ink flicks)
  {
    const inkMat = toon({ color: '#3a2a6a' });
    for (const [x, z, s] of [[40.5, -18.5, 0.55], [52.5, -17.5, 0.5], [43.5, -22.6, 0.45]] as [number, number, number][]) {
      const b = paintedMesh(wonkyBox(s * 1.6, s * 2.2, s * 1.6, 0.06, Math.round(x * 7)), inkMat, 0.04);
      b.position.set(x, QY + s * 1.1, z);
      root.add(b);
      physics.addStaticBox(b.position.clone(), new THREE.Vector3(s * 0.8, s * 1.1, s * 0.8));
      cross(new THREE.Vector3(x, QY + s * 1.1, z + s * 0.81), new THREE.Vector3(0, 0, 1), s * 1.4);
    }
  }

  const R = (name: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Region => ({ name, box: new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1)) });
  const regions = [
    R('Inkwell Square', 34, 11.5, -24.6, 58, 30, -10),
    R('The Crossed-Out Quarter', 26.2, 7, -56, 58, 30, -18.5),
  ];

  const inkwellAt = at(46.5, -16.3);

  return {
    spawns: {
      yardStapler: at(34, -32.6),
      yardGrubs: [at(30.6, -34.5), at(35.2, -30.8), at(32.2, -36)],
      tearStapler: at(49, -34.2),
      walkLamp: at(49.6, -25.7),
      walkBottle: at(52.6, -29),
      inkwell: inkwellAt,
      inkwellHelper: at(53.5, -20.5),
    },
    // the target sits high: Ambient's arc peaks 2.5 m over it, which clears the 3 m barricade
    springs: [{ pos: at(52.2, -27.4), target: new THREE.Vector3(51.6, QY + 2.5, -20.4), need: 18 }],
    regions,
    crownInkwell,
    checkpointAt: cpPos,
    get washed() {
      return washT >= 0;
    },
    inSquare(p) {
      if (!regions[0].box.containsPoint(p)) return false;
      return !barricades.some(({ a, b }) => crosses(p.x, p.z, inkwellAt.x, inkwellAt.z, a[0], a[1], b[0], b[1]));
    },
    washMarks() {
      if (washT >= 0) return;
      washT = 0;
      for (const b of barricades)
        for (const c of b.cols) {
          physics.untag(c);
          physics.world.removeCollider(c, false);
        }
      for (const m of marks) ctx.effects.burst(m.getWorldPosition(new THREE.Vector3()), [PAL.yellow, PAL.turq, PAL.pink][marks.indexOf(m) % 3], 6, 3);
      ctx.audio.play('reveal', { vol: 1 });
    },
    update(dt) {
      if (washT < 0 || washT >= 1) return;
      washT = Math.min(1, washT + dt * 0.6);
      const k = washT;
      for (const m of marks) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = 1 - k;
        if (k >= 1) m.visible = false;
      }
      // the sky cross unravels upward
      skyCross.material.opacity = 1 - k;
      skyCross.position.y = QY + 17 + k * 6;
      skyCross.material.rotation = k * 1.2;
      if (k >= 1) skyCross.visible = false;
      for (const b of barricades) {
        // the boards fold down flat, then sink away
        b.g.scale.y = Math.max(0.001, 1 - k * 1.2);
        if (k >= 1) b.g.visible = false;
      }
    },
  };
}

/** Do the segments p→q and a→b cross (x/z plane)? */
function crosses(px: number, pz: number, qx: number, qz: number, ax: number, az: number, bx: number, bz: number): boolean {
  const side = (x0: number, z0: number, x1: number, z1: number, x: number, z: number) => Math.sign((x1 - x0) * (z - z0) - (z1 - z0) * (x - x0));
  return side(ax, az, bx, bz, px, pz) !== side(ax, az, bx, bz, qx, qz) && side(px, pz, qx, qz, ax, az) !== side(px, pz, qx, qz, bx, bz);
}
