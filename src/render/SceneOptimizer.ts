import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * [INPUT]: three + BufferGeometryUtils.mergeGeometries; meshes tagged userData.uniqueUv (AssetManager GLBs) or userData.batch (WonkyBuilding/ArchKit)
 * [OUTPUT]: cullModels(root), batchStatic(group), singlePassFlats(root)
 * [POS]: render/ one-shot scene clean-ups after a level is built; main.ts calls cullModels and singlePassFlats,
 *        WonkyBuilding calls batchStatic. render/StaticBatch.ts is the non-destructive merge for everything else.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/**
 * Render-side clean-ups run once a level is built (docs/perf/PERF.md).
 *
 *  · cullModels — GLB props come out of AssetManager.instantiateModel with frustumCulled = false
 *    (needed only for skinned meshes, whose bounds lag the pose). Rigid meshes cull fine, and with
 *    culling off every one of them was drawn every frame, in the main pass AND the shadow pass —
 *    over half of the scene's triangles.
 *  · batchStatic — merge a house's small static pieces (architecture kit, roof tiles, ridge, trims)
 *    into one mesh per material: dozens of draw calls per house → a handful.
 */

/** Turn frustum culling back on for rigid (non-skinned) GLB meshes under `root`. Returns how many. */
export function cullModels(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.frustumCulled || !m.userData.uniqueUv) return;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    if (m.morphTargetInfluences?.length) return;
    // a skinned sibling anywhere in the same model: leave the whole model alone (rigs move bones)
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    if (!m.geometry.boundingSphere || !Number.isFinite(m.geometry.boundingSphere.radius)) return;
    m.frustumCulled = true;
    n++;
  });
  return n;
}

/**
 * Double-sided transparent materials draw in two passes (back faces, then front faces), and three flags the
 * material for a program check before each pass: two shader-cache lookups per material per frame, forever.
 * A flat sheet (decal, sign, glow card) shows one side at a time, so the two passes draw the same pixels as one.
 * Such materials switch to a single pass. Materials that any non-flat mesh uses keep the two passes.
 */
export function singlePassFlats(root: THREE.Object3D): number {
  const flat = new Map<THREE.Material, boolean>();
  const size = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    g.boundingBox!.getSize(size);
    const isFlat = !g.boundingBox!.isEmpty() && Math.min(size.x, size.y, size.z) < 1e-5 && !(m as THREE.SkinnedMesh).isSkinnedMesh && !m.morphTargetInfluences?.length;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (!mat || !mat.transparent || mat.side !== THREE.DoubleSide || mat.forceSinglePass) continue;
      flat.set(mat, (flat.get(mat) ?? true) && isFlat);
    }
  });
  let n = 0;
  for (const [mat, ok] of flat) {
    if (!ok) continue;
    mat.forceSinglePass = true;
    n++;
  }
  return n;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

/**
 * Merge every mesh flagged `userData.batch` under `group` into one mesh per
 * (material, shadow flags). The pieces must be static relative to `group`, unpainted, with a
 * single material. Their ink hulls (children flagged staticInk) are kept: re-parented to the group
 * with the same world transform, so the level's mergeStaticInk still collects them.
 */
export function batchStatic(group: THREE.Object3D): number {
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  const pieces: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.userData.batch && !Array.isArray(m.material) && m.visible) pieces.push(m);
  });
  if (pieces.length < 2) return 0;
  for (const m of pieces) {
    const mat = m.material as THREE.Material;
    const key = `${mat.uuid}|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat, cast: m.castShadow, recv: m.receiveShadow, geos: [], meshes: [] }));
    const src = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    // keep only what the materials read (merge needs identical attribute sets)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', src.getAttribute('position'));
    if (src.getAttribute('normal')) g.setAttribute('normal', src.getAttribute('normal'));
    else {
      g.computeVertexNormals();
    }
    g.setAttribute('uv', src.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(src.getAttribute('position').count * 2), 2));
    if ((mat as THREE.MeshStandardMaterial).vertexColors) {
      const c = src.getAttribute('color');
      if (!c) continue;
      g.setAttribute('color', c);
    }
    g.applyMatrix4(_m.multiplyMatrices(_inv, m.matrixWorld));
    // mirrored pieces (negative scale) flip their winding: un-flip so front faces stay front faces
    if (_m.determinant() < 0) {
      const p = g.getAttribute('position') as THREE.BufferAttribute;
      for (const a of [p, g.getAttribute('normal'), g.getAttribute('uv'), g.getAttribute('color')].filter(Boolean) as THREE.BufferAttribute[]) {
        for (let i = 0; i < a.count; i += 3) {
          for (let k = 0; k < a.itemSize; k++) {
            const t = a.array[(i + 1) * a.itemSize + k];
            (a.array as Float32Array)[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
            (a.array as Float32Array)[(i + 2) * a.itemSize + k] = t;
          }
        }
      }
    }
    b.geos.push(g);
    b.meshes.push(m);
  }
  let merged = 0;
  for (const b of buckets.values()) {
    if (b.meshes.length < 2) continue;
    const geo = mergeGeometries(b.geos);
    if (!geo) continue;
    for (const g of b.geos) g.dispose();
    for (const m of b.meshes) {
      // the ink hulls stay where they are in the world
      for (const c of [...m.children]) group.attach(c);
      m.removeFromParent();
    }
    const mesh = new THREE.Mesh(geo, b.mat);
    mesh.name = 'house-batch';
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.userData.noPaint = true;
    mesh.userData.noFade = true;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    mesh.updateMatrixWorld(true);
    merged += b.meshes.length;
  }
  return merged;
}
