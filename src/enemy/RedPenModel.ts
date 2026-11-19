/**
 * [INPUT]: depends on three (LatheGeometry); sculptSkin from ./RedPenSkin; a clone of the Tripo GLB in slot `redPen`
 *          (AssetManager.instantiateModel, pivot 'raw')
 * [OUTPUT]: exports fitPenModel() → PenModel (the fitted model root, its live materials, radiusAt(y), the lathe that
 *           traces its silhouette)
 * [POS]: the bridge between the sculpted Red Pen (public/models/red_pen.glb) and the rig RedPenLook builds. The fight's
 *        geometry is fixed in code (RedPenBody: four capsules round one straight axis, the WEAK table), so the model is
 *        fitted to the rig, never the rig to the model: the barrel's axis goes on the Y axis and the barrel radius
 *        becomes 0.62 m, both measured from the mesh. The manifest entry gives the height (which puts grip, clip and
 *        cap on the WEAK table) and the yaw (face side +Z, so the clip on the model's left hangs at +X).
 *        Its materials become transparent and fog-free like RedPenSkin's: the Pen fades as one, and the paint system
 *        skips transparent materials, so the Pen stays red under WAI's splats.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import { sculptSkin } from './RedPenSkin';

/** The barrel radius the model is fitted to (m, at scale 1): RedPenBody's capsules are 0.51–0.57, so the body shows
 *  at most 0.15 m (at ×2.2) outside what WAI collides with; any fatter and he would stand inside the drawn surface. */
const BARREL_R = 0.62;
const BINS = 64;

export interface PenModel {
  root: THREE.Object3D;
  mats: THREE.MeshMatcapMaterial[];
  /** Surface radius (m, clip excluded) at height y above the nib tip. */
  radiusAt(y: number): number;
  /** A coarse lathe of the silhouette (the phase-3 sketch lines are its edges). */
  lathe(segments: number): THREE.BufferGeometry;
}

/** The value `q` of the way up the sorted list (0.5 = median). */
const quantile = (a: number[], q = 0.5): number => {
  if (!a.length) return 0;
  const s = a.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};

export function fitPenModel(root: THREE.Object3D): PenModel {
  // ── every vertex in the model root's own space ──
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const pts: number[] = [];
  const mats: THREE.MeshMatcapMaterial[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute('position');
    m4.multiplyMatrices(inv, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m4);
      pts.push(v.x, v.y, v.z);
    }
    // its own materials (the fade must not leak into the cached GLB), in the Pen's unlit skin
    const own = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((mat) => {
      const c = sculptSkin(mat as THREE.MeshStandardMaterial);
      mats.push(c);
      return c;
    });
    mesh.material = Array.isArray(mesh.material) ? own : own[0];
  });
  const n = pts.length / 3;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < n; i++) {
    y0 = Math.min(y0, pts[i * 3 + 1]);
    y1 = Math.max(y1, pts[i * 3 + 1]);
  }
  const h = Math.max(1e-3, y1 - y0);
  const frac = (i: number) => (pts[i * 3 + 1] - y0) / h;

  // ── the axis: the barrel between 30 % and 60 % of the height is a plain cylinder (no clip, no nib) ──
  const bx: number[] = [], bz: number[] = [];
  for (let i = 0; i < n; i++) {
    const f = frac(i);
    if (f > 0.3 && f < 0.6) {
      bx.push(pts[i * 3]);
      bz.push(pts[i * 3 + 2]);
    }
  }
  const cx = (Math.min(...bx) + Math.max(...bx)) / 2;
  const cz = (Math.min(...bz) + Math.max(...bz)) / 2;

  // ── radius per height: the upper-quartile distance from the axis: the outside of ribs and rings, while a clip or
  //    a rivet stays a minority of its ring ──
  const rings: number[][] = Array.from({ length: BINS }, () => []);
  for (let i = 0; i < n; i++) rings[Math.min(BINS - 1, Math.floor(frac(i) * BINS))].push(Math.hypot(pts[i * 3] - cx, pts[i * 3 + 2] - cz));
  const prof = rings.map((r) => quantile(r, 0.75));
  for (let i = 1; i < BINS; i++) if (!rings[i].length) prof[i] = prof[i - 1];
  const barrel = quantile(prof.slice(Math.floor(BINS * 0.3), Math.floor(BINS * 0.6))) || BARREL_R;
  const s = THREE.MathUtils.clamp(BARREL_R / barrel, 0.6, 1.6);

  // ── fit: nib tip at y 0 on the axis ──
  const fit = new THREE.Group();
  fit.name = 'red-pen-model';
  root.position.set(-cx, -y0, -cz);
  fit.add(root);
  fit.scale.set(s, 1, s);

  const radiusAt = (y: number): number => {
    const k = THREE.MathUtils.clamp((y / h) * BINS - 0.5, 0, BINS - 1);
    const a = Math.floor(k), b = Math.min(BINS - 1, a + 1);
    return (prof[a] + (prof[b] - prof[a]) * (k - a)) * s;
  };
  return {
    root: fit,
    mats,
    radiusAt,
    lathe(segments) {
      const line: THREE.Vector2[] = [new THREE.Vector2(0.001, 0)];
      for (let i = 1; i < 24; i++) line.push(new THREE.Vector2(Math.max(0.02, radiusAt((i / 24) * h)), (i / 24) * h));
      line.push(new THREE.Vector2(0.001, h));
      return new THREE.LatheGeometry(line, segments);
    },
  };
}
