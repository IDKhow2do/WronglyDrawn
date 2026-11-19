/**
 * [INPUT]: depends on EnemyBase (KCC body, stagger/TAG via holdStagger) from ./EnemyBase; CrookedLeg from ./MutantModel;
 *          toon/paintedMesh/addOutline from render/Materials; GameContext.input (mash-to-escape edges)
 * [OUTPUT]: exports the Stapler enemy (kind 'stapler') and its `pinned` read-out for the AI bridge
 * [POS]: level-1 expansion creature (Crossed-Out Quarter). Built around ONE player action: dodge the
 *        leap, then TAG. Siblings: WhiteoutBottle (flank it), RedInkwell (mid-boss).
 * [PROTOCOL]: Update this header on change, then check docs/level1-expansion/PROGRESS.md
 */
import * as THREE from 'three';
import { t } from '../i18n';
import { RAPIER } from '../core/PhysicsWorld';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo } from '../combat/Damage';
import { addOutline, paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { CrookedLeg } from './MutantModel';

// ───────────── tuning ─────────────
const CROUCH = 1.0; // the tell
const AIM_LOCK = 0.35; // the landing spot stops following WAI this long before the leap
const LEAP_T = 0.62;
const PIN_MAX = 1.8; // then it clamps (a second half heart)
const MASH = 6; // presses to wriggle free
const STUCK_T = 2.4;
const LAND_R = 1.3;
const MASH_KEYS = ['Space', 'KeyC', 'KeyE', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];

/**
 * Stapler: a desk stapler on crooked legs. It CROUCHES (jaw cocks wide, a red ring marks where it
 * will land), LEAPS, and if it lands on WAI it staples him to the ground: he mashes (Space / C / E /
 * WASD) to wriggle free, or it clamps again. Dodge the leap (C, or just step out of the ring) and
 * its staple jams into the ground: it is STUCK, wide open to a TAG.
 */
export class Stapler extends EnemyBase {
  readonly kind = 'stapler';
  readonly displayName = 'Stapler';
  readonly bigness = 0.35;
  /** Seconds left on WAI's pin (0 = free). The AI bridge reads it. */
  pinned = 0;
  private arm = new THREE.Group();
  private frame = new THREE.Group();
  private bodyMat: THREE.MeshToonMaterial;
  private legs: CrookedLeg[] = [];
  private ring: THREE.Mesh;
  private staple: THREE.Group;
  private target = new THREE.Vector3();
  private attackCd = 1.2;
  private mash = 0;
  private prevKeys = new Set<string>();
  private pinAt = new THREE.Vector3();
  private stuck = false;
  private phase = 0;
  private wander = new THREE.Vector3();
  private hopT = 0;
  private victim: PlayerController | null = null;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 300, 0.45, 0.25);
    const T = (n: string) => ctx.assets.tex(n);
    this.bodyMat = toon({ map: T('metal_dark'), color: '#ffb8c0' });
    // base plate (the anvil) + the hinged top arm (red, a classic stapler)
    const base = paintedMesh(new THREE.BoxGeometry(0.62, 0.18, 1.35), toon({ map: T('metal_dark'), color: '#9aa0c8' }), 0.035);
    base.position.set(0, 0.09, 0.05);
    const anvil = paintedMesh(new THREE.BoxGeometry(0.3, 0.05, 0.3), toon({ color: '#e8e0ff' }), 0.015);
    anvil.position.set(0, 0.2, 0.55);
    const hinge = paintedMesh(new THREE.CylinderGeometry(0.12, 0.12, 0.66, 10), toon({ color: PAL.black }), 0.02);
    hinge.rotation.z = Math.PI / 2;
    hinge.position.set(0, 0.28, -0.55);
    this.frame.add(base, anvil, hinge);
    const armBox = paintedMesh(new THREE.BoxGeometry(0.56, 0.3, 1.32), this.bodyMat, 0.04);
    armBox.position.set(0, 0.06, 0.62);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.57, 0.08, 1.0), toon({ color: PAL.cream }));
    stripe.position.set(0, 0.12, 0.66);
    // eyes on the arm's snout + a row of teeth (staples) under it
    for (const x of [-0.14, 0.14]) {
      const e = paintedMesh(new THREE.SphereGeometry(0.1, 10, 8), toon({ color: PAL.white }), 0.02);
      e.position.set(x, 0.23, 1.05);
      e.scale.set(1, 0.8, 0.6);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.black }));
      p.position.set(x, 0.23, 1.11);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.03), new THREE.MeshBasicMaterial({ color: PAL.black }));
      brow.position.set(x, 0.33, 1.1);
      brow.rotation.z = x > 0 ? 0.5 : -0.5;
      this.arm.add(e, p, brow);
    }
    const teethMat = toon({ color: '#d8dcf0' });
    for (let i = 0; i < 5; i++) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.03), teethMat);
      tooth.position.set(-0.2 + i * 0.1, -0.12, 1.24);
      this.arm.add(tooth);
    }
    this.arm.add(armBox, stripe);
    this.arm.position.set(0, 0.32, -0.6); // hinge at the back
    this.frame.add(this.arm);
    this.frame.position.y = 0.34;
    this.root.add(this.frame);
    // four crooked little legs (the Red Pen's servants all walk wrong)
    const legMat = toon({ color: '#3a1d52' });
    const footMat = toon({ color: PAL.red });
    for (const [x, z] of [[-0.26, 0.4], [0.26, 0.4], [-0.26, -0.35], [0.26, -0.35]]) {
      const l = new CrookedLeg(0.2, 0.18, legMat, footMat, 0.06);
      l.hip.position.set(x, 0.36, z);
      this.legs.push(l);
      this.root.add(l.hip);
    }
    this.paintAnchor = this.frame;
    // the landing ring telegraph (red, the Red Pen's colour)
    this.ring = new THREE.Mesh(new THREE.RingGeometry(LAND_R * 0.82, LAND_R, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
    this.ring.userData.noPaint = true;
    this.ring.visible = false;
    ctx.root.add(this.ring);
    // the big staple that pins WAI (a bent wire, shown only while he is pinned)
    this.staple = new THREE.Group();
    const wire = toon({ color: '#d8dcf0' });
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), wire);
    top.position.y = 0.55;
    for (const x of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.6, 0.09), wire);
      leg.position.set(x, 0.27, 0);
      this.staple.add(leg);
    }
    this.staple.add(top);
    for (const m of [...this.staple.children] as THREE.Mesh[]) addOutline(m, 0.02);
    this.staple.visible = false;
    this.staple.userData.noPaint = true;
    ctx.root.add(this.staple);
    this.wander.copy(start);
  }

  // ───────────── damage rules ─────────────
  protected override weakPoints(): WeakPoint[] {
    // jammed in the ground: everything is open
    if (this.stuck && this.staggerT > 0) return [{ pos: this.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), radius: 1.6, mul: 1.6 }];
    return [];
  }

  protected override onHit(_info: DamageInfo, weak: boolean): void {
    this.ctx.audio.play('hit', { pos: this.pos, pitch: weak ? 1.1 : 1.5, vol: 0.5 });
  }

  protected override interrupt(): void {
    if (this.state === 'PIN') {
      this.release(true);
      this.attackCd = 1.5;
      this.setState('CHASE');
    }
    if (this.state === 'CROUCH') {
      this.ring.visible = false;
      this.attackCd = 1.5;
      this.setState('CHASE');
    }
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  protected override finish(): void {
    this.release(false);
    this.ring.visible = false;
    this.ctx.audio.play('stunSting');
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
  }

  // ───────────── brain ─────────────
  protected ai(dt: number, player: PlayerController): void {
    if (this.state === 'STUNNED') {
      if (this.stateT > 1.2) this.calm();
      return;
    }
    if (this.state === 'CALM') {
      this.move(0, 0, dt);
      return;
    }
    if (this.stuck) {
      // the stagger (TAG window) just ended: it yanks itself out
      this.stuck = false;
      this.attackCd = 1.4;
      this.setState('CHASE');
      this.ctx.audio.play('pop', { pos: this.pos, pitch: 0.8 });
    }
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2.2;
    this.attackCd = Math.max(0, this.attackCd - dt);
    let vx = 0;
    let vz = 0;
    switch (this.state) {
      case 'IDLE': {
        const to = this.wander.clone().sub(this.pos).setY(0);
        if (to.length() < 0.5) this.wander.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 7, 0, (Math.random() - 0.5) * 7));
        else {
          to.normalize();
          vx = to.x * 1.5;
          vz = to.z * 1.5;
          this.faceToward(this.wander, dt, 4);
        }
        if (valid && d < 13 && this.canSee(player.pos, 0.8)) this.alert();
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 18) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.faceToward(player.pos, dt, 6);
        // something in the way (a kiosk, a pillar): walk round to a clear line, never stand and stare
        const blocked = d < 9 && !this.canSee(player.pos, 0.6);
        if (d > 4 || blocked) {
          vx = (toP.x / d) * 3.1;
          vz = (toP.z / d) * 3.1;
        } else if (d < 2.5) {
          vx = -(toP.x / Math.max(d, 0.01)) * 2;
          vz = -(toP.z / Math.max(d, 0.01)) * 2;
        }
        if (this.attackCd <= 0 && d > 2.5 && d < 9 && this.canSee(player.pos, 0.6) && this.solidAt(player.pos)) {
          this.setState('CROUCH');
          this.target.copy(player.pos);
          this.ctx.audio.play('telegraph', { pos: this.pos });
          this.ctx.audio.play('spinWind', { pos: this.pos, pitch: 1.6, vol: 0.6 });
        }
        break;
      }
      case 'CROUCH': {
        this.faceToward(player.pos, dt, 8);
        if (this.stateT < CROUCH - AIM_LOCK) this.target.copy(player.pos);
        this.ring.visible = true;
        this.ring.position.copy(this.target).setY(this.target.y + 0.06);
        const k = this.stateT / CROUCH;
        this.ring.scale.setScalar(1.6 - 0.6 * k);
        (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.5 * Math.abs(Math.sin(this.stateT * (8 + k * 14)));
        if (this.stateT > CROUCH) {
          // never leap into a hole (the quarter's tear, the canal): it thinks better of it
          if (!this.solidAt(this.target)) {
            this.ring.visible = false;
            this.attackCd = 1;
            this.setState('CHASE');
            break;
          }
          this.setState('LEAP');
          this.vy = 0.5 * 24 * LEAP_T; // lands after LEAP_T on flat ground
          this.ctx.audio.play('jump', { pos: this.pos, pitch: 0.7 });
        }
        break;
      }
      case 'LEAP': {
        const to = this.target.clone().sub(this.pos).setY(0);
        const left = Math.max(0.05, LEAP_T - this.stateT);
        const v = to.length() > 0.05 ? to.divideScalar(left) : to;
        if (v.length() > 16) v.setLength(16);
        this.faceToward(this.target, dt, 10);
        const grounded = this.leapMove(v.x, v.z, dt);
        if ((grounded && this.stateT > 0.2) || this.stateT > LEAP_T + 0.5) this.land(player);
        return;
      }
      case 'PIN': {
        this.holdPin(dt, player);
        break;
      }
    }
    this.move(vx, vz, dt);
  }

  /** Real ground under `p` (not undrawn planks, not thin air)? */
  private solidAt(p: THREE.Vector3): boolean {
    const hit = this.ctx.physics.raycast(p.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, -1, 0), 2.8, (c) => {
      const tag = this.ctx.physics.tagOf(c);
      return tag === 'static' || tag === 'gate';
    });
    return !!hit && Math.abs(hit.point.y - this.pos.y) < 1.6;
  }

  /** Collide-and-slide with no ledge probe (it's in the air: the probe would stop it dead). */
  private leapMove(vx: number, vz: number, dt: number): boolean {
    if (this.bodyless) return false;
    this.vy = Math.max(-25, this.vy - 24 * dt);
    this.cc.computeColliderMovement(this.collider, { x: vx * dt, y: this.vy * dt, z: vz * dt }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, (c) => c.parent()?.handle !== this.body.handle);
    const mv = this.cc.computedMovement();
    const grounded = this.cc.computedGrounded() && this.vy < 0;
    if (grounded) this.vy = -1;
    const tr = this.body.translation();
    this.body.setNextKinematicTranslation({ x: tr.x + mv.x, y: tr.y + mv.y, z: tr.z + mv.z });
    this.pos.set(tr.x + mv.x, tr.y + mv.y - this.cOff, tr.z + mv.z);
    if (this.pos.y < this.home.y - 6) {
      this.body.setTranslation({ x: this.home.x, y: this.home.y + this.cOff + 0.05, z: this.home.z }, true);
      this.pos.copy(this.home);
      this.prevPos.copy(this.home);
      this.vy = 0;
      return true;
    }
    return grounded;
  }

  private land(player: PlayerController): void {
    this.ring.visible = false;
    this.ctx.audio.play('stomp', { pos: this.pos, pitch: 1.3, vol: 0.8 });
    this.ctx.effects.ring(this.pos.clone().add(new THREE.Vector3(0, 0.06, 0)), '#ffffff', 2.2);
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.25);
    const flat = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    const pinnable = typeof (player as Partial<PlayerController>).nudgeTo === 'function';
    if (flat < LAND_R && Math.abs(player.pos.y - this.pos.y) < 1.2 && !player.smudged && player.takeHit(this.pos, 1, 0)) {
      if (pinnable) return this.startPin(player);
      this.attackCd = 2.2;
      this.setState('CHASE');
      return;
    }
    // missed: the staple jams into the ground → stuck, open to a TAG
    this.stuck = true;
    this.setState('STUCK');
    this.holdStagger(STUCK_T);
    this.tagSpent = false;
    this.ctx.audio.play('jawSnap', { pos: this.pos });
    this.ctx.audio.play('crash', { pos: this.pos, vol: 0.5, pitch: 1.4 });
    this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)), t('STUCK!'), PAL.turq, 0.8);
    this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#c9a27a', 10, 3);
  }

  private startPin(player: PlayerController): void {
    this.victim = player;
    this.setState('PIN');
    this.pinned = PIN_MAX;
    this.mash = 0;
    this.prevKeys = new Set(MASH_KEYS.filter((k) => this.ctx.input.isDown(k)));
    this.pinAt.copy(player.pos);
    this.staple.visible = true;
    this.staple.position.copy(player.pos);
    this.staple.rotation.y = this.facing;
    this.ctx.audio.play('jawSnap', { pos: this.pos, pitch: 0.8 });
    this.ctx.audio.play('stampHit', { pos: this.pos });
    this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), t('STAPLED!'), PAL.red, 0.9);
    this.ctx.events.emit('toast', { text: t('STAPLED! Mash Space / C / WASD to wriggle free!'), kind: 'warn' });
  }

  private holdPin(dt: number, player: PlayerController): void {
    this.pinned = Math.max(0, this.pinned - dt);
    player.nudgeTo(this.pinAt);
    player.lockTimer = Math.max(player.lockTimer, 0.12);
    // mash: count fresh presses (edges of the held set, so nothing else's consume() hides them)
    const now = new Set(MASH_KEYS.filter((k) => this.ctx.input.isDown(k)));
    for (const k of now) if (!this.prevKeys.has(k)) this.mash++;
    this.prevKeys = now;
    this.staple.position.y = this.pinAt.y + Math.abs(Math.sin(this.stateT * 30)) * 0.03 * (this.mash / MASH);
    if (this.mash >= MASH) {
      // wriggled free: the stapler is flung back, dazed (TAG it!)
      this.release(true);
      this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), t('BREAK FREE!'), PAL.yellow, 0.8);
      this.ctx.audio.play('pop', { pos: player.pos, pitch: 1.2 });
      const away = this.pos.clone().sub(player.pos).setY(0);
      this.knock(away.lengthSq() > 1e-4 ? away : this.forward().negate(), 6);
      this.stuck = true;
      this.setState('STUCK');
      this.holdStagger(1.6);
      this.tagSpent = false;
      return;
    }
    if (this.pinned <= 0) {
      // too slow: it clamps down again
      this.release(true);
      player.invuln = 0;
      player.takeHit(this.pos, 1, 6);
      this.ctx.audio.play('jawSnap', { pos: this.pos, pitch: 0.6 });
      this.ctx.effects.comic(player.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), t('CLAMP!'), PAL.red, 0.8);
      this.attackCd = 2.5;
      this.setState('CHASE');
    }
  }

  private release(fx: boolean): void {
    if (this.victim) this.victim.lockTimer = 0;
    this.victim = null;
    this.pinned = 0;
    this.staple.visible = false;
    if (fx) this.ctx.effects.burst(this.pinAt.clone().add(new THREE.Vector3(0, 0.4, 0)), '#d8dcf0', 8, 3);
  }

  // ───────────── look ─────────────
  protected animate(dt: number): void {
    const speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    this.phase += dt * (4 + speed * 4);
    this.hopT += dt;
    let open = 0.12 + Math.sin(this.hopT * 3) * 0.05; // idle chatter
    let squash = 0;
    if (this.state === 'CROUCH') {
      const k = Math.min(1, this.stateT / (CROUCH * 0.6));
      open = 0.95 * k; // jaw cocked wide: the tell
      squash = 0.35 * k + Math.sin(this.stateT * 40) * 0.03;
    } else if (this.state === 'LEAP') open = 0.6;
    else if (this.state === 'PIN' || this.state === 'STUCK') open = 0;
    else if (this.state === 'CALM') open = Math.abs(Math.sin(this.hopT * 6)) * 0.3; // happy clacking
    this.arm.rotation.x = THREE.MathUtils.lerp(this.arm.rotation.x, -open, Math.min(1, dt * 18));
    this.frame.position.y = 0.34 - squash * 0.25 + (this.state === 'IDLE' || this.state === 'CHASE' ? Math.abs(Math.sin(this.phase)) * 0.08 * Math.min(1, speed / 1.5) : 0);
    this.frame.scale.set(1 + squash * 0.3, 1 - squash, 1 + squash * 0.15);
    // stuck: snout down in the ground, legs kicking
    this.frame.rotation.x = this.state === 'STUCK' ? 0.35 : 0;
    this.legs.forEach((l, i) => {
      const kick = this.state === 'STUCK' ? Math.sin(this.hopT * 20 + i) * 0.8 : 0;
      l.pose(Math.sin(this.phase + i * Math.PI * 0.5) * 0.5 * Math.min(1, speed / 2) + kick, -0.6 - squash, i % 2 ? 0.2 : -0.2);
    });
    this.bodyMat.emissive.setRGB(this.flash > 0 ? 0.7 : 0, this.flash > 0 ? 0.7 : 0, this.flash > 0 ? 0.7 : 0);
  }

  override dispose(): void {
    this.release(false);
    this.ring.removeFromParent();
    this.staple.removeFromParent();
    super.dispose();
  }
}
