// Injected into the page (never shipped). Counts every draw by pass and by (geometry, material), and times frames.
(() => {
  const app = __WD.app;
  const R = app.renderer.renderer;
  const P = (window.__P = { on: false, frames: [], draws: new Map(), nFrames: 0, cpu: { render: 0, step: 0, frame: 0 }, steps: [] });
  const tri = (g, grp, o) => {
    const n = grp ? grp.count : g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    return (n / 3) * (o.isInstancedMesh ? o.count : 1);
  };
  const path = (o) => {
    const a = [];
    for (let p = o; p && a.length < 5; p = p.parent) a.push(p.name || p.type);
    return a.join('<');
  };
  const rbd = R.renderBufferDirect;
  let cur = null;
  R.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (P.on && cur) {
      const shadow = scene === null || material.isMeshDepthMaterial || material.isMeshDistanceMaterial;
      const t = tri(geometry, group, object);
      if (shadow) (cur.sc++, (cur.st += t));
      else (cur.mc++, (cur.mt += t));
      if (P.detail) {
        const k = (shadow ? 'S|' : 'M|') + geometry.uuid + '|' + material.uuid;
        let d = P.draws.get(k);
        if (!d) P.draws.set(k, (d = { shadow, n: 0, tris: 0, objs: new Set(), geo: geometry.uuid, mat: material.uuid, matType: material.type, matName: material.name, transparent: material.transparent, sample: path(object), type: object.type, vtx: geometry.attributes.position?.count ?? 0 }));
        d.n++;
        d.tris += t;
        d.objs.add(object.uuid);
      }
    }
    return rbd.apply(this, arguments);
  };
  const rr = R.render;
  let renderCpu = 0;
  R.render = function () {
    const t = performance.now();
    const r = rr.apply(this, arguments);
    renderCpu += performance.now() - t;
    return r;
  };
  // step + whole-frame CPU: the Loop calls the closures given at construction, which call app.step / app.render
  let stepCpu = 0, stepN = 0;
  const st = app.step;
  app.step = function () {
    const t = performance.now();
    const r = st.apply(this, arguments);
    stepCpu += performance.now() - t;
    stepN++;
    return r;
  };
  const ar = app.render;
  let last = 0;
  app.render = function () {
    const t0 = performance.now();
    cur = { mc: 0, mt: 0, sc: 0, st: 0 };
    renderCpu = 0;
    const r = ar.apply(this, arguments);
    if (P.on) {
      if (P.sync) R.getContext().finish();
      const t1 = performance.now();
      P.frames.push({ dt: last ? t0 - last : 0, cpuRender: renderCpu, cpuFrame: t1 - t0, cpuStep: stepCpu, steps: stepN, ...cur });
    }
    stepCpu = 0;
    stepN = 0;
    last = t0;
    cur = null;
    return r;
  };
  P.hooked = { step: app.step !== st, render: app.render !== ar };
  P.start = (detail = false, sync = false) => { P.frames = []; P.draws = new Map(); P.detail = detail; P.sync = sync; last = 0; P.on = true; };
  P.stop = () => {
    P.on = false;
    const f = P.frames.slice(1);
    const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
    const col = (k) => f.map((x) => x[k]);
    const avg = (k) => col(k).reduce((a, b) => a + b, 0) / Math.max(1, f.length);
    const r2 = (v) => Math.round(v * 100) / 100;
    const out = {
      frames: f.length,
      dt: { p50: r2(q(col('dt'), 0.5)), p95: r2(q(col('dt'), 0.95)), p99: r2(q(col('dt'), 0.99)), max: r2(Math.max(...col('dt'))), over33: col('dt').filter((d) => d > 33.4).length, over17: col('dt').filter((d) => d > 17.2).length },
      cpuFrame: { p50: r2(q(col('cpuFrame'), 0.5)), p95: r2(q(col('cpuFrame'), 0.95)) },
      cpuRender: { p50: r2(q(col('cpuRender'), 0.5)), p95: r2(q(col('cpuRender'), 0.95)) },
      cpuStep: { p50: r2(q(col('cpuStep'), 0.5)), p95: r2(q(col('cpuStep'), 0.95)) },
      stepsMax: Math.max(...col('steps')),
      main: { calls: Math.round(avg('mc')), tris: Math.round(avg('mt')) },
      shadow: { calls: Math.round(avg('sc')), tris: Math.round(avg('st')) },
      buffer: [R.domElement.width, R.domElement.height],
    };
    if (P.detail) {
      const n = Math.max(1, P.frames.length);
      out.detail = [...P.draws.values()].map((d) => ({ pass: d.shadow ? 'S' : 'M', perFrame: r2(d.n / n), trisPerFrame: Math.round(d.tris / n), objs: d.objs.size, matType: d.matType, matName: d.matName, tr: d.transparent, type: d.type, vtx: d.vtx, sample: d.sample, geo: d.geo.slice(0, 8), mat: d.mat.slice(0, 8) }));
    }
    return out;
  };
  return P.hooked;
})();
