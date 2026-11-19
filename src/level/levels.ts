import * as THREE from 'three';
import type { AssetManager } from '../core/AssetManager';
import type { TimeFx } from '../core/Context';
import type { InputManager } from '../core/InputManager';
import type { CameraController } from '../render/CameraController';
import type { AudioEngine } from '../audio/AudioEngine';
import type { LevelId, PlaySession } from './Session';
import { GameSession } from './GameSession';
import { HarborSession } from './HarborSession';
import { LEVEL } from './BlindPlaza';
import { HARBOR, harborTitlePose } from './harbor/MuteHarbor';
import { WorksSession } from './works/WorksSession';
import { LIMP, worksIntroPose, worksTitlePose } from './works/LimpWorks';

/**
 * LEVEL REGISTRY — every playable piece of canvas, in order. App (src/main.ts) builds sessions
 * through `create`, the title screen lists them (level select), the completion screen offers `next`.
 * Unlocks persist in localStorage (`wd.levels`): level 1 is always open; finishing a level opens the next.
 */
export interface LevelInfo {
  id: LevelId;
  num: number;
  /** English source (i18n key). */
  name: string;
  /** HUD / title sticker (i18n html key). */
  tagHtml: string;
  /** Area title shown when the intro hands over. */
  firstRegion: string;
  completeTitleHtml: string;
  completeSub: string;
  next: LevelId | null;
  spawnYaw: number;
  /** The live title-screen camera drift over this level. */
  titlePose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
  /** Where the intro push-in to WAI starts, when the title view is not near the spawn (a cut; defaults to the title view). */
  introPose?(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
  /** Completion-screen postcard view (defaults to the title view). */
  victoryPose?(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number };
  create(scene: THREE.Scene, assets: AssetManager, input: InputManager, camera: CameraController, audio: AudioEngine, time: TimeFx): PlaySession;
}

/** Blind Plaza's title drift (the concept view: statue left, sleeping face ahead, road to the tower). */
function plazaTitlePose(time: number): { pos: THREE.Vector3; look: THREE.Vector3; fov: number } {
  const sx = Math.sin(time * 0.16);
  const sy = Math.sin(time * 0.23 + 1.3);
  const pos = new THREE.Vector3(4 + sx * 1.6, 4.2 + sy * 0.2, 31 - sx * 0.4);
  const look = new THREE.Vector3(-7 + sx * 0.8, 7.5 + sy * 0.3, -20);
  return { pos, look, fov: 50 + Math.sin(time * 0.11) * 1.2 };
}

export const LEVELS: Record<LevelId, LevelInfo> = {
  plaza: {
    id: 'plaza',
    num: 1,
    name: 'Blind Plaza',
    tagHtml: 'LV. 1<br/>BLIND PLAZA',
    firstRegion: 'The Harbor',
    completeTitleHtml: 'BLIND PLAZA<br/>AWAKE!',
    completeSub: 'The plaza can see again. Beyond the tower door: the next torn piece of canvas…',
    next: 'harbor',
    spawnYaw: LEVEL.spawnYaw,
    titlePose: plazaTitlePose,
    create: (scene, assets, input, camera, audio, time) => new GameSession(scene, assets, input, camera, audio, time),
  },
  harbor: {
    id: 'harbor',
    num: 2,
    name: 'Mute Harbor',
    tagHtml: 'LV. 2<br/>MUTE HARBOR',
    firstRegion: 'The Arrival Pier',
    completeTitleHtml: 'MUTE HARBOR<br/>SINGS!',
    completeSub: 'The harbour has its voice back and the ships are home. The paper boat sails on — to the Correction Tower…',
    next: 'works',
    spawnYaw: HARBOR.spawnYaw,
    titlePose: harborTitlePose,
    // from over the sea mouth looking back at the town: the paper boat at the jetty, the arena,
    // the lighthouse and the roofs behind it (the old view had a big roof in the foreground)
    victoryPose: (time) => {
      const sx = Math.sin(time * 0.16);
      return { pos: new THREE.Vector3(38 + sx, 18, -58), look: new THREE.Vector3(14, 3, -30), fov: 58 };
    },
    create: (scene, assets, input, camera, audio, time) => new HarborSession(scene, assets, input, camera, audio, time),
  },
  works: {
    id: 'works',
    num: 3,
    name: 'Limp Works',
    tagHtml: 'LV. 3<br/>LIMP WORKS',
    firstRegion: 'The Conveyor Hall',
    completeTitleHtml: 'LIMP WORKS<br/>DRAWS!',
    completeSub: 'The Red Pen drew its first wobbly line. The city stays drawn wrong — and that is fine.',
    next: null,
    spawnYaw: LIMP.spawnYaw,
    titlePose: worksTitlePose,
    introPose: worksIntroPose,
    // from over the roof's parapet: the painted circle, the water tank, the drawn city below
    victoryPose: (time) => {
      const sx = Math.sin(time * 0.16);
      return { pos: new THREE.Vector3(14 + sx, 33, 18), look: new THREE.Vector3(-2, 27, -6), fov: 56 };
    },
    create: (scene, assets, input, camera, audio, time) => new WorksSession(scene, assets, input, camera, audio, time),
  },
};

export const LEVEL_ORDER: LevelId[] = ['plaza', 'harbor', 'works'];

const KEY = 'wd.levels';

/** Which levels the player has opened (persisted). */
export const LevelUnlocks = {
  get(): Set<LevelId> {
    const out = new Set<LevelId>(['plaza']);
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[];
      for (const id of raw) if (id in LEVELS) out.add(id as LevelId);
    } catch {
      /* corrupted storage: level 1 only */
    }
    return out;
  },
  has(id: LevelId): boolean {
    return this.get().has(id);
  },
  unlock(id: LevelId): boolean {
    const s = this.get();
    if (s.has(id)) return false;
    s.add(id);
    try {
      localStorage.setItem(KEY, JSON.stringify([...s]));
    } catch {
      /* private mode: unlock lasts this session */
    }
    return true;
  },
};

export function isLevelId(x: unknown): x is LevelId {
  return typeof x === 'string' && x in LEVELS;
}
