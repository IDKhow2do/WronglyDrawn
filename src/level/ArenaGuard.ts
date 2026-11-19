/**
 * [INPUT]: depends on GameContext (physics.wallAhead, effects, audio); PlayerController (pos, smudged, teleport, nudgeTo)
 * [OUTPUT]: exports ArenaGuard (step(), walledOff(), returns) and ArenaSpec
 * [POS]: the one rule "a WAI knocked out of a locked boss arena comes back in", shared by GameSession (the Eraser's
 *        summit), HarborSession (the Hush's headland plaza) and SoulsFight (the Red Pen's ink ring). The session
 *        calls step() every fixed step while its fight is on, after the creatures' push-outs.
 *        Three cases. Over the rim (hold): he is slid back inside the ring at once, as before. Below the floor: he
 *        is put back at once. Walled off (every probe ray from inside the arena to him meets a wall, e.g. the pocket
 *        behind the Gate Tower door) or past the rim for GRACE seconds: he is put back at the arena's entry spot.
 *        Putting back costs no heart and touches no boss: FightReset refills a boss only on a real smudge.
 *        Mid-boss squares (Inkwell, Gramophone) are not locked and need no guard: WAI walks out and back freely.
 * [PROTOCOL]: Update this header on change, then check docs/regression/ARENAS.md
 */
import * as THREE from 'three';
import type { GameContext } from '../core/Context';
import type { PlayerController } from '../player/PlayerController';
import { t } from '../i18n';

export interface ArenaSpec {
  /** Floor centre of the arena. */
  center: THREE.Vector3;
  /** Radius of the arena wall's inner face (m). */
  radius: number;
  /** Where WAI is put back (the session's in-arena respawn spot) and which way he faces. */
  back: { pos: THREE.Vector3; yaw: number };
  /** Slide WAI back inside radius − 1 the moment he is past it (the summit and the headland have done this since round 2). */
  hold?: boolean;
}

/** Seconds walled off / past the rim before WAI is put back: a knock settles in well under this. */
const GRACE = 1.5;
/** Below the floor by this much = off the arena. */
const DROP = 1.5;
/** Probe rays start at waist height from the centre and from four points at half the radius. */
const PROBE_Y = 0.8;
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class ArenaGuard {
  private outT = 0;
  /** How many times WAI was put back (tests read it). */
  returns = 0;

  constructor(
    private ctx: GameContext,
    readonly spec: ArenaSpec,
  ) {}

  /** One fixed step while the fight is on. Returns true when WAI was put back this step. */
  step(dt: number, p: PlayerController): boolean {
    if (p.smudged) {
      this.outT = 0;
      return false;
    }
    const { center: c, radius: R } = this.spec;
    const fell = p.pos.y < c.y - DROP;
    const dx = p.pos.x - c.x, dz = p.pos.z - c.z;
    const d = Math.hypot(dx, dz);
    if (!fell && this.spec.hold && d > R - 1) {
      const k = (R - 1) / d;
      p.nudgeTo(_to.set(c.x + dx * k, p.pos.y, c.z + dz * k));
    }
    const out = fell || Math.hypot(p.pos.x - c.x, p.pos.z - c.z) > R + 0.5 || this.walledOff(p.pos);
    this.outT = out ? this.outT + dt : 0;
    if (!out || (!fell && this.outT < GRACE)) return false;
    this.putBack(p);
    return true;
  }

  /** Is `pos` cut off from the arena: does every probe ray from inside meet a wall before reaching it? */
  walledOff(pos: THREE.Vector3): boolean {
    const { center: c, radius: R } = this.spec;
    _to.set(pos.x, pos.y + PROBE_Y, pos.z);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI) / 2;
      const r = i === 4 ? 0 : R * 0.5;
      _from.set(c.x + Math.cos(a) * r, c.y + PROBE_Y, c.z + Math.sin(a) * r);
      _dir.copy(_to).sub(_from);
      const len = _dir.length();
      if (len < 0.3) return false;
      if (this.ctx.physics.wallAhead(_from, _dir.divideScalar(len), len) === null) return false;
    }
    return true;
  }

  private putBack(p: PlayerController): void {
    const { pos, yaw } = this.spec.back;
    this.outT = 0;
    this.returns++;
    p.teleport(pos, yaw);
    this.ctx.camera.yaw = yaw;
    const at = pos.clone().setY(pos.y + 1);
    this.ctx.effects.burst(at, '#5ff4e6', 18, 4, 0.1);
    this.ctx.effects.comic(at.setY(at.y + 0.8), t('BACK IN THE FIGHT!'), '#5ff4e6', 0.8);
    this.ctx.audio.play('dodge', { pos });
  }
}
