/**
 * [INPUT]: depends on SPRAY (WeaponSystem), PLAYER (PlayerController), THROW (ThrowSystem), REWARDS (./Progression)
 * [OUTPUT]: exports ITEMS/itemDef/CHARM_SLOTS (permanent arsenal), BOONS/BoonDef/Rarity/BOON_DAMAGE_CAP (run boons) and Arsenal
 *           (equip, rollBoons with the re-roll guarantee, takeBoon, rerolls, carried golds, applyStats)
 * [POS]: the one place WAI's tuning is rebuilt from a base snapshot (caps, charms, boons). main.ts offers boons after each
 *        Guardian; pity rule: a stock's re-rolls show gold at least once (its last re-roll guarantees it).
 *        Gold boons held at a level's end are saved (wd.carried.v1) and held again from the next level's start. Damage boons are capped (NOTES in docs/difficulty).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { SPRAY } from '../weapon/WeaponSystem';
import { PLAYER } from '../player/PlayerController';
import { THROW } from '../weapon/ThrowSystem';
import { REWARDS, type RewardId } from './Progression';

/**
 * The Arsenal: permanent unlocks you CHOOSE to equip (1 spray cap, 1 gadget, 3 charms),
 * plus this run's BOONS (pick 1 of 3 after each Guardian — roguelike stacking, reset per run).
 *
 * Every tuning object (SPRAY / PLAYER / THROW / REWARDS) is rebuilt from a base snapshot by
 * applyStats(), so equipping, unequipping and boons never drift.
 */

export type Slot = 'weapon' | 'gadget' | 'charm';
export type ItemId =
  | 'classic' | 'fatcap' | 'needle' | 'blobber'
  | 'bomb' | 'patch' | 'sprinkler' | 'magnet'
  | 'sneakers' | 'big_can' | 'extra_heart' | 'rocket_arm' | 'splash_boots' | 'lucky_ink' | 'quickstep' | 'leech';

export interface ItemDef {
  id: ItemId;
  slot: Slot;
  name: string;
  desc: string;
  /** emoji badge (stickers come later) */
  /** owned from the start (else unlocked by the RewardId of the same name). */
  starter?: boolean;
  /** gadget cooldown (s) */
  cd?: number;
}

export const ITEMS: ItemDef[] = [
  // spray caps
  { id: 'classic', slot: 'weapon', name: 'Classic Can', desc: 'A steady stream, 8 m reach. Does a bit of everything.', starter: true },
  { id: 'fatcap', slot: 'weapon', name: 'Fat Cap', desc: 'A wide, short fan (5 m reach). Shreds crowds up close.' },
  { id: 'needle', slot: 'weapon', name: 'Needle Cap', desc: 'A long, thin jet (13 m reach). Slow but each drop hits twice as hard.' },
  { id: 'blobber', slot: 'weapon', name: 'Blob Lobber', desc: 'Lobs fat paint blobs in an arc. Huge splats, slow rate.' },
  // gadgets (B)
  { id: 'bomb', slot: 'gadget', name: 'Paint Bomb', desc: 'Lob a bomb along your aim: KA-SPLASH in a wide ring.', starter: true, cd: 8 },
  { id: 'patch', slot: 'gadget', name: 'Patch Sticker', desc: 'Slap on a patch: heal 1 heart.', starter: true, cd: 30 },
  { id: 'sprinkler', slot: 'gadget', name: 'Sprinkler Can', desc: 'Plant a can that sprays the nearest creature for 7 s.', cd: 18 },
  { id: 'magnet', slot: 'gadget', name: 'Magnet Pulse', desc: 'Pull every paint drop within 16 m to you.', cd: 20 },
  // charms (passive)
  { id: 'sneakers', slot: 'charm', name: 'Swift Sneakers', desc: '+12% run and walk speed.', starter: true },
  { id: 'big_can', slot: 'charm', name: 'Big Can', desc: '+50% paint in the tank.' },
  { id: 'extra_heart', slot: 'charm', name: 'Extra Heart', desc: '+1 heart.' },
  { id: 'rocket_arm', slot: 'charm', name: 'Rocket Arm', desc: 'Faster throw charge, longer throws.' },
  { id: 'splash_boots', slot: 'charm', name: 'Splash Boots', desc: 'Stomps burst into a paint bomb.' },
  { id: 'lucky_ink', slot: 'charm', name: 'Lucky Ink', desc: '+5% ENCORE odds on every stamp.' },
  { id: 'quickstep', slot: 'charm', name: 'Quick Step', desc: 'Dodge recovers 45% faster.' },
  { id: 'leech', slot: 'charm', name: 'Ink Leech', desc: 'Repainting a creature heals ½ heart.' },
];

export const CHARM_SLOTS = 3;
export const itemDef = (id: ItemId): ItemDef => ITEMS.find((i) => i.id === id)!;

// ───────────── run boons ─────────────
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export interface BoonDef {
  id: string;
  name: string;
  desc: string;
  rarity: Rarity;
  /** how many times it can stack in one run */
  max: number;
}

export const BOONS: BoonDef[] = [
  { id: 'pressure', name: 'Pressure Valve', desc: 'Paint power +10%.', rarity: 'common', max: 3 },
  { id: 'deepcan', name: 'Deep Can', desc: 'Tank +25%.', rarity: 'common', max: 3 },
  { id: 'refill', name: 'Quick Refill', desc: 'The can refills 30% faster.', rarity: 'common', max: 3 },
  { id: 'fleet', name: 'Fleet Feet', desc: 'Move speed +8%.', rarity: 'common', max: 3 },
  { id: 'spring', name: 'Spring Step', desc: 'Jump height +15%.', rarity: 'common', max: 2 },
  { id: 'hover', name: 'Long Hover', desc: 'JET HOVER lasts 40% longer.', rarity: 'common', max: 2 },
  { id: 'heart', name: 'Spare Heart', desc: '+1 heart and a full heal.', rarity: 'rare', max: 2 },
  { id: 'lucky', name: 'Four-Leaf Ink', desc: 'ENCORE odds +8%.', rarity: 'rare', max: 2 },
  // the push-your-luck stamping is a rare find, not a starting tool
  { id: 'encore', name: 'Golden Stamp', desc: 'Unlocks ENCORE: after a TAG, press E again to keep stamping for bigger payouts — each stamp is riskier.', rarity: 'legendary', max: 1 },
  { id: 'grease', name: 'Gadget Grease', desc: 'Gadget cooldown −30%.', rarity: 'rare', max: 2 },
  { id: 'bigboom', name: 'Bigger Boom', desc: 'Bomb splashes +35% wider and +15% stronger.', rarity: 'rare', max: 2 },
  { id: 'thirsty', name: 'Thirsty Brush', desc: 'Repainting a creature heals ½ heart.', rarity: 'rare', max: 1 },
  { id: 'twin', name: 'Twin Nozzle', desc: 'Spray rate +25% and the can drains 15% slower.', rarity: 'epic', max: 1 },
  { id: 'giant', name: 'Giant Splats', desc: 'Splats ×1.6 and paint power +15%.', rarity: 'epic', max: 1 },
  { id: 'ghost', name: 'Ghost Step', desc: 'Dodge goes further and you stay untouchable longer.', rarity: 'epic', max: 1 },
];
const RARITY_W: Record<Rarity, number> = { common: 62, rare: 30, epic: 8, legendary: 18 };
/** Best first. "Gold" = the best rarity still in the pool (legendary while the Golden Stamp is on offer). */
const RARITY_RANK: Rarity[] = ['legendary', 'epic', 'rare', 'common'];
/**
 * Runaway-stack cap: boons may raise spray damage (paint power × spray rate) to at most this multiple.
 * Without it a 4-pick build (Pressure ×2 + Giant + Twin) cut every fight to 0.43× (docs/difficulty/NOTES.md).
 */
export const BOON_DAMAGE_CAP = 1.6;

// ───────────── base snapshot ─────────────
const pick = <T extends object, K extends keyof T>(o: T, keys: K[]) => Object.fromEntries(keys.map((k) => [k, o[k]])) as Pick<T, K>;
const BASE = {
  spray: pick(SPRAY, ['rate', 'speed', 'gravity', 'life', 'repaint', 'spread', 'aimSpread', 'tank', 'drain', 'regen', 'regenDelay', 'bombDamage', 'bombRadius', 'size', 'reach']),
  player: pick(PLAYER, ['walkSpeed', 'sprintSpeed', 'longLegsSprint', 'jumpHeight', 'longLegsJump', 'maxHp', 'dodgeCooldown', 'dodgeSpeed', 'dodgeInvuln', 'jetTime']),
  throw: pick(THROW, ['chargeTime', 'speedMax']),
};

const KEY = 'wd.arsenal.v1';
/** Gold boons carried from one level to the next (ids), saved with the game. */
const CARRY_KEY = 'wd.carried.v1';
/**
 * Test harnesses (?test) neither load nor save carried golds unless the URL also says `carry`: the bots keep meaning
 * what they meant, run after run in one browser profile.
 */
const carryOn = (() => {
  try {
    const q = new URLSearchParams(location.search);
    return !q.has('test') || q.has('carry');
  } catch {
    return true;
  }
})();
interface Saved {
  weapon: ItemId;
  gadget: ItemId | null;
  charms: ItemId[];
}

export class Arsenal {
  private saved: Saved = { weapon: 'classic', gadget: 'bomb', charms: [] };
  /** This run's boons (id → stacks). */
  readonly boons = new Map<string, number>();
  /** Ownership check (Progression rewards); set by the app. */
  owns: (id: ItemId) => boolean = (id) => !!itemDef(id).starter;
  onChange: (() => void) | null = null;

  constructor() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || '');
      if (s && s.weapon) this.saved = { weapon: s.weapon, gadget: s.gadget ?? null, charms: Array.isArray(s.charms) ? s.charms : [] };
    } catch {
      /* fresh */
    }
  }

  get weapon(): ItemId {
    return this.owns(this.saved.weapon) ? this.saved.weapon : 'classic';
  }
  get gadget(): ItemId | null {
    return this.saved.gadget && this.owns(this.saved.gadget) ? this.saved.gadget : null;
  }
  get charms(): ItemId[] {
    return this.saved.charms.filter((c) => this.owns(c)).slice(0, CHARM_SLOTS);
  }
  equipped(id: ItemId): boolean {
    return this.weapon === id || this.gadget === id || this.charms.includes(id);
  }
  has(id: ItemId): boolean {
    return this.charms.includes(id);
  }

  /** Toggle an item: weapons swap, the gadget toggles, charms fill the 3 slots (full → refused). */
  toggle(id: ItemId): 'on' | 'off' | 'full' | 'locked' {
    if (!this.owns(id)) return 'locked';
    const d = itemDef(id);
    let r: 'on' | 'off' | 'full';
    if (d.slot === 'weapon') {
      this.saved.weapon = id;
      r = 'on';
    } else if (d.slot === 'gadget') {
      r = this.gadget === id ? 'off' : 'on';
      this.saved.gadget = r === 'on' ? id : null;
    } else if (this.charms.includes(id)) {
      this.saved.charms = this.charms.filter((c) => c !== id);
      r = 'off';
    } else if (this.charms.length >= CHARM_SLOTS) return 'full';
    else {
      this.saved.charms = [...this.charms, id];
      r = 'on';
    }
    this.save();
    this.onChange?.();
    return r;
  }

  boon(id: string): number {
    return this.boons.get(id) ?? 0;
  }

  /**
   * Three different boons, rarity-weighted, skipping maxed ones. `rerolled`: this hand was paid for with a re-roll
   * (rerolls already decremented). Pity rule: the re-rolls of one stock show a gold boon at least once — if this is the
   * stock's last re-roll and none of its hands has shown gold yet, one card is gold (best rarity left), at a random
   * place; otherwise today's odds. Returns the hand and the index of the guaranteed card (−1 none).
   */
  rollBoons(n = 3, rerolled = false): { hand: BoonDef[]; golden: number } {
    // ENCORE odds only matter once the Golden Stamp is found
    const pool = BOONS.filter((b) => this.boon(b.id) < b.max && (b.id !== 'lucky' || this.boon('encore') > 0));
    const best = RARITY_RANK.find((r) => pool.some((b) => b.rarity === r));
    let star: BoonDef | null = null;
    if (rerolled && this.rerolls === 0 && !this.goldSeen) {
      const tier = pool.filter((b) => b.rarity === best);
      if (tier.length) {
        star = tier[Math.floor(Math.random() * tier.length)];
        pool.splice(pool.indexOf(star), 1);
        n--;
      }
    }
    const out: BoonDef[] = [];
    while (out.length < n && pool.length) {
      const tot = pool.reduce((a, b) => a + RARITY_W[b.rarity], 0);
      let r = Math.random() * tot;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= RARITY_W[pool[i].rarity];
        if (r <= 0) break;
      }
      out.push(pool.splice(i, 1)[0]);
    }
    let golden = -1;
    if (star) {
      golden = Math.floor(Math.random() * (out.length + 1));
      out.splice(golden, 0, star);
    }
    // shown counts, picked or not
    if (rerolled && out.some((b) => b.rarity === best)) this.goldSeen = true;
    return { hand: out, golden };
  }

  takeBoon(id: string): void {
    this.boons.set(id, this.boon(id) + 1);
    this.onChange?.();
  }

  /** Free re-rolls of a boon hand, per run. */
  rerolls = 2;
  /**
   * Has a re-rolled hand of the current stock shown gold? The guarantee is once per stock: refilling the stock
   * (resetRun, each level) clears it. A future grant of extra re-rolls just raises the stock; the guarantee then
   * fires on whichever re-roll empties it.
   */
  goldSeen = false;

  /** The next re-roll is the stock's last and no gold has shown yet: it will carry the guarantee. */
  get rerollPromisesGold(): boolean {
    return this.rerolls === 1 && !this.goldSeen;
  }

  /** Gold boons this level started with because WAI held them when he finished an earlier level. */
  carriedNow: BoonDef[] = [];

  /**
   * A new level (or a restart): boons clear, then the carried golds come back at one stack each. Held boons are never
   * offered again (rollBoons skips maxed ones), so a gold is never granted twice. Dying keeps boons (no reset).
   */
  resetRun(): void {
    this.boons.clear();
    this.rerolls = 2;
    this.goldSeen = false;
    this.carriedNow = this.loadCarried();
    for (const b of this.carriedNow) this.boons.set(b.id, 1);
  }

  /** Level complete: every gold boon held now travels to the next level (and survives a reload). */
  saveCarried(): void {
    if (!carryOn) return;
    const gold = BOONS.filter((b) => b.rarity === 'legendary' && this.boon(b.id) > 0).map((b) => b.id);
    try {
      localStorage.setItem(CARRY_KEY, JSON.stringify(gold));
    } catch {
      /* private mode */
    }
  }

  /** A new game: nothing carried. (No new-game button exists yet; dev reset and tests call it.) */
  clearCarried(): void {
    try {
      localStorage.removeItem(CARRY_KEY);
    } catch {
      /* ignore */
    }
    this.carriedNow = [];
  }

  private loadCarried(): BoonDef[] {
    if (!carryOn) return [];
    try {
      const ids = JSON.parse(localStorage.getItem(CARRY_KEY) || '[]') as string[];
      return BOONS.filter((b) => b.rarity === 'legendary' && ids.includes(b.id));
    } catch {
      return [];
    }
  }

  /** Rebuild every tuning object from the base + weapon cap + charms + boons. */
  applyStats(): void {
    Object.assign(SPRAY, BASE.spray);
    Object.assign(PLAYER, BASE.player);
    Object.assign(THROW, BASE.throw);
    const b = (id: string) => this.boon(id);
    // spray cap
    const w = this.weapon;
    if (w === 'fatcap') Object.assign(SPRAY, { rate: SPRAY.rate * 1.35, spread: SPRAY.spread * 2.6, aimSpread: SPRAY.aimSpread * 3, life: SPRAY.life * 0.62, repaint: SPRAY.repaint * 0.95, drain: SPRAY.drain * 1.1, reach: 5 });
    if (w === 'needle') Object.assign(SPRAY, { rate: SPRAY.rate * 0.6, spread: SPRAY.spread * 0.3, aimSpread: SPRAY.aimSpread * 0.4, speed: SPRAY.speed * 1.5, life: SPRAY.life * 1.15, gravity: SPRAY.gravity * 0.4, repaint: SPRAY.repaint * 2, drain: SPRAY.drain * 0.85, size: 0.8, reach: 13 });
    if (w === 'blobber') Object.assign(SPRAY, { rate: SPRAY.rate * 0.16, spread: SPRAY.spread * 0.5, speed: SPRAY.speed * 0.9, gravity: SPRAY.gravity * 2.2, life: SPRAY.life * 1.7, repaint: SPRAY.repaint * 6.5, drain: SPRAY.drain * 1.15, size: 2.6, reach: 9 });
    // charms
    if (this.has('big_can')) SPRAY.tank *= 1.5;
    if (this.has('extra_heart')) PLAYER.maxHp += 2;
    if (this.has('rocket_arm')) Object.assign(THROW, { chargeTime: 0.6, speedMax: 32 });
    if (this.has('sneakers')) for (const k of ['walkSpeed', 'sprintSpeed', 'longLegsSprint'] as const) PLAYER[k] *= 1.12;
    if (this.has('quickstep')) PLAYER.dodgeCooldown *= 0.55;
    // boons
    // damage boons (trimmed in the difficulty pass; a full build ≈ 1.7× a bare can, not 2.3–2.8×)
    const power = 1 + 0.1 * b('pressure') + 0.15 * b('giant');
    const rate = b('twin') ? 1.25 : 1;
    SPRAY.repaint *= Math.min(power, BOON_DAMAGE_CAP / rate);
    SPRAY.tank *= 1 + 0.25 * b('deepcan');
    SPRAY.regen *= 1 + 0.3 * b('refill');
    SPRAY.regenDelay *= Math.pow(0.8, b('refill'));
    for (const k of ['walkSpeed', 'sprintSpeed', 'longLegsSprint'] as const) PLAYER[k] *= 1 + 0.08 * b('fleet');
    PLAYER.jumpHeight *= 1 + 0.15 * b('spring');
    PLAYER.longLegsJump *= 1 + 0.15 * b('spring');
    PLAYER.jetTime *= 1 + 0.4 * b('hover');
    PLAYER.maxHp += 2 * b('heart');
    SPRAY.bombRadius *= 1 + 0.35 * b('bigboom');
    SPRAY.bombDamage *= 1 + 0.15 * b('bigboom');
    if (b('twin')) Object.assign(SPRAY, { rate: SPRAY.rate * rate, drain: SPRAY.drain * 0.85 });
    if (b('giant')) SPRAY.size *= 1.6;
    if (b('ghost')) Object.assign(PLAYER, { dodgeSpeed: PLAYER.dodgeSpeed * 1.3, dodgeInvuln: PLAYER.dodgeInvuln * 1.5 });
    // runtime flags
    REWARDS.encore = b('encore') > 0;
    REWARDS.luckyInk = this.has('lucky_ink');
    REWARDS.encoreBonus = (this.has('lucky_ink') ? 0.05 : 0) + 0.08 * b('lucky');
    REWARDS.leech = this.has('leech') || b('thirsty') > 0;
    REWARDS.gadgetCdMul = Math.pow(0.7, b('grease'));
    REWARDS.splashBoots = this.has('splash_boots');
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.saved));
    } catch {
      /* private mode */
    }
  }
}

/** Items that come from a Sticker Book challenge reward. */
export const isRewardItem = (id: ItemId): id is ItemId & RewardId => !itemDef(id).starter;
