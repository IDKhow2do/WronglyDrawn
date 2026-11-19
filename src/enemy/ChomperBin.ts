import * as THREE from 'three';
import { t } from '../i18n';
import { EnemyBase, type WeakPoint } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { DamageInfo, DamageResult } from '../combat/Damage';
import { paintedMesh, toon } from '../render/Materials';
import { PAL } from '../render/PaintTextures';
import { CrookedLeg } from './MutantModel';

/**
 * Chomper Bin: a metal bin whose lid is a jaw. It EATS paint shots hitting its
 * open mouth and spits them back. Hit it from behind, or while it chews after
 * a lunge. Drops the MOUTH organ.
 */
export class ChomperBin extends EnemyBase {
  readonly kind = 'chomper';
  readonly displayName = 'Chomper Bin';
  readonly bigness = 0.55;
  override readonly drops = 'MOUTH' as const;
  private jaw = new THREE.Group();
  private binGroup = new THREE.Group();
  private mat: THREE.MeshToonMaterial;
  private legs: CrookedLeg[] = [];
  private gulped = 0;
  private attackCd = 1;
  private lungeDir = new THREE.Vector3();
  private hitDone = false;
  private spitBalls: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number }[] = [];
  private phase = 0;
  private wanderT = new THREE.Vector3();

  constructor(ctx: GameContext, id: string, start: THREE.Vector3) {
    super(ctx, id, start, 380, 0.7, 0.35);
    this.mat = toon({ map: ctx.assets.tex('metal_dark') });
    const body = ctx.assets.instantiateModel('chomperBody');
    if (body) this.binGroup.add(body);
    else {
      const bin = paintedMesh(new THREE.CylinderGeometry(0.66, 0.56, 1.1, 14, 1, true), this.mat, 0.04);
      (bin.material as THREE.Material).side = THREE.DoubleSide;
      bin.position.y = 0.55;
      this.binGroup.add(bin);
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.56, 14), this.mat);
      bottom.rotation.x = -Math.PI / 2;
      bottom.position.y = 0.01;
      this.binGroup.add(bottom);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.62, 16), new THREE.MeshBasicMaterial({ color: '#2a0a18' }));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = 0.9;
      this.binGroup.add(inner);
      // lower teeth on the rim
      const toothMat = toon({ color: PAL.cream });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 3), toothMat);
        t.position.set(Math.sin(a) * 0.6, 1.15, Math.cos(a) * 0.6);
        this.binGroup.add(t);
      }
      // painted eyes on the bin
      for (const x of [-0.22, 0.22]) {
        const e = paintedMesh(new THREE.SphereGeometry(0.13, 10, 8), toon({ color: PAL.white }), 0.02);
        e.position.set(x, 0.7, 0.58);
        e.scale.z = 0.5;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.black }));
        p.position.set(x, 0.7, 0.65);
        this.binGroup.add(e, p);
      }
    }
    // jaw = lid with teeth, hinged at the back
    const jawModel = body ? ctx.assets.instantiateModel('chomperJaw', { pivot: 'raw' }) : null;
    if (jawModel) this.jaw.add(jawModel);
    else {
      const lid = paintedMesh(new THREE.CylinderGeometry(0.7, 0.7, 0.14, 16), toon({ color: PAL.red }), 0.03);
      lid.position.set(0, 0, 0.66);
      this.jaw.add(lid);
      const toothMat = toon({ color: PAL.cream });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 3), toothMat);
        t.position.set(Math.sin(a) * 0.6, -0.15, 0.66 + Math.cos(a) * 0.6);
        t.rotation.z = Math.PI;
        this.jaw.add(t);
      }
    }
    // sculpted bin: hinge measured on the Tripo body (≈ back rim)
    if (jawModel) this.jaw.position.set(0, 0.97, -0.47);
    else this.jaw.position.set(0, 1.2, -0.66);
    this.binGroup.add(this.jaw);
    this.binGroup.position.y = 0.45;
    this.root.add(this.binGroup);
    const legMat = toon({ color: '#3a1d52' });
    const footMat = toon({ color: '#ff3cf0' });
    for (const x of [-0.3, 0.3]) {
      const l = new CrookedLeg(0.25, 0.25, legMat, footMat, 0.07);
      l.hip.position.set(x, 0.48, 0);
      this.legs.push(l);
      this.root.add(l.hip);
    }
    this.paintAnchor = this.binGroup;
    this.wanderT.copy(start);
  }

  private get mouthOpen(): boolean {
    return this.state !== 'CHEW' && this.state !== 'STUNNED' && this.state !== 'CALM';
  }

  protected override weakPoints(): WeakPoint[] {
    // the soft back panel
    const back = this.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(this.forward(), -0.6);
    return [{ pos: back, radius: 0.75, mul: this.state === 'CHEW' ? 3 : 2.2 }];
  }

  protected override preDamage(info: DamageInfo): DamageResult | null {
    // a rock (or can) thrown into its open mouth: it CHOKES — long stun, back panel wide open
    if (info.kind === 'crash' && this.mouthOpen && info.dir.clone().setY(0).normalize().dot(this.forward()) < -0.2) {
      this.setState('CHEW');
      this.stateT = -1.6; // chews for ~3.3 s instead of 1.7
      this.attackCd = 2;
      this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), t('GULP?!'), '#ffd23a', 0.8);
      this.ctx.audio.play('gulp', { pos: this.pos, vol: 1, pitch: 0.6 });
      this.ctx.audio.play('burp', { pos: this.pos, vol: 0.8, pitch: 0.7 });
      this.hp = Math.max(1, this.hp - info.amount * 0.5);
      return { weak: true };
    }
    if (info.kind !== 'paint' || !this.mouthOpen) return null;
    // shots from the front go straight into its mouth
    const fromFront = info.dir.clone().setY(0).normalize().dot(this.forward()) < -0.25;
    if (!fromFront) return null;
    this.gulped++;
    this.ctx.audio.play('gulp', { pos: this.pos, vol: 0.6 });
    // make the counter obvious: it visibly eats the paint, then the game tells you why
    if (this.gulped % 14 === 1) this.ctx.effects.comic(this.pos.clone().add(new THREE.Vector3(0, 2.3, 0)), t('YUM!'), '#ff4fa3', 0.75);
    if (this.gulped === 18)
      this.ctx.events.emit('toast', { text: 'It SWALLOWS paint from the front! Spray its back — or throw a crate into its open mouth.', kind: 'warn', at: this.pos });
    if (!this.alerted) this.alert();
    return { weak: false, absorbed: true };
  }

  protected override onHit(): void {
    this.ctx.audio.play('hit', { pos: this.pos, pitch: 1.3, vol: 0.5 });
  }

  protected override finish(): void {
    this.ctx.audio.play('stunSting');
    this.ctx.effects.burst(this.pos.clone().add(new THREE.Vector3(0, 1, 0)), '#b23cff', 20, 5);
    this.ctx.time.slowmo(0.35, 0.4);
    for (const l of this.legs) l.hip.visible = false;
    for (const b of this.spitBalls) this.ctx.root.remove(b.mesh);
    this.spitBalls = [];
    super.finish();
  }

  calm(): void {
    this.setState('CALM');
    this.mat.color.set('#9fd8e6');
  }

  protected override interrupt(): void {
    if (this.state === 'TELL' || this.state === 'LUNGE' || this.state === 'CHEW') {
      this.attackCd = 1.4;
      this.setState('CHASE');
    }
  }

  protected ai(dt: number, player: PlayerController): void {
    this.updateSpit(dt, player);
    if (this.harmless) return;
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 2;
    this.attackCd = Math.max(0, this.attackCd - dt);
    let vx = 0;
    let vz = 0;
    // spit swallowed paint back
    if (this.gulped >= 3 && this.state !== 'LUNGE') {
      this.gulped = 0;
      this.spit(player);
    }
    switch (this.state) {
      case 'IDLE': {
        const to = this.wanderT.clone().sub(this.pos).setY(0);
        if (to.length() < 0.5) this.wanderT.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8));
        else {
          to.normalize();
          vx = to.x * 1.4;
          vz = to.z * 1.4;
          this.faceToward(this.wanderT, dt, 3);
        }
        if (valid && d < 13 && this.canSee(player.pos, 1.2)) this.alert();
        break;
      }
      case 'CHASE': {
        if (!valid || this.pos.distanceTo(this.home) > 20) {
          this.alerted = false;
          this.setState('IDLE');
          break;
        }
        this.faceToward(player.pos, dt, 6);
        if (d < 5.5 && this.attackCd <= 0) {
          this.setState('TELL');
          this.ctx.audio.play('telegraph', { pos: this.pos });
          break;
        }
        if (d > 1.6) {
          vx = (toP.x / d) * 3.7;
          vz = (toP.z / d) * 3.7;
        }
        break;
      }
      case 'TELL': {
        this.faceToward(player.pos, dt, 8);
        if (this.stateT > 0.55) {
          this.lungeDir.copy(toP.lengthSq() > 0.01 ? toP.normalize() : this.forward());
          this.hitDone = false;
          this.setState('LUNGE');
        }
        break;
      }
      case 'LUNGE': {
        vx = this.lungeDir.x * 10;
        vz = this.lungeDir.z * 10;
        if (!this.hitDone && valid && d < 1.7) {
          this.hitDone = true;
          this.ctx.audio.play('jawSnap', { pos: this.pos });
          player.takeHit(this.pos, 2, 9);
        }
        if (this.stateT > 0.35) {
          this.ctx.audio.play('jawSnap', { pos: this.pos });
          this.setState('CHEW');
        }
        break;
      }
      case 'CHEW': {
        if (this.stateT > 1.7) {
          this.attackCd = 1.2;
          this.setState('CHASE');
        }
        break;
      }
    }
    this.move(vx, vz, dt);
  }

  protected override alert(): void {
    super.alert();
    if (this.state === 'IDLE') this.setState('CHASE');
  }

  private spit(player: PlayerController): void {
    const from = this.pos.clone().add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(this.forward(), 0.6);
    const to = player.pos.clone().add(new THREE.Vector3(0, 0.6, 0));
    const vel = to.sub(from).normalize().multiplyScalar(16);
    vel.y += 2;
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#b23cff' }));
    m.position.copy(from);
    this.ctx.root.add(m);
    this.spitBalls.push({ mesh: m, vel, life: 2 });
    this.ctx.audio.play('spit', { pos: from });
  }

  private updateSpit(dt: number, player: PlayerController): void {
    for (let i = this.spitBalls.length - 1; i >= 0; i--) {
      const b = this.spitBalls[i];
      b.vel.y -= 9 * dt;
      const step = b.vel.clone().multiplyScalar(dt);
      const hit = this.ctx.physics.raycast(b.mesh.position, step.clone().normalize(), step.length(), (c) => c.handle !== this.collider.handle);
      b.life -= dt;
      let done = b.life <= 0;
      if (hit) {
        if (hit.collider.handle === player.collider.handle) player.takeHit(b.mesh.position, 1, 6);
        else this.ctx.effects.splat(hit.point, hit.normal, 4, 0.8);
        this.ctx.effects.burst(hit.point, '#b23cff', 10, 3);
        this.ctx.audio.play('splat', { pos: hit.point });
        done = true;
      } else b.mesh.position.add(step);
      if (done) {
        this.ctx.root.remove(b.mesh);
        this.spitBalls.splice(i, 1);
      }
    }
  }

  protected animate(dt: number): void {
    const speed = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) / Math.max(dt, 1e-3);
    this.phase += dt * (3 + speed * 3);
    const t = performance.now() / 1000;
    let open = 0.35 + Math.sin(t * 4) * 0.1;
    if (this.state === 'TELL') open = 1.1;
    if (this.state === 'LUNGE') open = this.stateT < 0.3 ? 1.2 : 0;
    if (this.state === 'CHEW') open = Math.abs(Math.sin(this.stateT * 12)) * 0.25;
    if (this.harmless) open = 0;
    this.jaw.rotation.x = -open;
    this.legs.forEach((l, i) => l.pose(Math.sin(this.phase + i * Math.PI) * 0.6 * Math.min(1, speed / 2), -0.5, i ? 0.15 : -0.15));
    this.binGroup.rotation.z = Math.sin(this.phase) * 0.06 * Math.min(1, speed / 2);
    this.binGroup.position.y = this.harmless ? 0 : 0.45;
    this.mat.emissive.setRGB(this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0, this.flash > 0 ? 0.8 : 0);
  }

  override dispose(): void {
    for (const b of this.spitBalls) this.ctx.root.remove(b.mesh);
    super.dispose();
  }
}
