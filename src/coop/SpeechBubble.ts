/**
 * [INPUT]: depends on THREE (projecting her head to the screen); Face from ./prompt (sticker names)
 * [OUTPUT]: exports SpeechBubble (say / think / dots / stream / finish / chip, the off-screen pin) and faceUrl()
 * [POS]: the partner's only on-screen voice: every line, scripted or from the LLM, ends up in say() or stream().
 *        CoopPartner owns one and moves it every rendered frame.
 * [PROTOCOL]: Update this header on change, then check CLAUDE.md
 */
import * as THREE from 'three';
import type { Face } from './prompt';

const CSS = `
.coop-bubble{position:absolute;left:0;top:0;pointer-events:none;z-index:30;max-width:300px;padding:7px 12px 8px;
  display:flex;align-items:center;gap:8px;
  background:#fffef6;color:#141014;border:3px solid #141014;border-radius:16px 16px 16px 4px;
  font:700 15px/1.25 'Patrick Hand','Comic Sans MS','PingFang SC','Microsoft YaHei',sans-serif;
  box-shadow:4px 4px 0 #3f8cff;transform-origin:0 100%;transition:opacity .18s;white-space:normal;}
.coop-bubble.hidden{opacity:0}
.coop-bubble b{color:#1f4fd0;margin-right:4px}
.coop-bubble.llm b::after{content:' ✦';color:#ff4fa3;font-size:11px;vertical-align:top}
.coop-bubble img{flex:none;width:58px;height:58px;margin:-14px 0 -12px -16px;object-fit:contain;transform:rotate(-6deg);
  filter:drop-shadow(2px 2px 0 rgba(20,16,20,.35))}
.coop-bubble img.pop{animation:coopFacePop .32s cubic-bezier(.2,1.8,.4,1)}
.coop-bubble img.missing{display:none}
.coop-bubble.typing span::after{content:'▍';margin-left:1px;color:#3f8cff;animation:coopCaret .7s steps(2) infinite}
.coop-bubble.thinking span{letter-spacing:2px;color:#5b6486}
.coop-bubble.dots span::after{content:'...';display:inline-block;min-width:1.3em;text-align:left;animation:coopDots 1.2s steps(1) infinite}
@keyframes coopCaret{50%{opacity:0}}
@keyframes coopDots{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
@keyframes coopFacePop{from{transform:rotate(-20deg) scale(.4)}to{transform:rotate(-6deg) scale(1)}}
.coop-pin{position:absolute;left:0;top:0;pointer-events:none;z-index:29;width:20px;height:20px;border-radius:50%;
  background:#3f8cff;border:3px solid #141014;box-shadow:0 0 0 3px #fff;transition:opacity .2s}
.coop-pin.hidden{opacity:0}
.coop-pin.down{background:#ff4fa3}
.coop-chip{position:absolute;left:0;top:0;pointer-events:none;z-index:29;padding:1px 7px 2px;border-radius:9px;white-space:nowrap;
  background:rgba(20,16,20,.72);color:#dfe9ff;font:600 11px/1.3 ui-monospace,Menlo,Consolas,'PingFang SC',monospace;
  transition:opacity .35s}
.coop-chip.hidden{opacity:0}
@media (max-width:900px),(max-height:520px){.coop-bubble{font-size:13px;max-width:230px}.coop-bubble img{width:44px;height:44px}}
`;

let styled = false;

/** URL of an expression sticker (public/assets/whale/<face>.webp). */
export function faceUrl(face: Face): string {
  return `${import.meta.env.BASE_URL}assets/whale/${face}.webp`;
}

/**
 * The partner's speech bubble (DOM over the canvas, follows the head) with an expression
 * sticker next to the line + a small blue pin on the screen edge when she is off-screen.
 * Short lines, a few seconds each.
 */
export class SpeechBubble {
  private el: HTMLDivElement;
  private pin: HTMLDivElement;
  private chipEl: HTMLDivElement;
  private chipT = 0;
  private img: HTMLImageElement;
  private name: HTMLElement;
  private text: HTMLElement;
  private t = 0;
  private v = new THREE.Vector3();
  current = '';
  /** sticker shown with the current line */
  face: Face = 'portrait';
  /** recent lines (observe() / LLM context) */
  readonly history: string[] = [];

  constructor(private camera: THREE.PerspectiveCamera) {
    if (!styled) {
      styled = true;
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    const root = document.getElementById('ui-root') ?? document.body;
    this.el = document.createElement('div');
    this.el.className = 'coop-bubble hidden';
    this.el.innerHTML = '<img alt="" draggable="false"><div><b></b><span></span></div>';
    this.img = this.el.querySelector('img')!;
    // a missing sticker file just leaves a text-only bubble
    this.img.addEventListener('error', () => this.img.classList.add('missing'));
    this.img.addEventListener('load', () => this.img.classList.remove('missing'));
    this.name = this.el.querySelector('b')!;
    this.text = this.el.querySelector('span')!;
    this.pin = document.createElement('div');
    this.pin.className = 'coop-pin hidden';
    root.appendChild(this.el);
    this.chipEl = document.createElement('div');
    this.chipEl.className = 'coop-chip hidden';
    root.appendChild(this.chipEl);
    root.appendChild(this.pin);
  }

  say(name: string, text: string, seconds = 3.2, fromLlm = false, face: Face = 'portrait'): void {
    const line = text.trim().slice(0, 120);
    if (!line) return;
    this.name.textContent = name;
    this.text.textContent = line;
    this.streaming = false;
    this.el.classList.remove('typing', 'thinking', 'dots');
    this.el.classList.toggle('llm', fromLlm);
    const url = faceUrl(face);
    if (this.img.getAttribute('src') !== url) this.img.setAttribute('src', url);
    this.face = face;
    this.img.classList.remove('pop');
    void this.img.offsetWidth; // restart the pop
    this.img.classList.add('pop');
    this.current = line;
    this.t = Math.max(1.6, Math.min(6, seconds + line.length * 0.03));
    this.history.push(line);
    if (this.history.length > 6) this.history.shift();
  }

  /** The current line gets animated trailing dots ("Deep thinking in progress…"); the next say() clears them. */
  dots(): void {
    this.el.classList.add('dots');
  }

  /** A small unobtrusive note under her bubble for a couple of seconds (token use of the last LLM call). */
  chip(text: string, seconds = 2.6): void {
    if (!text) return;
    this.chipEl.textContent = text;
    this.chipT = seconds;
  }

  /** A short "she is thinking" beat while an answer is on its way. */
  think(name: string, text: string, face: Face = 'portrait'): void {
    this.say(name, text, 9, false, face);
    this.history.pop(); // not a line she said
    this.el.classList.add('thinking');
    this.streaming = false;
  }

  /** Streamed line: called with the whole text so far each time tokens arrive; finish() ends it. */
  stream(name: string, textSoFar: string, face: Face = 'portrait', fromLlm = true): void {
    const line = textSoFar.slice(0, 160);
    if (!line) return;
    if (!this.streaming) {
      this.streaming = true;
      this.name.textContent = name;
      this.el.classList.remove('thinking', 'dots');
      this.el.classList.add('typing');
      this.el.classList.toggle('llm', fromLlm);
    }
    if (face !== this.face || this.img.getAttribute('src') !== faceUrl(face)) {
      this.img.setAttribute('src', faceUrl(face));
      this.face = face;
    }
    this.text.textContent = line;
    this.current = line;
    this.t = 8; // stays up while tokens keep coming
  }

  /** The stream is complete: keep the line up for a reading-time and remember it. */
  finish(): void {
    if (!this.streaming) return;
    this.streaming = false;
    this.el.classList.remove('typing');
    this.t = Math.max(2.6, Math.min(7, 2.6 + this.current.length * 0.07));
    this.history.push(this.current);
    if (this.history.length > 6) this.history.shift();
  }

  private streaming = false;

  get busy(): boolean {
    return this.t > 0;
  }

  update(dt: number, head: THREE.Vector3, hidden: boolean, down: boolean): void {
    this.t = Math.max(0, this.t - dt);
    this.v.copy(head).project(this.camera);
    const behind = this.v.z > 1;
    const onScreen = !behind && Math.abs(this.v.x) < 0.95 && Math.abs(this.v.y) < 0.95;
    const W = window.innerWidth, H = window.innerHeight;
    const show = this.t > 0 && !hidden && onScreen;
    this.el.classList.toggle('hidden', !show);
    if (show) {
      const x = Math.min(W - 310, (this.v.x * 0.5 + 0.5) * W + 8);
      const y = Math.max(70, (-this.v.y * 0.5 + 0.5) * H - 10);
      this.el.style.transform = `translate(${x}px, ${y}px) translate(0, -100%)`;
    } else if (this.t <= 0) this.current = '';
    // the token chip sits just under the bubble's corner, next to her head
    this.chipT = Math.max(0, this.chipT - dt);
    const chipOn = this.chipT > 0 && !hidden && onScreen;
    this.chipEl.classList.toggle('hidden', !chipOn);
    if (chipOn) {
      const cx = Math.min(W - 190, (this.v.x * 0.5 + 0.5) * W + 14);
      const cy = Math.max(74, (-this.v.y * 0.5 + 0.5) * H - 4);
      this.chipEl.style.transform = `translate(${cx}px, ${cy}px)`;
    }
    // off-screen pin (so you always know where your buddy is)
    const pinOn = !hidden && !onScreen;
    this.pin.classList.toggle('hidden', !pinOn);
    this.pin.classList.toggle('down', down);
    if (pinOn) {
      let x = this.v.x, y = this.v.y;
      if (behind) {
        x = -x;
        y = -y;
      }
      const m = 0.92 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      const k = behind ? m : Math.min(1, m);
      const px = (THREE.MathUtils.clamp(x * k, -0.95, 0.95) * 0.5 + 0.5) * W;
      const py = (-THREE.MathUtils.clamp(y * k, -0.92, 0.92) * 0.5 + 0.5) * H;
      this.pin.style.transform = `translate(${px - 10}px, ${py - 10}px)`;
    }
  }

  dispose(): void {
    this.el.remove();
    this.pin.remove();
    this.chipEl.remove();
  }
}
