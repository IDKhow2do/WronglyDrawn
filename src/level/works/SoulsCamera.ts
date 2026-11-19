/**
 * [INPUT]: depends on CameraController (guard slot, playCine, inCine / storyCine) from render/CameraController; RedPenBoss
 *          (pose, openPoints, tagSpent, nearAlpha, floorY) + SEGMENTS from enemy/RedPenBody; SoulsArena (centre, R);
 *          PlayerController (pos); IN from ./WorksLayout; three
 * [OUTPUT]: exports SoulsCamera (frame(), off())
 * [POS]: the souls fight's camera rules, owned by SoulsFight (one per fight). The camera stays on WAI's side of the Pen:
 *        0 · in play, the Pen's body between WAI's head and the camera brings the camera forward (as a wall would);
 *        1 · a guard on the FINAL camera spot (gameplay, TAG cut-ins, story shots alike): out of the Pen's four capsules,
 *            above the roof and, in play, inside the ink ring (outside it the curtain veils the whole view and the Pen
 *            reads lilac, not red); after a
 *            push the camera keeps looking at the same point 12 m ahead, so the crosshair still means what it showed;
 *        2 · the Pen's near side fades when the camera is right against it (pen.nearAlpha);
 *        3 · the Pen's TAG gets its own two shots (CombatDirector frames a TAG from the body's bounding box, which for a
 *            14 m pen puts the camera inside it): two spots 7 m from the open weak point with a clear line to it
 *            (the first on WAI's side), both looking at it.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import * as THREE from 'three';
import type { CameraController } from '../../render/CameraController';
import type { RedPenBoss } from '../../enemy/RedPenBoss';
import { SEGMENTS } from '../../enemy/RedPenBody';
import type { PlayerController } from '../../player/PlayerController';
import type { SoulsArena } from './SoulsArena';
import { IN } from './WorksLayout';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _before = new THREE.Vector3();
const _cand = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _pick = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Camera clearance from the Pen's capsules (m). */
const CLEAR = 0.9;
/** Camera stays this far inside the ink curtain while WAI is in the ring (m). */
const RIM = 0.8;

export class SoulsCamera {
  private on = false;
  /** Gameplay: keep the camera inside the ring (false in story shots: they may stand outside on purpose). */
  private inRing = false;
  private tagWas = false;

  constructor(
    private cam: CameraController,
    private pen: RedPenBoss,
    private ring: SoulsArena,
    private player: PlayerController,
  ) {}

  private readonly guard = (pos: THREE.Vector3): void => {
    _before.copy(pos);
    const f = this.pen.floorY;
    if (Math.abs(pos.x) < IN && Math.abs(pos.z) < IN && pos.y < f + 0.45 && pos.y > f - 4) pos.y = f + 0.45;
    // inside the ink ring: a camera behind the curtain sees the fight through a red veil
    if (this.inRing && !this.cam.storyCine) this.intoRing(pos);
    // in play, the Pen between WAI and the camera: the camera comes forward to WAI's side of it (like a wall would)
    const framed = !this.cam.inCine && this.unblock(pos);
    // out of the Pen's capsules
    const pose = this.pen.penBody.pose;
    for (const sg of SEGMENTS) {
      pose.point(sg.from, 0, _a);
      pose.point(sg.to, 0, _b);
      _c.subVectors(_b, _a);
      const k = THREE.MathUtils.clamp(_d.subVectors(pos, _a).dot(_c) / Math.max(1e-6, _c.lengthSq()), 0, 1);
      _a.addScaledVector(_c, k);
      _d.subVectors(pos, _a);
      const R = sg.r + CLEAR;
      const d = _d.length();
      if (d >= R) continue;
      if (d < 1e-3) _d.set(0, 1, 0);
      pos.copy(_a).addScaledVector(_d.normalize(), R);
    }
    // WAI hugging the body: look at him from wherever the camera ended up
    if (framed) this.cam.camera.lookAt(_e.copy(this.player.renderPos).setY(this.player.renderPos.y + this.cam.targetHeight));
    // moved: keep looking at the same point ahead (the gameplay path set the camera's turn before the guard)
    else if (pos.distanceToSquared(_before) > 1e-4) {
      const c3 = this.cam.camera;
      c3.getWorldDirection(_fwd);
      c3.lookAt(_a.copy(_before).addScaledVector(_fwd, 12));
    }
  };

  /** Distance from `pt` to the Pen's surface (m, < 0 = inside). */
  private surfaceGap(pt: THREE.Vector3): number {
    const pose = this.pen.penBody.pose;
    let best = Infinity;
    for (const sg of SEGMENTS) {
      pose.point(sg.from, 0, _a);
      pose.point(sg.to, 0, _b);
      _c.subVectors(_b, _a);
      const k = THREE.MathUtils.clamp(_d.subVectors(pt, _a).dot(_c) / Math.max(1e-6, _c.lengthSq()), 0, 1);
      best = Math.min(best, _a.addScaledVector(_c, k).distanceTo(pt) - sg.r);
    }
    return best;
  }

  /**
   * March from WAI's head to `pos`; stop short of the first point where the Pen's body is in the way. When that leaves
   * under 2.2 m (WAI hugging the body after a TAG leap, the Pen leaning over him), the camera instead picks the spot
   * round him with room and a clear line, and looks at him. True = re-aimed here.
   */
  private unblock(pos: THREE.Vector3): boolean {
    const eye = _e.copy(this.player.renderPos).setY(this.player.renderPos.y + this.cam.targetHeight);
    const len = eye.distanceTo(pos);
    // already squeezed against WAI by the body (the follow camera's own collision stops on the Pen's capsules)
    if (len < 2.2 && this.surfaceGap(pos) < 1.5) return this.roundWai(eye, pos);
    const hug = this.surfaceGap(eye) < 0.9;
    const t0 = hug ? 1.2 : 0;
    if (len <= t0) return false;
    const steps = Math.ceil((len - t0) / 0.25);
    for (let i = 1; i <= steps; i++) {
      const t = t0 + (i / steps) * (len - t0);
      _f.lerpVectors(eye, pos, t / len);
      if (this.surfaceGap(_f) >= 0.35) continue;
      // room enough in front of the body: come forward, as a wall would make it
      if (!hug && t - 0.3 >= 2.2) {
        pos.lerpVectors(eye, pos, (t - 0.3) / len);
        return false;
      }
      return this.roundWai(eye, pos);
    }
    return false;
  }

  /**
   * Round WAI, 3.2 m out and 1.1 m up: the spot with the most room from the body and a clear line to him, nearest to
   * where the camera was (the Pen often leans right over him here). Always true (the caller looks at WAI).
   */
  private roundWai(eye: THREE.Vector3, pos: THREE.Vector3): boolean {
    const yaw0 = Math.atan2(pos.x - eye.x, pos.z - eye.z);
    let best = -Infinity;
    for (let j = 0; j < 12; j++) {
      const a = yaw0 + (j / 12) * Math.PI * 2;
      _cand.set(eye.x + Math.sin(a) * 3.2, eye.y + 1.1, eye.z + Math.cos(a) * 3.2);
      let clear = this.surfaceGap(_cand);
      for (const k of [0.35, 0.6, 0.85]) clear = Math.min(clear, this.surfaceGap(_mid.lerpVectors(eye, _cand, k)) + 0.3);
      const score = Math.min(clear, 1.5) + 0.25 * Math.cos(a - yaw0);
      if (score > best) {
        best = score;
        _pick.copy(_cand);
      }
    }
    pos.copy(_pick);
    return true;
  }

  /** Pull `pos` horizontally inside the ink curtain (RIM m in). */
  private intoRing(pos: THREE.Vector3): THREE.Vector3 {
    const c = this.ring.center, R = this.ring.R - RIM;
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz);
    if (d > R) {
      pos.x = c.x + (dx / d) * R;
      pos.z = c.z + (dz / d) * R;
    }
    return pos;
  }

  /** Per frame. `on` = the fight (or its won-over ending) owns the camera; `play` = the duel itself is running. */
  frame(on: boolean, play: boolean): void {
    if (on !== this.on) {
      this.on = on;
      this.cam.guard = on ? this.guard : null;
    }
    this.inRing = play;
    const pen = this.pen;
    pen.nearAlpha = on ? this.nearFade() : 1;
    // the Pen's TAG: replace CombatDirector's cut-in (it started this frame: tagSpent just turned true)
    const tagged = pen.tagSpent;
    if (on && tagged && !this.tagWas && this.cam.inCine && !this.cam.storyCine) this.tagShots();
    this.tagWas = tagged;
  }

  off(): void {
    this.frame(false, false);
  }

  /** 0..1 how solid the Pen is drawn: its near side fades when the camera is right against it. */
  private nearFade(): number {
    const c = this.cam.camera.position;
    const g = this.pen.penBody.gap(_a.copy(c).setY(c.y - 0.65));
    // only right against it (the guard's 0.9 m clearance): a fade further out washed the whole red body to lilac
    return THREE.MathUtils.clamp((g - 0.3) / 0.9, 0.3, 1);
  }

  /** Two TAG shots of the open weak point: from the clearest spot on WAI's side, then from a little round it. */
  private tagShots(): void {
    const p = this.player.pos, pen = this.pen;
    let look = pen.bodyPoint(new THREE.Vector3());
    let best = Infinity;
    for (const w of pen.openPoints()) {
      const d = w.pos.distanceTo(p);
      if (d < best) {
        best = d;
        look = w.pos.clone();
      }
    }
    look.y = Math.min(look.y, p.y + 6);
    // two spots round the weak point, 7 m out, with a clear line to it and inside the ring; the first on WAI's side
    const yawW = Math.atan2(p.x - look.x, p.z - look.z);
    const spot = (yaw: number, out: THREE.Vector3) => out.set(look.x + Math.sin(yaw) * 7, Math.max(look.y - 0.5, pen.floorY + 2.2), look.z + Math.cos(yaw) * 7);
    const clear = (at: THREE.Vector3) => {
      let g = this.surfaceGap(at);
      for (const k of [0.2, 0.4, 0.6, 0.75]) g = Math.min(g, this.surfaceGap(_mid.lerpVectors(at, look, k)));
      return g + (this.ring.radial(at) > this.ring.R - RIM ? -3 : 0);
    };
    let y1 = yawW, s1 = -Infinity;
    for (let j = 0; j < 16; j++) {
      const yaw = yawW + (j / 16) * Math.PI * 2;
      const sc = Math.min(clear(spot(yaw, _cand)), 1.2) + 0.4 * Math.cos(yaw - yawW);
      if (sc > s1) {
        s1 = sc;
        y1 = yaw;
      }
    }
    let y2 = y1 + 1, s2 = -Infinity;
    for (const d of [0.9, -0.9, 1.4, -1.4]) {
      const sc = clear(spot(y1 + d, _cand));
      if (sc > s2) {
        s2 = sc;
        y2 = y1 + d;
      }
    }
    const cam1 = this.intoRing(spot(y1, new THREE.Vector3()).addScaledVector(UP, 1.2));
    const cam2 = this.intoRing(spot(y2, new THREE.Vector3()));
    this.cam.playCine(
      [
        { pos: cam1, look: look.clone().lerp(p, 0.35), toLook: look.clone(), dur: 0.5, fov: 60, toFov: 56 },
        { pos: cam2, look: look.clone().lerp(p, 0.3), dur: 0.55, fov: 54, toFov: 48, handheld: 0.06 },
      ],
      { gameplay: true },
    );
  }
}
