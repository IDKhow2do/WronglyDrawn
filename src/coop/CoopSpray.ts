/**
 * [INPUT]: depends on GameContext (physics raycasts, effects, audio); isDamageable from combat/Damage; SPRAY from
 *          weapon/WeaponSystem; CoopMoves.cap from ./Moves; paintDone from ./FightLedger; SprayFx from render/SprayFx
 * [OUTPUT]: exports CoopSpray (her pooled paint stream) and PIP_SPRAY (its numbers)
 * [POS]: the partner's main damage source. Companion owns one; each creature hit reports the paint it really took
 *        off through onHitEnemy, which Coop.ts forwards to the fight ledger (her damage share).
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GameContext } from '../core/Context';
import { isDamageable } from '../combat/Damage';
import { SPRAY } from '../weapon/WeaponSystem';
import { CoopMoves } from './Moves';
import { SprayFx } from '../render/SprayFx';
import { paintDone } from './FightLedger';

/** Pip's paint: same liquid-paint rules as WAI's can, a thinner stream and a fraction of the repaint power. */
export const PIP_SPRAY = {
  rate: 30, // droplets/s (WAI: 84)
  /** repaint per droplet: ~23 % of WAI's can per second — it helps, WAI still carries the fight */
  repaint: SPRAY.repaint * 0.65,
  speed: 15,
  drag: 1.3,
  gravity: 6,
  life: 0.62,
  spread: 0.06,
};

/** Droplets in flight (~19 live at 30/s) + mist / landing bursts: 96 instances in all, as before. */
const MAX = 64;
const MAX_PUFFS = 32;

interface Drop {
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  live: boolean;
}

/** Mist at the nozzle, or the burst where a droplet lands. */
interface Puff {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  life: number;
  size: number;
  splat: boolean;
  seed: number;
  live: boolean;
}

const WHITE = new THREE.Color('#ffffff');

/**
 * Pip's spray stream: pooled droplets (no per-frame allocation), raycast each step, drawn by one
 * SprayFx batch (inked streaks, a little mist cone, a burst where each droplet lands);
 * hits a creature → real repaint damage (EnemyBase.applyDamage, kind 'paint') + paint
 * on its body; hits the world → a real paint splat (Effects.splat), same as WAI's.
 */
export class CoopSpray {
  private drops: Drop[] = [];
  private puffs: Puff[] = [];
  private head = 0;
  private puffHead = 0;
  private acc = 0;
  private puffAcc = 0;
  private fx = new SprayFx(MAX + MAX_PUFFS);
  private step = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private color: THREE.Color;
  private mistColor: THREE.Color;
  /** total repaint dealt (stats / tests) */
  damageDealt = 0;
  hits = 0;
  /** a creature was hit: who, and the paint the hit really took off it (base units; aggro + damage-share bookkeeping) */
  onHitEnemy: ((owner: unknown, paint: number) => void) | null = null;

  constructor(
    private ctx: GameContext,
    private css: string,
    private skip: (c: RAPIER.Collider) => boolean,
  ) {
    this.color = new THREE.Color(css);
    this.mistColor = this.color.clone().lerp(WHITE, 0.35);
    for (let i = 0; i < MAX; i++) this.drops.push({ pos: new THREE.Vector3(), prev: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, live: false });
    for (let i = 0; i < MAX_PUFFS; i++) this.puffs.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, life: 1, size: 0.1, splat: false, seed: 0, live: false });
    ctx.root.add(this.fx.mesh);
  }

  private takePuff(): Puff {
    const p = this.puffs[this.puffHead];
    this.puffHead = (this.puffHead + 1) % MAX_PUFFS;
    p.live = true;
    p.age = 0;
    return p;
  }

  /** Emit for `dt` seconds of holding the trigger, from `muzzle` toward `target`. */
  emit(dt: number, muzzle: THREE.Vector3, target: THREE.Vector3): void {
    this.acc += dt * PIP_SPRAY.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      const d = this.drops[this.head];
      this.head = (this.head + 1) % MAX;
      // ballistic lead: aim above the target by the drop the arc will lose
      this.dir.copy(target).sub(muzzle);
      const dist = this.dir.length();
      const tFly = dist / PIP_SPRAY.speed;
      this.dir.y += 0.5 * PIP_SPRAY.gravity * tFly * tFly * 1.15 - 1.1 * tFly;
      this.dir.normalize();
      this.dir.x += (Math.random() - 0.5) * PIP_SPRAY.spread * 2;
      this.dir.y += (Math.random() - 0.5) * PIP_SPRAY.spread * 2;
      this.dir.z += (Math.random() - 0.5) * PIP_SPRAY.spread * 2;
      this.dir.normalize();
      d.pos.copy(muzzle);
      d.prev.copy(muzzle);
      d.vel.copy(this.dir).multiplyScalar(PIP_SPRAY.speed * (0.92 + Math.random() * 0.16));
      d.vel.y += 1.1;
      d.age = 0;
      d.live = true;
    }
    // a small mist cone at the nozzle (Pip's can is smaller than WAI's)
    this.puffAcc += dt * 16;
    while (this.puffAcc >= 1) {
      this.puffAcc -= 1;
      this.dir.copy(target).sub(muzzle).normalize();
      const p = this.takePuff();
      p.pos.copy(muzzle).addScaledVector(this.dir, 0.1);
      p.vel.copy(this.dir).multiplyScalar(2.5 + Math.random() * 3.5);
      p.vel.y += Math.random() * 0.3;
      p.life = 0.3 + Math.random() * 0.25;
      p.size = 0.05 + Math.random() * 0.04;
      p.splat = false;
    }
  }

  update(dt: number): void {
    const phys = this.ctx.physics;
    for (const d of this.drops) {
      if (!d.live) continue;
      d.prev.copy(d.pos);
      d.age += dt;
      d.vel.multiplyScalar(Math.exp(-PIP_SPRAY.drag * dt));
      d.vel.y -= PIP_SPRAY.gravity * dt;
      this.step.copy(d.vel).multiplyScalar(dt);
      const len = this.step.length();
      if (len > 1e-5) {
        this.tmp.copy(this.step).divideScalar(len);
        const hit = phys.raycast(d.pos, this.tmp, len, this.skip);
        if (hit) {
          this.land(d, hit.point, hit.normal, hit.collider);
          d.live = false;
          continue;
        }
      }
      d.pos.add(this.step);
      if (d.age > PIP_SPRAY.life) d.live = false;
    }
    for (const p of this.puffs) {
      if (!p.live) continue;
      p.age += dt;
      if (!p.splat) p.vel.multiplyScalar(Math.exp(-4 * dt));
      p.pos.addScaledVector(p.vel, dt);
      if (p.age > p.life) p.live = false;
    }
  }

  /** The burst where a droplet lands (the paint decal itself stays). */
  private burstAt(point: THREE.Vector3, normal: THREE.Vector3, size: number): void {
    const p = this.takePuff();
    p.pos.copy(point).addScaledVector(normal, 0.04);
    p.vel.copy(normal).multiplyScalar(0.4);
    p.life = 0.14 + Math.random() * 0.08;
    p.size = size;
    p.splat = true;
    p.seed = Math.random();
  }

  private land(d: Drop, point: THREE.Vector3, normal: THREE.Vector3, collider: RAPIER.Collider): void {
    const dir = d.vel.clone().normalize();
    const owner = this.ctx.physics.ownerOf<unknown>(collider);
    if (isDamageable(owner) && (owner as { kind?: string }).kind !== undefined) {
      // nearly repainted: the last strokes are WAI's (she never steals a finish a puzzle / a sticker depends on)
      if (((owner as { repaint?: number }).repaint ?? 0) >= 0.9 || CoopMoves.cap(owner, PIP_SPRAY.repaint) <= 0) return;
      // a creature (EnemyBase): real repaint, never boosted by WAI's Paint Time
      const before = paintDone(owner);
      const r = owner.applyDamage({ amount: PIP_SPRAY.repaint, point, dir, collider, kind: 'paint', color: this.css });
      if (r.absorbed) return;
      this.burstAt(point, normal, 0.13);
      this.damageDealt += PIP_SPRAY.repaint * (r.weak ? 2 : 1);
      this.hits++;
      this.onHitEnemy?.(owner, paintDone(owner) - before);
      if (this.hits % 4 === 0) {
        const s = this.ctx.effects.paint?.surfaceHit(point.clone().addScaledVector(dir, -0.7), dir, 1.6);
        if (s) this.ctx.effects.splat(s.point, s.normal, this.css, 0.18, dir, { drip: 0.9 });
      }
      if (this.hits % 6 === 0) this.ctx.effects.burst(point, this.css, 2, 2.2, 0.04, 12);
      if (this.hits % 5 === 0) this.ctx.audio.play('paintHit', { pos: point, vol: 0.25, pitch: 1.2 + Math.random() * 0.2 });
      return;
    }
    if (isDamageable(owner)) return; // Pip's own/WAI's proxies: no paint on friends
    const radius = 0.14 + d.age * 0.35;
    this.burstAt(point, normal, radius);
    const s = this.ctx.effects.paint?.surfaceHit(point.clone().addScaledVector(dir, -0.7), dir, 1.6);
    if (s) this.ctx.effects.splat(s.point, s.normal, this.css, radius, dir, { drip: 0.6 });
    else this.ctx.effects.splat(point, normal, this.css, radius, dir, { drip: 0.6 });
  }

  render(alpha = 1): void {
    const fx = this.fx;
    fx.begin();
    for (const p of this.puffs) {
      if (!p.live) continue;
      const t = p.age / p.life;
      if (p.splat) fx.splat(p.pos, this.color, p.size * (0.55 + 0.45 * Math.min(1, t * 4)), 0.95 * (1 - t * t), p.seed);
      else fx.mist(p.pos, p.vel, Math.min(0.4, p.vel.length() * 0.07), this.mistColor, p.size + t * 0.3, 0.32 * (1 - t) * Math.min(1, t * 10));
    }
    for (const d of this.drops) {
      if (!d.live) continue;
      const t = d.age / PIP_SPRAY.life;
      const head = this.tmp.lerpVectors(d.prev, d.pos, alpha);
      const a = 0.95 * (1 - Math.max(0, t - 0.7) * 3);
      fx.streak(head, d.vel, Math.min(1.2, d.vel.length() * 0.08), this.color, 0.02 + Math.min(1, t * 1.5) * 0.04, a);
    }
    fx.end();
  }

  dispose(): void {
    this.fx.dispose();
  }
}
