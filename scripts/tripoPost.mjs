/**
 * [INPUT]: GLB 模型、gltf-transform、Meshopt 和 Sharp。
 * [OUTPUT]: 简化网格、压缩贴图并统一比例与轴心的 GLB。
 * [POS]: 离线美术加工工具，不参与游戏运行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
// Usage: node scripts/tripoPost.mjs <in.glb> <out.glb> <size> <axis:x|y|z|max> <pivot:bottom|center> [yawDeg]
// Decimate (~tris), downscale textures to 1K webp, meshopt-compress, then bake scale + pivot into the single mesh node.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify, resample, prune, dedup, textureCompress, getBounds, meshopt } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [, , inp, out, sizeS, axis = 'max', pivot = 'center', yawS = '0', ratioS = '0.01', upright = '', flips = ''] = process.argv;
await MeshoptSimplifier.ready; await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
await doc.transform(
  simplify({ simplifier: MeshoptSimplifier, ratio: parseFloat(ratioS), error: 0.01 }),
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
);
// matte-ify: the game has no environment map, so full-metal PBR renders black
for (const m of doc.getRoot().listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.75).setMetallicRoughnessTexture(null);
// optional: PCA-upright (the least-spread axis → +Y, heavy end up) — for things Tripo exported tilted (crowns, rings)
if (upright === 'flat') {
  // flat things (wings): longest axis → +X, thinnest → +Y, root at the narrower end handled by pivot 'xmin' + flips ('x' mirrors, 'z' mirrors, 'y' mirrors)
  const pts = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute('POSITION'); const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); pts.push([...v]); }
  }
  const m = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]) / pts.length;
  const mul = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const power = (M) => { let v = [0.5, 0.7, 0.3]; for (let it = 0; it < 300; it++) v = norm(mul(M, v)); return v; };
  const v1 = power(C);
  const l1 = mul(C, v1).reduce((s, x, i) => s + x * v1[i], 0);
  const D = C.map((r, i) => r.map((x, j) => x - l1 * v1[i] * v1[j]));
  const v2 = power(D);
  let v3 = [v1[1] * v2[2] - v1[2] * v2[1], v1[2] * v2[0] - v1[0] * v2[2], v1[0] * v2[1] - v1[1] * v2[0]];
  const sx = flips.includes('x') ? -1 : 1, sy = flips.includes('y') ? -1 : 1, sz = flips.includes('z') ? 1 : -1; // (default -1: keeps the basis right-handed)
  // new coords: x' = v1·p, y' = v3·p (thin), z' = v2·p
  const R = (p) => [sx * (v1[0] * p[0] + v1[1] * p[1] + v1[2] * p[2]), sy * (v3[0] * p[0] + v3[1] * p[1] + v3[2] * p[2]), sz * (v2[0] * p[0] + v2[1] * p[1] + v2[2] * p[2])];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) for (const name of ['POSITION', 'NORMAL']) {
    const a = prim.getAttribute(name); if (!a) continue; const t = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, t); a.setElement(i, R(t)); }
  }
} else if (upright) {
  const pts = [];
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) {
    const a = prim.getAttribute('POSITION'); const v = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i += 3) { a.getElement(i, v); pts.push([...v]); }
  }
  const m = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += (p[i] - m[i]) * (p[j] - m[j]) / pts.length;
  const mul = (M, v) => [0, 1, 2].map((i) => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]);
  const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
  const power = (M) => { let v = [0.5, 0.7, 0.3]; for (let it = 0; it < 300; it++) v = norm(mul(M, v)); return v; };
  const e1 = power(C);
  const l1 = mul(C, e1).reduce((q, x, i) => q + x * e1[i], 0);
  const D = C.map((r, i) => r.map((x, j) => x - l1 * e1[i] * e1[j]));
  const e2 = power(D);
  const e3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  let v = ({ '0': e3, '1': e2, '2': e1 })[(flips.match(/[012]/) || ['0'])[0]];
  // heavy tail (spikes / tip) should point up
  const sk = pts.reduce((s, p) => s + Math.pow((p[0] - m[0]) * v[0] + (p[1] - m[1]) * v[1] + (p[2] - m[2]) * v[2], 3), 0);
  if (upright === 'tip' ? sk < 0 : sk > 0) v = v.map((x) => -x);
  // rotation taking v → +Y (Rodrigues)
  const ax = [v[2], 0, -v[0]]; const sn = Math.hypot(ax[0], ax[2]); const cs = v[1];
  const R = (p) => { if (sn < 1e-6) return p; const k = [ax[0] / sn, 0, ax[2] / sn]; const th = Math.atan2(sn, cs);
    const c = Math.cos(th), s2 = Math.sin(th); const d = k[0] * p[0] + k[2] * p[2];
    const cr = [k[1] * p[2] - k[2] * p[1], k[2] * p[0] - k[0] * p[2], k[0] * p[1] - k[1] * p[0]];
    return [p[0] * c + cr[0] * s2 + k[0] * d * (1 - c), p[1] * c + cr[1] * s2, p[2] * c + cr[2] * s2 + k[2] * d * (1 - c)]; };
  for (const mesh of doc.getRoot().listMeshes()) for (const prim of mesh.listPrimitives()) for (const name of ['POSITION', 'NORMAL']) {
    const a = prim.getAttribute(name); if (!a) continue; const t = [0, 0, 0];
    for (let i = 0; i < a.getCount(); i++) { a.getElement(i, t); a.setElement(i, R(t)); }
  }
}
const root = doc.getRoot().listScenes()[0];
const bb = getBounds(root);
const size = [0, 1, 2].map((i) => bb.max[i] - bb.min[i]);
const ref = axis === 'max' ? Math.max(...size) : size['xyz'.indexOf(axis)];
const k = parseFloat(sizeS) / ref;
// wrap everything under one node with scale/translation/rotation
const nodes = root.listChildren();
const holder = doc.createNode('model');
for (const n of nodes) { root.removeChild(n); holder.addChild(n); }
const c = [0, 1, 2].map((i) => (bb.max[i] + bb.min[i]) / 2);
const t = pivot === 'xmin' ? [-bb.min[0] * k, -c[1] * k, -c[2] * k] : [-c[0] * k, pivot === 'bottom' ? -bb.min[1] * k : -c[1] * k, -c[2] * k];
if (pivot === 'bottom') { /* x/z centred, y from 0 */ }
const yaw = (parseFloat(yawS) * Math.PI) / 180;
const q = [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
// rotate the centred model about the origin
const rot = (v) => [v[0] * Math.cos(yaw) + v[2] * Math.sin(yaw), v[1], -v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw)];
holder.setScale([k, k, k]).setRotation(q).setTranslation(rot(t));
root.addChild(holder);
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
await io.write(out, doc);
console.log(out, 'scale', k.toFixed(4), 'orig size', size.map((v) => v.toFixed(3)).join('x'));
