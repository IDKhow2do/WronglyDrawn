/**
 * [INPUT]: none (pure string builders, no DOM)
 * [OUTPUT]: exports Sketch (a timed, hand-drawn SVG builder: wobbly strokes, crayon scribble fills, flat fills, hand text,
 *           groups), Pt, INK (the storybook palette), rectPts / ellipsePts / starPts (shape outlines)
 * [POS]: the drawing kit of src/story. Figures.ts draws characters with it; IntroPages / EndPages / StoryFlow compose pages.
 *        Sketch only writes SVG markup and per-element timing (--d delay, --t duration); StoryBook mounts the markup and
 *        story.css animates it (strokes draw on with pathLength=1 dashes, scribbles colour in, text writes left to right).
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */

export type Pt = [number, number];

/** Crayon box: the children's colours, the Red Pen's red, pencil grey. */
export const INK = {
  pencil: '#2b2730',
  red: '#e0262f',
  pink: '#ff4fa3',
  yellow: '#ffd23a',
  orange: '#ff8a1f',
  teal: '#22c4c0',
  blue: '#2a4be0',
  sky: '#7cc8ff',
  green: '#4cc463',
  purple: '#8a5ad8',
  cream: '#fff6e6',
  grey: '#a9a4ad',
  paper: '#fbf3e2',
} as const;

/** Small fast seeded random (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let sketches = 0;
const f1 = (n: number) => (Math.round(n * 10) / 10).toString();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function rectPts(x: number, y: number, w: number, h: number, lean = 0): Pt[] {
  // lean shifts the top edge sideways: a house that leans
  return [[x, y + h], [x + lean, y], [x + w + lean, y], [x + w, y + h]];
}

export function ellipsePts(cx: number, cy: number, rx: number, ry = rx, n = 18, rot = 0): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

export function starPts(cx: number, cy: number, r: number, inner = 0.45, rot = -Math.PI / 2): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = rot + (i / 10) * Math.PI * 2;
    const rr = i % 2 ? r * inner : r;
    out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return out;
}

export interface StrokeOpts {
  color?: string;
  w?: number;
  dur?: number;
  wob?: number;
  closed?: boolean;
  /** Cursor advance as a fraction of dur (default 0.55: strokes overlap like a quick hand). */
  step?: number;
  cls?: string;
  /** Draw a second, lighter pass (sketchy double line). */
  twice?: boolean;
  opacity?: number;
}

/**
 * A timed SVG drawing. Every element is stamped with the cursor time; the cursor walks forward as the "hand" draws,
 * so a page reads in drawing order. `at()` / `wait()` move the cursor by hand.
 */
export class Sketch {
  private parts: string[] = [];
  private defs: string[] = [];
  private r: () => number;
  private ids = 0;
  /** Seconds: when the next element starts drawing. */
  t = 0;
  /** Global speed (seconds per unit of drawing). */
  speed = 1;

  private prefix: string;

  constructor(seed = 1) {
    this.r = rng(seed);
    // clip-path ids stay unique across every sketch in the document (two pages overlap while one turns)
    this.prefix = `sk${sketches++}_`;
  }

  at(t: number): this {
    this.t = t;
    return this;
  }

  wait(dt: number): this {
    this.t += dt;
    return this;
  }

  rand(a = 0, b = 1): number {
    return a + (b - a) * this.r();
  }

  private stamp(dur: number, step = 0.55): string {
    const s = `--d:${Math.round(this.t * 100) / 100}s;--t:${Math.round(dur * this.speed * 100) / 100}s`;
    this.t += dur * this.speed * step;
    return s;
  }

  /** Resample + jitter a polyline, then smooth it into a Catmull-Rom path: the hand's wobble. */
  wobble(pts: Pt[], wob = 3, closed = false): string {
    if (pts.length < 2) return '';
    const src = closed ? [...pts, pts[0]] : pts;
    const dense: Pt[] = [];
    for (let i = 0; i < src.length - 1; i++) {
      const [ax, ay] = src[i], [bx, by] = src[i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(1, Math.round(len / 34));
      for (let k = 0; k < n; k++) dense.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
    }
    dense.push(src[src.length - 1]);
    const ph = this.rand(0, 6.28);
    const j = dense.map(([x, y], i) => [x + Math.sin(i * 1.7 + ph) * wob + this.rand(-wob, wob) * 0.5, y + Math.cos(i * 1.3 + ph) * wob + this.rand(-wob, wob) * 0.5] as Pt);
    // a hand overshoots where it closes a shape
    if (closed && j.length > 2 && wob > 0) {
      const [x0, y0] = j[0], [x1, y1] = j[1];
      j.push([x0 + (x1 - x0) * 0.35 + this.rand(-2, 2), y0 + (y1 - y0) * 0.35 + this.rand(-2, 2)]);
    }
    let d = `M${f1(j[0][0])} ${f1(j[0][1])}`;
    for (let i = 0; i < j.length - 1; i++) {
      const p0 = j[Math.max(0, i - 1)], p1 = j[i], p2 = j[i + 1], p3 = j[Math.min(j.length - 1, i + 2)];
      const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
    }
    return d;
  }

  /** A drawn line through points (draws on). */
  line(pts: Pt[], o: StrokeOpts = {}): this {
    const len = pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0) + (o.closed ? Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) : 0);
    const dur = o.dur ?? Math.min(1.1, 0.12 + len / 1400);
    const d = this.wobble(pts, o.wob ?? 3, o.closed);
    const st = this.stamp(dur, o.step);
    const op = o.opacity !== undefined ? ` opacity="${o.opacity}"` : '';
    this.parts.push(`<path class="sk ${o.cls ?? ''}" pathLength="1" d="${d}" stroke="${o.color ?? INK.pencil}" stroke-width="${o.w ?? 5}"${op} style="${st}"/>`);
    if (o.twice) {
      const d2 = this.wobble(pts, (o.wob ?? 3) * 1.4, o.closed);
      this.parts.push(`<path class="sk ${o.cls ?? ''}" pathLength="1" d="${d2}" stroke="${o.color ?? INK.pencil}" stroke-width="${Math.max(1.5, (o.w ?? 5) * 0.45)}" opacity="0.5" style="${st}"/>`);
    }
    return this;
  }

  /** A closed outline. */
  shape(pts: Pt[], o: StrokeOpts = {}): this {
    return this.line(pts, { ...o, closed: true });
  }

  /** Crayon scribble fill clipped to a shape: zig-zag strokes that colour it in. */
  scribble(pts: Pt[], color: string, o: { w?: number; angle?: number; dur?: number; gap?: number; opacity?: number; step?: number; cls?: string } = {}): this {
    const id = `${this.prefix}c${this.ids++}`;
    this.defs.push(`<clipPath id="${id}"><path d="${this.wobble(pts, 2, true)}"/></clipPath>`);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    const gap = o.gap ?? 16;
    const ang = o.angle ?? -0.5;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
    // zig-zag across the rotated bounding box
    const z: Pt[] = [];
    for (let k = -R, i = 0; k <= R; k += gap, i++) {
      const a: Pt = [-R, k], b: Pt = [R, k + gap * 0.5];
      const [p, q] = i % 2 ? [b, a] : [a, b];
      for (const [u, v] of [p, q]) z.push([cx + u * ca - v * sa, cy + u * sa + v * ca]);
    }
    let d = `M${f1(z[0][0])} ${f1(z[0][1])}`;
    for (let i = 1; i < z.length; i++) d += ` L${f1(z[i][0] + this.rand(-3, 3))} ${f1(z[i][1] + this.rand(-3, 3))}`;
    const area = (x1 - x0) * (y1 - y0);
    const dur = o.dur ?? Math.min(1.4, 0.25 + area / 260000);
    const st = this.stamp(dur, o.step ?? 0.45);
    this.parts.push(`<g clip-path="url(#${id})"><path class="sk scr ${o.cls ?? ''}" pathLength="1" d="${d}" stroke="${color}" stroke-width="${o.w ?? gap * 1.35}" opacity="${o.opacity ?? 0.88}" style="${st}"/></g>`);
    return this;
  }

  /** A flat fill that fades in (paper patches, shadows, washes). */
  wash(pts: Pt[], color: string, o: { dur?: number; opacity?: number; cls?: string; step?: number } = {}): this {
    const st = this.stamp(o.dur ?? 0.4, o.step ?? 0.3);
    this.parts.push(`<path class="skf ${o.cls ?? ''}" d="${this.wobble(pts, 2, true)}" fill="${color}" opacity="${o.opacity ?? 1}" style="${st}"/>`);
    return this;
  }

  /** A filled dot (eyes, buttons, paint splats). */
  dot(x: number, y: number, r: number, color: string = INK.pencil): this {
    const st = this.stamp(0.12, 0.4);
    this.parts.push(`<circle class="skf" cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" fill="${color}" style="${st}"/>`);
    return this;
  }

  /** Hand-written words; `font` 'hand' is the storybook hand, 'marker' the Red Pen's marker. */
  text(x: number, y: number, s: string, o: { size?: number; color?: string; rot?: number; font?: 'hand' | 'marker'; anchor?: 'start' | 'middle' | 'end'; dur?: number; weight?: number; cls?: string } = {}): this {
    const dur = o.dur ?? Math.min(1.2, 0.25 + s.length * 0.06);
    const st = this.stamp(dur, 0.7);
    const rot = o.rot ? ` transform="rotate(${o.rot} ${f1(x)} ${f1(y)})"` : '';
    this.parts.push(`<text class="skt ${o.font === 'marker' ? 'mk' : 'hd'} ${o.cls ?? ''}" x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 44}" fill="${o.color ?? INK.pencil}" text-anchor="${o.anchor ?? 'middle'}" font-weight="${o.weight ?? 700}"${rot} style="${st}">${esc(s)}</text>`);
    return this;
  }

  /** Raw markup at the cursor (already-timed pieces from elsewhere). */
  raw(svg: string): this {
    this.parts.push(svg);
    return this;
  }

  /** Wrap everything drawn inside fn in a <g> (a class for a CSS change at a time, a transform). */
  group(attrs: string, fn: () => void): this {
    this.parts.push(`<g ${attrs}>`);
    fn();
    this.parts.push('</g>');
    return this;
  }

  /** The SVG markup (viewBox 1600 × 900 unless given). `style` sets CSS variables on the layer (e.g. --g: when it greys). */
  svg(extraCls = '', style = '', viewBox = '0 0 1600 900'): string {
    return `<svg class="sb-art ${extraCls}" style="${style}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" fill="none" stroke-linecap="round" stroke-linejoin="round"><defs>${this.defs.join('')}</defs>${this.parts.join('')}</svg>`;
  }
}
