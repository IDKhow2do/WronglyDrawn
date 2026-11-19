import type * as THREE from 'three';
import type { AssetManager } from './AssetManager';
import type { EventBus } from './Events';
import type { InputManager } from './InputManager';
import type { PhysicsWorld } from './PhysicsWorld';
import type { CameraController } from '../render/CameraController';
import type { OrganInventory } from '../organs/OrganInventory';
import type { Effects } from '../render/Effects';
import type { AudioEngine } from '../audio/AudioEngine';
import type { Damageable } from '../combat/Damage';

export interface TimeFx {
  /** Freeze the simulation for a few real milliseconds (impact). */
  hitstop(seconds: number): void;
  /** Slow motion for a moment. */
  slowmo(scale: number, seconds: number): void;
}

/** Combat juice shared with weapons/enemies (implemented by CombatDirector). */
export interface CombatFx {
  /** Player paint damage multiplier (Paint Time doubles it). */
  readonly paintMul: number;
  /** 2-frame impact flash (0..1). */
  impact(strength: number): void;
}

/** Shared services handed to every gameplay system of one level session. */
export interface GameContext {
  scene: THREE.Scene;
  physics: PhysicsWorld;
  assets: AssetManager;
  events: EventBus;
  input: InputManager;
  camera: CameraController;
  inventory: OrganInventory;
  effects: Effects;
  audio: AudioEngine;
  time: TimeFx;
  combat: CombatFx;
  /** Parent for everything the level spawns (removed wholesale on restart). */
  root: THREE.Group;
  /** Damageables within a radius (splash damage, bites). */
  damageablesNear(point: THREE.Vector3, radius: number): { target: Damageable; point: THREE.Vector3 }[];
}
