import * as THREE from 'three';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import { RAPIER } from '../core/PhysicsWorld';
import { MutantModel } from './MutantModel';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo } from '../combat/Damage';
import { PAL } from '../render/PaintTextures';

const SCALE = 1.8; // ~3.3 m tall

/**
 * The Crooked-Leg Mutant (rebuilt): a 3 m trash bin on two wrong legs.
 * Attacks: KICK (close), STOMP shockwave ring (jump over it), CHARGE (dodge it —
 * if it hits a wall it dazes itself and exposes its glowing knees).
 */
export class CrookedLegMutant extends EnemyBase {
  readonly kind = 'crookedLeg';
  readonly displayName = 'Crooked-Leg Mutant';
  readonly bigness = 1;
  override readonly drops = 'LEG' as const;
  readonly model: MutantModel;
  private attackCd = 1.5;
  private chargeDir = new THREE.Vector3();
  private hitDone = false;
  private ring: THREE.Mesh;
  private ringR = 0;
  private ringActive = false;
  private ringHit = false;
  private teleRing: THREE.Mesh;
  /** Charge lane telegraph: a red stripe on the ground showing exactly where it will run. */
  private lane: THREE.Mesh;
  private skidT = 0;
  private laneTex: THREE.CanvasTexture;
  private lastPhaseStep = 0;
  private wanderTarget = new THREE.Vector3();
  /** Session hook: something got crushed by a charge at this point? */
  onChargeImpact: ((p: THREE.Vector3) => boolean) | null = null;
  /** Session hook: bigStep shake/sound. */
  onFootstep: ((p: THREE.Vector3) => void) | null = null;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 820, 0.95, 0.75);
    this.model = new MutantModel(ctx.assets);
    this.model.root.scale.setScalar(SCALE);
    this.root.add(this.model.root);
    this.paintAnchor = this.model.bodyPivot;
    this.model.root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true;
    });
    // shockwave ring (ground)
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 48),
      new THREE.MeshBasicMaterial({ color: '#b23cff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    ctx.root.add(this.ring);
    this.teleRing = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: PAL.red, transparent: true, opacity: 0.0, depthWrite: false }),
    );
    this.teleRing.rotation.x = -Math.PI / 2;
    ctx.root.add(this.teleRing);
    this.wanderTarget.copy(start);
    const laneGeo = new THREE.PlaneGeometry(2.0, 1);
    laneGeo.translate(0, 0.5, 0); // grows forward from the feet
    // warning chevrons pointing the way it will run
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#2a0a18';
    g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ff2448';
    g.beginPath();
    g.moveTo(4, 14);
    g.lineTo(32, 42);
    g.lineTo(60, 14);
    g.lineTo(60, 30);
    g.lineTo(32, 58);
    g.lineTo(4, 30);
    g.closePath();
    g.fill();
    this.laneTex = new THREE.CanvasTexture(cv);
    this.laneTex.colorSpace = THREE.SRGBColorSpace;
    this.laneTex.wrapS = this.laneTex.wrapT = THREE.RepeatWrapping;
    this.lane = new THREE.Mesh(
      laneGeo,
      new THREE.MeshBasicMaterial({ map: this.laneTex, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.lane.visible = false;
    ctx.root.add(this.lane);
  }

  /** Corrupted ground: purple marks you can paint back over. */
  private scorch(p: THREE.Vector3, r: number): void {
    const hit = this.ctx.physics.raycast(p.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, -1, 0), 4, (c) => this.ctx.physics.tagOf(c) === 'static');
    if (hit) this.ctx.effects.splat(hit.point, hit.normal, '#4a1670', r, new THREE.Vector3((Math.random() - 0.5) * 0.6, -1, (Math.random() - 0.5) * 0.6), { drip: 0 });
  }

  protected override weakPoints(): WeakPoint[] {
    if (this.state === 'STUNNED') return [];
    const out: WeakPoint[] = [];
    const mul = this.state === 'DAZED' ? 4 : 2;
    for (const leg of [this.model.legL, this.model.legR]) {
      out.push({ pos: leg.knee.getWorldPosition(new THREE.Vector3()), radius: 0.55, mul });
    }
    // the corrupted eye on the bin
    const eye = new THREE.Vector3(-0.05, 0.62, 0.4);
    this.model.bodyPivot.localToWorld(eye);
    out.push({ pos: eye, radius: 0.4, mul: 1.5 });
    return out;
  }

  protected override onHit(info: DamageInfo, weak: boolean): void {
    if (this.flash > 0.04) this.model.hit(); // pulse with the base flash, not every droplet
    if (weak && this.flash > 0.06) this.ctx.audio.play('squeak', { pos: info.point, pitch: 0.5 });
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('NOTICE');
  }

  protected override finish(): void {
    this.ringActive = false;
    this.ring.visible = false;
    this.teleRing.visible = false;
    this.model.detachLegs();
    // swap the tall capsule for a short block (legless bin)
    this.ctx.physics.untag(this.collider);
    this.ctx.physics.world.removeCollider(this.collider, false);
    const t = this.body.translation();
    this.body.setTranslation({ x: t.x, y: 0.85, z: t.z }, true);
    this.body.setNextKinematicTranslation({ x: t.x, y: 0.85, z: t.z });
    this.collider = this.ctx.physics.world.createCollider(RAPIER.ColliderDesc.cylinder(0.85, 0.85), this.body);
    this.ctx.physics.tag(this.collider, 'enemy', this);
    this.ctx.audio.play('stunSting');
    this.ctx.audio.play('crash', { pos: this.pos });
    this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.9);
    for (const c of ['#2a4be0', '#ff4fa3', '#ffd23a', '#22c4c0']) this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), c, 10, 6, 0.1);
    this.ctx.effects.ring(this.pos.clone().add(new THREE.Vector3(0, 0.05, 0)), PAL.yellow, 6);
    this.ctx.time.slowmo(0.3, 0.6);
    super.finish();
  }

  calm(): void {
    if (this.state === 'CALM') return;
    this.setState('CALM');
    this.model.calm();
    this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 1.6, 0)), PAL.turq, 20, 3);
  }

  protected ai(dt: number, player: PlayerController): void {
    if (this.harmless) return;
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 3.5;
    this.attackCd = Math.max(0, this.attackCd - dt);
    let vx = 0;
    let vz = 0;
    const fwd = this.forward();

    // the stomp ring keeps expanding regardless of state
    if (this.ringActive) {
      this.ringR += dt * 12;
      if (!this.ringHit && valid && player.grounded && Math.abs(d - this.ringR) < 0.8) {
        this.ringHit = player.takeHit(this.pos, 2, 9);
      }
      if (this.ringR > 10) this.ringActive = false;
    }

    switch (this.state) {
      case 'IDLE': {
        // wander around home
        const to = this.wanderTarget.clone().sub(this.pos).setY(0);
        if (to.length() < 0.5 || this.stateT > 6) {
          this.wanderTarget.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 10, 0, (Math.random() - 0.5) * 10));
          this.stateT = 0;
        } else {
          to.normalize();
          vx = to.x * 1.3;
          vz = to.z * 1.3;
          this.faceToward(this.wanderTarget, dt, 2);
        }
        if (valid && d < 15 && this.canSee(player.pos, 2.6)) this.alert();
        break;
      }
      case 'NOTICE': {
        this.faceToward(player.pos, dt, 4);
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('roar', { pos: this.pos });
          this.ctx.camera.pullToward(this.pos.clone().add(new THREE.Vector3(0, 2, 0)), 0.7);
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.6);
          this.ctx.audio.duck(0.3, 1.2);
        }
        if (this.stateT > 1.2) this.setState('CHASE');
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 26) {
          // give up and walk home
          const to = this.home.clone().sub(this.pos).setY(0);
          if (to.length() > 1) {
            to.normalize();
            vx = to.x * 2.4;
            vz = to.z * 2.4;
            this.faceToward(this.home, dt, 3);
          } else {
            this.alerted = false;
            this.setState('IDLE');
          }
          break;
        }
        this.faceToward(player.pos, dt, 5);
        if (this.attackCd <= 0) {
          if (d < 3.4) {
            this.setState('KICK');
            break;
          }
          if (d < 7.5) {
            this.setState('STOMP');
            break;
          }
          if (d < 17 && this.canSee(player.pos, 2.6)) {
            this.setState('CHARGE_TELL');
            break;
          }
        }
        if (d > 2.6) {
          vx = (toP.x / d) * 3.2;
          vz = (toP.z / d) * 3.2;
        }
        break;
      }
      case 'KICK': {
        this.faceToward(player.pos, dt, 6);
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('telegraph', { pos: this.pos, vol: 0.6 });
          this.hitDone = false;
        }
        if (this.stateT > 0.5 && !this.hitDone) {
          this.hitDone = true;
          this.ctx.audio.play('kick', { pos: this.pos });
          const inFront = d < 0.01 || toP.clone().normalize().dot(fwd) > 0.35;
          if (valid && d < 3.8 && inFront) player.takeHit(this.pos, 2, 12);
        }
        if (this.stateT > 1.1) this.endAttack(1.0);
        break;
      }
      case 'STOMP': {
        if (this.stateT < dt * 1.5) {
          this.ctx.audio.play('telegraph', { pos: this.pos });
          this.hitDone = false;
        }
        // tell: crouch + growing red disc under it
        const tell = Math.min(1, this.stateT / 0.9);
        (this.teleRing.material as THREE.MeshBasicMaterial).opacity = 0.35 * tell;
        this.teleRing.scale.setScalar(1 + tell * 2.5);
        this.teleRing.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
        this.teleRing.visible = true;
        if (this.stateT > 0.9 && !this.hitDone) {
          this.hitDone = true;
          this.teleRing.visible = false;
          this.ringActive = true;
          this.ringHit = false;
          this.ringR = 0.5;
          this.ctx.audio.play('stomp', { pos: this.pos });
          for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
            this.scorch(this.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9)), 0.45 + Math.random() * 0.3);
          }
          this.scorch(this.pos.clone(), 1.1);
          this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), PAL.cream, 24, 6, 0.1);
          this.onFootstep?.(this.pos);
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 1.0 * Math.max(0, 1 - d / 16));
          if (d < 1.8 && valid) player.takeHit(this.pos, 2, 12);
        }
        if (this.stateT > 1.6) this.endAttack(1.2);
        break;
      }
      case 'CHARGE_TELL': {
        this.faceToward(player.pos, dt, 6);
        if (this.stateT < dt * 1.5) this.ctx.audio.play('roar', { pos: this.pos, pitch: 1.4, vol: 0.7 });
        if (Math.random() < 0.3) this.ctx.effects.burst(this.pos.clone().addScaledVector(fwd, -0.8), PAL.cream, 1, 2, 0.08, 8);
        {
          // the lane it will run down: grows out, then blinks right before it goes
          const k = Math.min(1, this.stateT / 0.55);
          const len = 2 + k * 14;
          this.lane.visible = true;
          this.lane.position.set(this.pos.x, this.pos.y + 0.05, this.pos.z);
          this.lane.rotation.set(-Math.PI / 2, 0, 0);
          this.lane.rotateZ(this.facing + Math.PI);
          this.lane.scale.set(1, len, 1);
          // chevrons (pointing at WAI) crawl forward along the lane
          this.laneTex.repeat.set(1, -len / 2);
          this.laneTex.offset.y = this.stateT * 3;
          const blink = this.stateT > 0.6 ? (Math.sin(this.stateT * 40) > 0 ? 1 : 0.4) : 1;
          (this.lane.material as THREE.MeshBasicMaterial).opacity = 0.7 * k * blink;
        }
        if (this.stateT > 0.8) {
          this.lane.visible = false;
          this.chargeDir.copy(toP.lengthSq() > 0.01 ? toP.normalize() : fwd);
          this.facing = Math.atan2(this.chargeDir.x, this.chargeDir.z);
          this.hitDone = false;
          this.setState('CHARGE');
        }
        break;
      }
      case 'CHARGE': {
        const speed = 11;
        // ram WAI out of the way first (never pass through him)
        const ahead = toP.clone().normalize().dot(this.chargeDir) > 0.2;
        if (valid && d < 2.4 && ahead) {
          if (!this.hitDone) this.hitDone = player.takeHit(this.pos, 2, 16);
        }
        const blockedByPlayer = d < 2.6 && ahead;
        this.skidT -= dt;
        if (this.skidT <= 0) {
          this.skidT = 0.09;
          this.scorch(this.pos.clone().addScaledVector(this.chargeDir, -0.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)), 0.28);
        }
        const moved = this.move(this.chargeDir.x * speed, this.chargeDir.z * speed, dt);
        if (this.onChargeImpact?.(this.pos.clone().addScaledVector(this.chargeDir, 1.6))) {
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, 0.6);
        }
        // hit a wall → dazed
        if (moved < speed * dt * 0.35 && this.stateT > 0.15 && !blockedByPlayer) {
          this.ctx.audio.play('crash', { pos: this.pos });
          this.ctx.camera.shake = Math.max(this.ctx.camera.shake, Math.max(0.3, 1.2 * (1 - d / 18)));
          this.ctx.effects.burst(this.pos.clone().addScaledVector(this.chargeDir, 1.2).add(new THREE.Vector3(0, 1.5, 0)), PAL.yellow, 20, 5);
          this.ctx.events.emit('toast', { text: 'It crashed into the wall — its knees are glowing! Spray them!', kind: 'good', at: this.pos });
          this.setState('DAZED');
          return;
        }
        if (this.stateT > 1.8) this.endAttack(1.4);
        return; // already moved
      }
      case 'DAZED': {
        if (this.stateT > 2.8) this.endAttack(0.8);
        break;
      }
    }
    this.move(vx, vz, dt);
  }

  protected override interrupt(): void {
    if (this.state === 'NOTICE' || this.state === 'IDLE') return;
    this.endAttack(1.1);
  }

  private endAttack(cd: number): void {
    this.attackCd = cd + Math.random() * 0.6;
    this.teleRing.visible = false;
    this.lane.visible = false;
    this.setState('CHASE');
  }

  protected animate(dt: number): void {
    const speed = this.state === 'CHARGE' ? 9 : Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    const mode =
      this.state === 'STUNNED'
        ? 'stunned'
        : this.state === 'CALM'
          ? 'calm'
          : this.state === 'STOMP' || this.state === 'CHARGE_TELL' || this.state === 'NOTICE'
            ? 'telegraph'
            : this.state === 'DAZED'
              ? 'stunned'
              : this.state === 'CHARGE'
                ? 'attack'
                : 'walk';
    this.model.setTelegraph(
      this.state === 'STOMP' ? Math.min(1, this.stateT / 0.9) : this.state === 'CHARGE_TELL' || this.state === 'NOTICE' ? 0.6 : this.state === 'KICK' && this.stateT < 0.5 ? 0.8 : 0,
    );
    this.model.update(dt, speed, mode);
    if (this.state === 'KICK') {
      const k = Math.min(1, this.stateT / 0.5);
      const strike = this.stateT > 0.5 ? Math.max(0, 1 - (this.stateT - 0.5) / 0.3) : 0;
      this.model.legR.pose(-1.4 * k + strike * 0.8, -0.3 * (1 - strike), 0.1);
    }
    // glowing knees when dazed
    const glow = this.state === 'DAZED' ? 0.5 + Math.sin(performance.now() / 80) * 0.5 : 0;
    for (const leg of [this.model.legL, this.model.legR]) {
      const ball = leg.knee.children[0] as THREE.Mesh;
      (ball.material as THREE.MeshToonMaterial).emissive.setRGB(0.33 + glow, glow * 0.8, 0.33);
    }
    if (this.flash > 0) this.model.binMat.emissive.setRGB(1, 0.9, 1);
    // footsteps from the gait phase
    const stepPhase = Math.floor(this.model.phase / Math.PI);
    if (stepPhase !== this.lastPhaseStep && !this.harmless && speed > 0.5) {
      this.lastPhaseStep = stepPhase;
      this.onFootstep?.(this.pos);
    }
    // shockwave ring visual
    this.ring.visible = this.ringActive;
    if (this.ringActive) {
      this.ring.position.set(this.pos.x, this.pos.y + 0.06, this.pos.z);
      this.ring.scale.setScalar(this.ringR);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - this.ringR / 12);
    }
  }

  override dispose(): void {
    this.ctx.root.remove(this.ring, this.teleRing, this.lane);
    super.dispose();
  }
}
