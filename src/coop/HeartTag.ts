/**
 * [INPUT]: depends on THREE (projecting her head to the screen)
 * [OUTPUT]: exports HeartTag (her hearts beside her head; update / dispose) and heartsHtml() (the corner view uses it too)
 * [POS]: the partner's hearts on screen. Not on the HUD (WAI's hearts own that corner): a small row of the HUD's own
 *        heart glyphs, left of her head, shown while she is hurt, for a few seconds after a change, and while smudged.
 *        At full hearts and nothing new, it hides. CoopPartner owns one (PipLife.render moves it every frame).
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import * as THREE from 'three';
import { stickerIcon } from '../ui/ItemArt';

const CSS = `
.coop-hearts{position:absolute;left:0;top:0;pointer-events:none;z-index:29;padding:1px 5px 2px;border-radius:9px;
  background:rgba(255,254,246,.88);border:2px solid #141014;white-space:nowrap;transition:opacity .25s;line-height:1}
.coop-hearts.hidden{opacity:0}
.coop-hearts.smudged{animation:coopHeartsBlink .16s steps(2) infinite}
@keyframes coopHeartsBlink{50%{opacity:.25}}
.coop-heart{font-size:14px;color:#ff2f5c;-webkit-text-stroke:1.2px #141014;margin-right:1px;display:inline-block}
.coop-heart.half{background:linear-gradient(90deg,#ff2f5c 50%,#5a4a55 50%);-webkit-background-clip:text;background-clip:text;color:transparent}
.coop-heart.empty{color:#5a4a55}
.coop-pip-hearts .coop-heart{font-size:12px}
`;

let styled = false;

/** The HUD's heart row (UI.setHearts), smaller: hp and max in half hearts. */
export function heartsHtml(hp: number, max: number): string {
  let s = '';
  for (let i = 0; i < max / 2; i++) {
    const v = hp - i * 2;
    s += `<span class="coop-heart">${stickerIcon(v >= 2 ? 'hp_full' : v === 1 ? 'hp_half' : 'hp_empty')}</span>`;
  }
  return s;
}

/** Seconds the row stays up after her hearts change (at full hearts). */
const SHOW_AFTER = 3;

export class HeartTag {
  private el: HTMLDivElement;
  private v = new THREE.Vector3();
  private last = '';

  constructor(private camera: THREE.PerspectiveCamera) {
    if (!styled) {
      styled = true;
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    this.el = document.createElement('div');
    this.el.className = 'coop-hearts hidden';
    (document.getElementById('ui-root') ?? document.body).appendChild(this.el);
  }

  /** `head`: world point over her head; `changedAgo`: seconds since her hearts changed. */
  update(head: THREE.Vector3, hp: number, max: number, smudged: boolean, changedAgo: number, hidden: boolean): void {
    this.v.copy(head).project(this.camera);
    const onScreen = this.v.z < 1 && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.95;
    const show = !hidden && onScreen && (smudged || hp < max || changedAgo < SHOW_AFTER);
    this.el.classList.toggle('hidden', !show);
    if (!show) return;
    const key = `${hp}/${max}/${smudged ? 1 : 0}`;
    if (key !== this.last) {
      this.last = key;
      this.el.innerHTML = heartsHtml(smudged ? 0 : hp, max);
      this.el.classList.toggle('smudged', smudged);
    }
    // left of her head: the speech bubble grows to the right of it
    const x = (this.v.x * 0.5 + 0.5) * window.innerWidth - 10;
    const y = (-this.v.y * 0.5 + 0.5) * window.innerHeight;
    this.el.style.transform = `translate(${x}px, ${y}px) translate(-100%, -50%)`;
  }

  /** Text form for tests / docs ("hp/max"). */
  get shown(): string {
    return this.el.classList.contains('hidden') ? '' : this.last;
  }

  dispose(): void {
    this.el.remove();
  }
}
