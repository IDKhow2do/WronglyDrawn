/**
 * [INPUT]: depends on BOSS_HP from meta/Difficulty; EnemyBase (baseHp, engaged, awake) from enemy/EnemyBase
 * [OUTPUT]: exports bossInFight() (the live boss nearest WAI), bossMood() (the 'boss' music mood while a boss or mid-boss fight is live, else null) and bossHeat()
 * [POS]: the one rule every session's music line uses for boss fights (GameSession, HarborSession, WorksSession).
 *        A fight is live while a creature with base paint ≥ BOSS_HP is engaged (alerted, not repainted) and awake
 *        (bosses with an `awake` flag), within BOSS_REACH of WAI. The fight's own rules end it: a repaint (STUNNED),
 *        WAI leaving the square (mid-bosses drop their alert), a respawn far away (sessions calm chasers).
 *        Quiet moments (phase roars, grace beats) keep `engaged`, so the music holds. The Red Pen's 'boss_final'
 *        follows SoulsFight.mode in WorksSession, not this rule.
 * [PROTOCOL]: Update this header on change, then check docs/audio/BOSS_MUSIC.md
 */
import type * as THREE from 'three';
import { BOSS_HP } from '../meta/Difficulty';
import type { EnemyBase } from '../enemy/EnemyBase';

/** Metres from WAI: farther than this, a boss fight no longer drives the music (arenas are ≤ 22 m across). */
const BOSS_REACH = 32;

/** The live boss fight nearest WAI, or null. `skip` leaves out a boss whose music the session sets itself. */
export function bossInFight(enemies: readonly EnemyBase[], at: THREE.Vector3, skip?: EnemyBase): EnemyBase | null {
  let best: EnemyBase | null = null;
  let bd = BOSS_REACH;
  for (const e of enemies) {
    if (e === skip || e.disposed || e.baseHp < BOSS_HP || !e.engaged) continue;
    if ((e as EnemyBase & { awake?: boolean }).awake === false) continue;
    const d = e.pos.distanceTo(at);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** 'boss' while a boss or mid-boss fight is live near WAI, else null (the session's own mood rule applies). */
export function bossMood(enemies: readonly EnemyBase[], at: THREE.Vector3, skip?: EnemyBase): 'boss' | null {
  return bossInFight(enemies, at, skip) ? 'boss' : null;
}

/** 0 (full corruption) … 1 (repainted): how far a boss fight has come. Music opens up with it. */
export function bossHeat(boss: EnemyBase | null): number {
  if (!boss || boss.maxHp <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - boss.hp / boss.maxHp));
}
