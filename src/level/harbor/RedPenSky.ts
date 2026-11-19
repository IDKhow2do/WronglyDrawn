/**
 * [INPUT]: depends on GameContext (camera cines, events for captions, effects, audio) from core/Context;
 *          toon/paintedMesh from render/Materials
 * [OUTPUT]: exports RedPenSky (strike(), unstrike(), update(), busy) — the Red Pen's sky moment in Mute Harbor
 * [POS]: level 2's story beat for the content plan's "the Red Pen appears in the sky and crosses things out while
 *        you watch". When the Clock Tower rings, the Red Pen swoops down out of the dusk and strikes a red X over
 *        the raised Bell Bridge; the Red Gramophone's defeat unravels it. Owned by PierDirector. A short, simple
 *        beat on purpose: the full cutscene pass comes later.
 * [PROTOCOL]: Update this header on change, then check docs/level2-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../../core/Context';
import { paintedMesh, toon } from '../../render/Materials';
import { t } from '../../i18n';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** The Red Pen: a giant ballpoint, cap clipped on its back end, nib pointing down (−Y). */
function buildPen(): THREE.Group {
  const g = new THREE.Group();
  const red = toon({ color: '#e8323c' });
  const dark = toon({ color: '#8a1020' });
  const silver = toon({ color: '#e8e4f0' });
  const v2 = (x: number, y: number) => new THREE.Vector2(x, y);
  // barrel + grip + cone, one lathe (bottom → top so the faces point out)
  const prof = [v2(0.001, -3.6), v2(0.12, -3.45), v2(0.32, -3.0), v2(0.42, -2.7), v2(0.48, -2.0), v2(0.5, 2.4), v2(0.46, 2.6), v2(0.001, 2.65)];
  const body = paintedMesh(new THREE.LatheGeometry(prof, 20), red, 0.06);
  const grip = paintedMesh(new THREE.CylinderGeometry(0.53, 0.5, 1.4, 20, 1, true), dark, 0.04);
  grip.position.y = -1.3;
  const tip = paintedMesh(new THREE.ConeGeometry(0.34, 0.9, 16).rotateX(Math.PI), silver, 0.04);
  tip.position.y = -3.25;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#e8323c' }));
  ball.position.y = -3.72;
  // the cap on its back end, with a pocket clip
  const cap = paintedMesh(new THREE.CylinderGeometry(0.56, 0.56, 1.6, 20), red, 0.05);
  cap.position.y = 2.0;
  const capTop = paintedMesh(new THREE.SphereGeometry(0.56, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0.05);
  capTop.position.y = 2.8;
  const clip = paintedMesh(new THREE.BoxGeometry(0.16, 1.6, 0.12).translate(0, 1.9, 0.62), silver, 0.03);
  // two narrow, unimpressed eyes on the cap (it watches what it crosses out)
  const white = toon({ color: '#ffffff' });
  const black = new THREE.MeshBasicMaterial({ color: '#141014' });
  for (const x of [-0.22, 0.22]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
    e.scale.set(1, 0.55, 0.5);
    e.position.set(x, 2.3, 0.52);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), black);
    p.position.set(x, 2.28, 0.6);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.05, 0.05), black);
    brow.position.set(x, 2.44, 0.6);
    brow.rotation.z = x > 0 ? 0.3 : -0.3;
    g.add(e, p, brow);
  }
  g.add(body, grip, tip, ball, cap, capTop, clip);
  g.traverse((o) => (o.userData.noPaint = true));
  return g;
}

interface Stroke {
  m: THREE.Mesh;
  a: THREE.Vector3;
  b: THREE.Vector3;
  tex: THREE.Texture;
}

/** Show the first k (0..1) of a stroke: the plane grows, its texture is cropped (never squashed). */
function reveal(s: Stroke, k: number): void {
  const kk = Math.max(0.001, k);
  s.m.scale.y = kk * s.a.distanceTo(s.b);
  s.tex.repeat.set(1, kk);
}

/** One brushed red stroke along the canvas height (bottom = where the nib starts), with drips and a sheen. */
function strokeCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  const path = () => {
    g.beginPath();
    g.moveTo(64, 1000);
    g.bezierCurveTo(56, 700, 74, 330, 62, 26);
  };
  for (const [w, col, a] of [[96, '#7a0d1a', 0.55], [76, '#e8323c', 1], [18, '#ff8a8f', 0.55]] as [number, string, number][]) {
    g.globalAlpha = a;
    g.strokeStyle = col;
    g.lineWidth = w;
    path();
    g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#e8323c';
  for (let i = 0; i < 5; i++) {
    const y = 160 + i * 170;
    const x = i % 2 ? 98 : 30;
    g.fillRect(x - 5, y, 10, 30 + (i % 3) * 18);
    g.beginPath();
    g.arc(x, y + 34 + (i % 3) * 18, 8, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export class RedPenSky {
  private pen: THREE.Group;
  private t = -1;
  private mode: 'strike' | 'unstrike' | null = null;
  private strokes: Stroke[] = [];
  private from = new THREE.Vector3();
  private c = new THREE.Vector3();
  private onDone: (() => void) | null = null;

  /**
   * @param mark  the group the X is drawn into (it stays on the raised Bell Bridge until unstrike)
   * @param gate  the pier gate (the last shot of the strike looks at it swinging open)
   */
  constructor(
    private ctx: GameContext,
    private mark: THREE.Group,
    private gate: THREE.Vector3,
  ) {
    this.pen = buildPen();
    this.pen.visible = false;
    this.pen.scale.setScalar(1.2);
    ctx.root.add(this.pen);
    // the two brushed strokes of the X, in the mark's local frame (a vertical plane facing east, over the
    // channel). Each is revealed, not stretched: the plane grows and its texture is cropped to match.
    const src = strokeCanvas();
    for (const [a, b] of [[V(0, 3.6, -3.2), V(0, -3.4, 3.0)], [V(0, 3.4, 3.2), V(0, -3.6, -3.0)]] as [THREE.Vector3, THREE.Vector3][]) {
      const tex = new THREE.CanvasTexture(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1).translate(0, 0.5, 0).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      m.position.copy(a);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), b.clone().sub(a).normalize());
      m.scale.set(1, 0.001, 1);
      m.renderOrder = 3;
      m.userData.noPaint = true;
      mark.add(m);
      this.strokes.push({ m, a, b, tex });
    }
  }

  get busy(): boolean {
    return this.mode !== null;
  }

  private caption(text: string | null): void {
    this.ctx.events.emit('story:caption', { text: text && t(text), big: true });
  }

  /** The Red Pen swoops in and strikes the raised bridge out. */
  strike(onDone: () => void): void {
    this.mode = 'strike';
    this.t = 0;
    this.onDone = onDone;
    this.mark.visible = true;
    const c = this.mark.getWorldPosition(this.c);
    this.from.copy(c).add(V(-30, 34, -26));
    this.pen.position.copy(this.from);
    this.pen.visible = true;
    // a low shot from the clock square: the raised bridge against the sky, then the old pier gate
    this.ctx.camera.queueCine([
      { pos: V(c.x + 15, c.y - 0.5, c.z + 6), look: c.clone().add(V(0, 0.5, 0)), toPos: V(c.x + 13, c.y - 0.5, c.z + 5), dur: 5.6, fov: 56, toFov: 50, handheld: 0.03 },
      { pos: this.gate.clone().add(V(4, 4, 9)), look: this.gate.clone().add(V(0, 1.5, -3)), toPos: this.gate.clone().add(V(3, 3.5, 7)), dur: 2.6, fov: 50, toFov: 46 },
    ]);
  }

  /** The Gramophone is repainted: the X unravels off the bridge. */
  unstrike(onDone: () => void): void {
    this.mode = 'unstrike';
    this.t = 0;
    this.onDone = onDone;
    const c = this.mark.getWorldPosition(new THREE.Vector3());
    this.ctx.camera.playCine([{ pos: V(c.x + 15, c.y - 0.5, c.z + 6), look: c.clone().add(V(0, -1.5, 0)), toPos: V(c.x + 13, c.y - 1, c.z + 5), dur: 4.2, fov: 56, toFov: 50 }]);
  }

  /** Dev warps: the X is simply there (or gone). */
  snap(on: boolean): void {
    this.mode = null;
    this.pen.visible = false;
    this.mark.visible = on;
    for (const s of this.strokes) reveal(s, on ? 1 : 0);
  }

  update(dt: number): void {
    if (!this.mode) return;
    this.t += dt;
    const T = this.t;
    if (this.mode === 'strike') {
      // the strike starts once the clock's own shots are over (≈6.6 s): the pen waits up in the dusk
      const s = T - 6.4;
      const c = this.c;
      const st = this.strokes;
      if (s < 0) return;
      if (s < 1.3) {
        // swoop in, nib down, over the first stroke's start
        const k = THREE.MathUtils.smoothstep(s, 0, 1.3);
        const to = c.clone().add(st[0].a).add(V(0, 4.5, 0));
        this.pen.position.lerpVectors(this.from, to, k);
        this.pen.rotation.set(0, 0, (1 - k) * 1.2);
        if (s - dt < 0) {
          this.ctx.audio.play('whoosh', { pitch: 0.5, vol: 1 });
          this.caption('The RED PEN!');
        }
      } else if (s < 3.9) {
        // two strokes: the nib drags, the line grows behind it
        const i = s < 2.6 ? 0 : 1;
        const k = THREE.MathUtils.clamp((s - (i ? 2.6 : 1.3)) / 1.1, 0, 1);
        const S = st[i];
        reveal(S, k);
        const tip = S.a.clone().lerp(S.b, k).add(c);
        this.pen.position.copy(tip).add(V(0, 4.5, 0));
        this.pen.rotation.set(0, 0, 0.25 - k * 0.5);
        if (Math.floor(s * 8) !== Math.floor((s - dt) * 8)) this.ctx.audio.play('stampSlip', { pos: tip, pitch: 0.8, vol: 0.6 });
        if (i === 1 && s - dt < 2.6) this.ctx.audio.play('stampHit', { pos: tip, vol: 0.8 });
        if (i === 0 && s - dt < 1.3) this.caption('It crosses the Bell Bridge out!');
      } else if (s < 5.6) {
        // it lifts away north, toward the Hush out at sea
        const k = (s - 3.9) / 1.7;
        this.pen.position.add(V(4 * dt, (6 + k * 10) * dt, -18 * dt));
        this.pen.rotation.x = -k * 0.8;
        if (s - dt < 3.9) this.caption('…and the old pier gate swings open behind the clock tower.');
      } else {
        this.pen.visible = false;
        this.caption(null);
        this.mode = null;
        this.onDone?.();
      }
      return;
    }
    // unstrike: the strokes peel back to nothing, a burst of colour
    const k = THREE.MathUtils.clamp((T - 0.6) / 1.6, 0, 1);
    for (const s of this.strokes) reveal(s, 1 - k);
    if (T - dt < 0.6 && T >= 0.6) this.caption('The Red Pen’s X comes off the Bell Bridge!');
    if (T - dt < 2.2 && T >= 2.2) {
      const c = this.mark.getWorldPosition(new THREE.Vector3());
      for (const col of ['#ffd23a', '#1fb5b0', '#ff3fa4']) this.ctx.effects.burst(c, col, 14, 5);
      this.ctx.audio.play('reveal', { vol: 1 });
      this.mark.visible = false;
    }
    if (T > 4.4) {
      this.caption(null);
      this.mode = null;
      this.onDone?.();
    }
  }

  dispose(): void {
    this.pen.removeFromParent();
  }
}
