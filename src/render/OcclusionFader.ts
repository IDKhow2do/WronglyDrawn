/**
 * [INPUT]: depends on three (meshes, raycaster, boxes, material clones)
 * [OUTPUT]: exports OcclusionFader (update(), wallDistance(), clear())
 * [POS]: the gameplay camera's see-through helper, owned by main.ts (one per session). Two kinds of fade share one
 *        fade/restore path: props between the camera and WAI, and big creatures' drawn bodies the camera is in or
 *        right behind (bodies, passed by main.ts each frame). Merged rock batches cannot fade: wallDistance() (a fat
 *        ray, so the camera also keeps off a rock's flank and its ink hull) makes them walls for
 *        CameraController.softLimit instead.
 * [PROTOCOL]: Update this header on change, then check docs/regression/CAMERA.md
 */
import * as THREE from 'three';

interface Fade {
  orig: THREE.Material | THREE.Material[];
  mat: THREE.Material | THREE.Material[];
  outlines: THREE.Object3D[];
  k: number;
  hit: boolean;
}

const MIN_R = 0.25;
const MAX_R = 6.5;
const FADED = 0.26;
/** A creature's body box grows by this much (m) for the "camera in the body" test. */
const BODY_PAD = 0.35;
/** A body that hides WAI fades when it starts within this distance (m) of the camera. */
const BODY_NEAR = 2.5;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Props between the gameplay camera and WAI fade to a ghost so you never lose
 * sight of yourself behind a boulder, crate, lamp or tree. Big architecture
 * (walls, buildings with merged ink, the ground) is left alone — the camera's
 * collision handles that. Faded meshes get a private transparent copy of their
 * material (shared materials elsewhere stay untouched); their ink hull hides.
 */
export class OcclusionFader {
  private cands: THREE.Mesh[] = [];
  private rebuildT = 0;
  private faded = new Map<THREE.Mesh, Fade>();
  private ray = new THREE.Raycaster();
  private frame = 0;
  private sphere = new THREE.Sphere();
  private hits: THREE.Intersection[] = [];

  constructor(private root: THREE.Object3D) {}

  private eligible(m: THREE.Mesh): boolean {
    if (!m.visible || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh) return false;
    if (m.userData.isOutline || m.userData.inkMerged || m.userData.noFade) return false;
    // ground pieces and merged dressing batches (many rocks in one mesh) never fade
    if (/^(terrain|dress-)/.test(m.name)) return false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((x) => !x || x.transparent || x.side === THREE.BackSide || (x as THREE.ShaderMaterial).isShaderMaterial)) return false;
    // nothing under a no-fade subtree (WAI, creatures, effects)
    for (let p = m.parent; p; p = p.parent) if (p.userData.noFade) return false;
    const g = m.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (!g.boundingSphere) return false;
    this.sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
    return this.sphere.radius >= MIN_R && this.sphere.radius <= MAX_R;
  }

  private rebuild(): void {
    this.cands = [];
    this.walls = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (this.eligible(m)) this.cands.push(m);
      else if (/^dress-(rock|rockP|bush)/.test(m.name) && m.visible) this.walls.push(m);
    });
  }

  /** Merged rock / bush batches can't fade: the camera treats them as walls instead. */
  private walls: THREE.Mesh[] = [];

  /**
   * Free distance from `from` along `dir` before a merged rock/bush batch (≤ max). `radius` > 0 sweeps a fat ray
   * (the centre line + four lines `radius` off it): a camera beside a rock's flank, missed by the thin centre line,
   * sat inside the rock's black ink hull and the whole screen went black.
   */
  wallDistance(from: THREE.Vector3, dir: THREE.Vector3, max: number, radius = 0): number {
    let best = max;
    const tmp = new THREE.Vector3();
    const side = new THREE.Vector3().crossVectors(dir, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const up = new THREE.Vector3().crossVectors(side, dir).normalize();
    const offs = radius > 0 ? [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] : [[0, 0]];
    const o = new THREE.Vector3();
    for (const m of this.walls) {
      const g = m.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      if (!g.boundingSphere) continue;
      this.sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      const R = this.sphere.radius + radius;
      const t = tmp.copy(this.sphere.center).sub(from).dot(dir);
      if (t < -R || t > best + R) continue;
      const closest = tmp.copy(from).addScaledVector(dir, THREE.MathUtils.clamp(t, 0, best));
      if (closest.distanceToSquared(this.sphere.center) > R * R) continue;
      for (const [a, b] of offs) {
        this.ray.set(o.copy(from).addScaledVector(side, a * radius).addScaledVector(up, b * radius), dir);
        this.ray.far = best;
        this.hits.length = 0;
        m.raycast(this.ray, this.hits);
        for (const h of this.hits) if (h.distance < best) best = h.distance;
      }
    }
    return best;
  }

  /**
   * Call once per frame (gameplay camera only). `targets` = WAI's head / chest. `bodies` = roots of big creatures near
   * the camera: they fade when the camera is in them or right behind them with WAI hidden (CameraController keeps
   * the camera out of their drawn bodies softly, but a charge through WAI or a body hugging him leaves no room).
   */
  update(camPos: THREE.Vector3, targets: THREE.Vector3[], dt: number, active: boolean, bodies: THREE.Object3D[] = []): void {
    this.rebuildT -= dt;
    if (this.rebuildT <= 0) {
      this.rebuildT = 3;
      this.rebuild();
    }
    // detect every other frame
    if (active && (this.frame++ & 1) === 0) {
      for (const f of this.faded.values()) f.hit = false;
      for (const tgt of targets) this.probe(camPos, tgt);
      for (const b of bodies) this.probeBody(camPos, targets[0], b);
    } else if (!active) for (const f of this.faded.values()) f.hit = false;
    // animate
    for (const [m, f] of this.faded) {
      f.k = THREE.MathUtils.clamp(f.k + (f.hit ? dt * 9 : -dt * 4), 0, 1);
      const op = 1 - (1 - FADED) * f.k;
      for (const x of Array.isArray(f.mat) ? f.mat : [f.mat]) x.opacity = op;
      for (const o of f.outlines) o.visible = f.k < 0.35;
      if (f.k <= 0 && !f.hit) this.restore(m, f);
    }
  }

  private probe(from: THREE.Vector3, to: THREE.Vector3): void {
    const dir = to.clone().sub(from);
    const len = dir.length();
    if (len < 0.5) return;
    dir.divideScalar(len);
    const tmp = new THREE.Vector3();
    for (const m of this.cands) {
      if (!m.parent || !m.visible) continue;
      const g = m.geometry;
      if (!g.boundingSphere) continue;
      this.sphere.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
      // cheap reject: the sphere must cross the camera → WAI segment (not at WAI's own feet)
      const t = tmp.copy(this.sphere.center).sub(from).dot(dir);
      if (t < -this.sphere.radius || t > len - 0.35 + this.sphere.radius) continue;
      const closest = tmp.copy(from).addScaledVector(dir, THREE.MathUtils.clamp(t, 0, len));
      if (closest.distanceToSquared(this.sphere.center) > this.sphere.radius * this.sphere.radius) continue;
      // precise test against the triangles
      this.ray.set(from, dir);
      this.ray.far = len - 0.35;
      this.hits.length = 0;
      m.raycast(this.ray, this.hits);
      if (!this.hits.length) continue;
      let f = this.faded.get(m);
      if (!f) f = this.fade(m);
      f.hit = true;
    }
  }

  private box = new THREE.Box3();
  private meshBox = new THREE.Box3();
  private bodyMeshes: THREE.Mesh[] = [];

  /**
   * A creature's drawn body (its opaque meshes' world box, grown by BODY_PAD): faded when the camera is inside it,
   * when the line to WAI's head enters it within BODY_NEAR m of the camera, or when WAI is pressed into it and hidden.
   */
  private probeBody(cam: THREE.Vector3, head: THREE.Vector3, root: THREE.Object3D): void {
    const box = this.box.makeEmpty();
    const meshes = this.bodyMeshes;
    meshes.length = 0;
    root.traverseVisible((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isOutline) return;
      // its own glows, tells and decals (already see-through) stay as they are; meshes this fader faded count
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (!this.faded.has(m) && mats.some((x) => !x || x.transparent || (x as THREE.ShaderMaterial).isShaderMaterial)) return;
      const g = m.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      if (!g.boundingBox) return;
      box.union(this.meshBox.copy(g.boundingBox).applyMatrix4(m.matrixWorld));
      meshes.push(m);
    });
    if (box.isEmpty()) return;
    box.expandByScalar(BODY_PAD);
    let near = box.containsPoint(cam);
    if (!near) {
      const to = head.clone().sub(cam);
      const len = to.length();
      this.ray.set(cam, to.divideScalar(len));
      const at = this.ray.ray.intersectBox(box, new THREE.Vector3());
      near = !!at && at.distanceTo(cam) < Math.min(BODY_NEAR, len);
      // WAI pressed into the body (a charge pins him to a wall): the body hides him from any distance
      if (!near && box.containsPoint(head)) {
        this.ray.far = len - 0.2;
        this.hits.length = 0;
        this.ray.intersectObjects(meshes, false, this.hits);
        near = this.hits.length > 0;
      }
    }
    if (!near) return;
    for (const m of meshes) (this.faded.get(m) ?? this.fade(m)).hit = true;
  }

  private fade(m: THREE.Mesh): Fade {
    const clone = (x: THREE.Material) => {
      const c = x.clone();
      c.onBeforeCompile = x.onBeforeCompile;
      c.customProgramCacheKey = x.customProgramCacheKey;
      c.transparent = true;
      return c;
    };
    const orig = m.material;
    const mat = Array.isArray(orig) ? orig.map(clone) : clone(orig);
    m.material = mat;
    const outlines = m.children.filter((c) => c.userData.isOutline && c.visible);
    const f: Fade = { orig, mat, outlines, k: 0, hit: false };
    this.faded.set(m, f);
    return f;
  }

  private restore(m: THREE.Mesh, f: Fade): void {
    m.material = f.orig;
    for (const x of Array.isArray(f.mat) ? f.mat : [f.mat]) x.dispose();
    for (const o of f.outlines) o.visible = true;
    this.faded.delete(m);
  }

  /** Put everything back (session end / cutscene). */
  clear(): void {
    for (const [m, f] of this.faded) this.restore(m, f);
    this.cands = [];
    this.rebuildT = 0;
  }
}
