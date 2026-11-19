/**
 * [INPUT]: depends on three; PlaySession from ../level/Session (player, coop partner, effects, audio); t from ../i18n
 * [OUTPUT]: exports Celebration (start(base, yaw), step, pose, stop, duration) and CHEER (the bone-pose tuning)
 * [POS]: WAI's victory move, authored in code on the rigged Tripo model's own bones (R_/L_Upperarm, R_/L_Forearm, Spine02)
 *        plus a root move: crouch → a spinning hop → land in a ring of paint → the can raised high with a spray flourish
 *        in the four crayon colours. The root move goes through PlayerController.teleport each fixed
 *        step (capsule, cape and clips follow); the bone pose is layered after the clip in pose() (main.ts calls it after
 *        the session render). Pip (the co-op partner) hops and salutes beside him. Used by LevelOutro at every level end.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import * as THREE from 'three';
import type { PlaySession } from '../level/Session';
import { t } from '../i18n';

const COLS = ['#ff4fa3', '#ffd23a', '#22c4c0', '#2a4be0', '#ff8a1f'];

/** Bone offsets (radians, local XYZ) at full cheer: tuned on wai2.glb by screenshot. */
export const CHEER = {
  // the right upper arm swings up about its local z (the can ends beside the crown), the forearm bends in a little
  rUp: [0, 0, -2.5] as [number, number, number],
  rFore: [0, 0, -0.6] as [number, number, number],
  // the left arm opens out to the side (local x): a "ta-da" hand (the box head hides a raised one)
  lUp: [1.4, 0, 0] as [number, number, number],
  lFore: [0, 0, 0] as [number, number, number],
  spine: [0, 0, 0] as [number, number, number],
};

const q = new THREE.Quaternion();
const e = new THREE.Euler();

export class Celebration {
  readonly duration = 3.1;
  private t = -1;
  private base = new THREE.Vector3();
  private yaw = 0;
  private bones: Partial<Record<keyof typeof CHEER, THREE.Object3D>> = {};
  private fx = 0;

  constructor(private s: PlaySession) {
    const root = s.player.model.root;
    const find = (n: string) => root.getObjectByName(n) ?? undefined;
    this.bones = { rUp: find('R_Upperarm'), rFore: find('R_Forearm'), lUp: find('L_Upperarm'), lFore: find('L_Forearm'), spine: find('Spine02') };
  }

  get active(): boolean {
    return this.t >= 0 && this.t < this.duration;
  }

  start(base: THREE.Vector3, yaw: number): void {
    this.base.copy(base);
    this.yaw = yaw;
    this.t = 0;
    this.fx = 0;
    const pip = this.s.coop?.pip;
    if (pip) {
      // the partner joins: a step to WAI's left, facing the same way
      const left = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(1.6);
      pip.teleportNear(base.clone().add(left), yaw, 'cheer', true);
    }
  }

  /** 0..1: how far the arms are up. */
  private armK(): number {
    const tt = this.t;
    if (tt < 0) return 0;
    if (tt < 0.9) return THREE.MathUtils.smoothstep(tt, 0.25, 0.9) * 0.6;
    if (tt < this.duration - 0.35) return Math.min(1, 0.6 + (tt - 0.9) * 2);
    return Math.max(0, (this.duration - tt) / 0.35);
  }

  step(dt: number): void {
    if (this.t < 0 || this.t >= this.duration) return;
    const prev = this.t;
    this.t += dt;
    const tt = this.t;
    const p = this.s.player;
    const fx = this.s.ctx.effects;
    const au = this.s.ctx.audio;
    // root: crouch 0–0.3, spinning hop 0.3–1.0, then he stands and cheers (an airborne bounce would swap in the
    // jump clip's tilted pose)
    let y = 0;
    let yaw = this.yaw;
    if (tt > 0.3 && tt < 1.0) {
      const k = (tt - 0.3) / 0.7;
      y = Math.sin(k * Math.PI) * 1.05;
      yaw += THREE.MathUtils.smootherstep(k, 0, 1) * Math.PI * 2;
    }
    p.teleport(this.base.clone().setY(this.base.y + y), yaw);
    const cross = (at: number) => prev < at && tt >= at;
    if (cross(0.3)) au.play('jump', { pitch: 1.25 });
    if (cross(1.0)) {
      au.play('land');
      au.play('stickerBurst', { vol: 0.8 });
      fx.ring(this.base.clone().setY(this.base.y + 0.06), '#ffd23a', 2.4);
      for (const c of COLS) fx.burst(this.base.clone().setY(this.base.y + 0.3), c, 8, 4, 0.07);
    }
    if (cross(1.2)) {
      au.play('fanfare', { vol: 0.7 });
      fx.comic(this.base.clone().setY(this.base.y + 2.0), t('TA-DA!'), '#ffd23a', 0.9);
    }
    // the spray flourish: a fan of paint from the raised can, colour after colour
    if (tt > 1.15 && tt < 2.45) {
      this.fx -= dt;
      if (this.fx <= 0) {
        this.fx = 0.06;
        const k = (tt - 1.15) / 1.3;
        const hand = this.bones.rFore?.getWorldPosition(new THREE.Vector3()) ?? this.base.clone().setY(this.base.y + 1.6);
        hand.y += 0.35;
        const a = this.yaw + Math.PI / 2 - k * Math.PI;
        const dir = new THREE.Vector3(Math.sin(a) * 0.8, 1, Math.cos(a) * 0.8).normalize();
        fx.burst(hand, COLS[Math.floor(k * 10) % COLS.length], 4, 5.5, 0.08, 4, dir);
        if (Math.random() < 0.3) au.play('pop', { vol: 0.35, pitch: 1.2 + k });
      }
    }
  }

  /** Bone pose over the clip (after the session render). */
  pose(): void {
    if (this.t < 0 || this.t >= this.duration) return;
    const k = this.armK();
    const sp = Math.sin(this.t * 14) * 0.08 * k;
    for (const key of Object.keys(CHEER) as (keyof typeof CHEER)[]) {
      const b = this.bones[key];
      if (!b) continue;
      const [x, y, z] = CHEER[key];
      const wig = key === 'rUp' ? sp : key === 'lUp' ? -sp : 0;
      e.set(x * k, y * k, z * k + wig);
      b.quaternion.multiply(q.setFromEuler(e));
    }
    const pip = this.s.coop?.pip;
    if (pip) {
      const hop = this.t > 0.4 && this.t < 1.1 ? Math.sin(((this.t - 0.4) / 0.7) * Math.PI) * 0.8 : 0;
      pip.model.root.position.y += hop;
      pip.pose.salute = this.t > 1 ? 1 : 0;
    }
  }

  stop(): void {
    this.t = -1;
    const pip = this.s.coop?.pip;
    if (pip) pip.pose.salute = 0;
  }
}
