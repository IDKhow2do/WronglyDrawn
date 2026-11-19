import * as THREE from 'three';
import { GRADE_GLSL, type Grade } from './Grade';

/**
 * Clean-line ink (comic art styles): the world renders into an off-screen target, then one
 * full-screen pass draws thin, even ink lines where depth jumps (silhouettes), where the
 * surface folds (creases: depth curvature) and where flat colour changes — and only then
 * tone-maps to the screen. Replaces the inverted-hull outlines whose weight varied with size.
 */
export class InkPass {
  private rt: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(grade?: Grade) {
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(4, 4),
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture },
        tDepth: { value: this.rt.depthTexture },
        texel: { value: new THREE.Vector2(1 / 4, 1 / 4) },
        cNear: { value: 0.1 },
        cFar: { value: 400 },
        ink: { value: new THREE.Color('#3b2b2a') },
        width: { value: 1 },
        strength: { value: 0.9 },
        ...(grade?.uniforms ?? {}),
      },
      defines: grade ? { WD_GRADE: '' } : {},
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        #include <packing>
        uniform sampler2D tColor;
        uniform sampler2D tDepth;
        uniform vec2 texel;
        uniform float cNear, cFar, width, strength;
        uniform vec3 ink;
        varying vec2 vUv;
        #ifdef WD_GRADE
        ${GRADE_GLSL}
        #endif
        float lin(vec2 uv) {
          float z = texture2D(tDepth, uv).x;
          return -perspectiveDepthToViewZ(z, cNear, cFar);
        }
        float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
        void main() {
          vec4 base = texture2D(tColor, vUv);
          vec2 o = texel * width;
          float dc = lin(vUv);
          float dl = lin(vUv - vec2(o.x, 0.0)), dr = lin(vUv + vec2(o.x, 0.0));
          float dd = lin(vUv - vec2(0.0, o.y)), du = lin(vUv + vec2(0.0, o.y));
          float sky = step(cFar * 0.97, dc);
          // silhouettes: a depth jump relative to distance
          float jump = max(max(abs(dl - dc), abs(dr - dc)), max(abs(dd - dc), abs(du - dc))) / dc;
          float sil = smoothstep(0.035, 0.07, jump);
          // creases: depth curvature (a fold between two faces), relative to distance
          float curv = (abs(dl + dr - 2.0 * dc) + abs(dd + du - 2.0 * dc)) / dc;
          float crease = smoothstep(0.006, 0.014, curv) * (1.0 - sil);
          // flat colour boundaries (material edges, painted lines)
          vec3 cl = texture2D(tColor, vUv - vec2(o.x, 0.0)).rgb, cr = texture2D(tColor, vUv + vec2(o.x, 0.0)).rgb;
          vec3 cd = texture2D(tColor, vUv - vec2(0.0, o.y)).rgb, cu = texture2D(tColor, vUv + vec2(0.0, o.y)).rgb;
          float lc = lum(base.rgb) + 0.05;
          float cdiff = (abs(lum(cl) - lum(cr)) + abs(lum(cd) - lum(cu))) / lc;
          float colEdge = smoothstep(0.55, 0.9, cdiff) * 0.55;
          float e = max(max(sil, crease * 0.8), colEdge);
          // lines thin out into the haze, like a pen drawing receding
          e *= mix(1.0, 0.25, smoothstep(45.0, 170.0, dc));
          e *= 1.0 - sky;
          gl_FragColor = vec4(mix(base.rgb, ink, clamp(e * strength, 0.0, 1.0)), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #ifdef WD_GRADE
          gl_FragColor.rgb = wdGrade(gl_FragColor.rgb, vUv);
          #endif
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Render `scene` through the ink pass to the screen. */
  render(r: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    r.getDrawingBufferSize(this.size);
    if (this.rt.width !== this.size.x || this.rt.height !== this.size.y) {
      this.rt.setSize(this.size.x, this.size.y);
      (this.mat.uniforms.texel.value as THREE.Vector2).set(1 / this.size.x, 1 / this.size.y);
    }
    // ~1 px lines at 1080p, scaled with resolution so the weight stays even on any screen
    this.mat.uniforms.width.value = Math.max(1, this.size.y / 1080);
    this.mat.uniforms.cNear.value = camera.near;
    this.mat.uniforms.cFar.value = camera.far;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.clear();
    r.render(this.scene, this.cam);
  }

  dispose(): void {
    this.rt.dispose();
    this.mat.dispose();
    this.quad.geometry.dispose();
  }
}
