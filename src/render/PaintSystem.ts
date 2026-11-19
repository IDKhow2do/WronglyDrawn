/**
 * [INPUT]: 可喷涂的场景网格、命中位置和画质等级。
 * [OUTPUT]: 为网格绘制并回收喷漆纹理，供原材质采样。
 * [POS]: Effects 调用此模块。iOS 限制常驻喷漆纹理预算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { IOS_APP, Quality } from './Quality';

/**
 * REAL PAINT. Every paintable mesh gets its own paint texture, drawn in the
 * mesh's UV space ("texture-space splatting", the Splatoon approach):
 *
 *  - the mesh is rasterised into its paint texture by UV, and each texel knows
 *    its world position + normal, so a splat is evaluated ON THE SURFACE in 3D:
 *    it wraps around legs, bends over edges, smears on glancing hits, leaves
 *    satellite droplets and runs down walls as drips (gravity is world-space);
 *  - surfaces facing away from the spray stay clean (paint "shadows");
 *  - the mesh's own material samples the texture: paint colour, wet gloss and a
 *    raised rim (relief) where the paint edge is.
 *
 * Meshes without a unique UV layout (boxes, cylinders…) get a generated
 * box-projected atlas so faces never share texels.
 */

const MAX_BATCH = 16;
const DILATE: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]];
/** Paint targets are pooled (shared by every session): allocated while loading, recycled on eviction/restart — allocating mid-game stalls the driver. */
const POOL = new Map<number, THREE.WebGLRenderTarget[]>();
const BUDGET_BYTES = (IOS_APP ? 24 : 280) * 1024 * 1024;

function recycleTarget(target: THREE.WebGLRenderTarget): void {
  const list = POOL.get(target.width) ?? [];
  if (IOS_APP && list.length >= 2) {
    target.dispose();
    return;
  }
  list.push(target);
  POOL.set(target.width, list);
}

export interface SplatOpts {
  /** 0 = none … 1 = long drips on steep surfaces. */
  drip?: number;
  /** Erase instead of paint (eraser grubs). */
  erase?: boolean;
}

interface Pending {
  pos: THREE.Vector4; // xyz, radius
  dir: THREE.Vector4; // xyz travel direction, seed
  col: THREE.Vector4; // rgb (linear), drip
}

interface Surface {
  mesh: THREE.Mesh;
  geo: THREE.BufferGeometry;
  rt: THREE.WebGLRenderTarget | null;
  size: number;
  tex: { value: THREE.Texture };
  pending: Pending[];
  erases: Pending[];
  lastUsed: number;
}

const blankTex = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
  t.needsUpdate = true;
  return t;
})();

const NOISE = /* glsl */ `
float h1(float n){ return fract(sin(n)*43758.5453123); }
float h3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z);
}`;

function makeSplatMaterial(): THREE.ShaderMaterial {
  const arr = () => Array.from({ length: MAX_BATCH }, () => new THREE.Vector4());
  return new THREE.ShaderMaterial({
    uniforms: {
      uModel: { value: new THREE.Matrix4() },
      uOffset: { value: new THREE.Vector2() },
      uCount: { value: 0 },
      uErase: { value: 0 },
      uPos: { value: arr() },
      uDir: { value: arr() },
      uCol: { value: arr() },
    },
    vertexShader: /* glsl */ `
      attribute vec2 paintUv;
      uniform mat4 uModel;
      uniform vec2 uOffset;
      varying vec3 vW;
      varying vec3 vN;
      void main() {
        vec4 w = uModel * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(uModel) * normal);
        gl_Position = vec4(paintUv * 2.0 - 1.0 + uOffset, 0.0, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      #define MAXB ${MAX_BATCH}
      uniform int uCount;
      uniform float uErase;
      uniform vec4 uPos[MAXB];
      uniform vec4 uDir[MAXB];
      uniform vec4 uCol[MAXB];
      varying vec3 vW;
      varying vec3 vN;
      ${NOISE}
      void main() {
        // (never flip by gl_FrontFacing: in UV space winding follows the UV layout, not the surface)
        vec3 n = normalize(vN);
        vec3 acc = vec3(0.0);
        float accA = 0.0;
        for (int i = 0; i < MAXB; i++) {
          if (i >= uCount) break;
          vec3 c = uPos[i].xyz; float r = uPos[i].w;
          vec3 d = uDir[i].xyz; float seed = uDir[i].w;
          float drip = uCol[i].w;
          vec3 v = vW - c;
          float facing = dot(n, -d);
          if (uErase > 0.5) facing = 1.0;
          if (facing < 0.05) continue;                 // back sides stay clean
          float depth = abs(dot(v, n));
          if (depth > r * 1.2) continue;                // thin walls: far side untouched
          vec3 vp = v - n * dot(v, n);                  // on-surface offset
          vec3 td = d - n * dot(d, n);
          float tl = length(td);
          float stretch = 1.0 + (1.0 - clamp(facing, 0.0, 1.0)) * 2.2; // glancing → long smear
          float dist;
          if (tl > 1e-3 && uErase < 0.5) {
            td /= tl;
            float a = dot(vp, td) - r * 0.25 * (stretch - 1.0);
            vec3 rest = vp - td * dot(vp, td);
            dist = length(vec2(a / stretch, length(rest)));
          } else dist = length(vp);
          float nz = vnoise(vW * (5.0 / max(r, 0.05)) + seed * 17.0) * 0.6 + vnoise(vW * (14.0 / max(r, 0.05)) + seed * 5.0) * 0.4;
          float edge = r * (0.72 + nz * 0.5);
          float m = 1.0 - smoothstep(edge * 0.9, edge, dist);
          if (uErase < 0.5) {
            // satellite droplets flung around the impact
            float ring = step(edge, dist) * (1.0 - smoothstep(r * 1.5, r * 2.1, dist));
            float sat = smoothstep(0.80, 0.86, vnoise(vW * (22.0 / max(r, 0.05)) + seed * 31.0)) * ring;
            m = max(m, sat);
            // drips: run straight down steep surfaces, under the splat
            float steep = 1.0 - abs(n.y);
            if (drip > 0.0 && steep > 0.35 && v.y < 0.0) {
              vec3 side = normalize(cross(n, vec3(0.0, 1.0, 0.0)));
              float u = dot(v, side);
              float laneW = r * 0.26;
              float lane = floor(u / laneW + seed * 7.0);
              float h = h1(lane * 12.9898 + seed * 78.233);
              float len = r * (0.5 + h * 3.2) * drip * steep;
              float cu = (fract(u / laneW + seed * 7.0) - 0.5) * laneW;
              float t = -v.y / max(len, 1e-3);
              float w = r * 0.085 * (0.6 + h) * (1.0 - t * 0.45);
              float bulb = length(vec2(cu, (-v.y - len) * 0.8)) < w * 1.5 ? 1.0 : 0.0;
              if (h > 0.45 && abs(u) < r * 0.8 && t < 1.0 && abs(cu) < w) m = 1.0;
              if (h > 0.45 && abs(u) < r * 0.8) m = max(m, bulb);
            }
          }
          m *= smoothstep(0.05, 0.2, facing) * (1.0 - smoothstep(r * 0.7, r * 1.2, depth));
          acc = acc * (1.0 - m) + uCol[i].rgb * m;
          accA = accA * (1.0 - m) + m;
        }
        if (accA < 0.002) discard;
        gl_FragColor = uErase > 0.5 ? vec4(0.0, 0.0, 0.0, accA) : vec4(acc, accA);
      }`,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
}

/** Box-projected unique UV atlas for primitive geometry (one cell per face direction). */
function boxProjectUv(src: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src.clone();
  const pos = g.attributes.position as THREE.BufferAttribute;
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = bb.getSize(new THREE.Vector3()).max(new THREE.Vector3(1e-4, 1e-4, 1e-4));
  const tri = pos.count / 3;
  const cls = new Int8Array(tri);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  const present = new Set<number>();
  for (let t = 0; t < tri; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    nrm.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    const ax = Math.abs(nrm.x), ay = Math.abs(nrm.y), az = Math.abs(nrm.z);
    const k = ax >= ay && ax >= az ? (nrm.x > 0 ? 0 : 1) : ay >= az ? (nrm.y > 0 ? 2 : 3) : nrm.z > 0 ? 4 : 5;
    cls[t] = k;
    present.add(k);
  }
  const list = [...present].sort();
  const cols = Math.ceil(Math.sqrt(list.length));
  const rows = Math.ceil(list.length / cols);
  const cell = new Map<number, [number, number]>();
  list.forEach((k, i) => cell.set(k, [i % cols, Math.floor(i / cols)]));
  const uv = new Float32Array(pos.count * 2);
  const margin = 0.03;
  for (let t = 0; t < tri; t++) {
    const k = cls[t];
    const [cx, cy] = cell.get(k)!;
    for (let j = 0; j < 3; j++) {
      const i = t * 3 + j;
      const x = (pos.getX(i) - bb.min.x) / size.x;
      const y = (pos.getY(i) - bb.min.y) / size.y;
      const z = (pos.getZ(i) - bb.min.z) / size.z;
      const [u, v] = k < 2 ? [z, y] : k < 4 ? [x, z] : [x, y];
      uv[i * 2] = (cx + margin + u * (1 - 2 * margin)) / cols;
      uv[i * 2 + 1] = (cy + margin + v * (1 - 2 * margin)) / rows;
    }
  }
  g.setAttribute('paintUv', new THREE.BufferAttribute(uv, 2));
  g.userData.paintCells = Math.max(cols, rows);
  return g;
}

function injectPaint(mat: THREE.MeshStandardMaterial, tex: { value: THREE.Texture }): void {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.call(mat, sh, r);
    sh.uniforms.uPaintTex = tex;
    sh.vertexShader = 'attribute vec2 paintUv;\nvarying vec2 vPaintUv;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vPaintUv = paintUv;');
    sh.fragmentShader =
      'uniform sampler2D uPaintTex;\nvarying vec2 vPaintUv;\n' +
      sh.fragmentShader
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
  vec4 pT = texture2D(uPaintTex, vPaintUv);
  float pA = smoothstep(0.22, 0.62, pT.a);
  vec3 pC = pT.rgb / max(pT.a, 0.0001);
  diffuseColor.rgb = mix(diffuseColor.rgb, pC, pA);`,
        )
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.3, pA);')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
  {
    // thick paint: a raised rim where the paint edge is (bump from the coverage gradient)
    vec2 dH = vec2(dFdx(pA), dFdy(pA)) * 0.012;
    vec3 sx = dFdx(-vViewPosition); vec3 sy = dFdy(-vViewPosition);
    vec3 r1 = cross(sy, normal); vec3 r2 = cross(normal, sx);
    float det = dot(sx, r1) * faceDirection;
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    normal = normalize(abs(det) * normal - grad);
  }`,
        )
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += pC * pA * 0.06;');
  };
  const key = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => key() + '|wdpaint';
  mat.needsUpdate = true;
}

const CHUNK = 5; // metres per paint chunk on big meshes
const MAX_EDGE = 2.4; // big triangles are subdivided so chunks can be split out by whole triangles
const BIG = 16; // meshes larger than this (world) are painted in chunks (terrain is pre-tiled)

/** Per big mesh: subdivided triangles bucketed into ~5 m chunks; chunks are split out on first paint. */
interface BigMesh {
  mesh: THREE.Mesh;
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array | null;
  key: Int32Array; // chunk id per triangle
  mat: Int16Array; // material index per triangle
  boxes: Map<number, THREE.Box3>; // local-space bounds per chunk
  cls: Map<number, number>; // projection class per chunk
  split: Map<number, THREE.Mesh>;
  /** Bounds of the ORIGINAL geometry (the parent's geometry shrinks as chunks split out). */
  sphere: THREE.Sphere;
}

function subdivide(g: THREE.BufferGeometry, scale: THREE.Vector3): { pos: number[]; nrm: number[]; uv: number[] | null; mat: number[] } {
  const src = g.index ? g.toNonIndexed() : g;
  const P = src.attributes.position as THREE.BufferAttribute;
  const N = src.attributes.normal as THREE.BufferAttribute;
  const U = src.attributes.uv as THREE.BufferAttribute | undefined;
  const pos: number[] = [], nrm: number[] = [], uv: number[] | null = U ? [] : null, mat: number[] = [];
  let curMat = 0;
  type V = { p: THREE.Vector3; n: THREE.Vector3; u: THREE.Vector2 };
  const len = (a: V, b: V) => Math.hypot((a.p.x - b.p.x) * scale.x, (a.p.y - b.p.y) * scale.y, (a.p.z - b.p.z) * scale.z);
  const mid = (a: V, b: V): V => ({ p: a.p.clone().add(b.p).multiplyScalar(0.5), n: a.n.clone().add(b.n).normalize(), u: a.u.clone().add(b.u).multiplyScalar(0.5) });
  const emit = (a: V, b: V, c: V, depth: number) => {
    const ab = len(a, b), bc = len(b, c), ca = len(c, a);
    if (depth < 8 && Math.max(ab, bc, ca) > MAX_EDGE) {
      // split the longest edge (keeps triangles well shaped)
      if (ab >= bc && ab >= ca) { const m = mid(a, b); emit(a, m, c, depth + 1); emit(m, b, c, depth + 1); }
      else if (bc >= ca) { const m = mid(b, c); emit(a, b, m, depth + 1); emit(a, m, c, depth + 1); }
      else { const m = mid(c, a); emit(a, b, m, depth + 1); emit(m, b, c, depth + 1); }
      return;
    }
    mat.push(curMat);
    for (const v of [a, b, c]) {
      pos.push(v.p.x, v.p.y, v.p.z);
      nrm.push(v.n.x, v.n.y, v.n.z);
      uv?.push(v.u.x, v.u.y);
    }
  };
  const vtx = (i: number): V => ({
    p: new THREE.Vector3().fromBufferAttribute(P, i),
    n: new THREE.Vector3().fromBufferAttribute(N, i),
    u: U ? new THREE.Vector2().fromBufferAttribute(U, i) : new THREE.Vector2(),
  });
  const groups = src.groups;
  for (let i = 0; i < P.count; i += 3) {
    curMat = 0;
    for (const gr of groups) if (i >= gr.start && i < gr.start + gr.count) curMat = gr.materialIndex ?? 0;
    emit(vtx(i), vtx(i + 1), vtx(i + 2), 0);
  }
  return { pos, nrm, uv, mat };
}

function projAxes(k: number): [number, number] {
  return k < 2 ? [2, 1] : k < 4 ? [0, 2] : [0, 1];
}

export class PaintSystem {
  /** Set once by the app (the paint pass needs the WebGL renderer). */
  static renderer: THREE.WebGLRenderer | null = null;

  private surfaces = new Map<THREE.Mesh, Surface>();
  private bigs = new Map<THREE.Mesh, BigMesh | null>();
  private candidates: THREE.Mesh[] = [];
  private refreshT = 0;
  private uvCache = new Map<string, THREE.BufferGeometry>();
  private mat = makeSplatMaterial();
  private proxy: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bytes = 0;
  private clock = 0;
  private sphere = new THREE.Sphere();
  private ray = new THREE.Raycaster();
  private tmpCol = new THREE.Color();

  /** new allocations allowed this frame (spreads the rare ones that the pool doesn't cover) */
  private allocBudget = 1;

  private static makeRT(size: number): THREE.WebGLRenderTarget {
    const rt = new THREE.WebGLRenderTarget(size, size, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    rt.texture.anisotropy = 4;
    return rt;
  }

  private clearRT(rt: THREE.WebGLRenderTarget): void {
    const r = PaintSystem.renderer!;
    const prev = r.getRenderTarget();
    const cc = r.getClearColor(new THREE.Color());
    const ca = r.getClearAlpha();
    r.setRenderTarget(rt);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.setClearColor(cc, ca);
    r.setRenderTarget(prev);
  }

  /** Allocate the paint-target pool now (during loading), sized per graphics tier. */
  fillPool(): void {
    if (!PaintSystem.renderer) return;
    const big = Quality.s.paintMax >= 1024;
    const plan: [number, number][] = big ? [[1024, 10], [512, 18], [256, 16], [128, 10]] : [[512, 14], [256, 18], [128, 12]];
    for (const [size, n] of plan) {
      const list = POOL.get(size) ?? [];
      while (list.length < n) {
        const rt = PaintSystem.makeRT(size);
        this.clearRT(rt); // forces the GPU allocation now
        list.push(rt);
      }
      POOL.set(size, list);
    }
  }

  constructor(private root: THREE.Object3D) {
    this.proxy = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.proxy.frustumCulled = false;
    this.proxy.matrixAutoUpdate = false;
    this.scene.add(this.proxy);
  }

  // ───────────── who can be painted ─────────────

  private eligible(o: THREE.Object3D): o is THREE.Mesh {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
    if (m.userData.isOutline || m.userData.noPaint || m.userData.paintChunk) return false;
    const ok = (x: THREE.Material) => !!x && (x as THREE.MeshStandardMaterial).isMeshStandardMaterial && !x.transparent && !(x.alphaTest > 0);
    const mat = m.material;
    if (Array.isArray(mat) ? !mat.length || !mat.every(ok) : !ok(mat)) return false;
    if (!m.geometry.attributes.position || !m.geometry.attributes.normal) return false;
    return true;
  }

  /** Cached world bounds of static meshes (moving things — enemies, hosts — are recomputed). */
  private sphereCache = new Map<THREE.Mesh, THREE.Sphere>();
  private dynamic = new Set<THREE.Mesh>();

  private refresh(): void {
    const list: THREE.Mesh[] = [];
    const walk = (o: THREE.Object3D, dyn: boolean) => {
      if (o.userData.noPaint) return;
      const d = dyn || !!o.userData.paintDynamic;
      if (this.eligible(o)) {
        list.push(o);
        if (d) this.dynamic.add(o);
      }
      for (const c of o.children) walk(c, d);
    };
    walk(this.root, false);
    this.candidates = list;
    this.sphereCache.clear();
  }

  private visible(o: THREE.Object3D | null): boolean {
    for (; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  private worldSphere(m: THREE.Mesh): THREE.Sphere {
    if (!this.dynamic.has(m)) {
      const c = this.sphereCache.get(m);
      if (c) return this.sphere.copy(c);
    }
    const s = this.computeSphere(m);
    if (!this.dynamic.has(m)) this.sphereCache.set(m, s.clone());
    return s;
  }

  private computeSphere(m: THREE.Mesh): THREE.Sphere {
    const big = this.bigs.get(m);
    if (big) return this.sphere.copy(big.sphere).applyMatrix4(m.matrixWorld);
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    return this.sphere.copy(m.geometry.boundingSphere!).applyMatrix4(m.matrixWorld);
  }

  /**
   * Compile every paint shader variant at load (one tiny dummy per material
   * signature), so the first splat on a new surface never hitches mid-fight.
   */
  prewarm(scene: THREE.Scene): THREE.Object3D[] {
    this.refresh();
    const seen = new Set<string>();
    const dummies: THREE.Object3D[] = [];
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
    tri.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    tri.setAttribute('paintUv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    for (const m of this.candidates) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of mats as THREE.MeshStandardMaterial[]) {
        const sig = `${mat.type}|${!!mat.map}|${!!mat.normalMap}|${!!mat.roughnessMap}|${!!mat.emissiveMap}|${mat.side}|${(m as THREE.SkinnedMesh).isSkinnedMesh}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        const c = mat.clone();
        injectPaint(c, { value: blankTex });
        const d = new THREE.Mesh(tri, c);
        d.frustumCulled = false;
        d.castShadow = true; // the shadow-depth variant compiles at load too (first paint on a new surface hitched)
        scene.add(d);
        dummies.push(d);
      }
    }
    // the splat pass itself
    const splat = new THREE.Mesh(tri, this.mat);
    splat.frustumCulled = false;
    scene.add(splat);
    dummies.push(splat);
    return dummies;
  }

  /** Clone + inject materials up front (enemies: keeps their recolour logic pointing at the live material). */
  prepare(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (this.eligible(o)) this.surface(o);
    });
  }

  private paintGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
    const g = mesh.geometry;
    if (g.attributes.paintUv) return g;
    const cached = this.uvCache.get(g.uuid);
    if (cached) return cached;
    let out: THREE.BufferGeometry;
    const t = g.type;
    if (g.attributes.uv && (mesh.userData.uniqueUv || t === 'PlaneGeometry' || t === 'SphereGeometry')) {
      g.setAttribute('paintUv', g.attributes.uv);
      g.userData.paintCells = 1;
      out = g;
    } else out = boxProjectUv(g);
    this.uvCache.set(g.uuid, out);
    return out;
  }

  private surface(mesh: THREE.Mesh): Surface {
    let s = this.surfaces.get(mesh);
    if (s) return s;
    const geo = this.paintGeometry(mesh);
    if (geo !== mesh.geometry) mesh.geometry = geo;
    const tex = { value: blankTex as THREE.Texture };
    const inject = (x: THREE.Material) => {
      const c = (x as THREE.MeshStandardMaterial).clone();
      injectPaint(c, tex);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(inject) : inject(mesh.material);
    s = { mesh, geo, rt: null, size: 0, tex, pending: [], erases: [], lastUsed: 0 };
    this.surfaces.set(mesh, s);
    return s;
  }

  private ensureTarget(s: Surface): boolean {
    if (s.rt) return true;
    if (!s.geo.boundingBox) s.geo.computeBoundingBox();
    const ws = s.mesh.getWorldScale(new THREE.Vector3());
    const ext = s.geo.boundingBox!.getSize(new THREE.Vector3()).multiply(new THREE.Vector3(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)));
    const cells = (s.geo.userData.paintCells as number) ?? 1;
    const big = Math.max(ext.x, ext.y, ext.z);
    // ≈1–1.5 cm per texel; sculpted (atlas-UV) parts get a flat budget by size
    const q = Quality.s;
    const px = s.mesh.userData.uniqueUv ? (big > 1.2 ? 1024 : 512) : big * cells * q.paintDensity;
    let size = THREE.MathUtils.clamp(THREE.MathUtils.ceilPowerOfTwo(Math.max(1, px)), 128, q.paintMax);
    const need = size * size * 4 * 1.34;
    while (this.bytes + need > BUDGET_BYTES && this.evictOldest()) {
      /* free room */
    }
    let rt = POOL.get(size)?.pop();
    if (!rt) {
      // pool empty: fall back one size down rather than stall, else allocate (≤1 per frame)
      rt = POOL.get(size / 2)?.pop();
      if (rt) {
        this.bytes -= need - (size / 2) * (size / 2) * 4 * 1.34;
      } else {
        if (this.allocBudget <= 0) return false;
        this.allocBudget--;
        rt = PaintSystem.makeRT(size);
      }
    }
    this.clearRT(rt);
    s.rt = rt;
    size = rt.width;
    s.size = size;
    s.tex.value = rt.texture;
    this.bytes += need;
    return true;
  }

  private evictOldest(): boolean {
    let old: Surface | null = null;
    for (const s of this.surfaces.values()) if (s.rt && (!old || s.lastUsed < old.lastUsed)) old = s;
    if (!old || !old.rt) return false;
    this.bytes -= old.size * old.size * 4 * 1.34;
    recycleTarget(old.rt);
    old.rt = null;
    old.tex.value = blankTex;
    return true;
  }

  // ───────────── painting ─────────────

  /**
   * Find the real visual surface along a ray (colliders are simplified, the
   * meshes are not): returns the mesh hit nearest to `near` within `reach`.
   */
  surfaceHit(origin: THREE.Vector3, dir: THREE.Vector3, reach: number): { point: THREE.Vector3; normal: THREE.Vector3; mesh: THREE.Mesh } | null {
    this.ray.set(origin, dir);
    this.ray.far = reach;
    let best: THREE.Intersection | null = null;
    for (const m of this.candidates) {
      const sp = this.worldSphere(m);
      if (this.ray.ray.distanceSqToPoint(sp.center) > sp.radius * sp.radius) continue;
      if (!this.visible(m)) continue;
      const hits = this.ray.intersectObject(m, true).filter((h) => !h.object.userData.isOutline);
      if (hits.length && (!best || hits[0].distance < best.distance)) best = hits[0];
    }
    if (!best || !best.face) return null;
    const mesh = best.object as THREE.Mesh;
    const normal = best.face.normal.clone().transformDirection(mesh.matrixWorld);
    if (normal.dot(dir) > 0) normal.negate();
    return { point: best.point.clone(), normal, mesh };
  }

  /** Paint (or erase) a splat at a world point. `dir` = travel direction of the paint. */
  splat(point: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, opts: SplatOpts = {}): void {
    if (!PaintSystem.renderer) return;
    // tight reach: splat footprint (+ satellites) and drips running DOWN from the point
    const reach = radius * 1.6;
    const dripLen = radius * 3.8 * (opts.drip ?? 0);
    const col = this.tmpCol.set(color);
    const p: Pending = {
      pos: new THREE.Vector4(point.x, point.y, point.z, radius),
      dir: new THREE.Vector4(dir.x, dir.y, dir.z, Math.random() * 100),
      col: new THREE.Vector4(col.r, col.g, col.b, opts.drip ?? 0),
    };
    for (const m of this.candidates) {
      const sp = this.worldSphere(m);
      const d = sp.center.distanceTo(point);
      if (d > sp.radius + reach + dripLen) continue;
      if (!this.visible(m)) continue;
      const big = this.isBig(m);
      if (!big && !this.nearBox(m, m.geometry.boundingBox, point, reach, dripLen)) continue;
      const targets = big ? this.chunksNear(m, point, reach, dripLen, !opts.erase) : [m];
      for (const t of targets) {
        const s = this.surface(t);
        if (opts.erase) {
          if (s.rt) s.erases.push(p);
        } else s.pending.push(p);
      }
    }
  }

  private isBig(m: THREE.Mesh): boolean {
    let b = this.bigs.get(m);
    if (b === undefined) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const ws = m.getWorldScale(new THREE.Vector3());
      const ext = m.geometry.boundingBox!.getSize(new THREE.Vector3()).multiply(new THREE.Vector3(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z)));
      if (Math.max(ext.x, ext.y, ext.z) > BIG && !m.userData.uniqueUv) b = this.buildBig(m);
      else this.bigs.set(m, (b = null));
    }
    return !!b;
  }

  /** Subdivide + bucket a big mesh's triangles into chunks (nothing is split out yet). */
  private buildBig(m: THREE.Mesh): BigMesh {
    const ws = m.getWorldScale(new THREE.Vector3());
    const sc = new THREE.Vector3(Math.abs(ws.x), Math.abs(ws.y), Math.abs(ws.z));
    const d = subdivide(m.geometry, sc);
    const pos = new Float32Array(d.pos);
    const nrm = new Float32Array(d.nrm);
    const tri = pos.length / 9;
    const key = new Int32Array(tri);
    const boxes = new Map<number, THREE.Box3>();
    const cls = new Map<number, number>();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), ctr = new THREE.Vector3();
    // flush neighbours: overlapping coplanar walls would z-fight once subdivided.
    // The lower mesh id keeps the shared face; the other drops its buried triangles.
    const myBox = new THREE.Box3().setFromObject(m, false);
    const neigh: { box: THREE.Box3; mesh: THREE.Mesh }[] = [];
    for (const o of this.candidates) {
      if (o === m) continue;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const ob = o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld);
      if (ob.intersectsBox(myBox.clone().expandByScalar(0.05))) neigh.push({ box: ob, mesh: o });
    }
    const wc = new THREE.Vector3(), wn = new THREE.Vector3(), probe = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m.matrixWorld);
    const later: THREE.Mesh[] = [];
    for (let t = 0; t < tri; t++) {
      a.fromArray(pos, t * 9);
      b.fromArray(pos, t * 9 + 3);
      c.fromArray(pos, t * 9 + 6);
      n.subVectors(c, b).cross(a.clone().sub(b));
      n.multiply(new THREE.Vector3(1 / sc.x, 1 / sc.y, 1 / sc.z)).normalize();
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const k = ax >= ay && ax >= az ? (n.x > 0 ? 0 : 1) : ay >= az ? (n.y > 0 ? 2 : 3) : n.z > 0 ? 4 : 5;
      ctr.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if (neigh.length) {
        wc.copy(ctr).applyMatrix4(m.matrixWorld);
        wn.subVectors(c, b).cross(a.clone().sub(b)).applyMatrix3(nm).normalize();
        let buried = false;
        for (const nb of neigh) {
          const behind = nb.box.containsPoint(probe.copy(wc).addScaledVector(wn, -0.03));
          const front = nb.box.containsPoint(probe.copy(wc).addScaledVector(wn, 0.03));
          if (!behind || front) continue; // not a flush face of that box
          if (nb.mesh.id < m.id) buried = true;
          else if (!later.includes(nb.mesh)) later.push(nb.mesh);
        }
        if (buried) {
          key[t] = -1;
          continue;
        }
      }
      const [i, j] = projAxes(k);
      const ci = Math.floor((ctr.getComponent(i) * sc.getComponent(i)) / CHUNK);
      const cj = Math.floor((ctr.getComponent(j) * sc.getComponent(j)) / CHUNK);
      const id = d.mat[t] * 10_000_000 + k * 1_000_000 + (ci + 500) * 1000 + (cj + 500);
      key[t] = id;
      cls.set(id, k);
      let bx = boxes.get(id);
      if (!bx) boxes.set(id, (bx = new THREE.Box3()));
      bx.expandByPoint(a).expandByPoint(b).expandByPoint(c);
    }
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    const big: BigMesh = { mesh: m, pos, nrm, uv: d.uv ? new Float32Array(d.uv) : null, key, mat: new Int16Array(d.mat), boxes, cls, split: new Map(), sphere: m.geometry.boundingSphere!.clone() };
    this.bigs.set(m, big);
    // the subdivided remainder replaces the original right away (same look, buried faces gone)
    this.rebuildRemainder(big);
    // neighbours that must give up their side of a shared face get processed now too
    for (const o of later) if (!this.bigs.has(o)) this.isBig(o);
    return big;
  }

  /** Chunks of a big mesh touched by a splat; splits them out of the mesh on first paint. */
  private wbox = new THREE.Box3();
  /** Is `point` within reach of the mesh-local box (in world space)? Drips extend the box upward. */
  private nearBox(m: THREE.Mesh, box: THREE.Box3 | null, point: THREE.Vector3, reach: number, dripLen: number): boolean {
    if (!box) {
      m.geometry.computeBoundingBox();
      box = m.geometry.boundingBox!;
    }
    const b = this.wbox.copy(box).applyMatrix4(m.matrixWorld);
    b.expandByScalar(reach);
    b.max.y += dripLen;
    return b.containsPoint(point);
  }

  private chunksNear(m: THREE.Mesh, point: THREE.Vector3, reach: number, dripLen: number, create: boolean): THREE.Mesh[] {
    const big = this.bigs.get(m)!;
    const out: THREE.Mesh[] = [];
    for (const [id, box] of big.boxes) {
      if (!this.nearBox(m, box, point, reach, dripLen)) continue;
      let cm = big.split.get(id);
      if (!cm) {
        if (!create) continue;
        cm = this.splitChunk(big, id);
      }
      out.push(cm);
    }
    return out;
  }

  private splitChunk(big: BigMesh, id: number): THREE.Mesh {
    const k = big.cls.get(id)!;
    const box = big.boxes.get(id)!;
    const [i, j] = projAxes(k);
    const P: number[] = [], N: number[] = [], U: number[] = [], PU: number[] = [];
    const mi = box.min.getComponent(i), mj = box.min.getComponent(j);
    const si = Math.max(1e-4, box.max.getComponent(i) - mi), sj = Math.max(1e-4, box.max.getComponent(j) - mj);
    const margin = 0.01;
    const tri = big.key.length;
    for (let t = 0; t < tri; t++) {
      if (big.key[t] !== id) continue;
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        P.push(big.pos[o], big.pos[o + 1], big.pos[o + 2]);
        N.push(big.nrm[o], big.nrm[o + 1], big.nrm[o + 2]);
        if (big.uv) U.push(big.uv[(t * 3 + v) * 2], big.uv[(t * 3 + v) * 2 + 1]);
        const pi = big.pos[o + i], pj = big.pos[o + j];
        PU.push(margin + ((pi - mi) / si) * (1 - 2 * margin), margin + ((pj - mj) / sj) * (1 - 2 * margin));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (big.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('paintUv', new THREE.Float32BufferAttribute(PU, 2));
    g.userData.paintCells = 1;
    g.computeBoundingSphere();
    g.computeBoundingBox();
    const pm = big.mesh.material;
    const firstT = big.key.indexOf(id);
    const cm = new THREE.Mesh(g, Array.isArray(pm) ? pm[big.mat[firstT]] ?? pm[0] : pm);
    cm.userData.paintChunk = true;
    cm.castShadow = big.mesh.castShadow;
    cm.receiveShadow = big.mesh.receiveShadow;
    cm.frustumCulled = true;
    big.mesh.add(cm);
    big.split.set(id, cm);
    // the parent keeps only the unpainted remainder (no double draw, no z-fight)
    this.rebuildRemainder(big);
    return cm;
  }

  private rebuildRemainder(big: BigMesh): void {
    const keep = new Map<number, { p: number[]; n: number[]; u: number[] }>();
    const tri = big.key.length;
    for (let t = 0; t < tri; t++) {
      const k = big.key[t];
      if (k < 0 || big.split.has(k)) continue;
      let kb = keep.get(big.mat[t]);
      if (!kb) keep.set(big.mat[t], (kb = { p: [], n: [], u: [] }));
      for (let v = 0; v < 3; v++) {
        const o = t * 9 + v * 3;
        kb.p.push(big.pos[o], big.pos[o + 1], big.pos[o + 2]);
        kb.n.push(big.nrm[o], big.nrm[o + 1], big.nrm[o + 2]);
        if (big.uv) kb.u.push(big.uv[(t * 3 + v) * 2], big.uv[(t * 3 + v) * 2 + 1]);
      }
    }
    const rest = new THREE.BufferGeometry();
    const RP: number[] = [], RN: number[] = [], RU: number[] = [];
    for (const [mi, kb] of [...keep.entries()].sort((x, y) => x[0] - y[0])) {
      rest.addGroup(RP.length / 3, kb.p.length / 3, mi);
      for (const x of kb.p) RP.push(x);
      for (const x of kb.n) RN.push(x);
      for (const x of kb.u) RU.push(x);
    }
    rest.setAttribute('position', new THREE.Float32BufferAttribute(RP, 3));
    rest.setAttribute('normal', new THREE.Float32BufferAttribute(RN, 3));
    if (big.uv) rest.setAttribute('uv', new THREE.Float32BufferAttribute(RU, 2));
    if (!Array.isArray(big.mesh.material)) rest.clearGroups();
    rest.computeBoundingSphere();
    rest.computeBoundingBox();
    big.mesh.geometry = rest;
  }

  /** Called once per step: draw all queued splats into their surfaces. */
  flush(dt: number): void {
    this.clock += dt;
    this.refreshT -= dt;
    if (this.refreshT <= 0) {
      this.refreshT = 1;
      this.refresh();
    }
    const r = PaintSystem.renderer;
    if (!r) return;
    let prev: THREE.WebGLRenderTarget | null | undefined;
    this.allocBudget = 1;
    for (const s of this.surfaces.values()) {
      if (!s.pending.length && !s.erases.length) continue;
      if (prev === undefined) prev = r.getRenderTarget();
      if (!this.ensureTarget(s)) {
        // no target this frame: keep only the latest splats queued (try again next frame)
        if (s.pending.length > 48) s.pending.splice(0, s.pending.length - 48);
        if (s.erases.length > 48) s.erases.splice(0, s.erases.length - 48);
        continue;
      }
      s.lastUsed = this.clock;
      s.mesh.updateWorldMatrix(true, false);
      this.proxy.geometry = s.geo;
      this.proxy.matrix.identity();
      this.proxy.matrixWorld.identity();
      this.mat.uniforms.uModel.value.copy(s.mesh.matrixWorld);
      r.setRenderTarget(s.rt);
      const draw = (list: Pending[], erase: boolean) => {
        this.mat.uniforms.uErase.value = erase ? 1 : 0;
        // erase = dst·(1−a) for colour AND coverage (painting black here was the "black puddles" bug)
        this.mat.blendSrc = erase ? THREE.ZeroFactor : THREE.OneFactor;
        this.mat.blendSrcAlpha = erase ? THREE.ZeroFactor : THREE.OneFactor;
        for (let i = 0; i < list.length; i += MAX_BATCH) {
          const n = Math.min(MAX_BATCH, list.length - i);
          for (let j = 0; j < n; j++) {
            this.mat.uniforms.uPos.value[j].copy(list[i + j].pos);
            this.mat.uniforms.uDir.value[j].copy(list[i + j].dir);
            this.mat.uniforms.uCol.value[j].copy(list[i + j].col);
          }
          this.mat.uniforms.uCount.value = n;
          // centre + 1-texel dilation so UV seams never show bare lines
          const px = 2 / s.size;
          const tex = s.rt!.texture;
          const last = i + MAX_BATCH >= list.length;
          for (let k = 0; k < DILATE.length; k++) {
            this.mat.uniforms.uOffset.value.set(DILATE[k][0] * px, DILATE[k][1] * px);
            this.mat.uniformsNeedUpdate = true;
            // three rebuilds the whole mip chain after every render into a mipmapped target:
            // only let it happen once, after the final pass
            tex.generateMipmaps = last && k === DILATE.length - 1;
            r.render(this.scene, this.cam);
          }
          tex.generateMipmaps = true;
        }
        list.length = 0;
      };
      if (s.erases.length) draw(s.erases, true);
      if (s.pending.length) draw(s.pending, false);
    }
    if (prev !== undefined) r.setRenderTarget(prev);
  }

  clear(): void {
    for (const s of this.surfaces.values()) {
      if (s.rt) recycleTarget(s.rt);
      s.tex.value = blankTex;
      s.rt = null;
    }
    this.surfaces.clear();
    this.bytes = 0;
  }
}
