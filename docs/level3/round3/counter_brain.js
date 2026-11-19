// In-page counter player for presence.mjs (docs/level3/ROUND3.md): every animation frame it plays the counter of the one
// test creature (window.__pe) like a human with a mouse would, and nothing else.
//  · Ruler Snake: when its red line is drawn, sprint sideways off it (perpendicular, the short way); otherwise paint
//    it — hardest while it lies stretched out after a whip (double paint).
//  · Compass Spinner: while it plants, paint the NEEDLE (it topples); if the pencil starts anyway, sprint straight out
//    of the circle and JUMP the line when it is drawn where WAI crosses.
//  · Stamp Press / the Limp: back off and paint (the bot's old answer; they are measured for reference only).
// window.__counterBot.stats: jumps, sidesteps, sprayT. window.__counterPaint = false → dodge only (no paint);
// window.__counterStroll = true → ignores the creature and keeps strolling sideways (does it still land?).
(() => {
  const app = __WD.app, input = app.input;
  const bot = (window.__counterBot = { on: true, stats: { jumps: 0, sidesteps: 0, sprayT: 0 } });
  const T3 = app.session.player.pos.constructor;
  const v = new T3();
  let prevT = performance.now(), jumpCd = 0, side = 0, spaceT = 0, strollT = 0;
  app.agent.enabled = false;
  const stick = (x, z, mag) => {
    const { forward, right } = app.camera.basis();
    const l = Math.hypot(x, z) || 1;
    input.virtualMove.y = ((x * forward.x + z * forward.z) / l) * mag;
    input.virtualMove.x = ((x * right.x + z * right.z) / l) * mag;
  };
  const stop = () => { input.virtualMove.x = input.virtualMove.y = 0; };
  const aimAt = (at, dt) => {
    const cam = app.camera, c = cam.camera.position;
    const dx = at.x - c.x, dy = at.y - c.y, dz = at.z - c.z;
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    const k = 1 - Math.exp(-dt * 14);
    cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * k;
    cam.pitch += (Math.max(-1.25, Math.min(1.05, pitch)) - cam.pitch) * k;
  };
  const paint = window.__counterPaint !== false; // 'dodge' mode: only the dodging half of the counter
  const spray = (on, dt) => { if (on && paint && app.session.weapon.tankFrac > 0.03) { input.virtualDown('Mouse0'); bot.stats.sprayT += dt; } else input.virtualUp('Mouse0'); };
  const jump = () => { if (jumpCd > 0) return; input.virtualDown('Space'); spaceT = 0.2; jumpCd = 0.7; bot.stats.jumps++; };
  function frame() {
    if (!bot.on) { stop(); input.virtualUp('Mouse0'); input.virtualUp('Space'); return; }
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;
    jumpCd -= dt;
    if (spaceT > 0 && (spaceT -= dt) <= 0) input.virtualUp('Space');
    const s = app.session, p = s.player, e = window.__pe;
    if (!e || e.disposed || e.harmless || p.smudged) { stop(); spray(false, dt); return; }
    if (window.__counterStroll) {
      // 'stroll': a player who ignores it and keeps walking, 3 m to one side, then back (no dodge, no paint)
      strollT += dt;
      const f = app.camera.basis().right;
      stick(f.x * (Math.floor(strollT / 1.6) % 2 ? -1 : 1), f.z * (Math.floor(strollT / 1.6) % 2 ? -1 : 1), 0.6);
      return;
    }
    const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
    if (e.kind === 'rulersnake') {
      const L = e.whipLine;
      if (L.on && e.state === 'SNAP_TELL') {
        const fx = Math.sin(L.yaw), fz = Math.cos(L.yaw);
        const rx = p.pos.x - L.o.x, rz = p.pos.z - L.o.z;
        const lat = rx * fz - rz * fx;
        if (!side) {
          // the short way off the line, unless that side has no floor or a wall (a human looks before stepping)
          const open = (sg) => {
            const a = new T3(p.pos.x + fz * sg * 2.4, p.pos.y + 0.8, p.pos.z - fx * sg * 2.4);
            const wall = s.physics.raycast(new T3(p.pos.x, p.pos.y + 0.8, p.pos.z), new T3(fz * sg, 0, -fx * sg), 2.4, (cc) => s.physics.tagOf(cc) === 'static');
            return !wall && !!s.physics.raycast(a, new T3(0, -1, 0), 1.6, (cc) => s.physics.tagOf(cc) === 'static');
          };
          side = lat >= 0 ? 1 : -1;
          if (!open(side) && open(-side)) side = -side;
          bot.stats.sidesteps++;
        }
        if (Math.abs(lat) < L.half + 1.0) stick(fz * side, -fx * side, 1); else stop();
        spray(false, dt);
        return;
      }
      side = 0;
      // paint the ruler where it lies (its middle), from a few metres off
      const mid = e.J ? v.copy(e.J[3]).add(e.J[5]).multiplyScalar(0.5) : v.copy(e.pos);
      aimAt(v.setY(mid.y + 0.15), dt);
      if (e.state !== 'REST' && d < 3.4) stick(-dx, -dz, 0.7); else if (d > 6.5) stick(dx, dz, 0.7); else stop();
      spray(d < 8, dt);
      return;
    }
    if (e.kind === 'compass') {
      const c = e.circle;
      if (e.state === 'PLANT' && paint) {
        // the needle: paint it before the pencil starts
        aimAt(v.copy(c.center).setY(c.center.y + 0.3), dt);
        stop();
        spray(true, dt);
        return;
      }
      if (e.state === 'PLANT') { stop(); return; } // dodge only: wait for the pencil, then run
      if (e.state === 'SPIN' || e.state === 'CIRCLE') {
        const ox = p.pos.x - c.center.x, oz = p.pos.z - c.center.z, dist = Math.hypot(ox, oz);
        spray(false, dt);
        if (dist < c.r + 1.0) {
          stick(ox, oz, 1);
          if (Math.abs(dist - c.r) < 0.95 && p.grounded) jump();
        } else stop();
        return;
      }
      aimAt(v.copy(e.pos).setY(e.pos.y + 0.6), dt);
      if (d < 2.4) stick(-dx, -dz, 0.6); else stop();
      spray(e.state === 'STUCK' && d < 8, dt);
      if (e.state === 'STUCK' && e.canBeTagged && d < 3) { input.virtualDown('KeyE'); setTimeout(() => input.virtualUp('KeyE'), 90); }
      return;
    }
    // reference creatures: back off and paint
    aimAt(v.copy(e.pos).setY(e.pos.y + 1), dt);
    if (d < 4.5) stick(-dx, -dz, 1); else stop();
    spray(d < 8, dt);
  }
  frame();
  return 'counter brain on';
})()
