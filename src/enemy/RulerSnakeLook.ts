/**
 * [INPUT]: depends on toon/paintedMesh from render/Materials; PAL from render/PaintTextures;
 *          mergeGeometries from three's BufferGeometryUtils; SoundFx / ARC_MODE (marker strokes) from render/SoundFx
 * [OUTPUT]: exports RulerSnakeLook (the hinged ruler body: SEGS bevelled slabs, brass hinges, steel edge strips,
 *           tick-ink decals, the bossy head), makeLane() (the red line decal, scaled to the whip's size),
 *           measureTicks() (the whip tell's racing ticks), strikeLine() (the line struck through after a whip)
 *           and the SEGS / SEG_L / LANE_* constants
 * [POS]: render half of the Ruler Snake. RulerSnake.ts owns the brain, the trail and the joint chain; each frame it
 *        hands world joints to pose() and colours to tick(). This file owns no state machine and reads no physics.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { ARC_MODE, type SoundFx } from '../render/SoundFx';

// ───────────── shape constants ─────────────
export const SEGS = 8; // hinged slabs, head first
export const SEG_L = 0.4; // joint pitch: 8 × 0.4 = a 3.2 m ruler
/** Half width at each joint J0..J8 (the tail tapers to a rounded tip). */
const HW = [0.17, 0.166, 0.161, 0.156, 0.15, 0.142, 0.13, 0.112, 0.042];
const GAP = 0.016; // half gap between two slabs at a joint (the brass knuckle fills it)
const BEV = 0.02; // bevel size and thickness
const BOTTOM = 0.02; // slab underside above the floor
const CORNER = 0.06; // rounded slab corners
const U0 = 0.34; // printed ruler length ahead of J0 (the snout)
const TEX_LEN = U0 + SEGS * SEG_L + 0.06;
const TEX_W = 2048;
const TEX_H = 128;

/** Slab thickness (odd slabs 1 cm thicker: their tops never share a plane with a neighbour's). */
const depthOf = (k: number) => (k === 0 ? 0.1 : k % 2 ? 0.08 : 0.07);
const topOf = (k: number) => BOTTOM + depthOf(k) + 2 * BEV;
const hwAt = (k: number, along: number) => THREE.MathUtils.lerp(HW[k], HW[k + 1], THREE.MathUtils.clamp(along / SEG_L, 0, 1));

// ───────────── textures (shared, drawn once) ─────────────
let woodTex: THREE.CanvasTexture | null = null;
let inkTex: THREE.CanvasTexture | null = null;
let laneTex: THREE.CanvasTexture | null = null;

/** Ticks and numbers along the ruler: every 2 cm, a long tick every 10 cm (numbered), a longer one every 50 cm. */
function drawTicks(g: CanvasRenderingContext2D, ink: boolean): void {
  const pxm = TEX_W / TEX_LEN;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.font = 'bold 40px "Arial Black", Arial, sans-serif';
  for (let i = 1; i <= SEGS * SEG_L * 50; i++) {
    const x = (U0 + i * 0.02) * pxm;
    const major = i % 5 === 0;
    const half = i % 25 === 0;
    const len = half ? 54 : major ? 40 : 22;
    const red = !ink && i % 25 === 0;
    g.fillStyle = ink ? '#ffffff' : red ? '#d42a30' : '#1d1418';
    g.fillRect(x - (major ? 2.5 : 1.5), TEX_H - 6 - len, major ? 5 : 3, len);
    if (major) {
      const n = i / 5;
      g.fillStyle = ink ? '#ffffff' : n % 5 === 0 ? '#d42a30' : '#1d1418';
      g.fillText(String(n), x, TEX_H - 66);
    }
  }
  // the zero end: a bold bar across the snout's printed start
  g.fillStyle = ink ? '#ffffff' : '#d42a30';
  g.fillRect(U0 * pxm - 3, 14, 6, TEX_H - 20);
}

function rulerTextures(): { wood: THREE.CanvasTexture; ink: THREE.CanvasTexture } {
  if (woodTex && inkTex) return { wood: woodTex, ink: inkTex };
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = TEX_W;
    c.height = TEX_H;
    return c;
  };
  // yellow-cream boxwood with a soft grain and darker edges
  const w = mk();
  const g = w.getContext('2d')!;
  g.fillStyle = '#f3d27c';
  g.fillRect(0, 0, TEX_W, TEX_H);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * TEX_H;
    g.strokeStyle = `rgba(176,122,48,${0.12 + rnd() * 0.18})`;
    g.lineWidth = 1 + rnd() * 2.5;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= TEX_W; x += 128) g.lineTo(x, y + Math.sin(x * 0.004 + i) * (2 + rnd() * 5));
    g.stroke();
  }
  const edge = g.createLinearGradient(0, 0, 0, TEX_H);
  edge.addColorStop(0, 'rgba(150,96,32,0.55)');
  edge.addColorStop(0.08, 'rgba(150,96,32,0)');
  edge.addColorStop(0.92, 'rgba(150,96,32,0)');
  edge.addColorStop(1, 'rgba(150,96,32,0.55)');
  g.fillStyle = edge;
  g.fillRect(0, 0, TEX_W, TEX_H);
  drawTicks(g, false);
  // white tick ink on clear: tinted per slab (repaint colours, the red measuring sweep)
  const k = mk();
  drawTicks(k.getContext('2d')!, true);
  const fin = (c: HTMLCanvasElement) => {
    const tx = new THREE.CanvasTexture(c);
    tx.colorSpace = THREE.SRGBColorSpace;
    tx.anisotropy = 4;
    tx.userData.keep = true;
    return tx;
  };
  woodTex = fin(w);
  inkTex = fin(k);
  return { wood: woodTex, ink: inkTex };
}

/**
 * Ruler UVs from slab-local positions: u runs head → tail along the printed length, v hugs the slab's own edges
 * (v = 0 on the right edge, where the ticks are printed; the numbers read from the snake's right side).
 */
function rulerUv(g: THREE.BufferGeometry, k: number): void {
  const p = g.getAttribute('position');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const along = -p.getZ(i);
    uv[i * 2] = (U0 + k * SEG_L + along) / TEX_LEN;
    uv[i * 2 + 1] = THREE.MathUtils.clamp(0.5 - p.getX(i) / (2 * hwAt(k, along)), 0, 1);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ───────────── geometry ─────────────
/** One slab: a tapered rounded rectangle, extruded with a bevel. Pivot at its front joint; it extends along −Z. */
function slabGeo(k: number): THREE.BufferGeometry {
  const hw0 = HW[k];
  const hw1 = HW[k + 1];
  const head = k === 0;
  const tail = k === SEGS - 1;
  // shape space: x across, y backwards (rotateX(−π/2) maps y → −z)
  const yf = head ? -0.05 : GAP;
  const yb = SEG_L - GAP;
  const rf = head ? hw0 : CORNER;
  const rb = tail ? hw1 : CORNER;
  const sf = head ? 1.35 : 1; // the snout is longer than it is wide
  const pts: THREE.Vector2[] = [];
  const arc = (cx: number, cy: number, r: number, a0: number, a1: number, sy: number) => {
    const n = r > 0.1 ? 10 : 4;
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy));
    }
  };
  arc(-hw0 + rf, yf + rf, rf, Math.PI, Math.PI * 1.5, sf);
  arc(hw0 - rf, yf + rf, rf, Math.PI * 1.5, Math.PI * 2, sf);
  arc(hw1 - rb, yb - rb, rb, 0, Math.PI * 0.5, 1);
  arc(-hw1 + rb, yb - rb, rb, Math.PI * 0.5, Math.PI, 1);
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), {
    depth: depthOf(k),
    bevelEnabled: true,
    bevelThickness: BEV,
    bevelSize: BEV,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, BOTTOM + BEV, 0);
  rulerUv(g, k);
  g.computeBoundingBox();
  return g;
}

/** Brass hinge at the back joint of slab k: a knuckle in the gap, a washer over it, a domed rivet. */
function hingeGeo(k: number): THREE.BufferGeometry {
  const top = Math.max(topOf(k), topOf(k + 1)) + 0.004;
  const z = -SEG_L;
  const knuckle = new THREE.CylinderGeometry(0.034, 0.034, top - BOTTOM - 0.01, 10).translate(0, (top + BOTTOM) / 2, z);
  const washer = new THREE.CylinderGeometry(0.058, 0.062, 0.014, 16).translate(0, top + 0.007, z);
  const dome = new THREE.SphereGeometry(0.032, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, top + 0.014, z);
  for (const x of [knuckle, washer, dome]) x.deleteAttribute('uv');
  return mergeGeometries([knuckle, washer, dome])!;
}

/** Steel strip along the left edge (the ruler's metal edge, opposite the ticks), a slim capsule on the bevel. */
function stripGeo(k: number): THREE.BufferGeometry {
  const a = 0.05;
  const b = SEG_L - (k === SEGS - 1 ? 0.12 : 0.05);
  const xa = -(hwAt(k, a) + BEV - 0.004);
  const xb = -(hwAt(k, b) + BEV - 0.004);
  const len = Math.hypot(xb - xa, b - a);
  const y = BOTTOM + BEV + depthOf(k) * 0.5;
  return new THREE.CapsuleGeometry(0.014, len, 2, 6)
    .rotateX(Math.PI / 2)
    .rotateY(Math.atan2(xb - xa, -(b - a)))
    .translate((xa + xb) / 2, y, -(a + b) / 2);
}

/** Tick-ink decal over the flat top (inside the rounded corners). */
function decalGeo(k: number): THREE.BufferGeometry {
  const a = k === 0 ? 0.13 : 0.065;
  const b = k === SEGS - 1 ? 0.24 : SEG_L - 0.065;
  const hw = Math.min(hwAt(k, a), hwAt(k, b)) - 0.012;
  const g = new THREE.PlaneGeometry(hw * 2, b - a).rotateX(-Math.PI / 2).translate(0, topOf(k) + 0.0035, -(a + b) / 2);
  rulerUv(g, k);
  return g;
}

// ───────────── the strike lane (a red measuring line on the floor) ─────────────
export const LANE_LEN = 3.0;
export const LANE_HALF = 0.32;

/** Flat red ruler-line decal from its origin along +Z (no ink hull: it is flat). */
export function makeLane(): THREE.Mesh {
  if (!laneTex) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(232,50,60,0.95)';
    g.fillRect(28, 0, 8, 512); // the centre line
    for (let i = 0; i < 30; i++) {
      const y = 8 + i * 17;
      const w = i % 5 === 0 ? 26 : 14;
      g.fillRect(0, y, w, 4); // edge ticks, both sides
      g.fillRect(64 - w, y, w, 4);
    }
    g.fillRect(0, 0, 64, 6); // a bar across the start
    laneTex = new THREE.CanvasTexture(c);
    laneTex.colorSpace = THREE.SRGBColorSpace;
    laneTex.userData.keep = true;
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(LANE_HALF * 2, LANE_LEN).rotateX(-Math.PI / 2).translate(0, 0, LANE_LEN / 2),
    new THREE.MeshBasicMaterial({ map: laneTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
  );
  m.renderOrder = 2;
  m.userData.noPaint = true;
  m.visible = false;
  return m;
}

// ───────────── the whip's marker strokes (on ctx.effects.sound, drawn at the exact swept size) ─────────────
const _o = new THREE.Vector3();
const _a = new THREE.Vector3();
const _x = new THREE.Vector3();

/** The tell: `n` ticks measured so far, a cross stroke every `step` m from `o` along `yaw`; the newest and every 4th bold. */
export function measureTicks(fx: SoundFx, o: THREE.Vector3, yaw: number, n: number, step: number, half: number, locked: boolean): void {
  _a.set(Math.sin(yaw), 0, Math.cos(yaw));
  _x.set(-_a.z, 0, _a.x);
  const col = fx.c(locked ? '#ff1f2e' : '#e8253a');
  for (let i = 1; i <= n; i++) {
    const big = i % 4 === 0 || i === n;
    const h = half * (big ? 1.15 : 0.8);
    _o.set(o.x + _a.x * i * step - _x.x * h, o.y + 0.06, o.z + _a.z * i * step - _x.z * h);
    fx.arc({ c: _o, u: _x, v: _a, r: h * 2, w: big ? 0.07 : 0.04, color: col, alpha: i === n ? 1 : 0.8, mode: ARC_MODE.stroke, seed: i });
  }
}

/** After the whip: the measured line struck through in red marker (len × 2·half) with dark cross ticks, fading out. */
export function strikeLine(fx: SoundFx, o: THREE.Vector3, yaw: number, len: number, half: number): void {
  _a.set(Math.sin(yaw), 0, Math.cos(yaw));
  _x.set(-_a.z, 0, _a.x);
  _o.copy(o).setY(o.y + 0.05);
  fx.spawnArc({ c: _o, u: _a, v: _x, r0: len, r1: len, w: half, w1: half * 0.4, color: fx.c('#e8253a'), alpha: 0.55, dur: 0.6, mode: ARC_MODE.stroke, seed: Math.random() * 9 });
  for (let s = 0.5; s < len; s += 1) {
    const c = _o.clone().addScaledVector(_a, s).addScaledVector(_x, -half);
    fx.spawnArc({ c, u: _x, v: _a, r0: half * 2, r1: half * 2, w: 0.06, color: fx.c('#9b1b2a'), dur: 0.55, delay: s * 0.015, mode: ARC_MODE.stroke, seed: s });
  }
}

// ───────────── the body ─────────────
interface Lid {
  pivot: THREE.Group;
  side: number;
}

/**
 * The Ruler Snake's body: a folding wooden ruler in SEGS slabs. Each slab hangs off its own pivot group
 * (front joint), so the brain can pose the chain freely; slabs never parent each other.
 */
export class RulerSnakeLook {
  readonly slabs: THREE.Group[] = [];
  /** Per-slab tick-ink materials (MeshBasic, never cloned by the paint system). */
  readonly ink: THREE.MeshBasicMaterial[] = [];
  private inkMesh: THREE.Mesh[] = [];
  private lids: Lid[] = [];
  private tongue = new THREE.Group();
  private lidClose = 0.5;
  private lidTilt = 0.35;

  constructor(parent: THREE.Object3D) {
    const { wood, ink } = rulerTextures();
    const woodMat = toon({ map: wood, color: '#ffffff', relief: 0.45 });
    const steel = toon({ color: '#cfd6e2' });
    const brass = toon({ color: '#e3ae48' });
    for (let k = 0; k < SEGS; k++) {
      const pivot = new THREE.Group();
      pivot.rotation.order = 'YXZ';
      pivot.add(paintedMesh(slabGeo(k), woodMat, 0.022, true));
      pivot.add(paintedMesh(stripGeo(k), steel, 0, false));
      if (k < SEGS - 1) pivot.add(paintedMesh(hingeGeo(k), brass, 0, false));
      const mat = new THREE.MeshBasicMaterial({ map: ink, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const deco = new THREE.Mesh(decalGeo(k), mat);
      deco.renderOrder = 1;
      deco.userData.noPaint = true;
      deco.visible = false;
      pivot.add(deco);
      this.ink.push(mat);
      this.inkMesh.push(deco);
      this.slabs.push(pivot);
      parent.add(pivot);
    }
    // steel tail cap (the ruler's worn metal end)
    const capG = new THREE.SphereGeometry(HW[SEGS] + BEV + 0.008, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 0.85);
    const cap = paintedMesh(capG, steel, 0, false);
    cap.position.set(0, BOTTOM + BEV + depthOf(SEGS - 1) / 2, -(SEG_L - GAP - HW[SEGS]));
    cap.rotation.x = -Math.PI / 2;
    this.slabs[SEGS - 1].add(cap);
    this.buildHead(this.slabs[0]);
  }

  /** Narrow bossy eyes with heavy lids, a mouth line round the snout, nostrils, a steel-tipped tongue. */
  private buildHead(head: THREE.Group): void {
    const top = topOf(0);
    const white = toon({ color: PAL.white });
    const lidMat = toon({ color: '#a8381f' });
    const black = new THREE.MeshBasicMaterial({ color: PAL.black });
    for (const side of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(side * 0.088, top + 0.022, -0.01);
      const ball = paintedMesh(new THREE.SphereGeometry(0.072, 16, 12).scale(1, 0.85, 0.9), white, 0.012, false);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8).scale(1, 1.15, 0.55), black);
      pupil.position.set(-side * 0.012, 0.004, 0.06);
      const pivot = new THREE.Group();
      pivot.rotation.order = 'ZXY';
      const lid = paintedMesh(new THREE.SphereGeometry(0.078, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 0.95), lidMat, 0.012, false);
      // a heavy dark brow along the lid's front edge: reads "bossy" from across the room
      const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.1, 2, 6).rotateZ(Math.PI / 2), black);
      brow.position.set(0, 0.01, 0.074);
      pivot.add(lid, brow);
      eye.add(ball, pupil, pivot);
      this.lids.push({ pivot, side });
      head.add(eye);
    }
    // the mouth: a thin dark line round the snout's rim, at mid height
    const yMid = BOTTOM + BEV + depthOf(0) * 0.45;
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(HW[0] + BEV + 0.002, 0.008, 4, 20, Math.PI).rotateX(Math.PI / 2).scale(1, 1, 1.35), black);
    mouth.position.set(0, yMid, -0.12);
    head.add(mouth);
    for (const side of [-1, 1]) {
      const n = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), black);
      n.position.set(side * 0.04, top - 0.002, 0.075);
      head.add(n);
    }
    // tongue: pink ribbon with a steel hook tip (a tape measure's end)
    const tg = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.13, 2, 6).rotateX(Math.PI / 2).translate(0, 0, 0.075).scale(1, 0.5, 1), toon({ color: '#e8455a' }));
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 10).rotateX(Math.PI / 2).translate(0, -0.004, 0.155).scale(1.4, 1, 1), toon({ color: '#dfe5ee' }));
    this.tongue.add(tg, tip);
    this.tongue.position.set(0, yMid, 0.08);
    this.tongue.visible = false;
    head.add(this.tongue);
  }

  /**
   * Place each slab from world joints J[0..SEGS] (J[k] = slab k's front joint), in the frame of the actor root
   * (its position + yaw). `roll` twists each slab about its own length.
   */
  pose(J: THREE.Vector3[], roll: Float32Array, ox: number, oy: number, oz: number, yaw: number): void {
    const c = Math.cos(-yaw);
    const s = Math.sin(-yaw);
    for (let k = 0; k < SEGS; k++) {
      const a = J[k];
      const b = J[k + 1];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const len = Math.max(1e-4, Math.hypot(dx, dy, dz));
      const px = a.x - ox;
      const pz = a.z - oz;
      const g = this.slabs[k];
      g.position.set(px * c + pz * s, a.y - oy, -px * s + pz * c);
      g.rotation.set(-Math.asin(THREE.MathUtils.clamp(dy / len, -1, 1)), Math.atan2(dx, dz) - yaw, roll[k]);
    }
  }

  /** Tint slab k's tick ink (0 opacity hides the decal: the printed black ticks show). */
  tick(k: number, color: THREE.Color, opacity: number): void {
    const m = this.ink[k];
    m.color.copy(color);
    m.opacity = opacity;
    this.inkMesh[k].visible = opacity > 0.02;
  }

  /** Add a red heat to slab k's wood this frame (EnemyBase re-sets the emissive every frame before animate). */
  glow(k: number, amount: number): void {
    const m = (this.slabs[k].children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    m.emissive.r += amount;
    m.emissive.g += amount * 0.08;
    m.emissive.b += amount * 0.1;
  }

  /** Lids: `close` 0 wide open … 1 shut; `tilt` > 0 inner corners down (bossy), < 0 up (happy). */
  face(close: number, tilt: number, dt: number): void {
    const k = Math.min(1, dt * 10);
    this.lidClose += (close - this.lidClose) * k;
    this.lidTilt += (tilt - this.lidTilt) * k;
    for (const l of this.lids) {
      l.pivot.rotation.x = -1.35 + this.lidClose * 1.55;
      l.pivot.rotation.z = l.side * this.lidTilt;
    }
  }

  /** Tongue flick: 0 in … 1 fully out. */
  flick(k: number): void {
    this.tongue.visible = k > 0.05;
    this.tongue.scale.set(1, 1, Math.max(0.05, k));
  }
}
