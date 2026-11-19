import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { WeaponSystem } from './WeaponSystem';
import { isDamageable } from '../combat/Damage';
import { addOutline, toon } from '../render/Materials';
import { t } from '../i18n';
import type { OrganHost } from '../hosts/OrganHost';

/**
 * THROWING — the action layer on top of spraying (G / middle mouse; touch: THROW).
 *  · Hold to CHARGE (0 → 1 in 1 s): WAI's hand glows brighter, a ring fills,
 *    the tone rises; at full charge a white flash + "ding". Release to throw.
 *  · What flies: a ROCK if he carries one (pick them up by walking over them —
 *    the Eraser's crumbs land as rocks you can throw back!), otherwise the SPRAY
 *    CAN itself. A thrown can must be picked up again before you can spray.
 *  · Damage scales with charge. A fully charged can bursts: KA-SPLASH (area paint
 *    + knockback) but empties the tank. Hitting a weak point (eyes, mouths) with
 *    any throw interrupts the attack being wound up.
 */
export const THROW = {
  chargeTime: 1.0,
  rockMin: 15,
  rockMax: 95,
  canMin: 25,
  canMax: 130,
  speedMin: 13,
  speedMax: 26,
  maxRocks: 3,
};

interface Flying {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  prev: THREE.Vector3;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  kind: 'rock' | 'can' | 'host';
  charge: number;
  life: number;
  bounced: boolean;
  host?: OrganHost;
}

interface Pickup {
  mesh: THREE.Object3D;
  pos: THREE.Vector3;
  kind: 'rock' | 'can';
  t: number;
  beacon?: THREE.Mesh;
}

export class ThrowSystem {
  charge = 0;
  charging = false;
  rocks = 0;
  private flying: Flying[] = [];
  private pickups: Pickup[] = [];
  private fullFlashed = false;
  private chargeTone = 0;
  private glow: THREE.PointLight;
  private ring: THREE.Mesh;
  /** UI / gun-model hook: the can left (or came back to) WAI's hand. */
  onCanOut: ((out: boolean) => void) | null = null;
  private lostCanT = 0;
  /** A prop held over WAI's head (bucket, cone, crate, bin…). */
  held: OrganHost | null = null;
  private liftLock = false;
  /** Hosts in the level (set by the session). */
  hostsProvider: (() => OrganHost[]) | null = null;

  constructor(
    private ctx: GameContext,
    private weapon: WeaponSystem,
  ) {
    this.glow = new THREE.PointLight('#fff2a0', 0, 3.5);
    ctx.root.add(this.glow);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40, 1, 0, 0.001), new THREE.MeshBasicMaterial({ color: '#ffd23a', transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    ctx.root.add(this.ring);
  }

  // ───────────── pickups ─────────────
  private rockMesh(): THREE.Object3D {
    // an eraser crumb (pink rubber chunk) — the Eraser drops these
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.26), toon({ color: ['#ff9ec4', '#ffc6dc', '#ffb3d1'][Math.floor(Math.random() * 3)] }));
    m.rotation.set(Math.random(), Math.random(), Math.random());
    addOutline(m, 0.025);
    m.userData.noPaint = true;
    return m;
  }

  private canMesh(): THREE.Object3D {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 14), toon({ color: this.weapon.color }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.1, 12), toon({ color: '#e8e8f0' }));
    cap.position.y = 0.26;
    const nozzle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), toon({ color: '#141014' }));
    nozzle.position.set(0, 0.33, 0.04);
    const label = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.16, 14, 1, true), toon({ color: '#fff6e0' }));
    g.add(body, cap, nozzle, label);
    addOutline(body, 0.025);
    g.traverse((o) => (o.userData.noPaint = true));
    return g;
  }

  /** Drop a throwable rock in the world (level setup, Eraser crumbs). */
  spawnRock(at: THREE.Vector3): void {
    if (this.pickups.filter((p) => p.kind === 'rock').length > 40) return;
    const mesh = this.rockMesh();
    mesh.position.copy(at).add(new THREE.Vector3(0, 0.2, 0));
    this.ctx.root.add(mesh);
    this.pickups.push({ mesh, pos: at.clone(), kind: 'rock', t: Math.random() * 6 });
  }

  private dropCan(at: THREE.Vector3): void {
    const mesh = this.canMesh();
    mesh.position.copy(at);
    this.ctx.root.add(mesh);
    // a tall glowing beacon so you always find your can again
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.3, 14, 8, 1, true), new THREE.MeshBasicMaterial({ color: this.weapon.color, transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide }));
    beacon.renderOrder = 10;
    beacon.position.copy(at).add(new THREE.Vector3(0, 7, 0));
    beacon.userData.noPaint = true;
    this.ctx.root.add(beacon);
    this.pickups.push({ mesh, pos: at.clone(), kind: 'can', t: 0, beacon });
  }

  get canOut(): boolean {
    return this.weapon.canOut;
  }

  // ───────────── per step ─────────────
  step(dt: number, player: PlayerController, canAct: boolean, aim: { origin: THREE.Vector3; dir: THREE.Vector3 }): void {
    const input = this.ctx.input;
    const down = input.isDown('KeyG') || input.isDown('Mouse1');
    const tapped = input.consumePressed('KeyG') || input.consumePressed('Mouse1');
    // pick up a prop: tap G next to it (it goes over WAI's head)
    if (canAct && tapped && !this.held && !this.charging) {
      const h = this.nearestLiftable(player);
      if (h) {
        this.held = h;
        h.setCarried(true);
        this.liftLock = true;
        player.playAction('pickup', 0.3);
        this.ctx.audio.play('pop', { pitch: 0.8 });
        this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 2.4, 0)), t('HUP!'), '#22c4c0', 0.5);
      }
    }
    if (this.liftLock && !down) this.liftLock = false;
    if (this.held) {
      // carried overhead, bobbing with WAI's steps
      const top = player.pos.clone().add(new THREE.Vector3(0, 1.2 + Math.sin(performance.now() / 120) * 0.03, 0));
      this.held.holdAt(top, player.facing);
    }
    const hasThrowable = !!this.held || this.rocks > 0 || !this.weapon.canOut;
    if (canAct && down && hasThrowable && !this.liftLock) {
      if (!this.charging) {
        this.charging = true;
        this.charge = 0;
        this.fullFlashed = false;
        this.chargeTone = 0;
      }
      this.charge = Math.min(1, this.charge + dt / THROW.chargeTime);
      this.chargeTone -= dt;
      if (this.chargeTone <= 0 && this.charge < 1) {
        this.chargeTone = 0.12;
        this.ctx.audio.play('select', { pitch: 0.8 + this.charge * 1.4, vol: 0.35 });
      }
      if (this.charge >= 1 && !this.fullFlashed) {
        this.fullFlashed = true;
        this.ctx.audio.play('reveal', { pitch: 2, vol: 0.7 });
        this.ctx.effects.burst(player.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#ffffff', 14, 3, 0.05, -1);
        this.ctx.combat.impact(0.25);
      }
    } else if (this.charging) {
      this.charging = false;
      if (canAct && hasThrowable) this.throwNow(player, aim);
      this.charge = 0;
    }
    // charge visuals
    const hand = player.pos.clone().add(new THREE.Vector3(0, 0.9, 0)).addScaledVector(player.forward(), 0.3);
    this.glow.position.copy(hand);
    const pulse = this.charge >= 1 ? 0.7 + Math.sin(performance.now() / 50) * 0.3 : this.charge;
    this.glow.intensity = this.charging ? 2 + pulse * 10 : 0;
    this.ring.visible = this.charging;
    if (this.charging) {
      this.ring.position.copy(player.pos).add(new THREE.Vector3(0, 0.06, 0));
      this.ring.geometry.dispose();
      this.ring.geometry = new THREE.RingGeometry(0.55, 0.68, 40, 1, Math.PI / 2, Math.max(0.001, this.charge * Math.PI * 2));
      (this.ring.material as THREE.MeshBasicMaterial).color.set(this.charge >= 1 ? '#ffffff' : '#ffd23a');
      if (Math.random() < this.charge * 0.6) this.ctx.effects.sparkle(hand, this.charge >= 1 ? '#ffffff' : '#ffd23a', 1);
    }
    this.simulate(dt, player);
    // pickups: walk over them
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.mesh.position.y = p.pos.y + 0.18 + Math.sin(p.t * 3) * 0.06;
      p.mesh.rotation.y += dt * 1.5;
      if (p.beacon) (p.beacon.material as THREE.MeshBasicMaterial).opacity = 0.3 + Math.sin(p.t * 4) * 0.15;
      const d = player.pos.distanceTo(p.pos);
      const want = p.kind === 'can' || this.rocks < THROW.maxRocks;
      if (want && d < (p.kind === 'can' ? 1.4 : 1.0)) {
        this.ctx.root.remove(p.mesh);
        if (p.beacon) this.ctx.root.remove(p.beacon);
        this.pickups.splice(i, 1);
        if (p.kind === 'rock') {
          this.rocks++;
          this.ctx.audio.play('pop', { pitch: 1.6, vol: 0.5 });
        } else {
          this.weapon.canOut = false;
          this.onCanOut?.(false);
          this.ctx.audio.play('stick', { pitch: 1.3 });
          this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('GOT IT!'), '#22c4c0', 0.6);
        }
      }
    }
    // a can lying out of reach (on a roof, in a gap, too far) or left for long comes home on its own:
    // after 12 s, or 4 s if it's well above / below WAI or far away, or the R key (recall) is held
    const can = this.pickups.find((p) => p.kind === 'can');
    if (can) {
      const dy = Math.abs(can.pos.y - player.pos.y);
      const far = can.pos.distanceTo(player.pos);
      const stuck = dy > 2.2 || far > 28;
      if (can.t > 12 || (stuck && can.t > 4)) {
        this.ctx.effects.burst(can.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), this.weapon.color, 10, 3, 0.06);
        this.ctx.root.remove(can.mesh);
        if (can.beacon) this.ctx.root.remove(can.beacon);
        this.pickups.splice(this.pickups.indexOf(can), 1);
        this.weapon.canOut = false;
        this.onCanOut?.(false);
        this.ctx.audio.play('reveal', { pitch: 1.4 });
        this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), t('CAN REDRAWN!'), '#22c4c0', 0.6);
      }
    }
    // a can lost off the island is redrawn into WAI's hand after a moment
    if (this.weapon.canOut && !this.flying.some((f) => f.kind === 'can') && !this.pickups.some((p) => p.kind === 'can')) {
      this.lostCanT += dt;
      if (this.lostCanT > 1.5) {
        this.lostCanT = 0;
        this.weapon.canOut = false;
        this.onCanOut?.(false);
        this.ctx.audio.play('reveal', { pitch: 1.4 });
      }
    } else this.lostCanT = 0;
  }

  private nearestLiftable(player: PlayerController): OrganHost | null {
    let best: OrganHost | null = null;
    let bd = 1.9;
    for (const h of this.hostsProvider?.() ?? []) {
      if (!h.liftable || h.carried) continue;
      const d = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z) - Math.max(h.def.half.x, h.def.half.z);
      if (d < bd && Math.abs(h.pos.y - player.pos.y) < 1.2) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  /** What G would do right now (for the HUD prompt). */
  canLiftNear(player: PlayerController): OrganHost | null {
    return this.held ? null : this.nearestLiftable(player);
  }

  private throwNow(player: PlayerController, aim: { origin: THREE.Vector3; dir: THREE.Vector3 }): void {
    const kind: 'rock' | 'can' | 'host' = this.held ? 'host' : this.rocks > 0 ? 'rock' : 'can';
    const c = this.charge;
    const host = this.held;
    if (kind === 'host') this.held = null;
    else if (kind === 'rock') this.rocks--;
    else {
      this.weapon.canOut = true;
      this.onCanOut?.(true);
    }
    const start = player.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(player.forward(), 0.35);
    // aim at what's under the crosshair, with a gentle lob
    const hit = this.ctx.physics.raycast(aim.origin, aim.dir, 60, (col) => col.handle !== player.collider.handle);
    const target = hit ? hit.point : aim.origin.clone().addScaledVector(aim.dir, 40);
    const speed = THREE.MathUtils.lerp(THROW.speedMin, THROW.speedMax, c);
    const to = target.clone().sub(start);
    const flat = Math.hypot(to.x, to.z);
    const tFlight = Math.max(0.15, flat / speed);
    const vel = new THREE.Vector3(to.x / tFlight, to.y / tFlight + 0.5 * 20 * tFlight, to.z / tFlight);
    if (vel.length() > speed * 1.6) vel.setLength(speed * 1.6);
    const mesh = kind === 'host' ? host!.root : kind === 'rock' ? this.rockMesh() : this.canMesh();
    if (kind === 'host') {
      // heavier things fly slower and lower
      const heavy = host!.def.size === 'medium' ? 0.75 : 0.95;
      vel.multiplyScalar(heavy);
      start.y = player.pos.y + 1.2;
    } else {
      mesh.position.copy(start);
      this.ctx.root.add(mesh);
    }
    this.flying.push({ mesh, pos: start.clone(), prev: start.clone(), vel, spin: new THREE.Vector3(Math.random() * 10, 12 + c * 18, Math.random() * 6), kind, charge: c, life: 4, bounced: false, host: host ?? undefined });
    player.faceDir(new THREE.Vector3(to.x, 0, to.z));
    player.playAction('throw', 0.35);
    this.ctx.audio.play('throwSticker', { pitch: 1.1 - c * 0.4, vol: 0.6 + c * 0.4 });
    this.ctx.audio.play('whoosh', { pitch: 1.6 - c * 0.6, vol: 0.4 + c * 0.4 });
    this.ctx.camera.recoil(0.02 + c * 0.04);
    if (c >= 1) this.ctx.camera.fovPunch = Math.max(this.ctx.camera.fovPunch, 3);
  }

  private simulate(dt: number, player: PlayerController): void {
    const skip = (col: RAPIER.Collider) => col.handle !== player.collider.handle && this.ctx.physics.tagOf(col) !== 'water';
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.prev.copy(f.pos);
      f.vel.y -= 20 * dt;
      f.life -= dt;
      const step = f.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const hit = len > 1e-5 ? this.ctx.physics.raycast(f.pos, step.clone().divideScalar(len), len + 0.15, skip) : null;
      if (hit) {
        const owner = this.ctx.physics.ownerOf<unknown>(hit.collider);
        if (isDamageable(owner) && !f.bounced) this.hitTarget(f, owner, hit.point, hit.collider);
        else if (f.kind === 'can' && f.charge >= 0.95 && !f.bounced) this.burst(f, hit.point, hit.normal);
        // bounce off and settle
        f.bounced = true;
        f.pos.copy(hit.point).addScaledVector(hit.normal, 0.2);
        f.vel.reflect(hit.normal).multiplyScalar(0.35);
        if (hit.normal.y > 0.6 && f.vel.length() < 3) {
          this.land(f, hit.point);
          this.flying.splice(i, 1);
          continue;
        }
      } else f.pos.add(step);
      if (f.host) f.host.holdAt(f.pos.clone().sub(new THREE.Vector3(0, f.host.def.half.y, 0)), f.host.yaw + f.spin.y * dt * 0.3);
      else {
        f.mesh.position.copy(f.pos);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.y += f.spin.y * dt;
      }
      // full-charge trail
      if (f.charge >= 0.95 && !f.bounced && Math.random() < 0.8) this.ctx.effects.sparkle(f.pos.clone(), f.kind === 'can' ? this.weapon.color : '#ffffff', 1);
      if (f.life <= 0 || f.pos.y < -14) {
        if (f.host) {
          // fell off the island: it pops back where it lived
          f.host.setCarried(false);
          f.host.holdAt(f.host.home.clone(), f.host.yaw);
        } else this.ctx.root.remove(f.mesh);
        this.flying.splice(i, 1);
      }
    }
  }

  private hitTarget(f: Flying, target: import('../combat/Damage').Damageable, point: THREE.Vector3, collider: RAPIER.Collider): void {
    const c = f.charge;
    const big = f.host?.def.size === 'medium';
    const dmg =
      (f.kind === 'host'
        ? THREE.MathUtils.lerp(big ? 45 : 25, big ? 160 : 110, c)
        : f.kind === 'rock'
          ? THREE.MathUtils.lerp(THROW.rockMin, THROW.rockMax, c)
          : THREE.MathUtils.lerp(THROW.canMin, THROW.canMax, c)) * this.ctx.combat.paintMul;
    const dir = f.vel.clone().normalize();
    const r = target.applyDamage({ amount: dmg, point, dir, collider, kind: 'crash', color: '#ffd23a' });
    if (r.absorbed) return;
    const k = target as unknown as { knock?: (d: THREE.Vector3, s: number) => void; bigness?: number; interruptBy?: (weak: boolean) => void };
    k.knock?.(dir, (2 + c * 8) * (1 - (k.bigness ?? 0) * 0.6));
    // a throw on a weak point stops the attack being wound up (Zelda-style counter)
    k.interruptBy?.(r.weak);
    this.ctx.events.emit('hit:marker', { weak: r.weak, finished: !!r.finished });
    this.ctx.effects.burst(point, f.kind === 'can' ? this.weapon.color : '#ffc6dc', 8 + Math.round(c * 14), 3 + c * 4, 0.07);
    this.ctx.effects.comic(point.clone().add(new THREE.Vector3(0, 0.6, 0)), t(c >= 0.95 ? 'WHAM!!' : r.weak ? 'BONK!' : 'THUNK!'), c >= 0.95 ? '#ff4fa3' : '#ffd23a', 0.6 + c * 0.5);
    this.ctx.audio.play('crash', { pos: point, vol: 0.4 + c * 0.6, pitch: 1.3 - c * 0.4 });
    this.ctx.time.hitstop(0.04 + c * 0.1);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.2 + c * 0.6);
    if (c >= 0.95) this.ctx.combat.impact(0.7);
    if (f.kind === 'can' && c >= 0.95) this.burst(f, point, dir.clone().negate());
  }

  private burst(f: Flying, point: THREE.Vector3, normal: THREE.Vector3): void {
    // the can bursts: everything around gets painted, the tank is spent
    this.weapon.bombImpact(point, normal, f.vel.clone().normalize(), this.weapon.color);
    this.weapon.tank = 0;
  }

  private land(f: Flying, at: THREE.Vector3): void {
    if (f.host) {
      // the prop lands and stays there — with whatever organs it carries
      f.host.holdAt(at.clone(), f.host.yaw);
      f.host.setCarried(false);
      this.ctx.audio.play('crateStep', { pos: at, pitch: 0.8 });
      this.ctx.effects.burst(at.clone().add(new THREE.Vector3(0, 0.2, 0)), '#e8d8c8', 8, 2.5, 0.06);
      return;
    }
    this.ctx.root.remove(f.mesh);
    if (f.kind === 'can') this.dropCan(at);
    else this.spawnRock(at);
  }

  clear(): void {
    for (const f of this.flying) this.ctx.root.remove(f.mesh);
    for (const p of this.pickups) {
      this.ctx.root.remove(p.mesh);
      if (p.beacon) this.ctx.root.remove(p.beacon);
    }
    this.flying = [];
    this.pickups = [];
    this.ctx.root.remove(this.glow, this.ring);
  }
}
