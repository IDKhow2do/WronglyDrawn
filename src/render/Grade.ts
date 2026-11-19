import * as THREE from 'three';

/**
 * [INPUT]: three (Matrix3/Vector, DataTexture); CSS filter strings from ArtStyle.css + Look.css + main.ts health grade
 * [OUTPUT]: Grade (uniforms, setFilter/setUrl/setWash/setPaper/tick), GRADE_GLSL (wdGrade), parseFilter, GRADE_SLOTS
 * [POS]: render/ colour-grade model; Renderer's GradePass and InkPass read its uniforms; replaces the CSS filter + overlay layers
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/**
 * The colour grade on the GPU (docs/perf/PERF.md).
 *
 * It used to be a CSS `filter` chain on the full-screen WebGL canvas plus two blend-mode overlays
 * (`.paper-grain` multiply, `.look-wash` colour). The browser's compositor then re-filtered and
 * re-blended the whole screen at *device* resolution every frame, whatever the render scale. Now
 * the same maths runs in the final full-screen pass (InkPass / the plain grade pass in Renderer):
 *
 *  · every CSS filter function (brightness, contrast, saturate, grayscale, hue-rotate, sepia,
 *    invert, opacity-free) and the LOOK's white-balance/fade matrix become 3×4 colour matrices,
 *    applied in order in sRGB with the per-step clamp the browser does;
 *  · `transition: filter .4s` (and .15s for Paint Time) is kept: matrices ease to the new value;
 *  · the colour wash is the W3C `color` blend mode, the paper is the `multiply` blend of the same
 *    feTurbulence tile (drawn once into a texture), its edge vignette and the style's paper tint.
 */

export const GRADE_SLOTS = 12;

type M = number[]; // 12 numbers: row-major 3×3 then the offset vec3

const ID: M = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

function saturateM(s: number): M {
  return [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
    0, 0, 0,
  ];
}
function hueM(deg: number): M {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return [
    0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
    0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
    0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072,
    0, 0, 0,
  ];
}
function grayM(a: number): M {
  const k = 1 - Math.min(1, a);
  return [
    0.2126 + 0.7874 * k, 0.7152 - 0.7152 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 + 0.2848 * k, 0.0722 - 0.0722 * k,
    0.2126 - 0.2126 * k, 0.7152 - 0.7152 * k, 0.0722 + 0.9278 * k,
    0, 0, 0,
  ];
}
function sepiaM(a: number): M {
  const k = 1 - Math.min(1, a);
  return [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
    0, 0, 0,
  ];
}
const diagM = (r: number, g: number, b: number, o = 0, og = o, ob = o): M => [r, 0, 0, 0, g, 0, 0, 0, b, o, og, ob];

function num(arg: string, pctDefault = 1): number {
  const t = arg.trim();
  if (!t) return pctDefault;
  if (t.endsWith('%')) return parseFloat(t) / 100;
  if (t.endsWith('turn')) return parseFloat(t) * 360;
  if (t.endsWith('rad')) return (parseFloat(t) * 180) / Math.PI;
  return parseFloat(t);
}

/** CSS `filter` string → colour matrices. `urls` resolves `url(#id)` references. */
export function parseFilter(css: string, urls: Record<string, M> = {}): M[] {
  const out: M[] = [];
  const re = /([a-z-]+)\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const [, fn, raw] = m;
    const a = raw.replace(/["']/g, '');
    switch (fn) {
      case 'brightness': {
        const v = num(a);
        out.push(diagM(v, v, v));
        break;
      }
      case 'contrast': {
        const v = num(a);
        out.push(diagM(v, v, v, 0.5 - 0.5 * v));
        break;
      }
      case 'saturate':
        out.push(saturateM(num(a)));
        break;
      case 'grayscale':
        out.push(grayM(num(a)));
        break;
      case 'sepia':
        out.push(sepiaM(num(a)));
        break;
      case 'hue-rotate':
        out.push(hueM(num(a, 0)));
        break;
      case 'invert': {
        const v = Math.min(1, num(a));
        out.push(diagM(1 - 2 * v, 1 - 2 * v, 1 - 2 * v, v));
        break;
      }
      case 'url': {
        const id = a.trim().replace(/^#/, '');
        if (urls[id]) out.push(urls[id]);
        break;
      }
      default:
        break; // blur / drop-shadow / opacity: not used on the game canvas
    }
  }
  return out;
}

/** CSS colour → its sRGB (gamma-encoded) components: the grade works in the browser's blend space. */
function srgb(css: string): { r: number; g: number; b: number } {
  const o = { r: 0, g: 0, b: 0 };
  new THREE.Color(css).getRGB(o, THREE.SRGBColorSpace);
  return o;
}

/** CSS `ease` (cubic-bezier(.25,.1,.25,1)). */
function ease(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bx = (t: number) => 3 * (1 - t) * (1 - t) * t * 0.25 + 3 * (1 - t) * t * t * 0.25 + t * t * t;
  const by = (t: number) => 3 * (1 - t) * (1 - t) * t * 0.1 + 3 * (1 - t) * t * t * 1 + t * t * t;
  let lo = 0, hi = 1, t = x;
  for (let i = 0; i < 18; i++) {
    t = (lo + hi) / 2;
    if (bx(t) < x) lo = t;
    else hi = t;
  }
  return by(t);
}

export interface PaperState {
  /** element opacity of the old `.paper-grain` (0 = off) */
  amount: number;
  /** the style's paper tint (null = transparent) */
  tint: string | null;
}

export interface WashState {
  color: string;
  /** element opacity of the old `.look-wash` */
  amount: number;
}

/** Live grade state + the uniforms the final pass reads. */
export class Grade {
  readonly uniforms = {
    gM: { value: Array.from({ length: GRADE_SLOTS }, () => new THREE.Matrix3()) },
    gO: { value: Array.from({ length: GRADE_SLOTS }, () => new THREE.Vector3()) },
    gN: { value: 0 },
    gWash: { value: new THREE.Vector4(1, 1, 1, 0) },
    gPaper: { value: new THREE.Vector4(0, 0, 0, 0) }, // tint rgb, tint alpha
    gPaperAmt: { value: 0 },
    gNoise: { value: null as THREE.Texture | null },
    gCss: { value: new THREE.Vector2(1, 1) }, // canvas size in CSS px
  };
  private from: M[] = [];
  private to: M[] = [];
  private cur: M[] = [];
  private t = 1;
  private dur = 0.4;
  private css = '\u0000';
  private urls: Record<string, M> = {};

  constructor() {
    this.loadNoise();
  }

  /** Any work for the pass at all? (false → the world renders straight to the screen) */
  get active(): boolean {
    return this.cur.length > 0 || this.to.length > 0 || this.uniforms.gWash.value.w > 0.001 || this.uniforms.gPaperAmt.value > 0.001;
  }

  /** The LOOK's `url(#wd-look)` matrix (white balance + fade). */
  setUrl(id: string, m: M): void {
    this.urls[id] = m;
    this.css = '\u0000'; // re-parse
  }

  /** Same contract as the old `canvas.style.filter = css` (eases over `seconds`, like the CSS transition). */
  setFilter(css: string, seconds = 0.4): void {
    if (css === this.css) return;
    const first = this.css === '\u0000' && this.cur.length === 0;
    this.css = css;
    const next = parseFilter(css, this.urls);
    // the list as it is right now becomes the start (padded with identities, like CSS interpolation)
    const n = Math.max(next.length, this.cur.length);
    const pad = (a: M[]) => Array.from({ length: n }, (_, i) => a[i] ?? ID);
    this.from = pad(this.cur);
    this.to = pad(next);
    this.dur = seconds;
    this.t = first || seconds <= 0 ? 1 : 0;
    if (this.t >= 1) this.cur = next;
    this.push();
  }

  setWash(w: WashState): void {
    const c = srgb(w.color);
    this.uniforms.gWash.value.set(c.r, c.g, c.b, w.amount);
  }

  setPaper(p: PaperState): void {
    if (p.tint && p.tint !== 'transparent') {
      const c = srgb(p.tint);
      this.uniforms.gPaper.value.set(c.r, c.g, c.b, 1);
    } else this.uniforms.gPaper.value.set(0, 0, 0, 0);
    this.uniforms.gPaperAmt.value = p.amount;
  }

  /** Per rendered frame: advance the filter transition. */
  tick(dt: number, cssW: number, cssH: number): void {
    this.uniforms.gCss.value.set(cssW, cssH);
    if (this.t >= 1) return;
    this.t = Math.min(1, this.t + dt / Math.max(1e-3, this.dur));
    const k = ease(this.t);
    this.cur = this.to.map((b, i) => b.map((v, j) => this.from[i][j] + (v - this.from[i][j]) * k));
    if (this.t >= 1) {
      // drop trailing identities (cheaper loop in the shader)
      while (this.cur.length && this.cur[this.cur.length - 1].every((v, j) => Math.abs(v - ID[j]) < 1e-6)) this.cur.pop();
    }
    this.push();
  }

  private push(): void {
    const u = this.uniforms;
    const n = Math.min(GRADE_SLOTS, this.cur.length);
    for (let i = 0; i < n; i++) {
      const m = this.cur[i];
      // Matrix3.set is row-major
      u.gM.value[i].set(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8]);
      u.gO.value[i].set(m[9], m[10], m[11]);
    }
    u.gN.value = n;
  }

  /** The exact `.paper-grain` noise tile (an SVG feTurbulence), rasterised once into a texture. */
  private loadNoise(): void {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const S = Math.round(240 * dpr);
    // the very same SVG as the old CSS background (feTurbulence → a flat brown at 0.9 × noise alpha)
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${S}' height='${S}' viewBox='0 0 240 240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.28  0 0 0 0 0.24  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d', { willReadFrequently: true })!;
        g.drawImage(img, 0, 0, S, S);
        const d = g.getImageData(0, 0, S, S).data; // straight (un-premultiplied) sRGB + alpha
        this.setNoise(new Uint8Array(d.buffer.slice(0)), S);
      } catch {
        this.fallbackNoise();
      }
    };
    img.onerror = () => this.fallbackNoise();
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }

  private fallbackNoise(): void {
    const S = 256;
    const a = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      a[i * 4] = 160;
      a[i * 4 + 1] = 144;
      a[i * 4 + 2] = 134;
      a[i * 4 + 3] = 96 + Math.floor(Math.random() * 64);
    }
    this.setNoise(a, S);
  }

  private setNoise(data: Uint8Array, S: number): void {
    const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    this.uniforms.gNoise.value = t;
  }
}

/** GLSL: `vec3 wdGrade(vec3 srgb, vec2 uv)` — call after tone mapping + sRGB encoding. */
export const GRADE_GLSL = /* glsl */ `
  #define GRADE_SLOTS ${GRADE_SLOTS}
  uniform mat3 gM[GRADE_SLOTS];
  uniform vec3 gO[GRADE_SLOTS];
  uniform int gN;
  uniform vec4 gWash;
  uniform vec4 gPaper;
  uniform float gPaperAmt;
  uniform sampler2D gNoise;
  uniform vec2 gCss;
  float wdLum(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }
  vec3 wdClipColor(vec3 c) {
    float l = wdLum(c);
    float n = min(c.r, min(c.g, c.b));
    float x = max(c.r, max(c.g, c.b));
    if (n < 0.0) c = l + (c - l) * l / max(l - n, 1e-5);
    if (x > 1.0) c = l + (c - l) * (1.0 - l) / max(x - l, 1e-5);
    return c;
  }
  vec3 wdGrade(vec3 c, vec2 uv) {
    c = clamp(c, 0.0, 1.0);
    // the CSS filter chain, one clamped colour matrix per function
    for (int i = 0; i < GRADE_SLOTS; i++) {
      if (i >= gN) break;
      c = clamp(gM[i] * c + gO[i], 0.0, 1.0);
    }
    // colour wash: mix-blend-mode: color (hue + saturation of the wash, luminosity of the world)
    if (gWash.w > 0.0) {
      vec3 s = gWash.rgb + (wdLum(c) - wdLum(gWash.rgb));
      c = mix(c, wdClipColor(s), gWash.w);
    }
    // paper: mix-blend-mode: multiply of [tint] < [edge vignette] < [feTurbulence grain]
    if (gPaperAmt > 0.0) {
      vec2 px = uv * gCss;
      vec3 col = gPaper.rgb;
      float a = gPaper.a;
      // radial-gradient(ellipse at center, transparent 55%, rgba(120,90,70,.35) 100%), farthest-corner
      float d = length(uv - 0.5) * 1.41421356;
      float ga = 0.35 * clamp((d - 0.55) / 0.45, 0.0, 1.0);
      vec3 gc = vec3(120.0, 90.0, 70.0) / 255.0;
      col = (gc * ga + col * a * (1.0 - ga)) / max(ga + a * (1.0 - ga), 1e-5);
      a = ga + a * (1.0 - ga);
      vec4 nz = texture2D(gNoise, px / 240.0);
      float na = nz.a;
      vec3 nc = nz.rgb;
      col = (nc * na + col * a * (1.0 - na)) / max(na + a * (1.0 - na), 1e-5);
      a = na + a * (1.0 - na);
      float k = gPaperAmt * a;
      c = c * (1.0 - k + k * col);
    }
    return c;
  }
`;
