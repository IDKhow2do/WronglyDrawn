/**
 * [INPUT]: 浏览器动画时钟和玩家设定的渲染帧率上限。
 * [OUTPUT]: Loop 推进固定步长模拟，并按帧率上限提交插值画面。
 * [POS]: 画面提交可跳帧。物理、输入和时间缩放沿用固定步长。
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export class Loop {
  readonly fixedDt = 1 / 60;
  private acc = 0;
  private last = 0;
  private running = false;
  private raf = 0;
  /** Total simulated time in seconds. */
  simTime = 0;
  /** Slow-motion factor (1 = normal). */
  timeScale = 1;
  /** Real seconds of freeze left (hit-stop). */
  hitstop = 0;

  constructor(
    private step: (dt: number) => void,
    private render: (alpha: number, frameDt: number) => void,
    private maxRenderFps: () => number,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    let lastRender = this.last;
    let nextRender = this.last;
    let lastLimit = 0;
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      let frameDt = (now - this.last) / 1000;
      this.last = now;
      // Clamp large hitches (tab switch) so physics never spirals.
      if (frameDt > 0.25) frameDt = 0.25;
      if (this.hitstop > 0) {
        this.hitstop = Math.max(0, this.hitstop - frameDt);
      } else {
        this.acc += frameDt * this.timeScale;
      }
      let steps = 0;
      while (this.acc >= this.fixedDt && steps < 8) {
        this.step(this.fixedDt);
        this.simTime += this.fixedDt;
        this.acc -= this.fixedDt;
        steps++;
      }
      if (steps === 8) this.acc = 0;
      const limit = this.maxRenderFps();
      if (limit !== lastLimit) {
        lastLimit = limit;
        nextRender = now;
      }
      if (limit > 0) {
        const interval = 1000 / limit;
        // 给动画时钟留 1 ms 的波动余量，避免刷新率相同时误跳一整帧。
        if (now + 1 < nextRender) return;
        nextRender += interval * (Math.floor((now + 1 - nextRender) / interval) + 1);
      }
      const renderDt = Math.min(0.25, (now - lastRender) / 1000);
      lastRender = now;
      this.render(this.acc / this.fixedDt, renderDt);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}
