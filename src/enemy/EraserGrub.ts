import * as THREE from 'three';
import { EnemyBase } from './EnemyBase';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import type { Edible, Eater } from '../hosts/Edible';
import { paintedMesh, toon, wonkyBox } from '../render/Materials';
import { PAL } from '../render/PaintTextures';

/**
 * Eraser Grub: a little pink eraser that rubs out paint (and half a heart).
 * Fodder that comes in groups. Mouths can eat it; WAI can swallow it and spit it.
 */
export class EraserGrub extends EnemyBase implements Edible {
  readonly kind = 'grub';
  readonly displayName = 'Eraser Grub';
  readonly bigness = 0.12;
  radius = 0.45;
  eatableBy: Eater[] = ['wai', 'small', 'medium', 'large'];
  swallowable = true;
  private bodyMesh: THREE.Group;
  private mat: THREE.MeshToonMaterial;
  private wobble = Math.random() * 10;
  private hopCd = 0;
  private eraseCd = 1;
  private wander = new THREE.Vector3();
  /** Called when it pops (killed or eaten) so the session can drop paint. */
  onPop: ((g: EraserGrub, eaten: boolean) => void) | null = null;

  constructor(ctx: GameContext, id: string, start: THREE.Vector3, private leash = 14) {
    super(ctx, id, start, 16, 0.35, 0.12);
    const override = ctx.assets.instantiateModel('grub');
    this.bodyMesh = new THREE.Group();
    this.mat = toon({ color: '#ff9ec4' });
    if (override) this.bodyMesh.add(override);
    else {
      const b = paintedMesh(wonkyBox(0.75, 0.42, 0.5, 0.08, Math.floor(Math.random() * 100)), this.mat, 0.03);
      b.position.y = 0.24;
      this.bodyMesh.add(b);
      const sleeve = paintedMesh(wonkyBox(0.42, 0.46, 0.54, 0.05, 3), toon({ color: PAL.cobalt }), 0.03);
      sleeve.position.set(-0.12, 0.24, 0);
      this.bodyMesh.add(sleeve);
      // angry smudged face
      for (const x of [-0.1, 0.1]) {
        const e = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: PAL.black }));
        e.position.set(0.39, 0.32, x);
        this.bodyMesh.add(e);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.025, 0.1), new THREE.MeshBasicMaterial({ color: PAL.black }));
        brow.position.set(0.39, 0.39, x);
        brow.rotation.x = x > 0 ? 0.5 : -0.5;
        this.bodyMesh.add(brow);
      }
      const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.16), new THREE.MeshBasicMaterial({ color: PAL.black }));
      mouth.position.set(0.39, 0.18, 0);
      this.bodyMesh.add(mouth);
      this.bodyMesh.rotation.y = -Math.PI / 2; // face +Z
    }
    this.root.add(this.bodyMesh);
    this.paintAnchor = this.bodyMesh;
    this.wander.copy(start);
  }

  position(): THREE.Vector3 {
    return this.pos.clone().add(new THREE.Vector3(0, 0.3, 0));
  }

  eat(_by: Eater): boolean {
    if (this.disposed || this.harmless) return false;
    this.pop(true);
    return true;
  }

  private pop(eaten: boolean): void {
    this.setState('DEAD');
    this.ctx.effects.burst(this.position(), '#ff9ec4', 14, 3.5, 0.07);
    this.ctx.audio.play(eaten ? 'gulp' : 'pop', { pos: this.pos });
    this.onPop?.(this, eaten);
    this.dispose();
  }

  protected override finish(): void {
    this.ctx.events.emit('enemy:stunned', { id: this.id, kind: this.kind });
    this.pop(false);
  }

  protected override onHit(): void {
    this.ctx.audio.play('squeak', { pos: this.pos, vol: 0.6 });
  }

  protected ai(dt: number, player: PlayerController): void {
    if (this.harmless || this.disposed) return;
    const toP = player.pos.clone().sub(this.pos).setY(0);
    const d = toP.length();
    const valid = !player.smudged && Math.abs(player.pos.y - this.pos.y) < 1.5;
    this.hopCd = Math.max(0, this.hopCd - dt);
    this.eraseCd -= dt;
    let vx = 0;
    let vz = 0;
    if (valid && d < 12 && this.pos.distanceTo(this.home) < this.leash) {
      if (!this.alerted) this.alert();
      this.faceToward(player.pos, dt, 8);
      if (d > 0.8) {
        vx = (toP.x / d) * 2.9;
        vz = (toP.z / d) * 2.9;
      } else if (this.hopCd <= 0) {
        if (player.takeHit(this.pos, 1, 5)) {
          this.ctx.audio.play('erase', { pos: this.pos });
          this.ctx.effects.burst(player.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffb3d1', 8, 2);
        }
        this.hopCd = 1.0;
        this.vy = 5; // hop back
        vx = -(toP.x / Math.max(d, 0.01)) * 5;
        vz = -(toP.z / Math.max(d, 0.01)) * 5;
      }
    } else {
      const to = this.wander.clone().sub(this.pos).setY(0);
      if (to.length() < 0.4 || Math.random() < 0.004) this.wander.copy(this.home).add(new THREE.Vector3((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6));
      else {
        to.normalize();
        vx = to.x * 1.2;
        vz = to.z * 1.2;
        this.faceToward(this.wander, dt, 4);
      }
      if (this.pos.distanceTo(this.home) > this.leash) this.alerted = false;
    }
    if (this.eraseCd <= 0) {
      this.eraseCd = 1.5;
      if (this.ctx.effects.eraseNear(this.pos, 0.9)) this.ctx.audio.play('erase', { pos: this.pos, vol: 0.4 });
    }
    this.move(vx, vz, dt);
  }

  protected animate(dt: number): void {
    this.wobble += dt * 14;
    const moving = Math.hypot(this.pos.x - this.prevPos.x, this.pos.z - this.prevPos.z) > 0.002;
    const s = moving ? Math.sin(this.wobble) * 0.18 : Math.sin(this.wobble * 0.3) * 0.04;
    this.bodyMesh.scale.set(1 - s * 0.5, 1 + s, 1 - s * 0.5);
    this.mat.emissive.setRGB(this.flash > 0 ? 1 : 0, this.flash > 0 ? 1 : 0, this.flash > 0 ? 1 : 0);
  }
}
