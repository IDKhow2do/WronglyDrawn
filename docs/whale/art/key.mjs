// Key out the chroma-green background of a Codex sticker (node port of reference/tools_stickers/key.py):
// only green that is connected to the image border becomes transparent, edge despill, crop, centre on 512x512, soft drop shadow.
// usage: node key.mjs <name>...   /tmp/whale-art/work/<name>/<name>.png -> public/assets/whale/<name>.webp
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
const R = '<local-path>', W = '/tmp/whale-art/work', OUT = `${R}/public/assets/whale`;
mkdirSync(OUT, { recursive: true });
for (const n of process.argv.slice(2)) {
  const { data, info } = await sharp(`${W}/${n}/${n}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, N = w * h;
  const gx = new Float32Array(N);
  for (let i = 0; i < N; i++) gx[i] = data[i * 3 + 1] - Math.max(data[i * 3], data[i * 3 + 2]);
  // flood fill the border-connected green
  const bg = new Uint8Array(N);
  const stack = [];
  const push = (x, y) => { const i = y * w + x; if (!bg[i] && gx[i] > 25) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const i = stack.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) push(x - 1, y); if (x < w - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < h - 1) push(x, y + 1);
  }
  // "near" = within 3 px of the background (where soft alpha + despill apply)
  const near = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!bg[y * w + x]) continue;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h) near[yy * w + xx] = 1;
    }
  }
  const rgba = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    let r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    let a = 1;
    if (bg[i]) a = 0;
    else if (near[i]) a = Math.min(1, Math.max(0, 1 - (gx[i] - 25) / 65));
    if (near[i] && gx[i] > 0) g = Math.max(r, b);
    else if (!near[i] && gx[i] > 100) r = g = b = 250; // stray chroma scribbles inside the sticker
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = Math.round(a * 255);
  }
  // erode alpha by 1 px (kills the green fringe)
  const al = new Uint8Array(N);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = 255;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy));
      m = Math.min(m, rgba[(yy * w + xx) * 4 + 3]);
    }
    al[y * w + x] = m;
  }
  for (let i = 0; i < N; i++) rgba[i * 4 + 3] = al[i];
  const cut = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 8 }).resize(448, 448, { fit: 'inside' }).png().toBuffer();
  const m = await sharp(cut).metadata();
  const x = Math.round((512 - m.width) / 2), y = Math.round((512 - m.height) / 2) - 4;
  // drop shadow: the alpha, tinted dark, offset and blurred
  const shA = await sharp(cut).extractChannel('alpha').linear(0.38, 0).toBuffer();
  const sh = await sharp({ create: { width: m.width, height: m.height, channels: 3, background: { r: 20, g: 10, b: 30 } } }).joinChannel(shA).png().toBuffer();
  const shadow = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: sh, left: Math.min(512 - m.width, x + 6), top: Math.min(512 - m.height, y + 9) }]).png().toBuffer();
  const blurred = await sharp(shadow).blur(6).png().toBuffer();
  await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: blurred }, { input: cut, left: x, top: Math.max(0, y) }]).webp({ quality: 88, effort: 6 }).toFile(`${OUT}/${n}.webp`);
  console.log(n, `${m.width}x${m.height}`);
}
