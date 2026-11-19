import * as THREE from 'three';
import { EnemyBase } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { buildMothLook } from './HushLook';
import { t } from '../i18n';

/**
 * HUSH MOTH — eraser dust that learned to fly. It eats sound and paint.
 *
 *   HUSHED   wrapped in a grey dust VEIL: paint just soaks in ("SHOUT FIRST!"); it flutters near home
 *   TELL     0.7 s: hovers, wings blur, a grey streak points at WAI, "shhh…"  → get out of the line
 *   DIVE     darts along the streak: a hit = −½ heart + WAI is MUFFLED (no shout for 2 s)
 *   RINGING  SHOUT at it (or bonk it with a thrown rock): the veil shatters, it tumbles, dazed, low
 *            to the ground for 4.5 s — paint it now (×1.5)
 * Repainted, it turns into a little glow moth and flutters up into the dusk.
 */
const CRUMB_MAT = new THREE.MeshStandardMaterial({ color: '#e8e2f2', roughness: 1 });

export class HushMoth extends EnemyBase {
  readonly kind = 'hushmoth';
  readonly displayName = 'Hush Moth';
  readonly bigness = 0.16;
  private model = new THREE.Group();
  private wings: THREE.Group[] = [];
  private veil: THREE.Group;
  private veilMat: THREE.MeshStandardMaterial;
  private streak: THREE.Mesh;
  private flap = Math.random() * 10;
  private alt = 2.6;
  private vel = new THREE.Vector3();
  private wander = new THREE.Vector3();
  private diveDir = new THREE.Vector3();
  private attackCd = 1.5 + Math.random() * 2;
  private absorbCd = 0;
  private hitDone = false;
  private glowT = -1;
  private tmp = new THREE.Vector3();
  /** WAI got muffled by a dive (session: no shouting for a moment). */
  onMuffle: ((sec: number) => void) | null = null;
  /** Ground under a point (the moth never sinks into it). */
  groundAt: (x: number, z: number) => number = () => this.home.y;
  /** >1 = waits longer between dives (moths guarding narrow stairs are gentler). */
  patience = 1;
  /** Solid columns it must never fly through (the lighthouse): x, z, radius, top. */
  obstacles: { x: number; z: number; r: number; top: number }[] = [];
  /** How low a dazed (ringing) moth sinks, above its ground. */
  ringLow = 1.0;
  /** Big moths (the Hush spawns these too): a little tougher. */
  readonly big: boolean;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3, opts: { leash?: number; big?: boolean } = {}) {
    super(ctx, id, start, opts.big ? 80 : 50, 0.42, 0.12);
    this.big = !!opts.big;
    this.leash = opts.leash ?? 9;
    const s = this.big ? 1.3 : 1;
    const look = buildMothLook(s, CRUMB_MAT, ctx.assets);
    this.model.add(look.body);
    this.wings = look.wings;
    this.veil = look.veil;
    this.veilMat = look.veilMat;
    this.model.add(this.veil);
    this.model.position.y = this.cOff;
    this.root.add(this.model);
    this.paintAnchor = this.model;
    // dive tell: a grey streak along the dive line
    this.streak = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7d6fb8', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.streak.userData.noPaint = true;
    this.streak.visible = false;
    ctx.root.add(this.streak);
    this.wander.copy(start);
    this.pos.y = start.y + this.alt - this.cOff;
    this.prevPos.copy(this.pos);
    this.place();
    this.setState('HUSHED');
  }

  private leash: number;

  get veiled(): boolean {
    return this.state === 'HUSHED' || this.state === 'TELL' || this.state === 'DIVE' || this.state === 'RECOVER';
  }

  /** Shouted at: the veil shatters, it tumbles dazed. */
  onShout(big: boolean, from: THREE.Vector3): void {
    if (this.harmless || this.disposed) return;
    this.ring(big ? 6 : 4.5, from);
  }

  private ring(sec: number, from: THREE.Vector3): void {
    const wasVeiled = this.veiled;
    this.setState('RINGING');
    this.ringFor = sec;
    this.streak.visible = false;
    this.veil.visible = false;
    if (!this.alerted) this.alert();
    const away = this.pos.clone().sub(from).setY(0);
    if (away.lengthSq() > 1e-4) this.vel.copy(away.normalize().multiplyScalar(4)).setY(2);
    if (wasVeiled) {
      this.ctx.effects.burst(this.pos.clone().add(this.tmp.set(0, this.cOff, 0)), '#d8d0ea', 18, 4, 0.08);
      this.ctx.effects.comic(this.pos.clone().add(this.tmp.set(0, this.cOff + 0.9, 0)), t('RINGING!'), '#5ff4e6', 0.6);
      this.ctx.audio.play('smallBell', { pos: this.pos, pitch: 1.6, vol: 0.5 });
    }
  }

  private ringFor = 4.5;

  protected override preDamage(info: DamageInfo): DamageResult | null {
    if (!this.veiled) return null;
    // a thrown rock / stomp knocks the veil off just like a shout
    if (info.kind === 'crash' || info.kind === 'stomp' || info.kind === 'spit') {
      this.ring(4.5, info.point.clone().addScaledVector(info.dir, -1));
      return { weak: false, absorbed: true };
    }
    // paint soaks into the dust
    if (this.absorbCd <= 0) {
      this.absorbCd = 0.9;
      this.ctx.effects.comic(info.point.clone().add(this.tmp.set(0, 0.5, 0)), t('SOAKED UP — SHOUT FIRST!'), '#b49cff', 0.55);
      this.ctx.effects.burst(info.point, '#c9c2dc', 5, 1.5, 0.05);
      this.ctx.events.emit('hush:absorbed', { id: this.id });
    }
    return { weak: false, absorbed: true };
  }

  protected override weakPoints(): import('./EnemyBase').WeakPoint[] {
    return this.state === 'RINGING' ? [{ pos: this.pos.clone().add(this.tmp.set(0, this.cOff, 0)), radius: 1.2, mul: 1.5 }] : [];
  }

  protected override interrupt(): void {
    this.streak.visible = false;
    if (this.state === 'TELL' || this.state === 'DIVE') this.setState('RECOVER');
  }

  protected override finish(): void {
    this.streak.visible = false;
    this.veil.visible = false;
    super.finish();
    this.glowT = 0;
    this.vel.set((Math.random() - 0.5) * 1.5, 2.4, (Math.random() - 0.5) * 1.5);
  }

  /** Shoved (thrown rock, sonic push): it's flying — no gravity, just drift. */
  override knock(dir: THREE.Vector3, speed: number): void {
    const d = dir.clone().setY(0);
    if (d.lengthSq() > 1e-4) this.vel.addScaledVector(d.normalize(), speed * 0.6);
  }

  /** Write the body where `pos` says (kinematic flight, no gravity). */
  private place(): void {
    if (this.disposed) return;
    for (const o of this.obstacles) {
      if (this.pos.y > o.top) continue;
      const dx = this.pos.x - o.x, dz = this.pos.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < o.r) {
        const k = d > 1e-3 ? o.r / d : 1;
        this.pos.x = o.x + (d > 1e-3 ? dx * k : o.r);
        this.pos.z = o.z + (d > 1e-3 ? dz * k : 0);
      }
    }
    this.body.setNextKinematicTranslation({ x: this.pos.x, y: this.pos.y + this.cOff, z: this.pos.z });
  }

  /** Steer toward a point at a speed (smooth), staying above the ground. */
  private flyTo(target: THREE.Vector3, speed: number, dt: number, accel = 6): void {
    this.tmp.copy(target).sub(this.pos);
    const d = this.tmp.length();
    if (d > 0.05) this.tmp.multiplyScalar(Math.min(speed, d * 3) / d);
    else this.tmp.set(0, 0, 0);
    this.vel.lerp(this.tmp, Math.min(1, dt * accel));
    this.pos.addScaledVector(this.vel, dt);
    const g = this.groundAt(this.pos.x, this.pos.z);
    if (this.pos.y < g + 0.15) this.pos.y = g + 0.15;
  }

  protected ai(dt: number, player: PlayerController): void {
    this.flap += dt * (this.state === 'TELL' ? 40 : this.state === 'RINGING' ? 9 : 22);
    this.absorbCd = Math.max(0, this.absorbCd - dt);
    if (this.disposed) return;
    if (this.glowT >= 0) {
      // repainted: a little glow moth flutters up into the dusk and away
      this.glowT += dt;
      this.vel.y = Math.min(3, this.vel.y + dt);
      this.vel.x += Math.sin(this.glowT * 3) * dt * 2;
      this.pos.addScaledVector(this.vel, dt);
      this.place();
      if (this.glowT > 7) this.dispose();
      return;
    }
    if (this.harmless) return;
    const chest = this.tmp.copy(player.pos).add(new THREE.Vector3(0, 0.8, 0));
    const myC = this.pos.clone().add(new THREE.Vector3(0, this.cOff, 0));
    const d = chest.distanceTo(myC);
    const flatHome = Math.hypot(player.pos.x - this.home.x, player.pos.z - this.home.z);
    const near = !player.smudged && flatHome < this.leash + 6 && d < 11;
    if (near && !this.alerted) this.alert();
    if (!near && this.alerted && this.state === 'HUSHED' && flatHome > this.leash + 10) this.alerted = false;
    this.attackCd = Math.max(0, this.attackCd - dt);
    const hoverY = this.groundAt(this.pos.x, this.pos.z) + this.alt - this.cOff;
    switch (this.state) {
      case 'HUSHED': {
        if (this.alerted) {
          // circle WAI at a respectful distance, bobbing
          const a = this.flap * 0.03 + this.id.length;
          const want = new THREE.Vector3(player.pos.x + Math.cos(a) * 4.2, 0, player.pos.z + Math.sin(a) * 4.2);
          // never far from home
          const off = want.clone().sub(this.home).setY(0);
          if (off.length() > this.leash) want.copy(this.home).add(off.setLength(this.leash));
          want.y = Math.max(hoverY, player.pos.y + 1.6 - this.cOff);
          this.flyTo(want, 3.2, dt);
          this.faceToward(player.pos, dt, 6);
          if (this.attackCd <= 0 && d < 8.5 && this.canSee(player.pos, this.cOff)) {
            this.setState('TELL');
            this.ctx.audio.play('hush', { pos: this.pos, vol: 0.6, pitch: 1.4 });
          }
        } else {
          if (this.wander.distanceTo(this.pos) < 0.6 || Math.random() < 0.005) this.wander.set(this.home.x + (Math.random() - 0.5) * this.leash, 0, this.home.z + (Math.random() - 0.5) * this.leash);
          this.wander.y = hoverY + Math.sin(this.flap * 0.05) * 0.4;
          this.flyTo(this.wander, 1.6, dt, 2);
          if (this.vel.lengthSq() > 0.05) this.faceToward(this.pos.clone().add(this.vel), dt, 3);
        }
        break;
      }
      case 'TELL': {
        // hover in place, streak pointing at WAI (locks for the last 0.25 s)
        this.vel.multiplyScalar(Math.exp(-6 * dt));
        this.pos.addScaledVector(this.vel, dt);
        const lock = this.stateT > 0.45;
        if (!lock) {
          this.diveDir.copy(chest).sub(myC).normalize();
          this.faceToward(player.pos, dt, 10);
        }
        this.streak.visible = true;
        this.streak.position.copy(myC);
        this.streak.lookAt(myC.clone().add(this.diveDir));
        this.streak.scale.set(1, 1, Math.min(9, d + 1.5));
        const m = this.streak.material as THREE.MeshBasicMaterial;
        m.opacity = lock ? (Math.sin(this.stateT * 50) > 0 ? 0.75 : 0.3) : 0.2 + this.stateT * 0.6;
        if (this.stateT > 0.7) {
          this.streak.visible = false;
          this.hitDone = false;
          this.setState('DIVE');
        }
        break;
      }
      case 'DIVE': {
        this.vel.copy(this.diveDir).multiplyScalar(13);
        this.pos.addScaledVector(this.vel, dt);
        const g = this.groundAt(this.pos.x, this.pos.z);
        if (this.pos.y < g + 0.1) this.pos.y = g + 0.1;
        if (!this.hitDone && myC.distanceTo(chest) < 0.95) {
          this.hitDone = true;
          if (player.takeHit(myC, 1, 5)) {
            this.onMuffle?.(2);
            this.ctx.effects.burst(chest, '#c9c2dc', 14, 3, 0.07);
            this.ctx.effects.comic(chest.clone().add(new THREE.Vector3(0, 0.9, 0)), t('SHHH!'), '#b49cff', 0.7);
            this.ctx.audio.play('hush', { pos: this.pos, vol: 0.9 });
          }
          this.setState('RECOVER');
        }
        if (this.stateT > 0.75) this.setState('RECOVER');
        break;
      }
      case 'RECOVER': {
        const up = this.pos.clone();
        up.y = Math.max(hoverY, player.pos.y + 1.8 - this.cOff);
        this.flyTo(up.add(this.diveDir.clone().setY(0).multiplyScalar(2)), 4, dt, 3);
        if (this.stateT > 0.9) {
          this.attackCd = (2.2 + Math.random() * 1.6) * this.patience;
          this.setState('HUSHED');
        }
        break;
      }
      case 'RINGING': {
        // dazed: drifts down to chest height, spinning slowly; the veil grows back afterwards
        const low = this.pos.clone();
        low.y = this.groundAt(this.pos.x, this.pos.z) + this.ringLow - this.cOff;
        this.vel.multiplyScalar(Math.exp(-2.5 * dt));
        this.pos.addScaledVector(this.vel, dt);
        this.pos.y += (low.y - this.pos.y) * Math.min(1, dt * 2);
        this.facing += dt * 2.5;
        if (this.stateT > this.ringFor) {
          this.veil.visible = true;
          this.ctx.effects.burst(myC, '#c9c2dc', 10, 2, 0.06);
          this.attackCd = 1.2;
          this.setState('HUSHED');
        }
        break;
      }
    }
    this.place();
  }

  protected animate(dt: number): void {
    const flap = this.state === 'RINGING' ? Math.sin(this.flap) * 0.35 : Math.sin(this.flap) * 0.9;
    this.wings[0].rotation.z = flap + 0.15;
    this.wings[1].rotation.z = -flap - 0.15;
    this.model.position.y = this.cOff + Math.sin(this.flap * 0.12) * 0.08;
    this.model.rotation.z = this.state === 'RINGING' ? Math.sin(this.flap * 0.4) * 0.5 : 0;
    this.model.rotation.x = this.state === 'DIVE' ? 0.6 : this.state === 'TELL' ? -0.3 : 0;
    if (this.veil.visible) {
      this.veil.rotation.y += dt * 1.2;
      this.veilMat.opacity = 0.42 + Math.sin(this.flap * 0.2) * 0.08;
    }
    if (this.glowT >= 0) {
      const k = Math.max(0, 1 - Math.max(0, this.glowT - 5) / 2);
      this.root.scale.multiplyScalar(Math.max(0.01, k));
    }
  }

  override dispose(): void {
    this.streak.removeFromParent();
    super.dispose();
  }
}
