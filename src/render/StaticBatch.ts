import * as THREE from 'three';
import { MovingInk } from './MovingInk';

/**
 * [INPUT]: depends on three (BufferGeometry, Layers, Scene.onBeforeRender); reads meshes under a level root;
 *          depends on MovingInk from ./MovingInk (the creatures' ink hulls, driven from the same watch)
 * [OUTPUT]: exports StaticBatch (build(), clear(), reveal(), stats) and drawCamera()
 * [POS]: render/ draw-call reducer for a built level. main.ts owns one per session; Renderer registers its camera
 *        with drawCamera() and reveals the sources while it precompiles. Sits beside SceneOptimizer: that file
 *        merges pieces a builder declared static and destroys them; this file keeps every source mesh alive.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/**
 * WHY. A level is ~1,500 small opaque meshes. Each one is paintable, fadeable and owned by gameplay code, so each
 * keeps its own mesh and (mostly) its own material. The renderer then pays one draw call per mesh, and the frame is
 * CPU-bound on draw submission (docs/perf/NOTES.md).
 *
 * HOW. The source meshes stay in the scene, untouched: paint, raycasts, the occlusion fader and gameplay still see
 * them. Only the drawing camera skips them (UndrawnLayers). One merged copy per material signature per map cell is
 * drawn in their place. Materials that differ only by colour share a merged copy: the colour moves into a vertex
 * attribute, which multiplies the diffuse colour exactly like the uniform did.
 *
 * SAFETY. A member is in its merged copy only while its state equals the state that was baked. Before every main
 * render the watch compares each member (world matrix, visibility chain, material, geometry, shadow flags). A member
 * that differs leaves its merged copy in that same frame and draws as itself again; it returns once it has matched
 * its baked state for REJOIN frames. Painting, fading, moving, hiding or recolouring a mesh therefore needs no
 * knowledge of this file.
 */

/**
 * A signature's meshes merge into one copy, and a copy that sprawls is cut in two at the median of its longest
 * axis, again and again, while both halves stay worth a draw call. A copy never culls better than its bounds:
 * one copy for a whole level is drawn in every view, even with one member on screen. The cut stops at
 * SPLIT_MEMBERS (each half keeps at least half of that) unless the copy is heavier than SPLIT_TRIS.
 */
const SPAN = 36;
const SPLIT_MEMBERS = 12;
const SPLIT_TRIS = 24000;
/** A merged copy needs at least this many members to be worth a rebuild. */
const MIN_MEMBERS = 2;
/** Frames a changed member must match its baked state again before it returns to the merged copy. */
const REJOIN = 30;

/** A drawing camera's Layers object carries these flags (a property read: this test runs per mesh per pass). */
type CamLayers = THREE.Layers & { wdDraw?: boolean; wdMain?: boolean };

/**
 * Register a camera that draws the world. Batched source meshes are invisible to it and to nothing else.
 * `main` = the gameplay camera: only its renders run the watch. (The co-op corner picture hides far parts for
 * its own render and shows them again; the watch must not read that as a change.)
 */
export function drawCamera(cam: THREE.Camera, main = false): void {
  (cam.layers as CamLayers).wdDraw = true;
  if (main) (cam.layers as CamLayers).wdMain = true;
}

/** Layers of a batched source mesh: every raycaster still matches, the drawing cameras never do. */
class UndrawnLayers extends THREE.Layers {
  override test(other: THREE.Layers): boolean {
    return (other as CamLayers).wdDraw !== true && (this.mask & other.mask) !== 0;
  }
}

type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;

/** One draw of a source mesh: the whole mesh, or one material group of a multi-material mesh. */
interface Piece {
  mesh: THREE.Mesh;
  mat: Mat;
  /** index (or vertex) range of the source geometry */
  from: number;
  count: number;
}

/** A piece once merged: where it sits in its merged copy, and the material state that was baked. */
interface Part {
  batch: Batch;
  start: number;
  count: number;
  mat: Mat;
  matVersion: number;
  color: THREE.Color;
  emissive: THREE.Color | null;
  emissiveIntensity: number;
  /** every texture of the material with its transform and content version: a scrolling UV is a change */
  tex: { t: THREE.Texture; ox: number; oy: number; rx: number; ry: number; rot: number; ver: number }[];
  map: THREE.Texture | null;
}

interface Member {
  mesh: THREE.Mesh;
  parts: Part[];
  inBatch: boolean;
  calm: number;
  layers: THREE.Layers;
  hidden: UndrawnLayers;
  /** the mesh's parent in the ancestor table (null: the mesh hangs on the scene) */
  up: Node | null;
  parent: THREE.Object3D;
  // ── baked state ──
  world: Float64Array;
  /** the mesh's material slot as it was: one material, or the array object */
  slot: THREE.Material | THREE.Material[];
  geo: THREE.BufferGeometry;
  index: THREE.BufferAttribute | null;
  drawStart: number;
  drawCount: number;
  groups: number;
  /** the vertex data that was copied, and its content versions (a geometry rewritten in place is a change) */
  attrs: THREE.BufferAttribute[];
  attrVer: number;
  cast: boolean;
  recv: boolean;
  order: number;
}

/**
 * An ancestor of members. Hundreds of members share a few ancestors, so the watch tests each ancestor once per
 * frame (visible, still on its parent, parent chain fine) and a member reads one flag.
 */
interface Node {
  o: THREE.Object3D;
  parent: THREE.Object3D;
  up: Node | null;
  ok: boolean;
}

interface Batch {
  mesh: THREE.Mesh;
  index: THREE.BufferAttribute;
  /** the full index data; the live buffer holds zeros where a member has left */
  full: Uint16Array | Uint32Array;
}

const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object): number => {
  let i = ids.get(o);
  if (!i) ids.set(o, (i = nextId++));
  return i;
};

/**
 * Two texture objects sample alike when they share the image and every sampling setting. (Materials.toon clones
 * the relief normal map per material; the clones share one image.)
 */
function textureKey(t: THREE.Texture): string {
  return [
    't', t.source.uuid, t.mapping, t.channel, t.wrapS, t.wrapT, t.magFilter, t.minFilter, t.anisotropy, t.format, t.type,
    t.colorSpace, t.flipY, t.premultiplyAlpha, t.generateMipmaps, t.offset.x, t.offset.y, t.repeat.x, t.repeat.y,
    t.center.x, t.center.y, t.rotation, t.matrixAutoUpdate ? '' : t.matrix.elements.join(','),
  ].join(',');
}

/** Everything that decides how a material draws, except its colour. Unknown value kinds compare by identity. */
export function signature(m: Mat): string {
  const parts: string[] = [m.type];
  const rec = m as unknown as Record<string, unknown>;
  for (const k of Object.keys(rec).sort()) {
    // (_listeners: three's event table, added to a material the first time the renderer uses it)
    if (k === 'uuid' || k === 'name' || k === 'color' || k === 'version' || k === 'userData' || k === 'vertexColors' || k === '_listeners') continue;
    const v = rec[k];
    let s: string;
    if (v === null || v === undefined || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') s = String(v);
    else if ((v as THREE.Color).isColor) s = `${(v as THREE.Color).r},${(v as THREE.Color).g},${(v as THREE.Color).b}`;
    else if ((v as THREE.Vector2).isVector2) s = `${(v as THREE.Vector2).x},${(v as THREE.Vector2).y}`;
    else if ((v as THREE.Euler).isEuler) s = `${(v as THREE.Euler).x},${(v as THREE.Euler).y},${(v as THREE.Euler).z}`;
    else if ((v as THREE.Texture).isTexture) s = textureKey(v as THREE.Texture);
    else if (k === 'defines') s = JSON.stringify(v);
    else s = 'o' + idOf(v as object);
    parts.push(k + '=' + s);
  }
  return parts.join(';');
}

const protoCompile = THREE.Material.prototype.onBeforeCompile;
const protoKey = THREE.Material.prototype.customProgramCacheKey;
const protoBefore = THREE.Object3D.prototype.onBeforeRender;
const protoAfter = THREE.Object3D.prototype.onAfterRender;

function usesUv(m: Mat): boolean {
  for (const v of Object.values(m as unknown as Record<string, unknown>)) if ((v as THREE.Texture | null)?.isTexture && !(v as THREE.CubeTexture).isCubeTexture) return true;
  return false;
}

/** The attributes a merged copy reads from a source geometry. */
function copied(g: THREE.BufferGeometry): THREE.BufferAttribute[] {
  const a = g.attributes as Record<string, THREE.BufferAttribute | undefined>;
  return [a.position, a.normal, a.uv, a.color, g.index ?? undefined].filter((x): x is THREE.BufferAttribute => !!x);
}

function attrVersion(attrs: THREE.BufferAttribute[]): number {
  let v = 0;
  for (let i = 0; i < attrs.length; i++) v += attrs[i].version;
  return v;
}

function texState(m: Mat): Part['tex'] {
  const out: Part['tex'] = [];
  const rec = m as unknown as Record<string, unknown>;
  for (const key of Object.keys(rec)) {
    const t = rec[key] as THREE.Texture | null;
    if (t?.isTexture) out.push({ t, ox: t.offset.x, oy: t.offset.y, rx: t.repeat.x, ry: t.repeat.y, rot: t.rotation, ver: t.version });
  }
  return out;
}

const _v = new THREE.Vector3();
const _box = new THREE.Box3();
const _rel = new THREE.Matrix4();
const _nrm = new THREE.Matrix3();
const _col = new THREE.Color();

export class StaticBatch {
  private members: Member[] = [];
  private memberOf = new Map<THREE.Mesh, Member>();
  private nodes: Node[] = [];
  private nodeOf = new Map<THREE.Object3D, Node>();
  private batches: Batch[] = [];
  private scene: THREE.Scene | null = null;
  private prevHook: THREE.Scene['onBeforeRender'] | null = null;
  private revealed = false;
  /** What moves but shares one material: the creatures' ink hulls (one draw per ink material). */
  readonly ink = new MovingInk(() => new UndrawnLayers());
  /** Read by the test probe and docs/perf: how much the last build() merged. */
  stats = { members: 0, batches: 0, out: 0, skipped: {} as Record<string, number> };

  /**
   * Merge the mergeable meshes under `root` (a level root, static in the world). Call after the level is built,
   * the art style is applied and casters are trimmed. Call again after anything that restyles every material.
   */
  build(scene: THREE.Scene, root: THREE.Object3D): void {
    this.clear();
    this.why = {};
    this.scene = scene;
    scene.updateMatrixWorld(true);
    for (let p = root.parent; p; p = p.parent) if (!p.visible) return;
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const groups = new Map<string, Piece[]>();
    const walk = (o: THREE.Object3D): void => {
      // a hidden subtree is not in the picture now: it joins on the next build, not through the watch.
      // Creatures (EnemyBase: paintDynamic + noFade) get their own paint materials right after this and never rest.
      if (!o.visible || o.userData.noBatch || (o.userData.paintDynamic && o.userData.noFade)) return;
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const pieces = this.piecesOf(m);
        if (pieces) {
          const tail = `|${m.castShadow ? 1 : 0}${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${m.geometry.attributes.normal ? 1 : 0}`;
          for (const pc of pieces) {
            // Opaque draws go in material-id order, and an ink hull that lies flush with a wall loses that depth
            // tie because its material is older than the wall's. A copied material is the newest one and would
            // win the tie instead (a dotted line on the wall). So hulls merge only under their own material.
            const key = (m.userData.isOutline ? 'same:' + pc.mat.uuid : this.sigOf(pc.mat)) + tail;
            const g = groups.get(key);
            if (g) g.push(pc);
            else groups.set(key, [pc]);
          }
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(root);
    for (const all of groups.values()) {
      for (const pieces of this.split(all)) {
        // a lone piece gains nothing, unless it is one face of a multi-material mesh whose other faces merge
        if (pieces.length >= MIN_MEMBERS || Array.isArray(pieces[0].mesh.material)) this.merge(pieces, root, inv);
        else this.no('alone');
      }
    }
    // only now hide the sources: a mesh is hidden when every one of its pieces has a merged copy
    for (const m of this.members) {
      const want = Array.isArray(m.slot) ? m.groups : 1;
      if (m.parts.length === want) (m.mesh as { layers: THREE.Layers }).layers = m.hidden;
      else this.drop(m);
    }
    this.members = this.members.filter((m) => m.parts.length);
    this.stats = { members: this.members.length, batches: this.batches.length, out: 0, skipped: this.why };
    this.ink.attach(scene, root);
    this.prevHook = scene.onBeforeRender;
    const prev = this.prevHook;
    const self = this;
    scene.onBeforeRender = function (this: THREE.Scene, r, s, cam, ...rest) {
      prev.call(this, r, s, cam, ...rest);
      if ((cam.layers as CamLayers).wdMain === true) self.watch(r.info.render.frame);
    } as THREE.Scene['onBeforeRender'];
  }

  /** Give every source mesh back to the renderer and drop the merged copies. */
  clear(): void {
    this.ink.clear();
    for (const m of this.members) (m.mesh as { layers: THREE.Layers }).layers = m.layers;
    for (const b of this.batches) {
      b.mesh.removeFromParent();
      b.mesh.geometry.dispose();
      const mat = b.mesh.material as THREE.Material;
      if (mat.userData.wdBatchOwned) mat.dispose();
    }
    if (this.scene && this.prevHook) this.scene.onBeforeRender = this.prevHook;
    this.members = [];
    this.memberOf.clear();
    this.nodes = [];
    this.nodeOf.clear();
    this.batches = [];
    this.scene = null;
    this.prevHook = null;
    this.lastFrame = -1;
    this.stats = { members: 0, batches: 0, out: 0, skipped: {} };
  }

  /**
   * Shader precompile walks the scene with the drawing camera: show it the sources too, so a member that leaves
   * its merged copy mid-game finds its own program already compiled. Call with false afterwards.
   */
  reveal(on: boolean): void {
    this.revealed = on;
    this.ink.reveal(on);
    for (const m of this.members) (m.mesh as { layers: THREE.Layers }).layers = on || !m.inBatch ? m.layers : m.hidden;
  }

  // ───────────── who can be merged ─────────────

  /** Why meshes stayed out of the last build (reason → count): the probe reads it. */
  private why: Record<string, number> = {};
  private no(reason: string): null {
    this.why[reason] = (this.why[reason] ?? 0) + 1;
    return null;
  }

  /** One group per signature, cut by position while it sprawls (see SPAN). */
  private split(pieces: Piece[]): Piece[][] {
    const out: Piece[][] = [];
    const at = new Map<Piece, THREE.Vector3>();
    for (const p of pieces) at.set(p, p.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(p.mesh.matrixWorld));
    const cut = (g: Piece[]): void => {
      let tris = 0;
      _box.makeEmpty();
      for (const p of g) {
        tris += p.count / 3;
        _box.expandByPoint(at.get(p)!);
      }
      _box.getSize(_v);
      const axis = _v.x >= _v.z ? 'x' : 'z';
      const span = Math.max(_v.x, _v.z);
      if (g.length < 2 || span < 1e-3 || !((span > SPAN && g.length >= SPLIT_MEMBERS) || tris > SPLIT_TRIS)) {
        out.push(g);
        return;
      }
      const sorted = [...g].sort((a, b) => at.get(a)![axis] - at.get(b)![axis]);
      const mid = sorted.length >> 1;
      cut(sorted.slice(0, mid));
      cut(sorted.slice(mid));
    };
    cut(pieces);
    return out;
  }

  private matOk(mat: Mat | null | undefined, g: THREE.BufferGeometry): boolean {
    if (!mat) return false;
    const std = (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial === true;
    if (!std && !(mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return !!this.no('matType');
    if (mat.transparent || mat.alphaTest > 0 || mat.opacity < 1 || !mat.visible || !mat.depthTest || !mat.depthWrite) return !!this.no('notOpaque');
    if (std && !g.attributes.normal && !(mat as THREE.MeshStandardMaterial).flatShading) return !!this.no('noNormal');
    return true;
  }

  /** The draws of one mesh, or null when the mesh must keep drawing itself. */
  private piecesOf(m: THREE.Mesh): Piece[] | null {
    if ((m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.BatchedMesh).isBatchedMesh) return null;
    if (m.userData.wdBatch || m.userData.paintChunk) return this.no('flag');
    if (m.morphTargetInfluences?.length || m.customDepthMaterial || m.customDistanceMaterial) return this.no('morph');
    if (m.onBeforeRender !== protoBefore || m.onAfterRender !== protoAfter) return this.no('hook');
    if (m.layers.mask !== 1) return this.no('layers');
    const g = m.geometry;
    const pos = g.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos || (pos as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return this.no('geometry');
    if (g.morphAttributes.position?.length || g.attributes.tangent) return this.no('morphGeo');
    if (!g.boundingBox) g.computeBoundingBox();
    if (g.boundingBox!.isEmpty()) return this.no('empty');
    const total = g.index ? g.index.count : pos.count;
    const lo = Math.max(0, g.drawRange.start);
    const hi = Math.min(total, g.drawRange.start + g.drawRange.count);
    const mats = m.material as Mat | Mat[];
    if (!Array.isArray(mats)) {
      if (!this.matOk(mats, g)) return null;
      return hi - lo >= 3 ? [{ mesh: m, mat: mats, from: lo, count: Math.floor((hi - lo) / 3) * 3 }] : this.no('empty');
    }
    // one draw per material group, exactly as the renderer does it
    const out: Piece[] = [];
    for (const gr of g.groups) {
      const mat = mats[gr.materialIndex ?? 0];
      if (!this.matOk(mat, g)) return null;
      const a = Math.max(lo, gr.start);
      const b = Math.min(hi, gr.start + gr.count);
      if (b - a < 3) return this.no('emptyGroup');
      out.push({ mesh: m, mat, from: a, count: Math.floor((b - a) / 3) * 3 });
    }
    return out.length ? out : this.no('noGroups');
  }

  /** A material with its own shader patch has no safe copy: its meshes merge only with users of that same material. */
  private sigOf(mat: Mat): string {
    const patched = mat.onBeforeCompile !== protoCompile || mat.customProgramCacheKey !== protoKey;
    const s = mat as THREE.MeshStandardMaterial;
    // (textures on a second UV set cannot be merged here either)
    return patched || s.aoMap || s.lightMap ? 'same:' + mat.uuid : signature(mat);
  }

  // ───────────── merging ─────────────

  private member(m: THREE.Mesh): Member {
    let mem = this.memberOf.get(m);
    if (mem) return mem;
    const g = m.geometry;
    mem = {
      mesh: m,
      parts: [],
      inBatch: true,
      calm: 0,
      layers: m.layers,
      hidden: new UndrawnLayers(),
      up: this.node(m.parent!),
      parent: m.parent!,
      world: Float64Array.from(m.matrixWorld.elements),
      slot: m.material,
      geo: g,
      index: g.index,
      drawStart: g.drawRange.start,
      drawCount: g.drawRange.count,
      groups: g.groups.length,
      attrs: copied(g),
      attrVer: attrVersion(copied(g)),
      cast: m.castShadow,
      recv: m.receiveShadow,
      order: m.renderOrder,
    };
    this.memberOf.set(m, mem);
    this.members.push(mem);
    return mem;
  }

  /** The ancestor table entry of `o` (parents come first in `nodes`). */
  private node(o: THREE.Object3D): Node | null {
    if (o === this.scene) return null;
    let n = this.nodeOf.get(o);
    if (n) return n;
    const up = this.node(o.parent!);
    n = { o, parent: o.parent!, up, ok: true };
    this.nodeOf.set(o, n);
    this.nodes.push(n);
    return n;
  }

  /** A mesh whose pieces did not all merge draws itself: take its merged pieces out again. */
  private drop(m: Member): void {
    for (const p of m.parts) {
      p.batch.full.fill(0, p.start, p.start + p.count);
      (p.batch.index.array as Uint16Array | Uint32Array).fill(0, p.start, p.start + p.count);
      p.batch.index.needsUpdate = true;
    }
    m.parts = [];
    this.memberOf.delete(m.mesh);
    this.no('partlyMerged');
  }

  private merge(pieces: Piece[], root: THREE.Object3D, inv: THREE.Matrix4): void {
    const first = pieces[0].mat;
    const shared = pieces.every((p) => p.mat === first) && !first.vertexColors;
    const withNormal = !!pieces[0].mesh.geometry.attributes.normal;
    const withUv = usesUv(first);
    const withColor = !shared;
    let nv = 0;
    let ni = 0;
    for (const p of pieces) {
      nv += p.mesh.geometry.attributes.position.count;
      ni += p.count;
    }
    const P = new Float32Array(nv * 3);
    const N = withNormal ? new Float32Array(nv * 3) : null;
    const U = withUv ? new Float32Array(nv * 2) : null;
    const C = withColor ? new Float32Array(nv * 3) : null;
    const I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const batch: Batch = { mesh: null as unknown as THREE.Mesh, index: null as unknown as THREE.BufferAttribute, full: I };
    let v0 = 0;
    let i0 = 0;
    for (const pc of pieces) {
      const m = pc.mesh;
      const g = m.geometry;
      const mat = pc.mat;
      const pos = g.attributes.position as THREE.BufferAttribute;
      const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
      const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
      const col = g.attributes.color as THREE.BufferAttribute | undefined;
      const n = pos.count;
      _rel.multiplyMatrices(inv, m.matrixWorld);
      // normals keep their length: the shader then interpolates exactly what it did for the single mesh
      _nrm.getNormalMatrix(_rel);
      for (let i = 0; i < n; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(_rel);
        P[(v0 + i) * 3] = _v.x;
        P[(v0 + i) * 3 + 1] = _v.y;
        P[(v0 + i) * 3 + 2] = _v.z;
        if (N && nrm) {
          _v.fromBufferAttribute(nrm, i).applyMatrix3(_nrm);
          N[(v0 + i) * 3] = _v.x;
          N[(v0 + i) * 3 + 1] = _v.y;
          N[(v0 + i) * 3 + 2] = _v.z;
        }
        if (U && uv) {
          U[(v0 + i) * 2] = uv.getX(i);
          U[(v0 + i) * 2 + 1] = uv.getY(i);
        }
        if (C) {
          _col.copy(mat.color);
          if (mat.vertexColors && col) _col.setRGB(_col.r * col.getX(i), _col.g * col.getY(i), _col.b * col.getZ(i));
          C[(v0 + i) * 3] = _col.r;
          C[(v0 + i) * 3 + 1] = _col.g;
          C[(v0 + i) * 3 + 2] = _col.b;
        }
      }
      // a mirrored mesh draws with its winding flipped: flip the triangles instead
      const flip = _rel.determinant() < 0;
      for (let t = 0; t < pc.count; t += 3) {
        const a = g.index ? g.index.getX(pc.from + t) : pc.from + t;
        const b = g.index ? g.index.getX(pc.from + t + 1) : pc.from + t + 1;
        const c = g.index ? g.index.getX(pc.from + t + 2) : pc.from + t + 2;
        I[i0 + t] = v0 + a;
        I[i0 + t + 1] = v0 + (flip ? c : b);
        I[i0 + t + 2] = v0 + (flip ? b : c);
      }
      const std = mat as THREE.MeshStandardMaterial;
      this.member(m).parts.push({
        batch,
        start: i0,
        count: pc.count,
        mat,
        matVersion: mat.version,
        color: mat.color.clone(),
        emissive: std.emissive ? std.emissive.clone() : null,
        emissiveIntensity: std.emissiveIntensity ?? 1,
        tex: texState(mat),
        map: mat.map,
      });
      v0 += n;
      i0 += pc.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
    if (N) geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    if (U) geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    if (C) geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
    const index = new THREE.BufferAttribute(I.slice(), 1);
    geo.setIndex(index);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    let mat: THREE.Material = first;
    const ink = pieces.every((p) => p.mesh.userData.isOutline);
    if (!shared) {
      mat = first.clone();
      // (a material's copy() resets `defines` to its class default: the art style's WD_TOON would be lost)
      if (first.defines) mat.defines = { ...first.defines };
      (mat as Mat).color.setRGB(1, 1, 1);
      (mat as Mat).vertexColors = true;
      mat.userData = { wdBatchOwned: true };
    }
    const src = pieces[0].mesh;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'static-batch';
    mesh.castShadow = src.castShadow;
    mesh.receiveShadow = src.receiveShadow;
    mesh.renderOrder = src.renderOrder;
    mesh.matrixAutoUpdate = false;
    // the sources stay the ones that are painted, faded and hit by rays
    mesh.userData.wdBatch = true;
    mesh.userData.noPaint = true;
    mesh.userData.noFade = true;
    mesh.userData.isOutline = ink;
    mesh.raycast = () => {};
    root.add(mesh);
    mesh.updateMatrixWorld(true);
    batch.mesh = mesh;
    batch.index = index;
    this.batches.push(batch);
  }

  // ───────────── the watch ─────────────

  private lastFrame = -1;

  private watch(frame: number): void {
    if (frame === this.lastFrame || this.revealed) return;
    this.lastFrame = frame;
    const nodes = this.nodes;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      n.ok = n.o.visible && n.o.parent === n.parent && (n.up === null || n.up.ok);
    }
    let out = 0;
    const members = this.members;
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const ok = this.same(m);
      if (m.inBatch) {
        if (!ok) this.leave(m);
      } else if (!ok) m.calm = 0;
      else if (++m.calm >= REJOIN) this.join(m);
      if (!m.inBatch) out++;
    }
    this.stats.out = out;
    this.ink.sync();
  }

  private same(m: Member): boolean {
    const o = m.mesh;
    // cheapest and likeliest first: hidden, re-parented, moved
    if (!o.visible || o.parent !== m.parent || (m.up !== null && !m.up.ok)) return false;
    const e = o.matrixWorld.elements;
    const w = m.world;
    if (e[12] !== w[12] || e[13] !== w[13] || e[14] !== w[14]) return false;
    for (let i = 0; i < 12; i++) if (e[i] !== w[i]) return false;
    if (o.material !== m.slot || o.geometry !== m.geo || o.castShadow !== m.cast || o.receiveShadow !== m.recv || o.renderOrder !== m.order) return false;
    const g = m.geo;
    if (g.index !== m.index || g.drawRange.start !== m.drawStart || g.drawRange.count !== m.drawCount || g.groups.length !== m.groups) return false;
    if (g.attributes.position !== m.attrs[0] || attrVersion(m.attrs) !== m.attrVer) return false;
    const parts = m.parts;
    for (let k = 0; k < parts.length; k++) {
      const p = parts[k];
      const mat = p.mat;
      if (mat.version !== p.matVersion || mat.opacity !== 1 || mat.transparent || !mat.visible || mat.map !== p.map) return false;
      const col = mat.color;
      if (col.r !== p.color.r || col.g !== p.color.g || col.b !== p.color.b) return false;
      if (p.emissive !== null) {
        const em = (mat as THREE.MeshStandardMaterial).emissive;
        if (em.r !== p.emissive.r || em.g !== p.emissive.g || em.b !== p.emissive.b || (mat as THREE.MeshStandardMaterial).emissiveIntensity !== p.emissiveIntensity) return false;
      }
      const tex = p.tex;
      for (let i = 0; i < tex.length; i++) {
        const x = tex[i];
        const t = x.t;
        if (t.offset.x !== x.ox || t.offset.y !== x.oy || t.repeat.x !== x.rx || t.repeat.y !== x.ry || t.rotation !== x.rot || t.version !== x.ver) return false;
      }
    }
    // a material array edited in place (same array, another material in a slot)
    const slot = m.slot;
    if (Array.isArray(slot)) for (const p of parts) if (!slot.includes(p.mat)) return false;
    return true;
  }

  private leave(m: Member): void {
    m.inBatch = false;
    m.calm = 0;
    (m.mesh as { layers: THREE.Layers }).layers = m.layers;
    this.write(m, false);
  }

  private join(m: Member): void {
    m.inBatch = true;
    (m.mesh as { layers: THREE.Layers }).layers = m.hidden;
    this.write(m, true);
  }

  /** Put a member's triangles back into the live index buffers, or collapse them to nothing. */
  private write(m: Member, on: boolean): void {
    for (const p of m.parts) {
      const idx = p.batch.index;
      const live = idx.array as Uint16Array | Uint32Array;
      if (on) live.set(p.batch.full.subarray(p.start, p.start + p.count), p.start);
      else live.fill(0, p.start, p.start + p.count);
      idx.addUpdateRange(p.start, p.count);
      idx.needsUpdate = true;
    }
  }
}
