import * as THREE from 'three';

/**
 * WAI's red cape: a small Verlet cloth (pinned at the shoulders) simulated in
 * world space, so it trails behind with real inertia — streams out when he
 * runs, flaps on jumps, swings on turns and settles when he stops.
 * Collision is a back half-space + an ellipsoid around the body (local space),
 * so it never cuts through WAI.
 */
const COLS = 7;
const ROWS = 10;

export interface CapeShape {
  /** Shoulder line (local to WAI's root, y up, +Z forward). */
  shoulderY: number;
  backZ: number;
  halfWidth: number;
  length: number;
  /** Body ellipsoid (local): centre + radii. */
  bodyCenter: THREE.Vector3;
  bodyRadii: THREE.Vector3;
}

/** Tied at WAI's "neck": the bottom of his box head (v2 box, measured in the chest-bone frame: x −0.21…0.27, y 0.30…0.86, z ±0.18). */
export const DEFAULT_CAPE: CapeShape = {
  shoulderY: 0.44,
  backZ: -0.2,
  halfWidth: 0.21,
  length: 0.42,
  bodyCenter: new THREE.Vector3(0.03, 0.58, 0),
  bodyRadii: new THREE.Vector3(0.28, 0.3, 0.21),
};

/**
 * The knot that ties the cape on: a red band hugging the bottom of the box
 * (the "neck") with a fat yellow knot and two ribbon tails at the front.
 * Lives in the cape anchor's frame (rides the chest bone).
 */
export function makeCapeTie(shape: CapeShape = DEFAULT_CAPE): THREE.Group {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: '#c81a28', roughness: 0.6 });
  const ink = new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide });
  const y = shape.shoulderY - 0.05;
  // rounded-rectangle band just outside the box
  const hw = 0.222, f = 0.19, b = shape.backZ - 0.005, r = 0.04;
  const pts = [
    new THREE.Vector3(-hw + r, y, f),
    new THREE.Vector3(hw - r, y, f),
    new THREE.Vector3(hw, y, f - r),
    new THREE.Vector3(hw, y + 0.02, b + r),
    new THREE.Vector3(hw - r, y + 0.03, b),
    new THREE.Vector3(-hw + r, y + 0.03, b),
    new THREE.Vector3(-hw, y + 0.02, b + r),
    new THREE.Vector3(-hw, y, f - r),
  ];
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.2);
  const band = new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.028, 6, true), red);
  const bandInk = new THREE.Mesh(band.geometry, ink);
  bandInk.scale.setScalar(1.015);
  g.add(bandInk, band);
  // knot + tails at the front-bottom ("under the chin")
  const yel = new THREE.MeshStandardMaterial({ color: '#ffd23a', roughness: 0.45 });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8), yel);
  knot.scale.set(1.3, 1, 0.8);
  knot.position.set(0.04, y - 0.01, f + 0.03);
  const knotInk = new THREE.Mesh(knot.geometry, ink);
  knotInk.scale.setScalar(1.12);
  knot.add(knotInk);
  g.add(knot);
  for (const side of [-1, 1]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.015), red);
    tail.position.set(0.04 + side * 0.045, y - 0.09, f + 0.035);
    tail.rotation.z = side * 0.35;
    g.add(tail);
  }
  g.traverse((o) => (o.userData.noPaint = true));
  return g;
}

export type CapeSkin = 'red' | 'gold' | 'cosmic' | 'rainbow';
const SKINS: Record<CapeSkin, { base: string; strokes: string[] }> = {
  red: { base: '#d61f2c', strokes: ['#b3121f', '#ef3b3b', '#c41a28', '#ff5a4d'] },
  gold: { base: '#e8a90e', strokes: ['#ffd23a', '#c98a00', '#fff0a0', '#b37400'] },
  cosmic: { base: '#3a1d7a', strokes: ['#5b2fb8', '#22c4c0', '#ff4fa3', '#1a0d3d'] },
  rainbow: { base: '#ff4fa3', strokes: ['#ffd23a', '#22c4c0', '#2a4be0', '#ff7a1a'] },
};

function capeTexture(skin: CapeSkin = 'red'): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 320;
  const g = c.getContext('2d')!;
  const sk = SKINS[skin];
  g.fillStyle = sk.base;
  g.fillRect(0, 0, 256, 320);
  if (skin === 'rainbow') {
    // vertical rainbow drips
    const cols = ['#ff2448', '#ff7a1a', '#ffd23a', '#22c4c0', '#2a4be0', '#9b3cff'];
    cols.forEach((col, i) => {
      g.fillStyle = col;
      g.fillRect(i * 43, 0, 44, 290 - (i % 2) * 30);
    });
  }
  if (skin === 'cosmic') {
    for (let i = 0; i < 90; i++) {
      g.fillStyle = Math.random() < 0.8 ? '#ffffff' : '#ffd23a';
      g.globalAlpha = 0.5 + Math.random() * 0.5;
      g.beginPath();
      g.arc(Math.random() * 256, Math.random() * 300, Math.random() * 2.4 + 0.4, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = sk.strokes[i % 4];
    g.globalAlpha = 0.35 + Math.random() * 0.35;
    g.lineWidth = 3 + Math.random() * 7;
    const x = Math.random() * 256;
    g.beginPath();
    g.moveTo(x, -10);
    g.bezierCurveTo(x + (Math.random() - 0.5) * 40, 100, x + (Math.random() - 0.5) * 40, 220, x + (Math.random() - 0.5) * 30, 330);
    g.stroke();
  }
  g.globalAlpha = 1;
  // yellow graffiti crown on the back
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = '#141014';
  g.fillStyle = '#ffd23a';
  g.beginPath();
  g.moveTo(78, 175);
  g.lineTo(70, 110);
  g.lineTo(100, 140);
  g.lineTo(128, 95);
  g.lineTo(156, 140);
  g.lineTo(186, 110);
  g.lineTo(178, 175);
  g.closePath();
  g.fill();
  g.stroke();
  // ragged yellow hem with black edge
  g.fillStyle = '#ffd23a';
  g.fillRect(0, 290, 256, 30);
  g.fillStyle = '#141014';
  g.fillRect(0, 286, 256, 6);
  for (let x = 0; x < 256; x += 16) {
    g.beginPath();
    g.moveTo(x, 320);
    g.lineTo(x + 8, 304 + Math.random() * 8);
    g.lineTo(x + 16, 320);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Cape {
  readonly mesh: THREE.Group;
  private front: THREE.Mesh;
  private pos: Float32Array;
  private prev: Float32Array;
  private rest: { a: number; b: number; len: number }[] = [];
  private geo: THREE.BufferGeometry;
  private inited = false;
  private acc = 0;
  private time = 0;
  private lastRoot = new THREE.Vector3();
  private inv = new THREE.Matrix4();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  /** Swap the cape's look (reward skins). */
  setSkin(skin: CapeSkin): void {
    const m = this.front.material as THREE.MeshStandardMaterial;
    m.map?.dispose();
    m.map = capeTexture(skin);
    m.metalness = skin === 'gold' ? 0.45 : 0;
    m.roughness = skin === 'gold' ? 0.35 : 0.72;
    m.needsUpdate = true;
  }

  /** Extra wind (e.g. dodge / big hit gusts). */
  gust = new THREE.Vector3();

  constructor(private shape: CapeShape = DEFAULT_CAPE) {
    const n = COLS * ROWS;
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const uv = new Float32Array(n * 2);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        uv[(r * COLS + c) * 2] = c / (COLS - 1);
        uv[(r * COLS + c) * 2 + 1] = 1 - r / (ROWS - 1);
      }
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx: number[] = [];
    for (let r = 0; r < ROWS - 1; r++)
      for (let c = 0; c < COLS - 1; c++) {
        const a = r * COLS + c;
        idx.push(a, a + COLS, a + 1, a + 1, a + COLS, a + COLS + 1);
      }
    this.geo.setIndex(idx);
    const tex = capeTexture();
    this.front = new THREE.Mesh(this.geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.72, side: THREE.DoubleSide }));
    this.front.castShadow = true;
    this.front.frustumCulled = false;
    // a dark inked outline pass (slightly inflated back faces) keeps the comic look
    const ink = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }));
    ink.frustumCulled = false;
    this.mesh = new THREE.Group();
    this.mesh.add(ink, this.front);
    this.mesh.userData.noPaint = true;
    this.mesh.name = 'wai-cape';

    // distance constraints: structural + shear + bend
    const P = (r: number, c: number) => r * COLS + c;
    const w = (this.shape.halfWidth * 2) / (COLS - 1);
    const h = this.shape.length / (ROWS - 1);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        // the cape flares a little towards the hem
        const flare = 1 + (r / (ROWS - 1)) * 0.35;
        if (c < COLS - 1) this.rest.push({ a: P(r, c), b: P(r, c + 1), len: w * flare });
        if (r < ROWS - 1) this.rest.push({ a: P(r, c), b: P(r + 1, c), len: h });
        if (r < ROWS - 1 && c < COLS - 1) this.rest.push({ a: P(r, c), b: P(r + 1, c + 1), len: Math.hypot(w * flare, h) });
        if (r < ROWS - 1 && c > 0) this.rest.push({ a: P(r, c), b: P(r + 1, c - 1), len: Math.hypot(w * flare, h) });
        if (r < ROWS - 2) this.rest.push({ a: P(r, c), b: P(r + 2, c), len: h * 2 });
        if (c < COLS - 2) this.rest.push({ a: P(r, c), b: P(r, c + 2), len: w * 2 * flare });
      }
  }

  /** Shoulder pin point (local) for column c. */
  private pinLocal(c: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.shape;
    const u = c / (COLS - 1) - 0.5;
    // collar wraps slightly around the shoulders
    return out.set(u * s.halfWidth * 2, s.shoulderY - Math.abs(u) * 0.05, s.backZ + Math.abs(u) * 0.06);
  }

  reset(root: THREE.Object3D): void {
    root.updateWorldMatrix(true, false);
    const p = new THREE.Vector3();
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        this.pinLocal(c, p);
        p.y -= (r / (ROWS - 1)) * this.shape.length;
        p.z -= r * 0.012;
        p.applyMatrix4(root.matrixWorld);
        const i = (r * COLS + c) * 3;
        this.pos[i] = this.prev[i] = p.x;
        this.pos[i + 1] = this.prev[i + 1] = p.y;
        this.pos[i + 2] = this.prev[i + 2] = p.z;
      }
    root.getWorldPosition(this.lastRoot);
    this.inited = true;
  }

  update(dt: number, root: THREE.Object3D, visible = true): void {
    this.mesh.visible = visible;
    if (!visible && this.inited) return;
    root.updateWorldMatrix(true, false);
    const rootPos = root.getWorldPosition(this.tmp2);
    // teleports / respawns: snap instead of whipping across the map
    if (!this.inited || rootPos.distanceTo(this.lastRoot) > 2.5) this.reset(root);
    this.lastRoot.copy(rootPos);
    this.inv.copy(root.matrixWorld).invert();
    this.acc += Math.min(dt, 0.05);
    const H = 1 / 120;
    while (this.acc >= H) {
      this.acc -= H;
      this.time += H;
      this.step(H, root);
    }
    this.gust.multiplyScalar(Math.exp(-3 * dt));
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }

  private step(h: number, root: THREE.Object3D): void {
    const pos = this.pos;
    const prev = this.prev;
    const n = COLS * ROWS;
    const g = -11;
    // breeze: a slow sway + flutter, plus gusts
    const wind = this.tmp.set(Math.sin(this.time * 1.3) * 0.6 + this.gust.x, this.gust.y, Math.cos(this.time * 0.9) * 0.4 + this.gust.z);
    const damp = 0.985;
    for (let k = 0; k < n; k++) {
      const i = k * 3;
      const flutter = Math.sin(this.time * 9 + k * 0.7) * 0.25;
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      pos[i] += (x - prev[i]) * damp + (wind.x + flutter) * h * h;
      pos[i + 1] += (y - prev[i + 1]) * damp + (g + wind.y) * h * h;
      pos[i + 2] += (z - prev[i + 2]) * damp + (wind.z + flutter) * h * h;
      prev[i] = x;
      prev[i + 1] = y;
      prev[i + 2] = z;
    }
    const p = new THREE.Vector3();
    const local = new THREE.Vector3();
    const s = this.shape;
    for (let iter = 0; iter < 5; iter++) {
      // pins
      for (let c = 0; c < COLS; c++) {
        this.pinLocal(c, p).applyMatrix4(root.matrixWorld);
        pos[c * 3] = p.x;
        pos[c * 3 + 1] = p.y;
        pos[c * 3 + 2] = p.z;
      }
      for (const cn of this.rest) {
        const a = cn.a * 3, b = cn.b * 3;
        const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
        const d = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (d - cn.len) / d;
        const aPinned = cn.a < COLS, bPinned = cn.b < COLS;
        const wa = aPinned ? 0 : bPinned ? 1 : 0.5;
        const wb = bPinned ? 0 : aPinned ? 1 : 0.5;
        pos[a] += dx * diff * wa;
        pos[a + 1] += dy * diff * wa;
        pos[a + 2] += dz * diff * wa;
        pos[b] -= dx * diff * wb;
        pos[b + 1] -= dy * diff * wb;
        pos[b + 2] -= dz * diff * wb;
      }
      // collisions in WAI's local frame: stay behind the back, outside the body
      for (let k = COLS; k < n; k++) {
        const i = k * 3;
        local.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(this.inv);
        let moved = false;
        if (local.y > 0.12 && local.z > s.backZ - 0.01) {
          local.z = s.backZ - 0.01;
          moved = true;
        }
        const ex = (local.x - s.bodyCenter.x) / s.bodyRadii.x;
        const ey = (local.y - s.bodyCenter.y) / s.bodyRadii.y;
        const ez = (local.z - s.bodyCenter.z) / s.bodyRadii.z;
        const e = Math.hypot(ex, ey, ez);
        if (e < 1 && e > 1e-4) {
          local.set(s.bodyCenter.x + (ex / e) * s.bodyRadii.x, s.bodyCenter.y + (ey / e) * s.bodyRadii.y, s.bodyCenter.z + (ez / e) * s.bodyRadii.z);
          moved = true;
        }
        // legs zone under the box: the cape always hangs behind them (no clipping through the legs)
        if (local.y < s.shoulderY - 0.06 && local.z > -0.16 && Math.abs(local.x) < 0.3) {
          local.z = -0.16;
          moved = true;
        }
        if (local.y < 0.03) {
          local.y = 0.03; // never through the floor under WAI
          moved = true;
        }
        if (moved) {
          local.applyMatrix4(root.matrixWorld);
          pos[i] = local.x;
          pos[i + 1] = local.y;
          pos[i + 2] = local.z;
        }
      }
    }
  }
}
