/**
 * [INPUT]: 画质与调色输入。
 * [OUTPUT]: 调色入口与面板。
 * [POS]: 标题与暂停入口共用面板。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { t, onLangChange } from '../i18n';
import { Look, LOOK_PRESETS, LOOK_ZERO, LOOK_AUTHOR, encodeLook, decodeLook, type LookState } from '../render/Look';
import { STYLES, type StyleId } from '../render/ArtStyle';

type Num = 'exposure' | 'contrast' | 'saturation' | 'hue' | 'temp' | 'tint' | 'fade' | 'washAmt' | 'grain';
const SLIDERS: { key: Num; label: string; min: number; max: number; group: string; grad?: string }[] = [
  { key: 'temp', label: 'Temperature', min: -1, max: 1, group: 'White balance', grad: 'linear-gradient(90deg,#4f8cff,#ddd,#ffb23a)' },
  { key: 'tint', label: 'Tint', min: -1, max: 1, group: 'White balance', grad: 'linear-gradient(90deg,#3fcf6a,#ddd,#ff4fd8)' },
  { key: 'exposure', label: 'Exposure', min: -1, max: 1, group: 'Light' },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1, group: 'Light' },
  { key: 'fade', label: 'Fade', min: 0, max: 1, group: 'Light' },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1, group: 'Colour', grad: 'linear-gradient(90deg,#888,#ff4fa3)' },
  { key: 'hue', label: 'Hue shift', min: -180, max: 180, group: 'Colour', grad: 'linear-gradient(90deg,#22c4c0,#2a4be0,#ff4fa3,#ffd23a,#22c4c0)' },
  { key: 'washAmt', label: 'Colour wash', min: 0, max: 1, group: 'Colour' },
  { key: 'grain', label: 'Paper grain', min: 0, max: 1, group: 'Texture' },
];

/**
 * The LOOK panel: pick an art style, then grade the picture with Lightroom-style sliders while
 * the game stays visible beside it. Opens from the title (LOOK sticker), the pause menu, or L.
 */
export class LookPanel {
  private el: HTMLDivElement;
  open = false;
  /** App hooks. */
  onStyle: ((id: StyleId) => void) | null = null;
  currentStyle: () => StyleId = () => 'graffiti';
  onOpen: (() => void) | null = null;
  onClose: (() => void) | null = null;

  constructor(root: HTMLElement, title: HTMLElement, pausePanel: HTMLElement | null) {
    this.el = document.createElement('div');
    this.el.className = 'look-panel hidden';
    root.appendChild(this.el);
    // entries: a sticker on the title, a button in the pause menu
    const st = document.createElement('div');
    st.className = 'sticker st-look';
    st.innerHTML = '<button class="look-btn"></button>';
    title.appendChild(st);
    st.querySelector('button')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    const row = pausePanel?.querySelector('.style-row');
    if (row) {
      const b = document.createElement('button');
      b.className = 'look-btn in-pause';
      row.insertAdjacentElement('afterend', b);
      b.addEventListener('click', () => this.toggle(true));
    }
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.code === 'KeyL' && !e.metaKey && !e.ctrlKey) this.toggle();
      else if (e.code === 'Escape' && this.open) {
        e.stopPropagation();
        this.toggle(false);
      }
    }, true);
    this.el.addEventListener('input', (e) => this.onInput(e.target as HTMLInputElement));
    this.el.addEventListener('click', (e) => this.onClick(e.target as HTMLElement));
    // double-click a slider = back to its default (like Lightroom)
    this.el.addEventListener('dblclick', (e) => {
      const k = (e.target as HTMLElement).dataset?.k as Num | undefined;
      if (k) {
        Look.set({ [k]: LOOK_AUTHOR[k] } as Partial<LookState>);
        this.sync();
      }
    });
    onLangChange(() => this.render());
    this.render();
  }

  toggle(on = !this.open): void {
    if (on === this.open) return;
    this.open = on;
    if (on) {
      this.picked = null;
      this.onOpen?.();
      this.sync();
    }
    this.el.classList.toggle('hidden', !on);
    document.body.classList.toggle('look-open', on);
    if (!on) this.onClose?.();
  }

  private render(): void {
    document.querySelectorAll<HTMLButtonElement>('.look-btn').forEach((b) => (b.innerHTML = `${t('LOOK')}<small>L</small>`));
    let html = `<div class="lk-head"><b>${t('LOOK')}</b><span>${t('Your own colours — saved on this device')}</span><button class="lk-x" data-act="close">✕</button></div>`;
    html += `<div class="lk-sec">${t('Art style')}</div><div class="lk-chips styles">${STYLES.map((s) => `<button data-style="${s.id}"><b>${t(s.name)}</b><small>${t(s.desc)}</small></button>`).join('')}</div>`;
    html += `<div class="lk-sec">${t('Colour presets')}</div><div class="lk-chips presets">${LOOK_PRESETS.map((p) => `<button data-preset="${p.id}">${t(p.name)}</button>`).join('')}</div>`;
    let group = '';
    for (const s of SLIDERS) {
      if (s.group !== group) {
        group = s.group;
        html += `<div class="lk-sec">${t(group)}</div>`;
      }
      const step = s.key === 'hue' ? 1 : 0.01;
      html += `<label class="lk-row"><span>${t(s.label)}</span><input type="range" data-k="${s.key}" min="${s.min}" max="${s.max}" step="${step}" ${s.grad ? `style="--track:${s.grad}"` : ''}><output data-o="${s.key}"></output>${s.key === 'washAmt' ? '<input type="color" class="lk-color" data-k="wash">' : ''}</label>`;
    }
    html += `<div class="lk-sec">${t('Share')}</div><div class="lk-share"><input class="lk-code" spellcheck="false" autocomplete="off" placeholder="WD1-…"><button data-act="copy">${t('Copy')}</button><button data-act="paste">${t('Paste')}</button></div><div class="lk-msg"></div>`;
    html += `<div class="lk-foot"><button data-act="reset">${t('Author’s pick')}</button><button class="go" data-act="close">${t('Done')}</button></div><div class="lk-tip">${t('Double-click a slider to reset it')} · ${t('Colours tuned by the author')}</div>`;
    this.el.innerHTML = html;
    this.sync();
  }

  private sync(): void {
    const s = Look.state;
    this.el.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((i) => {
      const k = i.dataset.k as Num;
      i.value = String(s[k]);
      const o = this.el.querySelector(`[data-o="${k}"]`) as HTMLElement;
      o.textContent = k === 'hue' ? `${Math.round(s[k])}°` : `${s[k] > 0 ? '+' : ''}${Math.round(s[k] * 100)}`;
    });
    (this.el.querySelector('.lk-color') as HTMLInputElement).value = s.wash;
    // a style switch takes a moment (paint wipe): the one just picked counts as current
    const cur = this.picked ?? this.currentStyle();
    const codeEl = this.el.querySelector('.lk-code') as HTMLInputElement;
    if (document.activeElement !== codeEl) codeEl.value = encodeLook(Math.max(0, STYLES.findIndex((x) => x.id === cur)), s);
    this.el.querySelectorAll<HTMLElement>('[data-style]').forEach((b) => b.classList.toggle('on', b.dataset.style === cur));
  }

  private onInput(i: HTMLInputElement): void {
    if (i.classList.contains('lk-code')) {
      // typed or pasted by hand: apply as soon as it is a valid code
      if (decodeLook(i.value)) this.applyCode(i.value);
      return;
    }
    const k = i.dataset.k;
    if (!k) return;
    if (k === 'wash') Look.set({ wash: i.value, washAmt: Look.state.washAmt || 0.3 });
    else Look.set({ [k]: Number(i.value) } as Partial<LookState>);
    this.sync();
  }

  private picked: StyleId | null = null;

  private say(text: string, ok = true): void {
    const m = this.el.querySelector('.lk-msg') as HTMLElement;
    m.textContent = text;
    m.classList.toggle('bad', !ok);
  }

  private async copy(code: string): Promise<void> {
    const inp = this.el.querySelector('.lk-code') as HTMLInputElement;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // no clipboard permission: select it so Ctrl/Cmd+C works
      inp.focus();
      inp.select();
      document.execCommand?.('copy');
    }
    this.say(t('Copied! Send this code to a friend.'));
  }

  private async paste(): Promise<void> {
    const inp = this.el.querySelector('.lk-code') as HTMLInputElement;
    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      /* no permission: use what is in the box */
    }
    if (!decodeLook(text)) text = inp.value;
    if (!this.applyCode(text)) {
      inp.focus();
      inp.select();
      this.say(t('That is not a LOOK code. Paste one into the box (it starts with WD1-).'), false);
    }
  }

  private applyCode(text: string): boolean {
    const d = decodeLook(text);
    if (!d) return false;
    Look.set(d.look);
    const st = STYLES[d.styleIndex];
    if (st) {
      this.picked = st.id;
      if (st.id !== this.currentStyle()) this.onStyle?.(st.id);
    }
    (this.el.querySelector('.lk-code') as HTMLInputElement).blur();
    this.sync();
    if (st) this.el.querySelectorAll<HTMLElement>('[data-style]').forEach((x) => x.classList.toggle('on', x.dataset.style === st.id));
    this.say(t('Look applied!'));
    return true;
  }

  private onClick(el: HTMLElement): void {
    const b = el.closest('button') as HTMLElement | null;
    if (!b) return;
    if (b.dataset.act === 'copy') {
      const code = (this.el.querySelector('.lk-code') as HTMLInputElement).value;
      void this.copy(code);
      return;
    }
    if (b.dataset.act === 'paste') {
      void this.paste();
      return;
    }
    if (b.dataset.act === 'close') this.toggle(false);
    else if (b.dataset.act === 'reset') Look.reset();
    else if (b.dataset.preset) Look.set({ ...LOOK_ZERO, ...LOOK_PRESETS.find((p) => p.id === b.dataset.preset)!.look });
    else if (b.dataset.style) {
      this.picked = b.dataset.style as StyleId;
      this.onStyle?.(this.picked);
      this.sync();
      this.el.querySelectorAll<HTMLElement>('[data-style]').forEach((x) => x.classList.toggle('on', x === b));
      return;
    }
    this.sync();
  }
}
