/**
 * [INPUT]: depends on the shared play systems' types (PlayerController, WeaponSystem, CombatDirector, ThrowSystem,
 *          OrganSystem, OrganInventory, PhysicsWorld, EventBus, Guide, Effects, Crown/Checkpoint/PaintDrop)
 * [OUTPUT]: exports the PlaySession surface, LevelId, SessionStats, DevLevelInfo、PromptView、StoryLike, BossLike, WithEffects
 * [POS]: the contract GameSession, HarborSession and WorksSession all satisfy. Everything outside a level — the HUD,
 *        the guide arrow, Pip, WD_AGENT, the dev panel — talks only to this, so a new level costs them nothing.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GameContext } from '../core/Context';
import type { EventBus } from '../core/Events';
import type { PhysicsWorld } from '../core/PhysicsWorld';
import type { OrganInventory } from '../organs/OrganInventory';
import type { OrganSystem } from '../organs/OrganSystem';
import type { PlayerController } from '../player/PlayerController';
import type { WeaponSystem } from '../weapon/WeaponSystem';
import type { ThrowSystem } from '../weapon/ThrowSystem';
import type { CombatDirector } from '../combat/CombatDirector';
import type { EnemyBase } from '../enemy/EnemyBase';
import type { OrganHost } from '../hosts/OrganHost';
import type { Crown, Checkpoint, PaintDrop } from './Collectibles';
import type { Guide } from '../ui/Guide';
import type { Effects } from '../render/Effects';
import type { MusicMood } from '../audio/Music';
import type { SessionStats } from './GameSession';
import type { SpringSpot } from './Ambient';

/** Every playable level. */
export interface PromptView {
  key: string;
  text: string;
  enabled: boolean;
  action?: string;
}

export type LevelId = 'plaza' | 'harbor' | 'works';

/** The level's boss, as the shared systems (HUD, Pip, AI bridge, dev panel) see it. */
export type BossLike = EnemyBase & { awake: boolean; engage(): void; readonly counterHint: string };

/** What the shared story layer exposes (cutscene lock + skip). */
export interface StoryLike {
  locked: boolean;
  skip(): void;
  update(dt: number): void;
}

/** Dev panel description of a level (map, chapters, cutscenes). Level 1 uses the panel's built-in tables. */
export interface DevLevelInfo {
  stages: { id: string; label: string; note: string }[];
  /** Map bounds (world x0, x1, z0, z1). */
  bounds: [number, number, number, number];
  outline: [number, number][];
  height(x: number, z: number): { y: number; zone: string };
  zoneColors: Record<string, [number, number, number]>;
  zoneNames: Record<string, string>;
  labels: [string, number, number][];
  guardians: string[];
  cines: { id: string; label: string; run(): void }[];
}

/**
 * One playthrough of one level. GameSession (Blind Plaza) and HarborSession (Mute Harbor)
 * both satisfy this — App, the HUD, the guide arrow, Pip (src/coop), WD_AGENT and the dev panel
 * only talk to this surface.
 */
export interface PlaySession {
  readonly levelId: LevelId;
  readonly ctx: GameContext;
  readonly events: EventBus;
  readonly physics: PhysicsWorld;
  readonly inventory: OrganInventory;
  readonly enemies: EnemyBase[];
  readonly player: PlayerController;
  readonly weapon: WeaponSystem;
  readonly organs: OrganSystem;
  readonly combat: CombatDirector;
  readonly throws: ThrowSystem;
  readonly guide: Guide;
  readonly story: StoryLike;
  readonly allHosts: OrganHost[];
  readonly level: { crowns: Crown[]; checkpoints: Checkpoint[]; drops: PaintDrop[] };
  readonly woken: Set<string>;
  readonly boss: BossLike;
  /** Boss arena (Pip stays inside it during the fight). */
  readonly arena: { center: THREE.Vector3; radius: number };
  /** Below this you fell off the island. */
  readonly killY: number;
  bossDone: boolean;
  completed: boolean;
  frozen: boolean;
  allowUnlockedFire: boolean;
  splashBoots: boolean;
  stats: SessionStats;
  presence: number;
  mood: MusicMood;
  coop: import('../coop/Coop').CoopPartner | null;
  camYaw: number;
  readonly debugStages: readonly string[];
  /** Optional: level-specific dev panel tables (level 1 keeps the panel's own). */
  readonly devInfo?: DevLevelInfo;
  /** Is this point in the level's water (the AI partner gets fished out)? Level 3: the shredder pit. */
  inWater(p: THREE.Vector3): boolean;
  /** Painted springs ready to throw (the partner's brain walks onto one to follow WAI). Levels 1 and 2. */
  springPads?(): readonly SpringSpot[];
  /** Belt velocity (m/s) under feet on a conveyor belt, else null. Level 3; WAI and the partner both ride it. */
  beltCarry?(feet: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null;
  debugWarp(stage: string): void;
  stopCine(): void;
  startStory(): void;
  objective(): { title: string; hint: string };
  /** The objective hint BEFORE the stuck rule hides it: the test bots and WD_AGENT read this. */
  readonly hintFull: string;
  prompt(): PromptView | null;
  bossTarget(): EnemyBase | null;
  step(dt: number): void;
  render(alpha: number, frameDt: number): void;
  cameraBlocker: (c: RAPIER.Collider) => boolean;
  dispose(): void;
}

/** Narrow helper for code that needs the effects module (loading prewarm). */
export type WithEffects = { effects: Effects };
