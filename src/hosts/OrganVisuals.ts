import * as THREE from 'three';
import { PAL } from '../render/PaintTextures';
import { paintedMesh, toon } from '../render/Materials';
import { CrookedLeg } from '../enemy/MutantModel';
import { ORGAN_ART } from '../render/OrganArt';

/*
 * The sticker organs, as 3D vinyl stickers: every organ sits on a crisp, thin
 * white die-cut border (lit like the host, no soft halo), conformed to the
 * host's surface. All animated geometry is rebuilt in place (no per-frame
 * allocations).
 */

const VINYL = new THREE.Color('#fbf8f1');
const VINYL_EDGE = new THREE.Color('#c9c0b2');

/**
 * Surface relief under a sticker, in the organ's local units: the z offset of
 * the host's surface at (x, y) relative to the sticker's centre (0 = flat).
 * Sampled once on a grid when the sticker lands.
 */
export class SurfaceConform {
  constructor(
    readonly n: number,
    readonly extent: number,
    readonly z: Float32Array,
  ) {}
  at(x: number, y: number): number {
    const n = this.n;
    const fx = THREE.MathUtils.clamp(((x / this.extent) * 0.5 + 0.5) * (n - 1), 0, n - 1.0001);
    const fy = THREE.MathUtils.clamp(((y / this.extent) * 0.5 + 0.5) * (n - 1), 0, n - 1.0001);
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const z = this.z;
    const a = z[iy * n + ix] * (1 - tx) + z[iy * n + ix + 1] * tx;
    const b = z[(iy + 1) * n + ix] * (1 - tx) + z[(iy + 1) * n + ix + 1] * tx;
    return a * (1 - ty) + b * ty;
  }
}

/**
 * The white vinyl border of a die-cut sticker: an elliptical ring (outer edge
 * hugging the organ by `border`), with a hair-thin darker cut edge. Faces +Z,
 * lies on the host surface (conformed), lit like everything else.
 */
export class DieCut {
  readonly mesh: THREE.Mesh;
  conform: SurfaceConform | null = null;
  /** Height above the host surface (organ units). */
  lift = 0.012;
  private readonly N: number;
  private readonly pos: THREE.BufferAttribute;
  constructor(segments = 56) {
    const N = (this.N = segments);
    const geo = new THREE.BufferGeometry();
    const p = new Float32Array(N * 4 * 3);
    const c = new Float32Array(N * 4 * 3);
    const nrm = new Float32Array(N * 4 * 3);
    for (let r = 0; r < 4; r++) {
      const col = r < 2 ? VINYL : VINYL_EDGE;
      for (let i = 0; i < N; i++) {
        const k = (r * N + i) * 3;
        c[k] = col.r;
        c[k + 1] = col.g;
        c[k + 2] = col.b;
        nrm[k + 2] = 1;
      }
    }
    const idx: number[] = [];
    const quadRing = (a: number, b: number) => {
      for (let i = 0; i < N; i++) {
        const j = (i + 1) % N;
        idx.push(a * N + i, b * N + i, b * N + j, a * N + i, b * N + j, a * N + j);
      }
    };
    quadRing(0, 1); // hole → outer (white)
    quadRing(2, 3); // outer → cut edge (grey)
    this.pos = new THREE.BufferAttribute(p, 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 2.5);
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.name = 'die-cut';
  }

  /**
   * Hole = ellipse (hx, hyT/hyB) under the organ; white border out to
   * hole + border; then a thin cut edge.
   */
  set(hx: number, hyT: number, hyB: number, border: number, edge = 0.018, cx = 0, cy = 0): void {
    this.shape((i, N, out) => {
      const a = (i / N) * Math.PI * 2;
      const sa = Math.sin(a);
      out[0] = cx + Math.cos(a) * hx;
      out[1] = cy + sa * (sa > 0 ? hyT : hyB);
      out[2] = Math.cos(a);
      out[3] = sa;
    }, border, edge);
  }

  private static tmp = [0, 0, 0, 0];
  /** Any outline: fn fills [x, y, outward dx, outward dy] for rim point i of N (counter-clockwise). */
  shape(fn: (i: number, N: number, out: number[]) => void, border: number, edge = 0.018): void {
    const N = this.N;
    const p = this.pos.array as Float32Array;
    const o = DieCut.tmp;
    for (let i = 0; i < N; i++) {
      fn(i, N, o);
      const l = Math.hypot(o[2], o[3]) || 1;
      const dx = o[2] / l;
      const dy = o[3] / l;
      for (let r = 0; r < 4; r++) {
        const g = r === 0 ? 0 : r === 3 ? border + edge : border;
        const x = o[0] + dx * g;
        const y = o[1] + dy * g;
        const k = (r * N + i) * 3;
        p[k] = x;
        p[k + 1] = y;
        p[k + 2] = (this.conform ? this.conform.at(x, y) : 0) + this.lift;
      }
    }
    this.pos.needsUpdate = true;
  }
}

/** A cap of a sphere around +Z (the pole), centred at the origin. */
function capGeometry(r: number, theta: number, ws = 40, hs = 14): THREE.SphereGeometry {
  const g = new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, theta);
  g.rotateX(Math.PI / 2); // +Y pole → +Z
  return g;
}

/** Planar UVs from the front (+Z) mapping [-half, half] onto [u0, u0+span]. */
function frontUV(g: THREE.BufferGeometry, half: number, u0: number, span: number): void {
  const p = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) uv.setXY(i, u0 + (p.getX(i) / half * 0.5 + 0.5) * span, u0 + (p.getY(i) / half * 0.5 + 0.5) * span);
}

// eye proportions (organ units, before the root scale)
const EYE_R = 0.42; // eyeball radius
const EYE_ZC = -0.35 * EYE_R; // eyeball centre, behind the surface: only a dome shows
const EYE_RL = 1.07 * EYE_R; // lid shell radius (concentric → lids can never cut the ball)
const EYE_RLU = EYE_RL * 1.012; // upper lid sits a hair outside the lower one
const EYE_SX = 1.16; // almond: the whole eye is a little wider than tall
const EYE_RHO = Math.sqrt(EYE_RL * EYE_RL - EYE_ZC * EYE_ZC); // lid footprint radius on the surface
const LID_COLS = 22;
const LID_ROWS = 7;
const LASHES = 5;
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _t = new THREE.Vector3();
const _Y = new THREE.Vector3(0, 1, 0);

/** One eyelid: a slice of a sphere shell between the surface contour and its moving edge. */
class LidShell {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private nrm: THREE.BufferAttribute;
  constructor(
    private r: number,
    private upper: boolean,
    color: THREE.ColorRepresentation,
    lineColor: THREE.ColorRepresentation,
  ) {
    const cnt = (LID_COLS + 1) * (LID_ROWS + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
    this.nrm = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nrm.setUsage(THREE.DynamicDrawUsage);
    const col = new Float32Array(cnt * 3);
    const a = new THREE.Color(color);
    const b = new THREE.Color(lineColor);
    for (let j = 0; j <= LID_COLS; j++)
      for (let k = 0; k <= LID_ROWS; k++) {
        const c = k === LID_ROWS ? b : a; // the last row is the dark lash line
        const i = (j * (LID_ROWS + 1) + k) * 3;
        col[i] = c.r;
        col[i + 1] = c.g;
        col[i + 2] = c.b;
      }
    const idx: number[] = [];
    for (let j = 0; j < LID_COLS; j++)
      for (let k = 0; k < LID_ROWS; k++) {
        const i0 = j * (LID_ROWS + 1) + k;
        const i1 = (j + 1) * (LID_ROWS + 1) + k;
        idx.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1);
      }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nrm);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 0.8);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
    this.mesh.castShadow = false;
  }

  /** Angle (from +Y over the front, about the X axis) of the surface contour at x. */
  contour(x: number): number {
    const rr = Math.sqrt(Math.max(1e-6, this.r * this.r - x * x));
    const a0 = rr > -EYE_ZC ? Math.asin(-EYE_ZC / rr) : Math.PI / 2;
    return this.upper ? a0 : Math.PI - a0;
  }

  /** Point on the shell at (x, angle a) → out. */
  point(x: number, a: number, out: THREE.Vector3): THREE.Vector3 {
    const rr = Math.sqrt(Math.max(0, this.r * this.r - x * x));
    return out.set(x, rr * Math.cos(a), rr * Math.sin(a) + EYE_ZC);
  }

  /** Lid edge angle at x, never beyond the visible window (so it never sinks into the host). */
  edgeAt(x: number, edge: number): number {
    const a0 = this.contour(x);
    return this.upper ? Math.max(a0, edge) : Math.min(a0, edge);
  }

  /** edge: angle of the lid's free edge (upper: grows to close; lower: shrinks to close). */
  set(edge: number): void {
    const p = this.pos.array as Float32Array;
    const nn = this.nrm.array as Float32Array;
    const xMax = Math.sqrt(this.r * this.r - EYE_ZC * EYE_ZC) * 0.999;
    for (let j = 0; j <= LID_COLS; j++) {
      const x = -xMax + (2 * xMax * j) / LID_COLS;
      const a0 = this.contour(x);
      const a1 = this.edgeAt(x, edge);
      for (let k = 0; k <= LID_ROWS; k++) {
        // rows bunch toward the edge (last row = a thin dark lash line)
        const f = k === LID_ROWS ? 1 : (k / (LID_ROWS - 1)) * 0.94;
        const a = a0 + (a1 - a0) * f;
        this.point(x, a, _v);
        const i = (j * (LID_ROWS + 1) + k) * 3;
        p[i] = _v.x;
        p[i + 1] = _v.y;
        p[i + 2] = _v.z;
        nn[i] = _v.x / this.r;
        nn[i + 1] = _v.y / this.r;
        nn[i + 2] = (_v.z - EYE_ZC) / this.r;
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
  }
}

/**
 * The EYE sticker come alive: a glossy dome eyeball bulging out of the host
 * through a white die-cut border, a painted iris that really rolls over the
 * ball, and pink lids that are slices of a slightly bigger concentric shell —
 * they blink, droop and follow the gaze, and can never cut through the ball
 * or sink into the host. Forward = +Z; the surface is z = 0.
 */
export class EyeVisual {
  readonly root = new THREE.Group();
  readonly pad = new DieCut(60);
  /** Everything but the pad (sinks onto curved surfaces; squashed into an almond). */
  private face = new THREE.Group();
  private irisPivot = new THREE.Group();
  private upper: LidShell;
  private lower: LidShell;
  private lashes: THREE.Mesh[] = [];
  private blinkT = -1;
  private nextBlink = 1.5 + Math.random() * 2;
  private doubleBlink = false;
  private look = new THREE.Vector2();
  private lookV = new THREE.Vector2();
  private lookWant = new THREE.Vector2();
  private jitter = new THREE.Vector2();
  private jitterT = 0;
  private lid = 0;
  /** Widen the eye (surprise), 0..1. */
  wide = 0;
  baseScale: number;
  constructor(size: number, corrupted = false) {
    this.baseScale = size;
    // eyeball: a dome (only the part above the surface exists → nothing pokes out behind thin hosts)
    const thetaS = Math.acos(-EYE_ZC / EYE_R);
    const sclGeo = capGeometry(EYE_R, thetaS + 0.02, 44, 16);
    const tex = ORGAN_ART.iris ?? null;
    // the sclera samples the painted white (with its pink veins) from the texture's corner
    frontUV(sclGeo, EYE_R, 0.02, 0.27);
    const sclera = new THREE.Mesh(
      sclGeo,
      new THREE.MeshStandardMaterial({ map: tex, color: corrupted ? '#d9c2ff' : '#ffffff', roughness: 0.18, metalness: 0, emissive: corrupted ? '#2a0048' : '#000000' }),
    );
    sclera.position.z = EYE_ZC;
    this.face.add(sclera);
    // iris + pupil: a painted patch of the same sphere that rolls about the eye's centre
    const thetaI = 0.62;
    const irisGeo = capGeometry(EYE_R * 1.004, thetaI, 32, 8);
    const half = EYE_R * Math.sin(thetaI);
    frontUV(irisGeo, half, 0.5 - 0.315, 0.63);
    const irisMat = tex
      ? new THREE.MeshStandardMaterial({ map: tex, color: corrupted ? '#d08cff' : '#ffffff', roughness: 0.1, emissive: corrupted ? '#300050' : '#000000', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })
      : new THREE.MeshStandardMaterial({ color: corrupted ? '#b23cff' : PAL.turq, roughness: 0.15, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
    const iris = new THREE.Mesh(irisGeo, irisMat);
    if (!tex) {
      const pupil = new THREE.Mesh(capGeometry(EYE_R * 1.006, 0.3, 20, 4), new THREE.MeshBasicMaterial({ color: '#141014', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -6 }));
      iris.add(pupil);
    }
    this.irisPivot.add(iris);
    this.irisPivot.position.z = EYE_ZC;
    this.irisPivot.rotation.order = 'YXZ';
    this.face.add(this.irisPivot);
    // fixed wet glint (a tiny disc lying on the ball, under the lid shell)
    const glint = new THREE.Mesh(new THREE.CircleGeometry(0.05, 12), new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -8 }));
    _n.set(-0.38, 0.42, 0.82).normalize();
    glint.position.copy(_n).multiplyScalar(EYE_R * 1.008);
    glint.position.z += EYE_ZC;
    glint.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _n);
    this.face.add(glint);
    // lids
    const lidCol = corrupted ? '#4a2366' : '#ff6fae';
    const lineCol = '#1a0f1a';
    this.upper = new LidShell(EYE_RLU, true, lidCol, lineCol);
    // where the shut lids overlap, the upper one always wins (no z-fighting)
    const um = this.upper.mesh.material as THREE.MeshStandardMaterial;
    um.polygonOffset = true;
    um.polygonOffsetFactor = -1;
    um.polygonOffsetUnits = -2;
    this.lower = new LidShell(EYE_RL, false, corrupted ? '#3a1d52' : '#ff86bd', lineCol);
    this.face.add(this.upper.mesh, this.lower.mesh);
    // curled lashes on the upper lid's edge
    const lashMat = new THREE.MeshStandardMaterial({ color: '#141014', roughness: 0.5 });
    const lashGeo = new THREE.ConeGeometry(0.028, 0.2, 5);
    lashGeo.translate(0, 0.1, 0);
    for (let i = 0; i < LASHES; i++) {
      const l = new THREE.Mesh(lashGeo, lashMat);
      this.lashes.push(l);
      this.face.add(l);
    }
    // ink outline where the eye meets the sticker
    const ring = new THREE.Mesh(new THREE.TorusGeometry(EYE_RHO + 0.014, 0.036, 6, 56), new THREE.MeshBasicMaterial({ color: '#141014' }));
    ring.scale.z = 0.6;
    ring.position.z = 0.006;
    this.face.add(ring);
    this.face.scale.x = EYE_SX;
    this.root.add(this.pad.mesh, this.face);
    this.layoutPad();
    this.root.traverse((o) => {
      o.userData.noPaint = true;
      o.castShadow = false;
    });
    this.setLids(0);
    this.root.scale.setScalar(size);
  }

  /** Conform the sticker to a curved host surface (organ units). */
  setConform(c: SurfaceConform | null): void {
    this.pad.conform = c;
    if (c) {
      // sink the eye so its rim meets the surface (the dome still clears the middle)
      let s = 0;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        s += c.at(Math.cos(a) * EYE_RHO * EYE_SX, Math.sin(a) * EYE_RHO);
      }
      this.face.position.z = Math.min(0, s / 12);
    }
    this.layoutPad();
  }

  private layoutPad(): void {
    const hx = (EYE_RHO - 0.02) * EYE_SX;
    const hy = EYE_RHO - 0.02;
    this.pad.set(hx, hy, hy, 0.11, 0.018);
  }

  /** Half extents (organ units) of the whole sticker, for sizing/placement. */
  static readonly HALF_W = (EYE_RHO + 0.11) * EYE_SX + 0.03;
  static readonly HALF_H = EYE_RHO + 0.16;

  /** 0 = wide open, 1 = shut. */
  private setLids(closed: number): void {
    const lp = this.look.y; // looking up lifts the upper lid, looking down lowers it
    const openU = 0.98 - this.wide * 0.3 - lp * 0.55;
    const openL = 2.44 + this.wide * 0.12 - Math.max(0, -lp) * 0.2;
    const eu = THREE.MathUtils.lerp(openU, 2.3, closed);
    const el = THREE.MathUtils.lerp(openL, 2.24, closed);
    this.upper.set(eu);
    this.lower.set(el);
    // lashes follow the upper lid's edge, curling up and out
    const xMax = EYE_RHO * 0.8;
    for (let i = 0; i < LASHES; i++) {
      const x = -xMax + (2 * xMax * i) / (LASHES - 1);
      const a = this.upper.edgeAt(x, eu);
      const l = this.lashes[i];
      this.upper.point(x, a, l.position);
      _n.copy(l.position).setZ(l.position.z - EYE_ZC).normalize();
      _t.set(0, Math.sin(a), -Math.cos(a)); // toward the top of the lid
      _v.copy(_n).multiplyScalar(0.7).addScaledVector(_t, 0.5);
      _v.x += x * 0.9;
      if (_v.z < 0.15) _v.z = 0.15; // never toward the host
      l.quaternion.setFromUnitVectors(_Y, _v.normalize());
      const s = 1 - Math.abs(x / xMax) * 0.35;
      l.scale.setScalar(s);
    }
  }

  /** Gaze target in radians (yaw right, pitch up) — rolled to with a quick saccade. */
  setLook(yaw: number, pitch: number): void {
    this.lookWant.set(THREE.MathUtils.clamp(yaw, -0.5, 0.5), THREE.MathUtils.clamp(pitch, -0.36, 0.36));
  }

  /** Legacy: dir in the eye's local space (x right, y up), −1..1. */
  lookAt(local: THREE.Vector2): void {
    this.setLook(local.x * 0.48, local.y * 0.34);
  }

  blink(): void {
    if (this.blinkT < 0) this.blinkT = 0;
  }

  update(dt: number, sleepy = 0): { blinked: boolean } {
    dt = Math.min(dt, 0.05);
    // tiny fixational jitter (the eye is never dead still)
    this.jitterT -= dt;
    if (this.jitterT <= 0) {
      this.jitterT = 0.35 + Math.random() * 0.9;
      this.jitter.set((Math.random() - 0.5) * 0.07, (Math.random() - 0.5) * 0.05);
    }
    // saccade dynamics: a stiff, slightly underdamped spring
    const tx = this.lookWant.x + this.jitter.x;
    const ty = this.lookWant.y + this.jitter.y;
    const w = 34;
    const big = Math.abs(tx - this.look.x) + Math.abs(ty - this.look.y);
    this.lookV.x += ((tx - this.look.x) * w * w - this.lookV.x * 2 * 0.8 * w) * dt;
    this.lookV.y += ((ty - this.look.y) * w * w - this.lookV.y * 2 * 0.8 * w) * dt;
    this.look.x += this.lookV.x * dt;
    this.look.y += this.lookV.y * dt;
    this.irisPivot.rotation.set(-this.look.y, this.look.x, 0);
    // blinking (big gaze shifts often come with a blink, like real eyes)
    let blinked = false;
    this.nextBlink -= dt;
    if (big > 0.45 && this.blinkT < 0 && Math.random() < 0.5) this.nextBlink = 0;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      blinked = true;
      this.doubleBlink = Math.random() < 0.18;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    let c = 0;
    if (this.blinkT >= 0) {
      const t = (this.blinkT += dt);
      // fast close, short hold, slower open
      c = t < 0.07 ? t / 0.07 : t < 0.11 ? 1 : t < 0.26 ? 1 - (t - 0.11) / 0.15 : 0;
      c = c * c * (3 - 2 * c);
      if (t >= 0.26) {
        this.blinkT = -1;
        if (this.doubleBlink) {
          this.doubleBlink = false;
          this.nextBlink = 0.08;
        }
      }
    }
    const want = Math.max(c, THREE.MathUtils.clamp(sleepy, 0, 1) * 0.92);
    this.lid += (want - this.lid) * Math.min(1, dt * (want > this.lid ? 60 : 30));
    this.setLids(this.lid);
    return { blinked };
  }
}

// mouth proportions (organ units)
const M_W = 0.55; // half width, corner to corner
const M_RU = 0.095; // upper lip tube radius
const M_RL = 0.12; // lower lip (fuller)
const M_SEG = 26;
const M_RAD = 7;

/** y of the upper (s = 1) or lower (s = −1) lip centre line at u ∈ [−1, 1]. */
function lipY(u: number, h: number, s: number, smile: number): number {
  const base = Math.pow(Math.max(0, 1 - u * u), 0.6);
  const bow = s > 0 ? 1 - 0.22 * Math.exp(-((u / 0.2) ** 2)) : 1;
  return s * h * base * bow + smile * u * u * 0.08;
}

/** A half tube along a lip line (front half only — the back is the sticker). */
class LipTube {
  readonly mesh: THREE.Mesh;
  private pos: THREE.BufferAttribute;
  private nrm: THREE.BufferAttribute;
  constructor(
    mat: THREE.Material,
    private s: number,
    private rad: number,
  ) {
    const cnt = (M_SEG + 1) * (M_RAD + 1);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
    this.nrm = new THREE.BufferAttribute(new Float32Array(cnt * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    this.nrm.setUsage(THREE.DynamicDrawUsage);
    const uv = new Float32Array(cnt * 2);
    const idx: number[] = [];
    for (let i = 0; i <= M_SEG; i++)
      for (let k = 0; k <= M_RAD; k++) {
        const q = i * (M_RAD + 1) + k;
        uv[q * 2] = i / M_SEG;
        uv[q * 2 + 1] = k / M_RAD;
        if (i < M_SEG && k < M_RAD) {
          const a = q;
          const b = q + M_RAD + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nrm);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
    this.mesh = new THREE.Mesh(geo, mat);
  }
  set(h: number, smile: number, conform: SurfaceConform | null): void {
    const p = this.pos.array as Float32Array;
    const nn = this.nrm.array as Float32Array;
    for (let i = 0; i <= M_SEG; i++) {
      const u = -1 + (2 * i) / M_SEG;
      const x = u * M_W;
      const y = lipY(u, h, this.s, smile);
      // in-plane normal (away from the mouth's middle) from the line's slope
      const du = 0.02;
      const dy = (lipY(Math.min(1, u + du), h, this.s, smile) - lipY(Math.max(-1, u - du), h, this.s, smile)) / ((Math.min(1, u + du) - Math.max(-1, u - du)) * M_W);
      let nx = -dy * this.s;
      let ny = 1 * this.s;
      const nl = Math.hypot(nx, ny);
      nx /= nl;
      ny /= nl;
      const r = this.rad * (0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - u * u)));
      const z0 = conform ? conform.at(x, y) : 0;
      for (let k = 0; k <= M_RAD; k++) {
        const ph = (k / M_RAD) * Math.PI; // 0 = outer edge, π = inner edge
        const c = Math.cos(ph);
        const sn = Math.sin(ph);
        const q = (i * (M_RAD + 1) + k) * 3;
        p[q] = x + nx * r * c;
        p[q + 1] = y + ny * r * c;
        p[q + 2] = z0 + 0.01 + r * sn * 0.85;
        nn[q] = nx * c;
        nn[q + 1] = ny * c;
        nn[q + 2] = sn;
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
  }
}

/**
 * A sticker mouth with real lips: glossy pink upper/lower lips (with a cupid's
 * bow) that part to talk and snap to chomp, teeth riding on each lip, a tongue,
 * a dark mouth inside, and a white die-cut border that hugs the lips as they
 * move. Forward = +Z; the surface is z = 0.
 */
export class MouthVisual {
  readonly root = new THREE.Group();
  readonly pad = new DieCut(56);
  private upLip: LipTube;
  private loLip: LipTube;
  private cavity: THREE.Mesh;
  private cavPos: THREE.BufferAttribute;
  private upperTeeth: THREE.Mesh[] = [];
  private lowerTeeth: THREE.Mesh[] = [];
  private tongue: THREE.Mesh;
  private conform: SurfaceConform | null = null;
  /** Current lip heights (upper, lower) and smile, for the die-cut outline. */
  private lh = new THREE.Vector3();
  private padShape = (i: number, N: number, out: number[]): void => {
    const a = (i / N) * Math.PI * 2;
    const u = Math.cos(a);
    const up = Math.sin(a) >= 0;
    const r = (up ? M_RU : M_RL) * (0.42 + 0.58 * Math.sqrt(Math.max(0, 1 - u * u)));
    const y = lipY(u, up ? this.lh.x : this.lh.y, up ? 1 : -1, this.lh.z);
    out[0] = u * (M_W + r * 0.8);
    out[1] = y + (up ? r : -r) * 0.9;
    out[2] = u;
    out[3] = (up ? 1 : -1) * Math.max(0.35, Math.abs(Math.sin(a)));
  };
  private open = 0.1;
  private openV = 0;
  private chompT = -1;
  private talkT = 0;
  private syl = 0;
  private sylT = 0;
  private smackT = 3 + Math.random() * 4;
  private time = Math.random() * 10;
  baseScale: number;
  constructor(size: number) {
    this.baseScale = size;
    const lipTex = ORGAN_ART.lips ?? null;
    const lipMat = new THREE.MeshStandardMaterial({ color: lipTex ? '#ffffff' : '#ff4f9a', map: lipTex, roughness: 0.22, metalness: 0.04 });
    this.upLip = new LipTube(lipMat, 1, M_RU);
    this.loLip = new LipTube(lipMat, -1, M_RL);
    // mouth inside: a strip between the two lip lines
    const cg = new THREE.BufferGeometry();
    this.cavPos = new THREE.BufferAttribute(new Float32Array((M_SEG + 1) * 2 * 3), 3);
    this.cavPos.setUsage(THREE.DynamicDrawUsage);
    const idx: number[] = [];
    for (let i = 0; i < M_SEG; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    cg.setAttribute('position', this.cavPos);
    cg.setIndex(idx);
    cg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.4);
    this.cavity = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: '#3a0a1e', side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    const toothMat = new THREE.MeshStandardMaterial({ color: '#fff8ea', roughness: 0.35 });
    const gold = new THREE.MeshStandardMaterial({ color: '#ffcf2e', metalness: 0.7, roughness: 0.25 });
    const tg = new THREE.BoxGeometry(0.115, 0.12, 0.05);
    for (let i = 0; i < 6; i++) {
      const t = new THREE.Mesh(tg, i === 4 ? gold : toothMat);
      this.upperTeeth.push(t);
      this.root.add(t);
    }
    const bg = new THREE.BoxGeometry(0.1, 0.09, 0.045);
    for (let i = 0; i < 5; i++) {
      const t = new THREE.Mesh(bg, toothMat);
      this.lowerTeeth.push(t);
      this.root.add(t);
    }
    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: '#e8355e', roughness: 0.35 }));
    this.root.add(this.pad.mesh, this.cavity, this.tongue, this.upLip.mesh, this.loLip.mesh);
    this.root.traverse((o) => {
      o.userData.noPaint = true;
      o.castShadow = false;
    });
    this.layout(0.1, 0);
    this.root.scale.setScalar(size);
  }

  static readonly HALF_W = M_W + 0.2;
  static readonly HALF_H = 0.42;

  setConform(c: SurfaceConform | null): void {
    this.conform = c;
    this.pad.conform = c;
    this.layout(this.open, 0);
  }

  private layout(o: number, smile: number): void {
    const hU = 0.07 + 0.2 * o;
    const hL = 0.05 + 0.42 * o;
    const cf = this.conform;
    this.upLip.set(hU, smile, cf);
    this.loLip.set(hL, smile, cf);
    const p = this.cavPos.array as Float32Array;
    for (let i = 0; i <= M_SEG; i++) {
      const u = -1 + (2 * i) / M_SEG;
      const x = u * M_W * 0.98;
      const yu = lipY(u, hU, 1, smile);
      const yl = lipY(u, hL, -1, smile);
      p[i * 6] = x;
      p[i * 6 + 1] = yu;
      p[i * 6 + 2] = (cf ? cf.at(x, yu) : 0) + 0.006;
      p[i * 6 + 3] = x;
      p[i * 6 + 4] = yl;
      p[i * 6 + 5] = (cf ? cf.at(x, yl) : 0) + 0.006;
    }
    this.cavPos.needsUpdate = true;
    // teeth hang from the upper lip and stand on the lower one
    this.upperTeeth.forEach((t, i) => {
      const u = -0.6 + (i / 5) * 1.2;
      const x = u * M_W;
      const y = lipY(u, hU, 1, smile) - M_RU * 0.55 - 0.05;
      t.position.set(x, y, (cf ? cf.at(x, y) : 0) + 0.04);
      t.rotation.z = -u * 0.25;
    });
    this.lowerTeeth.forEach((t, i) => {
      const u = -0.5 + (i / 4) * 1.0 + 0.06;
      const x = u * M_W;
      const y = lipY(u, hL, -1, smile) + M_RL * 0.55 + 0.035;
      t.position.set(x, y, (cf ? cf.at(x, y) : 0) + 0.035);
      t.rotation.z = u * 0.25;
    });
    // tongue rests on the lower jaw
    const tw = Math.sin(this.time * 7) * 0.04 * (this.talkT > 0 ? 1 : 0.3);
    const ty = lipY(0.15, hL, -1, smile) + M_RL * 0.6 + 0.02 + o * 0.06;
    this.tongue.position.set(0.09 + tw, ty, (cf ? cf.at(0.09, ty) : 0) + 0.02);
    this.tongue.scale.set(1.15, 0.28 + o * 0.35, 0.55);
    // the white die-cut border hugs the lips' outer edge (tapering into the corners)
    this.lh.set(hU, hL, smile);
    this.pad.shape(this.padShape, 0.075, 0.016);
  }

  chomp(): void {
    this.chompT = 0;
  }

  /** Mouth along with a line of dialogue (seconds). */
  talk(seconds: number): void {
    this.talkT = Math.max(this.talkT, seconds);
  }

  update(dt: number, idleChew = true): void {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    let target: number;
    let stiff = 18;
    if (this.chompT >= 0) {
      // gape wide, then SNAP shut (and bounce)
      const t = (this.chompT += dt);
      target = t < 0.12 ? 1 : 0;
      stiff = t < 0.12 ? 26 : 60;
      if (t > 0.3) this.chompT = -1;
    } else if (this.talkT > 0) {
      this.talkT -= dt;
      this.sylT -= dt;
      if (this.sylT <= 0) {
        this.sylT = 0.08 + Math.random() * 0.1;
        this.syl = Math.random() < 0.2 ? 0.05 : 0.25 + Math.random() * 0.55;
      }
      target = this.syl;
      stiff = 30;
    } else {
      // breathing, with the odd lip smack / tongue peek
      target = idleChew ? 0.1 + Math.sin(this.time * 1.9) * 0.05 : 0.06;
      this.smackT -= dt;
      if (this.smackT < 0.18 && this.smackT > 0) target = 0.38;
      if (this.smackT <= 0) this.smackT = 3 + Math.random() * 5;
    }
    // springy jaw (overshoots a little on the snap)
    this.openV += ((target - this.open) * stiff * stiff - this.openV * 2 * 0.55 * stiff) * dt;
    this.open = THREE.MathUtils.clamp(this.open + this.openV * dt, -0.04, 1.15);
    const smile = this.talkT > 0 ? 0.3 : 0.15 + Math.sin(this.time * 0.7) * 0.1;
    this.layout(Math.max(0, this.open), smile);
  }
}

/** The foot's sole below the ankle, in units of leg thickness (sneakerLegParts, foot scaled ×1.5 by CrookedLeg). */
const SOLE = 1.275 * 1.5;

/**
 * Two striped-sock legs in red high-tops with real two-bone IK: feet are
 * planted while the body moves (stride matched to the travelled distance, so
 * they never slide), lift and swing forward, and stand on the ground. A white
 * die-cut patch sticks each hip onto the host.
 */
export class LegsVisual {
  readonly root = new THREE.Group();
  private legs: CrookedLeg[];
  private hips: THREE.Vector3[] = [];
  private pads: DieCut[] = [];
  private padGroup = new THREE.Group();
  phase = 0;
  /** Half stride (m): the host advances `phase` by π per half stride. */
  stride = 0.25;
  readonly len: number;
  private th: number;
  private time = Math.random() * 10;
  private sitBlend = 0;
  constructor(length: number, spread: number, thickness: number) {
    this.len = length;
    this.th = thickness;
    const legMat = toon({ color: PAL.cobalt });
    const footMat = toon({ color: '#ff3b3b' });
    this.legs = [-1, 1].map((s) => {
      const l = new CrookedLeg(length / 2, length / 2, legMat, footMat, thickness, sneakerLegParts(thickness));
      l.hip.position.set(s * spread, 0, 0);
      l.hip.rotation.order = 'ZXY';
      this.hips.push(new THREE.Vector3(s * spread, 0, 0));
      this.root.add(l.hip);
      // vinyl hip patch (faces down: stuck to the host's underside)
      const pad = new DieCut(28);
      pad.lift = 0;
      pad.set(thickness * 1.25, thickness * 1.25, thickness * 1.25, thickness * 0.55, thickness * 0.12);
      pad.mesh.position.set(s * spread, 0.004, 0);
      pad.mesh.rotation.x = Math.PI / 2;
      this.pads.push(pad);
      this.padGroup.add(pad.mesh);
      return l;
    });
    this.root.add(this.padGroup);
    this.root.traverse((o) => (o.userData.noPaint = true));
  }

  /** Hip patches face the host's front instead of its underside (legs sticking out of a wall/base). */
  set padsFaceFront(on: boolean) {
    this.pads.forEach((p, i) => {
      p.mesh.rotation.x = on ? 0 : Math.PI / 2;
      p.mesh.position.set(this.hips[i].x, on ? 0 : 0.004, on ? -this.th * 0.9 : 0);
    });
  }

  /**
   * @param reach distance from the hips down to the ground
   * @param stride 0..1 walk amount
   * @param wiggle feeble kicking (anchored hosts)
   * @param sit 0..1: sitting on the ground, legs stretched out in front
   * @param frontZ how far forward the hips slide while sitting
   */
  pose(reach: number, stride: number, wiggle = 0, sit = 0, frontZ = 0, dt = 1 / 60): void {
    this.time += dt;
    this.sitBlend += (sit - this.sitBlend) * Math.min(1, dt * 6);
    const sb = this.sitBlend;
    const L1 = this.len / 2;
    const L2 = this.len / 2;
    const soleH = this.th * SOLE;
    const S = this.stride * stride;
    const H = Math.min(this.len * 0.28, this.stride * 0.9) * stride;
    for (let i = 0; i < 2; i++) {
      const leg = this.legs[i];
      const side = i === 0 ? -1 : 1;
      const ph = this.phase + i * Math.PI;
      leg.hip.position.set(this.hips[i].x, 0, frontZ * sb);
      // foot target (ankle) relative to the hip
      let tz = S * Math.cos(ph);
      const lift = H * Math.max(0, -Math.sin(ph));
      let ty = -reach + soleH + lift;
      let tx = side * this.len * 0.06;
      // crouched low: knees out, feet a little wider
      const crouch = THREE.MathUtils.clamp(1 - (reach - soleH) / (this.len * 0.85), 0, 1);
      tx += side * crouch * this.len * 0.22;
      if (wiggle > 0) {
        const k = Math.sin(this.time * 9 + i * Math.PI);
        tz += k * this.len * 0.3 * wiggle;
        ty += Math.max(0, k) * this.len * 0.2 * wiggle;
      }
      // sitting: legs stretched forward along the ground, toes up
      tz = THREE.MathUtils.lerp(tz, this.len * 0.82, sb);
      ty = THREE.MathUtils.lerp(ty, -reach + this.th * 1.1, sb);
      tx = THREE.MathUtils.lerp(tx, side * this.len * 0.12, sb);
      // splay (roll about Z), then a planar 2-bone solve (knee forward)
      const psi = Math.atan2(tx, Math.abs(ty) + 0.03);
      const down = Math.hypot(tx, ty) * (ty > 0 ? -1 : 1);
      const d = THREE.MathUtils.clamp(Math.hypot(tz, down), 0.06 * this.len, (L1 + L2) * 0.999);
      const alpha = Math.atan2(tz, down);
      const gamma = Math.acos(THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
      const th1 = alpha + gamma * (1 - sb * 0.9);
      const kz = L1 * Math.sin(th1);
      const kd = L1 * Math.cos(th1);
      const tzc = Math.sin(alpha) * d;
      const tdc = Math.cos(alpha) * d;
      const th2 = Math.atan2(tzc - kz, tdc - kd);
      leg.hip.rotation.set(-th1, 0, psi);
      leg.knee.rotation.set(-(th2 - th1), 0, 0);
      // feet stay level with the ground (toe up while swinging / sitting)
      const toe = -0.35 * (H > 0 ? lift / H : 0) - 0.9 * sb;
      leg.foot.rotation.set(th2 + toe, 0, -psi);
    }
  }
}

/** Striped-sock legs in chunky red high-tops (the Legs sticker, in 3D). Pivots at the top, 1 unit long. */
function sneakerLegParts(th: number): { thigh: THREE.Object3D; shin: THREE.Object3D; foot: THREE.Object3D; partLen: number } {
  const r = th / 1.65;
  const sockMat = ORGAN_ART.sock
    ? new THREE.MeshStandardMaterial({ map: (() => { const t = ORGAN_ART.sock!.clone(); t.needsUpdate = true; t.repeat.set(1, 2); return t; })(), roughness: 0.9 })
    : toon({ color: PAL.pink });
  const tube = (r0: number, r1: number) => {
    const g = new THREE.Group();
    const m = paintedMesh(new THREE.CylinderGeometry(r0, r1, 1, 12), sockMat, 0.012);
    m.position.y = -0.5;
    g.add(m);
    return g;
  };
  const foot = new THREE.Group();
  const red = toon({ color: '#ff3b3b' });
  const white = toon({ color: '#fbf6ec' });
  const shoe = paintedMesh(new THREE.BoxGeometry(th * 2.0, th * 1.5, th * 3.0), red, 0.015);
  shoe.position.set(0, -th * 0.2, th * 0.55);
  const sole = paintedMesh(new THREE.BoxGeometry(th * 2.15, th * 0.45, th * 3.2), white, 0.012);
  sole.position.set(0, -th * 1.05, th * 0.6);
  const toe = paintedMesh(new THREE.SphereGeometry(th * 0.95, 10, 8), white, 0.01);
  toe.scale.set(1.05, 0.6, 0.8);
  toe.position.set(0, -th * 0.6, th * 1.95);
  const collar = paintedMesh(new THREE.CylinderGeometry(th * 0.95, th, th * 0.9, 12), red, 0.012);
  collar.position.y = th * 0.5;
  foot.add(shoe, sole, toe, collar);
  return { thigh: tube(r * 1.05, r * 0.9), shin: tube(r * 0.9, r * 0.8), foot, partLen: 1 };
}
