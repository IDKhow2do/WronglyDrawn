// In-page camera probe (injected by the node scripts). window.__cam
(() => {
  const W = window.__WD, app = W.app;
  const cam = app.camera, c3 = cam.camera;
  const s = () => W.session;
  const V = c3.position.constructor;
  // one game step + the frame update (camera, fader), no GPU draw (W.advance draws every call: ~30 ms headless)
  const step = () => {
    const real = app.renderer.render;
    app.renderer.render = () => {};
    try {
      app.step(1 / 60);
      app.render(1, 1 / 60);
    } finally {
      app.renderer.render = real;
    }
  };
  const rec = () => {
    const p = c3.position, q = c3.quaternion;
    const fwd = new V(0, 0, -1).applyQuaternion(q);
    return { p: [p.x, p.y, p.z], f: [fwd.x, fwd.y, fwd.z], close: cam.closeness, yaw: cam.yaw, free: cam.dbg.free, sh: cam.dbg.shoulder, raise: cam.dbg.raise };
  };
  // second-difference jitter on positions (m) and on the view direction (rad)
  const metric = (fr) => {
    let acc = 0, accA = 0, maxD = 0, n = 0, flips = 0, lastS = 0, sumD = 0;
    for (let i = 1; i < fr.length; i++) {
      const a = fr[i - 1].p, b = fr[i].p;
      const d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      maxD = Math.max(maxD, d);
      sumD += d;
      const dc = fr[i].close - fr[i - 1].close;
      const sg = Math.abs(dc) < 0.004 ? 0 : Math.sign(dc);
      if (sg && lastS && sg !== lastS) flips++;
      if (sg) lastS = sg;
    }
    for (let i = 2; i < fr.length; i++) {
      const [a, b, c] = [fr[i - 2].p, fr[i - 1].p, fr[i].p];
      acc += (c[0] - 2 * b[0] + a[0]) ** 2 + (c[1] - 2 * b[1] + a[1]) ** 2 + (c[2] - 2 * b[2] + a[2]) ** 2;
      const [fa, fb, fc] = [fr[i - 2].f, fr[i - 1].f, fr[i].f];
      accA += (fc[0] - 2 * fb[0] + fa[0]) ** 2 + (fc[1] - 2 * fb[1] + fa[1]) ** 2 + (fc[2] - 2 * fb[2] + fa[2]) ** 2;
      n++;
    }
    const cl = fr.map((f) => f.close);
    return {
      jit: +(Math.sqrt(acc / Math.max(1, n)) * 1000).toFixed(2), // mm per frame^2 (RMS)
      jitA: +(Math.sqrt(accA / Math.max(1, n)) * 1000).toFixed(2), // mrad per frame^2 (RMS)
      maxStep: +(maxD * 1000).toFixed(1), // mm
      path: +sumD.toFixed(3),
      flips,
      closeMin: +Math.min(...cl).toFixed(2),
      closeMax: +Math.max(...cl).toFixed(2),
    };
  };
  const api = {
    freeze() {
      app.loop.stop();
      app.agent.enabled = false;
      return 1;
    },
    place(x, y, z, yaw, pitch = 0.22) {
      const p = s().player;
      p.teleport(new V(x, y, z), yaw);
      p.vel?.set?.(0, 0, 0);
      cam.yaw = yaw;
      cam.pitch = pitch;
      cam.shake = 0;
      cam.override = null;
      cam.stopCine();
      for (let i = 0; i < 40; i++) step();
      return [p.pos.x, p.pos.y, p.pos.z];
    },
    /** still: yaw set once, nothing else touched. sweep: rad/s via the mouse path. */
    run(frames, opts = {}) {
      const fr = [];
      const p = s().player;
      for (let i = 0; i < frames; i++) {
        if (opts.sweep) cam.applyMouse(-(opts.sweep / 60) / cam.sensitivity, 0);
        if (opts.holdYaw !== undefined) cam.yaw = opts.holdYaw;
        if (opts.keepHp) { p.hp = 6; p.invuln = 1; }
        step();
        fr.push(rec());
      }
      return { m: metric(fr), fr: opts.keep ? fr : undefined, end: [p.pos.x, p.pos.y, p.pos.z] };
    },
    rec,
    metric,
  };
  window.__cam = api;
  return 1;
})();
