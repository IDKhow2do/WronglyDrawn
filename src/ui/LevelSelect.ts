/**
 * [INPUT]: 关卡注册表与过关记录。
 * [OUTPUT]: 关卡列表与开始按钮。
 * [POS]: 标题界面通过此模块选择关卡。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import './levelselect.css';
import { LEVELS, LEVEL_ORDER, LevelUnlocks } from '../level/levels';
import type { LevelId } from '../level/Session';
import { t, onLangChange } from '../i18n';
import { bestFor } from '../meta/Rank';

/**
 * Title-screen level select: a second graffiti button under START ("LEVELS") opens a row of
 * taped-on level stickers. Locked levels show how to open them. Picking one starts it.
 */
export class LevelSelect {
  private btn: HTMLButtonElement;
  private panel: HTMLDivElement;
  private open = false;
  onPick: ((id: LevelId) => void) | null = null;
  onHover: (() => void) | null = null;

  constructor(title: HTMLElement) {
    const start = title.querySelector('.st-start') as HTMLElement;
    this.btn = document.createElement('button');
    this.btn.className = 'levels-btn graffiti';
    this.btn.innerHTML = `<svg class="splat" viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
        <path class="halo" d="M22 36 C 60 6, 150 12, 200 10 C 250 8, 290 14, 292 44 C 296 80, 260 100, 210 102 C 150 106, 80 108, 40 96 C 8 86, 4 56, 22 36 Z"/>
        <path class="blob" d="M30 40 C 64 16, 150 22, 198 20 C 246 18, 280 24, 282 48 C 284 76, 254 92, 208 94 C 200 94, 198 108, 192 108 C 186 108, 188 94, 172 95 C 130 97, 90 98, 70 96 C 62 96, 60 106, 54 106 C 48 106, 50 94, 40 90 C 14 82, 10 56, 30 40 Z"/>
      </svg><span class="tag"></span><span class="tape t1"></span>`;
    start.insertBefore(this.btn, start.querySelector('.subtitle'));
    this.panel = document.createElement('div');
    this.panel.className = 'level-picker hidden';
    title.appendChild(this.panel);
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle(!this.open);
    });
    this.btn.addEventListener('mouseenter', () => this.onHover?.());
    this.panel.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest('.level-card') as HTMLElement | null;
      if (!card) {
        if (e.target === this.panel) this.toggle(false);
        return;
      }
      e.stopPropagation();
      const id = card.dataset.level as LevelId;
      if (card.classList.contains('locked')) {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
        return;
      }
      this.toggle(false);
      this.onPick?.(id);
    });
    onLangChange(() => this.render());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) this.toggle(false);
    });
    this.render();
  }

  toggle(on: boolean): void {
    this.open = on;
    if (on) this.render();
    this.panel.classList.toggle('hidden', !on);
    this.panel.parentElement?.classList.toggle('picking', on);
    this.btn.classList.toggle('on', on);
  }

  /** Hide (the title is bursting into the game). */
  close(): void {
    this.toggle(false);
  }

  render(): void {
    (this.btn.querySelector('.tag') as HTMLElement).textContent = t('LEVELS');
    const open = LevelUnlocks.get();
    const cols = ['#ff4fa3', '#1fb5b0'];
    this.panel.innerHTML = `<div class="picker-title">${t('PICK A CANVAS')}</div><div class="picker-row">${LEVEL_ORDER.map((id, i) => {
      const L = LEVELS[id];
      const locked = !open.has(id);
      const prev = i > 0 ? LEVELS[LEVEL_ORDER[i - 1]] : null;
      // your record on this canvas: a rank stamp on the picture, best time and crowns under the name
      const b = locked ? null : bestFor(id);
      const mm = b ? `${Math.floor(b.time / 60)}:${Math.floor(b.time % 60).toString().padStart(2, '0')}` : '';
      const stamp = b ? `<i class="lc-rank r-${b.rank}">${b.rank}</i>` : '';
      const rec = locked ? '' : b ? `${mm} · ${t('Crowns')} ${b.crowns}` : t('Not cleared yet');
      return `<button class="level-card ${locked ? 'locked' : ''} lv-${id}" data-level="${id}" style="--c:${cols[i % cols.length]}; --r:${i % 2 ? 2.5 : -2}deg">
          <span class="lc-num">${L.num}</span>
          <span class="lc-art" style="background-image:url('${import.meta.env.BASE_URL}assets/levels/${id}.webp')">${stamp}</span>
          <span class="lc-name">${t(L.name)}</span>
          <span class="lc-rec">${rec}</span>
          <span class="lc-state">${locked ? `${t('Finish {name} to open', { name: t(prev?.name ?? '') })}` : t('PLAY')}</span>
          <span class="tape"></span>
        </button>`;
    }).join('')}</div><div class="picker-hint">${t('Esc / click outside to close')}</div>`;
  }
}
