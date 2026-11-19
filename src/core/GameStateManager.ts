export type AppState = 'BOOT' | 'TITLE' | 'LOADING' | 'INTRO' | 'PLAYING' | 'COMPLETE';

type Listener = (next: AppState, prev: AppState) => void;

/** Tiny explicit state machine for the application flow. */
export class GameStateManager {
  private current: AppState = 'BOOT';
  private listeners: Listener[] = [];
  private static readonly allowed: Record<AppState, AppState[]> = {
    BOOT: ['TITLE', 'LOADING'],
    TITLE: ['LOADING', 'INTRO'],
    LOADING: ['INTRO', 'TITLE'],
    INTRO: ['PLAYING'],
    PLAYING: ['COMPLETE', 'INTRO', 'TITLE'],
    // (boot loads everything first, then the title is the live scene)
    COMPLETE: ['INTRO', 'TITLE'],
  };

  get state(): AppState {
    return this.current;
  }

  is(s: AppState): boolean {
    return this.current === s;
  }

  onChange(fn: Listener): void {
    this.listeners.push(fn);
  }

  set(next: AppState): void {
    if (next === this.current) return;
    if (!GameStateManager.allowed[this.current].includes(next)) {
      console.warn(`[state] illegal transition ${this.current} -> ${next}`);
      return;
    }
    const prev = this.current;
    this.current = next;
    document.body.dataset.state = next;
    for (const l of this.listeners) l(next, prev);
  }
}
