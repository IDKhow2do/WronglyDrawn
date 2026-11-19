import type { Grade } from './Grade';

/**
 * LOOK — the player's own colour grade on top of the art style (Lightroom-style sliders).
 * Described as a CSS-filter-style chain (+ one colour matrix for white balance and fade, the
 * `url(#wd-look)` step) and a colour wash; the renderer's final pass applies it on the GPU
 * (src/render/Grade.ts — it used to be a CSS filter + blend-mode layers over the canvas, which the
 * browser re-composited at full screen resolution every frame). Saved in the browser.
 */
export interface LookState {
  exposure: number; // -1..1
  contrast: number; // -1..1
  saturation: number; // -1..1
  hue: number; // -180..180 (degrees)
  temp: number; // -1 cool .. 1 warm
  tint: number; // -1 green .. 1 magenta
  fade: number; // 0..1 lifted blacks (matte)
  wash: string; // colour-wash colour
  washAmt: number; // 0..1
  grain: number; // 0..1 extra paper grain
}

export const LOOK_ZERO: LookState = { exposure: 0, contrast: 0, saturation: 0, hue: 0, temp: 0, tint: 0, fade: 0, wash: '#ff9a5a', washAmt: 0, grain: 0 };

/** The author's own grade: what a new player sees first (cool, slightly matte, papery). */
export const LOOK_AUTHOR: LookState = { exposure: -0.14, contrast: 0.09, saturation: -0.04, hue: -6, temp: -0.64, tint: 0.03, fade: 0.13, wash: '#6fa8dc', washAmt: 0.04, grain: 0.49 };

export const LOOK_PRESETS: { id: string; name: string; look: Partial<LookState> }[] = [
  { id: 'author', name: 'Author’s pick', look: LOOK_AUTHOR },
  { id: 'none', name: 'Original', look: {} },
  { id: 'calm', name: 'Calmer', look: { saturation: -0.3, contrast: -0.08, fade: 0.12 } },
  { id: 'film', name: 'Warm Film', look: { temp: 0.35, saturation: -0.15, contrast: 0.08, fade: 0.25, grain: 0.35 } },
  { id: 'dusk', name: 'Cool Dusk', look: { temp: -0.4, tint: 0.15, saturation: -0.1, exposure: -0.08, wash: '#6a5be0', washAmt: 0.12 } },
  { id: 'pastel', name: 'Pastel', look: { saturation: -0.35, exposure: 0.12, contrast: -0.2, fade: 0.3 } },
  { id: 'vivid', name: 'Punchy', look: { saturation: 0.3, contrast: 0.15 } },
  { id: 'noir', name: 'Ink Noir', look: { saturation: -1, contrast: 0.25, grain: 0.4 } },
  { id: 'sepia', name: 'Old Sketch', look: { saturation: -0.75, wash: '#c9955a', washAmt: 0.45, fade: 0.2, grain: 0.5 } },
];

const KEY = 'wd.look.v1';

class LookManager {
  state: LookState = { ...LOOK_AUTHOR };
  onChange: (() => void) | null = null;
  /** Where the grade goes (the renderer's final pass; set by the app). */
  target: Grade | null = null;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<LookState> | null;
      if (s) this.state = { ...LOOK_ZERO, ...s };
    } catch {
      /* fresh */
    }
  }

  get isNeutral(): boolean {
    const s = this.state;
    return !s.exposure && !s.contrast && !s.saturation && !s.hue && !s.temp && !s.tint && !s.fade && !s.washAmt && !s.grain;
  }

  set(patch: Partial<LookState>): void {
    Object.assign(this.state, patch);
    this.commit();
  }

  /** Back to the author's pick (the game's default look). */
  reset(): void {
    this.state = { ...LOOK_AUTHOR };
    this.commit();
  }

  private commit(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* private mode */
    }
    this.apply();
    this.onChange?.();
  }

  /** Extra paper grain the art style adds to its own. */
  get grain(): number {
    return this.state.grain;
  }

  /** CSS filter chain for the canvas (the art style's own grade goes before it). */
  get css(): string {
    const s = this.state;
    const out: string[] = [];
    if (s.temp || s.tint || s.fade) out.push('url(#wd-look)');
    if (s.exposure) out.push(`brightness(${(1 + s.exposure * 0.6).toFixed(3)})`);
    if (s.contrast) out.push(`contrast(${(1 + s.contrast * 0.6).toFixed(3)})`);
    if (s.saturation) out.push(`saturate(${(s.saturation < 0 ? 1 + s.saturation : 1 + s.saturation * 1.5).toFixed(3)})`);
    if (s.hue) out.push(`hue-rotate(${Math.round(s.hue)}deg)`);
    return out.join(' ');
  }

  /** The `url(#wd-look)` step: white balance (R up / B down = warm; G down = magenta), then fade (blacks lift toward grey). */
  get matrix(): number[] {
    const s = this.state;
    const r = 1 + s.temp * 0.22 + s.tint * 0.06;
    const g = 1 - s.tint * 0.16;
    const b = 1 - s.temp * 0.22 + s.tint * 0.06;
    const k = 1 - s.fade * 0.22;
    const o = s.fade * 0.16;
    return [r * k, 0, 0, 0, g * k, 0, 0, 0, b * k, o, o, o];
  }

  /** Push the matrix and the colour wash to the renderer's grade. */
  apply(): void {
    const t = this.target;
    if (!t) return;
    t.setUrl('wd-look', this.matrix);
    t.setWash({ color: this.state.wash, amount: this.state.washAmt * 0.85 });
  }
}

export const Look = new LookManager();

// ───────────── share codes ─────────────
// A look + art style packed into 15 bytes → a short code like "WD1-AL7…" that friends can paste.
// (Compact encoding with a checksum — not encryption: there is nothing secret in a colour grade.)
const NUMS = ['exposure', 'contrast', 'saturation', 'temp', 'tint', 'fade', 'washAmt', 'grain'] as const;
const PREFIX = 'WD1-';

export function encodeLook(styleIndex: number, s: LookState): string {
  const b = new Uint8Array(15);
  b[0] = styleIndex & 255;
  NUMS.forEach((k, i) => (b[1 + i] = (Math.round(Math.max(-1, Math.min(1, s[k])) * 100) + 256) & 255));
  const hue = Math.round(Math.max(-180, Math.min(180, s.hue))) + 180;
  b[9] = hue >> 8;
  b[10] = hue & 255;
  const m = /^#?([0-9a-f]{6})$/i.exec(s.wash);
  const rgb = m ? parseInt(m[1], 16) : 0xff9a5a;
  b[11] = rgb >> 16;
  b[12] = (rgb >> 8) & 255;
  b[13] = rgb & 255;
  b[14] = b.slice(0, 14).reduce((a, v) => (a * 31 + v) & 255, 7);
  return PREFIX + btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeLook(code: string): { styleIndex: number; look: LookState } | null {
  const m = /WD1-([A-Za-z0-9_-]{20})/.exec(code.trim());
  if (!m) return null;
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    if (bin.length !== 15) return null;
    const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    if (b[14] !== b.slice(0, 14).reduce((a, v) => (a * 31 + v) & 255, 7)) return null;
    const look = { ...LOOK_ZERO };
    NUMS.forEach((k, i) => (look[k] = Math.max(k === 'fade' || k === 'washAmt' || k === 'grain' ? 0 : -1, Math.min(1, ((b[1 + i] << 24) >> 24) / 100))));
    look.hue = Math.max(-180, Math.min(180, ((b[9] << 8) | b[10]) - 180));
    look.wash = '#' + ((b[11] << 16) | (b[12] << 8) | b[13]).toString(16).padStart(6, '0');
    return { styleIndex: b[0], look };
  } catch {
    return null;
  }
}
