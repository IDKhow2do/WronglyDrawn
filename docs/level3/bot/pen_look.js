// The Red Pen's look, staged in the page (built-in browser or any console). Load on /?test&dev&level=works with
//   const H = (await import('/docs/level3/bot/pen_look.js')).default; await H.boot();
// then H.stand() + H.view(yawFromFront, dist, camHeight, lookAtHeight, fov) for still shots, H.measure(sec) for cost.
// Add &pen=drawn to the URL for the body drawn from primitives (the look before the Tripo model).
const W = () => window.__WD;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const H = {
  get s() { return W().app.session; },
  get pen() { return this.s.pen; },
  get p() { return this.s.player; },
  get cam() { return W().app.camera; },
  errs: [],
  wait,
  async until(f, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { if (f()) return true; await wait(80); } return false; },
  /** Title → playing → the roof fight, HUD hidden, WAI unhurtable, boon picker off. */
  async boot() {
    localStorage.setItem('wd.boons', 'auto');
    window.addEventListener('error', (e) => this.errs.push(String(e.message)));
    // startGame() does nothing while the title is still loading: ask again until the game runs. The level intro and
    // the warp are stepped by hand (a hidden pane's own frames can drop to 2 a second).
    for (let i = 0; i < 400 && W().state !== 'PLAYING'; i++) {
      if (W().state === 'TITLE') await W().app.startGame();
      else if (W().state === 'INTRO') W().advance(0.5);
      await wait(50);
    }
    if (W().state !== 'PLAYING') throw new Error('the game did not start: ' + W().state);
    W().advance(1.5);
    this.s.debugWarp('boss');
    W().advance(2.5);
    this.p.invuln = 99;
    this.hud(false);
  },
  hud(on) { document.getElementById('ui-root').style.visibility = on ? '' : 'hidden'; },
  pause(on) { W().app.paused = on; },
  /** Freeze the fight with the Pen upright on the arena centre, facing +Z. */
  stand() {
    const pen = this.pen, po = pen.penBody.pose;
    this.pause(true);
    po.pivot.copy(pen.arena).setY(pen.floorY); po.tilt = 0; po.leanYaw = 0; po.face = 0; po.update();
    pen.prevPivot.copy(po.pivot); pen.prevQ.copy(po.q);
  },
  /** Camera on a ring round the arena centre: yaw from the Pen's front, distance, height over the look-at point, look-at height over the roof. */
  view(yaw, dist, h, along, fov = 40) {
    const pen = this.pen, T3 = this.p.pos.constructor;
    const at = new T3(pen.arena.x, pen.floorY + along, pen.arena.z);
    this.cam.override = { pos: new T3(at.x + Math.sin(yaw) * dist, at.y + h, at.z + Math.cos(yaw) * dist), look: at, fov };
  },
  /** Camera relative to the Pen's live pose (for moves): looks at the point `along` m up its axis. */
  orbit(yaw, dist, h, along, fov = 40) {
    const pose = this.pen.penBody.pose, T3 = this.p.pos.constructor, at = pose.point(along), a = pose.face + yaw;
    this.cam.override = { pos: new T3(at.x + Math.sin(a) * dist, at.y + h, at.z + Math.cos(a) * dist), look: at, fov };
  },
  /** Camera at a fixed world offset from the arena centre, looking at the Pen's middle wherever it is. */
  watch(x, y, z, fov = 50) {
    const pen = this.pen, T3 = this.p.pos.constructor;
    this.cam.override = { pos: new T3(pen.arena.x + x, pen.floorY + y, pen.arena.z + z), look: pen.penBody.pose.point(7), fov };
  },
  off() { this.cam.override = null; },
  /** Draw calls, triangles and frame times over `sec` seconds of live frames. */
  async measure(sec) {
    const R = W().app.renderer.renderer; R.info.autoReset = false;
    let calls = 0, tris = 0, n = 0, worst = 0; const ts = [];
    await new Promise((r) => requestAnimationFrame(r)); R.info.reset();
    let last = performance.now(); const t0 = last;
    while (performance.now() - t0 < sec * 1000) {
      await new Promise((r) => requestAnimationFrame(r));
      const now = performance.now(); ts.push(now - last); worst = Math.max(worst, now - last); last = now;
      calls += R.info.render.calls; tris += R.info.render.triangles; R.info.reset(); n++;
    }
    R.info.autoReset = true; ts.sort((a, b) => a - b);
    return { frames: n, calls: Math.round(calls / n), ktris: Math.round(tris / n / 1000), msMean: +((last - t0) / n).toFixed(2), msMedian: +ts[ts.length >> 1].toFixed(2), msP95: +ts[Math.floor(ts.length * 0.95)].toFixed(2), msWorst: +worst.toFixed(1), state: this.pen.state };
  },
};
window.H = H;
export default H;

// ── moves, stepped by hand (the fight frozen between calls; no dependence on the tab's frame rate) ──
/** Step the game until the Pen is in one of `states` (or `max` seconds passed). Returns the state. */
H.to = function (states, max = 12) {
  const want = [].concat(states);
  this.pause(false);
  for (let t = 0; t < max && !want.includes(this.pen.state); t += 1 / 30) W().advance(1 / 30);
  this.pause(true);
  return this.pen.state;
};
/** Step `sec` more seconds, then freeze. */
H.more = function (sec) { this.pause(false); W().advance(sec); this.pause(true); return this.pen.state; };
/** Start a ground move on WAI standing `d` m in front of the arena centre. */
H.move = function (id, d = 7) {
  const pen = this.pen, T3 = this.p.pos.constructor;
  this.to('IDLE', 20);
  this.p.teleport(new T3(pen.arena.x, pen.floorY + 0.05, pen.arena.z + d));
  pen.hz.clear();
  pen.ground.start(id, this.p);
  return this.pen.state;
};
/**
 * Cost of one frame as it stands: draw calls and triangles of one frame, then the mean time of `n` frames rendered back
 * to back with gl.finish() (CPU + GPU; independent of the tab's frame rate, which a hidden pane throttles).
 */
H.cost = function (n = 120) {
  const app = W().app, R = app.renderer.renderer, gl = R.getContext();
  R.info.autoReset = false; R.info.reset(); app.render(1, 1 / 60);
  const calls = R.info.render.calls, tris = R.info.render.triangles;
  R.info.autoReset = true; gl.finish();
  const t = performance.now();
  for (let i = 0; i < n; i++) { app.render(1, 1 / 60); gl.finish(); }
  return { calls, ktris: Math.round(tris / 1000), ms: +((performance.now() - t) / n).toFixed(2) };
};
