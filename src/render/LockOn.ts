/**
 * [INPUT]: depends on CameraController (yaw, pitch, extraDistance, extraHeight, camera, targetHeight, followDistance) from ./CameraController; three
 * [OUTPUT]: exports LockOn (snap(), snapping, frame(), point, label, screen) and LockTarget
 * [POS]: the souls fight's aim ASSIST, not a lock (src/level/works/SoulsFight owns the one instance). Aim belongs to the
 *        player: the mouse always steers. A tap of Y (LOCK button on touch) swings the view once onto the open weak
 *        point nearest the crosshair (or the Pen's body) and lets go; any mouse movement cancels the swing. Every frame
 *        it also eases the follow camera back and up a little while the fight is on, so a 14 m Pen fits the frame,
 *        and reports the nearest open weak point on screen for the HUD marker.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { CameraController } from './CameraController';

export interface LockTarget {
  id: string;
  pos: THREE.Vector3;
}

const _v = new THREE.Vector3();
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class LockOn {
  /** The point the HUD marks (the open weak point nearest the crosshair, or the snap's point). */
  readonly point = new THREE.Vector3();
  /** Id of the marked weak point ('' = none open). */
  label = '';
  /** The marked point on screen (0..1, y down; visible = in front of the camera and inside the view). */
  readonly screen = { x: 0.5, y: 0.5, visible: false };
  private snapT = 0;
  private snapAt = new THREE.Vector3();
  private lastYaw: number | null = null;
  private lastPitch = 0;
  private ease = 0;

  constructor(private cam: CameraController) {}

  /** Is a snap swing running? */
  get snapping(): boolean {
    return this.snapT > 0;
  }

  /** Swing the view once onto `at` (the mouse cancels it). */
  snap(at: THREE.Vector3): void {
    this.snapAt.copy(at);
    this.snapT = 0.45;
    this.lastYaw = null;
  }

  /** Stop any swing. */
  release(): void {
    this.snapT = 0;
    this.lastYaw = null;
  }

  /**
   * Per frame, before CameraController.update(). `on` = the fight is running (framing pull-back), `targets` = open
   * weak points, `wai` = WAI's feet.
   */
  frame(dt: number, on: boolean, wai: THREE.Vector3, targets: LockTarget[], framing: { dist: number; height: number }): void {
    const cam = this.cam;
    this.ease += ((on ? 1 : 0) - this.ease) * (1 - Math.exp(-dt * 3));
    cam.extraDistance = framing.dist * this.ease;
    cam.extraHeight = framing.height * this.ease;
    // the HUD marker: the open weak point nearest the crosshair
    let best: LockTarget | null = null;
    let bd = Infinity;
    const yaw = cam.yaw;
    for (const x of targets) {
      const d = Math.abs(wrap(Math.atan2(x.pos.x - wai.x, x.pos.z - wai.z) - yaw));
      if (d < bd) {
        bd = d;
        best = x;
      }
    }
    this.label = best?.id ?? '';
    if (best) this.point.copy(best.pos);
    // the snap: a short eased swing; the player's mouse moving the camera in between cancels it
    if (this.snapT > 0) {
      if (this.lastYaw !== null && (Math.abs(wrap(cam.yaw - this.lastYaw)) > 0.004 || Math.abs(cam.pitch - this.lastPitch) > 0.004)) this.snapT = 0;
      else {
        this.snapT -= dt;
        const eyeY = wai.y + cam.targetHeight;
        const dx = this.snapAt.x - wai.x, dz = this.snapAt.z - wai.z;
        const flat = Math.max(1.5, Math.hypot(dx, dz));
        const k = 1 - Math.exp(-dt * 14);
        if (Math.hypot(dx, dz) > 1.5) cam.yaw += wrap(Math.atan2(dx, dz) - cam.yaw) * k;
        const pitch = THREE.MathUtils.clamp(-Math.atan2(this.snapAt.y - eyeY, flat + cam.followDistance * 0.6), -1.0, 0.6);
        cam.pitch += (pitch - cam.pitch) * k;
        this.lastYaw = cam.yaw;
        this.lastPitch = cam.pitch;
        if (!best) this.point.copy(this.snapAt);
      }
    }
    if (!best && this.snapT <= 0) {
      this.screen.visible = false;
      return;
    }
    _v.copy(this.point).project(cam.camera);
    this.screen.visible = _v.z < 1 && Math.abs(_v.x) < 1 && Math.abs(_v.y) < 1;
    this.screen.x = _v.x * 0.5 + 0.5;
    this.screen.y = 0.5 - _v.y * 0.5;
  }
}
