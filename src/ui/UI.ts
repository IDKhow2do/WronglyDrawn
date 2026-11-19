/**
 * [INPUT]: 关卡推送 HUD 数据。OrganInventory 提供器官状态。Quality 保存画质与帧率。
 * [OUTPUT]: UI 渲染菜单、HUD、战斗反馈与器官提示。
 * [POS]: 管理游戏 DOM 界面。触屏任务可收起。PaintLoading 绘制启动和过场进度。PlayTips 提供网页版卡顿提示。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { Effects } from '../render/Effects';
import { FRAME_RATE_OPTIONS, Quality, type FrameRatePref, type TierPref } from '../render/Quality';
import { touchIcon } from './TouchIcons';
import { PaintLoading, commitLoadingFrame } from './PaintLoading';
import { PAUSE_TIP, WEB_PLAY, frameTip, slowLoadTip } from './PlayTips';
import { touchText } from './TouchText';
import { organIconDataURL } from '../render/PaintTextures';
import { ORGAN_ART, crispStickerUrl } from '../render/OrganArt';
import type { OrganInventory } from '../organs/OrganInventory';
import { ORGAN_DEFS, ORGAN_ORDER } from '../organs/Organ';
import type { PromptView } from '../level/Session';
import type { SessionStats } from '../level/GameSession';
import { t, getLang, setLang, onLangChange, retranslate } from '../i18n';
import type { EncoreView } from '../combat/CombatDirector';
import { stickerIcon, itemArt, itemImg, boonImg, wireArtFallback } from './ItemArt';
import { stickerTip } from './StickerTips';
import { bindDifficultySelect } from './DifficultyPicker';
import type { OrganHost } from '../hosts/OrganHost';
import type { OrganType } from '../organs/Organ';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html !== undefined) el.innerHTML = html;
  return el;
};

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** How long a tapped / state-change sticker tooltip stays up. */
const TIP_MS = 4500;

/** Text bound for the screen: on a touch screen no key name passes (ui/TouchText.ts). */
function touchHint(text: string): string {
  if (!document.body.classList.contains('touch-mode')) return text;
  return touchText(text, getLang());
}
/** A hint was shown: the touch buttons it names pulse (TouchControls listens). */
function touchPulse(text: string): void {
  if (document.body.classList.contains('touch-mode') && /〔|\[/.test(text)) document.dispatchEvent(new CustomEvent('wd-touch-hint', { detail: text }));
}

/** HUD help (English source; also the i18n key). */
const HELP_HTML =
  '<b>H</b> hide · WASD move · Shift run · Space jump · C dodge<br/><b>In the air:</b> Space again (hold) = <b>JET HOVER</b> (uses paint) · C = <b>PAINT SLAM</b><br/>Look: mouse / 2-finger swipe / arrows · <b>Z or right-click: aim</b> · Click: spray<br/>Q/R/F select Eye/Mouth/Legs · hold = purify / recall<br/><b>G</b> lift a prop · hold <b>G</b> to charge a throw (rocks, crates, your empty can)<br/>E stick sticker on things / TAG a reeling creature · <b>E again = ENCORE</b> (Golden Stamp boon) · V chomp · <b>B gadget</b><span class=lv-shout> · <b>X shout</b> (Mouth worn; hold = BIG SHOUT)</span> · T paint colour · Esc pause';

/** All HTML overlays: title (sticker HUD), wipe/loading, HUD, pause, complete. */
export class UI {
  private root: HTMLElement;
  readonly title: HTMLElement;
  private wipe: HTMLElement;
  private loading: HTMLElement;
  private readonly loadBadge = new PaintLoading();
  private readonly wipeBadge = new PaintLoading();
  wipeCovered = false;
  private loadSteps: HTMLElement;
  private hud: HTMLElement;
  private hearts: HTMLElement;
  private objTitle: HTMLElement;
  private objToggleTitle: HTMLElement;
  private objHint: HTMLElement;
  private prompt: HTMLElement;
  private cards: Record<string, HTMLElement> = {};
  private tip!: HTMLElement;
  private toasts: HTMLElement;
  private holdRing: HTMLElement;
  private holdFill: SVGCircleElement;
  private holdLabel: HTMLElement;
  private pause: HTMLElement;
  private complete: HTMLElement;
  private regionBanner: HTMLElement;
  private help: HTMLElement;
  private lockHint: HTMLElement;
  private vignette: HTMLElement;
  private ink: HTMLElement;
  private crosshair: HTMLElement;
  private hitmark: HTMLElement;
  private tank: HTMLElement;
  private boss: HTMLElement;
  private bossFill: HTMLElement;
  private bossName: HTMLElement;
  private crownCount: HTMLElement;
  private paintCount: HTMLElement;
  private mouthful: HTMLElement;
  private lastPromptKey = '';
  private sens: HTMLInputElement;
  private showGfx: () => void = () => {};

  onStart: (() => void) | null = null;
  onResume: (() => void) | null = null;
  onRestart: (() => void) | null = null;
  onTitle: (() => void) | null = null;
  /** Completion screen: go on to the next level. */
  onNext: (() => void) | null = null;
  onSettings: ((s: { music: number; sfx: number; sens: number }) => void) | null = null;
  /** Pause → Art style picked. */
  onStyle: ((id: string) => void) | null = null;
  showStyle: (id: string) => void = () => {};

  constructor() {
    this.root = document.getElementById('ui-root')!;

    // ---- title: clean plate + real HUD stickers that burst apart on start ----
    this.title = h('div', 'screen title-screen hidden');
    this.title.innerHTML = `
      <div class="title-art"><div class="title-plate"></div></div>
      <div class="title-shade"></div>
      <div class="sticker st-lang"><button class="lang-btn"></button></div>
      <div class="sticker st-start">
        <div class="title-lockup"><div class="logo hero" data-i18n-html="WRONGLY<br/>DRAWN"></div><div class="lockup-sub" data-i18n="错画之城 · a wrongly drawn city"></div></div>
        <button class="start-btn graffiti">
          <svg class="splat" viewBox="0 0 400 170" preserveAspectRatio="none" aria-hidden="true">
            <defs><filter id="overspray" x="-20%" y="-30%" width="140%" height="160%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="9"/></filter></defs>
            <path class="halo" filter="url(#overspray)" d="M34 52 C 70 8, 170 18, 214 14 C 280 8, 372 10, 384 58 C 396 104, 360 140, 300 146 C 220 156, 120 160, 58 140 C 12 124, 8 84, 34 52 Z"/>
            <path class="blob" d="M44 58 C 78 22, 168 30, 212 26 C 276 20, 356 26, 368 64 C 380 102, 348 128, 296 134 C 286 135, 282 160, 274 160 C 266 160, 268 136, 250 137 C 200 140, 160 142, 128 140 C 118 140, 116 166, 106 166 C 97 166, 100 140, 82 136 C 40 128, 20 92, 44 58 Z"/>
            <circle class="blob" cx="22" cy="40" r="7"/><circle class="blob" cx="388" cy="30" r="5"/><circle class="blob" cx="378" cy="148" r="6"/><circle class="blob" cx="14" cy="120" r="4"/>
          </svg>
          <span class="tag" data-i18n="START GAME"></span>
          <span class="tape t1"></span><span class="tape t2"></span>
        </button>
      </div>`;
    this.title.querySelector('.start-btn')!.addEventListener('click', () => this.onStart?.());
    this.root.appendChild(this.title);

    // ---- paint wipe + loading ----
    this.wipe = h('div', 'paint-wipe');
    for (let i = 0; i < 6; i++) {
      const s = h('div', `wipe-stroke s${i}`);
      s.style.setProperty('--i', String(i));
      this.wipe.appendChild(s);
    }
    this.wipeBadge.element.classList.add('hidden');
    this.wipe.appendChild(this.wipeBadge.element);
    this.root.appendChild(this.wipe);
    this.loading = h('div', 'loading hidden');
    this.loading.innerHTML = `
      <div class="logo load-logo" data-i18n-html="WRONGLY<br/>DRAWN"></div>
      <ul class="load-steps"></ul>
      <button type="button" class="paint-btn load-retry" data-i18n="Reload the sketchbook"></button>`;
    this.loadSteps = this.loading.querySelector('.load-steps')!;
    this.loadSteps.before(this.loadBadge.element);
    this.loading.querySelector('.load-retry')!.addEventListener('click', () => location.reload());
    this.root.appendChild(this.loading);

    // ---- HUD ----
    this.hud = h('div', 'hud hidden');
    this.hud.innerHTML = `
      <div class="ink"></div>
      <div class="hud-tl hud-piece from-left"><div class="hearts"></div></div>
      <div class="hud-tr hud-piece from-right">
        <div class="level-tag" data-i18n-html="LV. 1<br/>BLIND PLAZA"></div>
        <div class="objective-box">
          <div class="obj-title"></div>
          <button type="button" class="objective-toggle" aria-expanded="false" aria-controls="objective-details">
            ${touchIcon('list')}<span class="obj-toggle-title"></span>${touchIcon('chevron')}
          </button>
          <div class="obj-hint" id="objective-details"></div>
        </div>
        <div class="counters"><span class="crowns">${stickerIcon('crown')} 0/10</span><span class="paint">${stickerIcon('paint_drop')} 0</span></div>
      </div>
      <div class="crosshair"><i></i><i></i><i></i><i></i></div>
      <div class="hitmark"></div>
      <div class="tank"><div class="tank-fill"></div></div>
      <div class="mouthful hidden" data-i18n="MOUTHFUL — click to SPIT"></div>
      <div class="hold-ring hidden"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="ring-bg"/><circle cx="50" cy="50" r="42" class="ring-fill"/></svg><span></span></div>
      <div class="prompt hidden"></div>
      <div class="boss hidden"><div class="boss-name"></div><div class="boss-bar"><div class="boss-fill"></div></div></div>
      <div class="cards hud-piece from-bottom"></div>
      <div class="toasts"></div>
      <div class="region hidden"></div>
      <div class="help" data-i18n-html="${HELP_HTML}"></div>
      <div class="lock-hint hidden"></div>
      <div class="vignette"></div>`;
    const q = <T extends HTMLElement>(s: string) => this.hud.querySelector(s) as T;
    this.hearts = q('.hearts');
    this.objTitle = q('.obj-title');
    this.objHint = q('.obj-hint');
    this.objToggleTitle = q('.obj-toggle-title');
    const objectiveToggle = q<HTMLButtonElement>('.objective-toggle');
    objectiveToggle.addEventListener('click', () => {
      const open = objectiveToggle.getAttribute('aria-expanded') === 'true';
      objectiveToggle.setAttribute('aria-expanded', String(!open));
    });
    this.prompt = q('.prompt');
    this.toasts = q('.toasts');
    this.holdRing = q('.hold-ring');
    this.holdFill = this.hud.querySelector('.ring-fill') as SVGCircleElement;
    this.holdLabel = q('.hold-ring span');
    this.help = q('.help');
    this.lockHint = q('.lock-hint');
    this.vignette = q('.vignette');
    this.ink = q('.ink');
    this.crosshair = q('.crosshair');
    this.hitmark = q('.hitmark');
    this.tank = q('.tank-fill');
    this.boss = q('.boss');
    this.bossFill = q('.boss-fill');
    this.bossName = q('.boss-name');
    this.crownCount = q('.crowns');
    this.paintCount = q('.paint');
    this.mouthful = q('.mouthful');
    this.regionBanner = q('.region');
    const cardsEl = q('.cards');
    for (const ty of ORGAN_ORDER) {
      const d = ORGAN_DEFS[ty];
      const c = h('div', `card locked ${ty.toLowerCase()}`, `<div class="card-key">${d.keyLabel}</div><div class="card-icon"></div><div class="card-name" data-i18n="${d.name.replace(' Sticker', '')}"></div><div class="card-state"></div>`);
      cardsEl.appendChild(c);
      this.cards[ty] = c;
      // tooltip: hover where the cursor is free (pause, Alt, no pointer lock), tap on touch
      c.addEventListener('pointerenter', (e) => {
        if (e.pointerType === 'mouse') this.showTip(ty, 0);
      });
      c.addEventListener('pointerleave', (e) => {
        if (e.pointerType === 'mouse' && this.tipType === ty && !this.tipTimer) this.hideTip();
      });
      c.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        e.stopPropagation();
        if (this.tipType === ty) this.hideTip();
        else this.showTip(ty, TIP_MS);
      });
    }
    this.tip = h('div', 'sticker-tip hidden');
    this.tip.setAttribute('role', 'tooltip');
    this.root.appendChild(this.hud);
    this.root.appendChild(this.tip);

    // ---- pause (with settings) ----
    this.pause = h('div', 'screen overlay pause hidden');
    this.pause.innerHTML = `<div class="panel book-panel"><div class="tabs"><button class="tab on" data-tab="arsenal" data-i18n="ARSENAL"></button><button class="tab" data-tab="book" data-i18n="STICKER BOOK"></button></div>
      <div class="tab-body arsenal"></div><div class="tab-body book hidden"></div></div><div class="panel"><div class="logo" data-i18n="PAUSED"></div>
      <label><span data-i18n="Music"></span> <input type="range" min="0" max="1" step="0.05" value="0.55" class="s-music"></label>
      <label><span data-i18n="Sound FX"></span> <input type="range" min="0" max="1" step="0.05" value="0.9" class="s-sfx"></label>
      <label><span data-i18n="Mouse sensitivity"></span> <input type="range" min="0.0008" max="0.005" step="0.0002" value="0.0024" class="s-sens"></label>
      <div class="lang-row"><span data-i18n="Language"></span> <button class="lang-btn"></button></div>
      <div class="gfx-settings">
        <div class="lang-row gfx-row"><span id="pause-gfx-label" data-i18n="Graphics"></span>
          <select class="s-gfx" aria-labelledby="pause-gfx-label"><option value="auto" data-i18n="Auto"></option><option value="low" data-i18n="Low"></option><option value="medium" data-i18n="Medium"></option><option value="high" data-i18n="High"></option></select>
          <span class="gfx-now"></span></div>
        <div class="lang-row gfx-row"><span id="pause-fps-label" data-i18n="Frame rate"></span>
          <select class="s-fps" aria-labelledby="pause-fps-label">${FRAME_RATE_OPTIONS.map(({ id, label }) => `<option value="${id}" data-i18n="${label}"></option>`).join('')}</select></div>
        ${WEB_PLAY ? `<p class="gfx-tip" data-i18n="${PAUSE_TIP}"></p>` : ''}
      </div>
      <div class="lang-row style-row"><span data-i18n="Art style"></span>
        <select class="s-style"><option value="graffiti" data-i18n="Graffiti"></option><option value="desert" data-i18n="Sunbleached Comic"></option><option value="storybook" data-i18n="Storybook"></option><option value="riso" data-i18n="Riso Print"></option></select></div>
      <div class="lang-row diff-row"><span data-i18n="Difficulty"></span> <select class="s-diff"></select></div><div class="diff-note"></div>
      <button class="paint-btn resume" data-i18n="RESUME"></button>
      <button class="paint-btn alt restart" data-i18n="RESTART LEVEL"></button>
      <button class="paint-btn alt to-title" data-i18n="TITLE SCREEN"></button></div>`;
    this.sens = this.pause.querySelector('.s-sens')!;
    const emit = () =>
      this.onSettings?.({
        music: Number((this.pause.querySelector('.s-music') as HTMLInputElement).value),
        sfx: Number((this.pause.querySelector('.s-sfx') as HTMLInputElement).value),
        sens: Number(this.sens.value),
      });
    this.pause.querySelectorAll('input').forEach((i) => i.addEventListener('input', emit));
    const gfx = this.pause.querySelector('.s-gfx') as HTMLSelectElement;
    const fps = this.pause.querySelector<HTMLSelectElement>('.s-fps')!;
    const gfxNow = this.pause.querySelector('.gfx-now') as HTMLElement;
    const showGfx = () => {
      gfx.value = Quality.pref;
      fps.value = Quality.frameRate;
      gfxNow.textContent = Quality.pref === 'auto' ? `→ ${t(Quality.tier === 'low' ? 'Low' : Quality.tier === 'medium' ? 'Medium' : 'High')} · ${Math.round(Quality.scale * 100)}%` : '';
    };
    gfx.addEventListener('change', () => {
      Quality.setPref(gfx.value as TierPref);
      showGfx();
    });
    Quality.onChange = showGfx;
    if (WEB_PLAY) Quality.onStruggle = () => this.toast(frameTip(), 'warn', true);
    fps.addEventListener('change', () => Quality.setFrameRate(fps.value as FrameRatePref));
    const styleSel = this.pause.querySelector('.s-style') as HTMLSelectElement;
    styleSel.addEventListener('change', () => this.onStyle?.(styleSel.value));
    this.showStyle = (id: string) => (styleSel.value = id);
    this.showGfx = showGfx;
    bindDifficultySelect(this.pause.querySelector('.diff-row')!);
    this.pause.querySelectorAll<HTMLButtonElement>('.tabs .tab').forEach((b) =>
      b.addEventListener('click', () => {
        this.pause.querySelectorAll('.tabs .tab').forEach((x) => x.classList.toggle('on', x === b));
        this.pause.querySelectorAll('.tab-body').forEach((x) => x.classList.toggle('hidden', !x.classList.contains(b.dataset.tab!)));
        this.onHover?.();
      }),
    );
    this.pause.querySelector('.resume')!.addEventListener('click', () => this.onResume?.());
    this.pause.querySelector('.restart')!.addEventListener('click', () => this.onRestart?.());
    this.pause.querySelector('.to-title')!.addEventListener('click', () => this.onTitle?.());
    this.root.appendChild(this.pause);

    // ---- complete ----
    this.complete = h('div', 'screen complete hidden');
    this.complete.innerHTML = `<div class="confetti"></div>
      <div class="cel-title"><div class="logo big" data-i18n-html="BLIND PLAZA<br/>AWAKE!"></div><div class="complete-sub" data-i18n="The plaza can see again. Next: the Correction Tower…"></div></div>
      <div class="panel cel">
        <div class="cel-body">
          <div class="rank-wrap"><div class="rank-stamp"><b></b><i></i></div><div class="rank-word"></div><div class="rank-best"></div></div>
          <div class="stats"></div>
        </div>
        <div class="cel-unlocks"></div>
        <div class="cel-btns">
          <button class="paint-btn next-level hidden" data-i18n="NEXT LEVEL"></button>
          <button class="paint-btn restart" data-i18n="PLAY AGAIN"></button>
          <button class="paint-btn alt to-title" data-i18n="TITLE SCREEN"></button>
        </div>
      </div>`;
    this.complete.querySelector('.restart')!.addEventListener('click', () => this.onRestart?.());
    this.complete.querySelector('.to-title')!.addEventListener('click', () => this.onTitle?.());
    this.complete.querySelector('.next-level')!.addEventListener('click', () => this.onNext?.());
    this.root.appendChild(this.complete);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyH' && !this.hud.classList.contains('hidden')) {
        // H opens the full sheet; H again folds it back into the chip
        this.help.classList.remove('hidden');
        this.help.classList.toggle('mini');
      }
    });
    this.root.querySelectorAll('button').forEach((b) => b.addEventListener('mouseenter', () => this.onHover?.()));

    // ---- language toggle (title corner + pause menu) ----
    this.root.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        setLang(getLang() === 'en' ? 'zh' : 'en');
      }),
    );
    this.applyLang();
    onLangChange(() => this.applyLang());
  }

  // ---------- i18n ----------
  private loadStepKeys: string[] = [];
  private regionKey = '';
  private bossKey = '';
  private lastCards: { inv: OrganInventory; hostName: (id: string | null) => string; hostOf?: (id: string | null) => OrganHost | undefined } | null = null;
  private lastStats: SessionStats | null = null;

  /** Re-render every static / cached string in the current language. */
  private applyLang(): void {
    this.root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
    this.root.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => (el.innerHTML = t(el.dataset.i18nHtml!)));
    const other = getLang() === 'en' ? '中文' : 'English';
    this.root.querySelectorAll<HTMLButtonElement>('.lang-btn').forEach((b) => {
      b.textContent = other;
      b.title = t('Language');
    });
    this.crosshair.dataset.far = t('too far');
    if (this.loadStepKeys.length) {
      this.loadSteps.querySelectorAll('li').forEach((li) => (li.textContent = t(this.loadStepKeys[Number(li.dataset.i)] ?? '')));
    }
    if (this.help?.dataset.mini) this.help.dataset.mini = t('H · controls');
    if (this.regionKey) this.regionBanner.textContent = t(this.regionKey);
    if (this.bossKey) this.bossName.textContent = t('{name} — corruption', { name: t(this.bossKey) });
    if (this.lastCards) this.setCards(this.lastCards.inv, this.lastCards.hostName, this.lastCards.hostOf);
    else for (const ty of ORGAN_ORDER) (this.cards[ty].querySelector('.card-state') as HTMLElement).textContent = t('not found');
    if (this.lastStats && !this.complete.classList.contains('hidden')) this.showComplete(this.lastStats, this.lastView ?? undefined);
    this.toasts.querySelectorAll<HTMLElement>('.toast').forEach((el) => ((el.dataset.text = el.textContent = retranslate(el.dataset.text ?? el.textContent ?? ''))));
  }

  onHover: (() => void) | null = null;

  // ---------- title ----------
  showTitle(img: HTMLImageElement | null, cleanPlate: string | null): void {
    const art = this.title.querySelector('.title-art') as HTMLElement;
    const plate = this.title.querySelector('.title-plate') as HTMLElement;
    this.title.classList.remove('bursting', 'pushing', 'hidden');
    if (cleanPlate) plate.style.backgroundImage = `url("${cleanPlate}")`;
    else if (img) plate.style.backgroundImage = `url("${img.src}")`;
    else art.classList.add('placeholder');
    this.hud.classList.add('hidden');
    this.complete.classList.add('hidden');
    this.pause.classList.add('hidden');
  }

  /** Sticker HUD pieces peel off and scatter. */
  async burstTitle(): Promise<void> {
    this.title.querySelectorAll<HTMLElement>('.sticker').forEach((s) => {
      const r = s.getBoundingClientRect();
      const cx = r.left + r.width / 2 - window.innerWidth / 2;
      const cy = r.top + r.height / 2 - window.innerHeight / 2;
      const len = Math.hypot(cx, cy) || 1;
      s.style.setProperty('--dx', `${(cx / len) * window.innerWidth * 0.9}px`);
      s.style.setProperty('--dy', `${(cy / len) * window.innerHeight * 0.9 + 120}px`);
      s.style.setProperty('--rot', `${(Math.random() - 0.5) * 120}deg`);
    });
    this.title.classList.add('bursting');
    await wait(520);
  }

  /** Camera push-in into the painting. */
  async pushTitle(): Promise<void> {
    this.title.classList.add('pushing');
    await wait(900);
  }

  /** Cross-dissolve the painting into the 3D view. */
  async fadeTitle(ms = 700): Promise<void> {
    this.title.classList.add('fading');
    await wait(ms);
    this.title.classList.add('hidden');
    this.title.classList.remove('fading');
  }

  hideTitle(): void {
    this.title.classList.add('hidden');
  }

  // ---------- wipe / loading ----------
  async wipeIn(phase: string): Promise<void> {
    this.wipe.classList.remove('out');
    this.wipe.classList.add('in');
    await wait(750);
    this.wipeCovered = true;
    this.wipeBadge.element.classList.remove('hidden');
    await this.wipeProgress(0, phase);
  }
  async wipeProgress(percent: number, phase: string): Promise<void> {
    this.wipeBadge.set(percent, phase);
    await commitLoadingFrame();
  }
  async wipeOut(): Promise<void> {
    this.wipeCovered = false;
    this.wipeBadge.element.classList.add('hidden');
    this.wipe.classList.remove('in');
    this.wipe.classList.add('out');
    await wait(800);
    this.wipe.classList.remove('out');
  }
  showLoading(steps: string[]): void {
    this.loadStepKeys = steps.slice();
    this.loadSteps.innerHTML = steps.map((s, i) => `<li data-i="${i}">${t(s)}</li>`).join('');
    this.loadBadge.set(0, steps[0]);
    this.loading.classList.remove('hidden');
    this.dropLoadTip();
    if (WEB_PLAY) this.dropLoadTip = slowLoadTip(this.loading);
  }
  private dropLoadTip: () => void = () => {};
  async setLoading(stepIndex: number, frac: number, label: string, total: number): Promise<void> {
    this.loadBadge.set((stepIndex + Math.min(1, frac)) / total * 100, label);
    this.loadSteps.querySelectorAll('li').forEach((li) => {
      const i = Number(li.dataset.i);
      li.className = i < stepIndex || (i === stepIndex && frac >= 1) ? 'done' : i === stepIndex ? 'active' : '';
    });
    await commitLoadingFrame();
  }
  hideLoading(): void {
    this.dropLoadTip();
    this.loading.classList.add('hidden');
  }
  showLoadError(msg: string): void {
    this.loading.classList.add('has-error');
    this.loadBadge.error(t('Error: {msg}', { msg }));
  }

  // ---------- HUD ----------
  private helpT = 0;
  /** The full control sheet is opt-in (H): play starts with only a small "H · controls" chip. */
  helpTick(dt: number): void {
    this.helpT += dt;
  }

  /** Fresh session: back to the folded chip. */
  resetHelp(): void {
    this.helpT = 0;
    this.help.dataset.mini = t('H · controls');
    this.help.classList.add('mini');
    this.help.classList.remove('hidden');
  }

  /** Menus (pause, completion, boon pick) sit on a clean screen: the HUD steps back underneath. */
  private menus = new Set<string>();
  private underMenu(which: string, on: boolean): void {
    if (on) this.menus.add(which);
    else this.menus.delete(which);
    this.hud.classList.toggle('under-menu', this.menus.size > 0);
  }

  showHUD(on: boolean, animateIn = false): void {
    this.hud.classList.toggle('hidden', !on);
    if (!on) this.hideTip();
    if (on && animateIn) {
      this.hud.classList.remove('arrive');
      void this.hud.offsetWidth;
      this.hud.classList.add('arrive');
    }
  }

  setHearts(hp: number, max: number): void {
    let s = '';
    for (let i = 0; i < max / 2; i++) {
      const v = hp - i * 2;
      s += `<span class="heart">${stickerIcon(v >= 2 ? 'hp_full' : v === 1 ? 'hp_half' : 'hp_empty')}</span>`;
    }
    this.hearts.innerHTML = s;
  }

  /**
   * Corruption ink slapped onto the screen from the side the hit came from
   * (angle: 0 = ahead/top, +π/2 = right, ±π = behind/bottom). Drips, then fades.
   */
  inkHit(angle: number, heavy: boolean): void {
    const n = heavy ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'ink-blot';
      const a = angle + (Math.random() - 0.5) * 0.7;
      // place on an ellipse hugging the screen edge
      const x = 50 + Math.sin(a) * (40 + Math.random() * 6);
      const y = 50 - Math.cos(a) * (36 + Math.random() * 8);
      const size = (heavy ? 30 : 22) + Math.random() * 10;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.width = el.style.height = `${size}vmin`;
      el.style.setProperty('--rot', `${Math.random() * 360}deg`);
      el.style.animationDelay = `${i * 0.04}s`;
      el.innerHTML = UI.blotSvg();
      this.hud.appendChild(el);
      setTimeout(() => el.remove(), 2000);
    }
  }

  private static blotSvg(): string {
    // irregular splat with drips (procedural each time)
    const pts: string[] = [];
    const N = 22;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = 30 + Math.random() * 12 + (i % 5 === 0 ? 10 : 0);
      pts.push(`${(50 + Math.cos(a) * r).toFixed(1)},${(50 + Math.sin(a) * r).toFixed(1)}`);
    }
    let dots = '';
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 44 + Math.random() * 10;
      dots += `<circle cx="${(50 + Math.cos(a) * r).toFixed(1)}" cy="${(50 + Math.sin(a) * r).toFixed(1)}" r="${(1.5 + Math.random() * 3).toFixed(1)}"/>`;
    }
    let drips = '';
    for (let i = 0; i < 3; i++) {
      const x = 32 + Math.random() * 36;
      drips += `<rect class="drip" x="${x.toFixed(1)}" y="55" width="${(3 + Math.random() * 3).toFixed(1)}" height="${(25 + Math.random() * 25).toFixed(1)}" rx="3"/>`;
    }
    return `<svg viewBox="0 0 100 100"><g fill="#3a0f5e"><polygon points="${pts.join(' ')}"/>${dots}${drips}</g><g fill="#7a2cff" opacity=".55"><circle cx="44" cy="44" r="14"/></g></svg>`;
  }

  private impactEl: HTMLElement | null = null;
  private bombEl: HTMLElement | null = null;
  private encEl: HTMLElement | null = null;
  private frenzyEl: HTMLElement | null = null;
  private encKey = '';

  /** ENCORE meter: payout ×, odds of the next stamp (ink meter), decision clock, FRENZY pips. */
  setEncore(v: EncoreView): void {
    if (!this.encEl) {
      const st = document.createElement('style');
      st.textContent = `
.encore { position: absolute; left: 50%; bottom: calc(24% + 52px); transform: translateX(-50%) rotate(1deg); width: 300px; background: var(--black); border: 3px solid var(--yellow); padding: 8px 12px 9px; color: #fff; text-align: center; box-shadow: 4px 5px 0 #000; transition: opacity .12s; }
.encore.hidden { display: none; }
.encore.frenzy { border-color: #ffd23a; box-shadow: 0 0 18px #ffd23a, 4px 5px 0 #000; }
.encore .enc-head { display: flex; justify-content: center; align-items: baseline; gap: 10px; font-size: 15px; letter-spacing: 1px; }
.encore .enc-mult { font-size: 34px; color: var(--yellow); text-shadow: 2px 2px 0 #ff4fa3; line-height: 1; }
.encore .enc-next { font-size: 18px; color: #22c4c0; }
.encore .enc-odds { position: relative; height: 22px; margin: 7px 0 4px; background: #2a2230; border: 2px solid #fff; transform: skewX(-10deg); overflow: hidden; }
.encore .enc-odds i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--c, #22c4c0); transition: width .15s; }
.encore .enc-odds span { position: relative; font-size: 16px; line-height: 20px; color: #fff; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000; }
.encore .enc-time { position: relative; height: 12px; background: #2a2230; border: 2px solid #fff; }
.encore .enc-time u { position: absolute; top: 0; bottom: 0; background: repeating-linear-gradient(45deg, #ffd23a 0 6px, #ffb800 6px 12px); box-shadow: 0 0 10px #ffd23a; }
.encore .enc-time i { position: absolute; left: 0; top: -4px; bottom: -4px; width: 4px !important; margin-left: -2px; background: #fff; box-shadow: 0 0 6px #fff; }
.encore.sweet { border-color: #ffd23a; box-shadow: 0 0 22px #ffd23a, 4px 5px 0 #000; }
.encore.sweet .enc-sub b { animation: frenzyPulse .25s infinite alternate; display: inline-block; }

.encore .enc-sub { font-size: 13px; margin-top: 5px; color: var(--cream); }
.encore .enc-sub b { color: var(--yellow); }
.encore .enc-res { font-size: 26px; padding: 6px 0; }
.encore .enc-res.slip { color: #ff2448; } .encore .enc-res.cash { color: var(--yellow); }
.frenzy-badge { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); font-size: 13px; color: var(--cream); background: rgba(20,16,20,.75); padding: 3px 10px; border: 2px solid #000; white-space: nowrap; }
.frenzy-badge.hidden { display: none; }
.frenzy-badge .pip { display: inline-block; width: 9px; height: 9px; margin: 0 1.5px; border-radius: 50%; border: 1.5px solid var(--yellow); vertical-align: -1px; }
.frenzy-badge .pip.on { background: var(--yellow); }
.frenzy-badge.ready { color: #000; background: var(--yellow); animation: frenzyPulse .5s infinite alternate; }
@keyframes frenzyPulse { to { transform: translateX(-50%) scale(1.08); } }`;
      document.head.appendChild(st);
      this.encEl = document.createElement('div');
      this.encEl.className = 'encore hidden';
      this.hud.appendChild(this.encEl);
      this.frenzyEl = document.createElement('div');
      this.frenzyEl.className = 'frenzy-badge hidden';
      this.hud.appendChild(this.frenzyEl);
    }
    const el = this.encEl;
    const showRes = !v.active && v.result !== '' && v.resultT < 1.4;
    el.classList.toggle('hidden', !v.active && !showRes);
    el.classList.toggle('frenzy', v.active && v.frenzy);
    const pct = Math.round(v.odds * 100);
    const key = v.active ? `a|${v.stamps}|${pct}|${v.rolling}|${v.frenzy}|${getLang()}` : showRes ? `r|${v.result}|${v.resultMult}|${getLang()}` : '';
    if (key !== this.encKey) {
      this.encKey = key;
      if (v.active) {
        const col = v.frenzy ? '#ffd23a' : pct >= 70 ? '#22c4c0' : pct >= 45 ? '#ffd23a' : '#ff2448';
        el.innerHTML =
          `<div class="enc-head"><span>${t('ENCORE')}</span><b class="enc-mult">×${v.mult}</b><span class="enc-next">→ ×${v.nextMult}</span></div>` +
          `<div class="enc-odds" style="--c:${col}"><i style="width:${pct}%"></i><span>${v.rolling ? t('STAMPING…') : v.frenzy ? t('FRENZY — 100%, can’t slip!') : t('{pct}% it sticks', { pct })}</span></div>` +
          `<div class="enc-time"><u style="left:${(v.sweet[0] * 100).toFixed(0)}%;width:${((v.sweet[1] - v.sweet[0]) * 100).toFixed(0)}%"></u><i></i></div>` +
          `<div class="enc-sub">${t('<b>{key}</b> on the GOLD = PERFECT · wait to collect {n} paint drops', { key: document.body.classList.contains('touch-mode') ? t('Encore') : 'E', n: v.drops })}</div>`;
      } else if (showRes) {
        el.innerHTML = v.result === 'slip' ? `<div class="enc-res slip">${t('SLIPPED! Dodge the shove!')}</div>` : `<div class="enc-res cash">${t('CASHED OUT ×{mult}!', { mult: v.resultMult })}</div>`;
      }
    }
    const bar = el.querySelector('.enc-time i') as HTMLElement | null;
    // the clock is a needle sweeping left; E while it crosses the gold zone = PERFECT
    if (bar) bar.style.left = `${(v.rolling ? 0 : v.window * 100).toFixed(1)}%`;
    el.classList.toggle('sweet', v.active && !v.rolling && v.window >= v.sweet[0] && v.window <= v.sweet[1]);
    // FRENZY charge (persistent once you've started stamping)
    const f = this.frenzyEl!;
    const showF = v.frenzyReady || v.frenzyCharge > 0;
    f.classList.toggle('hidden', !showF);
    f.classList.toggle('ready', v.frenzyReady);
    const fk = `${v.frenzyCharge}|${v.frenzyReady}|${getLang()}`;
    if (showF && f.dataset.k !== fk) {
      f.dataset.k = fk;
      f.innerHTML = v.frenzyReady
        ? t('FRENZY READY — next ENCORE can’t slip!')
        : `${t('FRENZY')} ` + Array.from({ length: 10 }, (_, i) => `<span class="pip${i < v.frenzyCharge ? ' on' : ''}"></span>`).join('');
    }
  }
  private streakEl: HTMLElement | null = null;
  private streakT = 0;
  /** ENCORE streak: every stamp that sticks gets its own escalating celebration banner. */
  stampStreak(n: number, mult: number): void {
    if (!this.streakEl) {
      this.streakEl = h('div', 'stamp-streak hidden');
      this.hud.appendChild(this.streakEl);
    }
    const names = ['', 'STAMPED!', 'DOUBLE STAMP!', 'TRIPLE STAMP!', 'QUAD STAMP!', 'PENTA STAMP!', 'UNSTOPPABLE!', 'LEGENDARY STAMP!!'];
    const el = this.streakEl;
    const lv = Math.min(7, Math.max(1, n));
    el.className = `stamp-streak lv${lv}`;
    el.innerHTML =
      `<div class="ss-seal"><b>${n}</b><small>${t('IN A ROW')}</small></div>` +
      `<div class="ss-text"><b>${t(names[lv])}</b><span>×${mult} ${t('payout')}</span></div>` +
      Array.from({ length: 6 + lv * 2 }, (_, i) => `<i style="--a:${Math.round((i / (6 + lv * 2)) * 360)}deg;--r:${80 + Math.random() * 60 + lv * 14}px"></i>`).join('');
    void el.offsetWidth;
    el.classList.add('on');
    clearTimeout(this.streakT);
    this.streakT = window.setTimeout(() => el.classList.remove('on'), 1500 + lv * 120);
  }

  /** Anime impact frame: a 2-frame inverted flash with radial burst lines. */
  impactFrame(strength: number): void {
    if (!this.impactEl) {
      this.impactEl = document.createElement('div');
      this.impactEl.className = 'impact-frame';
      this.root.appendChild(this.impactEl);
    }
    const el = this.impactEl;
    el.style.setProperty('--k', String(Math.min(1, strength)));
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  setPaintTime(on: boolean): void {
    document.body.classList.toggle('paint-time', on);
  }

  /** Throw HUD: charge ring + what you'd throw (rocks carried, or the can). */
  setThrow(rocks: number, charge: number, canOut: boolean): void {
    if (!this.bombEl) {
      this.bombEl = document.createElement('div');
      this.bombEl.className = 'bomb-meter';
      this.bombEl.innerHTML = '<span></span><i></i>';
      this.hud.appendChild(this.bombEl);
    }
    const f = Math.max(0, Math.min(1, charge));
    this.bombEl.style.setProperty('--f', `${(f * 360).toFixed(0)}deg`);
    this.bombEl.classList.toggle('ready', f >= 1);
    this.bombEl.classList.toggle('can-out', canOut);
    const label = rocks > 0 ? `${stickerIcon('stone')} ×${rocks}` : canOut ? t('CAN!') : t('THROW');
    const span = this.bombEl.querySelector('span')!;
    if (span.dataset.label !== label) {
      span.dataset.label = label;
      span.innerHTML = label;
    }
    this.crosshair.classList.toggle('no-can', canOut);
  }

  private captionEl: HTMLElement | null = null;
  /** Story caption (big = cinematic, centered low). */
  storyCaption(text: string | null, big = false): void {
    if (!this.captionEl) {
      this.captionEl = document.createElement('div');
      this.captionEl.className = 'story-caption';
      this.root.appendChild(this.captionEl);
    }
    const el = this.captionEl;
    if (!text) {
      el.classList.remove('on');
      return;
    }
    el.textContent = text;
    el.classList.toggle('big', big);
    el.classList.remove('on');
    void el.offsetWidth;
    el.classList.add('on');
  }

  /** Sticker Book (in the pause screen): challenges, rewards, cape skins. */
  renderBook(
    rows: { title: string; progress: number; goal: number; reward: string; icon: string; done: boolean; elsewhere?: string | null }[],
    skins: { id: string; name: string; unlocked: boolean; active: boolean }[],
    onSkin: (id: string) => void,
  ): void {
    const el = this.pause.querySelector('.book') as HTMLElement;
    const base = import.meta.env.BASE_URL;
    el.innerHTML =
      rows
        .map(
          (r) => `<div class="ch ${r.done ? 'done' : ''} ${r.elsewhere && !r.done ? 'elsewhere' : ''}"><img src="${base}assets/stickers/${r.icon}.webp"><div class="ch-t"><b>${t(r.title)}${r.elsewhere ? ` <small class="ch-lv">${r.elsewhere}</small>` : ''}</b><span>${t('Reward')}: ${t(r.reward)}</span>
          <div class="ch-bar"><i style="width:${Math.round((r.progress / r.goal) * 100)}%"></i></div></div><em>${r.done ? '✔' : `${r.progress}/${r.goal}`}</em></div>`,
        )
        .join('') +
      `<div class="skins"><b>${t('Cape')}</b>` +
      skins
        .map((s) => `<button class="skin ${s.active ? 'on' : ''} ${s.unlocked ? '' : 'locked'}" data-skin="${s.id}" ${s.unlocked ? '' : 'disabled'}>${s.unlocked ? t(s.name) : stickerIcon('lock') + t(s.name)}</button>`)
        .join('') +
      '</div>';
    el.querySelectorAll<HTMLButtonElement>('.skin').forEach((b) => b.addEventListener('click', () => onSkin(b.dataset.skin!)));
  }

  /** Equipped ids at the last render (to slap on / peel off only what changed). */
  private arPrev: Set<string> | null = null;
  /** Item whose details the masking-tape info strip shows (hover / focus / tap). */
  private arInfo: string | null = null;
  /** Running slap-on / stick-back animations (id → start time), so a quick re-render doesn't restart or drop them. */
  /** Which charm sits in which wall spot: charms keep their spot when a neighbour is peeled off. */
  private arCharmSpots: (string | null)[] = [];
  private arAnim = new Map<string, { kind: 'slap' | 'back'; t: number }>();
  /**
   * ARSENAL (pause screen) — "WAI's wall": the loadout is a tagged brick wall with sprayed stencil spots (1 spray cap,
   * 1 gadget, 3 charms) and this run's boons wheat-pasted on as mini posters. Below it the sticker sheet holds every
   * item: tap a sticker to peel it off the sheet and slap it on the wall, tap it on the wall (or its empty die-cut on
   * the sheet) to peel it back off. Locked stickers sit under black tape; tapping one shows how to unlock it.
   */
  renderArsenal(
    items: { id: string; slot: string; name: string; desc: string; owned: boolean; on: boolean; how: string | null }[],
    charm: { charms: number; max: number },
    boons: { id: string; name: string; rarity: string; n: number; desc: string }[],
    onToggle: (id: string) => void,
  ): void {
    const root = this.pause.querySelector('.arsenal') as HTMLElement;
    if (!root.querySelector('.ar-body')) root.innerHTML = '<div class="ar-body"></div><div class="ar-fx"></div>';
    const el = root.querySelector('.ar-body') as HTMLElement;
    const fx = root.querySelector('.ar-fx') as HTMLElement;
    const on = new Set(items.filter((i) => i.on).map((i) => i.id));
    const prev = this.arPrev;
    this.arPrev = on;
    // stickers leaving the wall: remember where they were so a copy can peel off after the re-render
    const peels: { html: string; x: number; y: number; w: number; h: number }[] = [];
    const now = performance.now();
    if (prev) {
      for (const id of on) if (!prev.has(id)) this.arAnim.set(id, { kind: 'slap', t: now });
      for (const id of prev) if (!on.has(id)) this.arAnim.set(id, { kind: 'back', t: now });
      const box = root.getBoundingClientRect();
      el.querySelectorAll<HTMLElement>('.wall-st[data-id]').forEach((w) => {
        if (on.has(w.dataset.id!)) return;
        const r = w.getBoundingClientRect();
        if (r.width) peels.push({ html: w.innerHTML, x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
      });
    }
    for (const [id, a] of this.arAnim) if (now - a.t > 600) this.arAnim.delete(id);
    /** class + style continuing a running animation (negative delay = already this far in). */
    const anim = (id: string, kind: 'slap' | 'back') => {
      const a = this.arAnim.get(id);
      return a && a.kind === kind ? { cls: kind, st: `--ad:${(-(now - a.t) / 1000).toFixed(3)}s;` } : { cls: '', st: '' };
    };
    const byId = new Map(items.map((i) => [i.id, i]));
    const wallSt = (id: string | undefined, label: string, cls = '') => {
      const i = id ? byId.get(id) : undefined;
      return i
        ? `<button class="wall-st ${cls} ${anim(i.id, 'slap').cls}" data-id="${i.id}" style="${anim(i.id, 'slap').st}--r:${(((i.id.charCodeAt(0) * 7 + i.id.length * 13) % 11) - 5) * 1.2}deg">${itemImg(i.id)}<b>${t(i.name)}</b></button>`
        : `<div class="wall-st empty ${cls}"><span>${label}</span></div>`;
    };
    const eq = (slot: string) => items.filter((i) => i.slot === slot && i.on).map((i) => i.id);
    const cur = eq('charm');
    const spots = Array.from({ length: charm.max }, (_, k) => (this.arCharmSpots[k] && cur.includes(this.arCharmSpots[k]!) ? this.arCharmSpots[k] : null));
    for (const c of cur) if (!spots.includes(c)) spots[spots.indexOf(null)] = c;
    this.arCharmSpots = spots;
    const rar: Record<string, string> = { common: t('COMMON'), rare: t('RARE'), epic: t('EPIC'), legendary: t('LEGENDARY') };
    const wall =
      `<div class="ar-wall">` +
      `<div class="ar-spots">` +
      `<div class="spot cap"><div class="spot-tag">${t('Spray cap')}<small>${t('pick 1')}</small></div>${wallSt(eq('weapon')[0], t('empty'), 'big')}</div>` +
      `<div class="spot gad"><div class="spot-tag">${t('Gadget')}<small>${t('1 · press B')}</small></div>${wallSt(eq('gadget')[0], t('empty'))}</div>` +
      `<div class="spot chm"><div class="spot-tag">${t('Charms')}<small>${charm.charms}/${charm.max}</small></div><div class="trio">` +
      spots.map((c, k) => wallSt(c ?? undefined, String(k + 1), 'sm')).join('') +
      `</div></div></div>` +
      `<div class="ar-posters"><div class="spot-tag">${t('This run’s boons')}<small>${t('pick 1 of 3 after each Guardian')}</small></div>` +
      (boons.length
        ? `<div class="ar-boons">${boons
            .map(
              (b, k) =>
                `<button class="poster ${b.rarity}" data-boon="${b.id}" style="--r:${((k * 5) % 7) - 3}deg" aria-label="${t(b.name)}">${boonImg(b.id)}${b.n > 1 ? `<em>×${b.n}</em>` : ''}<span>${t(b.name)}</span></button>`,
            )
            .join('')}</div>`
        : `<div class="ar-empty">${t('None yet — wake a Guardian.')}</div>`) +
      `</div></div>`;
    const row = (slot: string, title: string) =>
      `<div class="sh-row"><div class="sh-label">${t(title)}</div><div class="sh-items">` +
      items
        .filter((i) => i.slot === slot)
        .map(
          (i) =>
            `<button class="sh-st ${i.on ? 'on' : ''} ${i.owned ? '' : 'locked'} ${anim(i.id, 'back').cls}" data-id="${i.id}" aria-pressed="${i.on}" style="${anim(i.id, 'back').st}">` +
            `<i>${itemImg(i.id)}${i.owned ? '' : `<span class="tape"></span>${itemImg('lock', 'lk')}`}</i><b>${t(i.name)}</b></button>`,
        )
        .join('') +
      `</div></div>`;
    el.innerHTML =
      wall +
      `<div class="ar-info"></div>` +
      `<div class="ar-sheet">${row('weapon', 'Spray cap')}${row('gadget', 'Gadget')}${row('charm', 'Charms')}</div>`;
    wireArtFallback(el);

    const info = el.querySelector('.ar-info') as HTMLElement;
    const showInfo = (id: string | null) => {
      this.arInfo = id;
      const i = id ? byId.get(id) : undefined;
      const b = id && !i ? boons.find((x) => x.id === id) : undefined;
      if (i) {
        const state = !i.owned ? itemImg('lock', 'info-lk') : i.on ? (i.slot === 'weapon' ? t('ON THE WALL — pick another cap to swap') : t('ON THE WALL — tap to peel off')) : t('tap to stick it on the wall');
        info.innerHTML = `<b>${t(i.name)}</b> <span>${i.owned ? t(i.desc) : t('Unlock: {how}', { how: t(i.how ?? '?') })}</span><small>${state}</small>`;
      } else if (b) {
        info.innerHTML = `<b class="rc ${b.rarity}">${rar[b.rarity]}</b> <b>${t(b.name)}${b.n > 1 ? ` ×${b.n}` : ''}</b> <span>${t(b.desc)}</span>`;
      } else info.innerHTML = `<span>${t('Tap a sticker to slap it on the wall · tap it on the wall to peel it off.')}</span>`;
    };
    showInfo(this.arInfo && (byId.has(this.arInfo) || boons.some((b) => b.id === this.arInfo)) ? this.arInfo : null);

    el.querySelectorAll<HTMLElement>('[data-id], [data-boon]').forEach((b) => {
      const id = b.dataset.id ?? b.dataset.boon!;
      b.addEventListener('pointerenter', (e) => {
        if ((e as PointerEvent).pointerType === 'mouse') showInfo(id);
      });
      b.addEventListener('focus', () => showInfo(id));
    });
    el.querySelectorAll<HTMLElement>('[data-boon]').forEach((b) => b.addEventListener('click', () => showInfo(b.dataset.boon!)));
    el.querySelectorAll<HTMLButtonElement>('.wall-st[data-id], .sh-st').forEach((b) =>
      b.addEventListener('click', () => {
        const i = byId.get(b.dataset.id!)!;
        this.arInfo = i.id;
        if (!i.owned || (i.slot === 'weapon' && i.on)) {
          showInfo(i.id);
          b.classList.remove('nope');
          void b.offsetWidth;
          b.classList.add('nope');
          return;
        }
        if (i.slot === 'charm' && !i.on && charm.charms >= charm.max) {
          const trio = el.querySelector('.trio') as HTMLElement;
          trio.classList.remove('nope');
          void trio.offsetWidth;
          trio.classList.add('nope');
        }
        onToggle(i.id);
      }),
    );
    // the peel-off: a copy of each removed wall sticker curls away from where it was stuck
    for (const p of peels) {
      const g = h('div', 'wall-st peel-ghost', p.html);
      g.style.setProperty('--s', `${p.w}px`);
      Object.assign(g.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px` });
      fx.appendChild(g);
      g.addEventListener('animationend', () => g.remove());
      setTimeout(() => g.remove(), 2000);
    }
  }

  private boonEl: HTMLElement | null = null;
  /** Pick 1 of 3 boons (keys 1/2/3 or click). null hides. */
  /** `golden` = index of the card the re-roll pity rule guaranteed (−1 none); `promise` = the next re-roll carries it. */
  showBoons(opts: { id: string; name: string; desc: string; rarity: string }[] | null, onPick?: (b: never) => void, onReroll?: (() => void) | null, rerolls = 0, golden = -1, promise = false): void {
    if (!this.boonEl) {
      this.boonEl = h('div', 'boon-pick hidden');
      this.root.appendChild(this.boonEl);
      window.addEventListener('keydown', (e) => {
        if (!this.boonEl || this.boonEl.classList.contains('hidden')) return;
        const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (n >= 0) (this.boonEl.querySelectorAll<HTMLButtonElement>('.boon-card')[n])?.click();
        if (e.code === 'KeyR') this.boonEl.querySelector<HTMLButtonElement>('.boon-reroll:not([disabled])')?.click();
      });
    }
    const el = this.boonEl;
    this.underMenu('boon', !!opts);
    if (!opts) {
      el.classList.add('hidden');
      return;
    }
    const rar: Record<string, string> = { common: t('COMMON'), rare: t('RARE'), epic: t('EPIC'), legendary: t('LEGENDARY') };
    el.innerHTML =
      `<div class="boon-title">${t('PICK A BOON')}</div><div class="boon-sub">${t('Guardian defeated · Lasts this run · stacks')}</div><div class="boon-row">` +
      opts
        .map(
          (b, i) =>
            `<button class="boon-card ${b.rarity}${i === golden ? ' guaranteed' : ''}" style="--d:${i * 0.08}s"><span class="boon-key">${i + 1}</span>` +
            (i === golden ? `<span class="boon-ribbon">${t('GUARANTEED')}</span>` : '') +
            `<span class="boon-frame">${boonImg(b.id)}<span class="boon-rar">${rar[b.rarity]}</span></span><b>${t(b.name)}</b><small>${t(b.desc)}</small></button>`,
        )
        .join('') +
      `</div><button class="boon-reroll" ${onReroll ? '' : 'disabled'}>${(promise ? t('Re-roll (R) · last one · gold guaranteed') : t('Re-roll (R) · {n} left', { n: rerolls }))}</button>`;
    wireArtFallback(el);
    el.querySelectorAll<HTMLButtonElement>('.boon-card').forEach((b, i) => b.addEventListener('click', () => onPick?.(opts[i] as never)));
    el.querySelector('.boon-reroll')!.addEventListener('click', () => onReroll?.());
    el.classList.remove('hidden');
  }

  private gadgetEl: HTMLElement | null = null;
  private gadgetKey = '';
  /** Gadget HUD: sticker + cooldown ring (B). `icon` is the gadget's item id. */
  setGadget(icon: string | null, frac: number): void {
    if (!this.gadgetEl) {
      this.gadgetEl = h('div', 'gadget-meter hidden', '<img class="st-ic" alt="" draggable="false"><small>B</small>');
      this.hud.appendChild(this.gadgetEl);
    }
    const key = `${icon}|${Math.round(frac * 40)}`;
    if (key === this.gadgetKey) return;
    this.gadgetKey = key;
    this.gadgetEl.classList.toggle('hidden', !icon);
    if (!icon) return;
    this.gadgetEl.style.setProperty('--f', `${(frac * 360).toFixed(0)}deg`);
    this.gadgetEl.classList.toggle('ready', frac >= 1);
    const img = this.gadgetEl.firstElementChild as HTMLImageElement;
    const src = itemArt(icon);
    if (img.getAttribute('src') !== src) img.src = src;
  }

  /** A big sticker card slaps onto the screen: UNLOCKED! / NEW STICKER! */
  unlockPopup(
    icon: string,
    info: string | { iconSrc?: string; badge?: string; title: string; desc?: string; reason?: string },
  ): void {
    this.root.querySelectorAll('.unlock-pop').forEach((n) => n.remove());
    const card = typeof info === 'string' ? { title: info } : info;
    const el = document.createElement('div');
    el.className = 'unlock-pop';
    const img = document.createElement('img');
    img.src = card.iconSrc ?? `${import.meta.env.BASE_URL}assets/stickers/${icon}.webp`;
    img.alt = '';
    const body = h('div', 'up-body');
    const badge = h('span', 'up-badge');
    badge.textContent = card.badge ?? t('UNLOCKED!');
    const title = h('b');
    title.textContent = card.title;
    body.append(badge, title);
    if (card.desc) {
      const desc = h('span', 'up-desc');
      desc.textContent = card.desc;
      body.appendChild(desc);
    }
    if (card.reason) {
      const reason = h('span', 'up-reason');
      reason.textContent = card.reason;
      body.appendChild(reason);
    }
    el.append(img, body);
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  }

  setLowHp(on: boolean): void {
    document.body.classList.toggle('low-hp', on);
  }

  flashDamage(): void {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }

  setObjective(title: string, hint: string): void {
    if (this.objTitle.textContent !== title) {
      this.objTitle.textContent = title;
      this.objToggleTitle.textContent = title;
      const box = this.objTitle.parentElement!;
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
    }
    const copy = touchHint(hint);
    if (this.objHint.textContent !== copy) {
      this.objHint.textContent = copy;
      touchPulse(copy);
    }
  }

  setCounters(crowns: number, total: number, paint: number): void {
    this.crownCount.innerHTML = `${stickerIcon('crown')} ${crowns}/${total}`;
    // progress toward the next spray colour (every 15 drops, 3 to unlock)
    if (paint < 45) {
      // "7/15 → ●": a filling dot in the colour you are collecting toward (unlocks a new spray colour at 15)
      const next = Effects.splatColor(2 + Math.floor(paint / 15));
      const pct = Math.round(((paint % 15) / 15) * 100);
      const key = `${paint}|${next}`;
      if (this.paintCount.dataset.k !== key) {
        this.paintCount.dataset.k = key;
        this.paintCount.innerHTML = `${stickerIcon('paint_drop')} ${paint % 15}/15 <i class="next-col" style="--c:${next};--p:${pct}%"></i>`;
      }
    } else {
      delete this.paintCount.dataset.k;
      this.paintCount.innerHTML = `${stickerIcon('paint_drop')} ${paint}`;
    }
    this.paintCount.title = t('Paint drops: heal ½ heart · every 15 unlock a new spray colour');
  }

  bump(which: 'crowns' | 'paint'): void {
    const el = which === 'crowns' ? this.crownCount : this.paintCount;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  setPrompt(p: PromptView | null): void {
    const key = p ? `${p.key}|${p.text}|${p.enabled}` : '';
    if (key === this.lastPromptKey) return;
    this.lastPromptKey = key;
    if (!p) {
      this.prompt.classList.add('hidden');
      return;
    }
    this.prompt.classList.remove('hidden');
    this.prompt.classList.toggle('disabled', !p.enabled);
    this.prompt.classList.toggle('has-touch-action', p.key === 'E' && p.enabled);
    const touch = document.body.classList.contains('touch-mode');
    const label = touch && p.key === 'E' ? (p.action ?? 'Interact') : p.key;
    this.prompt.innerHTML = `${label ? `<span class="key">${t(label)}</span>` : ''}<span>${touchHint(t(p.text))}</span>`;
  }

  private cardsCalm = 0;
  /** Per slot: state + host + crossed, to pop the tooltip when it changes. */
  private cardSig: Partial<Record<OrganType, string>> = {};
  private tipType: OrganType | null = null;
  private tipTimer = 0;

  /** `hostOf` (optional) lets the tooltip say what the host does with a lent sticker. */
  setCards(inv: OrganInventory, hostName: (id: string | null) => string, hostOf?: (id: string | null) => OrganHost | undefined): void {
    this.lastCards = { inv, hostName, hostOf };
    const first = inv !== this.tipInv;
    this.tipInv = inv;
    for (const ty of ORGAN_ORDER) {
      const o = inv.get(ty);
      const sig = o ? `${o.state}|${o.hostId ?? ''}|${inv.crossed.has(ty)}` : '';
      const was = this.cardSig[ty];
      this.cardSig[ty] = sig;
      // lend / recall / purify / crossed out: pop the tooltip so the player sees what the sticker does
      if (!first && was !== undefined && was !== sig && o && !o.corrupted) this.showTip(ty, TIP_MS);
    }
    if (this.tipType) this.fillTip(this.tipType);
    // the sticker cards wake up on any change, then fade back while you explore
    const tray = this.cards.EYE.parentElement!;
    tray.classList.remove('calm');
    clearTimeout(this.cardsCalm);
    this.cardsCalm = window.setTimeout(() => tray.classList.add('calm'), 6000);
    for (const ty of ORGAN_ORDER) {
      const c = this.cards[ty];
      const o = inv.get(ty);
      c.className = `card ${ty.toLowerCase()}`;
      const icon = c.querySelector('.card-icon') as HTMLElement;
      const state = c.querySelector('.card-state') as HTMLElement;
      if (inv.selected === ty) c.classList.add('selected');
      if (!o) {
        c.classList.add('locked');
        icon.style.backgroundImage = '';
        state.textContent = t('not found');
        continue;
      }
      icon.style.backgroundImage = `url(${ORGAN_ART.stickers.eye ? crispStickerUrl(ty, o.corrupted) : organIconDataURL(ty, o.corrupted)})`;
      if (o.corrupted) {
        c.classList.add('corrupted');
        state.textContent = t('hold {key}: purify', { key: o.def.keyLabel });
      } else if (inv.crossed.has(ty)) {
        c.classList.add('crossed');
        state.textContent = t('crossed out!');
      } else if (o.lent) {
        c.classList.add('lent');
        state.textContent = t('on {host}', { host: t(hostName(o.hostId)) });
      } else {
        c.classList.add('worn');
        state.textContent = t(ty === 'EYE' ? 'worn · True Sight' : ty === 'MOUTH' ? 'worn · V chomp' : 'worn · Long Legs');
      }
    }
  }

  private tipInv: OrganInventory | null = null;

  /** Show the sticker tooltip next to its card; `ms` > 0 hides it again after that long (tap / state change). */
  private showTip(ty: OrganType, ms: number): void {
    if (!this.lastCards || this.hud.classList.contains('hidden')) return;
    this.tipType = ty;
    clearTimeout(this.tipTimer);
    this.tipTimer = ms > 0 ? window.setTimeout(() => this.hideTip(), ms) : 0;
    this.fillTip(ty);
  }

  private hideTip(): void {
    clearTimeout(this.tipTimer);
    this.tipTimer = 0;
    this.tipType = null;
    this.tip.classList.add('hidden');
  }

  private fillTip(ty: OrganType): void {
    const lc = this.lastCards;
    if (!lc) return;
    const o = lc.inv.get(ty);
    const shoutEl = this.help.querySelector('.lv-shout');
    const tip = stickerTip(ty, o, {
      host: o?.lent ? lc.hostOf?.(o.hostId) : undefined,
      crossed: lc.inv.crossed.has(ty),
      selected: lc.inv.selected === ty,
      touch: document.body.classList.contains('touch-mode'),
      shout: !!shoutEl && getComputedStyle(shoutEl).display !== 'none',
    });
    const el = this.tip;
    el.className = `sticker-tip ${tip.kind}`;
    el.style.setProperty('--c', tip.color);
    el.replaceChildren();
    const head = h('div', 'tip-head');
    head.append(h('b'), h('span', 'tip-state'));
    head.firstChild!.textContent = tip.title;
    head.lastChild!.textContent = tip.state;
    el.appendChild(head);
    for (const line of tip.lines) el.appendChild(h('p')).textContent = line;
    // above the card when the tray sits low (desktop), below it when high (touch layout)
    const w = el.offsetWidth;
    const touchButton = document.body.classList.contains('touch-mode') && !document.body.classList.contains('paused')
      ? this.root.querySelector(`.touch:not(.hidden) .t-org.${ty.toLowerCase()}`)
      : null;
    if (touchButton) {
      const r = touchButton.getBoundingClientRect();
      el.style.left = `${Math.min(window.innerWidth - w - 8, r.right + 10)}px`;
      el.style.top = `${Math.max(8, Math.min(r.top, window.innerHeight - el.offsetHeight - 12))}px`;
      el.style.bottom = '';
      return;
    }
    const r = this.cards[ty].getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
    if (r.top + r.height / 2 > window.innerHeight / 2) {
      el.style.top = '';
      el.style.bottom = `${window.innerHeight - r.top + 12}px`;
    } else {
      el.style.bottom = '';
      el.style.top = `${r.bottom + 12}px`;
    }
  }

  setHold(h: { label: string; progress: number } | null): void {
    this.holdRing.classList.toggle('hidden', !h);
    if (!h) return;
    const c = 2 * Math.PI * 42;
    this.holdFill.style.strokeDasharray = `${c}`;
    this.holdFill.style.strokeDashoffset = `${c * (1 - Math.min(1, h.progress))}`;
    this.holdLabel.textContent = t(h.label);
  }

  setAimState(aimT: number, tankFrac: number, mouthful: boolean, spread: number, inRange = true, color = '#ffd23a'): void {
    this.crosshair.classList.toggle('far', !inRange);
    this.crosshair.style.setProperty('--paint', color);
    this.crosshair.style.setProperty('--gap', `${6 + spread * 260 * (1 - aimT * 0.6)}px`);
    this.crosshair.classList.toggle('aiming', aimT > 0.5);
    this.tank.style.height = `${Math.round(tankFrac * 100)}%`;
    this.tank.parentElement!.classList.toggle('low', tankFrac < 0.25);
    this.mouthful.classList.toggle('hidden', !mouthful);
  }

  hitMarker(weak: boolean, finished: boolean): void {
    this.hitmark.className = 'hitmark';
    void this.hitmark.offsetWidth;
    this.hitmark.className = `hitmark show ${weak ? 'weak' : ''} ${finished ? 'kill' : ''}`;
  }

  setPresence(v: number): void {
    this.ink.style.opacity = String(Math.min(1, v * 1.2));
  }

  setBoss(name: string | null, frac: number): void {
    this.boss.classList.toggle('hidden', !name);
    this.bossKey = name ?? '';
    if (!name) return;
    const label = t('{name} — corruption', { name: t(name) });
    if (this.bossName.textContent !== label) this.bossName.textContent = label;
    this.bossFill.style.width = `${Math.max(0, frac) * 100}%`;
  }

  showRegion(name: string): void {
    this.regionKey = name;
    this.regionBanner.textContent = t(name);
    this.regionBanner.classList.remove('hidden', 'show');
    void this.regionBanner.offsetWidth;
    this.regionBanner.classList.add('show');
  }

  /** null hides the hint; otherwise shows `text` (callers pass it already translated). */
  setLockHint(text: string | null): void {
    this.lockHint.classList.toggle('hidden', !text);
    if (text && this.lockHint.textContent !== text) this.lockHint.textContent = text;
  }

  /** 触屏一次显示一条提示。桌面保留两条。 */
  private toastLimit(): number {
    return document.body.classList.contains('touch-mode') ? 1 : 2;
  }
  private toastQ: { text: string; kind: 'info' | 'warn' | 'good' }[] = [];
  private toastGen = 0;
  private liveToasts(): HTMLElement[] {
    return [...this.toasts.children].filter((e) => !e.classList.contains('fade')) as HTMLElement[];
  }
  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info', immediate = false): void {
    const live = this.liveToasts();
    if (live.some((e) => e.dataset.text === text)) return;
    if (immediate) {
      this.toastQ = this.toastQ.filter((q) => q.text !== text);
      if (live.length >= this.toastLimit()) {
        const displaced = live.find((e) => e.dataset.immediate !== 'true') ?? live[live.length - 1];
        displaced.classList.add('fade');
        setTimeout(() => displaced.remove(), 500);
      }
      this.showToast(text, kind, true);
      return;
    }
    if (this.toastQ.some((q) => q.text === text)) return;
    if (live.length >= this.toastLimit()) {
      this.toastQ.push({ text, kind });
      if (this.toastQ.length > 3) this.toastQ.shift();
      return;
    }
    this.showToast(text, kind);
  }
  private showToast(text: string, kind: 'info' | 'warn' | 'good', immediate = false): void {
    // most callers pass already-translated text; t() also catches plain English keys
    const el = h('div', `toast ${kind}`);
    el.textContent = touchHint(t(text));
    touchPulse(el.textContent);
    el.dataset.text = text;
    if (immediate) el.dataset.immediate = 'true';
    this.toasts.insertBefore(el, immediate ? this.toasts.firstChild : null);
    // long lines stay up long enough to read
    const life = Math.min(5600, 2400 + el.textContent.length * 28);
    const gen = this.toastGen;
    setTimeout(() => {
      if (el.classList.contains('fade')) return;
      el.classList.add('fade');
      if (gen !== this.toastGen) return;
      setTimeout(() => {
        if (gen !== this.toastGen || this.liveToasts().length >= this.toastLimit()) return;
        const next = this.toastQ.shift();
        if (next) this.showToast(next.text, next.kind);
      }, 250);
    }, life);
    setTimeout(() => el.remove(), life + 500);
  }

  clearToasts(): void {
    this.toastGen++;
    this.toastQ = [];
    this.toasts.innerHTML = '';
  }

  showPause(on: boolean): void {
    document.body.classList.toggle('paused', on); // story captions step back while the menu is up
    this.pause.classList.toggle('hidden', !on);
    this.underMenu('pause', on);
    if (on) this.showGfx();
  }

  /** Which level the HUD / title stickers name (i18n html key, e.g. 'LV. 2<br/>MUTE HARBOR'). */
  setLevelTag(html: string): void {
    this.root.querySelectorAll<HTMLElement>('.level-tag').forEach((el) => {
      el.dataset.i18nHtml = html;
      el.innerHTML = t(html);
    });
  }

  private lastView: { titleHtml: string; sub: string; next: boolean } | null = null;
  private lastCel: Celebration | null = null;
  private celTimers: number[] = [];
  /** Sound beats of the celebration (the app maps them to SFX). */
  onCelebrate: ((beat: 'tick' | 'stamp' | 'unlock' | 'burst') => void) | null = null;

  showComplete(stats: SessionStats | null, view?: { titleHtml: string; sub: string; next: boolean }, cel?: Celebration): void {
    const replay = !!cel; // a fresh result animates; a language flip just re-renders
    this.lastStats = stats;
    if (cel) this.lastCel = cel;
    if (view) {
      this.lastView = view;
      const logo = this.complete.querySelector('.logo') as HTMLElement;
      logo.dataset.i18nHtml = view.titleHtml;
      logo.innerHTML = t(view.titleHtml);
      const sub = this.complete.querySelector('.complete-sub') as HTMLElement;
      sub.dataset.i18n = view.sub;
      sub.textContent = t(view.sub);
      this.complete.querySelector('.next-level')!.classList.toggle('hidden', !view.next);
    }
    this.underMenu('complete', !!stats);
    for (const id of this.celTimers) clearTimeout(id);
    this.celTimers = [];
    if (!stats) {
      this.complete.classList.add('hidden');
      this.complete.classList.remove('play');
      this.complete.querySelector('.confetti')!.innerHTML = '';
      return;
    }
    const c = this.lastCel;
    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const newTag = `<em class="new-best">${t('NEW BEST')}</em>`;
    const rows: { label: string; to: number; fmt: (v: number) => string; best?: boolean }[] = [
      { label: 'Time', to: stats.time, fmt, best: c?.newTime && !!c.prevBest },
      { label: 'Crowns', to: stats.crowns, fmt: (v) => `${Math.round(v)}/${stats.totalCrowns}`, best: c?.newCrowns && !!c.prevBest },
      { label: 'Paint drops', to: stats.paint, fmt: (v) => `${Math.round(v)}` },
      { label: 'Accuracy', to: acc, fmt: (v) => `${Math.round(v)}%` },
      { label: 'Hits taken', to: stats.damageTaken, fmt: (v) => `${Math.round(v)}` },
      { label: 'Smudges', to: stats.smudges, fmt: (v) => `${Math.round(v)}` },
    ];
    const statsEl = this.complete.querySelector('.stats') as HTMLElement;
    statsEl.innerHTML = rows
      .map((r, i) => `<div style="--d:${(0.7 + i * 0.16).toFixed(2)}s"><span>${t(r.label)}${r.best ? newTag : ''}</span><b>${r.fmt(replay ? 0 : r.to)}</b></div>`)
      .join('');
    // rank stamp
    const wrap = this.complete.querySelector('.rank-wrap') as HTMLElement;
    wrap.dataset.rank = c?.rank ?? 'B';
    wrap.querySelector('b')!.textContent = c?.rank ?? '';
    (wrap.querySelector('.rank-word') as HTMLElement).textContent = c ? t(c.word) : '';
    const best = wrap.querySelector('.rank-best') as HTMLElement;
    best.innerHTML = !c
      ? ''
      : c.newRank && c.prevBest
        ? newTag
        : c.prevBest
          ? t('Best: {rank} · {time}', { rank: c.prevBest.rank, time: fmt(Math.min(c.prevBest.time, stats.time)) })
          : t('First clear!');
    // unlocks from this run
    const un = this.complete.querySelector('.cel-unlocks') as HTMLElement;
    const items = c?.unlocks ?? [];
    un.innerHTML = items.length
      ? `<b>${t('UNLOCKED')}</b>` + items.map((u, i) => `<span class="cel-un" style="--d:${(2.5 + i * 0.22).toFixed(2)}s"><img src="${u.img}" alt="">${t(u.name)}</span>`).join('')
      : '';
    un.classList.toggle('hidden', !items.length);
    this.complete.classList.remove('hidden');
    if (!replay) {
      // re-render (language flip): show the final state straight away, no replayed entrance
      this.complete.classList.remove('play');
      return;
    }

    // ---- the show ----
    this.complete.classList.remove('play');
    void this.complete.offsetWidth;
    this.complete.classList.add('play');
    this.confetti();
    this.onCelebrate?.('burst');
    const at = (sec: number, fn: () => void) => this.celTimers.push(window.setTimeout(fn, sec * 1000));
    statsEl.querySelectorAll('b').forEach((b, i) => {
      const r = rows[i];
      at(0.7 + i * 0.16, () => {
        this.onCelebrate?.('tick');
        const t0 = performance.now();
        const dur = 450;
        const step = () => {
          const k = Math.min(1, (performance.now() - t0) / dur);
          b.textContent = r.fmt(r.to * (1 - (1 - k) ** 3));
          if (k < 1 && this.complete.classList.contains('play')) requestAnimationFrame(step);
        };
        step();
      });
    });
    at(2.0, () => this.onCelebrate?.('stamp'));
    items.forEach((_, i) => at(2.5 + i * 0.22, () => this.onCelebrate?.('unlock')));
  }

  /** Paint chips and streamers raining over the result. */
  private confetti(): void {
    const box = this.complete.querySelector('.confetti') as HTMLElement;
    const cols = ['#ff4fa3', '#ffd23a', '#22c4c0', '#2a4be0', '#ff7a1a', '#e8323c', '#f6e8d0'];
    let html = '';
    for (let i = 0; i < 90; i++) {
      const shape = i % 5 === 0 ? 'blob' : i % 3 === 0 ? 'strip' : 'chip';
      html += `<i class="cf ${shape}" style="left:${(Math.random() * 100).toFixed(1)}%;--c:${cols[i % cols.length]};--r:${Math.round(Math.random() * 720 - 360)}deg;--x:${Math.round(Math.random() * 160 - 80)}px;--d:${(Math.random() * 1.6).toFixed(2)}s;--t:${(2.6 + Math.random() * 2.4).toFixed(2)}s;--s:${(0.6 + Math.random() * 0.9).toFixed(2)}"></i>`;
    }
    box.innerHTML = html;
  }
}

export interface Celebration {
  rank: string;
  word: string;
  newTime: boolean;
  newRank: boolean;
  newCrowns: boolean;
  prevBest: { time: number; rank: string; crowns: number } | null;
  unlocks: { img: string; name: string }[];
}
