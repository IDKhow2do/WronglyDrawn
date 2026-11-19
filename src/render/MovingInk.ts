import * as THREE from 'three';

/**
 * [INPUT]: depends on three (BatchedMesh); reads creature subtrees (userData.paintDynamic + noFade, set by
 *          EnemyBase) and their ink hulls (userData.isOutline, made by Materials.addOutline / markActor)
 * [OUTPUT]: exports MovingInk (attach(), clear(), reveal(), sync(), stats)
 * [POS]: render/ helper of StaticBatch, which owns one and drives it from the same per-frame watch. StaticBatch
 *        merges what rests; this draws what moves but shares one material: the creatures' ink outlines.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */

/**
 * WHY. A creature is a dozen rigid parts, and every part carries an ink hull: one more draw call per part, all
 * with the same black material. Twenty creatures in view are ~160 draws of ink.
 *
 * HOW. One THREE.BatchedMesh per ink material holds a copy of each hull's vertices. Every frame each hull hands
 * its world matrix to its slot, and the renderer draws all slots in one call (WEBGL_multi_draw; without it three
 * loops the draws under one program and one material setup). The hull itself stays in the scene, hidden from the
 * drawing cameras only, so EnemyBase.fitOutline, the occlusion fader and the art style keep working on it.
 *
 * SAFETY. A slot shows only while its hull would draw the same picture: still in the scene, every ancestor
 * visible, same material, same geometry, not mirrored. Otherwise the slot hides and the hull draws itself.
 */

/** Frames between two looks for new hulls (creatures spawn mid-level, and get their ink material at precompile). */
const RESCAN = 30;

interface Slot {
  hull: THREE.Mesh;
  group: Group;
  id: number;
  shown: boolean;
  layers: THREE.Layers;
  hidden: THREE.Layers;
  geo: THREE.BufferGeometry;
  posVersion: number;
}

interface Group {
  mesh: THREE.BatchedMesh;
  mat: THREE.Material;
  /** source geometry uuid → geometry id in the BatchedMesh */
  geos: Map<string, number>;
  instances: number;
  verts: number;
  indices: number;
  maxInstances: number;
  maxVerts: number;
  maxIndices: number;
}

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();

export class MovingInk {
  private scene: THREE.Scene | null = null;
  private root: THREE.Object3D | null = null;
  private groups = new Map<THREE.Material, Group>();
  private slots = new Map<THREE.Mesh, Slot>();
  private list: Slot[] = [];
  private tick = 0;
  private revealed = false;
  stats = { hulls: 0, shown: 0, draws: 0 };

  /** `undrawn` makes the Layers object that hides a mesh from the drawing cameras (StaticBatch owns that class). */
  constructor(private undrawn: () => THREE.Layers) {}

  attach(scene: THREE.Scene, root: THREE.Object3D): void {
    this.clear();
    this.scene = scene;
    this.root = root;
    this.tick = 0;
  }

  clear(): void {
    for (const s of this.list) (s.hull as { layers: THREE.Layers }).layers = s.layers;
    for (const g of this.groups.values()) {
      g.mesh.removeFromParent();
      g.mesh.dispose();
    }
    this.groups.clear();
    this.slots.clear();
    this.list = [];
    this.scene = null;
    this.root = null;
    this.stats = { hulls: 0, shown: 0, draws: 0 };
  }

  /** Shader precompile: let the compiler see the hulls themselves (StaticBatch.reveal calls this). */
  reveal(on: boolean): void {
    this.revealed = on;
    for (const s of this.list) (s.hull as { layers: THREE.Layers }).layers = on || !s.shown ? s.layers : s.hidden;
  }

  /** Once per frame, after the scene's world matrices are current and before anything is drawn. */
  sync(): void {
    const root = this.root;
    if (!root || this.revealed) return;
    if (this.tick++ % RESCAN === 0) this.scan(root);
    const list = this.list;
    if (!list.length) return;
    const e = root.matrixWorld.elements;
    const identity = e[0] === 1 && e[5] === 1 && e[10] === 1 && e[12] === 0 && e[13] === 0 && e[14] === 0 && e[1] === 0 && e[2] === 0 && e[4] === 0 && e[6] === 0 && e[8] === 0 && e[9] === 0;
    if (!identity) _inv.copy(root.matrixWorld).invert();
    let shown = 0;
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const h = s.hull;
      if (!h.parent) {
        // its creature is gone: give the slot back
        this.drop(s);
        list[i--] = list[list.length - 1];
        list.pop();
        continue;
      }
      const ok = this.drawsTheSame(s);
      if (ok) {
        s.group.mesh.setMatrixAt(s.id, identity ? h.matrixWorld : _m.multiplyMatrices(_inv, h.matrixWorld));
        shown++;
      }
      if (ok !== s.shown) {
        s.shown = ok;
        s.group.mesh.setVisibleAt(s.id, ok);
        (h as { layers: THREE.Layers }).layers = ok ? s.hidden : s.layers;
      }
    }
    this.stats.hulls = list.length;
    this.stats.shown = shown;
    this.stats.draws = this.groups.size;
  }

  private drawsTheSame(s: Slot): boolean {
    const h = s.hull;
    if (h.material !== s.group.mat || h.geometry !== s.geo || (h.geometry.attributes.position as THREE.BufferAttribute).version !== s.posVersion) return false;
    for (let p: THREE.Object3D | null = h; p !== this.scene; p = p.parent) if (!p || !p.visible) return false;
    // a mirrored part draws with its winding flipped; a slot cannot
    return h.matrixWorld.determinant() > 0;
  }

  // ───────────── adoption ─────────────

  private scan(root: THREE.Object3D): void {
    const walk = (o: THREE.Object3D, creature: boolean): void => {
      if (o.userData.noBatch) return;
      const inside = creature || (o.userData.paintDynamic === true && o.userData.noFade === true);
      if (inside && (o as THREE.Mesh).isMesh && !this.slots.has(o as THREE.Mesh)) this.adopt(o as THREE.Mesh);
      for (const c of o.children) walk(c, inside);
    };
    walk(root, false);
  }

  private adopt(h: THREE.Mesh): void {
    // ink hulls only: back-face shells of one shared, unpatched basic material (Materials.addOutline). The sculpt
    // shells (userData.shell) push their vertices in the shader and stay as they are.
    if (!h.userData.isOutline || h.userData.shell || h.userData.wdBatch) return;
    const mat = h.material as THREE.MeshBasicMaterial;
    if (Array.isArray(mat) || !mat.isMeshBasicMaterial || mat.transparent || !mat.visible) return;
    if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    if ((h as THREE.SkinnedMesh).isSkinnedMesh || h.morphTargetInfluences?.length || h.layers.mask !== 1) return;
    const src = h.geometry;
    const pos = src.attributes.position as THREE.BufferAttribute | undefined;
    if (!pos || (pos as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return;
    if (src.drawRange.start !== 0 || src.drawRange.count !== Infinity) return;
    const nIdx = src.index ? src.index.count : pos.count;
    const group = this.group(mat);
    let gid = group.geos.get(src.uuid);
    if (gid === undefined) {
      this.fit(group, 0, pos.count, nIdx);
      // position and index are all the ink material reads
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', pos);
      if (src.index) g.setIndex(src.index);
      else {
        const seq = pos.count > 65535 ? new Uint32Array(pos.count) : new Uint16Array(pos.count);
        for (let i = 0; i < seq.length; i++) seq[i] = i;
        g.setIndex(new THREE.BufferAttribute(seq, 1));
      }
      gid = group.mesh.addGeometry(g);
      group.geos.set(src.uuid, gid);
      group.verts += pos.count;
      group.indices += nIdx;
    }
    this.fit(group, 1, 0, 0);
    const id = group.mesh.addInstance(gid);
    group.instances++;
    group.mesh.setVisibleAt(id, false);
    const slot: Slot = { hull: h, group, id, shown: false, layers: h.layers, hidden: this.undrawn(), geo: src, posVersion: pos.version };
    this.slots.set(h, slot);
    this.list.push(slot);
  }

  private drop(s: Slot): void {
    (s.hull as { layers: THREE.Layers }).layers = s.layers;
    s.group.mesh.deleteInstance(s.id);
    s.group.instances--;
    this.slots.delete(s.hull);
  }

  private group(mat: THREE.Material): Group {
    let g = this.groups.get(mat);
    if (g) return g;
    const maxInstances = 256;
    const maxVerts = 32768;
    const maxIndices = 65536;
    // the hull's own material: opaque draws go in material order, and ink must keep its place in it
    const mesh = new THREE.BatchedMesh(maxInstances, maxVerts, maxIndices, mat);
    mesh.name = 'moving-ink';
    mesh.frustumCulled = false; // each slot is culled on its own
    mesh.perObjectFrustumCulled = true;
    mesh.sortObjects = false;
    mesh.castShadow = mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.userData.wdBatch = true;
    mesh.userData.isOutline = true;
    mesh.userData.noPaint = true;
    mesh.userData.noFade = true;
    mesh.raycast = () => {};
    this.root!.add(mesh);
    mesh.updateMatrixWorld(true);
    g = { mesh, mat, geos: new Map(), instances: 0, verts: 0, indices: 0, maxInstances, maxVerts, maxIndices };
    this.groups.set(mat, g);
    return g;
  }

  /** Grow a group's buffers before they overflow (doubling: a level spawns creatures in waves). */
  private fit(g: Group, instances: number, verts: number, indices: number): void {
    if (g.instances + instances > g.maxInstances) {
      g.maxInstances *= 2;
      g.mesh.setInstanceCount(g.maxInstances);
    }
    if (g.verts + verts > g.maxVerts || g.indices + indices > g.maxIndices) {
      while (g.verts + verts > g.maxVerts) g.maxVerts *= 2;
      while (g.indices + indices > g.maxIndices) g.maxIndices *= 2;
      g.mesh.setGeometrySize(g.maxVerts, g.maxIndices);
    }
  }
}
