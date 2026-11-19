/**
 * [INPUT]: depends on localStorage (`wd.difficulty`) and the URL (`?difficulty=gentle|normal|hard`, `?test`)
 * [OUTPUT]: exports DifficultyId, DIFFICULTY_ORDER, DIFFICULTIES (the table), DIFFICULTY_TEXT (names + one-liners)
 *           and the Difficulty singleton (id, s, chosen, set, onChange, hitDamage, healScale, hpMul, tempoFor, swarmCount)
 *           ; SOULS / SoulsTable / soulsTuning() — the souls-like Red Pen fight's own rows (stamina, i-frames, tells, sky ink marks)
 *           ; STAMP / StampTable / stampTuning() — the level-3 Stamp Press hop and shockwave
 *           ; RULER / RulerTable / rulerTuning(), COMPASS / CompassTable / compassTuning() — the Ruler Snake's whip and the
 *             Compass Spinner's closing circle (reach, tells, damage, openings)
 * [POS]: 集中定义轻松、普通和困难。普通沿用上一版轻松，困难沿用上一版普通。
 *        Readers: EnemyBase (paint toughness, tempo), PlayerController
 *        (hit damage, invulnerability, healing), the sessions' swarm spawners (extra grubs / moths),
 *        level/FightReset (`bossReset`: a smudge restarts the boss fight at full paint).
 *        Creatures never test the level themselves: they inherit it through EnemyBase.
 *        ui/DifficultyPicker shows the first-run choice and the pause setting. Numbers + reasons: docs/difficulty/NOTES.md
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export type DifficultyId = 'gentle' | 'normal' | 'hard';
export const DIFFICULTY_ORDER: DifficultyId[] = ['gentle', 'normal', 'hard'];

export interface DifficultyTable {
  /** Extra half hearts on a light hit (base 1). */
  lightExtra: number;
  /** Extra half hearts on a heavy hit (base ≥ 2). */
  heavyExtra: number;
  /** Seconds WAI blinks (cannot be hit) after a hit. */
  invuln: number;
  /** Share of every heal WAI gets: paint drops, checkpoint refills, Ink Leech, gadgets. Fractions bank up. */
  heal: number;
  /** Paint needed to repaint an ordinary creature (× its base corruption). */
  paint: number;
  /** Same for bosses and mid-bosses (base corruption ≥ 1000: Eraser, Hush, Red Inkwell, Red Gramophone, Red Pen). */
  bossPaint: number;
  /** Creature clock: telegraphs, cooldowns, moves and projectiles run this much faster. 1 = as drawn. */
  tempo: number;
  /** Swarm creatures (grubs, moths) per spawn point, on average. Extras stand beside the original. */
  swarm: number;
  /** TAG and ENCORE stamp damage (CombatDirector.TAG_DMG × this): the punish hits harder the gentler the level. */
  tagMul: number;
  /** PAINT SLAM damage (WeaponSystem.SLAM × this). */
  slam: number;
  /** Boss / mid-boss clock (same as `tempo`, for base corruption ≥ BOSS_HP): its attacks come this much sooner. */
  bossTempo: number;
  /** WAI smudged in a boss fight: the boss gets all its paint back and starts again at its first phase (level/FightReset). */
  bossReset: boolean;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyTable> = {
  gentle: { lightExtra: 0, heavyExtra: 0, invuln: 1.4, heal: 1.2, paint: 0.9, bossPaint: 1, tempo: 0.9, swarm: 1, tagMul: 1.15, slam: 1.15, bossTempo: 0.86, bossReset: false },
  normal: { lightExtra: 0, heavyExtra: 0, invuln: 1.1, heal: 1, paint: 1.3, bossPaint: 1.2, tempo: 1, swarm: 1, tagMul: 1, slam: 1, bossTempo: 1, bossReset: false },
  hard: { lightExtra: 0, heavyExtra: 1, invuln: 0.9, heal: 0.75, paint: 1.5, bossPaint: 1.35, tempo: 1.12, swarm: 1.5, tagMul: 1, slam: 1, bossTempo: 1.12, bossReset: true },
};

/** Player-facing names (i18n keys): drawing tools, softest to most permanent. */
export const DIFFICULTY_TEXT: Record<DifficultyId, { name: string; tag: string; line: string }> = {
  gentle: { name: 'CRAYON', tag: 'Gentle', line: 'Creatures attack more slowly and take less paint. Boss damage carries over when WAI is smudged.' },
  normal: { name: 'MARKER', tag: 'Normal', line: 'Creatures take more paint. Boss damage carries over when WAI is smudged.' },
  hard: { name: 'PERMANENT MARKER', tag: 'Hard', line: 'Creatures are tougher and hit harder. Get smudged and the boss gets its paint back.' },
};

/** Base corruption at or above this marks a boss / mid-boss (same line CombatDirector draws for TAG damage). */
export const BOSS_HP = 1000;

const KEY = 'wd.difficulty';
const isId = (v: unknown): v is DifficultyId => v === 'gentle' || v === 'normal' || v === 'hard';

class DifficultyStore {
  id: DifficultyId = 'normal';
  /** Has the player (or a test URL) picked one? If not, the first new game asks. */
  chosen = false;
  private listeners = new Set<(id: DifficultyId) => void>();
  private swarmBank = 0;

  constructor() {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* private mode */
    }
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
    const want = q?.get('difficulty');
    if (isId(want)) {
      this.set(want);
    } else if (isId(stored)) {
      this.id = stored;
      this.chosen = true;
    } else if (q?.has('test') && want !== 'ask') {
      // 测试入口沿用上一版轻松的数值。
      this.id = 'normal';
      this.chosen = true;
    }
  }

  get s(): DifficultyTable {
    return DIFFICULTIES[this.id];
  }

  set(id: DifficultyId): void {
    const changed = id !== this.id;
    this.id = id;
    this.chosen = true;
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* ignore */
    }
    if (changed) for (const f of this.listeners) f(id);
  }

  onChange(f: (id: DifficultyId) => void): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Half hearts a hit of `base` half hearts costs WAI. */
  hitDamage(base: number): number {
    if (base <= 0) return base;
    return base + (base >= 2 ? this.s.heavyExtra : this.s.lightExtra);
  }

  /** Paint-toughness multiplier for a creature drawn with `baseHp` corruption. */
  hpMul(baseHp: number): number {
    return baseHp >= BOSS_HP ? this.s.bossPaint : this.s.paint;
  }

  /** Clock multiplier for a creature drawn with `baseHp` corruption (bosses have their own row). */
  tempoFor(baseHp: number): number {
    return baseHp >= BOSS_HP ? this.s.bossTempo : this.s.tempo;
  }

  /**
   * How many swarm creatures to put down at one spawn point (1 = just the original).
   * Fractional `swarm` values bank up, so ×1.5 alternates one and two.
   */
  swarmCount(): number {
    this.swarmBank += this.s.swarm;
    const n = Math.max(1, Math.floor(this.swarmBank + 1e-6));
    this.swarmBank -= n;
    if (this.swarmBank < 0) this.swarmBank = 0;
    return n;
  }
}

export const Difficulty = new DifficultyStore();

// ───────────── the souls-like Red Pen fight (level 3 roof only) ─────────────
// Read only by src/level/works/SoulsFight, src/combat/Stamina and the Red Pen (src/enemy/RedPen*). Reasons: docs/level3/SOULS.md

export interface SoulsTable {
  /** Stamina bar size; dodge / jump / sprint spend it. */
  stamina: number;
  /** Stamina back per second, after `regenDelay` seconds without spending. */
  regen: number;
  regenDelay: number;
  /** Regen share while the spray is held (0 = spraying pauses it). */
  sprayRegen: number;
  dodgeCost: number;
  jumpCost: number;
  /** Per second of sprinting. */
  sprintCost: number;
  /** Dodge invulnerability (s, from the start of the roll; shown as WAI's white ghost). */
  iframes: number;
  /** Lock after a roll: WAI cannot move, roll or spray (s). */
  recovery: number;
  /** The Pen's wind-ups × this (more = more time to read the tell). */
  tell: number;
  /** The Pen's punish windows (stuck, sprawled, dazed) × this. */
  punish: number;
  /** Half hearts of a heavy Pen hit, before Difficulty.hitDamage (light hits are 1). */
  heavy: number;
  /** Pen corruption × this (on top of bossPaint). */
  penHp: number;
  /** Phase 2: correction marks per sky volley (+1 past the middle of the act). */
  inkMarks: number;
}

export const SOULS: Record<DifficultyId, SoulsTable> = {
  gentle: { stamina: 150, regen: 65, regenDelay: 0.3, sprayRegen: 0.75, dodgeCost: 30, jumpCost: 10, sprintCost: 12, iframes: 0.46, recovery: 0.06, tell: 1.5, punish: 1.55, heavy: 1, penHp: 0.9, inkMarks: 1 },
  normal: { stamina: 130, regen: 55, regenDelay: 0.45, sprayRegen: 0.6, dodgeCost: 34, jumpCost: 12, sprintCost: 14, iframes: 0.38, recovery: 0.08, tell: 1.3, punish: 1.35, heavy: 1, penHp: 1, inkMarks: 2 },
  hard: { stamina: 100, regen: 45, regenDelay: 0.6, sprayRegen: 0.35, dodgeCost: 36, jumpCost: 15, sprintCost: 18, iframes: 0.3, recovery: 0.14, tell: 1, punish: 1, heavy: 2, penHp: 1, inkMarks: 3 },
};

/** This difficulty's souls-fight row. */
export const soulsTuning = (): SoulsTable => SOULS[Difficulty.id];

// ───────────── the Stamp Press (level 3 creature) ─────────────
// Read only by src/enemy/StampPress. Four hops cover 4 × hopD; the slam's shockwave ring reaches shockR from the stamp
// (jump it, or be under / behind the ram). Reasons: docs/level3/SOULS.md "Playtest fixes", item 6.

export interface StampTable {
  /** Metres per hop. */
  hopD: number;
  /** Seconds per hop (the ram is up for most of it: the run-under window). */
  hopT: number;
  /** Shockwave ring radius (m) round each slam. */
  shockR: number;
}

export const STAMP: Record<DifficultyId, StampTable> = {
  gentle: { hopD: 2, hopT: 0.82, shockR: 2.7 },
  normal: { hopD: 2.2, hopT: 0.74, shockR: 3.0 },
  hard: { hopD: 2.6, hopT: 0.68, shockR: 3.4 },
};

/** This difficulty's Stamp Press row. */
export const stampTuning = (): StampTable => STAMP[Difficulty.id];

// ───────────── the Ruler Snake and the Compass Spinner (level 3 creatures) ─────────────
// Read only by src/enemy/RulerSnake and src/enemy/CompassSpinner. Damage is base half hearts before hitDamage (2 = a heavy
// hit). Reasons: docs/level3/ROUND3.md (job 1). EnemyBase's tempo still runs on top of the seconds here.

export interface RulerTable {
  /** Length of the whip's red measuring line (m): it lunges the whole length, flat along the floor. */
  reach: number;
  /** Measuring tell before the whip (s): ticks race down the line; the aim locks 0.35 s before the end. */
  tell: number;
  /** Half hearts the whip costs WAI (before Difficulty.hitDamage). */
  hit: number;
  /** Lying stretched out along its line after a whip (s): the whole ruler is open to paint. */
  rest: number;
  /** Seconds between whips. */
  cd: number;
}

export const RULER: Record<DifficultyId, RulerTable> = {
  gentle: { reach: 6, tell: 1.3, hit: 1, rest: 1.8, cd: 2.7 },
  normal: { reach: 7, tell: 1.15, hit: 2, rest: 1.6, cd: 2.4 },
  hard: { reach: 8, tell: 1.0, hit: 2, rest: 1.4, cd: 2.0 },
};

/** This difficulty's Ruler Snake row. */
export const rulerTuning = (): RulerTable => RULER[Difficulty.id];

export interface CompassTable {
  /** The needle stabs in and the preview circle pulses (s). */
  plant: number;
  /** One turn of the pencil round the needle (s): the circle closes when it is done. */
  turn: number;
  /** The circle is drawn this far beyond WAI's distance (m): he starts inside it and must get out. */
  margin: number;
  /** Half hearts when the circle closes with WAI inside it on foot. */
  hit: number;
  /** Half hearts for stepping on the drawn line (jump it). */
  line: number;
  /** Seconds between circles. */
  cd: number;
}

export const COMPASS: Record<DifficultyId, CompassTable> = {
  gentle: { plant: 1.15, turn: 2.45, margin: 1.4, hit: 1, line: 1, cd: 2.1 },
  normal: { plant: 1.0, turn: 2.2, margin: 1.6, hit: 2, line: 1, cd: 1.8 },
  hard: { plant: 0.9, turn: 1.9, margin: 1.8, hit: 2, line: 1, cd: 1.5 },
};

/** This difficulty's Compass Spinner row. */
export const compassTuning = (): CompassTable => COMPASS[Difficulty.id];
