import * as THREE from 'three';

/** Neo-expressionist palette used everywhere (world, UI, icons). */
export const PAL = {
  cobalt: '#2a4be0',
  blue: '#3f6cf0',
  orange: '#ff7a1a',
  pink: '#ff4fa3',
  hotpink: '#ff2f86',
  red: '#e8323c',
  turq: '#22c4c0',
  yellow: '#ffd23a',
  cream: '#f6e8d0',
  black: '#141014',
  purple: '#7a4bd1',
  violet: '#5a3a9e',
  brown: '#8a5a34',
  white: '#fff8ee',
};

/** Deterministic RNG so the city looks the same every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

type Ctx = CanvasRenderingContext2D;

function canvas(w: number, h = w): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function pick<T>(r: () => number, arr: T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

/** Rough "acrylic" brush stroke: many offset translucent lines. */
function stroke(ctx: Ctx, r: () => number, x: number, y: number, len: number, w: number, ang: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    ctx.globalAlpha = 0.35 + r() * 0.5;
    ctx.lineWidth = w * (0.5 + r() * 0.6);
    ctx.beginPath();
    const oy = (r() - 0.5) * w * 0.8;
    ctx.moveTo(-len / 2, oy);
    ctx.bezierCurveTo(-len / 6, oy + (r() - 0.5) * w, len / 6, oy + (r() - 0.5) * w, len / 2, oy + (r() - 0.5) * w * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function splat(ctx: Ctx, r: () => number, x: number, y: number, rad: number, color: string) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  const n = 9 + Math.floor(r() * 6);
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad * (0.6 + r() * 0.6);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a = r() * Math.PI * 2;
    const d = rad * (1.1 + r() * 0.9);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rad * (0.06 + r() * 0.12), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drip(ctx: Ctx, r: () => number, x: number, y: number, len: number, w: number, color: string) {
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fillRect(x - w / 2, y, w, len);
  ctx.beginPath();
  ctx.arc(x, y + len, w * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function scribble(ctx: Ctx, r: () => number, x: number, y: number, size: number, color: string, lw = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < 10; i++) ctx.lineTo(x + (r() - 0.5) * size, y + (r() - 0.5) * size * 0.6);
  ctx.stroke();
}

/** Jagged crown outline (the city's recurring tag). */
export function drawCrown(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, fill?: string, lw = 6) {
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + w * 0.05, y + h * 0.15);
  ctx.lineTo(x + w * 0.27, y + h * 0.6);
  ctx.lineTo(x + w * 0.5, y);
  ctx.lineTo(x + w * 0.73, y + h * 0.6);
  ctx.lineTo(x + w * 0.95, y + h * 0.1);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

export function drawEye(ctx: Ctx, x: number, y: number, w: number, open: boolean, lw = 8) {
  const h = w * 0.42;
  ctx.lineWidth = lw;
  ctx.strokeStyle = PAL.black;
  ctx.lineCap = 'round';
  if (open) {
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x, y - h * 1.3, x + w / 2, y);
    ctx.quadraticCurveTo(x, y + h * 1.3, x - w / 2, y);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PAL.hotpink;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.black;
    ctx.beginPath();
    ctx.arc(x, y, h * 0.36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.arc(x - h * 0.14, y - h * 0.14, h * 0.1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.quadraticCurveTo(x, y + h * 1.1, x + w / 2, y);
    ctx.stroke();
  }
  // lashes
  for (let i = 0; i < 7; i++) {
    const t = (i + 0.5) / 7;
    const px = x - w / 2 + t * w;
    const py = open ? y - Math.sin(t * Math.PI) * h * 0.95 : y + Math.sin(t * Math.PI) * h * 0.55;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (t - 0.5) * w * 0.25, py + (open ? -h * 0.55 : h * 0.55));
    ctx.stroke();
  }
}

export function drawTeeth(ctx: Ctx, x: number, y: number, w: number, h: number, n: number, lw = 6) {
  ctx.fillStyle = PAL.black;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = PAL.cream;
  const tw = w / n;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.moveTo(x + i * tw, y);
    ctx.lineTo(x + (i + 1) * tw, y);
    ctx.lineTo(x + (i + 0.5) * tw, y + h * 0.62);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + i * tw + tw * 0.5, y + h);
    ctx.lineTo(x + (i + 1.5) * tw > x + w ? x + w : x + (i + 1.5) * tw, y + h);
    ctx.lineTo(x + (i + 1) * tw, y + h * 0.42);
    ctx.fill();
  }
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);
}

function drawX(ctx: Ctx, x: number, y: number, s: number, color: string, lw = 8) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s, y - s);
  ctx.lineTo(x + s, y + s);
  ctx.moveTo(x + s, y - s);
  ctx.lineTo(x - s * 0.9, y + s * 1.1);
  ctx.stroke();
}

export interface PaintOpts {
  seed: number;
  size?: number;
  base: string;
  colors: string[];
  strokes?: number;
  splats?: number;
  drips?: number;
  scribbles?: number;
  grain?: number;
}

/** Generic impasto paint surface. */
export function paintCanvas(o: PaintOpts): HTMLCanvasElement {
  const size = o.size ?? 256;
  const [c, ctx] = canvas(size);
  const r = rng(o.seed);
  ctx.fillStyle = o.base;
  ctx.fillRect(0, 0, size, size);
  const ns = o.strokes ?? 40;
  for (let i = 0; i < ns; i++) {
    stroke(ctx, r, r() * size, r() * size, size * (0.2 + r() * 0.5), size * (0.04 + r() * 0.07), (r() - 0.5) * 1.2, pick(r, o.colors));
  }
  for (let i = 0; i < (o.splats ?? 4); i++) splat(ctx, r, r() * size, r() * size, size * (0.03 + r() * 0.05), pick(r, o.colors));
  for (let i = 0; i < (o.drips ?? 3); i++) drip(ctx, r, r() * size, r() * size * 0.6, size * (0.08 + r() * 0.2), size * 0.012, pick(r, o.colors));
  for (let i = 0; i < (o.scribbles ?? 2); i++) scribble(ctx, r, r() * size, r() * size, size * 0.2, PAL.black, 2);
  // grain / scratches
  const g = o.grain ?? 900;
  for (let i = 0; i < g; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2, 1 + r() * 2);
  }
  return c;
}

export function toTexture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Painted cobblestone ground: irregular coloured tiles with dark grout. */
export function cobbleCanvas(seed: number): HTMLCanvasElement {
  const size = 512;
  const [c, ctx] = canvas(size);
  const r = rng(seed);
  ctx.fillStyle = '#4a3550';
  ctx.fillRect(0, 0, size, size);
  const cols = [PAL.pink, '#e58fb8', PAL.blue, '#7d6fd8', PAL.orange, '#f2b38a', '#d9c3b0', PAL.hotpink, '#9a7fe0', '#f0d4a8'];
  const rows = 8;
  const th = size / rows;
  for (let y = 0; y < rows; y++) {
    let x = y % 2 ? -th * 0.5 : 0;
    while (x < size) {
      const w = th * (0.9 + r() * 0.8);
      ctx.fillStyle = pick(r, cols);
      const pad = 3;
      ctx.beginPath();
      ctx.roundRect(x + pad, y * th + pad, w - pad * 2, th - pad * 2, 6);
      ctx.fill();
      for (let k = 0; k < 3; k++) stroke(ctx, r, x + w / 2, y * th + th / 2, w * 0.7, th * 0.25, (r() - 0.5) * 0.4, pick(r, cols));
      x += w;
    }
  }
  for (let i = 0; i < 1800; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.14)' : 'rgba(20,10,30,0.16)';
    ctx.fillRect(r() * size, r() * size, 1 + r() * 2.5, 1 + r() * 2.5);
  }
  return c;
}

/** Wood plank crate surface with graffiti tags. */
export function woodCanvas(seed: number): HTMLCanvasElement {
  const size = 256;
  const [c, ctx] = canvas(size);
  const r = rng(seed);
  const planks = 5;
  for (let i = 0; i < planks; i++) {
    ctx.fillStyle = pick(r, ['#9a6234', '#b07440', '#875528', '#a8693a']);
    ctx.fillRect(0, (i * size) / planks, size, size / planks);
    for (let k = 0; k < 14; k++) {
      ctx.strokeStyle = 'rgba(60,30,10,0.35)';
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const y = (i * size) / planks + r() * (size / planks);
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 6, size * 0.6, y + (r() - 0.5) * 6, size, y);
      ctx.stroke();
    }
    ctx.fillStyle = PAL.black;
    ctx.fillRect(0, ((i + 1) * size) / planks - 3, size, 4);
  }
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, size - 12, size - 12);
  splat(ctx, r, size * 0.8, size * 0.25, 14, PAL.pink);
  splat(ctx, r, size * 0.2, size * 0.8, 10, PAL.turq);
  drip(ctx, r, size * 0.3, size * 0.1, 50, 4, PAL.yellow);
  return c;
}

export type FacadeKind = 'sleepy' | 'awake' | 'cyclops' | 'teeth' | 'crowns' | 'plain' | 'nose';

/** Building facade: painted wall + big graffiti face / motifs + windows. */
export function facadeCanvas(seed: number, kind: FacadeKind, base: string, accents: string[]): HTMLCanvasElement {
  const W = 512;

  const c = paintCanvas({ seed, size: W, base, colors: accents, strokes: 70, splats: 6, drips: 6, scribbles: 4 });
  const ctx = c.getContext('2d')!;
  const r = rng(seed * 7 + 3);
  // windows on upper rows
  if (kind !== 'sleepy' && kind !== 'teeth' && kind !== 'awake') {
    for (let i = 0; i < 2; i++) {
      const wx = 60 + i * 300 + r() * 40;
      const wy = 40 + r() * 20;
      ctx.fillStyle = '#2b1c3a';
      ctx.fillRect(wx, wy, 90, 110);
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 8;
      ctx.strokeRect(wx, wy, 90, 110);
      ctx.fillStyle = pick(r, [PAL.turq, PAL.yellow, PAL.orange]);
      ctx.fillRect(wx - 8, wy + 110, 106, 12);
    }
  }
  switch (kind) {
    case 'sleepy':
      drawEye(ctx, 150, 200, 170, false, 12);
      drawEye(ctx, 370, 190, 190, false, 12);
      for (let i = 0; i < 3; i++) drip(ctx, r, 120 + i * 28, 240, 40 + r() * 50, 6, PAL.white);
      drawTeeth(ctx, 90, 360, 340, 70, 8, 10);
      drawCrown(ctx, 400, 300, 90, 60, PAL.black, PAL.pink, 7);
      break;
    case 'awake':
      drawEye(ctx, 150, 200, 170, true, 12);
      drawEye(ctx, 370, 190, 190, true, 12);
      drawTeeth(ctx, 90, 360, 340, 70, 8, 10);
      drawCrown(ctx, 400, 300, 90, 60, PAL.black, PAL.yellow, 7);
      break;
    case 'cyclops':
      drawEye(ctx, 256, 260, 260, true, 12);
      drawCrown(ctx, 170, 330, 170, 90, PAL.black, undefined, 9);
      break;
    case 'teeth':
      drawTeeth(ctx, 60, 260, 390, 110, 9, 10);
      drawEye(ctx, 170, 150, 140, true, 10);
      drawEye(ctx, 360, 160, 120, false, 10);
      break;
    case 'crowns':
      drawCrown(ctx, 70, 250, 150, 100, PAL.black, PAL.yellow, 8);
      drawCrown(ctx, 300, 300, 120, 80, PAL.black, undefined, 8);
      drawX(ctx, 380, 420, 30, PAL.white, 10);
      break;
    case 'nose':
      drawEye(ctx, 150, 250, 120, true, 9);
      drawEye(ctx, 360, 250, 120, true, 9);
      ctx.fillStyle = PAL.pink;
      ctx.beginPath();
      ctx.moveTo(256, 230);
      ctx.lineTo(300, 360);
      ctx.lineTo(220, 360);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = PAL.black;
      ctx.stroke();
      drawTeeth(ctx, 150, 400, 220, 50, 6, 8);
      break;
    case 'plain':
      drawX(ctx, 120, 380, 34, pick(r, [PAL.white, PAL.pink]), 10);
      drawCrown(ctx, 300, 330, 110, 70, PAL.black, undefined, 7);
      break;
  }
  return c;
}

/** Splat decal (alpha) for paint impacts. */
export function splatCanvas(seed: number, color: string): HTMLCanvasElement {
  const [c, ctx] = canvas(128);
  const r = rng(seed);
  splat(ctx, r, 64, 64, 34, color);
  ctx.strokeStyle = 'rgba(20,16,20,0.55)';
  ctx.lineWidth = 3;
  return c;
}

/** Floor graffiti (eye / spiral) as transparent decal. */
export function floorEyeCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(256);
  ctx.globalAlpha = 0.85;
  drawEye(ctx, 128, 128, 220, true, 10);
  return c;
}

export function arrowDecalCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(256);
  const r = rng(77);
  ctx.strokeStyle = PAL.yellow;
  ctx.fillStyle = PAL.yellow;
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(128, 230);
  ctx.lineTo(128, 70);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(60, 110);
  ctx.lineTo(128, 20);
  ctx.lineTo(196, 110);
  ctx.closePath();
  ctx.fill();
  scribble(ctx, r, 128, 200, 60, PAL.black, 4);
  return c;
}

/** Simple painterly sky gradient. */
export function skyCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(64, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#1d3fd6');
  g.addColorStop(0.55, '#4f86ff');
  g.addColorStop(1, '#bfd2ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 512);
  return c;
}

export function cloudCanvas(seed: number): HTMLCanvasElement {
  const [c, ctx] = canvas(256, 128);
  const r = rng(seed);
  for (let i = 0; i < 9; i++) {
    const x = 50 + r() * 156;
    const y = 50 + r() * 40;
    const rad = 22 + r() * 26;
    ctx.fillStyle = i % 3 === 0 ? '#e8dcff' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(120,110,200,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) scribble(ctx, r, 70 + r() * 120, 70 + r() * 20, 40, 'rgba(150,140,230,0.6)', 2);
  return c;
}

/** Text label canvas (signs, floating bars). */
export function labelCanvas(text: string, bg: string, fg: string, w = 256, h = 64): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(4, 4, w - 8, h - 8);
  ctx.strokeStyle = PAL.black;
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  ctx.fillStyle = fg;
  ctx.font = `bold ${Math.floor(h * 0.5)}px "Marker Felt", "Chalkboard SE", "Comic Sans MS", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 2);
  return c;
}

/** WAI body: half cobalt / half orange with an X scar. */
export function waiBodyCanvas(): HTMLCanvasElement {
  const [c, ctx] = canvas(256);
  const r = rng(11);
  ctx.fillStyle = PAL.cobalt;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = PAL.orange;
  ctx.beginPath();
  ctx.moveTo(140, 0);
  ctx.lineTo(256, 0);
  ctx.lineTo(256, 256);
  ctx.lineTo(120, 256);
  ctx.lineTo(150, 130);
  ctx.closePath();
  ctx.fill();
  for (let i = 0; i < 30; i++) stroke(ctx, r, r() * 256, r() * 256, 60 + r() * 60, 10, (r() - 0.5) * 0.8, pick(r, [PAL.blue, '#1f36b0', '#ff9a40', PAL.pink]));
  drawX(ctx, 70, 120, 18, PAL.white, 7);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
    ctx.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return c;
}

/** Inventory / HUD icon for organs. Returns a data URL. */
export function organIconDataURL(kind: 'LEG' | 'EYE' | 'MOUTH', corrupted: boolean): string {
  const [c, ctx] = canvas(128);
  ctx.fillStyle = corrupted ? '#3a1d52' : kind === 'LEG' ? PAL.orange : kind === 'EYE' ? PAL.yellow : PAL.pink;
  ctx.beginPath();
  ctx.roundRect(8, 8, 112, 112, 16);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = PAL.black;
  ctx.stroke();
  if (kind === 'LEG') {
    const col = corrupted ? '#b23cff' : PAL.cobalt;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const ox of [-18, 18]) {
      ctx.strokeStyle = PAL.black;
      ctx.lineWidth = 20;
      ctx.beginPath();
      ctx.moveTo(64 + ox, 24);
      ctx.lineTo(64 + ox * 1.6, 62);
      ctx.lineTo(64 + ox, 96);
      ctx.lineTo(64 + ox + (ox > 0 ? 18 : -18), 100);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = 11;
      ctx.stroke();
    }
    if (corrupted) {
      ctx.fillStyle = '#ff3cf0';
      for (let i = 0; i < 6; i++) {
        ctx.beginPath();
        ctx.arc(30 + i * 13, 30 + ((i * 37) % 60), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'EYE') {
    drawEye(ctx, 64, 64, 90, true, 6);
  } else {
    drawTeeth(ctx, 24, 44, 80, 40, 5, 6);
  }
  return c.toDataURL();
}
