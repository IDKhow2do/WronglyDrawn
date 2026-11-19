/**
 * [INPUT]: depends on toTexture/PAL from render/PaintTextures; seeded from ../harbor/HarborKit; AssetManager (texture cache)
 * [OUTPUT]: exports ensureWorksTextures(assets) and signCanvas(); registers every 'w3_*' texture once per app
 * [POS]: the painted surfaces of Limp Works — blueprint floors, steel, brick, belts, rulers, filing cabinets, the
 *        crossed-out drawings, red correction marks, the window view, the roof sky and the city panorama.
 *        WorksKit turns them into materials; nothing else draws canvases for level 3. Anti-moiré rules (docs/level3/ROUND3.md):
 *        no hard line under 2 px in a tile (ruler ticks 4 px), streaks are soft bands, and steel / brick / grid / ruler carry their
 *        own soft (or blurred) relief canvas (userData.heightMap) so paint detail never turns into normal-map hairlines; anisotropy 16.
 * [PROTOCOL]: Update this header on change, then check docs/level3/PROGRESS.md
 */
import * as THREE from 'three';
import type { AssetManager } from '../../core/AssetManager';
import { PAL, toTexture } from '../../render/PaintTextures';
import { seeded } from '../harbor/HarborKit';

type G = CanvasRenderingContext2D;

function cv(w: number, h = w): [HTMLCanvasElement, G] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

/** Soft brush wash: overlapping translucent strokes in the given tones (painted, never flat). */
function wash(g: G, r: () => number, w: number, h: number, tones: string[], n: number, a: number): void {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    g.globalAlpha = a * (0.4 + r() * 0.6);
    g.strokeStyle = tones[Math.floor(r() * tones.length) % tones.length];
    g.lineWidth = w * (0.03 + r() * 0.06);
    const x = r() * w, y = r() * h, an = (r() - 0.5) * 1.1, l = w * (0.1 + r() * 0.25);
    g.beginPath();
    g.moveTo(x - Math.cos(an) * l, y - Math.sin(an) * l);
    g.quadraticCurveTo(x + (r() - 0.5) * 24, y + (r() - 0.5) * 24, x + Math.cos(an) * l, y + Math.sin(an) * l);
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** A hand-ruled line (a slight wobble: drawn, not printed). */
function ruled(g: G, r: () => number, x0: number, y0: number, x1: number, y1: number, lw: number, col: string): void {
  g.strokeStyle = col;
  g.lineWidth = lw;
  g.beginPath();
  g.moveTo(x0, y0);
  const mx = (x0 + x1) / 2 + (r() - 0.5) * 2, my = (y0 + y1) / 2 + (r() - 0.5) * 2;
  g.quadraticCurveTo(mx, my, x1, y1);
  g.stroke();
}

function speckle(g: G, r: () => number, w: number, h: number, n: number, dark = 0.12): void {
  for (let i = 0; i < n; i++) {
    g.fillStyle = r() > 0.5 ? `rgba(255,255,255,${dark})` : `rgba(0,0,20,${dark})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

/** Blueprint grid paper: 16 small cells per tile (0.25 m at 4 m tiles), a bolder line every metre. */
function gridCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const r = seeded(301);
  g.fillStyle = '#ece6d6';
  g.fillRect(0, 0, S, S);
  wash(g, r, S, S, ['#e2dccb', '#f4efe2', '#dfe4e8', '#efe2d4'], 70, 0.35);
  for (let i = 0; i <= 16; i++) {
    const p = (i * S) / 16;
    const bold = i % 4 === 0;
    // minor lines 2 px (a 1.2 px line flickered in and out of the pixel grid on the far floor), a touch lighter
    ruled(g, r, p, 0, p, S, bold ? 3 : 2, bold ? 'rgba(70,110,190,0.55)' : 'rgba(90,130,200,0.22)');
    ruled(g, r, 0, p, S, p, bold ? 3 : 2, bold ? 'rgba(70,110,190,0.55)' : 'rgba(90,130,200,0.22)');
  }
  // a few faded red ticks (old corrections)
  g.strokeStyle = 'rgba(214,40,52,0.28)';
  g.lineWidth = 4;
  for (let i = 0; i < 3; i++) {
    const x = 60 + r() * (S - 120), y = 60 + r() * (S - 120);
    g.beginPath();
    g.moveTo(x - 12, y);
    g.lineTo(x - 2, y + 12);
    g.lineTo(x + 18, y - 16);
    g.stroke();
  }
  speckle(g, r, S, S, 900, 0.08);
  return c;
}

/** Painted steel plate: blue-grey, panel seams, rivet rows, streaks. */
function steelCanvas(base: string, tones: string[], seed: number): HTMLCanvasElement {
  const S = 256;
  const [c, g] = cv(S);
  const r = seeded(seed);
  g.fillStyle = base;
  g.fillRect(0, 0, S, S);
  wash(g, r, S, S, tones, 40, 0.4);
  g.strokeStyle = 'rgba(20,18,30,0.45)';
  g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, S - 3, S - 3);
  g.beginPath();
  g.moveTo(0, S / 2);
  g.lineTo(S, S / 2);
  g.stroke();
  for (const y of [10, S / 2 - 10, S / 2 + 10, S - 10])
    for (let x = 12; x < S; x += 24) {
      g.fillStyle = 'rgba(20,18,30,0.5)';
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(x - 1, y - 1, 1.3, 0, Math.PI * 2);
      g.fill();
    }
  // weathering streaks: soft-edged bands 10–30 px wide (a 2–5 px hard line turned into a crawling hairline at a distance)
  for (let i = 0; i < 9; i++) {
    const x = r() * S, w = 10 + r() * 20;
    const gr = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    const col = r() > 0.5 ? '255,255,255' : '26,24,48';
    gr.addColorStop(0, `rgba(${col},0)`);
    gr.addColorStop(0.5, `rgba(${col},0.09)`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(x - w / 2, 0, w, S);
  }
  speckle(g, r, S, S, 260, 0.07);
  return c;
}

/**
 * The relief behind a painted surface (its normal map's height): only the big forms — panel seams, rivet heads, brick
 * courses — drawn soft. The colour canvas's streaks and speckle stay paint, not bumps: as bumps they lit up as hairlines
 * that crawl and shimmer once they are a pixel wide.
 */
function reliefCanvas(S: number, H: number, draw: (g: G) => void, blur = 1.2): HTMLCanvasElement {
  const [c, g] = cv(S, H);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, S, H);
  g.filter = `blur(${blur}px)`;
  draw(g);
  g.filter = 'none';
  return c;
}

function steelRelief(): HTMLCanvasElement {
  const S = 256;
  return reliefCanvas(S, S, (g) => {
    g.strokeStyle = '#404040';
    g.lineWidth = 4;
    g.strokeRect(2, 2, S - 4, S - 4);
    g.beginPath();
    g.moveTo(0, S / 2);
    g.lineTo(S, S / 2);
    g.stroke();
    g.fillStyle = '#d8d8d8';
    for (const y of [10, S / 2 - 10, S / 2 + 10, S - 10])
      for (let x = 12; x < S; x += 24) {
        g.beginPath();
        g.arc(x, y, 3.2, 0, Math.PI * 2);
        g.fill();
      }
  });
}

function brickRelief(): HTMLCanvasElement {
  const S = 512, bh = 32, bw = 96;
  return reliefCanvas(S, S, (g) => {
    g.fillStyle = '#505050';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#a8a8a8';
    for (let row = 0; row < S / bh; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < S + bw; x += bw) g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
    }
  }, 1.6);
}

/** Industrial tower brick: dull lilac-grey courses, darker mortar. */
function brickCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const r = seeded(311);
  g.fillStyle = '#5f5a72';
  g.fillRect(0, 0, S, S);
  const bh = 32, bw = 96;
  for (let row = 0; row < S / bh; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      const t = r();
      g.fillStyle = t < 0.3 ? '#9a93ad' : t < 0.6 ? '#a8a0b6' : t < 0.85 ? '#8f8aa6' : '#b3a6b8';
      g.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
      g.globalAlpha = 0.25;
      g.fillStyle = '#ffffff';
      g.fillRect(x + off + 5, row * bh + 5, bw - 14, 4);
      g.globalAlpha = 1;
    }
  }
  wash(g, r, S, S, ['#6f6888', '#c2b9cc', '#7d7698'], 30, 0.2);
  speckle(g, r, S, S, 700, 0.07);
  return c;
}

/** Conveyor rubber: dark ribs across the run (scrolls along u). */
function beltCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256, 128);
  const r = seeded(317);
  g.fillStyle = '#2c2a38';
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 32) {
    g.fillStyle = '#3e3b50';
    g.fillRect(x + 4, 6, 14, 116);
    g.fillStyle = 'rgba(255,255,255,0.18)';
    g.fillRect(x + 5, 6, 3, 116);
  }
  // a painted arrow: which way the belt runs
  g.fillStyle = 'rgba(255,210,58,0.7)';
  g.beginPath();
  g.moveTo(150, 44);
  g.lineTo(190, 64);
  g.lineTo(150, 84);
  g.closePath();
  g.fill();
  speckle(g, r, 256, 128, 300, 0.1);
  return c;
}

function hazardCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256, 64);
  g.fillStyle = '#ffd23a';
  g.fillRect(0, 0, 256, 64);
  g.fillStyle = '#1d1a24';
  for (let x = -64; x < 256 + 64; x += 48) {
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 24, 64);
    g.lineTo(x + 24 + 40, 0);
    g.lineTo(x + 40, 0);
    g.closePath();
    g.fill();
  }
  speckle(g, seeded(5), 256, 64, 200, 0.12);
  return c;
}

/**
 * A wooden ruler: 2 cm ticks, numbers, a worn edge (u along the ruler: 1 tile = 1 m). A tick every 2 cm on a 1024 px
 * metre (20 px apart, 4 px wide): 1 cm ticks at 5 px were a fine comb that beat against the pixel grid.
 */
function rulerCanvas(): HTMLCanvasElement {
  const W = 1024, H = 128;
  const [c, g] = cv(W, H);
  const r = seeded(331);
  g.fillStyle = '#f2cf6e';
  g.fillRect(0, 0, W, H);
  wash(g, r, W, H, ['#e8b950', '#f7dc8a', '#d9a640'], 40, 0.35);
  g.fillStyle = '#2a2230';
  for (let i = 0; i < 50; i++) {
    const x = (i / 50) * W;
    const h = i % 5 === 0 ? 52 : 26;
    g.fillRect(x - 2, 0, 4, h);
  }
  g.font = 'bold 32px "Marker Felt", "Comic Sans MS", sans-serif';
  g.textAlign = 'center';
  for (let i = 1; i < 10; i++) {
    g.fillStyle = i === 5 ? PAL.red : '#2a2230';
    g.fillText(String(i * 10), (i / 10) * W, 92);
  }
  g.fillStyle = 'rgba(40,20,10,0.35)';
  g.fillRect(0, 120, W, 8);
  return c;
}

/** A child's crooked drawing (house, sun, cat, tree) on a sheet, and the Red Pen's X over it. 2 × 2 atlas. */
function drawingsCanvas(): HTMLCanvasElement {
  const S = 512;
  const [c, g] = cv(S);
  const r = seeded(341);
  const H = S / 2;
  const cols = [PAL.cobalt, PAL.hotpink, PAL.orange, PAL.turq, '#3fae4a'];
  for (let k = 0; k < 4; k++) {
    const ox = (k % 2) * H, oy = Math.floor(k / 2) * H;
    g.save();
    g.translate(ox, oy);
    g.fillStyle = k % 2 ? '#fbf6ea' : '#f6f1ff';
    g.fillRect(6, 6, H - 12, H - 12);
    g.strokeStyle = 'rgba(40,30,60,0.25)';
    g.lineWidth = 3;
    g.strokeRect(6, 6, H - 12, H - 12);
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.strokeStyle = cols[k % cols.length];
    g.fillStyle = cols[(k + 2) % cols.length];
    g.beginPath();
    if (k === 0) {
      // a crooked house
      g.moveTo(60, 190);
      g.lineTo(70, 110);
      g.lineTo(130, 60);
      g.lineTo(196, 104);
      g.lineTo(190, 196);
      g.closePath();
      g.stroke();
      g.fillRect(112, 140, 30, 52);
    } else if (k === 1) {
      // a wobbly sun
      g.arc(128, 128, 46, 0, Math.PI * 2);
      g.fill();
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        g.moveTo(128 + Math.cos(a) * 58, 128 + Math.sin(a) * 58);
        g.lineTo(128 + Math.cos(a + 0.2) * (88 + r() * 16), 128 + Math.sin(a + 0.2) * (88 + r() * 16));
      }
      g.stroke();
    } else if (k === 2) {
      // a cat with a crooked tail
      g.ellipse(120, 150, 54, 38, 0.1, 0, Math.PI * 2);
      g.moveTo(92, 108);
      g.lineTo(98, 70);
      g.lineTo(118, 102);
      g.lineTo(142, 72);
      g.lineTo(148, 110);
      g.moveTo(170, 160);
      g.quadraticCurveTo(220, 150, 200, 96);
      g.stroke();
    } else {
      // a leaning tree
      g.moveTo(120, 210);
      g.lineTo(136, 130);
      g.stroke();
      g.beginPath();
      g.arc(146, 104, 50, 0, Math.PI * 2);
      g.fill();
    }
    // signed in crayon by the child who drew it
    g.fillStyle = 'rgba(60,40,90,0.85)';
    g.font = 'bold 18px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText(['by Mia, 6', 'by Tom, 5', 'by Lu, 7', 'by Ava, 4'][k], H - 104, 30);
    if (k === 1) {
      g.fillStyle = '#ffd23a';
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? 9 : 20;
        g.lineTo(40 + Math.cos(a) * rr, 40 + Math.sin(a) * rr);
      }
      g.fill();
    }
    // the Red Pen's X
    g.strokeStyle = 'rgba(220,30,44,0.92)';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(34, 36 + r() * 10);
    g.lineTo(H - 34, H - 36);
    g.moveTo(H - 30, 40);
    g.lineTo(36, H - 40 - r() * 8);
    g.stroke();
    g.fillStyle = 'rgba(220,30,44,0.9)';
    g.font = 'bold 26px "Marker Felt", "Comic Sans MS", sans-serif';
    g.fillText('WRONG', 26, H - 18);
    g.restore();
  }
  return c;
}

/** Filing-cabinet front: four drawers per tile, label slots, pull handles. */
function cabinetCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256);
  const r = seeded(351);
  g.fillStyle = '#7f9a8e';
  g.fillRect(0, 0, 256, 256);
  wash(g, r, 256, 256, ['#6e8a80', '#94ae9f', '#7a8f98'], 30, 0.35);
  for (let i = 0; i < 4; i++) {
    const y = i * 64;
    g.strokeStyle = 'rgba(20,24,30,0.6)';
    g.lineWidth = 4;
    g.strokeRect(6, y + 5, 244, 54);
    g.fillStyle = '#f4ead2';
    g.fillRect(100, y + 14, 56, 16);
    g.strokeStyle = 'rgba(40,30,30,0.5)';
    g.lineWidth = 2;
    g.strokeRect(100, y + 14, 56, 16);
    g.fillStyle = '#2a2230';
    g.font = 'bold 11px sans-serif';
    g.fillText(['A–F', 'G–L', 'M–R', 'S–Z'][i], 112, y + 26);
    g.fillStyle = '#c9c4b0';
    g.fillRect(104, y + 36, 48, 9);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(104, y + 43, 48, 2);
  }
  speckle(g, r, 256, 256, 400);
  return c;
}

/** The view through a factory window: a dawn sky over the crooked roofs of the drawn city. */
function windowCanvas(): HTMLCanvasElement {
  const [c, g] = cv(256, 512);
  const r = seeded(361);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#8fb6f0');
  gr.addColorStop(0.55, '#f5d6c8');
  gr.addColorStop(0.75, '#ffc79a');
  gr.addColorStop(1, '#ffb0a0');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 512);
  for (let i = 0; i < 9; i++) {
    const x = i * 32 + r() * 10, w = 26 + r() * 22, h = 50 + r() * 110;
    g.fillStyle = ['#c58ab8', '#9d8ad6', '#e09a9a', '#8fb0c8'][i % 4];
    g.globalAlpha = 0.75;
    g.beginPath();
    g.moveTo(x, 512);
    g.lineTo(x + (r() - 0.5) * 8, 512 - h);
    g.lineTo(x + w * 0.5, 512 - h - 24 - r() * 16);
    g.lineTo(x + w + (r() - 0.5) * 8, 512 - h + 4);
    g.lineTo(x + w, 512);
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
  wash(g, r, 256, 512, ['#ffffff', '#ffe9dc'], 16, 0.25);
  return c;
}

/** The roof's painted dawn sky (name ends in _sky: the art styles restyle it). */
function skyCanvas(): HTMLCanvasElement {
  const [c, g] = cv(64, 512);
  const gr = g.createLinearGradient(0, 0, 0, 512);
  gr.addColorStop(0, '#3e5cc0');
  gr.addColorStop(0.35, '#7fa4ea');
  gr.addColorStop(0.55, '#cfd8f2');
  gr.addColorStop(0.68, '#ffd9c4');
  gr.addColorStop(0.8, '#ffb796');
  gr.addColorStop(1, '#f09aa8');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 512);
  return c;
}

/** The drawn city all round the tower: both earlier levels' crooked roofs, a canal, the harbour, the hills. */
function cityCanvas(): HTMLCanvasElement {
  const W = 2048, H = 512;
  const [c, g] = cv(W, H);
  const r = seeded(371);
  g.clearRect(0, 0, W, H);
  // far hills
  g.fillStyle = '#a7b6e4';
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 64) g.lineTo(x, H * 0.52 + Math.sin(x * 0.006) * 30 + Math.sin(x * 0.017) * 14);
  g.lineTo(W, H);
  g.fill();
  // the sea strip (harbour side)
  g.fillStyle = '#6fc9cf';
  g.fillRect(W * 0.55, H * 0.66, W * 0.3, H * 0.34);
  // crooked houses, three rows
  const cols = ['#ff7fae', '#ffcf5a', '#5fb8ff', '#ff9a5a', '#a98bff', '#5fd6b0', '#ff6b6b'];
  for (let row = 0; row < 3; row++) {
    const base = H * (0.7 + row * 0.11);
    for (let x = -20; x < W; x += 34 + r() * 30) {
      const w = 28 + r() * 36, h = 40 + r() * (90 - row * 18), lean = (r() - 0.5) * 18;
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.beginPath();
      g.moveTo(x, base + 40);
      g.lineTo(x + lean, base - h);
      g.lineTo(x + w + lean, base - h + (r() - 0.5) * 10);
      g.lineTo(x + w, base + 40);
      g.closePath();
      g.fill();
      g.strokeStyle = '#2a2230';
      g.lineWidth = 3;
      g.stroke();
      // roof
      g.fillStyle = ['#c8344a', '#3a4bb0', '#7a3fa8'][Math.floor(r() * 3)];
      g.beginPath();
      g.moveTo(x + lean - 5, base - h);
      g.lineTo(x + lean + w * 0.5 + (r() - 0.5) * 8, base - h - 18 - r() * 22);
      g.lineTo(x + w + lean + 5, base - h);
      g.closePath();
      g.fill();
      g.stroke();
      // windows
      g.fillStyle = '#fff2c4';
      for (let k = 0; k < 2; k++) g.fillRect(x + lean * 0.5 + 6 + k * (w * 0.45), base - h * 0.6, 7, 9);
    }
  }
  return c;
}

/** Red correction marks (transparent): 0 CORRECT stamp, 1 a brushed X, 2 a circle, 3 a tick. 2 × 2 atlas. */
function marksCanvas(): HTMLCanvasElement {
  const S = 512, H = 256;
  const [c, g] = cv(S);
  const r = seeded(381);
  g.clearRect(0, 0, S, S);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const red = 'rgba(218,30,44,0.95)';
  // CORRECT stamp
  g.strokeStyle = red;
  g.lineWidth = 10;
  g.strokeRect(18, 74, H - 36, 108);
  g.lineWidth = 4;
  g.strokeRect(30, 86, H - 60, 84);
  g.fillStyle = red;
  g.font = 'bold 48px "Arial Black", "Helvetica", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('CORRECT', H / 2, 130);
  // X
  g.strokeStyle = red;
  g.lineWidth = 34;
  g.beginPath();
  g.moveTo(H + 40, 40);
  g.quadraticCurveTo(H + 130, 120 + r() * 10, H + 216, 214);
  g.moveTo(H + 214, 42);
  g.quadraticCurveTo(H + 120, 136, H + 42, 216);
  g.stroke();
  // circle
  g.lineWidth = 20;
  g.beginPath();
  g.ellipse(H / 2, H + H / 2, 100, 90, 0.2, 0.2, Math.PI * 2.05);
  g.stroke();
  // tick
  g.lineWidth = 30;
  g.beginPath();
  g.moveTo(H + 50, H + 140);
  g.lineTo(H + 110, H + 206);
  g.lineTo(H + 214, H + 52);
  g.stroke();
  return c;
}

/** Diamond wire mesh (transparent gaps): stair cages and safety screens. */
function meshCanvas(): HTMLCanvasElement {
  const [c, g] = cv(128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#3a3a52';
  g.lineWidth = 5;
  for (let i = -4; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32 + 128, 128);
    g.moveTo(i * 32, 0);
    g.lineTo(i * 32 - 128, 128);
    g.stroke();
  }
  g.strokeStyle = 'rgba(200,200,230,0.6)';
  g.lineWidth = 1.5;
  for (let i = -4; i <= 8; i++) {
    g.beginPath();
    g.moveTo(i * 32 + 1, 0);
    g.lineTo(i * 32 + 129, 128);
    g.stroke();
  }
  return c;
}

/** A painted sign plate (black ink border, marker lettering). */
export function signCanvas(text: string, bg: string, fg: string, w = 512, h = 128): HTMLCanvasElement {
  const [c, g] = cv(w, h);
  const r = seeded(text.length * 31 + w);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  wash(g, r, w, h, [bg, '#ffffff', '#00000022'], 16, 0.2);
  g.strokeStyle = '#1a1420';
  g.lineWidth = 10;
  g.strokeRect(5, 5, w - 10, h - 10);
  g.fillStyle = fg;
  g.font = `bold ${Math.floor(h * 0.46)}px "Marker Felt", "Chalkboard SE", "Comic Sans MS", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 3, w - 30);
  return c;
}

/** Register every level-3 texture once (cached in the asset manager across restarts). */
export function ensureWorksTextures(assets: AssetManager): void {
  if (assets.textures.has('w3_grid')) return;
  // anisotropy 16 (three clamps it to the GPU's limit): floors, ceilings and long walls are seen at grazing angles
  const put = (name: string, c: HTMLCanvasElement, clamp = false, relief?: HTMLCanvasElement) => {
    const t = toTexture(c);
    if (clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = 16;
    t.name = name;
    if (relief) t.userData.heightMap = new THREE.CanvasTexture(relief); // Materials.normalFromTexture reads it
    assets.textures.set(name, t);
  };
  // the paint's own relief, blurred until its thin lines are gone (the wash's brush relief stays)
  const soft = (c: HTMLCanvasElement, px: number) => reliefCanvas(c.width, c.height, (g) => g.drawImage(c, 0, 0), px);
  const grid = gridCanvas();
  put('w3_grid', grid, false, soft(grid, 3)); // grid lines are ink, not grooves
  const steelBumps = steelRelief();
  put('w3_steel', steelCanvas('#8d97b0', ['#7b86a2', '#a3acc2', '#8a90a8'], 321), false, steelBumps);
  put('w3_steel_dark', steelCanvas('#4a4f68', ['#3d4158', '#5c6280', '#45405a'], 323), false, steelBumps);
  put('w3_brick', brickCanvas(), false, brickRelief());
  put('w3_belt', beltCanvas());
  put('w3_hazard', hazardCanvas());
  const ruler = rulerCanvas();
  put('w3_ruler', ruler, false, soft(ruler, 4));
  put('w3_drawings', drawingsCanvas(), true);
  put('w3_cabinet', cabinetCanvas());
  put('w3_window', windowCanvas(), true);
  put('w3_sky', skyCanvas(), true);
  put('w3_city', cityCanvas());
  put('w3_marks', marksCanvas(), true);
  put('w3_mesh', meshCanvas());
}
