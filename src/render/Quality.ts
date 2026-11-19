/**
 * [INPUT]: GPU 信息、设备像素比、帧耗时和玩家保存的画质与帧率偏好。
 * [OUTPUT]: Quality 提供渲染帧率上限，并更新渲染分辨率与阴影。分辨率到底仍卡时调用一次 onStruggle。
 *           SOFTWARE_GPU 匹配软件渲染器的名字。
 * [POS]: 渲染器调用此模块。iOS App 限制窗口像素与喷漆贴图大小。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';

/**
 * Graphics tiers + automatic matching for old / low-end machines.
 *
 *  - At boot the tier is guessed from the GPU name, CPU cores, memory and form factor
 *    (or taken from the player's choice in the pause menu: Auto / Low / Medium / High).
 *  - While playing, dynamic resolution keeps the frame time under budget: it lowers the
 *    render scale *before* frames start to stutter and raises it again when there is headroom.
 *  - If the render scale is already at its floor and frames are still slow, Auto steps the
 *    tier down live (shadows, particles, paint resolution).
 */
export type Tier = 'low' | 'medium' | 'high';
export type TierPref = 'auto' | Tier;
export const FRAME_RATE_OPTIONS = [
  { id: 'auto', label: 'Auto' },
  { id: '30', label: '30 FPS' },
  { id: '60', label: '60 FPS' },
] as const;
export type FrameRatePref = (typeof FRAME_RATE_OPTIONS)[number]['id'];

export interface TierSettings {
  /** cap on devicePixelRatio */
  maxPixelRatio: number;
  /** dynamic-resolution floor (fraction of maxPixelRatio, in CSS pixels ≥ 0.5) */
  minScale: number;
  antialias: boolean;
  shadowSize: number;
  /** half-size of the sun's shadow box (m); < 70 = the box follows the player */
  shadowExtent: number;
  softShadows: boolean;
  /** largest paint render target per surface */
  paintMax: number;
  /** paint texels per metre */
  paintDensity: number;
  /** particle-count multiplier */
  fx: number;
}

export const TIERS: Record<Tier, TierSettings> = {
  high: { maxPixelRatio: 2, minScale: 0.6, antialias: true, shadowSize: 4096, shadowExtent: 70, softShadows: true, paintMax: 1024, paintDensity: 90, fx: 1 },
  medium: { maxPixelRatio: 1.5, minScale: 0.55, antialias: true, shadowSize: 2048, shadowExtent: 42, softShadows: true, paintMax: 1024, paintDensity: 70, fx: 0.75 },
  low: { maxPixelRatio: 1, minScale: 0.5, antialias: false, shadowSize: 1024, shadowExtent: 30, softShadows: false, paintMax: 512, paintDensity: 48, fx: 0.5 },
};

export const IOS_APP = (window as Window & { __WD_IOS_APP?: boolean }).__WD_IOS_APP === true;
export const IOS_COMPATIBILITY_MODE = IOS_APP && new URLSearchParams(location.search).get('compat') === '1';
const MOBILE_TIERS: Record<Tier, TierSettings> = {
  low: { ...TIERS.low, maxPixelRatio: 1.3, minScale: 0.8 },
  medium: { ...TIERS.medium, maxPixelRatio: 1.8, minScale: 0.72, antialias: false, shadowSize: 1024, shadowExtent: 34, paintMax: 512, paintDensity: 64, fx: 0.65 },
  high: { ...TIERS.high, maxPixelRatio: 2.25, minScale: 0.68, antialias: false, shadowSize: 2048, shadowExtent: 46, paintMax: 512, paintDensity: 64 },
};
const MOBILE_PIXELS: Record<Tier, number> = { low: 1_400_000, medium: 1_950_000, high: 3_000_000 };
const MOBILE_SHADOW_FPS: Record<Tier, number> = { low: 12, medium: 15, high: 30 };
const KEY = 'wd.gfx';
const FRAME_RATE_KEY = 'wd.fps';

function readPref(): TierPref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'low' || v === 'medium' || v === 'high' || v === 'auto') return v;
  } catch {
    /* private mode */
  }
  return 'auto';
}

/** The browser draws without the graphics card (hardware acceleration off or blocked). */
export const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/;

/** The GPU name the browser reports ('' when it hides it). */
function readGpu(): string {
  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    /* no GL info */
  }
  return gpu;
}

/** Best guess from the hardware. Errs towards smooth over pretty. */
export function detectTier(gpu: string): Tier {
  if (IOS_APP) return IOS_COMPATIBILITY_MODE ? 'low' : 'medium';
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 900);
  const g = gpu.toLowerCase();
  if (SOFTWARE_GPU.test(g)) return 'low';
  if (mobile || cores <= 2 || mem <= 2) return 'low';
  if (/rtx|radeon rx|radeon pro|apple m[2-9]|apple m1 (pro|max|ultra)|geforce gtx (10[6-8]|16)/.test(g)) return 'high';
  if (/intel.*(hd|uhd) graphics|mali|adreno|powervr|gma/.test(g)) return 'low';
  if (cores <= 4 || mem <= 4) return 'low';
  return 'medium';
}

class QualityState {
  pref: TierPref = readPref();
  frameRate: FrameRatePref = 'auto';
  detected: Tier = 'medium';
  tier: Tier = 'medium';
  /** current dynamic-resolution scale (1 = full maxPixelRatio) */
  scale = 1;
  gpu = '';
  /** the sun whose shadow box this module manages */
  sun: THREE.DirectionalLight | null = null;
  onChange: (() => void) | null = null;
  /** Once per session: frames stay slow with nothing left to lower. */
  onStruggle: (() => void) | null = null;
  private struggled = false;
  private renderer: THREE.WebGLRenderer | null = null;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private bufferWidth = 0;
  private bufferHeight = 0;
  private lastShadowFrame = -Infinity;

  constructor() {
    try {
      const saved = localStorage.getItem(FRAME_RATE_KEY);
      if (saved === '30' || saved === '60') this.frameRate = saved;
    } catch {
      /* 私密模式仍可更改本次游玩的帧率。 */
    }
  }

  get maxRenderFps(): number {
    return this.frameRate === 'auto' ? 0 : Number(this.frameRate);
  }

  setFrameRate(rate: FrameRatePref): void {
    if (rate === this.frameRate) return;
    this.frameRate = rate;
    try {
      localStorage.setItem(FRAME_RATE_KEY, rate);
    } catch {
      /* 私密模式仍可更改本次游玩的帧率。 */
    }
    this.hold(1);
    this.onChange?.();
  }

  /** The level registers its sun; the tier decides its shadow box. */
  setSun(sun: THREE.DirectionalLight): void {
    this.sun = sun;
    this.homed = false;
    this.applyShadow();
  }
  private acc = 0;
  private settle = 2;

  get s(): TierSettings {
    return (IOS_APP ? MOBILE_TIERS : TIERS)[this.tier];
  }

  /** Called once before the WebGL renderer is created. */
  init(): TierSettings {
    if (!IOS_APP) this.gpu = readGpu();
    this.detected = detectTier(this.gpu);
    this.tier = IOS_COMPATIBILITY_MODE || this.pref === 'auto' ? this.detected : this.pref;
    return this.s;
  }

  attach(r: THREE.WebGLRenderer): void {
    this.renderer = r;
    // (three r18x removed PCFSoftShadowMap: PCF + shadow.radius gives the soft edge)
    r.shadowMap.type = THREE.PCFShadowMap;
    if (IOS_APP) r.shadowMap.autoUpdate = false;
  }

  setPref(p: TierPref): void {
    this.pref = p;
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
    this.setTier(IOS_COMPATIBILITY_MODE || p === 'auto' ? this.detected : p);
    this.scale = 1;
    this.ceiling = 1;
    this.blockUntil = 0;
    this.backoff = 30;
    this.applyPixelRatio();
  }

  private setTier(t: Tier): void {
    if (t === this.tier) return;
    this.tier = t;
    this.applyShadow();
    this.applyPixelRatio();
    this.onChange?.();
  }

  private applyPixelRatio(): void {
    const renderer = this.renderer;
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    if (!renderer || !width || !height) return;
    const nativeRatio = Math.min(window.devicePixelRatio || 1, this.s.maxPixelRatio);
    const budgetRatio = IOS_APP ? Math.sqrt(MOBILE_PIXELS[this.tier] / (width * height)) : nativeRatio;
    const limit = Math.min(nativeRatio, budgetRatio);
    // iOS 优先降低阴影与特效开销。正常窗口保留至少每点一个渲染像素。
    const ratio = Math.min(limit, Math.max(IOS_APP ? 1 : 0, limit * this.scale));
    if (width === this.bufferWidth && height === this.bufferHeight && Math.abs(renderer.getPixelRatio() - ratio) < 0.005) return;
    this.bufferWidth = width;
    this.bufferHeight = height;
    renderer.setDrawingBufferSize(width, height, ratio);
  }

  /** 每帧检查更新间隔。两次更新之间复用上一张阴影图。 */
  prepareShadows(now: number): void {
    if (!IOS_APP || !this.renderer || !this.sun) return;
    if (now - this.lastShadowFrame >= 1000 / MOBILE_SHADOW_FPS[this.tier] * 0.96) {
      this.renderer.shadowMap.needsUpdate = true;
      this.lastShadowFrame = now;
    }
  }

  /** Configure the sun's shadow for the current tier (also live). */
  applyShadow(): void {
    const sun = this.sun;
    if (!sun) return;
    const s = this.s;
    if (sun.shadow.mapSize.x !== s.shadowSize) {
      sun.shadow.mapSize.set(s.shadowSize, s.shadowSize);
      sun.shadow.map?.dispose();
      (sun.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
    }
    if (IOS_APP && this.renderer) this.renderer.shadowMap.needsUpdate = true;
    sun.shadow.radius = s.softShadows ? 2.2 : 1; // a uniform: no shader recompile when the tier changes
    const e = s.shadowExtent;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e });
    sun.shadow.camera.updateProjectionMatrix();
  }

  private sunOffset = new THREE.Vector3();
  private sunHome = new THREE.Vector3();
  private sunTargetHome = new THREE.Vector3();
  private homed = false;

  /** Keep a small shadow box centred on the player, snapped to shadow texels (no shimmer). */
  /** Lower tiers: tiny level props (knobs, bulbs, crumbs) stop casting shadows — saves shadow-pass draw calls. */
  trimCasters(root: THREE.Object3D): number {
    if (this.tier === 'high') return 0;
    root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    let n = 0;
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.castShadow) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.getWorldScale(ws);
      if (m.geometry.boundingSphere!.radius * Math.max(ws.x, ws.y, ws.z) < 0.3) {
        m.castShadow = false;
        n++;
      }
    });
    return n;
  }

  followShadow(focus: THREE.Vector3): void {
    const sun = this.sun;
    if (!sun) return;
    if (!this.homed) {
      this.sunHome.copy(sun.position);
      this.sunTargetHome.copy(sun.target.position);
      this.sunOffset.subVectors(sun.position, sun.target.position);
      this.homed = true;
    }
    if (this.s.shadowExtent >= 70) {
      if (!sun.target.position.equals(this.sunTargetHome)) {
        sun.position.copy(this.sunHome);
        sun.target.position.copy(this.sunTargetHome);
      }
      return;
    }
    const texel = (this.s.shadowExtent * 2) / this.s.shadowSize;
    const snap = texel * 4;
    const x = Math.round(focus.x / snap) * snap;
    const z = Math.round(focus.z / snap) * snap;
    sun.target.position.set(x, 0, z);
    sun.position.copy(sun.target.position).add(this.sunOffset);
    sun.target.updateMatrixWorld();
  }

  private win: number[] = [];
  private slowWins = 0;
  private fastWins = 0;
  /** seconds of play counted by the tuner (for the step-up back-off) */
  private clock = 0;
  private lastRiseAt = -1e9;
  /** a step up that had to be undone soon after: no step up past `ceiling` until `blockUntil` */
  private ceiling = 1;
  private blockUntil = 0;
  private backoff = 30;

  /**
   * Per rendered frame. Decisions use the *median* frame time of 1-second windows, so a
   * lone hitch never changes anything (a resolution change is itself a GPU stall). The
   * scale only drops after 2 s of steadily slow frames and only rises after 10 s of headroom.
   */
  frame(dt: number): void {
    if (!this.renderer || dt <= 0 || dt > 0.25) return;
    this.clock += dt;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.win.push(dt);
    this.acc += dt;
    if (this.acc < 1) return;
    const w = this.win.sort((a, b) => a - b);
    const cap30 = this.frameRate === '30';
    // 30 FPS 在 50 Hz 等刷新率下会交替间隔；用整个窗口的频率判断负载。
    const frameTime = cap30 ? this.acc / w.length : w[w.length >> 1];
    this.win = [];
    this.acc = 0;
    const s = this.s;
    const slowFps = cap30 ? 27 : IOS_APP ? 36 : 52;
    const fastFps = cap30 ? 29 : IOS_APP ? 49 : 59;
    if (frameTime > 1 / slowFps) {
      this.fastWins = 0;
      if (++this.slowWins < 2) return;
      this.slowWins = 0;
      if (this.scale > s.minScale + 1e-3) {
        // At 60 Hz a frame that only *just* fits still reads as "fast", so the tuner used to climb back
        // to the scale it had just left, stall again, drop again… every ~12 s: a visible sharp/blurry
        // pumping with a GPU stall at each switch. A drop soon after a rise now pins the ceiling below
        // that scale, for a back-off that doubles each time (30 s → 60 s → … → 10 min).
        if (this.clock - this.lastRiseAt < 15) {
          this.ceiling = this.scale - 0.1 + 1e-3;
          this.blockUntil = this.clock + this.backoff;
          this.backoff = Math.min(600, this.backoff * 2);
        }
        this.scale = Math.max(s.minScale, this.scale - (frameTime > 1 / (cap30 ? 21 : 38) ? 0.2 : 0.1));
        this.applyPixelRatio();
        this.settle = 1;
      } else if (this.pref === 'auto' && this.tier !== 'low') {
        this.setTier(this.tier === 'high' ? 'medium' : 'low');
        this.scale = 0.9;
        this.applyPixelRatio();
        this.settle = 2;
      } else if (!this.struggled && frameTime > 1 / (cap30 ? 21 : 38)) {
        // 分辨率和档位都到底了还在卡：自动调节已无能为力，交给玩家。
        this.struggled = true;
        this.onStruggle?.();
      }
    } else if (frameTime < 1 / fastFps) {
      this.slowWins = 0;
      if (++this.fastWins < 10 || this.scale >= 1) return;
      if (this.clock < this.blockUntil && this.scale + 0.1 > this.ceiling) return;
      this.fastWins = 0;
      this.lastRiseAt = this.clock;
      this.scale = Math.min(1, this.scale + 0.1);
      this.applyPixelRatio();
      this.settle = 1;
    } else {
      this.slowWins = 0;
      this.fastWins = 0;
    }
  }

  /** 用当前窗口计算像素预算，折叠和展开时保留当前画质档。 */
  resized(width: number, height: number): void {
    if (width !== this.viewportWidth || height !== this.viewportHeight) this.hold(0.6);
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.applyPixelRatio();
  }

  /** Pause the auto-tuner (e.g. during loading / scripted spikes). */
  hold(sec: number): void {
    this.settle = Math.max(this.settle, sec);
    this.acc = 0;
    this.win = [];
    this.fastWins = this.slowWins = 0;
  }
}

export const Quality = new QualityState();
