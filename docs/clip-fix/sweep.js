// Standable-top sweep: for every XZ grid column, find each walkable collider top (Rapier ray, normal.y>0.7)
// and the first drawn surface near it (three.js ray over visible, opaque, non-outline meshes).
// d = drawn - collider. d > TOL: feet sink into the art; d < -TOL: feet float over the art.
const A = Object.assign({ step: 0.5, tol: 0.02, box: null, minSize: 0.6, layers: 4, above: 2.0, sink: 0.6 }, ARGS || {});
const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null) || await import('/node_modules/three/build/three.module.js');
const s = __WD.session, ctx = s.ctx, phys = s.physics, R = phys.world;
const RAP = (await import('/src/core/PhysicsWorld.ts')).RAPIER;
const playerObjs = new Set();
const pm = s.player.model?.root || s.player.model?.group || s.player.group || s.player.mesh;
// collect drawn meshes
ctx.scene.updateMatrixWorld(true);
const meshes = [];
const visibleChain = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
ctx.scene.traverse((o) => {
  if (!o.isMesh || o.isSprite || o.userData.isOutline || !visibleChain(o)) return;
  const mats = Array.isArray(o.material) ? o.material : [o.material];
  if (mats.every((m) => !m || m.visible === false || (m.transparent && m.opacity < 0.5) || m.depthWrite === false || m.colorWrite === false)) return;
  if (o.geometry?.parameters?.radius > 200) return; // sky dome
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const bb = o.geometry.boundingBox.clone();
  if (o.isInstancedMesh) { o.computeBoundingBox?.(); if (o.boundingBox) bb.copy(o.boundingBox); }
  bb.applyMatrix4(o.matrixWorld);
  const sz = bb.getSize(new THREE.Vector3());
  if (Math.max(sz.x, sz.z) < A.minSize) return;
  meshes.push({ o, bb });
});
// skip player / enemies / pickups: anything under objects with these names
const skipName = /wai|player|enemy|lamp|crown|drop|grub|cape|companion|bird|cloud/i;
const isSkipped = (o) => { for (let p = o; p; p = p.parent) if (p.userData?.enemy || p.userData?.player || skipName.test(p.name || '')) return true; return false; };
const drawn = meshes.filter((m) => !isSkipped(m.o));
// 2D bucket
const CELL = 4, buckets = new Map();
for (const m of drawn) for (let cx = Math.floor(m.bb.min.x / CELL); cx <= Math.floor(m.bb.max.x / CELL); cx++) for (let cz = Math.floor(m.bb.min.z / CELL); cz <= Math.floor(m.bb.max.z / CELL); cz++) {
  const k = cx + ',' + cz; (buckets.get(k) || buckets.set(k, []).get(k)).push(m);
}
const rc = new THREE.Raycaster(); rc.firstHitOnly = true;
const down = new THREE.Vector3(0, -1, 0);
const drawnTop = (x, z, yFrom, yTo) => {
  const list = buckets.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || [];
  const cand = list.filter((m) => x >= m.bb.min.x && x <= m.bb.max.x && z >= m.bb.min.z && z <= m.bb.max.z && m.bb.max.y >= yTo && m.bb.min.y <= yFrom).map((m) => m.o);
  if (!cand.length) return null;
  rc.set(new THREE.Vector3(x, yFrom, z), down); rc.far = yFrom - yTo;
  const hits = rc.intersectObjects(cand, false);
  // a downward ray: keep hits on faces seen from above OR double-sided (tiles); ignore back faces of single-sided meshes
  for (const h of hits) {
    const mats = Array.isArray(h.object.material) ? h.object.material : [h.object.material];
    const mat = h.face && mats[h.face.materialIndex ?? 0] || mats[0];
    if (!mat || mat.visible === false) continue;
    if (h.face && mat.side === THREE.FrontSide) { const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.y < 0) continue; }
    return h;
  }
  return null;
};
const tagOf = (c) => phys.tagOf(c);
const bad = new Set(['player', 'enemy', 'barrier', 'water', 'undrawn']);
const box = A.box || (() => { const b = new THREE.Box3(); drawn.forEach((m) => { if (m.bb.max.x - m.bb.min.x < 400) b.union(m.bb); }); return { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z }; })();
const out = []; let cols = 0, tops = 0; const t0 = performance.now();
for (let x = box.x0; x <= box.x1; x += A.step) for (let z = box.z0; z <= box.z1; z += A.step) {
  cols++;
  let y = 80; const seen = new Set();
  for (let L = 0; L < A.layers; L++) {
    const ray = new RAP.Ray({ x, y, z }, { x: 0, y: -1, z: 0 });
    const hit = R.castRayAndGetNormal(ray, 120, false, undefined, undefined, undefined, undefined, (c) => !seen.has(c.handle) && !c.isSensor() && !bad.has(tagOf(c)) && !c.parent()?.isDynamic?.());
    if (!hit) break;
    const cy = y - hit.timeOfImpact;
    const col = hit.collider;
    seen.add(col.handle);
    // standable: walkable slope AND room for WAI above it (no collider within 1.0 m overhead; solid: a ray starting inside one counts)
    const up = hit.normal.y > 0.7 && R.castRay(new RAP.Ray({ x, y: cy + 0.03, z }, { x: 0, y: 1, z: 0 }), 1.0, true, undefined, undefined, undefined, undefined, (c) => !c.isSensor() && !bad.has(tagOf(c)) && !c.parent()?.isDynamic?.());
    if (hit.normal.y > 0.7 && !up) {
      tops++;
      const h = drawnTop(x, z, cy + A.above, cy - 0.6);
      const d = h ? h.point.y - cy : -0.6;
      if (Math.abs(d) > A.tol) out.push({ x: +x.toFixed(2), z: +z.toFixed(2), cy: +cy.toFixed(3), d: +d.toFixed(3), mesh: h ? (h.object.name || h.object.geometry.type) + '|' + (Array.isArray(h.object.material) ? 'multi' : h.object.material.map?.name || h.object.material.name || h.object.material.color?.getHexString()) : 'none', col: col.handle, tag: tagOf(col) || '-', shape: col.shape.type, ny: +hit.normal.y.toFixed(2) });
    }
    y = cy - 0.05; // next layer down: colliders already hit in this column are excluded
    if (y < -15) break;
  }
}
// cluster by collider handle + sign
const cl = new Map();
for (const p of out) {
  const sign = p.d < 0 ? 'FLOAT' : p.d <= A.sink ? 'SINK' : 'COVER';
  const k = p.col + sign + p.mesh;
  const c = cl.get(k) || cl.set(k, { col: p.col, tag: p.tag, shape: p.shape, sign, mesh: p.mesh, n: 0, max: 0, sum: 0, x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, cy: p.cy }).get(k);
  c.n++; c.sum += Math.abs(p.d); c.max = Math.max(c.max, Math.abs(p.d)); c.x0 = Math.min(c.x0, p.x); c.x1 = Math.max(c.x1, p.x); c.z0 = Math.min(c.z0, p.z); c.z1 = Math.max(c.z1, p.z);
}
const clusters = [...cl.values()].map((c) => ({ ...c, mean: +(c.sum / c.n).toFixed(3), max: +c.max.toFixed(3), sum: undefined })).sort((a, b) => b.n * b.mean - a.n * a.mean);
window.__sweep = { out, clusters };
return { ms: Math.round(performance.now() - t0), meshes: drawn.length, box, cols, tops, off: out.length, sink: out.filter((p) => p.d > 0 && p.d <= A.sink).length, cover: out.filter((p) => p.d > A.sink).length, float: out.filter((p) => p.d < 0).length, clusters: clusters.slice(0, A.top || 40) };
