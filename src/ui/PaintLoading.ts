/**
 * [INPUT]: 调用方提供已完成的进度和画面阶段。
 * [OUTPUT]: 手绘进度贴纸、阶段文字和用于提交画面的等待函数。
 * [POS]: 首次启动与彩刷过场共用。贴纸动画不依赖游戏渲染循环。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { t } from '../i18n';
import './PaintLoading.css';

export class PaintLoading {
  readonly element = document.createElement('div');
  private readonly percent: HTMLElement;
  private readonly bar: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly label: HTMLElement;

  constructor() {
    this.element.className = 'paint-loading';
    this.element.innerHTML = `
      <div class="paint-loading-ink" aria-hidden="true"><i></i><i></i><i></i></div>
      <strong class="paint-loading-number" aria-hidden="true"></strong>
      <div class="paint-loading-track" role="progressbar" aria-valuemin="0" aria-valuemax="100">
        <div class="paint-loading-fill"></div>
      </div>
      <div class="paint-loading-label" role="status"></div>`;
    this.percent = this.element.querySelector('.paint-loading-number')!;
    this.bar = this.element.querySelector('.paint-loading-track')!;
    this.fill = this.element.querySelector('.paint-loading-fill')!;
    this.label = this.element.querySelector('.paint-loading-label')!;
  }

  set(value: number, phase: string): void {
    const percent = Math.floor(Math.max(0, Math.min(100, value)));
    const label = t(phase);
    this.percent.textContent = `${percent}%`;
    this.bar.setAttribute('aria-valuenow', String(percent));
    this.bar.setAttribute('aria-label', label);
    this.fill.style.transform = `scaleX(${percent / 100})`;
    if (this.label.textContent !== label) this.label.textContent = label;
  }

  error(message: string): void {
    this.element.classList.add('has-error');
    this.label.textContent = message;
  }
}

/** 先提交贴纸画面，再进入同步场景构建。后台标签页用超时继续。 */
export function commitLoadingFrame(): Promise<void> {
  return new Promise((resolve) => {
    const fallback = setTimeout(resolve, 90);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(fallback);
      resolve();
    }));
  });
}
