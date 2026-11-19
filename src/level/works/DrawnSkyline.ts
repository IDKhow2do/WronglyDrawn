/**
 * [INPUT]: depends on three (ShaderMaterial, CanvasTexture, CylinderGeometry); GameContext (events 'face:woken' /
 *          'city:awake', root) from core/Context
 * [OUTPUT]: exports buildSkyline() → DrawnSkyline { group, colour (0..1 target), setColour(), dispose() }
 * [POS]: Limp Works' backdrop: the drawn city round the Correction Tower, seen for real from the roof.
 *        WorksShell.buildAtmosphere builds it in place of the old single painted ring; LimpWorks only toggles
 *        group.visible with the roof floor. Story: "the city that stays drawn wrong, and that is fine".
 *        Its red correction marks fade and its colour comes back as the Guardians wake; it is at its brightest when
 *        the Red Pen draws ('city:awake'). It listens to those events itself: nobody has to drive it.
 *
 * How it is drawn (cheap): four crayon-and-marker ring layers (canvas textures painted once at load, alpha-cut,
 * different radii = parallax as WAI crosses the roof), one sheet of red marks per near layer, and one mesh of
 * cards (the sun with a face, a whale blimp, a kite, a balloon, scribbled clouds) cut from one atlas.
 * 6 draw calls. All motion is in the shaders (sway, line boil, blinking windows, drifting cards): no canvas is
 * redrawn after load.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';

export interface DrawnSkyline {
  readonly group: THREE.Group;
  /** Colour now (0 = grey and crossed out, 1 = the city at its brightest). Eases toward the target. */
  readonly colour: number;
  /** Set the target colour (0..1); eases there over a few seconds. */
  setColour(k: number): void;
  dispose(): void;
}

// ───────────── crayon helpers ─────────────
type G = CanvasRenderingContext2D;
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const INK = '#2a2230';
/** The lit-window colour: the shader finds it and makes those windows blink. */
const WIN = '#ffe14d';

/** A wobbly closed outline through the points, drawn twice like a child going over it again. */
function wobblyPath(g: G, pts: [number, number][], r: () => number, j: number): void {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = (r() - 0.5) * j, jy = (r() - 0.5) * j;
    if (i === 0) g.moveTo(x + jx, y + jy);
    else {
      const [px, py] = pts[i - 1];
      g.quadraticCurveTo((px + x) / 2 + (r() - 0.5) * j * 2, (py + y) / 2 + (r() - 0.5) * j * 2, x + jx, y + jy);
    }
  });
  g.closePath();
}

/** Fill with crayon: the colour, then a hatch of lighter and darker wax strokes, then a doubled ink outline. */
function crayon(g: G, pts: [number, number][], fill: string, r: () => number, lw = 4, hatch = true): void {
  g.save();
  wobblyPath(g, pts, r, 3);
  g.fillStyle = fill;
  g.fill();
  if (hatch) {
    g.clip();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x0 = Math.min(...xs) - 20, x1 = Math.max(...xs) + 20, y0 = Math.min(...ys) - 20, y1 = Math.max(...ys) + 20;
    g.lineWidth = 2.5;
    g.globalAlpha = 0.2;
    const ang = 0.6 + r() * 0.5;
    for (let x = x0 - (y1 - y0); x < x1; x += 5 + r() * 4) {
      g.strokeStyle = r() < 0.3 ? '#ffffff' : r() < 0.6 ? '#3a1050' : fill;
      g.beginPath();
      g.moveTo(x, y1);
      g.lineTo(x + (y1 - y0) * ang, y0);
      g.stroke();
    }
    g.globalAlpha = 1;
  }
  g.restore();
  g.strokeStyle = INK;
  g.lineJoin = g.lineCap = 'round';
  for (let k = 0; k < 2; k++) {
    g.lineWidth = lw * (k ? 0.55 : 1);
    wobblyPath(g, pts, r, 3.5);
    g.stroke();
  }
}

function line(g: G, pts: [number, number][], w: number, col: string): void {
  g.strokeStyle = col;
  g.lineWidth = w;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.stroke();
}

const PAINT = ['#ff6fae', '#ffcf3a', '#4fb8ff', '#ff8a3a', '#a98bff', '#4fd6a8', '#ff5a6a', '#7fe0ff', '#ffa6d6', '#b6f26a'];
const ROOF = ['#d6304a', '#3a4bd0', '#8a3fd0', '#ff7a1a', '#1fa89a', '#e83fa0'];

// ───────────── one building, drawn wrong on purpose ─────────────
interface Built {
  x: number;
  w: number;
  top: number;
}
/** Draws one building whose foot is at (x, base), up to `h` px tall. Returns its box (for the red marks). */
function building(g: G, x: number, base: number, w: number, h: number, kind: number, r: () => number): Built {
  const lean = (r() - 0.5) * w * 0.7;
  const fill = PAINT[Math.floor(r() * PAINT.length)];
  const roofC = ROOF[Math.floor(r() * ROOF.length)];
  const windows = (x0: number, y0: number, ww: number, hh: number, lx: number) => {
    const cols = Math.max(1, Math.round(ww / 22)), rows = Math.max(1, Math.round(hh / 26));
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        if (r() < 0.25) continue;
        const k = j / rows;
        const cx = x0 + ((i + 0.5) / cols) * ww + lx * (1 - k), cy = y0 - ((j + 0.5) / rows) * hh;
        const s = 5 + r() * 4;
        g.fillStyle = r() < 0.6 ? WIN : '#3a3150';
        g.fillRect(cx - s / 2, cy - s * 0.6, s, s * 1.2);
        g.strokeStyle = INK;
        g.lineWidth = 1.5;
        g.strokeRect(cx - s / 2, cy - s * 0.6, s, s * 1.2);
      }
  };
  const gable = (x0: number, x1: number, y: number, tall: number) =>
    crayon(g, [[x0 - 6, y], [(x0 + x1) / 2 + (r() - 0.5) * 14, y - tall], [x1 + 6, y + (r() - 0.5) * 6]], roofC, r, 3);
  switch (kind) {
    case 1: {
      // a house on stilts: thin crooked legs, a fat box up top
      const legH = h * 0.55, top = base - legH;
      for (let i = 0; i < 3; i++) line(g, [[x + w * (0.2 + i * 0.3), base], [x + w * (0.2 + i * 0.3) + (r() - 0.5) * 14, top]], 4, INK);
      crayon(g, [[x - 4, top], [x + w + 4, top + 4], [x + w + 8 + lean * 0.3, top - h * 0.3], [x - 2 + lean * 0.3, top - h * 0.32]], fill, r);
      windows(x, top - 4, w, h * 0.24, lean * 0.3);
      gable(x + lean * 0.3 - 4, x + w + lean * 0.3 + 8, top - h * 0.31, h * 0.16);
      return { x, w, top: top - h * 0.47 };
    }
    case 2: {
      // a giraffe-necked tower: a wobbly neck with a house balanced on top
      const neckTop = base - h * 0.78;
      const nx = x + w / 2;
      const neck: [number, number][] = [[nx - 7, base], [nx + 7, base]];
      for (let k = 1; k <= 6; k++) neck.push([nx + 7 + Math.sin(k * 0.9) * 16, base - ((base - neckTop) * k) / 6]);
      for (let k = 6; k >= 1; k--) neck.push([nx - 7 + Math.sin(k * 0.9) * 16, base - ((base - neckTop) * k) / 6]);
      crayon(g, neck, PAINT[(Math.floor(r() * 10) + 3) % 10], r, 3);
      const hx = nx + Math.sin(6 * 0.9) * 16 - w * 0.4;
      crayon(g, [[hx, neckTop + 4], [hx + w * 0.8, neckTop + 6], [hx + w * 0.82, neckTop - h * 0.14], [hx - 2, neckTop - h * 0.15]], fill, r);
      windows(hx, neckTop, w * 0.8, h * 0.12, 0);
      gable(hx - 4, hx + w * 0.82 + 4, neckTop - h * 0.145, h * 0.1);
      return { x, w, top: base - h };
    }
    case 3: {
      // stairs to nowhere: a zigzag staircase climbing into the sky, a door at the top
      const steps = 7, sw = w / steps, sh = (h * 0.8) / steps;
      const pts: [number, number][] = [[x, base]];
      for (let i = 0; i < steps; i++) pts.push([x + i * sw, base - (i + 1) * sh], [x + (i + 1) * sw, base - (i + 1) * sh]);
      pts.push([x + w, base]);
      crayon(g, pts, '#f4e6c8', r, 3);
      const dx = x + w - sw, dy = base - steps * sh;
      crayon(g, [[dx, dy], [dx + sw * 0.9, dy], [dx + sw * 0.9, dy - sh * 2], [dx, dy - sh * 2]], '#ff5a6a', r, 3, false);
      g.fillStyle = INK;
      g.beginPath();
      g.arc(dx + sw * 0.7, dy - sh, 2.5, 0, 7);
      g.fill();
      return { x, w, top: dy - sh * 2 };
    }
    case 4: {
      // an upside-down house: roof on the ground, foundations in the air, smoke going down
      const top = base - h * 0.7;
      crayon(g, [[x - 6, base], [x + w / 2, base - h * 0.2], [x + w + 6, base]], roofC, r, 3);
      crayon(g, [[x, base - h * 0.2], [x + w, base - h * 0.2], [x + w + lean * 0.2, top], [x + lean * 0.2, top]], fill, r);
      windows(x, base - h * 0.22, w, h * 0.44, lean * 0.2);
      line(g, [[x + w * 0.3, top], [x + w * 0.3 + 8, top - 30], [x + w * 0.3 - 6, top - 50]], 3, '#9a94a6');
      return { x, w, top };
    }
    case 5: {
      // a spiral tower: a stack of skewed drums getting smaller, a flag on top
      let y = base, ww = w;
      let cx = x + w / 2;
      const n = 5;
      for (let i = 0; i < n; i++) {
        const hh = (h * 0.85) / n;
        cx += (r() - 0.5) * 16;
        crayon(g, [[cx - ww / 2, y], [cx + ww / 2, y + 3], [cx + ww / 2 - 4, y - hh], [cx - ww / 2 + 3, y - hh - 3]], PAINT[(i * 3 + Math.floor(r() * 3)) % 10], r, 3);
        windows(cx - ww / 2 + 4, y - 3, ww - 8, hh * 0.7, 0);
        y -= hh;
        ww *= 0.82;
      }
      line(g, [[cx, y], [cx, y - 30]], 3, INK);
      crayon(g, [[cx, y - 30], [cx + 22, y - 25], [cx, y - 18]], '#ff3fa4', r, 2, false);
      return { x, w, top: y - 30 };
    }
    default: {
      // a plain crooked house (most of the town): lean, droop, a gable or a dome or a flat crown
      const top = base - h;
      const droop = (r() - 0.5) * 18;
      crayon(g, [[x, base + 10], [x + w, base + 10], [x + w + lean, top + droop], [x + lean, top]], fill, r);
      windows(x + 3, base - 4, w - 6, h * 0.8, lean);
      const t = r();
      if (t < 0.55) gable(x + lean, x + w + lean, top + droop / 2, 22 + r() * 40);
      else if (t < 0.8) {
        g.save();
        g.fillStyle = roofC;
        g.beginPath();
        g.ellipse(x + lean + w / 2, top + droop / 2, w / 2 + 4, 20 + r() * 16, (r() - 0.5) * 0.3, Math.PI, 0);
        g.fill();
        g.lineWidth = 3;
        g.strokeStyle = INK;
        g.stroke();
        g.restore();
      } else crayon(g, [[x + lean - 4, top], [x + w + lean + 4, top + droop], [x + w + lean + 4, top + droop - 10], [x + lean - 4, top - 10]], roofC, r, 3, false);
      if (r() < 0.4) crayon(g, [[x + lean + w * 0.7, top + droop * 0.7 - 6], [x + lean + w * 0.82, top + droop * 0.8 - 6], [x + lean + w * 0.84, top - 34], [x + lean + w * 0.68, top - 32]], '#c8344a', r, 2, false);
      return { x, w, top: top - 40 };
    }
  }
}

// ───────────── the layers ─────────────
interface LayerSpec {
  seed: number;
  r: number;
  y0: number;
  y1: number;
  rep: number;
  /** building height range (fraction of canvas height) and how often a wild one shows up */
  hMin: number;
  hMax: number;
  wild: number;
  /** pale distance tint (0 = none) */
  haze: number;
  marks: boolean;
}
const LAYERS: LayerSpec[] = [
  { seed: 11, r: 250, y0: -40, y1: 105, rep: 3, hMin: 0.35, hMax: 0.75, wild: 0.25, haze: 0.45, marks: false },
  { seed: 23, r: 200, y0: -40, y1: 80, rep: 3, hMin: 0.3, hMax: 0.7, wild: 0.3, haze: 0.25, marks: false },
  { seed: 37, r: 158, y0: -35, y1: 60, rep: 4, hMin: 0.22, hMax: 0.6, wild: 0.38, haze: 0.08, marks: true },
  { seed: 51, r: 122, y0: -30, y1: 42, rep: 5, hMin: 0.16, hMax: 0.46, wild: 0.3, haze: 0, marks: true },
];
const CW = 2048, CH = 512;

function layerCanvases(L: LayerSpec): [HTMLCanvasElement, HTMLCanvasElement | null] {
  const c = document.createElement('canvas');
  c.width = CW;
  c.height = CH;
  const g = c.getContext('2d')!;
  const r = rng(L.seed);
  const built: Built[] = [];
  const base = CH - 8;
  // the ground strip (hills for the far layers) so no layer shows sky under its houses
  g.fillStyle = L.haze > 0.3 ? '#9fb0e8' : PAINT[(L.seed >> 1) % PAINT.length];
  g.beginPath();
  g.moveTo(0, CH);
  for (let x = 0; x <= CW; x += 32) g.lineTo(x, base - 30 - Math.sin((x / CW) * Math.PI * 6 + L.seed) * 14);
  g.lineTo(CW, CH);
  g.fill();
  // houses, left to right; the canvas wraps, so the last ones stop short of the seam
  for (let x = 6; x < CW - 90; ) {
    const w = 46 + r() * 70;
    const wild = r() < L.wild;
    const kind = wild ? 1 + Math.floor(r() * 5) : 0;
    const h = CH * (L.hMin + r() * (L.hMax - L.hMin)) * (kind === 2 ? 1.7 : kind === 5 ? 1.3 : 1);
    built.push(building(g, x, base - 20 + r() * 14, w, Math.min(h, CH - 30), kind, r));
    x += w * (0.55 + r() * 0.5);
  }
  // distance: a pale wash over the far layers (painted, not fog)
  if (L.haze > 0) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(200,210,245,${L.haze})`;
    g.fillRect(0, 0, CW, CH);
    g.globalCompositeOperation = 'source-over';
  }
  if (!L.marks) return [c, null];
  // the Red Pen's corrections, on their own sheet: X-ed out houses, ruler lines "straightening" them, ticks
  const m = document.createElement('canvas');
  m.width = CW / 2;
  m.height = CH / 2;
  const mg = m.getContext('2d')!;
  mg.scale(0.5, 0.5);
  const red = '#e8253a';
  for (const b of built) {
    const t = r();
    if (t < 0.3) {
      line(mg, [[b.x - 4, b.top + 10], [b.x + b.w + 6, base - 10]], 9, red);
      line(mg, [[b.x + b.w + 4, b.top + 14], [b.x - 6, base - 14]], 9, red);
    } else if (t < 0.5) {
      // a ruler-straight red line beside the crooked wall, and an arrow saying "like this"
      line(mg, [[b.x + b.w + 8, base], [b.x + b.w + 8, b.top]], 6, red);
      line(mg, [[b.x + b.w + 8, b.top], [b.x + b.w - 4, b.top + 14], [b.x + b.w + 8, b.top], [b.x + b.w + 20, b.top + 14]], 6, red);
    } else if (t < 0.62) {
      mg.strokeStyle = red;
      mg.lineWidth = 6;
      mg.beginPath();
      mg.ellipse(b.x + b.w / 2, (b.top + base) / 2, b.w * 0.7, (base - b.top) * 0.55, 0.1, 0, 7);
      mg.stroke();
    }
  }
  return [c, m];
}

// ───────────── the card atlas: sun, whale blimp, kite, balloon, clouds ─────────────
const ATLAS = 1024;
/** Atlas cells [u0, v0, u1, v1] (v up). */
const CELL = {
  sun: [0, 0.5, 0.5, 1],
  whale: [0.5, 0.75, 1, 1],
  kite: [0.5, 0.5, 0.625, 0.75],
  balloon: [0.625, 0.5, 0.75, 0.75],
  cloudA: [0, 0.25, 0.5, 0.5],
  cloudB: [0.5, 0.25, 1, 0.5],
  cloudC: [0, 0, 0.5, 0.25],
  house: [0.75, 0.5, 1, 0.75],
  rainbow: [0.5, 0, 1, 0.25],
} as const;

function atlasCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  const g = c.getContext('2d')!;
  const r = rng(91);
  const px = (cell: readonly number[]) => [cell[0] * ATLAS, (1 - cell[3]) * ATLAS, (cell[2] - cell[0]) * ATLAS, (cell[3] - cell[1]) * ATLAS];
  // the sun with a face, rays like a child draws them
  {
    const [x, y, w] = px(CELL.sun);
    const cx = x + w / 2, cy = y + w / 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r0 = 150, r1 = i % 2 ? 230 : 250;
      crayon(g, [[cx + Math.cos(a - 0.1) * r0, cy + Math.sin(a - 0.1) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a + 0.1) * r0, cy + Math.sin(a + 0.1) * r0]], i % 2 ? '#ff9a3a' : '#ffd23a', r, 4);
    }
    const disc: [number, number][] = [];
    for (let i = 0; i < 18; i++) disc.push([cx + Math.cos((i / 18) * 6.283) * 150, cy + Math.sin((i / 18) * 6.283) * 150]);
    crayon(g, disc, '#ffe14d', r, 7);
    // face: sleepy happy eyes, rosy cheeks, a big smile
    for (const s of [-1, 1]) {
      line(g, [[cx + s * 60 - 26, cy - 30], [cx + s * 60, cy - 46], [cx + s * 60 + 26, cy - 30]], 9, INK);
      g.fillStyle = '#ff7aa8';
      g.beginPath();
      g.ellipse(cx + s * 88, cy + 22, 26, 16, 0, 0, 7);
      g.fill();
    }
    g.strokeStyle = INK;
    g.lineWidth = 10;
    g.beginPath();
    g.arc(cx, cy + 10, 70, 0.25, Math.PI - 0.25);
    g.stroke();
  }
  // a whale-shaped blimp with a gondola and a tail fin
  {
    const [x, y, w, h] = px(CELL.whale);
    const cx = x + w * 0.47, cy = y + h * 0.42;
    const body: [number, number][] = [];
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      body.push([cx + Math.cos(a) * 190 * (a > Math.PI / 2 && a < (3 * Math.PI) / 2 ? 1 : 1.12), cy + Math.sin(a) * 78 * (Math.sin(a) > 0 ? 1.15 : 1)]);
    }
    crayon(g, [[cx + 190, cy], [cx + 250, cy - 70], [cx + 236, cy], [cx + 254, cy + 64]], '#4f8aff', r, 4);
    crayon(g, body, '#5fa8ff', r, 6);
    crayon(g, [[cx - 150, cy + 20], [cx + 60, cy + 40], [cx + 40, cy + 78], [cx - 140, cy + 70]], '#cfe8ff', r, 3);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(cx - 120, cy - 16, 12, 0, 7);
    g.fill();
    line(g, [[cx - 168, cy + 10], [cx - 120, cy + 30]], 6, INK);
    line(g, [[cx - 40, cy - 74], [cx - 52, cy - 110], [cx - 30, cy - 120]], 5, '#7fe0ff');
    line(g, [[cx - 40, cy - 74], [cx - 20, cy - 108]], 5, '#7fe0ff');
    for (const gx of [-30, 40]) line(g, [[cx + gx, cy + 70], [cx + gx, cy + 98]], 3, INK);
    crayon(g, [[cx - 50, cy + 96], [cx + 60, cy + 96], [cx + 50, cy + 122], [cx - 40, cy + 122]], '#ff8a3a', r, 3);
  }
  // a kite with a bow tail
  {
    const [x, y, w] = px(CELL.kite);
    const cx = x + w / 2;
    crayon(g, [[cx, y + 8], [x + w - 10, y + 70], [cx, y + 150], [x + 10, y + 70]], '#ff3fa4', r, 4);
    line(g, [[cx, y + 8], [cx, y + 150]], 3, INK);
    line(g, [[x + 10, y + 70], [x + w - 10, y + 70]], 3, INK);
    line(g, [[cx, y + 150], [cx - 14, y + 180], [cx + 10, y + 210], [cx - 8, y + 250]], 3, INK);
    for (const ty of [180, 214, 244]) crayon(g, [[cx - 14, ty - 8], [cx + 12, ty + 6], [cx - 14, ty + 8], [cx + 12, ty - 8]], ty % 2 ? '#ffd23a' : '#4fd6a8', r, 2, false);
  }
  // a hot-air balloon striped like a beach ball
  {
    const [x, y, w] = px(CELL.balloon);
    const cx = x + w / 2, cy = y + 80;
    const env: [number, number][] = [];
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      env.push([cx + Math.cos(a) * 54, cy + Math.sin(a) * (Math.sin(a) > 0 ? 82 : 66)]);
    }
    crayon(g, env, '#ffcf3a', r, 4);
    for (const s of [-1, 1]) line(g, [[cx + s * 20, cy - 64], [cx + s * 26, cy + 70]], 9, s > 0 ? '#ff5a6a' : '#4fb8ff');
    crayon(g, [[cx - 18, cy + 150], [cx + 18, cy + 150], [cx + 16, cy + 176], [cx - 16, cy + 176]], '#a77a5a', r, 3, false);
    for (const s of [-1, 1]) line(g, [[cx + s * 30, cy + 74], [cx + s * 16, cy + 150]], 2, INK);
  }
  // a little house carried by balloons
  {
    const [x, y, w] = px(CELL.house);
    const hx = x + w * 0.3, hy = y + 170;
    for (let i = 0; i < 5; i++) {
      const bx = x + 40 + i * 38, by = y + 30 + (i % 2) * 26;
      line(g, [[bx, by + 22], [hx + 40, hy - 40]], 2, INK);
      g.fillStyle = PAINT[(i * 3) % PAINT.length];
      g.beginPath();
      g.ellipse(bx, by, 20, 24, 0, 0, 7);
      g.fill();
      g.lineWidth = 3;
      g.strokeStyle = INK;
      g.stroke();
    }
    crayon(g, [[hx, hy], [hx + 80, hy + 4], [hx + 82, hy + 70], [hx - 2, hy + 66]], '#ff8a3a', r, 4);
    crayon(g, [[hx - 10, hy + 2], [hx + 40, hy - 40], [hx + 92, hy + 6]], '#3a4bd0', r, 3);
    g.fillStyle = WIN;
    g.fillRect(hx + 26, hy + 22, 22, 22);
  }
  // scribbled clouds: puffy outlines with a scribble inside
  const cloud = (cell: readonly number[], seed: number) => {
    const [x, y, w, h] = px(cell);
    const rr = rng(seed);
    const pts: [number, number][] = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI;
      pts.push([x + w / 2 + Math.cos(a) * w * 0.44, y + h * 0.7 + Math.sin(a) * h * (0.42 + rr() * 0.2)]);
    }
    pts.push([x + w * 0.9, y + h * 0.82], [x + w * 0.1, y + h * 0.82]);
    crayon(g, pts, '#fdfbff', rr, 5, false);
    g.strokeStyle = '#b8c6ff';
    g.lineWidth = 3;
    g.beginPath();
    for (let k = 0; k < 26; k++) g[k ? 'lineTo' : 'moveTo'](x + w * (0.25 + rr() * 0.5), y + h * (0.45 + rr() * 0.3));
    g.stroke();
  };
  // a crayon rainbow, each band a scribble
  {
    const [x, y, w, h] = px(CELL.rainbow);
    const cx = x + w / 2, cy = y + h - 6;
    ['#ff4a5a', '#ff9a3a', '#ffd23a', '#5fd66a', '#4fb8ff', '#a98bff'].forEach((col, i) => {
      const rad = w * 0.46 - i * 17;
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = col;
        g.lineWidth = 15 - k * 3;
        g.globalAlpha = k ? 0.6 : 1;
        g.beginPath();
        g.ellipse(cx + (r() - 0.5) * 4, cy, rad, Math.min(h - 14, rad * 0.95) - i * 2, 0, Math.PI, 0);
        g.stroke();
      }
      g.globalAlpha = 1;
    });
    // birds: little "m" scribbles over it
    for (let i = 0; i < 5; i++) {
      const bx = x + 60 + i * 80 + r() * 30, by = y + 40 + r() * 60;
      line(g, [[bx - 14, by], [bx - 6, by - 8], [bx, by], [bx + 6, by - 8], [bx + 14, by]], 4, INK);
    }
  }
  cloud(CELL.cloudA, 3);
  cloud(CELL.cloudB, 7);
  cloud(CELL.cloudC, 13);
  return c;
}

// ───────────── shaders ─────────────
const GRADE = /* glsl */ `
  uniform float colour;
  vec3 grade(vec3 c) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    vec3 grey = vec3(l) * vec3(0.92, 0.9, 0.98);
    // grey and flat when corrected, past full saturation when it is free
    vec3 o = mix(grey, c, 0.25 + 0.75 * colour);
    return mix(o, clamp(l + (c - l) * 1.25, 0.0, 1.0), smoothstep(0.75, 1.0, colour) * 0.6);
  }`;

const LAYER_VS = /* glsl */ `
  uniform float time; uniform float rep;
  varying vec2 vUv;
  void main() {
    vUv = vec2(uv.x * rep, uv.y);
    vec3 p = position;
    // the whole street sways a little, more at the top: drawn things never stand quite still
    float ang = atan(p.z, p.x);
    float sway = sin(time * 0.7 + ang * 9.0) * 0.012 * uv.y * uv.y;
    p.xz += vec2(-sin(ang), cos(ang)) * sway * length(p.xz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const LAYER_FS = /* glsl */ `
  uniform sampler2D map; uniform sampler2D marks; uniform float hasMarks; uniform float time; uniform float rep;
  ${GRADE}
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main() {
    // line boil: the drawing shifts a hair four times a second, like a flip-book
    float b = floor(time * 4.0);
    vec2 uv = vUv + (vec2(h(vec2(b, 1.0)), h(vec2(b, 2.0))) - 0.5) * vec2(0.0006, 0.002);
    vec4 t = texture2D(map, uv);
    if (t.a < 0.5) discard;
    vec3 c = t.rgb;
    // lit windows blink: each window cell has its own slow rhythm
    float win = 1.0 - smoothstep(0.08, 0.2, distance(c, vec3(1.0, 0.88, 0.3)));
    vec2 cell = floor(uv * vec2(1024.0 / max(rep, 1.0) * rep, 96.0));
    float on = step(0.35, fract(h(cell) + time * (0.03 + 0.05 * h(cell + 7.0))));
    c = mix(c, mix(vec3(0.35, 0.28, 0.45), vec3(1.0, 0.95, 0.55), on), win);
    c = grade(c);
    if (hasMarks > 0.5) {
      vec4 m = texture2D(marks, uv);
      c = mix(c, m.rgb, m.a * clamp((1.0 - colour) * 1.4, 0.0, 1.0));
    }
    gl_FragColor = vec4(c, 1.0);
    #include <colorspace_fragment>
  }`;

const CARD_VS = /* glsl */ `
  attribute vec4 place; attribute vec4 cell; attribute vec4 anim;
  uniform float time;
  varying vec2 vUv;
  void main() {
    // place: angle round the tower, radius, height, size; anim: kind, speed, phase, aspect
    float kind = anim.x;
    float a = place.x + (kind == 1.0 ? time * anim.y : 0.0);
    vec3 c = vec3(cos(a) * place.y, place.z, sin(a) * place.y);
    vec2 q = position.xy * vec2(place.w * anim.w, place.w);
    if (kind == 2.0) c.y += sin(time * anim.y + anim.z) * 3.0;
    if (kind == 3.0) {
      // the kite: a lazy figure-of-eight, nodding as it goes
      c.y += sin(time * anim.y * 2.0 + anim.z) * 5.0;
      a += sin(time * anim.y + anim.z) * 0.05;
      c.xz = vec2(cos(a), sin(a)) * place.y;
      float r = sin(time * anim.y * 2.0 + anim.z + 1.0) * 0.35;
      q = vec2(q.x * cos(r) - q.y * sin(r), q.x * sin(r) + q.y * cos(r));
    }
    if (kind == 4.0) {
      float r = time * 0.08;
      q = vec2(q.x * cos(r) - q.y * sin(r), q.x * sin(r) + q.y * cos(r));
    }
    // the card faces the tower (it is part of the ring's drawing)
    vec3 right = normalize(vec3(-sin(a), 0.0, cos(a)));
    vec3 p = c + right * q.x + vec3(0.0, q.y, 0.0);
    vUv = mix(cell.xy, cell.zw, position.xy * 0.5 + 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const CARD_FS = /* glsl */ `
  uniform sampler2D map; uniform float time;
  ${GRADE}
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.5) discard;
    gl_FragColor = vec4(grade(t.rgb), 1.0);
    #include <colorspace_fragment>
  }`;

function tex(c: HTMLCanvasElement, wrap: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (wrap) t.wrapS = THREE.RepeatWrapping;
  return t;
}

// ───────────── build ─────────────
export function buildSkyline(ctx: GameContext): DrawnSkyline {
  const group = new THREE.Group();
  group.name = 'works-skyline';
  group.userData.noPaint = true;
  const time = { value: 0 };
  const colour = { value: 0.3 };
  let target = 0.3;
  const disposables: { dispose(): void }[] = [];

  for (const L of LAYERS) {
    const [c, m] = layerCanvases(L);
    const map = tex(c, true);
    const marks = m ? tex(m, true) : null;
    const geo = new THREE.CylinderGeometry(L.r, L.r, L.y1 - L.y0, 64, 1, true);
    geo.translate(0, (L.y0 + L.y1) / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, marks: { value: marks ?? map }, hasMarks: { value: marks ? 1 : 0 }, time, colour, rep: { value: L.rep } },
      vertexShader: LAYER_VS,
      fragmentShader: LAYER_FS,
      side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.y = L.seed; // each layer starts its street somewhere else
    mesh.frustumCulled = false;
    mesh.name = `skyline-layer-${L.r}`;
    group.add(mesh);
    disposables.push(geo, mat, map, ...(marks ? [marks] : []));
  }

  // the cards: [cell, angle, radius, height, size, kind, speed, phase]
  const T = Math.PI * 2;
  const cards: [readonly number[], number, number, number, number, number, number, number][] = [
    [CELL.sun, 0.9, 235, 96, 30, 4, 0, 0],
    [CELL.whale, 2.6, 175, 58, 15, 1, 0.012, 0],
    [CELL.whale, 5.3, 215, 70, 11, 1, 0.009, 0],
    [CELL.kite, 4.1, 132, 44, 4.5, 3, 0.5, 0],
    [CELL.kite, 1.7, 140, 40, 3.8, 3, 0.6, 2.1],
    [CELL.balloon, 3.6, 165, 48, 6, 2, 0.4, 1],
    [CELL.balloon, 0.2, 190, 56, 5, 2, 0.35, 2.5],
    [CELL.house, 4.8, 180, 54, 8, 2, 0.3, 0.7],
    [CELL.rainbow, 3.9, 245, 62, 34, 0, 0, 0],
    [CELL.whale, 0.5, 150, 46, 7, 1, -0.015, 0],
    [CELL.kite, 3.0, 128, 38, 3.5, 3, 0.55, 4.2],
  ];
  for (let i = 0; i < 14; i++) {
    const cell = [CELL.cloudA, CELL.cloudB, CELL.cloudC][i % 3];
    cards.push([cell, (i / 14) * T + (i % 3) * 0.3, 205 + (i % 4) * 14, 62 + (i % 5) * 7, 12 + (i % 3) * 4, 1, 0.004 + (i % 4) * 0.002, 0]);
  }
  const n = cards.length;
  const quad = new THREE.PlaneGeometry(2, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const place = new Float32Array(n * 4), cell = new Float32Array(n * 4), anim = new Float32Array(n * 4);
  cards.forEach(([cl, a, r, y, s, kind, speed, phase], i) => {
    place.set([a, r, y, s], i * 4);
    cell.set(cl as number[], i * 4);
    const aspect = ((cl[2] - cl[0]) / (cl[3] - cl[1]));
    anim.set([kind, speed, phase, aspect], i * 4);
  });
  geo.setAttribute('place', new THREE.InstancedBufferAttribute(place, 4));
  geo.setAttribute('cell', new THREE.InstancedBufferAttribute(cell, 4));
  geo.setAttribute('anim', new THREE.InstancedBufferAttribute(anim, 4));
  geo.instanceCount = n;
  const atlas = tex(atlasCanvas(), false);
  const cardMat = new THREE.ShaderMaterial({ uniforms: { map: { value: atlas }, time, colour }, vertexShader: CARD_VS, fragmentShader: CARD_FS, side: THREE.DoubleSide });
  const cardMesh = new THREE.Mesh(geo, cardMat);
  cardMesh.frustumCulled = false;
  cardMesh.name = 'skyline-cards';
  group.add(cardMesh);
  disposables.push(geo, quad, cardMat, atlas);

  // time and colour advance right before the skyline is drawn (nothing to call each frame)
  let last = performance.now();
  cardMesh.onBeforeRender = () => {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time.value += dt;
    colour.value += (target - colour.value) * Math.min(1, dt * 0.6);
  };

  // the story drives it: each Guardian woken gives the city some colour back; the Red Pen drawing gives it all
  const offs = [
    ctx.events.on('face:woken', ({ count }) => (target = Math.max(target, Math.min(0.8, 0.3 + count * 0.16)))),
    ctx.events.on('city:awake', () => (target = 1)),
  ];

  ctx.root.add(group);
  const api: DrawnSkyline = {
    group,
    get colour() {
      return colour.value;
    },
    setColour(k: number) {
      target = THREE.MathUtils.clamp(k, 0, 1);
    },
    dispose() {
      for (const o of offs) o();
      for (const d of disposables) d.dispose();
      group.removeFromParent();
    },
  };
  // reachable from the scene too (dev tools, the story): scene.getObjectByName('works-skyline').userData.skyline
  group.userData.skyline = api;
  return api;
}
