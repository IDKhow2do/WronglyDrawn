/**
 * [INPUT]: depends on GameContext (root, physics, effects, audio) from core/Context; depends on PlayerController.takeHit
 * [OUTPUT]: exports the Lobbed class (a pool of arcing blobs with optional landing rings)
 * [POS]: shared projectile helper for the level-1 expansion creatures (WhiteoutBottle, RedInkwell).
 *        It owns its meshes; the creature calls launch() and update() every step and clear() on finish.
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';

const G = 18;

interface Blob {
  mesh: THREE.Mesh;
  ring: THREE.Mesh | null;
  vel: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  hit: boolean;
}

export interface LobbedOpts {
  color: string;
  /** Blob radius (m). */
  size: number;
  /** Landing splash radius (m) that hurts WAI. */
  splash: number;
  /** Half hearts per hit. */
  damage: number;
  /** Draw a landing ring on the ground during the flight (the telegraph). */
  ring: boolean;
  /** Called where a blob lands (erase paint, leave a puddle…). */
  onLand?: (at: THREE.Vector3) => void;
}

/** Arcing blobs: each flies a fixed time to its target, hurts on contact or on landing. */
export class Lobbed {
  private blobs: Blob[] = [];
  private geo: THREE.SphereGeometry;
  private mat: THREE.MeshBasicMaterial;
  private ink = new THREE.MeshBasicMaterial({ color: '#141014', side: THREE.BackSide });
  private ringMat: THREE.MeshBasicMaterial;

  constructor(
    private ctx: GameContext,
    private o: LobbedOpts,
  ) {
    this.geo = new THREE.SphereGeometry(o.size, 10, 8);
    this.mat = new THREE.MeshBasicMaterial({ color: o.color });
    this.ringMat = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  }

  get active(): number {
    return this.blobs.length;
  }

  /** Throw one blob from `from` so it lands on `to` after `dur` seconds. */
  launch(from: THREE.Vector3, to: THREE.Vector3, dur: number): void {
    const m = new THREE.Mesh(this.geo, this.mat);
    const hull = new THREE.Mesh(this.geo, this.ink);
    hull.scale.setScalar(1.18);
    m.add(hull);
    m.position.copy(from);
    m.userData.noPaint = true;
    this.ctx.root.add(m);
    const vel = to.clone().sub(from).divideScalar(dur);
    vel.y += 0.5 * G * dur;
    let ring: THREE.Mesh | null = null;
    if (this.o.ring) {
      const r = this.o.splash;
      ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.78, r, 28).rotateX(-Math.PI / 2), this.ringMat.clone());
      ring.position.copy(to).add(new THREE.Vector3(0, 0.06, 0));
      ring.userData.noPaint = true;
      this.ctx.root.add(ring);
    }
    this.blobs.push({ mesh: m, ring, vel, to: to.clone(), t: 0, dur, hit: false });
  }

  update(dt: number, player: PlayerController): void {
    for (let i = this.blobs.length - 1; i >= 0; i--) {
      const b = this.blobs[i];
      b.t += dt;
      b.vel.y -= G * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.ring) {
        const k = Math.min(1, b.t / b.dur);
        b.ring.scale.setScalar(0.5 + k * 0.5);
        (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.45 * Math.abs(Math.sin(b.t * 14));
      }
      // a direct hit on the way down
      const c = player.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
      if (!b.hit && b.mesh.position.distanceTo(c) < this.o.size + 0.45 && !player.smudged) {
        b.hit = true;
        player.takeHit(b.mesh.position, this.o.damage, 5);
      }
      if (b.t < b.dur) continue;
      // landing: splash, then the creature's own mark
      const at = b.to;
      const flat = Math.hypot(player.pos.x - at.x, player.pos.z - at.z);
      if (!b.hit && flat < this.o.splash && Math.abs(player.pos.y - at.y) < 1.2 && !player.smudged) player.takeHit(at, this.o.damage, 5);
      this.ctx.effects.burst(at.clone().add(new THREE.Vector3(0, 0.15, 0)), this.o.color, 10, 3);
      this.ctx.audio.play('splat', { pos: at, vol: 0.7, pitch: 0.8 });
      this.o.onLand?.(at);
      this.remove(i);
    }
  }

  private remove(i: number): void {
    const b = this.blobs[i];
    b.mesh.removeFromParent();
    if (b.ring) {
      b.ring.removeFromParent();
      b.ring.geometry.dispose();
      (b.ring.material as THREE.Material).dispose();
    }
    this.blobs.splice(i, 1);
  }

  clear(): void {
    for (let i = this.blobs.length - 1; i >= 0; i--) this.remove(i);
  }
}
