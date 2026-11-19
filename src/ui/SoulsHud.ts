/**
 * [INPUT]: depends on t / onLangChange from i18n; ./souls.css; the DOM (#ui-root, the .hud layer built by UI.ts)
 * [OUTPUT]: exports SoulsHud (show(), stamina(), boss(), lock(), card(), down(), say(), storyBusy(), dispose())
 * [POS]: the souls-like Red Pen fight's own HUD, owned by src/level/works/SoulsFight (one per fight; nothing else uses it):
 *        a stamina strip under the hearts, the boss's name and long bar at the bottom (with the two act marks and a
 *        lagging chunk that shows the last hit), the marker on the open weak point nearest the crosshair (an aim hint,
 *        never a lock), the name card on the way in, the SMUDGED sheet, and the LINE: what the Pen (or an ally) says, a
 *        correction slip pinned just above the boss bar (red marker for the Pen; it wobbles as its voice wavers).
 *        The bottom of the screen is laid out in souls.css so the bar, the slip, the cards and the ENCORE badge never overlap.
 *        It only writes the DOM when a value changes. `body.souls-fight` turns it on and hides the normal top boss bar.
 * [PROTOCOL]: Update this header on change, then check docs/level3/SOULS.md
 */
import './souls.css';
import { onLangChange, t } from '../i18n';

export class SoulsHud {
  private root: HTMLElement;
  private stamEl: HTMLElement;
  private stamFill: HTMLElement;
  private stamFlash: HTMLElement;
  private bossEl: HTMLElement;
  private bossFill: HTMLElement;
  private bossLag: HTMLElement;
  private lockEl: HTMLElement;
  private lockLabel: HTMLElement;
  private cardEl: HTMLElement;
  private downEl: HTMLElement;
  private lineEl: HTMLElement;
  private lineSrc: { who: string; text: string } | null = null;
  private last = { stam: -1, empty: false, out: false, boss: -1, bossOn: false, lock: '', lockOn: false };
  private offLang: () => void;

  constructor() {
    const host = document.getElementById('ui-root') ?? document.body;
    this.root = document.createElement('div');
    this.root.className = 'souls';
    this.root.innerHTML = `
      <div class="souls-stam"><b></b><i></i></div>
      <div class="souls-line"><span class="who"></span><span class="txt"></span></div>
      <div class="souls-boss"><div class="nm"></div><div class="bar"><div class="lag"></div><div class="fill"></div><div class="tick" style="left:66%"></div><div class="tick" style="left:33%"></div></div></div>
      <div class="souls-lock"><span></span></div>
      <div class="souls-card"><div class="big"></div><div class="rule"></div><div class="sub"></div></div>
      <div class="souls-down"><div class="sheet"><div class="w"></div><div class="mark"></div><div class="note"></div></div></div>`;
    host.appendChild(this.root);
    const q = (s: string) => this.root.querySelector(s) as HTMLElement;
    this.stamEl = q('.souls-stam');
    this.stamFill = q('.souls-stam i');
    this.stamFlash = q('.souls-stam b');
    this.bossEl = q('.souls-boss');
    this.bossFill = q('.souls-boss .fill');
    this.bossLag = q('.souls-boss .lag');
    this.lockEl = q('.souls-lock');
    this.lockLabel = q('.souls-lock span');
    this.cardEl = q('.souls-card');
    this.downEl = q('.souls-down');
    this.lineEl = q('.souls-line');
    this.applyLang();
    this.offLang = onLangChange(() => this.applyLang());
  }

  private applyLang(): void {
    (this.root.querySelector('.souls-boss .nm') as HTMLElement).innerHTML = `${t('THE RED PEN')}<small>${t('Head of Corrections')}</small>`;
    this.stamEl.dataset.out = t('out of breath!');
    this.last.lock = '#';
    if (this.lineSrc) this.writeLine(this.lineSrc.who, this.lineSrc.text);
  }

  private static readonly WHO: Record<string, string> = { pen: 'THE RED PEN', hush: 'THE HUSH', eraser: 'THE ERASER' };

  /** A spoken line above the boss bar (null hides it). `waver` 0..1: the Pen's voice is unsteady (phase 3, painted). */
  say(who: string, text: string | null, waver = 0): void {
    if (!text) {
      this.lineSrc = null;
      this.lineEl.classList.remove('on');
      return;
    }
    this.lineSrc = { who, text };
    this.writeLine(who, text);
    this.lineEl.dataset.who = who;
    this.lineEl.classList.toggle('waver', waver > 0.3);
    this.lineEl.style.setProperty('--wv', waver.toFixed(2));
    this.lineEl.classList.remove('on');
    void this.lineEl.offsetWidth;
    this.lineEl.classList.add('on');
  }

  private writeLine(who: string, text: string): void {
    (this.lineEl.querySelector('.who') as HTMLElement).textContent = t(SoulsHud.WHO[who] ?? who);
    (this.lineEl.querySelector('.txt') as HTMLElement).textContent = t(text);
  }

  /** Is a story caption on screen (the Pen holds its tongue: never two lines at once)? */
  storyBusy(): boolean {
    return !!document.querySelector('.story-caption.on');
  }

  /** The whole HUD on / off (the fight is active). */
  show(on: boolean): void {
    document.body.classList.toggle('souls-fight', on);
    if (!on) {
      this.lock(false, 0, 0, '');
      document.body.classList.remove('souls-smudged');
    }
  }

  stamina(frac: number, flash: number, out: boolean): void {
    const k = Math.round(frac * 200) / 200;
    if (k !== this.last.stam) {
      this.last.stam = k;
      this.stamFill.style.transform = `scaleX(${k})`;
    }
    this.stamFlash.style.opacity = flash > 0.02 ? (0.8 * flash).toFixed(2) : '0';
    const empty = frac < 0.01;
    if (empty !== this.last.empty) {
      this.last.empty = empty;
      this.stamEl.classList.toggle('empty', empty);
    }
    if (out !== this.last.out) {
      this.last.out = out;
      this.stamEl.classList.toggle('out', out);
    }
  }

  boss(on: boolean, frac: number): void {
    if (on !== this.last.bossOn) {
      this.last.bossOn = on;
      this.bossEl.classList.toggle('on', on);
    }
    const k = Math.round(Math.max(0, frac) * 1000) / 1000;
    if (k !== this.last.boss) {
      // a refill (a new attempt) snaps the lag; a hit leaves the white chunk to drain behind
      if (k > this.last.boss) this.bossLag.style.transition = 'none';
      else this.bossLag.style.transition = '';
      this.last.boss = k;
      this.bossFill.style.width = `${k * 100}%`;
      this.bossLag.style.width = `${k * 100}%`;
    }
  }

  /** Reticle at screen (x, y in 0..1); `label` = an open weak point's name ('' = the body). */
  lock(on: boolean, x: number, y: number, label: string): void {
    if (on !== this.last.lockOn) {
      this.last.lockOn = on;
      this.lockEl.style.opacity = on ? '1' : '0';
    }
    if (!on) return;
    this.lockEl.style.left = `${(x * 100).toFixed(2)}%`;
    this.lockEl.style.top = `${(y * 100).toFixed(2)}%`;
    if (label !== this.last.lock) {
      this.last.lock = label;
      this.lockEl.classList.toggle('weak', !!label);
      this.lockLabel.textContent = label ? t(label.toUpperCase()) : '';
    }
  }

  /** The name card (on = fade in). */
  card(on: boolean, title = '', sub = ''): void {
    if (on) {
      (this.cardEl.querySelector('.big') as HTMLElement).textContent = t(title);
      (this.cardEl.querySelector('.sub') as HTMLElement).textContent = t(sub);
    }
    this.cardEl.classList.toggle('on', on);
  }

  /** The SMUDGED sheet (on = slide in). */
  down(on: boolean, note = ''): void {
    if (on) {
      (this.downEl.querySelector('.w') as HTMLElement).textContent = t('SMUDGED');
      (this.downEl.querySelector('.mark') as HTMLElement).textContent = t('see me!');
      (this.downEl.querySelector('.note') as HTMLElement).textContent = t(note);
    }
    this.downEl.classList.toggle('on', on);
    document.body.classList.toggle('souls-smudged', on);
  }

  dispose(): void {
    this.offLang();
    this.show(false);
    this.root.remove();
  }
}
