/**
 * [INPUT]: 游戏系统发布带类型的会话事件。
 * [OUTPUT]: 连接玩法、音频、界面与反馈快照。
 * [POS]: 会话内事件表。关键器官提示可跳过普通消息队列。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { Organ } from '../organs/Organ';

/** Gameplay events. Systems publish; HUD / objectives / audio subscribe. */
export interface GameEvents {
  'player:moved': { distance: number };
  'player:jumped': void;
  'player:damaged': { hp: number; from?: import('three').Vector3; heavy?: boolean };
  'player:healed': { hp: number };
  'player:perfect': { from: import('three').Vector3 };
  'weapon:refill': Record<string, never>;
  'bomb:ready': { ready: boolean; frac: number };
  'player:smudged': void;
  'player:aimed': void;
  'hit:marker': { weak: boolean; finished: boolean };
  'enemy:noticed': { id: string };
  'enemy:stunned': { id: string; kind: string };
  'organ:dropped': { organ: Organ };
  'organ:collected': { organ: Organ };
  'organ:purified': { organ: Organ };
  'organ:lent': { organ: Organ; hostId: string };
  'organ:recalled': { organ: Organ };
  'host:reaction': { hostId: string; text: string };
  'face:woken': { id: string; count: number };
  'crown:collected': { id: string; count: number };
  'paint:collected': { count: number };
  checkpoint: { id: string };
  'region:entered': { name: string };
  'arch:opened': void;
  'level:complete': void;
  'city:awake': void;
  /** the opening story sequence finished (or was skipped): gameplay UI may appear */
  'intro:done': void;
  'facade:woken': void;
  'enemy:stomped': { id: string };
  'enemy:interrupted': { id: string };
  'spring:bounce': void;
  /** ENCORE chain cashed out (combat) */
  'encore:cashout': { mult: number; stamps: number };
  /** a stamp stuck: n in a row this chain (0 = the TAG itself) */
  'encore:stamp': { stamps: number; mult: number };
  'story:caption': { text: string | null; big?: boolean };
  // Mute Harbor (level 2): the Hush + the sound puzzles
  'hush:absorbed': { id: string };
  'hush:unveiled': { id: string };
  'hush:domePopped': { id: string };
  'harbor:gate': { n?: number };
  'harbor:bellMuffled': { n?: number };
  'harbor:fork': { n?: number };
  'harbor:lamp': { n?: number };
  'harbor:lampQuiet': { n?: number };
  'harbor:lampFar': { n?: number };
  'harbor:cocoon': { n?: number };
  'harbor:cocoonQuiet': { n?: number };
  'harbor:boatsDocked': { n?: number };
  /** `at`: where it happens — tips from far away (> 22 m) are dropped */
  toast: { text: string; kind?: 'info' | 'warn' | 'good'; at?: import('three').Vector3; immediate?: boolean };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private map = new Map<keyof GameEvents, Handler<unknown>[]>();

  on<K extends keyof GameEvents>(k: K, fn: Handler<GameEvents[K]>): () => void {
    const list = this.map.get(k) ?? [];
    list.push(fn as Handler<unknown>);
    this.map.set(k, list);
    return () => {
      const l = this.map.get(k);
      if (l) this.map.set(k, l.filter((f) => f !== fn));
    };
  }

  emit<K extends keyof GameEvents>(k: K, ...payload: GameEvents[K] extends void ? [] : [GameEvents[K]]): void {
    const list = this.map.get(k);
    if (!list) return;
    for (const fn of [...list]) fn(payload[0]);
  }

  clear(): void {
    this.map.clear();
  }
}
