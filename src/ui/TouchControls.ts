/**
 * [INPUT]: depends on InputManager (virtual keys, look, move); OrganInventory (sticker state); stickerUrl from
 *          render/OrganArt; itemArt from ./ItemArt; touchIcon from ./TouchIcons; controlsIn / installTouchText from
 *          ./TouchText; IOS_APP / ANDROID_APP from render/Quality; ./ios-touch.css
 * [OUTPUT]: exports TouchControls (show(), setInventory(), setInteraction(), setGadget(), setAirborne(), pulse())
 * [POS]: iOS App、Android App 和手机 TapTap 在启动时启用同一 HUD。触屏与键鼠共用 InputManager。
 *        HarborSession 在此 HUD 加入大喊键。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import type { PromptView } from '../level/Session';
import type { InputManager } from '../core/InputManager';
import { t, onLangChange } from '../i18n';
import { itemArt } from './ItemArt';
import { stickerUrl } from '../render/OrganArt';
import { ANDROID_APP, IOS_APP } from '../render/Quality';
import { touchIcon, type TouchIconName } from './TouchIcons';
import { controlsIn, installTouchText, type TouchControl } from './TouchText';
import type { OrganType } from '../organs/Organ';
import type { OrganInventory } from '../organs/OrganInventory';
import './ios-touch.css';

const TAPTAP_TOUCH = import.meta.env.MODE === 'taptap' && (
  /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches
);

/**
 * INTERACTION DESIGN (two thumbs, landscape).
 *  left half   a joystick appears where the thumb lands; push to the rim to run.
 *  right half  drag to look. A finger that starts on SPRAY sprays AND turns the view: one thumb paints a line.
 *  right thumb SPRAY sits under the resting thumb. JUMP, ROLL and AIM stand on an arc one thumb-roll away from
 *              it; the second ring holds what is used now and then: INTERACT (only while something answers,
 *              with the verb beside it), SHOUT (level 2), the tool drawer (colour, throw, chomp, gadget).
 *  context     in the air the JUMP picture becomes the paint jet and ROLL becomes the paint slam, because that
 *              is what the same buttons do there.
 *  teaching    a hint that names a control makes that button pulse (ui/TouchText.ts). No letter key is shown.
 *  top left    the organ stickers: tap = select, hold = purify / recall.
 */
/** Where each named control lives. Drawer tools also wake the drawer button while the drawer is shut. */
const CONTROL: Record<TouchControl, string> = {
  spray: '.t-spray', jump: '.t-jump', roll: '.t-dodge', aim: '.t-aim', interact: '.t-use', throw: '.t-bomb', chomp: '.t-chomp',
  color: '.t-color', gadget: '.t-gadget', shout: '.t-shout', eye: '.t-org.eye', mouth: '.t-org.mouth', leg: '.t-org.leg',
  pause: '.t-pause', findpen: '.t-lock', stick: '.t-stick-ghost',
};
const HINT_MS = 4200;

export class TouchControls {
  readonly root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private lookId: number | null = null;
  private lookLast = { x: 0, y: 0 };
  private aimOn = false;
  active = false;
  private inventory: OrganInventory | null = null;
  private organs: Record<OrganType, HTMLButtonElement>;
  private tools: HTMLElement;
  private more: HTMLButtonElement;
  private heldButtons = new Map<HTMLButtonElement, Set<number>>();

  constructor(private input: InputManager, host: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'touch hidden';
    this.root.innerHTML = `
      <div class="t-zone t-left"></div>
      <div class="t-zone t-right"></div>
      <div class="t-stick hidden"><div class="t-knob"></div></div>
      <div class="t-actions">
        <button type="button" class="t-btn t-spray" data-code="Mouse0" data-touch-label="SPRAY">${touchIcon('spray')}</button>
        <button type="button" class="t-btn t-jump" data-code="Space" data-touch-label="JUMP">${touchIcon('jump')}</button>
        <button type="button" class="t-btn t-aim" data-touch-label="AIM" aria-pressed="false">${touchIcon('aim')}</button>
        <button type="button" class="t-btn t-dodge" data-code="KeyC" data-touch-label="ROLL">${touchIcon('roll')}</button>
        <button type="button" class="t-btn t-use" data-code="KeyE" data-touch-label="Interact">${touchIcon('interact')}<span class="t-use-label" aria-hidden="true"></span></button>
        <button type="button" class="t-btn t-more" data-touch-label="More actions" aria-expanded="false" aria-controls="touch-tools">${touchIcon('more')}</button>
      </div>
      <div class="t-tools" id="touch-tools" role="group" data-touch-label="More actions" hidden>
        <button type="button" class="t-btn t-color" data-code="KeyT" data-touch-label="COLOR">${touchIcon('color')}</button>
        <button type="button" class="t-btn t-bomb" data-code="KeyG" data-touch-label="THROW">${touchIcon('throw')}</button>
        <button type="button" class="t-btn t-chomp" data-code="KeyV" data-touch-label="CHOMP">${touchIcon('chomp')}</button>
        <button type="button" class="t-btn t-gadget hidden" data-code="KeyB" data-touch-label="GADGET"><img alt="" draggable="false"></button>
      </div>
      <button type="button" class="t-btn t-lock" data-code="KeyY" data-touch-label="FIND PEN">${touchIcon('findpen')}</button>
      <div class="t-organs">
        <button type="button" class="t-btn t-org eye" data-code="KeyQ" data-touch-label="EYE" data-status="missing"><img alt="" draggable="false"></button>
        <button type="button" class="t-btn t-org mouth" data-code="KeyR" data-touch-label="MOUTH" data-status="missing"><img alt="" draggable="false"></button>
        <button type="button" class="t-btn t-org leg" data-code="KeyF" data-touch-label="LEGS" data-status="missing"><img alt="" draggable="false"></button>
      </div>
      <button type="button" class="t-btn t-pause" data-code="Escape" data-touch-label="PAUSED">${touchIcon('pause')}</button>`;
    host.appendChild(this.root);
    this.tools = this.root.querySelector('#touch-tools')!;
    this.more = this.root.querySelector('.t-more')!;
    this.more.addEventListener('click', () => this.setToolsOpen(this.tools.hidden === true));
    // a hint that is shown names its controls in 〔…〕: those buttons pulse (UI dispatches the event)
    document.addEventListener('wd-touch-hint', (e) => this.pulse(controlsIn((e as CustomEvent<string>).detail)));
    this.organs = {
      EYE: this.root.querySelector('.t-org.eye')!,
      MOUTH: this.root.querySelector('.t-org.mouth')!,
      LEG: this.root.querySelector('.t-org.leg')!,
    };
    if (IOS_APP) document.documentElement.classList.add('wd-ios');
    if (IOS_APP || ANDROID_APP || TAPTAP_TOUCH) this.enableTouch();
    window.addEventListener('blur', () => this.releaseTouches());
    window.addEventListener('resize', () => this.releaseTouches());
    window.addEventListener('orientationchange', () => this.releaseTouches());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseTouches();
    });
    const applyLang = () => {
      for (const el of this.root.querySelectorAll<HTMLElement>('[data-touch-label]')) {
        el.setAttribute('aria-label', t(el.dataset.touchLabel!));
      }
      if (this.inventory) this.setInventory(this.inventory);
      this.interactionLabel = '';
      this.setInteraction(this.interactionPrompt ?? null);
    };
    applyLang();
    onLangChange(applyLang);
    this.stick = this.root.querySelector('.t-stick')!;
    this.knob = this.root.querySelector('.t-knob')!;

    const left = this.root.querySelector('.t-left') as HTMLElement;
    const right = this.root.querySelector('.t-right') as HTMLElement;
    left.addEventListener('touchstart', (e) => this.stickStart(e), { passive: false });
    right.addEventListener('touchstart', (e) => this.lookStart(e), { passive: false });
    window.addEventListener('touchmove', (e) => this.move(e), { passive: false });
    window.addEventListener('touchend', (e) => this.end(e));
    window.addEventListener('touchcancel', (e) => this.end(e));

    this.root.querySelectorAll<HTMLButtonElement>('.t-btn[data-code]').forEach((b) => {
      const code = b.dataset.code!;
      b.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (code === 'Escape') {
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
            return;
          }
          const ids = this.heldButtons.get(b) ?? new Set<number>();
          const first = ids.size === 0;
          for (const touch of Array.from(e.changedTouches)) ids.add(touch.identifier);
          this.heldButtons.set(b, ids);
          if (!first) return;
          b.classList.add('down');
          b.classList.remove('hint');
          // a short tick where the platform has one (Android browsers; iOS WebKit ignores it)
          navigator.vibrate?.(8);
          this.input.virtualDown(code);
          // 喷漆时可用同一根手指拖动镜头。
          if (code === 'Mouse0') this.lookStart(e);
        },
        { passive: false },
      );
      const up = (e: TouchEvent) => {
        if (e.cancelable) e.preventDefault();
        const ids = this.heldButtons.get(b);
        if (!ids) return;
        for (const touch of Array.from(e.changedTouches)) ids.delete(touch.identifier);
        if (ids.size) return;
        this.heldButtons.delete(b);
        b.classList.remove('down');
        this.input.virtualUp(code);
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    });
    const aim = this.root.querySelector('.t-aim') as HTMLButtonElement;
    aim.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.aimOn = !this.aimOn;
        aim.classList.toggle('on', this.aimOn);
      aim.setAttribute('aria-pressed', String(this.aimOn));
        if (this.aimOn) this.input.virtualDown('KeyZ');
        else this.input.virtualUp('KeyZ');
      },
      { passive: false },
    );
    // any touch switches the game into touch mode
    window.addEventListener(
      'touchstart',
      () => this.enableTouch(),
      { passive: true },
    );
  }

  private enableTouch(): void {
    if (this.input.touchMode) return;
    this.input.touchMode = true;
    document.body.classList.add('touch-mode');
    // from here on no translated string names a key
    installTouchText();
  }

  private swap(sel: string, icon: TouchIconName): void {
    const b = this.root.querySelector<HTMLElement>(sel);
    const g = b?.querySelector('.touch-glyph');
    if (!b || !g || g.getAttribute('data-glyph') === icon) return;
    g.outerHTML = touchIcon(icon);
  }

  private airborne = false;
  /** In the air JUMP holds the paint jet and ROLL is the paint slam: the buttons show it. */
  setAirborne(on: boolean): void {
    if (on === this.airborne) return;
    this.airborne = on;
    this.swap('.t-jump', on ? 'hover' : 'jump');
    this.swap('.t-dodge', on ? 'slam' : 'roll');
    this.root.classList.toggle('airborne', on);
  }

  private hintTimers = new Map<Element, number>();
  /** Make the named controls pulse for a few seconds (a tool inside the shut drawer wakes the drawer button). */
  pulse(controls: TouchControl[]): void {
    if (!this.active) return;
    for (const c of controls) {
      let el = this.root.querySelector<HTMLElement>(CONTROL[c]);
      if (!el || el.classList.contains('hidden')) continue;
      if (this.tools.contains(el) && this.tools.hidden) el = this.more;
      el.classList.remove('hint');
      void el.offsetWidth;
      el.classList.add('hint');
      window.clearTimeout(this.hintTimers.get(el));
      const target = el;
      this.hintTimers.set(el, window.setTimeout(() => target.classList.remove('hint'), HINT_MS));
    }
  }

  setInventory(inventory: OrganInventory): void {
    this.inventory = inventory;
    for (const [type, button] of Object.entries(this.organs) as [OrganType, HTMLButtonElement][]) {
      const organ = inventory.get(type);
      const status = !organ ? 'missing' : inventory.crossed.has(type) ? 'crossed' : organ.corrupted ? 'corrupted' : organ.lent ? 'lent' : 'worn';
      button.dataset.status = status;
      button.setAttribute('aria-pressed', String(inventory.selected === type));
      const label = t(button.dataset.touchLabel!);
      if (organ) {
        const image = button.querySelector('img')!;
        const src = stickerUrl(type, organ.corrupted);
        if (image.getAttribute('src') !== src) image.src = src;
      }
      const detail = status === 'missing' ? t('not found') :
        status === 'crossed' ? t('crossed out!') :
        status === 'corrupted' ? t('Corrupted') :
        status === 'lent' ? t('Lent') : t('Worn');
      button.setAttribute('aria-label', `${label}, ${detail}`);
    }
  }

  private interactionPrompt: PromptView | null = null;
  private interactionLabel = '';

  setInteraction(prompt: PromptView | null): void {
    this.interactionPrompt = prompt?.key === 'E' ? prompt : null;
    const available = Boolean(this.interactionPrompt?.enabled);
    const label = t(available ? (this.interactionPrompt?.action ?? 'Interact') : 'Interact');
    const detail = available ? this.interactionPrompt!.text : label;
    const key = `${label}|${detail}|${available}`;
    if (key === this.interactionLabel) return;
    this.interactionLabel = key;
    const button = this.root.querySelector<HTMLButtonElement>('.t-use')!;
    button.setAttribute('aria-label', available ? `${label} · ${detail}` : label);
    button.classList.toggle('available', available);
    // the verb stands beside the button: the picture says "use", the word says what happens
    button.querySelector('.t-use-label')!.textContent = available ? label : '';
  }

  private gadgetBtn: HTMLElement | null = null;
  private gadgetKey = '';
  /** The equipped gadget's sticker on the B button, with its cooldown as a ring (id null hides it). */
  setGadget(id: string | null, frac: number): void {
    if (!this.active && this.gadgetKey) return;
    const b = (this.gadgetBtn ??= this.root.querySelector('.t-gadget'));
    if (!b) return;
    const key = `${id}|${Math.round(frac * 40)}`;
    if (key === this.gadgetKey) return;
    this.gadgetKey = key;
    b.classList.toggle('hidden', !id);
    if (!id) return;
    const img = b.querySelector('img')!;
    const src = itemArt(id);
    if (img.getAttribute('src') !== src) img.src = src;
    b.style.setProperty('--f', `${(frac * 360).toFixed(0)}deg`);
    b.classList.toggle('ready', frac >= 1);
  }

  show(on: boolean): void {
    this.active = on;
    this.root.classList.toggle('hidden', !on);
    if (!on) {
      this.releaseTouches();
      this.setToolsOpen(false);
    }
  }

  private setToolsOpen(open: boolean): void {
    if (!open) {
      for (const button of this.heldButtons.keys()) {
        if (!this.tools.contains(button)) continue;
        this.heldButtons.delete(button);
        button.classList.remove('down');
        this.input.virtualUp(button.dataset.code!);
      }
    }
    this.tools.hidden = !open;
    this.more.setAttribute('aria-expanded', String(open));
    this.more.classList.remove('hint');
    this.swap('.t-more', open ? 'close' : 'more');
  }

  private releaseTouches(): void {
    this.input.virtualMove.x = this.input.virtualMove.y = 0;
    this.input.lookDX = this.input.lookDY = 0;
    this.stickId = this.lookId = null;
    this.stick.classList.add('hidden');
    for (const button of this.heldButtons.keys()) {
      button.classList.remove('down');
      this.input.virtualUp(button.dataset.code!);
    }
    this.heldButtons.clear();
    this.input.virtualUp('KeyX');
    this.root.querySelector('.t-shout')?.classList.remove('down');
    this.aimOn = false;
    this.input.virtualUp('KeyZ');
    const aim = this.root.querySelector('.t-aim')!;
    aim.classList.remove('on');
    aim.setAttribute('aria-pressed', 'false');
  }

  private stickStart(e: TouchEvent): void {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (this.stickId !== null) return;
    this.stickId = t.identifier;
    this.stickOrigin = { x: t.clientX, y: t.clientY };
    this.stick.style.left = `${t.clientX}px`;
    this.stick.style.top = `${t.clientY}px`;
    this.knob.style.transform = 'translate(-50%, -50%)';
    this.stick.classList.remove('hidden');
  }

  private lookStart(e: TouchEvent): void {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (this.lookId !== null) return;
    this.lookId = t.identifier;
    this.lookLast = { x: t.clientX, y: t.clientY };
  }

  private move(e: TouchEvent): void {
    if (!this.active) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        e.preventDefault();
        const R = Math.min(70, window.innerWidth * 0.09);
        let dx = t.clientX - this.stickOrigin.x;
        let dy = t.clientY - this.stickOrigin.y;
        const len = Math.hypot(dx, dy);
        if (len > R) {
          dx = (dx / len) * R;
          dy = (dy / len) * R;
        }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.input.virtualMove.x = dx / R;
        this.input.virtualMove.y = -dy / R;
      } else if (t.identifier === this.lookId) {
        e.preventDefault();
        this.input.addLook((t.clientX - this.lookLast.x) * 2.4, (t.clientY - this.lookLast.y) * 2.4);
        this.lookLast = { x: t.clientX, y: t.clientY };
      }
    }
  }

  private end(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.input.virtualMove.x = this.input.virtualMove.y = 0;
        this.stick.classList.add('hidden');
      } else if (t.identifier === this.lookId) this.lookId = null;
    }
  }
}
