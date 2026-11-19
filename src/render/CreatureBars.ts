/**
 * [INPUT]: depends on three (InstancedBufferGeometry, InstancedInterleavedBuffer, ShaderMaterial); reads each tracked
 *          creature through the BarSource surface (EnemyBase implements it); the camera's aimRay/aimT
 * [OUTPUT]: exports CreatureBars (one instanced quad batch per scene root) and the BarSource interface
 * [POS]: the small corruption bars over ordinary creatures. EnemyBase registers every creature with base paint in
 *        [BAR_MIN_HP, 1000) and tells it when it is hit or finished; bosses keep their HUD bar. The bar reads like the
 *        boss bar: the magenta corruption shrinks from the right as paint wins. One draw call, rebuilt in onBeforeRender
 *        (after every creature has moved), depth-tested so walls hide it. No DOM, no canvas.
 * [PROTOCOL]: Update this header on change, then check docs/difficulty/NOTES.md
 */
import * as THREE from 'three';

/** Below this base paint a creature is swarm (grubs, small moths): one stomp ends it, a bar would be noise. */
export const BAR_MIN_HP = 60;

/** What a bar needs from its creature (EnemyBase). */
export interface BarSource {
  readonly renderPos: THREE.Vector3;
  readonly root: THREE.Object3D;
  readonly hp: number;
  readonly maxHp: number;
  readonly baseHp: number;
  readonly disposed: boolean;
  readonly canBeTagged: boolean;
  /** Height of the bar's centre above renderPos (m). */
  readonly barHeight: number;
  /** performance.now() of the last hit, and of the finish (0 = never). */
  barHitAt: number;
  barDoneAt: number;
}

const STRIDE = 9; // centre(3) | frac alpha tint ticks | swell seed
const SHOW_MS = 3200; // visible after the last hit
const FADE_MS = 700;
const DONE_MS = 750; // the "done" beat: full, gold, swells and fades
const MAX = 64;
const _ray = new THREE.Vector3();
const _to = new THREE.Vector3();

export class CreatureBars {
  private static byRoot = new WeakMap<THREE.Object3D, CreatureBars>();
  /** The batch for a scene root (created on first use). */
  static for(root: THREE.Object3D, camera: { aimT: number; aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } }): CreatureBars {
    let b = CreatureBars.byRoot.get(root);
    if (!b) CreatureBars.byRoot.set(root, (b = new CreatureBars(root, camera)));
    return b;
  }

  private list: BarSource[] = [];
  private data = new Float32Array(MAX * STRIDE);
  private buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
  private geo = new THREE.InstancedBufferGeometry();
  readonly mesh: THREE.Mesh;

  private constructor(
    root: THREE.Object3D,
    private camera: { aimT: number; aimRay(): { origin: THREE.Vector3; dir: THREE.Vector3 } },
  ) {
    const geo = this.geo;
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('centre', new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    geo.setAttribute('look', new THREE.InterleavedBufferAttribute(this.buf, 4, 3));
    geo.setAttribute('extra', new THREE.InterleavedBufferAttribute(this.buf, 2, 7));
    geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: true,
      uniforms: { viewH: { value: window.innerHeight } },
      vertexShader: /* glsl */ `
        attribute vec3 centre; attribute vec4 look; attribute vec2 extra;
        uniform float viewH;
        varying vec2 vUv; varying vec4 vLook; varying float vSeed;
        void main() {
          vec4 c = modelViewMatrix * vec4(centre, 1.0);
          // world size, clamped on screen (never huge up close, never a speck)
          float px = 2.0 / (projectionMatrix[1][1] * viewH) * max(0.05, -c.z);
          float w = clamp(0.55, 34.0 * px, 64.0 * px); // half width: 68..128 px across
          c.xy += position.xy * vec2(w, w / 4.0) * extra.x; // extra.x: the done beat's swell
          gl_Position = projectionMatrix * c;
          vUv = position.xy; vLook = look; vSeed = extra.y;
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec4 vLook; varying float vSeed;
        const float ASPECT = 4.0;
        void main() {
          float frac = vLook.x; float a = vLook.y; float tint = vLook.z; float ticks = vLook.w;
          float x = vUv.x * 0.5 + 0.5;
          // a marker stroke: a capsule whose middle line wobbles a little along its length
          float wob = sin(x * 13.0 + vSeed * 6.3) * 0.09 + sin(x * 37.0 + vSeed * 2.0) * 0.04;
          vec2 q = vec2(vUv.x * ASPECT, vUv.y + wob);
          float d = length(vec2(max(abs(q.x) - (ASPECT - 1.0), 0.0), q.y));
          if (d > 1.0) discard;
          vec3 ink = vec3(0.08, 0.06, 0.08);
          // the fill lives inside the ink rim, its own edge as wobbly as the rim's
          float fx = (q.x + ASPECT - 1.0) / (2.0 * ASPECT - 2.0);
          vec3 painted = mix(vec3(1.0, 0.31, 0.64), vec3(1.0, 0.82, 0.23), smoothstep(0.0, 0.6, fx));
          painted = mix(painted, vec3(0.13, 0.77, 0.75), smoothstep(0.6, 1.0, fx));
          vec3 corrupt = mix(vec3(0.42, 0.13, 0.62), vec3(0.70, 0.24, 1.0), 0.5 + 0.5 * q.y);
          vec3 col = fx < frac ? painted : corrupt;
          // TAG available: the corruption glows gold; the done beat is all gold
          col = mix(col, vec3(1.0, 0.84, 0.2), tint * (fx < frac ? 0.3 : 0.9));
          // reel ticks at each quarter (creatures that stagger)
          if (ticks > 0.5) for (int i = 1; i < 4; i++) { if (abs(fx - float(i) * 0.25) < 0.012) col = ink; }
          if (d > 0.6) col = ink; // the ink rim
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.userData.noPaint = true;
    this.mesh.userData.noFade = true;
    this.mesh.name = 'creature-bars';
    this.mesh.onBeforeRender = () => this.rebuild(mat);
    root.add(this.mesh);
  }

  add(s: BarSource): void {
    if (!this.list.includes(s)) this.list.push(s);
  }

  remove(s: BarSource): void {
    const i = this.list.indexOf(s);
    if (i >= 0) this.list.splice(i, 1);
  }

  private rebuild(mat: THREE.ShaderMaterial): void {
    mat.uniforms.viewH.value = window.innerHeight;
    const now = performance.now();
    const aim = this.camera.aimT > 0.5 ? this.camera.aimRay() : null;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      if (s.disposed) {
        this.list.splice(i, 1);
        continue;
      }
      if (n >= MAX || !s.root.visible) continue;
      let alpha = 0;
      const tint = s.canBeTagged ? 1 : 0;
      const frac = THREE.MathUtils.clamp(1 - s.hp / s.maxHp, 0, 1);
      if (s.barDoneAt > 0) {
        const k = (now - s.barDoneAt) / DONE_MS;
        if (k >= 1) continue;
        // the done beat: full, all gold, it swells and fades
        this.write(n++, s, 1, k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55, 1, 1 + k * 0.6);
        continue;
      }
      const since = now - s.barHitAt;
      if (s.barHitAt > 0 && since < SHOW_MS + FADE_MS) alpha = since < SHOW_MS ? 1 : 1 - (since - SHOW_MS) / FADE_MS;
      if (aim) {
        // WAI aims at it: show it (the spray's reach, along the aim ray)
        _to.copy(s.renderPos).setY(s.renderPos.y + s.barHeight * 0.5).sub(aim.origin);
        const along = _to.dot(aim.dir);
        if (along > 0 && along < 16 && _ray.copy(aim.dir).multiplyScalar(along).sub(_to).length() < 1.2) alpha = 1;
      }
      if (alpha <= 0.01) continue;
      this.write(n++, s, frac, alpha, tint, 1);
    }
    this.geo.instanceCount = n;
    this.buf.needsUpdate = true;
  }

  private write(i: number, s: BarSource, frac: number, alpha: number, tint: number, swell: number): void {
    const o = i * STRIDE;
    const d = this.data;
    d[o] = s.renderPos.x;
    d[o + 1] = s.renderPos.y + s.barHeight;
    d[o + 2] = s.renderPos.z;
    d[o + 3] = frac;
    d[o + 4] = alpha;
    d[o + 5] = tint;
    d[o + 6] = s.baseHp >= 150 ? 1 : 0; // reel ticks (EnemyBase staggers these at every quarter)
    d[o + 7] = swell;
    d[o + 8] = (s.baseHp * 0.37) % 1;
  }
}
