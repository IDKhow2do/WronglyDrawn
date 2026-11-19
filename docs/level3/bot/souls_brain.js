// In-page bot for the souls-like Red Pen fight (injected by souls.mjs; runs every animation frame, no CDP latency).
// It plays like a careful human with a mouse: walks in through the ink gate, AIMS by turning the camera itself (no
// lock-on, no Y), answers each tell with the move the threat asks for (roll / jump / leave) at the right moment and only
// if it has stamina, paints the open weak point through the crosshair, TAGs before the window shuts, shouts the flying
// Pen down in phase 2, walks off the sky's correction marks, TAGs the final fall. window.__soulsBot.stats.
(() => {
  if (window.__soulsBot?.on) return 'already';
  const app = __WD.app;
  const input = app.input;
  const bot = (window.__soulsBot = { on: true, stats: { rolls: 0, jumps: 0, hits: 0, tags: 0, shouts: 0, refused: 0, deaths: 0 }, log: [], last: '' });
  const held = new Map(); // code → seconds left
  const tap = (code, sec = 0.09) => { input.virtualDown(code); held.set(code, sec); };
  const T3 = app.session.player.pos.constructor;
  const v = new T3(), w = new T3();
  let prevT = performance.now(), rollCd = 0, jumpCd = 0, tagCd = 0, shoutCd = 0, strafe = 1, strafeT = 0, lastHp = 6, wasDown = false;
  const note = (s) => { if (bot.last !== s) { bot.last = s; bot.log.push(`${(app.session.stats.time | 0)}s ${s}`); if (bot.log.length > 80) bot.log.shift(); } };
  app.agent.enabled = false;

  // world direction → camera-relative stick
  const stick = (dir, mag) => {
    const { forward, right } = app.camera.basis();
    const l = Math.hypot(dir.x, dir.z) || 1;
    input.virtualMove.y = ((dir.x * forward.x + dir.z * forward.z) / l) * mag;
    input.virtualMove.x = ((dir.x * right.x + dir.z * right.z) / l) * mag;
  };
  const stop = () => { input.virtualMove.x = input.virtualMove.y = 0; };
  // the mouse: turn the camera so the crosshair ray (from the camera) runs through `at`; a hand-speed ease, so it converges
  const aimAt = (at, dt) => {
    const cam = app.camera, c = cam.camera.position;
    const dx = at.x - c.x, dy = at.y - c.y, dz = at.z - c.z;
    const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
    const k = 1 - Math.exp(-dt * 12);
    cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * k;
    cam.pitch += (Math.max(-1.25, Math.min(1.05, pitch)) - cam.pitch) * k;
  };

  let gateStuck = 0, gateSide = 2, sideT = 0;
  const gateLast = new app.session.player.pos.constructor();
  function frame() {
    if (!bot.on) return;
    requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.1, (now - prevT) / 1000);
    prevT = now;
    for (const [k, t] of held) { if (t - dt <= 0) { input.virtualUp(k); held.delete(k); } else held.set(k, t - dt); }
    const s = app.session;
    if (!s || s.levelId !== 'works' || s.completed) return;
    rollCd -= dt; jumpCd -= dt; tagCd -= dt; shoutCd -= dt; strafeT -= dt;
    const p = s.player, pen = s.pen, souls = s.souls, th = pen.threat, hz = pen.hz;
    if (p.hp < lastHp) { bot.stats.hits++; note(`hit by ${th.id}/${pen.state} hp ${p.hp}`); }
    lastHp = p.hp;
    if (souls.mode === 'down' && !wasDown) { bot.stats.deaths++; note('SMUDGED'); }
    wasDown = souls.mode === 'down';
    if (s.bossDone || p.smudged || s.story.locked || app.camera.storyCine) { stop(); input.virtualUp('Mouse0'); return; }
    // ── outside: walk in through the gate ──
    if (souls.mode === 'off') {
      if (s.woken.size < 3) return;
      const g = s.built.roof.ring.gatePos, c = s.built.roof.ring.center;
      const outside = s.built.roof.ring.radial(p.pos) > s.built.roof.ring.R - 0.6;
      const tgt = outside && p.pos.distanceTo(g) > 1.2 ? g : c;
      // stuck on a railing (the roof hatch's): walk along it for a moment, then try straight again
      gateStuck = p.pos.distanceTo(gateLast) < 0.02 ? gateStuck + dt : 0;
      gateLast.copy(p.pos);
      if (gateStuck > 0.8) { gateSide = gateSide > 0 ? -2 : 2; gateStuck = 0; sideT = 1.6; note('around the railing'); }
      sideT -= dt;
      v.set(tgt.x - p.pos.x, 0, tgt.z - p.pos.z);
      if (sideT > 0) v.set(-v.z * Math.sign(gateSide), 0, v.x * Math.sign(gateSide));
      stick(v, 0.8);
      note('walking to the gate');
      return;
    }
    if (souls.mode !== 'on') { stop(); return; }
    const st = souls.stamina.value;
    const pivot = pen.penBody.pose.pivot;
    const flat = (a) => Math.hypot(a.x - p.pos.x, a.z - p.pos.z);
    // ── FINAL: TAG it ──
    if (pen.state === 'FINAL') {
      input.virtualUp('Mouse0');
      if (flat(pen.pos) > 3) stick(v.set(pen.pos.x - p.pos.x, 0, pen.pos.z - p.pos.z), 1);
      else { stop(); if (tagCd <= 0 && s.combat.finisherTarget()) { tap('KeyE'); tagCd = 1; bot.stats.tags++; note('FINAL TAG'); } }
      return;
    }
    // ── answer the tell ──
    const danger = th.stage === 'tell' || th.stage === 'live';
    if (danger && th.answer === 'jump' && p.grounded && jumpCd <= 0) {
      const lead = th.id === 'rule' ? 0.2 : 0.1;
      if (th.eta < lead && st >= 1) { tap('Space', 0.25); jumpCd = 0.6; bot.stats.jumps++; note(`jump ${th.id}`); }
    }
    if (danger && th.answer === 'roll' && p.grounded && rollCd <= 0) {
      const lead = th.id === 'stab' ? 0.3 : th.id === 'cross' ? 0.32 : th.id === 'swoop' ? 0.22 : 0.12;
      if (th.eta < lead) {
        if (st < 1) { bot.stats.refused++; note('no stamina to roll'); }
        else {
          // ring attacks: roll out of the ring; lines: roll off sideways; sweeps: roll into it (i-frames)
          if (th.id === 'sweep') v.set(pivot.x - p.pos.x, 0, pivot.z - p.pos.z);
          else if (th.id === 'swoop' || th.id === 'cross') { const yaw = pen.penBody.pose.leanYaw; v.set(Math.cos(yaw), 0, -Math.sin(yaw)); if (th.id === 'cross') v.set(p.pos.x - pen.arena.x, 0, p.pos.z - pen.arena.z).applyAxisAngle(new T3(0, 1, 0), Math.PI / 2); }
          else v.set(p.pos.x - th.at.x, 0, p.pos.z - th.at.z);
          if (v.lengthSq() < 0.01) v.set(1, 0, 0);
          stick(v, 1);
          tap('KeyC');
          rollCd = 0.7;
          bot.stats.rolls++;
          note(`roll ${th.id} eta ${th.eta.toFixed(2)}`);
          return;
        }
      }
    }
    // ── correction marks (phase 2): walk to the nearest clear spot before the stroke is drawn ──
    if (hz.marks.dangerAt(p.pos)) {
      const safe = hz.marks.safeSpot(p.pos, w);
      if (safe) { stick(v.set(safe.x - p.pos.x, 0, safe.z - p.pos.z), 1); input.virtualUp('Mouse0'); note(`leaving a mark`); return; }
    }
    // ── stay out of ink (pools, live lines, tiles, landing rings) ──
    const inRing = danger && th.answer === 'leave' && flat(th.at) < th.r + 0.6;
    if (hz.dangerAt(p.pos) || inRing) {
      v.set(p.pos.x - (inRing ? th.at.x : pivot.x), 0, p.pos.z - (inRing ? th.at.z : pivot.z));
      if (v.lengthSq() < 0.01) v.set(1, 0, 0);
      v.normalize().applyAxisAngle(new T3(0, 1, 0), 0.6 * strafe);
      // never out of the ring
      w.copy(p.pos).addScaledVector(v, 2);
      if (Math.hypot(w.x - pen.arena.x, w.z - pen.arena.z) > pen.arenaR - 2) v.set(pen.arena.x - p.pos.x, 0, pen.arena.z - p.pos.z);
      stick(v, 0.85);
      input.virtualUp('Mouse0');
      note(`leaving ink (${th.id})`);
      return;
    }
    // ── phase 2: shout it down ──
    if (pen.shoutable) {
      input.virtualUp('Mouse0');
      const d = p.pos.distanceTo(pen.pos);
      aimAt(w.copy(pen.pos).setY(pen.pos.y + 1), dt);
      if (d > 8.5) stick(v.set(pen.pos.x - p.pos.x, 0, pen.pos.z - p.pos.z), 0.85);
      else { stop(); if (shoutCd <= 0) { tap('KeyX', 0.1); shoutCd = 1.4; bot.stats.shouts++; note('SHOUT'); } }
      return;
    }
    // ── a window: go paint the open point, TAG before it shuts ──
    const open = pen.openPoints();
    if (open.length) {
      let o = open[0];
      for (const x of open) if (flat(x.pos) < flat(o.pos)) o = x;
      const d = flat(o.pos);
      const want = o.pos.y - p.pos.y > 3 ? 4.5 : 3.2;
      if (d > want + 1) { stick(v.set(o.pos.x - p.pos.x, 0, o.pos.z - p.pos.z), 1); }
      else if (d < want - 1.2) stick(v.set(p.pos.x - o.pos.x, 0, p.pos.z - o.pos.z), 0.6);
      else stop();
      aimAt(o.pos, dt);
      if (s.weapon.tankFrac > 0.03 && d < 8) input.virtualDown('Mouse0'); else input.virtualUp('Mouse0');
      const tgt = s.combat.finisherTarget();
      if (tgt === pen && tagCd <= 0 && (o.left < 1.1 || s.weapon.tankFrac < 0.05)) { input.virtualUp('Mouse0'); tap('KeyE'); tagCd = 1.5; bot.stats.tags++; note(`TAG ${o.id}`); }
      note(`painting ${o.id}`);
      return;
    }
    input.virtualUp('Mouse0');
    // ── nothing to do: keep a respectful distance, drift sideways, let stamina refill; keep the Pen in view ──
    aimAt(pen.bodyPoint(w).setY(Math.min(w.y, p.pos.y + 4)), dt);
    const d = flat(pivot);
    if (strafeT <= 0) { strafe = -strafe; strafeT = 2 + Math.random() * 2; }
    v.set(p.pos.x - pivot.x, 0, p.pos.z - pivot.z);
    if (v.lengthSq() < 0.01) v.set(1, 0, 0);
    v.normalize();
    const radial = d < 7 ? 1 : d > 10.5 ? -1 : 0;
    w.set(-v.z * strafe, 0, v.x * strafe).addScaledVector(v, radial);
    // keep off the curtain
    const r = Math.hypot(p.pos.x - pen.arena.x, p.pos.z - pen.arena.z);
    if (r > pen.arenaR - 3) w.set(pen.arena.x - p.pos.x, 0, pen.arena.z - p.pos.z);
    stick(w, 0.7);
  }
  requestAnimationFrame(frame);
  return 'started';
})();
