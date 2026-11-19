import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { EraserBoss } from '../enemy/EraserBoss';
import { addOutline, toon } from '../render/Materials';
import { t } from '../i18n';

/** The kid's giant pencil: it draws WAI into being and redraws the road. */
export function makePencil(scale = 1): THREE.Group {
  const g = new THREE.Group();
  const L = 7 * scale, R = 0.42 * scale;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 6), toon({ color: '#ffcf2e' }));
  body.position.y = L / 2 + 1.3 * scale;
  addOutline(body, Math.min(0.05, 0.06 * scale));
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.01, R * 1.01, L * 0.9, 6, 1, true), new THREE.MeshBasicMaterial({ color: '#e0a800', wireframe: true }));
  stripe.position.copy(body.position);
  const wood = new THREE.Mesh(new THREE.ConeGeometry(R, 1.0 * scale, 6), toon({ color: '#f4c99a' }));
  wood.rotation.x = Math.PI;
  wood.position.y = 0.8 * scale;
  const lead = new THREE.Mesh(new THREE.ConeGeometry(R * 0.32, 0.32 * scale, 6), toon({ color: '#2a2230' }));
  lead.rotation.x = Math.PI;
  lead.position.y = 0.16 * scale;
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.05, R * 1.05, 0.5 * scale, 12), new THREE.MeshStandardMaterial({ color: '#c0c6d0', metalness: 0.8, roughness: 0.3 }));
  ferrule.position.y = L + 1.3 * scale + 0.25 * scale;
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.7 * scale, 12), toon({ color: '#ff9ec4' }));
  rubber.position.y = L + 1.3 * scale + 0.85 * scale;
  g.add(body, stripe, wood, lead, ferrule, rubber);
  g.traverse((o) => {
    o.userData.noPaint = true;
    if ((o as THREE.Mesh).isMesh && !o.userData.isOutline) (o as THREE.Mesh).castShadow = true;
  });
  return g;
}

type Beat = { at: number; fn: () => void; done?: boolean };

/**
 * The story layer: an intro set piece, captions, the pencil that redraws the
 * road, the Eraser's entrance on the summit and the finale.
 */
export class StoryDirector {
  private beats: Beat[] = [];
  private t = 0;
  private running = false;
  private pencil: THREE.Group | null = null;
  private pencilAnim: ((dt: number, t: number) => void) | null = null;
  private props: THREE.Object3D[] = [];
  private anims: ((dt: number) => boolean)[] = [];
  onCaption: ((text: string | null, big?: boolean) => void) | null = null;
  /** True while a scripted sequence holds the controls. */
  locked = false;
  private skipTo = -1;

  constructor(
    private ctx: GameContext,
    private player: PlayerController,
  ) {}

  private caption(text: string | null, big = false): void {
    this.onCaption?.(text ? t(text) : null, big);
  }

  private run(beats: Beat[], skippableAt = -1): void {
    this.beats = beats;
    this.t = 0;
    this.running = true;
    this.skipTo = skippableAt;
  }

  /** Drawn into being: the pencil sketches WAI, the Eraser streaks to the summit. */
  intro(spawn: THREE.Vector3, boss: EraserBoss): void {
    const cam = this.ctx.camera;
    const p = this.player;
    this.locked = true;
    p.frozen = true;
    const model = p.model.root;
    // the pencil traces WAI's real top-down silhouette (measured at full size for this
    // instant only — he stays invisible from the title until the pencil has drawn him)
    model.scale.set(1, 1, 1);
    const path = topDownOutline(model, spawn.y + 0.03);
    const stroke = makeStroke(path);
    this.ctx.root.add(stroke.mesh);
    this.props.push(stroke.mesh);
    model.scale.set(0.001, 0.001, 0.001); // nothing there until the pencil has drawn him
    // held like a real pencil: tilted away from the camera so it never blocks the drawing
    const pencil = makePencil(0.32);
    pencil.position.copy(spawn).add(new THREE.Vector3(0.8, 9, 0.5));
    pencil.rotation.set(-0.55, 0, -0.6);
    this.ctx.root.add(pencil);
    this.pencil = pencil;
    const lean = { yaw: 0 };
    this.pencilAnim = (dt, time) => {
      if (time < 0.7) pencil.position.lerp(path[0].clone().add(new THREE.Vector3(0, 0.01, 0)), Math.min(1, dt * 6));
      else if (time < 2.3) {
        // trace the outline at a steady speed, leaving a graphite stroke on the dock
        const k = (time - 0.7) / 1.6;
        const at = stroke.drawTo(k);
        const ahead = stroke.drawTo(Math.min(1, k + 0.02)).clone();
        stroke.drawTo(k);
        // the tip rests on the line; the pencil trails behind the stroke like a hand pulling it
        pencil.position.set(at.x, at.y + 0.01, at.z);
        // lean away from the camera (never over the drawing), swaying a little against the stroke
        const away = at.clone().sub(this.ctx.camera.camera.position).setY(0);
        const dir = ahead.sub(at).setY(0);
        if (away.lengthSq() > 1e-6) {
          const side = dir.lengthSq() > 1e-6 ? Math.sign(dir.x * away.z - dir.z * away.x) * 0.3 : 0;
          const want = Math.atan2(away.x, away.z) + side;
          let dy = want - lean.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          lean.yaw += dy * Math.min(1, dt * 10);
        }
        pencil.rotation.set(0, 0, 0);
        pencil.rotateY(lean.yaw);
        pencil.rotateX(0.62 + Math.sin(time * 38) * 0.03); // tilt back + a little scribble pressure
      } else if (time < 2.9) {
        stroke.drawTo(1);
        stroke.settle();
        // colour floods into the drawing: WAI rises out of his outline
        if (model.scale.x < 0.5) model.scale.set(1, 0.02, 1);
        model.scale.y = THREE.MathUtils.lerp(model.scale.y, 1, Math.min(1, dt * 9));
        pencil.position.y += dt * 10;
      } else {
        model.scale.set(1, 1, 1);
        pencil.position.y += dt * 14;
        stroke.fade(dt);
      }
    };
    // the Eraser streaks across the sky to the summit, rubbing a pink trail
    const flyer = this.ctx.assets.instantiateModel('eraserBoss') ?? new THREE.Mesh(new THREE.BoxGeometry(5, 3, 3), toon({ color: '#ff9ec4' }));
    flyer.traverse((o) => (o.userData.noPaint = true));
    flyer.visible = false;
    this.ctx.root.add(flyer);
    this.props.push(flyer);
    // close enough to the harbor camera to read as a giant rubber streaking overhead
    const from = new THREE.Vector3(16, 11, 34);
    flyer.scale.multiplyScalar(2.2);
    const to = boss.pos.clone().add(new THREE.Vector3(0, 0.2, 0));
    boss.root.visible = false;
    const sx = spawn.x, sz = spawn.z;
    this.run(
      [
        {
          at: 0,
          fn: () => {
            this.caption('Somewhere, a kid is still drawing…', true);
            cam.playCine([
              // looking down at the dock while the pencil traces him…
              { pos: new THREE.Vector3(sx + 0.5, 2.7, sz + 1.1), look: new THREE.Vector3(sx, 0, sz), toPos: new THREE.Vector3(sx + 0.8, 2.4, sz + 1.4), dur: 2.3, fov: 42, toFov: 40 },
              // …then low and close as he rises out of his outline
              { pos: new THREE.Vector3(sx + 1.9, 0.7, sz + 2.4), look: new THREE.Vector3(sx, 0.6, sz), toPos: new THREE.Vector3(sx + 1.5, 0.9, sz + 1.9), dur: 1.1, fov: 44, toFov: 38 },
            ]);
            this.ctx.audio.play('whoosh', { pitch: 0.6 });
          },
        },
        { at: 0.8, fn: () => this.ctx.audio.play('erase', { pitch: 1.6, vol: 0.6 }) },
        { at: 1.5, fn: () => this.ctx.audio.play('erase', { pitch: 1.9, vol: 0.6 }) },
        {
          at: 2.95,
          fn: () => {
            model.scale.set(1, 1, 1);
            p.model.root.scale.set(1, 1, 1);
            this.ctx.audio.play('stickerBurst');
            for (const c of ['#ff4fa3', '#ffd23a', '#22c4c0', '#2a4be0']) this.ctx.effects.burst(spawn.clone().add(new THREE.Vector3(0, 0.6, 0)), c, 10, 4, 0.06);
            this.ctx.effects.comic(spawn.clone().add(new THREE.Vector3(0, 1.8, 0)), t('WAI!'), '#ff4fa3', 0.8);
            this.caption('…a doodle with a crown and a spray can.', true);
          },
        },
        {
          at: 3.4,
          fn: () => {
            flyer.visible = true;
            flyer.position.copy(from);
            this.caption('But the Red Pen’s ERASER is rubbing the city out.', true);
            this.ctx.audio.play('roar', { pitch: 1.6, vol: 0.8 });
            cam.playCine([{ pos: new THREE.Vector3(sx - 4, 7, sz - 6), look: new THREE.Vector3(26, 20, 18), toLook: new THREE.Vector3(2, 15, -40), dur: 3.4, fov: 56, toFov: 48 }]);
            let ft = 0;
            this.anims.push((dt) => {
              ft += dt / 3.2;
              const k = Math.min(1, ft);
              const e = k * k * (3 - 2 * k);
              flyer.position.lerpVectors(from, to, e);
              flyer.position.y += Math.sin(k * Math.PI) * 10;
              flyer.rotation.set(Math.sin(ft * 20) * 0.15, -Math.PI / 2 - 0.5, Math.sin(ft * 13) * 0.2);
              if (Math.random() < 0.7) this.ctx.effects.burst(flyer.position.clone(), '#ffc6dc', 2, 1.5, 0.12, 3);
              return k >= 1;
            });
          },
        },
        {
          at: 6.8,
          fn: () => {
            flyer.visible = false;
            boss.root.visible = true;
            this.ctx.audio.play('stomp', { pitch: 0.6, vol: 0.9 });
            this.ctx.audio.play('roar', { pitch: 1.3, vol: 0.9 });
            const b = boss.pos;
            cam.playCine([{ pos: b.clone().add(new THREE.Vector3(6, 3, 9)), look: b.clone().add(new THREE.Vector3(0, 2, 0)), toPos: b.clone().add(new THREE.Vector3(4, 2.4, 6.5)), dur: 2.2, fov: 40, toFov: 34, handheld: 0.05 }]);
            this.caption('It rubbed out the Guardians’ eyes and voice — and the road to the tower.', true);
          },
        },
        { at: 9.0, fn: () => this.caption('Wake its 3 Guardians · climb to the summit · repaint the Eraser.', true) },
        { at: 11.4, fn: () => this.endIntro(boss) },
      ],
      1.0,
    );
  }

  private endIntro(boss: EraserBoss): void {
    this.player.frozen = false;
    this.player.model.root.scale.set(1, 1, 1);
    boss.root.visible = true;
    this.locked = false;
    this.caption(null);
    if (this.pencil) this.ctx.root.remove(this.pencil);
    this.pencil = null;
    this.pencilAnim = null;
    for (const pr of this.props) this.ctx.root.remove(pr);
    this.props = [];
    this.anims = [];
    this.running = false;
    this.ctx.camera.stopCine();
    this.ctx.events.emit('intro:done');
  }

  /** Skip the current sequence (click / space after a moment). */
  skip(): void {
    if (!this.running || this.skipTo < 0 || this.t < this.skipTo) return;
    for (const b of this.beats) if (!b.done) {
      b.done = true;
      b.fn();
    }
  }

  /** The pencil comes down and scribbles a stretch of road back into existence. */
  pencilDraw(at: THREE.Vector3, dur = 1.6): void {
    const pencil = makePencil(0.9);
    pencil.position.copy(at).add(new THREE.Vector3(0, 14, 0));
    pencil.rotation.z = 0.3;
    this.ctx.root.add(pencil);
    let tt = 0;
    this.anims.push((dt) => {
      tt += dt;
      if (tt < 0.35) pencil.position.y = THREE.MathUtils.lerp(pencil.position.y, at.y + 0.6, Math.min(1, dt * 8));
      else if (tt < dur) {
        const a = tt * 9;
        pencil.position.set(at.x + Math.sin(a) * 2.0, at.y + 0.4 + Math.abs(Math.cos(a)) * 0.6, at.z + Math.cos(a * 0.7) * 2.8);
        if (Math.random() < 0.5) this.ctx.effects.sparkle(pencil.position.clone(), '#2a2230', 1);
        if (Math.random() < 0.08) this.ctx.audio.play('erase', { pos: at, pitch: 1.7, vol: 0.5 });
      } else pencil.position.y += dt * 18;
      if (tt > dur + 1.2) {
        this.ctx.root.remove(pencil);
        return true;
      }
      return false;
    });
  }

  /** The Eraser turns to face WAI on the summit: the fight begins. */
  bossIntro(boss: EraserBoss): void {
    const b = boss.pos;
    const p = this.player.pos;
    const side = new THREE.Vector3(-(b.z - p.z), 0, b.x - p.x).normalize();
    this.ctx.camera.playCine([
      { pos: p.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(side, 2).add(b.clone().sub(p).multiplyScalar(-0.15)), look: b.clone().add(new THREE.Vector3(0, 2.5, 0)), dur: 1.4, fov: 44, toFov: 36, handheld: 0.05 },
    ]);
    this.ctx.audio.play('roar', { pos: b, pitch: 0.9, vol: 1 });
    this.ctx.camera.shake = 1;
    this.caption('THE ERASER', true);
    setTimeout(() => this.caption(null), 2200);
  }

  /** A mid-boss turns to face WAI (level-1 expansion: the Red Inkwell): a quick title card. */
  midBossIntro(at: THREE.Vector3, title: string): void {
    const p = this.player.pos;
    const flat = Math.hypot(p.x - at.x, p.z - at.z);
    // WAI right beside it or on its head: frame it from 8 m out at eye height (an over-the-shoulder shot from up
    // there looked straight down through WAI at its lid)
    const shot =
      flat < 4 || p.y > at.y + 2
        ? (() => {
            const out = flat > 0.2 ? new THREE.Vector3(p.x - at.x, 0, p.z - at.z).normalize() : new THREE.Vector3(1, 0, 0);
            return { pos: at.clone().addScaledVector(out, 8).add(new THREE.Vector3(0, 2.6, 0)), look: at.clone().add(new THREE.Vector3(0, 2, 0)) };
          })()
        : (() => {
            const side = new THREE.Vector3(-(at.z - p.z), 0, at.x - p.x).normalize();
            return { pos: p.clone().add(new THREE.Vector3(0, 1.8, 0)).addScaledVector(side, 2.2).add(at.clone().sub(p).multiplyScalar(-0.2)), look: at.clone().add(new THREE.Vector3(0, 2, 0)) };
          })();
    this.ctx.camera.playCine([{ ...shot, dur: 1.5, fov: 46, toFov: 38, handheld: 0.05 }]);
    this.ctx.audio.play('roar', { pos: at, pitch: 1.4, vol: 0.9 });
    this.ctx.camera.shake = 0.6;
    this.caption(title, true);
    setTimeout(() => this.caption(null), 2200);
  }

  /**
   * The Red Pen's ink is gone (the Inkwell is repainted): the cross on the sky unravels over the
   * quarter, then the camera flies to the Blind Statue and the cross over its eye washes away.
   */
  inkWashed(skyAt: THREE.Vector3, statueEye: THREE.Vector3, onStatue: () => void): void {
    const look = statueEye.clone();
    const back = new THREE.Vector3(look.x + 7, look.y + 2.5, look.z + 7);
    this.ctx.camera.playCine([
      { pos: skyAt.clone().add(new THREE.Vector3(-14, -6, 16)), look: skyAt.clone(), toPos: skyAt.clone().add(new THREE.Vector3(-12, -7, 14)), dur: 2.2, fov: 52, toFov: 46 },
      { pos: back, look, toPos: back.clone().lerp(look, 0.3), dur: 2.6, fov: 44, toFov: 38, handheld: 0.03 },
    ]);
    this.caption('The Red Pen’s ink is washed out of the quarter!', true);
    setTimeout(() => {
      onStatue();
      this.caption('…and off the Blind Statue’s eye.', true);
    }, 2400);
    setTimeout(() => this.caption(null), 5600);
  }

  /** Repainted: it shrinks into a little pink eraser; the city opens its eyes. */
  finale(boss: EraserBoss, onDone: () => void): void {
    const b = boss.pos.clone();
    this.ctx.camera.playCine([
      { pos: b.clone().add(new THREE.Vector3(5, 3, 7)), look: b.clone().add(new THREE.Vector3(0, 1.5, 0)), toPos: b.clone().add(new THREE.Vector3(3.5, 2, 5)), dur: 2.4, fov: 42, toFov: 36 },
      { pos: b.clone().add(new THREE.Vector3(0, 22, 26)), look: new THREE.Vector3(-5, 4, 0), dur: 3.0, fov: 60, toFov: 54 },
    ]);
    this.caption('The Eraser is repainted!', true);
    setTimeout(() => {
      this.caption('Blind Plaza can SEE again. The tower door is open.', true);
      onDone();
    }, 2600);
    setTimeout(() => this.caption(null), 7000);
  }

  update(dt: number): void {
    if (this.running) {
      this.t += dt;
      for (const b of this.beats)
        if (!b.done && this.t >= b.at) {
          b.done = true;
          b.fn();
        }
      this.pencilAnim?.(dt, this.t);
    }
    this.anims = this.anims.filter((a) => !a(dt));
  }
}

/** WAI's silhouette seen from above (convex hull of the model + cape), plus his crown ring, as a pencil path. */
function topDownOutline(root: THREE.Object3D, y: number): THREE.Vector3[] {
  root.updateMatrixWorld(true);
  const pts: [number, number][] = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.isOutline) return;
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const step = Math.max(1, Math.floor(pos.count / 1500));
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i);
      if ((m as THREE.SkinnedMesh).isSkinnedMesh) (m as THREE.SkinnedMesh).applyBoneTransform(i, v);
      v.applyMatrix4(m.matrixWorld);
      pts.push([v.x, v.z]);
    }
  });
  if (pts.length < 3) return [new THREE.Vector3(0, y, 0)];
  // monotone-chain convex hull
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  const cx = hull.reduce((s, p) => s + p[0], 0) / hull.length;
  const cz = hull.reduce((s, p) => s + p[1], 0) / hull.length;
  // a hand-drawn line: slightly wobbly, overshoots its start
  const out: THREE.Vector3[] = [];
  const seg = (a: [number, number], b: [number, number]) => {
    const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.05));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
      const wob = Math.sin(out.length * 0.7) * 0.012;
      out.push(new THREE.Vector3(cx + (x - cx) * 1.15 + wob, y, cz + (z - cz) * 1.15 - wob));
    }
  };
  for (let i = 0; i < hull.length; i++) seg(hull[i], hull[(i + 1) % hull.length]);
  seg(hull[0], hull[1]);
  // the crown ring on top of his head
  for (let k = 0; k <= 28; k++) {
    const a = (k / 28) * Math.PI * 2.15;
    const r = 0.17 + (k % 4 === 0 ? 0.05 : 0);
    out.push(new THREE.Vector3(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r));
  }
  return out;
}

/** A graphite ribbon laid along a path, revealed progressively. */
function makeStroke(path: THREE.Vector3[]): { mesh: THREE.Mesh; drawTo(k: number): THREE.Vector3; settle(): void; fade(dt: number): void } {
  const W = 0.032;
  const P: number[] = [];
  const I: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    const d = new THREE.Vector3().subVectors(b, a).setY(0).normalize();
    const n = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(W * (0.8 + 0.4 * Math.sin(i * 0.3)));
    P.push(path[i].x + n.x, path[i].y, path[i].z + n.z, path[i].x - n.x, path[i].y, path[i].z - n.z);
    if (i < path.length - 1) {
      const k = i * 2;
      I.push(k, k + 1, k + 2, k + 2, k + 1, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I);
  g.setDrawRange(0, 0);
  // graphite lying ON the planks: depth-tested (the pencil and WAI occlude it), lit (shadows fall on it),
  // pulled toward the camera a touch so the painted plank relief never swallows it
  const mat = new THREE.MeshStandardMaterial({ color: '#2b2730', roughness: 0.45, metalness: 0.35, transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  mesh.userData.noPaint = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    drawTo(k: number) {
      const n = Math.max(1, Math.min(path.length - 1, Math.floor(k * (path.length - 1))));
      g.setDrawRange(0, n * 6);
      return path[n];
    },
    /** once WAI stands in it, the line sits on the dock instead of over him */
    settle() {
      /* already sits on the dock */
    },
    fade(dt: number) {
      mat.opacity = Math.max(0, mat.opacity - dt * 0.35);
    },
  };
}
