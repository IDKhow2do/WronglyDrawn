/**
 * [INPUT]: depends on EnemyBase (state, pos, telegraph fields peeked through EnemyPeek) from enemy/EnemyBase; Companion
 *          (requestDodge, requestJump, pos, grounded, down) from ./Companion
 * [OUTPUT]: exports autoDodge() (one step's dodge decision: the threat kind she reacted to, or null)
 * [POS]: her reflexes, apart from her body (Companion.autoDodge forwards here). CoopPartner runs it every step, whatever
 *        the brain wants, so she is not hit constantly: rings and beams she hops, lanes and crumbs she rolls out of,
 *        marked floor she steps off. Smudged, she does nothing.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { EnemyBase } from '../enemy/EnemyBase';
import type { Companion } from './Companion';

type EnemyPeek = EnemyBase & {
  ringR?: number;
  ringActive?: boolean;
  beamYaw?: number;
  crumbs?: { to: THREE.Vector3; t: number; dur: number }[];
  dashDir?: THREE.Vector3;
  chargeDir?: THREE.Vector3;
  lungeDir?: THREE.Vector3;
  /** floor hazards with their own tells (the Red Pen's correction marks, ink bands, pools, tiles) */
  hz?: { dangerAt(p: THREE.Vector3): boolean };
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

/** Automatic dodging of telegraphed attacks: the threat kind she reacted to, or null. */
export function autoDodge(pip: Companion, enemies: EnemyBase[]): string | null {
  if (pip.down > 0) return null;
  for (const e0 of enemies) {
    const e = e0 as EnemyPeek;
    if (e.disposed || e.harmless) continue;
    const dx = pip.pos.x - e.pos.x, dz = pip.pos.z - e.pos.z;
    const d = Math.hypot(dx, dz);
    // marked floor (the Red Pen's crosses, strike-throughs, pools, tiles; any range): step to the nearest clear spot
    if (e.hz?.dangerAt(pip.pos)) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        const out = _b.set(Math.sin(a) * 3, 0, Math.cos(a) * 3);
        if (!e.hz.dangerAt(_a.copy(pip.pos).add(out))) {
          if (pip.requestDodge(out)) return 'mark';
          break;
        }
      }
    }
    if (d > 16 || Math.abs(pip.pos.y - e.pos.y) > 4) continue;
    // expanding shockwave rings (boss SLAM, mutant STOMP): hop as it arrives
    if (e.ringActive && e.ringR !== undefined && d - e.ringR < 1.6 && d - e.ringR > -0.3 && pip.grounded) {
      pip.requestJump();
      return 'ring';
    }
    // lamp beam sweeping toward Pip at shin height: jump it
    if (e.state === 'BEAM' && e.beamYaw !== undefined) {
      let a = Math.atan2(dx, dz) - e.beamYaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) < 0.28 && pip.grounded) {
        pip.requestJump();
        return 'beam';
      }
    }
    // lanes (boss rub, mutant charge, chomper lunge): roll out of the lane
    const laneState = e.state === 'RUB_TELL' || e.state === 'RUB' || e.state === 'CHARGE_TELL' || e.state === 'CHARGE' || e.state === 'TELL' || e.state === 'LUNGE';
    if (laneState) {
      const f = e.state === 'RUB' && e.dashDir ? e.dashDir : e.state === 'CHARGE' && e.chargeDir ? e.chargeDir : e.state === 'LUNGE' && e.lungeDir ? e.lungeDir : e.forward();
      const ahead = dx * f.x + dz * f.z;
      const side = dx * f.z - dz * f.x;
      const width = 1.2 + e.bigness * 1.8;
      const reach = e.state === 'TELL' || e.state === 'LUNGE' ? 6 : 20;
      if (ahead > -0.5 && ahead < reach && Math.abs(side) < width) {
        const perp = _b.set(f.z, 0, -f.x).multiplyScalar(side >= 0 ? 1 : -1);
        if (pip.requestDodge(perp)) return 'lane';
      }
    }
    // falling crumbs (boss shower): step out of the landing circle
    if (e.crumbs) {
      for (const c of e.crumbs) {
        if (c.t / c.dur > 0.45 && Math.hypot(pip.pos.x - c.to.x, pip.pos.z - c.to.z) < 1.8) {
          const away = _b.set(pip.pos.x - c.to.x, 0, pip.pos.z - c.to.z);
          if (away.lengthSq() < 1e-3) away.set(1, 0, 0);
          if (pip.requestDodge(away)) return 'crumb';
        }
      }
    }
  }
  return null;
}
