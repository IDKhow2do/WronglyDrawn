// Candidate spots next to walls / in inner corners: walkable tops with blockers close around chest height.
// window.__cands = [{p:[x,y,z], hits, corner}]
const s = __WD.session, ph = s.physics, R = ph.world, V = __WD.app.camera.camera.position.constructor;
const RAP = s.physics.constructor; // unused
const blk = s.cameraBlocker;
// bounds from static colliders (skip giant ones)
let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, ymax = -Infinity;
R.forEachCollider((c) => {
  const t = ph.tagOf(c);
  if (t !== 'static' && t !== 'undrawn') return;
  const p = c.translation();
  if (!Number.isFinite(p.x)) return;
  x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); ymax = Math.max(ymax, p.y);
});
const step = window.__args?.step ?? 2;
const out = [];
const dirs = [];
for (let k = 0; k < 8; k++) dirs.push(new V(Math.sin((k * Math.PI) / 4), 0, Math.cos((k * Math.PI) / 4)));
const RayC = window.__RAPIER_Ray;
for (let x = x0; x <= x1; x += step)
  for (let z = z0; z <= z1; z += step) {
    // every upward-facing surface under (x, z)
    const tops = [];
    let y = ymax + 30;
    for (let n = 0; n < 6; n++) {
      const h = ph.raycast(new V(x, y, z), new V(0, -1, 0), 200, (c) => { const t = ph.tagOf(c); return t === 'static' || t === 'undrawn' || t === 'host' || t === 'gate'; });
      if (!h) break;
      if (h.normal.y > 0.8 && !ph.isNosingRamp(h.collider)) tops.push(h.point.clone());
      // heightfields / trimeshes have no inside: nothing walkable under them
      const ty = h.collider.shape.type;
      if (ty === 6 || ty === 7) break;
      // continue below this collider: find where the ray exits it
      let yy = h.point.y - 0.05;
      let inside = true;
      for (let g = 0; g < 80 && inside; g++) {
        inside = false;
        R.intersectionsWithPoint({ x, y: yy, z }, () => ((inside = true), false));
        if (inside) yy -= 0.25;
      }
      y = yy;
    }
    for (const g of tops) {
      // headroom 2 m, not inside anything
      const chest = g.clone().setY(g.y + 1.0);
      let bad = false;
      R.intersectionsWithPoint({ x: chest.x, y: chest.y, z: chest.z }, () => ((bad = true), false));
      if (bad) continue;
      const up = ph.raycast(g.clone().setY(g.y + 0.2), new V(0, 1, 0), 2.2, blk);
      if (up) continue;
      // jitter-prone: blockers within 1.4 m round the chest
      const near = dirs.map((d) => ph.raycast(chest, d, 1.4, blk)?.dist ?? 9);
      const hits = near.filter((d) => d < 1.4).length;
      if (!hits) continue;
      // inner corner = two blocked directions ≥ 90° apart
      let corner = false;
      for (let a = 0; a < 8; a++) for (let b = a + 2; b < 8; b++) if (near[a] < 1.4 && near[b] < 1.4 && b - a <= 6) corner = true;
      out.push({ p: [+g.x.toFixed(2), +(g.y + 0.1).toFixed(2), +g.z.toFixed(2)], hits, corner });
    }
  }
window.__cands = out;
return { n: out.length, corners: out.filter((c) => c.corner).length, bounds: [x0, x1, z0, z1, ymax] };
