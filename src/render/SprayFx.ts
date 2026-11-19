/**
 * [INPUT]: depends on three (InstancedBufferGeometry, InstancedInterleavedBuffer, ShaderMaterial)
 * [OUTPUT]: exports SprayFx (one pooled, instanced quad batch for a paint spray) and the SPRAY_SHAPE ids
 * [POS]: render-side of every paint jet. WeaponSystem (WAI's can) and coop/CoopSpray (Pip) own one each;
 *        they simulate the droplets, SprayFx only draws them. One draw call per spray, no per-frame allocation.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';

/** Instance shapes. Mist and splats are written first so streaks draw over them. */
export const SPRAY_SHAPE = { streak: 0, mist: 1, splat: 2 } as const;

// head(3) tail(3) colour(3) width alpha shape seed
const STRIDE = 13;

/**
 * Three shapes share one instanced quad:
 *  - streak: a capsule from tail to head (motion-blurred droplet), with a dark ink rim so it
 *    reads on bright walls and a glossy core so it reads on dark ones;
 *  - mist:   a soft blob, stretched along its own head→tail axis (the aerosol cone);
 *  - splat:  a ragged star-shaped burst (where paint lands), fading out fast.
 * Widths have a floor in screen pixels: a far jet thins to a line, it never vanishes.
 */
export class SprayFx {
  readonly mesh: THREE.Mesh;
  private data: Float32Array;
  private buf: THREE.InstancedInterleavedBuffer;
  private geo: THREE.InstancedBufferGeometry;
  private n = 0;
  private uView: { value: number };

  constructor(readonly capacity: number) {
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0]), 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.data = new Float32Array(capacity * STRIDE);
    this.buf = new THREE.InstancedInterleavedBuffer(this.data, STRIDE).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('head', new THREE.InterleavedBufferAttribute(this.buf, 3, 0));
    geo.setAttribute('tail', new THREE.InterleavedBufferAttribute(this.buf, 3, 3));
    geo.setAttribute('icol', new THREE.InterleavedBufferAttribute(this.buf, 3, 6));
    geo.setAttribute('look', new THREE.InterleavedBufferAttribute(this.buf, 4, 9));
    geo.instanceCount = 0;
    this.geo = geo;
    this.uView = { value: window.innerHeight };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { viewH: this.uView },
      vertexShader: /* glsl */ `
        attribute vec3 head; attribute vec3 tail; attribute vec3 icol; attribute vec4 look;
        uniform float viewH;
        varying vec2 vUv; varying vec3 vCol; varying vec3 vLook; varying float vSeg;
        void main() {
          vec4 h = modelViewMatrix * vec4(head, 1.0);
          vec4 t = modelViewMatrix * vec4(tail, 1.0);
          // floor the width at ~2 screen pixels (world size of one pixel at this depth)
          float px = 2.0 / (projectionMatrix[1][1] * viewH) * max(0.05, -h.z);
          float w = max(look.x, (look.z < 0.5 ? 1.1 : 2.0) * px);
          // the capsule lies in the view plane: a droplet flying straight away from the
          // camera foreshortens to a round dot, never to a hard-edged square
          vec2 a2 = h.xy - t.xy;
          float la = length(a2);
          vec2 d2 = la > 1e-6 ? a2 / la : vec2(0.0, 1.0);
          vec2 side = vec2(-d2.y, d2.x);
          float ext = position.x * (la + 2.0 * w) - w;
          vec2 xy = t.xy + d2 * ext + side * w * position.y;
          float z = mix(t.z, h.z, clamp(ext / max(la, 1e-6), 0.0, 1.0));
          vUv = position.xy;
          vSeg = la / w;
          vCol = icol;
          vLook = look.yzw;
          gl_Position = projectionMatrix * vec4(xy, z, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol; varying vec3 vLook; varying float vSeg;
        void main() {
          float alpha = vLook.x; float shape = vLook.y; float seed = vLook.z;
          // distance to the capsule's core segment, in widths (0 on the axis, 1 on the rim)
          float u = vUv.x * (vSeg + 2.0) - 1.0;
          vec2 q = vec2(u - clamp(u, 0.0, vSeg), vUv.y);
          float r = length(q);
          vec3 c = vCol; float a;
          if (shape < 0.5) {
            // streak: bright head, tail fading back along the motion, ink rim
            float f = vSeg > 1e-3 ? clamp(u / vSeg, 0.0, 1.0) : 1.0;
            // comet profile: full width at the head, tapering to a third at the tail (a streak, not a tube)
            float rr = r / mix(0.3, 1.0, f);
            float across = 1.0 - rr * rr;
            a = smoothstep(0.0, 0.25, across) * mix(0.12, 1.0, smoothstep(0.0, 0.75, f));
            c = mix(c * 0.42, c, smoothstep(0.08, 0.38, across));
            c = mix(c, vec3(1.0), smoothstep(0.9, 1.0, across) * 0.22 * smoothstep(0.6, 0.95, f));
          } else if (shape < 1.5) {
            // mist: soft falloff around the (motion-stretched) core
            a = pow(max(0.0, 1.0 - r), 1.6);
          } else {
            // splat: ragged star, solid core, dark edge
            float ang = atan(q.y, q.x);
            float edge = 0.62 + 0.22 * sin(ang * 7.0 + seed * 6.283) + 0.12 * sin(ang * 13.0 - seed * 11.0);
            a = smoothstep(edge, edge - 0.12, r);
            c = mix(c * 0.4, c, smoothstep(edge, edge - 0.2, r));
          }
          a *= alpha;
          if (a < 0.015) discard;
          gl_FragColor = vec4(c, a);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.userData.noPaint = true;
    this.mesh.raycast = () => {}; // never a paint / pick target
  }

  /** Start writing this frame's instances. */
  begin(): void {
    this.n = 0;
  }

  private put(hx: number, hy: number, hz: number, tx: number, ty: number, tz: number, col: THREE.Color, width: number, alpha: number, shape: number, seed: number): void {
    if (this.n >= this.capacity) return;
    const d = this.data;
    let o = this.n++ * STRIDE;
    d[o++] = hx; d[o++] = hy; d[o++] = hz;
    d[o++] = tx; d[o++] = ty; d[o++] = tz;
    d[o++] = col.r; d[o++] = col.g; d[o++] = col.b;
    d[o++] = width; d[o++] = alpha; d[o++] = shape; d[o] = seed;
  }

  /** A droplet in flight: capsule from `head` back along `vel` by `len` metres. */
  streak(head: THREE.Vector3, vel: THREE.Vector3, len: number, col: THREE.Color, width: number, alpha = 0.95): void {
    const vl = vel.length() || 1;
    const k = len / vl;
    this.put(head.x, head.y, head.z, head.x - vel.x * k, head.y - vel.y * k, head.z - vel.z * k, col, width, alpha, SPRAY_SHAPE.streak, 0);
  }

  /** A soft puff of aerosol, stretched `len` metres back along `vel`. */
  mist(at: THREE.Vector3, vel: THREE.Vector3, len: number, col: THREE.Color, size: number, alpha: number): void {
    const vl = vel.length() || 1;
    const k = len / vl;
    this.put(at.x, at.y, at.z, at.x - vel.x * k, at.y - vel.y * k, at.z - vel.z * k, col, size, alpha, SPRAY_SHAPE.mist, 0);
  }

  /** A landing burst at a world point. */
  splat(at: THREE.Vector3, col: THREE.Color, size: number, alpha: number, seed: number): void {
    this.put(at.x, at.y, at.z, at.x, at.y, at.z, col, size, alpha, SPRAY_SHAPE.splat, seed);
  }

  /** Upload only the instances written since begin(). */
  end(): void {
    this.geo.instanceCount = this.n;
    this.uView.value = window.innerHeight;
    if (this.n === 0) return;
    this.buf.clearUpdateRanges();
    this.buf.addUpdateRange(0, this.n * STRIDE);
    this.buf.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
