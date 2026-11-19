/**
 * [INPUT]: depends on StoryBook (pages player) / introPages / endPages / Sketch; LevelOutro (in-engine celebration +
 *          departures); MarginNotes (the Red Pen's notes in the world); t / onLangChange from ../i18n; LevelId / PlaySession
 *          from ../level/Session; GameContext audio (sounds only); ./story.css
 * [OUTPUT]: exports StoryFlow (on, introDue, intro, end, titleCard, mountTitle, levelOutro, decorate, step, pose, busy) and
 *           storyEnabled()
 * [POS]: the story layer's one entry point for App (src/main.ts). It owns the WHEN: the INTRO book before level 1's first
 *        start, a title card (with a SKIP for the push-in) at every level start, the departure + celebration when a level
 *        completes, the END book after level 3, the STORY / THE END stickers and the "made by AUTHOR" credit on the
 *        title, and the persisted flags (localStorage `wd.story`).
 *        The level stories (StoryDirector / HarborStory / WorksStory) keep the in-level beats; this file runs between them.
 *        `?test` turns it all off (the bots see the old flow) unless `story=1`; `story=0` turns it off anywhere.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import './story.css';
import { t, onLangChange } from '../i18n';
import type { LevelId, PlaySession } from '../level/Session';
import { INK, Sketch, ellipsePts, type Pt } from './Doodle';
import { HoldToSkip, StoryBook, type BookSound } from './StoryBook';
import { introPages } from './IntroPages';
import { AUTHOR, endPages } from './EndPages';
import { LevelOutro } from './LevelOutro';
import { MarginNotes } from './MarginNotes';

const KEY = 'wd.story';

/** Story sequences run unless `?test` (bots) or `?story=0`; `?story=1` forces them on under test. */
export function storyEnabled(): boolean {
  const q = new URLSearchParams(location.search);
  const st = q.get('story');
  if (st === '0') return false;
  if (st !== null && st !== '0') return true;
  return !q.has('test');
}

type Flag = 'intro' | 'end';

function flags(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

function setFlag(f: Flag): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...flags(), [f]: 1 }));
  } catch {
    /* private mode: the flag lasts this visit */
  }
}

/** Title-card text per level: chapter, name, one line that follows the transition before it. */
const CARDS: Record<LevelId, { ch: string; name: string; line: string; icon: 'eye' | 'mouth' | 'legs' }> = {
  plaza: { ch: 'CHAPTER 1 · THE EYE', name: 'Blind Plaza', line: 'The city stopped seeing.', icon: 'eye' },
  harbor: { ch: 'CHAPTER 2 · THE MOUTH', name: 'Mute Harbor', line: 'Through the tower door: the sea, and no sound at all.', icon: 'mouth' },
  works: { ch: 'CHAPTER 3 · THE LEGS', name: 'Limp Works', line: 'The paper boat reached the Red Pen’s tower.', icon: 'legs' },
};

function cardIcon(kind: 'eye' | 'mouth' | 'legs'): string {
  const s = new Sketch(kind.length * 7);
  s.speed = 0.6;
  if (kind === 'eye') {
    const lid: Pt[] = [[20, 100], [100, 50], [180, 100], [100, 150]];
    s.scribble(lid, '#ffffff', { gap: 10 });
    s.shape(lid, { w: 6 });
    s.shape(ellipsePts(100, 100, 30, 30, 12), { w: 5 });
    s.dot(104, 104, 14);
  } else if (kind === 'mouth') {
    const m = ellipsePts(100, 110, 74, 40, 16);
    s.scribble(m, INK.pink, { gap: 10 });
    s.shape(m, { w: 6 });
    s.line([[40, 104], [160, 104]], { w: 5 });
    for (const x of [70, 100, 130]) s.line([[x, 104], [x, 120]], { w: 4, dur: 0.06 });
  } else {
    s.line([[80, 20], [70, 100], [40, 170], [20, 176]], { w: 9 });
    s.line([[120, 20], [134, 96], [160, 166], [188, 162]], { w: 9 });
  }
  s.at(0.9);
  s.line([[30, 30], [170, 170]], { color: INK.red, w: 10, dur: 0.2 });
  s.line([[170, 30], [30, 170]], { color: INK.red, w: 10, dur: 0.2 });
  return s.svg('', '', '0 0 200 200');
}

export class StoryFlow {
  readonly on = storyEnabled();
  readonly book: StoryBook;
  private outro: LevelOutro | null = null;
  private notes: MarginNotes | null = null;
  private card: HTMLElement | null = null;
  private cardTimer = 0;
  private endBtn: HTMLButtonElement | null = null;
  /** The title card's SKIP while the push-in runs. */
  private cardSkip: HoldToSkip | null = null;
  /** The camera whose story shot may still hold behind the END book (stopped when the session goes away). */
  private heldCam: { stopCine(): void } | null = null;

  constructor(
    private root: HTMLElement,
    private sound: (name: string, opts?: { vol?: number; pitch?: number }) => void,
  ) {
    this.book = new StoryBook(root);
    this.book.onSound = (k: BookSound) => {
      if (k === 'page') this.sound('whoosh', { vol: 0.35, pitch: 1.7 });
      else if (k === 'skip') this.sound('whoosh', { vol: 0.5, pitch: 0.9 });
      else this.sound('uiClick', { vol: 0.35, pitch: 1.4 });
    };
  }

  /** A storybook or an in-engine story sequence holds the screen. */
  get busy(): boolean {
    return this.book.open || !!this.outro?.running;
  }

  /** The INTRO plays before level 1's first start. */
  introDue(): boolean {
    return this.on && !flags().intro;
  }

  async intro(): Promise<void> {
    await this.book.play(introPages(), 'intro');
    setFlag('intro');
  }

  async end(): Promise<void> {
    await this.book.play(endPages(() => setFlag('end')), 'end');
    setFlag('end');
    this.endBtn?.classList.remove('hidden');
  }

  /** STORY (always) and THE END (once seen) on the title screen. `busy` reports a running title transition. */
  mountTitle(title: HTMLElement, canPlay: () => boolean, onDone?: () => void): void {
    // the author's credit in the corner (always: it blocks nothing, the bots included)
    const credit = document.createElement('div');
    credit.className = 'sticker st-credit';
    const say = () => (credit.textContent = t('made by {name}', { name: AUTHOR }));
    say();
    onLangChange(say);
    title.appendChild(credit);
    if (!this.on) return;
    const st = document.createElement('div');
    st.className = 'sticker st-story';
    st.innerHTML = `<button class="sb-replay" data-i18n="STORY"></button><button class="sb-the-end hidden" data-i18n="THE END"></button>`;
    title.appendChild(st);
    const [a, b] = Array.from(st.querySelectorAll('button')) as HTMLButtonElement[];
    const label = () => {
      a.textContent = t('STORY');
      b.textContent = t('THE END');
    };
    label();
    onLangChange(label);
    this.endBtn = b;
    b.classList.toggle('hidden', !flags().end);
    const go = (which: 'intro' | 'end') => (e: Event) => {
      e.stopPropagation();
      if (!canPlay() || this.book.open) return;
      this.sound('uiClick');
      void (which === 'intro' ? this.intro() : this.end()).then(() => onDone?.());
    };
    a.addEventListener('click', go('intro'));
    b.addEventListener('click', go('end'));
  }

  /**
   * The chapter card over the camera push-in at a level start (≈3.4 s, never blocks input). `skip` adds a SKIP
   * button (button, Esc, pad B; no hold-anywhere: gameplay keys stay free) while `skip.live()` holds; pressing it
   * hides the card and calls `skip.onSkip` (App ends the push-in: the state the card would have ended in).
   */
  titleCard(level: LevelId, skip?: { onSkip: () => void; live: () => boolean }): void {
    if (!this.on) return;
    this.cardSkip?.dispose();
    this.cardSkip = null;
    if (skip) {
      const k = new HoldToSkip(this.root, { anywhere: false });
      k.el.classList.add('in-game');
      k.onSkip = () => {
        this.hideCard();
        skip.onSkip();
      };
      this.cardSkip = k;
      // gone as soon as the push-in is over (the level's own arrival scene has its own skip)
      const watch = () => {
        if (this.cardSkip !== k) return;
        if (!skip.live()) {
          k.dispose();
          this.cardSkip = null;
        } else requestAnimationFrame(watch);
      };
      requestAnimationFrame(watch);
    }
    const c = CARDS[level];
    if (!this.card) {
      this.card = document.createElement('div');
      this.card.className = 'sb-card';
      this.root.appendChild(this.card);
    }
    const el = this.card;
    el.innerHTML = `<div class="ch"></div><div class="nm"></div><div class="ln"></div>${cardIcon(c.icon)}`;
    (el.querySelector('.ch') as HTMLElement).textContent = t(c.ch);
    (el.querySelector('.nm') as HTMLElement).textContent = t(c.name);
    (el.querySelector('.ln') as HTMLElement).textContent = t(c.line);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => el.classList.remove('on'), 3400);
  }

  hideCard(): void {
    clearTimeout(this.cardTimer);
    this.card?.classList.remove('on');
    this.cardSkip?.dispose();
    this.cardSkip = null;
  }

  /** Margin notes in the world (off under ?test like the rest: the bots see the levels exactly as before). */
  decorate(s: PlaySession, level: LevelId): void {
    this.notes?.dispose();
    this.notes = this.on ? new MarginNotes(s.ctx, level) : null;
  }

  /**
   * A level just completed: celebration + departure in-engine; after level 3, the END book. Resolves when the
   * result card may show. Off (or a session that changed under us): resolves at once.
   */
  async levelOutro(s: PlaySession, level: LevelId): Promise<void> {
    if (!this.on) return;
    this.outro?.stop();
    this.outro = new LevelOutro(s, level, this.root);
    this.heldCam = s.ctx.camera;
    await this.outro.play();
    this.outro = null;
    if (level === 'works') await this.end();
  }

  /** Fixed step (main.ts step, PLAYING): the outro moves WAI (teleports, so physics + cape follow). */
  step(dt: number): void {
    this.outro?.step(dt);
  }

  /** After the session's render: the outro's bone pose on top of the clip (raised can, arms). */
  pose(): void {
    this.outro?.pose();
  }

  /** The session is going away (restart, title, next level). */
  drop(): void {
    this.outro?.stop();
    this.outro = null;
    this.heldCam?.stopCine();
    this.heldCam = null;
    this.hideCard();
  }
}
