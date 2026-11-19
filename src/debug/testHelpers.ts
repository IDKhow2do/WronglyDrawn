/**
 * Automated-test helpers, only installed when the URL has ?test.
 * Drives the real input path (KeyboardEvent / MouseEvent) plus a few teleports.
 */
import * as THREE from 'three';

type WD = {
  app: { camera: { yaw: number; pitch: number; aimT: number }; startGame(): Promise<void> };
  session: any;
  state: string;
  advance(s: number): void;
};

export function installTestHelpers(): void {
  const W = () => (window as unknown as { __WD: WD }).__WD;
  const canvas = () => document.getElementById('game-canvas')!;
  const T = {
    down: (c: string) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c })),
    up: (c: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code: c })),
    tap(c: string) {
      this.down(c);
      this.up(c);
    },
    hold(c: string, s: number) {
      this.down(c);
      W().advance(s);
      this.up(c);
    },
    mdown: (b: number) => canvas().dispatchEvent(new MouseEvent('mousedown', { button: b, bubbles: true })),
    mup: (b: number) => window.dispatchEvent(new MouseEvent('mouseup', { button: b })),
    s: () => W().session,
    p: () => W().session.player,
    cam: () => W().app.camera,
    info() {
      const p = this.p();
      return { pos: p.pos.toArray().map((v: number) => +v.toFixed(2)), g: p.grounded, hp: p.hp };
    },
    tp(x: number, y: number, z: number, yaw?: number) {
      this.p().teleport(new THREE.Vector3(x, y, z), yaw);
      if (yaw !== undefined) this.cam().yaw = yaw;
      W().advance(0.1);
    },
    /** Point the camera at a world point (works in follow and first person). */
    lookAt(x: number, y: number, z: number) {
      const c = this.cam();
      const p = this.p().pos;
      const ey = p.y + (c.aimT > 0.5 ? 0.74 : 1.15);
      c.yaw = Math.atan2(x - p.x, z - p.z);
      c.pitch = -Math.atan2(y - ey, Math.hypot(x - p.x, z - p.z));
    },
    walkTo(x: number, z: number, tol = 0.4, max = 300) {
      const p = this.p();
      let n = 0;
      while (n < max) {
        const dx = x - p.pos.x;
        const dz = z - p.pos.z;
        if (Math.hypot(dx, dz) < tol) break;
        this.cam().yaw = Math.atan2(dx, dz);
        this.down('KeyW');
        W().advance(0.05);
        n++;
      }
      this.up('KeyW');
      W().advance(0.15);
      return n;
    },
    /** Give WAI a purified organ (to test later stages quickly). */
    async grant(type: 'EYE' | 'MOUTH' | 'LEG') {
      const { Organ } = await import('../organs/Organ');
      const o = new Organ(type, 'test');
      o.collect();
      o.purify();
      W().session.inventory.add(o);
      return o.state;
    },
    /** Render a frame and save it to reference/shots/<name>.png (dev server). */
    async shot(name: string) {
      const app = (W() as unknown as { app: { renderer: { render(): void; renderer: { domElement: HTMLCanvasElement } } } }).app;
      app.renderer.render();
      const url = app.renderer.renderer.domElement.toDataURL('image/png');
      await fetch(`/__shot?name=${name}`, { method: 'POST', body: url });
      return name;
    },
    /** Touch audit: every i18n string in both languages after the touch rewrite, and any key name that survived it. */
    async touchAudit() {
      const { touchText } = await import('../ui/TouchText');
      const { ZH } = await import('../i18n/zh');
      const left = /(?<![A-Za-z0-9{<&/'’_-])(WASD|Space|Shift|Tab|Esc|Alt|[EQRFCZXGVTBYH])(?![A-Za-z0-9}>;'’_-])|[Cc]lick|[Mm]ouse|鼠标|点击|[左右]键/;
      const strip = (x: string) => x.replace(/<[^>]+>/g, '').replace(/〔[^〕]+〕|\[[^\]]+\]/g, '');
      const changed: string[][] = [];
      const leaks: string[] = [];
      for (const [en, zh] of Object.entries(ZH)) {
        const a = touchText(en, 'en');
        const b = touchText(zh, 'zh');
        if (a !== en || b !== zh) changed.push([a, b]);
        if (left.test(strip(a))) leaks.push('en: ' + a);
        if (left.test(strip(b))) leaks.push('zh: ' + b);
      }
      return { changed, leaks };
    },
    async start() {
      (document.querySelector('.start-btn') as HTMLButtonElement).click();
      for (let i = 0; i < 120 && W().state !== 'INTRO' && W().state !== 'PLAYING'; i++) await new Promise((r) => setTimeout(r, 200));
      await new Promise((r) => setTimeout(r, 900));
      W().advance(2.6);
      W().session.allowUnlockedFire = true;
      return W().state;
    },
  };
  (window as unknown as { T: typeof T }).T = T;
  (window as unknown as { __errs: string[] }).__errs = [];
  window.addEventListener('error', (e) => (window as unknown as { __errs: string[] }).__errs.push(e.message));
}
