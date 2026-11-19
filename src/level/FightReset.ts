/**
 * [INPUT]: depends on Difficulty (`bossReset` row) from meta/Difficulty; bossInFight from ./BossMood; EnemyBase.resetFight
 * [OUTPUT]: exports FightReset (smudged(), respawn())
 * [POS]: the one rule for "a smudge restarts the boss fight", shared by GameSession, HarborSession and WorksSession.
 *        At the smudge it notes the boss fight WAI lost (the live boss nearest him, BossMood's rule); at the respawn it
 *        calls that boss's resetFight(). 轻松与普通保留头目已受的伤害。
 *        The Red Pen is skipped by WorksSession: its souls fight restarts itself (SoulsFight.respawn, same rule).
 *        Cleared creatures are never touched: only the lost fight's boss restarts.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type * as THREE from 'three';
import { Difficulty } from '../meta/Difficulty';
import type { EnemyBase } from '../enemy/EnemyBase';
import { bossInFight } from './BossMood';

export class FightReset {
  private lost: EnemyBase | null = null;

  /** WAI was smudged at `at`: note the boss fight he lost, if this difficulty restarts it. */
  smudged(enemies: readonly EnemyBase[], at: THREE.Vector3, skip?: EnemyBase): void {
    this.lost = Difficulty.s.bossReset ? bossInFight(enemies, at, skip) : null;
  }

  /** WAI is redrawn: the lost fight starts over (call after the session's own respawn moves). */
  respawn(): void {
    const boss = this.lost;
    this.lost = null;
    boss?.resetFight();
  }
}
