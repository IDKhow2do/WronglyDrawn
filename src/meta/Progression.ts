import type { EventBus } from '../core/Events';
import type { CapeSkin } from '../player/Cape';

/**
 * Challenges → rewards (the positive-feedback loop). Unlocks persist in
 * localStorage, so replays keep what you earned. Rewards are action upgrades
 * and looks, never needed for the story path.
 */
export type RewardId =
  | 'skin_rainbow' | 'skin_cosmic' | 'skin_gold' | 'splash_boots' | 'rocket_arm' | 'big_can' | 'extra_heart' | 'lucky_ink'
  | 'fatcap' | 'needle' | 'blobber' | 'sprinkler' | 'magnet' | 'quickstep' | 'leech';

export interface Challenge {
  id: string;
  title: string;
  goal: number;
  reward: RewardId;
  rewardName: string;
  icon: string; // sticker image (assets/stickers)
  /** Only completable in this level (others show it greyed with a tag). */
  level?: 'plaza' | 'harbor' | 'works';
}

export const CHALLENGES: Challenge[] = [
  { id: 'facades', title: 'Spray 5 sleeping buildings awake', goal: 5, reward: 'skin_rainbow', rewardName: 'Rainbow Drip Cape', icon: 'skin_rainbow' },
  { id: 'stomps', title: 'Stomp 3 creatures', goal: 3, reward: 'splash_boots', rewardName: 'Splash Boots (stomps burst paint)', icon: 'legs' },
  { id: 'interrupts', title: 'Interrupt an attack with a throw', goal: 1, reward: 'rocket_arm', rewardName: 'Rocket Arm (faster charge, longer throws)', icon: 'pistol' },
  { id: 'perfects', title: 'Perfect-dodge 3 times', goal: 3, reward: 'skin_cosmic', rewardName: 'Cosmic Cape', icon: 'skin_cosmic' },
  { id: 'crowns', title: 'Collect 6 crowns', goal: 6, reward: 'big_can', rewardName: 'Big Can (+50% paint)', icon: 'eye' },
  { id: 'mutant', title: 'Repaint the Crooked-Leg Mutant', goal: 1, reward: 'extra_heart', rewardName: 'Extra Heart', icon: 'mouth', level: 'plaza' },
  { id: 'encore', title: 'Cash out an ENCORE at ×3 or more', goal: 1, reward: 'lucky_ink', rewardName: 'Lucky Ink (+5% encore odds)', icon: 'pistol' },
  { id: 'springs', title: 'Bounce on 3 painted springs', goal: 3, reward: 'skin_gold', rewardName: 'Golden Cape', icon: 'skin_gold' },
  // arsenal unlocks (equip them in the ARSENAL — nothing is forced on)
  { id: 'repaints', title: 'Repaint 6 creatures', goal: 6, reward: 'fatcap', rewardName: 'Fat Cap (spray cap)', icon: 'pistol' },
  { id: 'jumps', title: 'Jump 50 times', goal: 50, reward: 'quickstep', rewardName: 'Quick Step (charm)', icon: 'legs' },
  { id: 'drops', title: 'Collect 30 paint drops in one run', goal: 30, reward: 'sprinkler', rewardName: 'Sprinkler Can (gadget)', icon: 'pistol' },
  { id: 'encores', title: 'Cash out 3 ENCOREs', goal: 3, reward: 'magnet', rewardName: 'Magnet Pulse (gadget)', icon: 'eye' },
  { id: 'plaza_done', title: 'Wake up Blind Plaza', goal: 1, reward: 'needle', rewardName: 'Needle Cap (spray cap)', icon: 'eye', level: 'plaza' },
  { id: 'moths', title: 'Repaint 3 Hush moths', goal: 3, reward: 'leech', rewardName: 'Ink Leech (charm)', icon: 'mouth', level: 'harbor' },
  { id: 'harbor_done', title: 'Make Mute Harbor sing', goal: 1, reward: 'blobber', rewardName: 'Blob Lobber (spray cap)', icon: 'mouth', level: 'harbor' },
];

const KEY = 'wd.progress.v1';

/** Live reward flags read by gameplay systems that don't hold the Progression (combat). */
export const REWARDS = { encore: false, luckyInk: false, encoreBonus: 0, leech: false, gadgetCdMul: 1, splashBoots: false };

interface Saved {
  unlocked: RewardId[];
  skin: CapeSkin;
  best: Record<string, number>;
}

function load(): Saved {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '');
    if (s && Array.isArray(s.unlocked)) return { unlocked: s.unlocked, skin: s.skin ?? 'red', best: s.best ?? {} };
  } catch {
    /* fresh */
  }
  return { unlocked: [], skin: 'red', best: {} };
}

export class Progression {
  private saved = load();
  constructor() {
  }
  /** This run's counters. */
  readonly count: Record<string, number> = {};
  onUnlock: ((c: Challenge) => void) | null = null;
  onChange: (() => void) | null = null;

  has(r: RewardId): boolean {
    return this.saved.unlocked.includes(r);
  }

  get skin(): CapeSkin {
    return this.saved.skin;
  }

  setSkin(s: CapeSkin): void {
    if (s !== 'red' && !this.has(`skin_${s}` as RewardId)) return;
    this.saved.skin = s;
    this.save();
    this.onChange?.();
  }

  progress(c: Challenge): number {
    return this.has(c.reward) ? c.goal : Math.min(c.goal, Math.max(this.count[c.id] ?? 0, this.saved.best[c.id] ?? 0));
  }

  bump(id: string, n = 1): void {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c) return;
    this.count[id] = (this.count[id] ?? 0) + n;
    this.saved.best[id] = Math.max(this.saved.best[id] ?? 0, this.count[id]);
    if (!this.has(c.reward) && this.count[id] >= c.goal) {
      this.saved.unlocked.push(c.reward);
      this.save();
      this.onUnlock?.(c);
    } else this.save();
    this.onChange?.();
  }

  /** Wire the session's events to the counters. */
  attach(events: EventBus, levelId: string): void {
    for (const k of Object.keys(this.count)) delete this.count[k];
    events.on('facade:woken', () => this.bump('facades'));
    events.on('enemy:stomped', () => this.bump('stomps'));
    events.on('enemy:interrupted', () => this.bump('interrupts'));
    events.on('player:perfect', () => this.bump('perfects'));
    events.on('crown:collected', ({ count }) => {
      const prev = this.count.crowns ?? 0;
      if (count > prev) this.bump('crowns', count - prev);
    });
    events.on('enemy:stunned', ({ kind }) => {
      if (kind === 'crookedLeg') this.bump('mutant');
      if (kind === 'hushmoth') this.bump('moths');
      this.bump('repaints');
    });
    events.on('player:jumped', () => this.bump('jumps'));
    events.on('paint:collected', ({ count }) => {
      const prev = this.count.drops ?? 0;
      if (count > prev) this.bump('drops', count - prev);
    });
    events.on('level:complete', () => {
      if (levelId === 'harbor' || levelId === 'plaza') this.bump(levelId === 'harbor' ? 'harbor_done' : 'plaza_done');
    });
    events.on('spring:bounce', () => this.bump('springs'));
    events.on('encore:cashout', ({ mult }) => {
      if (mult >= 3) this.bump('encore');
      this.bump('encores');
    });
  }

  /** Dev tools. */
  debugUnlockAll(): void {
    for (const c of CHALLENGES) if (!this.has(c.reward)) this.saved.unlocked.push(c.reward);
    this.save();
    this.onChange?.();
  }

  debugReset(): void {
    this.saved = { unlocked: [], skin: 'red', best: {} };
    for (const k of Object.keys(this.count)) delete this.count[k];
    this.save();
    this.onChange?.();
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      /* private mode */
    }
  }
}
