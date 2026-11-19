import * as THREE from 'three';
import type { CoopPartner } from './Coop';
import type { Renderer } from '../render/Renderer';
import { Quality } from '../render/Quality';
import { drawCamera } from '../render/StaticBatch';
import { t } from '../i18n';
import { heartsHtml } from './HeartTag';

/**
 * [INPUT]: depends on CoopPartner (her state, hearts, bubble, standing order) from ./Coop; Renderer (scene, canvas,
 *          beforeFrame slot) from ../render/Renderer; Quality tier; t() from ../i18n; heartsHtml from ./HeartTag
 * [OUTPUT]: exports PipView (update() per frame, static snapshot() for tests and docs, stats frames / ms / calls)
 * [POS]: the co-op corner view. CoopApp.frame (main.ts' `// PIP-HOOK`) calls update() after each main render.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 *
 * The corner view: when 蓝色大肥鱼 is off-screen, hidden behind something or far from WAI, a small live picture of
 * her in a sticker frame (her name, her hearts, what she is doing in two or three words, her speech-bubble line). It fades out
 * once she is back in view. The frame and all its text are DOM at full resolution; only the 3D picture is small.
 *
 * The picture: 30 per second, never on two main frames in a row (so 60 fps → every other frame, evenly paced).
 * update() places a second camera behind her and books Renderer.beforeFrame. At the start of the next main
 * render that callback draws the scene into a W×H scissored corner of the game canvas itself (same tone mapping
 * and sRGB output as the main view, so no extra shader variants), copies that corner into the 2D canvas with
 * drawImage (GPU to GPU, no pixel read-back), and the main frame's full clear then paints over the corner.
 * Cheap per picture (~120 draw calls, not ~200): the camera sees only NEAR metres (the rest fades into haze),
 * shadow maps are not re-rendered, and cullParts hides the scene parts out of range or smaller than MIN_PX on the
 * picture, so three neither walks nor draws them. The cost left is three's per-render overhead. Skipped on the Low graphics tier, in cutscenes
 * and in the pause menu; 15 per second while frames are slow (> 30 ms average).
 */
const W = 256;
const H = 160;
const FPS = 30;
const SLOW_FPS = 15;
/** how far the corner camera sees; the haze starts at HAZE × NEAR */
const NEAR = 22;
const HAZE = 0.45;
/** meshes whose bounding sphere is smaller than this radius on the picture (pixels) are left out of it */
const MIN_PX = 4;
const FOV = 48;
/** a group with more children than this is split into parts for cullParts */
const SPLIT = 32;
/** parts re-measured per picture (doors, moved props); ~800 parts → each about every 2 s at 30 pictures/s */
const REFRESH = 12;
/** slack for parts that moved since they were measured (metres) */
const MOVE = 4;
/** world radius / distance → radius in picture pixels */
const PX_PER_RAD = H / 2 / Math.tan((FOV / 2) * THREE.MathUtils.DEG2RAD);

/** a scene part for cullParts: its world bounds, whether it is always drawn, its small meshes (world bounds) */
type Part = { o: THREE.Object3D; s: THREE.Sphere; keep: boolean; fresh: boolean; bits: { o: THREE.Object3D; s: THREE.Sphere }[] };

export class PipView {
  private el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private cam = new THREE.PerspectiveCamera(FOV, W / H, 0.1, NEAR);
  private clear = new THREE.Color();
  private vp = new THREE.Vector4();
  private sc = new THREE.Vector4();
  private box = new THREE.Box3();
  private hidden: THREE.Object3D[] = [];
  private parts: Part[] = [];
  private partsOf: THREE.Scene | null = null;
  private partI = 0;
  private renderT = 0;
  private drewLast = false;
  private slowAvg = 1 / 60;
  private showT = 0;
  private v = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private lastDoing = '';
  private lastSay = '';
  private lastHearts = '';
  private booked: Renderer | null = null;
  private readonly drawFn = (): void => this.draw();
  /** stats (tests / status): pictures drawn, why it is (not) shown, cost of the last picture */
  frames = 0;
  visible = false;
  reason = '';
  ms = 0;
  calls = 0;
  tris = 0;
  culled = 0;

  constructor() {
    const el = (this.el = document.createElement('div'));
    el.className = 'coop-pip';
    el.innerHTML = `<canvas width="${W}" height="${H}"></canvas><div class="coop-pip-tag"><b class="coop-pip-name"></b> <span class="coop-pip-hearts"></span> <span class="coop-pip-doing"></span></div><div class="coop-pip-say"></div>`;
    (document.getElementById('ui-root') ?? document.body).appendChild(el);
    this.canvas = el.querySelector('canvas')!;
    this.g = this.canvas.getContext('2d', { alpha: false })!;
    drawCamera(this.cam);
  }

  /** Is she somewhere WAI's camera can't see well (off-screen, behind a wall, far)? */
  private wanted(p: CoopPartner, main: THREE.PerspectiveCamera): string {
    const pip = p.pip;
    const s = p.s;
    const head = this.v.copy(pip.renderPos).setY(pip.renderPos.y + 0.6);
    const far = pip.pos.distanceTo(s.player.pos);
    if (far > 16) return 'far';
    const ndc = head.clone().project(main);
    if (ndc.z > 1 || Math.abs(ndc.x) > 0.95 || Math.abs(ndc.y) > 0.95) return 'offscreen';
    // something solid between the camera and her
    const from = main.position;
    const dir = head.clone().sub(from);
    const len = dir.length();
    const hit = s.physics.raycast(from, dir.divideScalar(len), Math.max(0, len - 0.5), (c) => {
      const tg = s.physics.tagOf(c);
      return tg === 'static' || tg === 'gate' || tg === 'host';
    });
    if (hit) return 'hidden';
    return '';
  }

  /** What she is up to, in two or three words. */
  private doing(p: CoopPartner): string {
    const pip = p.pip;
    const goof = p.goofs.active;
    if (goof) return t('being clumsy');
    if (pip.down > 0) return t('smudged!');
    if (p.mood.asleep) return t('napping');
    if (pip.slam > 0) return t('PAINT SLAM!');
    if (pip.hovering) return t('jet hovering');
    if (pip.sprayingNow) return t('painting {who}', { who: pip.sprayEnemy?.id ?? '' }).trim();
    if (!pip.grounded) return t('jumping');
    const sp = Math.hypot(pip.vel.x, pip.vel.z);
    const st = p.standing.mode;
    if (st === 'stay') return t('waiting here');
    if (st === 'collect') return t('fetching rice');
    if (st === 'goto') return t('on her way');
    if (pip.catchUp && sp > 1) return t('catching up');
    if (sp > 1) return t('following you');
    return t('hanging around');
  }

  /** Per rendered frame (after the main render). */
  update(p: CoopPartner | null, r: Renderer, dt: number, enabled: boolean): void {
    this.slowAvg += (dt - this.slowAvg) * 0.05;
    // a picture booked last frame but not drawn (no render since) is dropped: it may belong to a gone session
    if (r.beforeFrame === this.drawFn) r.beforeFrame = null;
    const s = p?.s;
    let why = '';
    if (!enabled) why = 'off';
    else if (!p || !s) why = 'no partner';
    else if (!p.pip.shown) why = 'not drawn in yet';
    else if (s.story.locked || s.ctx.camera.inCine || s.completed) why = 'cutscene';
    else if (document.querySelector('#ui-root .pause:not(.hidden)')) why = 'paused';
    else if (Quality.tier === 'low') why = 'low tier';
    const want = why ? '' : this.wanted(p!, r.camera);
    this.reason = why || want || 'in view';
    // a little hysteresis: no flicker at the screen edge
    this.showT = want ? 1.2 : Math.max(0, this.showT - dt);
    const show = this.showT > 0 && !why;
    if (show !== this.visible) {
      this.visible = show;
      this.el.classList.toggle('on', show);
    }
    if (!show || !p) {
      this.renderT = 1; // the first picture after it reappears is drawn at once
      return;
    }
    // labels (only touched when they change)
    const d = this.doing(p);
    if (d !== this.lastDoing) {
      this.lastDoing = d;
      (this.el.querySelector('.coop-pip-doing') as HTMLElement).textContent = d;
      (this.el.querySelector('.coop-pip-name') as HTMLElement).textContent = p.name;
    }
    const hk = `${p.pip.down > 0 ? 0 : p.pip.hp}/${p.pip.health.max}`;
    if (hk !== this.lastHearts) {
      this.lastHearts = hk;
      (this.el.querySelector('.coop-pip-hearts') as HTMLElement).innerHTML = heartsHtml(p.pip.down > 0 ? 0 : p.pip.hp, p.pip.health.max);
    }
    const say = p.bubble.busy ? p.bubble.current : '';
    if (say !== this.lastSay) {
      this.lastSay = say;
      const se = this.el.querySelector('.coop-pip-say') as HTMLElement;
      se.textContent = say;
      se.classList.toggle('on', !!say);
    }
    // the picture: FPS per second (SLOW_FPS while the game struggles), never on two main frames in a row
    const step = 1 / (this.slowAvg > 0.03 ? SLOW_FPS : FPS);
    this.renderT += dt;
    if (this.drewLast || this.renderT + 0.004 < step) {
      this.drewLast = false;
      return;
    }
    this.renderT = Math.min(Math.max(0, this.renderT - step), step);
    this.drewLast = true;
    this.aim(p);
    this.booked = r;
    r.beforeFrame = this.drawFn;
  }

  /** Over her shoulder, a bit above, pulled in if a wall is in the way. Runs while her session is live. */
  private aim(p: CoopPartner): void {
    const pip = p.pip;
    const back = this.v.set(-Math.sin(pip.facing), 0, -Math.cos(pip.facing));
    this.look.copy(pip.renderPos).setY(pip.renderPos.y + 0.5);
    const want = this.camPos.copy(this.look).addScaledVector(back, 1.9).setY(this.look.y + 0.55);
    const dir = want.clone().sub(this.look);
    const len = dir.length();
    const hit = p.s.physics.raycast(this.look, dir.divideScalar(len), len, (c) => p.s.physics.tagOf(c) === 'static');
    if (hit) want.copy(this.look).addScaledVector(dir, Math.max(0.6, hit.dist - 0.25));
    this.cam.position.copy(want);
    this.cam.lookAt(this.look);
    this.cam.updateMatrixWorld();
  }

  /** Renderer.beforeFrame: draw into the canvas corner, copy it out. The main frame then covers the corner. */
  private draw(): void {
    const r = this.booked;
    if (!r) return;
    const t0 = performance.now();
    const gl = r.renderer;
    const pr = gl.getPixelRatio();
    const cv = gl.domElement;
    // the corner in device pixels, as three rounds it
    const w = Math.round((W / pr) * pr);
    const h = Math.round((H / pr) * pr);
    if (cv.width < w || cv.height < h) return;
    const prevTarget = gl.getRenderTarget();
    gl.getViewport(this.vp);
    gl.getScissor(this.sc);
    const scissorOn = gl.getScissorTest();
    gl.getClearColor(this.clear);
    const ca = gl.getClearAlpha();
    const sm = gl.shadowMap.autoUpdate;
    // short sight + haze: only her surroundings are drawn (the sky dome is beyond the far plane; the haze stands in)
    const fog = r.scene.fog as THREE.Fog | null;
    const linear = !!fog && fog.isFog;
    const fn = linear ? fog.near : 0;
    const ff = linear ? fog.far : 0;
    if (linear) {
      fog.near = NEAR * HAZE;
      fog.far = NEAR * 0.97;
    }
    if (fog) gl.setClearColor(fog.color, 1);
    gl.shadowMap.autoUpdate = false;
    const mwu = r.scene.matrixWorldAutoUpdate;
    try {
      this.cullParts(r.scene);
      gl.setRenderTarget(null);
      gl.setViewport(0, 0, W / pr, H / pr);
      gl.setScissor(0, 0, W / pr, H / pr);
      gl.setScissorTest(true);
      gl.clear();
      r.scene.matrixWorldAutoUpdate = false;
      gl.render(r.scene, this.cam);
      this.calls = gl.info.render.calls;
      this.tris = gl.info.render.triangles;
      // canvas rows run top-down: the GL corner (0,0) is the bottom-left of the canvas
      this.g.drawImage(cv, 0, cv.height - h, w, h, 0, 0, W, H);
      this.frames++;
    } finally {
      r.scene.matrixWorldAutoUpdate = mwu;
      for (const o of this.hidden) o.visible = true;
      this.hidden.length = 0;
      gl.setScissorTest(scissorOn);
      gl.setScissor(this.sc);
      gl.setViewport(this.vp);
      gl.setRenderTarget(prevTarget);
      gl.shadowMap.autoUpdate = sm;
      gl.setClearColor(this.clear, ca);
      if (linear) {
        fog.near = fn;
        fog.far = ff;
      }
    }
    this.ms = performance.now() - t0;
  }

  /**
   * Hide (for this picture only) the scene parts out of her range or smaller than MIN_PX on the picture, so three
   * does not even walk them. A part is a child of a big group (level-root holds ~800 props, houses, creatures).
   * Bounds are re-measured round-robin, REFRESH parts per picture, with MOVE metres of range slack for moving parts.
   * The parts kept get their world matrices updated here; the picture then skips three's whole-scene update.
   * Parts holding skinned or never-culled meshes (WAI, her, creatures) or a light are always drawn.
   */
  private cullParts(scene: THREE.Scene): void {
    const parts = this.parts;
    // the part list follows the scene's shape: rebuilt when a group gains or loses children
    let n = 0;
    for (const c of scene.children) n += c.children.length > SPLIT ? c.children.length : 1;
    if (n !== parts.length || this.partsOf !== scene) {
      this.partsOf = scene;
      parts.length = 0;
      for (const c of scene.children)
        for (const o of c.children.length > SPLIT ? c.children : [c]) parts.push({ o, s: new THREE.Sphere(), keep: true, fresh: false, bits: [] });
      this.partI = 0;
    }
    for (let k = 0; k < parts.length && k < REFRESH; k++) this.measure(parts[(this.partI + k) % parts.length]);
    if (parts.length) this.partI = (this.partI + REFRESH) % parts.length;
    const cam = this.cam.position;
    const hidden = this.hidden;
    // only the parts drawn get fresh world matrices (the picture renders with scene.matrixWorldAutoUpdate off)
    for (const c of scene.children) if (c.children.length > SPLIT) c.updateWorldMatrix(false, false);
    for (const pt of parts) {
      if (!pt.fresh) this.measure(pt);
      if (pt.keep || !pt.o.visible) continue;
      const d = pt.s.center.distanceTo(cam) - pt.s.radius;
      if (d - MOVE > NEAR || (d > 0 && (pt.s.radius / d) * PX_PER_RAD < MIN_PX)) {
        pt.o.visible = false;
        hidden.push(pt.o);
        continue;
      }
      pt.o.updateMatrixWorld();
      // inside a part in range: its own small meshes (lamp eyes, pebbles, tiny decals) go one by one
      for (const b of pt.bits) {
        const db = b.s.center.distanceTo(cam) - b.s.radius;
        if (db > 0 && b.o.visible && (b.s.radius / db) * PX_PER_RAD < MIN_PX) {
          b.o.visible = false;
          hidden.push(b.o);
        }
      }
    }
    this.culled = hidden.length;
  }

  private measure(pt: Part): void {
    pt.fresh = true;
    pt.keep = false;
    pt.bits.length = 0;
    pt.o.traverse((o) => {
      // a hidden light would change three's light set: every material would re-check (or recompile) its program
      if (!o.frustumCulled || (o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.Light).isLight) pt.keep = true;
    });
    if (pt.keep) return;
    this.box.setFromObject(pt.o);
    if (this.box.isEmpty()) {
      pt.keep = true;
      return;
    }
    this.box.getBoundingSphere(pt.s);
    pt.o.traverse((o) => {
      const geo = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (o === pt.o || !geo) return;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const s = new THREE.Sphere().copy(geo.boundingSphere!).applyMatrix4(o.matrixWorld);
      // only meshes that could ever drop under MIN_PX inside the sight range are worth a test
      if ((s.radius / NEAR) * PX_PER_RAD < MIN_PX * 2) pt.bits.push({ o, s });
    });
  }

  /** Tests / docs: a close-up of the scene from any camera, as a PNG data URL (linear target read back, sRGB on the CPU). */
  static snapshot(r: Renderer, from: THREE.Vector3, look: THREE.Vector3, w = 480, h = 360, fov = 40): string {
    const gl = r.renderer;
    const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
    const cam = new THREE.PerspectiveCamera(fov, w / h, 0.05, 150);
    drawCamera(cam);
    cam.position.copy(from);
    cam.lookAt(look);
    cam.updateMatrixWorld();
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(r.scene, cam);
    const buf = new Uint8Array(w * h * 4);
    gl.readRenderTargetPixels(rt, 0, 0, w, h, buf);
    gl.setRenderTarget(prev);
    rt.dispose();
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d')!;
    const img = g.createImageData(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w * 4; x += 4)
        for (let c = 0; c < 4; c++) {
          const v = buf[(h - 1 - y) * w * 4 + x + c] / 255;
          const lin = Math.min(1, v * 1.15);
          img.data[y * w * 4 + x + c] = c === 3 ? 255 : Math.round((lin <= 0.0031308 ? lin * 12.92 : 1.055 * Math.pow(lin, 1 / 2.4) - 0.055) * 255);
        }
    g.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }

  dispose(): void {
    if (this.booked?.beforeFrame === this.drawFn) this.booked.beforeFrame = null;
    this.el.remove();
  }
}
