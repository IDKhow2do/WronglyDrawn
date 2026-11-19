import type { SessionStats } from '../level/GameSession';

export type RankLetter = 'S' | 'A' | 'B' | 'C';

export interface RankResult {
  letter: RankLetter;
  /** 0–100 */
  score: number;
  /** Short praise under the stamp (i18n key). */
  word: string;
}

const WORDS: Record<RankLetter, string> = { S: 'MASTERPIECE!', A: 'GREAT WORK!', B: 'NICE SKETCH!', C: 'ROUGH DRAFT' };
const ORDER: RankLetter[] = ['C', 'B', 'A', 'S'];

/**
 * A run's rank: crowns found matter most, then staying clean (no smudges, few hits),
 * then how well you aimed. Time is shown as a record but never punished.
 */
export function rankRun(s: SessionStats): RankResult {
  const crowns = s.totalCrowns ? s.crowns / s.totalCrowns : 1;
  const acc = s.shots ? s.hits / s.shots : 0;
  const score = Math.round(
    45 * crowns + (s.smudges === 0 ? 20 : s.smudges === 1 ? 10 : 0) + Math.max(0, 20 - s.damageTaken * 2) + 15 * Math.min(1, acc / 0.55),
  );
  const letter: RankLetter = score >= 88 ? 'S' : score >= 70 ? 'A' : score >= 50 ? 'B' : 'C';
  return { letter, score, word: WORDS[letter] };
}

export interface LevelBest {
  time: number;
  rank: RankLetter;
  crowns: number;
}

const KEY = 'wd.best.v1';

function load(): Record<string, LevelBest> {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') as Record<string, LevelBest>;
  } catch {
    return {};
  }
}

/** Store this run against the level's records; says which ones it beat. */
export function recordBest(level: string, s: SessionStats, rank: RankLetter): { prev: LevelBest | null; newTime: boolean; newRank: boolean; newCrowns: boolean } {
  const all = load();
  const prev = all[level] ?? null;
  const newTime = !prev || s.time < prev.time;
  const newRank = !prev || ORDER.indexOf(rank) > ORDER.indexOf(prev.rank);
  const newCrowns = !prev || s.crowns > prev.crowns;
  all[level] = {
    time: newTime ? s.time : prev!.time,
    rank: newRank ? rank : prev!.rank,
    crowns: newCrowns ? s.crowns : prev!.crowns,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
  return { prev, newTime, newRank, newCrowns };
}

export function bestFor(level: string): LevelBest | null {
  return load()[level] ?? null;
}
