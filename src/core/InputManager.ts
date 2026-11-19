/**
 * Keyboard + mouse input. Keeps "held" state and per-frame "pressed" edges.
 * Edges are consumed by the fixed-step simulation via consumePressed(),
 * so a quick tap is never lost between physics steps.
 */
export class InputManager {
  private held = new Set<string>();
  private pressedEdges = new Map<string, number>();
  mouseDX = 0;
  mouseDY = 0;
  pointerLocked = false;
  wheel = 0;
  /** Look without pointer lock: plain mouse movement + trackpad swipes rotate the camera. */
  freeLook = false;
  /** Cursor position (0..1) for edge-turning when the cursor is not locked. */
  cursorX = 0.5;
  cursorY = 0.5;
  cursorInside = false;
  lookDX = 0;
  lookDY = 0;
  /** Analog move from the on-screen stick (x = right, y = forward), −1..1. */
  readonly virtualMove = { x: 0, y: 0 };
  /** True once any touch happened (shows touch UI, hides desktop hints). */
  touchMode = false;
  enabled = true;
  /** Main sets this while the game wants the pointer captured (playing, not paused). */
  lockable = false;
  /** Alt held: cursor released on purpose (Genshin-style), game keeps running. */
  cursorFree = false;
  /** Pointer lock has succeeded at least once (later errors are transient). */
  everLocked = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        e.preventDefault();
        if (!e.repeat && this.pointerLocked) {
          this.cursorFree = true;
          this.releaseLock();
        }
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.held.has(e.code)) this.pressedEdges.set(e.code, performance.now());
      this.held.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      if ((e.code === 'AltLeft' || e.code === 'AltRight') && this.cursorFree) {
        e.preventDefault();
        this.cursorFree = false;
        if (this.lockable) this.requestLock();
      }
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.cursorFree = false;
    });

    canvas.addEventListener('mousedown', (e) => {
      // a click on the game while the cursor is out just recaptures it (never fires)
      if (this.lockable && !this.pointerLocked && !this.touchMode) {
        this.cursorFree = false;
        this.requestLock();
        return;
      }
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : 'Mouse1';
      this.pressedEdges.set(code, performance.now());
      this.held.add(code);
    });
    window.addEventListener('mouseup', (e) => {
      const code = e.button === 0 ? 'Mouse0' : e.button === 2 ? 'Mouse2' : 'Mouse1';
      this.held.delete(code);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // MacBook trackpad: two-finger swipe = look (pinch/ctrl-wheel is ignored)
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) return;
        const k = e.deltaMode === 1 ? 16 : 1;
        this.lookDX += e.deltaX * k;
        this.lookDY += e.deltaY * k;
        this.wheel += Math.sign(e.deltaY);
      },
      { passive: false },
    );
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.freeLook) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
      const r = canvas.getBoundingClientRect();
      this.cursorX = (e.clientX - r.left) / Math.max(1, r.width);
      this.cursorY = (e.clientY - r.top) / Math.max(1, r.height);
    });
    canvas.addEventListener('mouseenter', () => (this.cursorInside = true));
    canvas.addEventListener('mouseleave', () => (this.cursorInside = false));
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked) {
        this.everLocked = true;
        this.cursorFree = false;
      }
    });
  }

  /** On-screen buttons drive the same held/pressed state as real keys. */
  virtualDown(code: string): void {
    if (!this.held.has(code)) this.pressedEdges.set(code, performance.now());
    this.held.add(code);
  }
  virtualUp(code: string): void {
    this.held.delete(code);
  }
  addLook(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
  }

  requestLock(): void {
    if (this.touchMode) return;
    if (document.pointerLockElement !== this.canvas) {
      try {
        const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        /* automation / unsupported: fall back to right-drag camera */
      }
    }
  }

  releaseLock(): void {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code: string): boolean {
    return this.enabled && this.held.has(code);
  }

  /** Returns true once per physical press. */
  consumePressed(code: string): boolean {
    if (!this.enabled) return false;
    if (this.pressedEdges.has(code)) {
      this.pressedEdges.delete(code);
      return true;
    }
    return false;
  }

  /** Drop presses nobody consumed within 250 ms (acts as a small input buffer). */
  endFrame(): void {
    const now = performance.now();
    for (const [k, t] of this.pressedEdges) if (now - t > 250) this.pressedEdges.delete(k);
  }

  takeWheel(): number {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  /**
   * All look input this frame, in "mouse pixels": mouse (locked or free-look),
   * trackpad swipes, arrow keys, and edge-turning when the free cursor sits at
   * the screen edge.
   */
  takeMouseDelta(dt = 1 / 60): { dx: number; dy: number } {
    let dx = this.mouseDX + this.lookDX * 0.9;
    let dy = this.mouseDY + this.lookDY * 0.9;
    this.mouseDX = this.mouseDY = this.lookDX = this.lookDY = 0;
    const keyRate = 900 * dt;
    if (this.held.has('ArrowLeft')) dx -= keyRate;
    if (this.held.has('ArrowRight')) dx += keyRate;
    if (this.held.has('ArrowUp')) dy -= keyRate * 0.6;
    if (this.held.has('ArrowDown')) dy += keyRate * 0.6;
    if (this.freeLook && !this.pointerLocked && this.cursorInside) {
      const edge = 0.06;
      if (this.cursorX < edge) dx -= ((edge - this.cursorX) / edge) * 1100 * dt;
      if (this.cursorX > 1 - edge) dx += ((this.cursorX - (1 - edge)) / edge) * 1100 * dt;
    }
    return { dx, dy };
  }

  reset(): void {
    this.held.clear();
    this.pressedEdges.clear();
    this.mouseDX = this.mouseDY = this.lookDX = this.lookDY = 0;
  }
}
