/**
 * [INPUT]: depends on t from ../i18n; PadReader from ../ui/Pad; the page markup comes from IntroPages / EndPages
 *          (Sketch SVG or HTML); story.css
 * [OUTPUT]: exports StoryBook (play(pages) → 'done' | 'skipped', open, skipNow), StoryPage, StoryCaption, HoldToSkip
 *           (the SKIP button every story sequence shares), SKIP_ARM_SEC
 * [POS]: the one full-screen storybook player of src/story. It mounts one page at a time over the game (a paper sheet on a
 *        dark desk), shows its captions at their times, turns the page, and owns the input while open: a tap / click /
 *        → / pad A finishes the drawing, then turns the page. SKIP (button, Esc, pad B / Start, armed after
 *        SKIP_ARM_SEC) or holding Space / Enter / the mouse / a finger for HOLD_SEC skips the whole book; a skip
 *        resolves exactly like the last page turning. Nothing persists while it plays: a reload mid-book just drops it.
 *        StoryFlow decides when a book plays; the game behind it keeps rendering.
 * [PROTOCOL]: Update this header on change, then check docs/story/NOTES.md
 */
import { t } from '../i18n';
import { PadReader } from '../ui/Pad';

export interface StoryCaption {
  /** Seconds after the page appears. */
  at: number;
  /** English source (t() at mount). */
  text: string;
  cls?: string;
}

export interface StoryPage {
  /** Builds the picture (SVG markup) or the whole sheet (HTML) when the page mounts (language at play time). */
  art: () => string;
  captions?: StoryCaption[];
  /** Seconds before the page turns by itself. */
  dur: number;
  /** 'picture' = art + caption strip; 'sheet' = art fills the paper (the letter, the credits). */
  kind?: 'picture' | 'sheet';
  /** After dur, wait for a tap (a "continue" hint shows) instead of turning; turns anyway after maxWait. */
  wait?: boolean;
  maxWait?: number;
  cls?: string;
  /** Called when the page mounts (a sound, a flag). */
  onShow?: () => void;
}

export type BookSound = 'page' | 'skip' | 'tap';

const HOLD_SEC = 1.0;
const TAP_SEC = 0.3;
/** The Skip button, Esc and the pad's skip buttons do nothing for this long after the control appears. */
export const SKIP_ARM_SEC = 0.8;

/**
 * The skip control of every story sequence: a visible SKIP button with a ring that fills while a hold runs.
 * Skips by: the button (click / tap), Esc, the pad's B or Start (all only once armed, SKIP_ARM_SEC after it
 * appears, and only for a press that began after that), or holding Space / Enter / the mouse / a finger anywhere
 * for HOLD_SEC (`anywhere`, the default; a short tap never skips). → and the pad's A are a tap (turn the page).
 * `anywhere: false` (the level title card over gameplay) keeps only the button, Esc and the pad.
 */
export class HoldToSkip {
  readonly el: HTMLElement;
  private held = 0;
  private downAt = -1;
  private keys = new Set<string>();
  private pointer = false;
  private raf = 0;
  private last = 0;
  private alive = true;
  private born = performance.now();
  private armed = false;
  private pad = new PadReader();
  private anywhere: boolean;
  /** A short press (not a hold). */
  onTap: (() => void) | null = null;
  onSkip: (() => void) | null = null;

  constructor(parent: HTMLElement, opts: { anywhere?: boolean } = {}) {
    this.anywhere = opts.anywhere ?? true;
    const btn = document.createElement('button');
    btn.type = 'button';
    this.el = btn;
    this.el.className = 'sb-skip arming';
    this.el.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18" pathLength="1"/><path class="ic" d="M14 14 L23 22 L14 30 Z M23 14 L32 22 L23 30 Z"/></svg><b></b><small></small>`;
    (this.el.querySelector('b') as HTMLElement).textContent = t('SKIP');
    (this.el.querySelector('small') as HTMLElement).textContent = t(this.anywhere ? 'Esc · hold Space' : 'Esc');
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.trySkip();
    });
    parent.appendChild(this.el);
    window.addEventListener('keydown', this.kd, true);
    if (this.anywhere) {
      window.addEventListener('keyup', this.ku, true);
      window.addEventListener('pointerdown', this.pd, true);
      window.addEventListener('pointerup', this.pu, true);
      window.addEventListener('pointercancel', this.pu, true);
      window.addEventListener('blur', this.reset);
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  /** The instant skips (button, Esc, pad) wait until armed. */
  private trySkip(): void {
    if (!this.alive || !this.armed) return;
    this.reset();
    this.onSkip?.();
  }

  private isHoldKey(code: string): boolean {
    return code === 'Space' || code === 'Enter' || code === 'NumpadEnter';
  }

  private kd = (e: KeyboardEvent): void => {
    if (!this.alive) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) this.trySkip();
      return;
    }
    if (!this.anywhere) return;
    if (this.isHoldKey(e.code) || e.code === 'ArrowRight') {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (e.code === 'ArrowRight') return this.onTap?.();
      this.keys.add(e.code);
      this.press();
    }
  };

  private ku = (e: KeyboardEvent): void => {
    if (!this.alive || !this.keys.has(e.code)) return;
    e.stopPropagation();
    this.keys.delete(e.code);
    this.release();
  };

  private pd = (e: PointerEvent): void => {
    if (!this.alive || e.button > 0) return;
    // the language button and other real buttons on top stay clickable
    if ((e.target as HTMLElement | null)?.closest?.('button')) return;
    e.stopPropagation();
    this.pointer = true;
    this.press();
  };

  private pu = (): void => {
    if (!this.alive || !this.pointer) return;
    this.pointer = false;
    this.release();
  };

  private press(): void {
    if (this.downAt < 0) this.downAt = performance.now();
  }

  private release(): void {
    if (this.keys.size || this.pointer) return;
    const was = this.downAt >= 0 ? (performance.now() - this.downAt) / 1000 : 0;
    this.downAt = -1;
    this.held = 0;
    if (was > 0 && was < TAP_SEC) this.onTap?.();
  }

  private reset = (): void => {
    this.keys.clear();
    this.pointer = false;
    this.downAt = -1;
    this.held = 0;
  };

  private tick = (now: number): void => {
    if (!this.alive) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!this.armed && (now - this.born) / 1000 >= SKIP_ARM_SEC) {
      this.armed = true;
      this.el.classList.remove('arming');
    }
    // the pad: presses only (a button held since before the control appeared never counts)
    const pad = this.pad.presses();
    if (pad.has('b') || pad.has('start')) {
      this.trySkip();
      if (!this.alive) return;
    } else if (pad.has('a') || pad.has('right')) this.onTap?.();
    const holding = this.downAt >= 0 && (now - this.downAt) / 1000 > TAP_SEC * 0.5;
    this.held = holding ? this.held + dt : Math.max(0, this.held - dt * 3);
    const k = Math.min(1, this.held / HOLD_SEC);
    this.el.style.setProperty('--k', k.toFixed(3));
    this.el.classList.toggle('on', k > 0.02);
    if (k >= 1) {
      this.reset();
      this.onSkip?.();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  dispose(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.kd, true);
    window.removeEventListener('keyup', this.ku, true);
    // (removing listeners that were never added, with `anywhere: false`, is a no-op)
    window.removeEventListener('pointerdown', this.pd, true);
    window.removeEventListener('pointerup', this.pu, true);
    window.removeEventListener('pointercancel', this.pu, true);
    window.removeEventListener('blur', this.reset);
    this.el.remove();
  }
}

/** The storybook player. */
export class StoryBook {
  private el: HTMLElement | null = null;
  private resolve: ((r: 'done' | 'skipped') => void) | null = null;
  private skipper: HoldToSkip | null = null;
  private timers: number[] = [];
  private page = -1;
  private pages: StoryPage[] = [];
  private shownAt = 0;
  private complete = false;
  private waiting = false;
  onSound: ((s: BookSound) => void) | null = null;

  constructor(private parent: HTMLElement) {}

  get open(): boolean {
    return !!this.el;
  }

  /** Play a book; resolves when the last page turns or the player holds to skip. */
  play(pages: StoryPage[], cls = ''): Promise<'done' | 'skipped'> {
    this.close('skipped');
    // the book owns the screen: free the cursor, or every click would go to the locked canvas (SKIP unhittable)
    if (document.pointerLockElement) document.exitPointerLock();
    this.pages = pages;
    const el = document.createElement('div');
    el.className = `storybook ${cls}`;
    el.innerHTML = `<div class="sb-desk"></div><div class="sb-stage"></div><div class="sb-hint"></div>`;
    this.parent.appendChild(el);
    this.el = el;
    this.skipper = new HoldToSkip(el);
    this.skipper.onSkip = () => {
      this.onSound?.('skip');
      this.close('skipped');
    };
    this.skipper.onTap = () => this.tap();
    void el.offsetWidth;
    el.classList.add('in');
    this.page = -1;
    this.next();
    return new Promise((r) => (this.resolve = r));
  }

  /** Hold-to-skip by code (tests, a level reload). */
  skipNow(): void {
    this.close('skipped');
  }

  private later(sec: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, sec * 1000));
  }

  private clearTimers(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers = [];
  }

  private tap(): void {
    if (!this.el) return;
    const p = this.pages[this.page];
    const age = (performance.now() - this.shownAt) / 1000;
    if (age < 0.6) return;
    this.onSound?.('tap');
    // first tap finishes the drawing and shows every line; the next one turns the page
    if (!this.complete) return this.finish();
    if (p.wait && !this.waiting && age < p.dur) return;
    this.next();
  }

  private finish(): void {
    const sheet = this.el?.querySelector('.sb-page:last-child');
    if (!sheet) return;
    this.complete = true;
    sheet.classList.add('done');
    sheet.querySelectorAll('.sb-cap p').forEach((p) => p.classList.add('on'));
    const p = this.pages[this.page];
    if (p.wait) this.showWait();
  }

  private showWait(): void {
    if (!this.el || this.waiting) return;
    this.waiting = true;
    const hint = this.el.querySelector('.sb-hint') as HTMLElement;
    hint.textContent = t('click to continue');
    hint.classList.add('on');
  }

  private next(): void {
    if (!this.el) return;
    this.clearTimers();
    this.page++;
    this.complete = false;
    this.waiting = false;
    (this.el.querySelector('.sb-hint') as HTMLElement).classList.remove('on');
    const stage = this.el.querySelector('.sb-stage') as HTMLElement;
    const old = stage.querySelector('.sb-page:not(.leaving)');
    if (old) {
      old.classList.add('leaving');
      window.setTimeout(() => old.remove(), 700);
    }
    if (this.page >= this.pages.length) {
      this.later(0.55, () => this.close('done'));
      return;
    }
    this.onSound?.('page');
    const p = this.pages[this.page];
    const sheet = document.createElement('div');
    sheet.className = `sb-page ${p.kind === 'sheet' ? 'sheet' : 'picture'} ${p.cls ?? ''}`;
    const caps = (p.captions ?? []).map((c) => `<p class="${c.cls ?? ''}">${escapeHtml(t(c.text))}</p>`).join('');
    sheet.innerHTML = p.kind === 'sheet' ? `<div class="sb-sheet">${p.art()}</div>` : `<div class="sb-pic">${p.art()}</div><div class="sb-cap">${caps}</div>`;
    stage.appendChild(sheet);
    this.shownAt = performance.now();
    p.onShow?.();
    const lines = sheet.querySelectorAll('.sb-cap p');
    (p.captions ?? []).forEach((c, i) => this.later(c.at, () => lines[i]?.classList.add('on')));
    const last = Math.max(0, ...(p.captions ?? []).map((c) => c.at));
    // a sheet without captions (the credits) lets its own animation play before a tap may close it
    this.later(Math.min(p.dur, Math.max(last + 1.2, p.kind === 'sheet' ? p.dur * 0.6 : 0)), () => (this.complete = true));
    if (p.wait) {
      this.later(p.dur, () => {
        this.complete = true;
        this.showWait();
      });
      this.later(p.maxWait ?? 150, () => this.next());
    } else this.later(p.dur, () => this.next());
  }

  private close(r: 'done' | 'skipped'): void {
    this.clearTimers();
    this.skipper?.dispose();
    this.skipper = null;
    const el = this.el;
    this.el = null;
    if (el) {
      el.classList.remove('in');
      el.classList.add('out');
      window.setTimeout(() => el.remove(), 650);
    }
    const res = this.resolve;
    this.resolve = null;
    res?.(r);
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
