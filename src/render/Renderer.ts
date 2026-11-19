import * as THREE from 'three';
import { Quality } from './Quality';
import { InkPass } from './InkPass';
import { Grade, GRADE_GLSL } from './Grade';
import { drawCamera, type StaticBatch } from './StaticBatch';

/**
 * [INPUT]: depends on THREE.WebGLRenderer; depends on Quality (tier, pixel ratio), InkPass and Grade from render/;
 *          depends on drawCamera and the StaticBatch type from render/StaticBatch
 * [OUTPUT]: exports Renderer (scene, camera, viewmodel overlay, render(), precompile(), beforeFrame slot)
 * [POS]: the one owner of the WebGL canvas. main.ts calls render() once per frame; coop/PipView uses beforeFrame
 *        to draw its corner picture on the canvas before the frame covers it.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

/**
 * The grade as a post-step on the screen itself: the world (+ gun) draws to the canvas exactly as
 * before (same tone mapping, same blending of glass / haze / sprites in display space, same MSAA),
 * then one blit copies the frame into a texture and one full-screen quad writes it back graded.
 * (Rendering into an HDR target instead blended the transparent haze in linear light: distant
 * towers came out visibly foggier.)
 */
class GradePass {
  private tex: THREE.FramebufferTexture | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();
  private origin = new THREE.Vector2();

  constructor(grade: Grade) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, ...grade.uniforms },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      // the copy already holds display (sRGB) values: no tone mapping / colour-space step here
      fragmentShader: /* glsl */ `
        uniform sampler2D tColor;
        varying vec2 vUv;
        ${GRADE_GLSL}
        void main() { gl_FragColor = vec4(wdGrade(texture2D(tColor, vUv).rgb, vUv), 1.0); }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  /** Grade what is on the canvas right now. */
  apply(r: THREE.WebGLRenderer): void {
    r.getDrawingBufferSize(this.size);
    if (!this.tex || this.tex.image.width !== this.size.x || this.tex.image.height !== this.size.y) {
      this.tex?.dispose();
      this.tex = new THREE.FramebufferTexture(this.size.x, this.size.y);
      this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
      this.mat.uniforms.tColor.value = this.tex;
    }
    r.copyFramebufferToTexture(this.tex, this.origin);
    r.render(this.scene, this.cam);
  }
}

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly viewScene = new THREE.Scene();
  readonly viewCamera: THREE.PerspectiveCamera;
  viewmodelVisible = false;
  /** Clean-line ink pass (comic art styles; off on the Low tier). */
  private ink: InkPass | null = null;
  inkColor = new THREE.Color('#3b2b2a');
  inkOn = false;
  /** Art style + LOOK + health colour grade, applied in the final full-screen pass (was CSS). */
  readonly grade = new Grade();
  private gradePass: GradePass | null = null;
  private lastT = performance.now();
  private lastAspect = 0;
  /** Set by main.ts. precompile() shows it the batched source meshes, so their own programs compile at load. */
  staticBatch: StaticBatch | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const q = Quality.init();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    Quality.attach(this.renderer);
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);
    drawCamera(this.camera, true);
    this.viewCamera = new THREE.PerspectiveCamera(50, 1, 0.01, 10);
    this.viewScene.add(new THREE.HemisphereLight('#ffffff', '#c07090', 1.6));
    const d = new THREE.DirectionalLight('#fff0dc', 1.8);
    d.position.set(1, 2, 1.5);
    this.viewScene.add(d, new THREE.AmbientLight('#ffffff', 0.4));
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    Quality.resized(w, h);
    const aspect = w / h;
    if (this.lastAspect === aspect) return;
    this.lastAspect = aspect;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.viewCamera.aspect = aspect;
    this.viewCamera.updateProjectionMatrix();
  }

  /**
   * One-shot work on the canvas before the next frame is drawn over it (the co-op corner view paints its
   * picture into a canvas corner here and copies it out; the frame's full clear then hides it). Cleared once run.
   */
  beforeFrame: (() => void) | null = null;

  render(): void {
    const pre = this.beforeFrame;
    this.beforeFrame = null;
    pre?.();
    const now = performance.now();
    Quality.prepareShadows(now);
    const dt = Math.min(0.25, (now - this.lastT) / 1000);
    this.lastT = now;
    const c = this.renderer.domElement;
    this.grade.tick(dt, c.clientWidth || window.innerWidth, c.clientHeight || window.innerHeight);
    const overlay = this.viewmodelVisible
      ? () => {
          this.renderer.clearDepth();
          this.renderer.render(this.viewScene, this.viewCamera);
        }
      : null;
    if (this.inkOn && Quality.tier !== 'low') {
      if (!this.ink) this.ink = new InkPass(this.grade);
      (this.ink.mat.uniforms.ink.value as THREE.Color).copy(this.inkColor);
      this.ink.render(this.renderer, this.scene, this.camera);
      // (the gun is drawn after the ink pass, straight to the screen: no lines on it)
      overlay?.();
    } else {
      this.renderer.clear();
      this.renderer.render(this.scene, this.camera);
      overlay?.();
      if (this.grade.active) (this.gradePass ??= new GradePass(this.grade)).apply(this.renderer);
    }
  }

  async precompile(): Promise<void> {
    // hidden things (lamp beams, rings, effects, doors…) compile too — no first-use hitches later
    const hidden: THREE.Object3D[] = [];
    // creatures finalise their materials first (actor shading defines) so those variants compile now
    const preps: (() => void)[] = [];
    this.scene.traverse((o) => {
      if (typeof o.userData.wdPrep === 'function') preps.push(o.userData.wdPrep as () => void);
    });
    for (const p of preps) p();
    this.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    const r = this.renderer as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> };
    this.staticBatch?.reveal(true);
    try {
      await this.compileAll(r);
      // compileAsync skips the shadow pass: one real frame (behind the loading screen) compiles the
      // shadow-depth shaders of everything too — hidden parts that appear mid-game included
      this.renderer.shadowMap.needsUpdate = true;
      this.render();
    } finally {
      this.staticBatch?.reveal(false);
      for (const o of hidden) o.visible = false;
    }
  }

  private async compileAll(r: THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }): Promise<void> {
    if (r.compileAsync) {
      await r.compileAsync(this.scene, this.camera);
      await r.compileAsync(this.viewScene, this.viewCamera);
    } else this.renderer.compile(this.scene, this.camera);
  }
}
