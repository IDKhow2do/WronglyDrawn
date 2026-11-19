/**
 * [INPUT]: depends on Quality (graphics tier and frame rate) from ../render/Quality; Look / LOOK_PRESETS /
 *          LOOK_ZERO from ../render/Look; Difficulty from ../meta/Difficulty;
 *          difficultyCards from ./DifficultyPicker; PadReader from ./Pad; t / getLang / setLang / onLangChange from
 *          ../i18n; ./setup.css
 * [OUTPUT]: exports setupDue() (is the screen owed before this new game?) and showSetup() → Promise<boolean>
 *           (true = GO, false = back to the title)
 * [POS]: the ONE screen between START and the game: picture quality, colours, pen. It writes the same stores the
 *        pause menu and the LOOK panel write (Quality, Look, Difficulty), so every choice is remembered and
 *        preselected, and can still be changed later in the pause menu or the LOOK panel. It never asks twice: the
 *        `wd.setup` flag marks it seen, and the test / URL paths (`?test`, `?difficulty=`) skip it entirely so the
 *        bots still go `.start-btn` → PLAYING. main.ts awaits it before startGame / startLevel.
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './setup.css';
import { FRAME_RATE_OPTIONS, Quality, type FrameRatePref, type TierPref } from '../render/Quality';
import { Look, LOOK_PRESETS, LOOK_ZERO } from '../render/Look';
import { Difficulty, type DifficultyId } from '../meta/Difficulty';
import { difficultyCards } from './DifficultyPicker';
import { PadReader } from './Pad';
import { getLang, onLangChange, setLang, t } from '../i18n';

const KEY = 'wd.setup';
const TIERS: { id: TierPref; name: string }[] = [
  { id: 'auto', name: 'Auto' },
  { id: 'low', name: 'Low' },
  { id: 'medium', name: 'Medium' },
  { id: 'high', name: 'High' },
];

/** The screen is owed once per device, and never on a test / URL-driven start. */
export function setupDue(): boolean {
  const q = new URLSearchParams(location.search);
  if (q.has('test') || q.has('difficulty')) return false;
  try {
    return localStorage.getItem(KEY) !== '1';
  } catch {
    return true; // private mode: ask this visit
  }
}

function markSeen(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* private mode */
  }
}

/** The preset whose colours are exactly on screen now (so a returning player sees their own choice ticked). */
function currentPreset(): string | null {
  const s = Look.state;
  for (const p of LOOK_PRESETS) {
    const want = { ...LOOK_ZERO, ...p.look };
    if ((Object.keys(want) as (keyof typeof want)[]).every((k) => want[k] === s[k])) return p.id;
  }
  return null;
}

/**
 * Show the one setup screen. Resolves true when the player presses GO (choices are already saved as they are made),
 * false on Back / Esc / pad B. Mouse, touch, keyboard (arrows + Enter) and gamepad (d-pad + A) all travel the same
 * flat list of options; `onLook` opens the full LOOK panel, which hides this screen while it is up.
 */
export function showSetup(opts: { onHover?: () => void; onLook?: () => void } = {}): Promise<boolean> {
  const root = document.getElementById('ui-root') ?? document.body;
  const el = document.createElement('div');
  el.className = 'setup-screen';
  let preset = currentPreset();

  const render = (): void => {
    const auto = `→ ${t(Quality.detected === 'low' ? 'Low' : Quality.detected === 'medium' ? 'Medium' : 'High')}`;
    el.innerHTML = `
      <div class="su-lang"><button data-act="lang">${getLang() === 'en' ? '中文' : 'English'}</button></div>
      <div class="su-head"><div class="picker-title">${t('BEFORE YOU DRAW')}</div>
        <div class="su-sub">${t('Three quick things. You can change them later in the pause menu.')}</div></div>
      <div class="su-group su-picture">
        <div>
          <div class="su-q">${t('How sharp should it look?')} <small>${t('Auto picks what runs smoothly on this machine.')}</small></div>
          <div class="su-chips">${TIERS.map((x) => `<button data-gfx="${x.id}"${x.id === Quality.pref ? ' class="on"' : ''}>${t(x.name)}${x.id === 'auto' ? ` <small>${auto}</small>` : ''}</button>`).join('')}</div>
        </div>
        <div role="group" aria-labelledby="su-fps-label">
          <div class="su-q" id="su-fps-label">${t('Frame rate')}</div>
          <div class="su-chips">${FRAME_RATE_OPTIONS.map(({ id, label }) => `<button data-fps="${id}">${t(label)}</button>`).join('')}</div>
        </div>
      </div>
      <div class="su-group">
        <div class="su-q">${t('What colours?')} <small>${t('The whole game takes these colours.')}</small></div>
        <div class="su-chips">${LOOK_PRESETS.map((p) => `<button data-preset="${p.id}"${p.id === preset ? ' class="on"' : ''}>${t(p.name)}</button>`).join('')}
          ${opts.onLook ? `<button data-act="look">${t('More colours')}</button>` : ''}</div>
      </div>
      <div class="su-group">
        <div class="su-q">${t('Which pen?')} <small>${t('How hard the city fights back.')}</small></div>
        ${difficultyCards(Difficulty.chosen ? Difficulty.id : 'normal')}
      </div>
      <button class="paint-btn su-go" data-act="go">${t('LET’S DRAW')}</button>
      <div class="su-foot">${t('Arrows / stick to move · Enter or A to pick · Esc to go back')}</div>`;
    mark();
  };

  /** Every option, in reading order: the travel list for keys and the pad. */
  const items = (): HTMLElement[] => Array.from(el.querySelectorAll<HTMLElement>('.su-chips button, .diff-card, .su-go'));

  const mark = (): void => {
    el.querySelectorAll<HTMLElement>('[data-gfx]').forEach((b) => b.classList.toggle('on', b.dataset.gfx === Quality.pref));
    el.querySelectorAll<HTMLButtonElement>('[data-fps]').forEach((button) => {
      const selected = button.dataset.fps === Quality.frameRate;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    el.querySelectorAll<HTMLElement>('[data-preset]').forEach((b) => b.classList.toggle('on', b.dataset.preset === preset));
    el.querySelectorAll<HTMLElement>('.diff-card').forEach((c) => c.classList.toggle('on', c.dataset.diff === Difficulty.id));
  };

  render();
  root.appendChild(el);
  document.body.classList.add('setup-open');
  // the game is behind this screen: the first option takes the keyboard, so Enter and arrows work with no click
  items()[0]?.focus();

  return new Promise<boolean>((resolve) => {
    const pad = new PadReader();
    let raf = 0;
    const off = onLangChange(render);

    const done = (go: boolean): void => {
      cancelAnimationFrame(raf);
      off();
      window.removeEventListener('keydown', onKey, true);
      el.remove();
      document.body.classList.remove('setup-open');
      if (go) {
        // the player answered: never asked again (the pause menu and the LOOK panel own the changes from here)
        Difficulty.set(Difficulty.chosen ? Difficulty.id : 'normal');
        markSeen();
      }
      resolve(go);
    };

    const activate = (b: HTMLElement): void => {
      opts.onHover?.();
      if (b.dataset.gfx) Quality.setPref(b.dataset.gfx as TierPref);
      else if (b.dataset.fps) Quality.setFrameRate(b.dataset.fps as FrameRatePref);
      else if (b.dataset.preset) {
        preset = b.dataset.preset;
        Look.set({ ...LOOK_ZERO, ...LOOK_PRESETS.find((p) => p.id === preset)!.look });
      } else if (b.dataset.diff) Difficulty.set(b.dataset.diff as DifficultyId);
      else if (b.dataset.act === 'look') return opts.onLook?.();
      else if (b.dataset.act === 'lang') return setLang(getLang() === 'en' ? 'zh' : 'en');
      else if (b.dataset.act === 'go') return done(true);
      mark();
    };

    /** Move the keyboard focus `d` steps along the travel list. */
    const move = (d: number): void => {
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + d))]?.focus();
    };
    /** Up / down: the same column in the next group (the lists are short, so the first option will do). */
    const moveGroup = (d: number): void => {
      const groups = Array.from(el.querySelectorAll<HTMLElement>('.su-group, .su-go'));
      const cur = (document.activeElement as HTMLElement | null)?.closest('.su-group, .su-go') as HTMLElement | null;
      const i = cur ? groups.indexOf(cur) : 0;
      const next = groups[Math.max(0, Math.min(groups.length - 1, i + d))];
      (next?.classList.contains('su-go') ? next : next?.querySelector<HTMLElement>('.on, button'))?.focus();
    };

    const onKey = (e: KeyboardEvent): void => {
      const c = e.code;
      if (c === 'Escape') done(false);
      else if (c === 'ArrowLeft' || c === 'KeyA') move(-1);
      else if (c === 'ArrowRight' || c === 'KeyD') move(1);
      else if (c === 'ArrowUp' || c === 'KeyW') moveGroup(-1);
      else if (c === 'ArrowDown' || c === 'KeyS') moveGroup(1);
      else if (c === 'Enter' || c === 'NumpadEnter' || c === 'Space') {
        const a = document.activeElement as HTMLElement | null;
        if (a && el.contains(a)) activate(a);
        else done(true);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = (e.target as HTMLElement).closest('button') as HTMLElement | null;
      if (b && el.contains(b)) activate(b);
    });

    // the gamepad: the same travel, A picks, B goes back, Start goes
    const tick = (): void => {
      const p = pad.presses();
      if (p.has('left')) move(-1);
      if (p.has('right')) move(1);
      if (p.has('up')) moveGroup(-1);
      if (p.has('down')) moveGroup(1);
      if (p.has('a')) {
        const a = document.activeElement as HTMLElement | null;
        if (a && el.contains(a)) activate(a);
      }
      if (p.has('start')) return done(true);
      if (p.has('b')) return done(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
