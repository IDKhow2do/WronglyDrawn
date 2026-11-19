import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { RAPIER } from '../core/PhysicsWorld';
import type { Edible, Eater } from '../hosts/Edible';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { buildCheckpointModel, crownModel, paintDropModel } from './PropModels';

/** Odyssey-style collectible: a golden graffiti crown. */
export class Crown {
  readonly root = new THREE.Group();
  collected = false;
  /** Hidden crowns are invisible & uncollectable until revealed. */
  hidden = false;
  private t = Math.random() * 6;
  private glow: THREE.Mesh;

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly pos: THREE.Vector3,
    readonly hint: string,
  ) {
    this.root.add(crownModel(ctx.assets, 0.56, PAL.yellow));
    this.glow = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.55, 24), new THREE.MeshBasicMaterial({ color: PAL.yellow, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    this.root.add(this.glow);
    this.root.position.copy(pos);
    ctx.root.add(this.root);
  }

  update(dt: number, camPos: THREE.Vector3): void {
    this.t += dt;
    this.root.visible = !this.collected && !this.hidden;
    this.root.position.y = this.pos.y + Math.sin(this.t * 2) * 0.12;
    this.root.rotation.y = this.t * 1.6;
    this.glow.lookAt(camPos);
    this.glow.scale.setScalar(1 + Math.sin(this.t * 4) * 0.15);
  }

  tryCollect(feet: THREE.Vector3): boolean {
    if (this.collected || this.hidden) return false;
    const c = feet.clone().add(new THREE.Vector3(0, 0.6, 0));
    if (c.distanceTo(this.pos) > 1.1) return false;
    this.collected = true;
    this.ctx.effects.burst(this.pos, PAL.yellow, 24, 4.5, 0.08);
    this.ctx.effects.ring(this.pos, PAL.yellow, 3, new THREE.Vector3(0, 1, 0));
    this.ctx.audio.play('crown');
    this.ctx.audio.duck(0.3, 1.4);
    return true;
  }
}

/** Paint drop: coin-like pickup that heals half a heart. Mouths can eat them too. */
let glowTex: THREE.CanvasTexture | null = null;
function glow(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,0.9)');
  rg.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/**
 * Paint drop — the small reward. A glossy droplet of fresh paint with a soft
 * glow and a twinkle, bobbing and spinning. Drifts to WAI when he is close.
 * Heals ½ heart; every 15 unlock a new spray colour.
 */
export class PaintDrop implements Edible {
  readonly root = new THREE.Group();
  collected = false;
  disposed = false;
  radius = 0.3;
  eatableBy: Eater[] = ['wai', 'small', 'medium', 'large'];
  private t = Math.random() * 6;
  private drop: THREE.Object3D;
  private halo: THREE.Sprite;
  private cur = new THREE.Vector3();
  readonly color: string;
  /** Called when collected or eaten. */
  onTake: ((d: PaintDrop, by: Eater | 'touch') => void) | null = null;
  /** Magnet Pulse: flies to WAI from anywhere. */
  pullTo = 0;

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly pos: THREE.Vector3,
    color: string,
  ) {
    this.color = color;
    this.root.userData.noPaint = true;
    this.drop = paintDropModel(ctx.assets, color);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow(), color, transparent: true, opacity: 0.55, depthWrite: false }));
    this.halo.scale.setScalar(0.9);
    this.root.add(this.halo, this.drop);
    this.cur.copy(pos);
    this.root.position.copy(pos);
    ctx.root.add(this.root);
  }

  position(): THREE.Vector3 {
    return this.cur;
  }

  eat(by: Eater): boolean {
    if (this.collected) return false;
    this.take(by);
    return true;
  }

  private take(by: Eater | 'touch'): void {
    this.collected = true;
    this.disposed = true;
    this.root.visible = false;
    this.ctx.effects.burst(this.cur, this.color, 10, 2.5, 0.05, -2);
    this.ctx.effects.ring(this.cur, this.color, 1.2);
    this.onTake?.(this, by);
  }

  update(dt: number, feet: THREE.Vector3): void {
    if (this.collected) return;
    this.t += dt;
    const chest = feet.clone().add(new THREE.Vector3(0, 0.55, 0));
    const d = chest.distanceTo(this.cur);
    if (this.pullTo) this.cur.lerp(chest, Math.min(1, dt * (4 + 30 / Math.max(1, d))));
    else if (d < 3.2) {
      // magnet: drifts to WAI, faster as it gets close
      this.cur.lerp(chest, Math.min(1, dt * (2 + (3.2 - d) * 4)));
    }
    this.root.position.set(this.cur.x, this.cur.y + Math.sin(this.t * 3) * 0.08, this.cur.z);
    this.drop.rotation.y += dt * 2.4;
    const tw = 0.5 + Math.sin(this.t * 5) * 0.15;
    this.halo.material.opacity = tw;
    this.halo.scale.setScalar(0.8 + Math.sin(this.t * 2.2) * 0.12);
    if (d < 0.7) this.take('touch');
  }
}

/** Spray-can checkpoint: respawn point + full heal. */
export class Checkpoint {
  readonly root = new THREE.Group();
  active = false;
  private cap: THREE.Object3D;
  private capY: number;
  private ring: THREE.Mesh | null = null;
  private t = 0;
  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly pos: THREE.Vector3,
    readonly yaw: number,
  ) {
    const glb = ctx.assets.instantiateModel('checkpointCan', { pivot: 'bottom' });
    if (glb) {
      // Tripo can: no separate nozzle, so "active" is shown by a pulsing pink ring on the ground
      this.cap = new THREE.Object3D();
      this.capY = 0;
      this.root.add(glb);
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.95, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.hotpink, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      this.ring.position.y = 0.04;
      this.ring.userData.noPaint = true;
      this.root.add(this.ring);
    } else {
      const m = buildCheckpointModel();
      this.cap = m.cap;
      this.capY = m.capY;
      this.root.add(m.root);
    }
    this.root.position.copy(pos);
    ctx.root.add(this.root);
  }

  private near = false;

  /** 'first' = just activated · 'revisit' = walked back to an active one (it becomes the respawn point again) · null */
  update(dt: number, feet: THREE.Vector3): 'first' | 'revisit' | null {
    this.t += dt;
    if (this.active) {
      const capMat = (this.cap as THREE.Mesh).material as THREE.MeshToonMaterial | undefined;
      capMat?.color.set(PAL.hotpink);
      this.cap.position.y = this.capY + Math.abs(Math.sin(this.t * 3)) * 0.05;
      if (this.ring) {
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.t * 3) * 0.2;
        this.ring.scale.setScalar(1 + Math.sin(this.t * 3) * 0.06);
      }
    }
    const d = feet.distanceTo(this.pos);
    const wasNear = this.near;
    this.near = d < (this.near ? 6 : 5); // generous: walking past it counts (hysteresis: no flicker)
    if (!this.near || wasNear) return null;
    if (!this.active) {
      this.active = true;
      this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), PAL.hotpink, 18, 3.5);
      this.ctx.audio.play('checkpoint', { pos: this.pos });
      return 'first';
    }
    this.ctx.audio.play('checkpoint', { pos: this.pos, vol: 0.35, pitch: 1.3 });
    return 'revisit';
  }
}

/**
 * Eraser rubble chunk: a static obstacle that mouths can eat (WAI needs a few
 * bites) and a charging mutant can smash.
 */
export class Rubble implements Edible {
  readonly mesh: THREE.Mesh;
  disposed = false;
  radius: number;
  eatableBy: Eater[] = ['wai', 'medium', 'large'];
  private bites = 3;
  onGone: (() => void) | null = null;

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly center: THREE.Vector3,
    readonly half: THREE.Vector3,
    private collider: RAPIER.Collider,
  ) {
    this.radius = Math.max(half.x, half.z) + 0.3;
    this.mesh = paintedMesh(wonkyBox(half.x * 2, half.y * 2, half.z * 2, 0.12, Math.floor(center.x * 31)), toon({ color: '#ffb3d1', map: ctx.assets.tex('stone_cream') }), 0.05);
    this.mesh.position.copy(center);
    this.mesh.rotation.y = Math.random() * 0.5;
    ctx.root.add(this.mesh);
    // eraser crumbs on top
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.25), toon({ color: '#ff9ec4' }));
      c.position.set((Math.random() - 0.5) * half.x * 1.5, half.y + 0.05, (Math.random() - 0.5) * half.z * 1.5);
      c.rotation.y = Math.random() * 3;
      this.mesh.add(c);
    }
  }

  position(): THREE.Vector3 {
    return this.center;
  }

  eat(by: Eater): boolean {
    if (this.disposed) return false;
    this.bites -= by === 'wai' ? 1 : 3;
    this.ctx.effects.burst(this.center.clone().add(new THREE.Vector3(0, this.half.y, 0)), '#ffb3d1', 10, 3);
    this.mesh.scale.multiplyScalar(0.85);
    if (this.bites <= 0) this.smash();
    return true;
  }

  smash(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ctx.physics.untag(this.collider);
    this.ctx.physics.world.removeCollider(this.collider, false);
    this.ctx.root.remove(this.mesh);
    this.ctx.effects.burst(this.center, '#ffb3d1', 30, 6, 0.12);
    this.ctx.audio.play('crumble', { pos: this.center });
    this.onGone?.();
  }
}

/**
 * Graffiti tag spot: a dashed outline on a wall. Spray paint into it until it's
 * covered — then the drawing comes alive (what you paint becomes real).
 */
export class TagSpot {
  readonly root = new THREE.Group();
  done = false;
  progress = 0;
  private outline: THREE.Mesh;
  private art: THREE.Mesh;
  private t = 0;
  private checkT = 0;
  onDone: ((t: TagSpot) => void) | null = null;

  constructor(
    private ctx: GameContext,
    readonly id: string,
    readonly center: THREE.Vector3,
    readonly normal: THREE.Vector3,
    readonly w: number,
    readonly h: number,
    kind: 'ladder' | 'crown' | 'eye',
    private need = 55,
  ) {
    const mk = (draw: (g: CanvasRenderingContext2D, W: number, H: number) => void) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = Math.round((256 * h) / w);
      const g = c.getContext('2d')!;
      draw(g, c.width, c.height);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    };
    const outlineMat = mk((g, W, H) => {
      g.setLineDash([16, 12]);
      g.lineWidth = 8;
      g.strokeStyle = '#fff8ee';
      g.strokeRect(6, 6, W - 12, H - 12);
      g.setLineDash([]);
      g.globalAlpha = 0.55;
      this.drawArt(g, W, H, kind, '#fff8ee', true);
    });
    const artMat = mk((g, W, H) => this.drawArt(g, W, H, kind, PAL.yellow, false));
    this.outline = new THREE.Mesh(new THREE.PlaneGeometry(w, h), outlineMat);
    this.art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat);
    this.art.visible = false;
    this.root.add(this.outline, this.art);
    this.root.position.copy(center).addScaledVector(normal, 0.03);
    this.root.lookAt(center.clone().add(normal));
    ctx.root.add(this.root);
  }

  private drawArt(g: CanvasRenderingContext2D, W: number, H: number, kind: string, col: string, sketch: boolean): void {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = sketch ? col : PAL.black;
    g.lineWidth = sketch ? 5 : 14;
    if (kind === 'ladder') {
      const pass = (stroke: string, lw: number) => {
        g.strokeStyle = stroke;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(W * 0.22, H * 0.04);
        g.lineTo(W * 0.24, H * 0.98);
        g.moveTo(W * 0.78, H * 0.03);
        g.lineTo(W * 0.76, H * 0.98);
        for (let i = 1; i < 6; i++) {
          const y = (H * i) / 6;
          g.moveTo(W * 0.23, y);
          g.lineTo(W * 0.77, y + (i % 2 ? 6 : -4));
        }
        g.stroke();
      };
      if (sketch) pass(col, 5);
      else {
        pass(PAL.black, 22);
        pass(PAL.orange, 12);
      }
    } else if (kind === 'crown') {
      const pts: [number, number][] = [[0.1, 0.85], [0.14, 0.2], [0.33, 0.55], [0.5, 0.1], [0.67, 0.55], [0.86, 0.18], [0.9, 0.85]];
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
      g.closePath();
      if (!sketch) {
        g.fillStyle = PAL.yellow;
        g.fill();
      }
      g.stroke();
    } else {
      g.beginPath();
      g.ellipse(W / 2, H / 2, W * 0.42, H * 0.3, 0, 0, Math.PI * 2);
      if (!sketch) {
        g.fillStyle = PAL.white;
        g.fill();
      }
      g.stroke();
      g.beginPath();
      g.arc(W / 2, H / 2, H * 0.16, 0, Math.PI * 2);
      if (!sketch) {
        g.fillStyle = PAL.hotpink;
        g.fill();
      }
      g.stroke();
    }
  }

  update(dt: number): void {
    this.t += dt;
    if (this.done) return;
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.3;
      const n = this.ctx.effects.coverage(this.center, Math.max(this.w, this.h) * 0.55);
      this.progress = Math.min(1, n / this.need);
      if (this.progress >= 1) this.complete();
    }
    (this.outline.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.t * 3) * 0.25;
  }

  private complete(): void {
    this.done = true;
    this.outline.visible = false;
    this.art.visible = true;
    this.ctx.effects.burst(this.center.clone().addScaledVector(this.normal, 0.4), PAL.yellow, 24, 4);
    this.ctx.effects.eraseNear(this.center, Math.max(this.w, this.h) * 0.55);
    this.ctx.audio.play('crown', { pos: this.center });
    this.onDone?.(this);
  }
}
