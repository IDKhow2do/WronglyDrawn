// Render-only bench: frozen scene, N renders per heading with gl.finish(); interleave builds. node bench.mjs level tier reps dist...
import { serve, launch, sleep, pct, START } from './cdp.mjs';
const [level, tier, reps, throttle, ...dists] = process.argv.slice(2);
const IOS = process.env.IOS === "1"; const W = IOS ? 932 : 1425, H = IOS ? 430 : 657;
const res = {};
async function run(dist) {
  const srv = await serve(dist);
  const c = await launch({ width: W, height: H });
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: IOS ? 3 : 1, mobile: IOS });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{${IOS ? "window.__WD_IOS_APP=true;" : ""}localStorage.setItem("wd.gfx","${tier}");localStorage.setItem('wd.levels','["plaza","harbor","works"]')}catch{}` });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test&dev&level=${level}&style=graffiti${process.env.Q || ""}` });
  await c.waitFor(`window.T && document.querySelector('.start-btn') && window.__WD && __WD.state === 'TITLE'`);
  console.error(JSON.stringify(await c.ev(START)));
  await sleep(1500);
  await c.ev(`__WD.app.loop.stop(); __WD.advance(1.0); 1`);
  if (+throttle > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
  const out = await c.ev(`(() => {
    const app = __WD.app, R = app.renderer.renderer, gl = R.getContext();
    const yaw0 = app.camera.yaw; const rows = [];
    for (let h = 0; h < 4; h++) {
      app.camera.yaw = yaw0 + h * Math.PI / 2; __WD.advance(0.2);
      for (let i = 0; i < 20; i++) { app.renderer.render(); } gl.finish();
      const ts = [];
      let calls = 0, tris = 0;
      const rr = R.render; R.render = function () { const r = rr.apply(this, arguments); calls += R.info.render.calls; tris += R.info.render.triangles; return r; };
      const N = 120;
      for (let i = 0; i < N; i++) { const t = performance.now(); app.renderer.render(); const t1 = performance.now(); gl.finish(); ts.push([t1 - t, performance.now() - t]); }
      R.render = rr;
      ts.sort((a, b) => a[0] - b[0]);
      const cpu = ts[N >> 1][0]; const tot = ts.map((x) => x[1]).sort((a, b) => a - b)[N >> 1];
      // GL calls per render (a device-independent cost: each one is an IPC message on iOS WebKit)
      const proto = Object.getPrototypeOf(gl); const saved = {}; let glN = 0; const kinds = {};
      for (const k of Object.getOwnPropertyNames(proto)) { let f; try { f = proto[k]; } catch { continue; } if (typeof f !== 'function') continue; saved[k] = f; gl[k] = function () { glN++; const g = k.startsWith('uniform') ? 'uniform*' : k; kinds[g] = (kinds[g] || 0) + 1; return f.apply(gl, arguments); }; }
      for (let i = 0; i < 5; i++) app.renderer.render();
      for (const k in saved) delete gl[k];
      const top = Object.entries(kinds).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ':' + Math.round(v / 5)).join(' ');
      rows.push({ cpu: +cpu.toFixed(2), tot: +tot.toFixed(2), calls: Math.round(calls / N), tris: Math.round(tris / N), gl: Math.round(glN / 5), top });
    }
    app.camera.yaw = yaw0;
    return rows;
  })()`);
  if (c.errors.length) console.error('ERR', dist, c.errors[0]);
  c.close(); srv.close();
  return out;
}
for (let r = 0; r < +reps; r++) for (const d of dists) (res[d] ??= []).push(await run(d));
for (const d of dists) {
  console.log(d.split('/').pop());
  for (let h = 0; h < 4; h++) {
    const xs = res[d].map((run) => run[h]);
    console.log(`  heading ${h}: calls ${xs[0].calls} tris ${xs[0].tris} | cpu ms ${xs.map((x) => x.cpu).join(' ')} | cpu+gpu ms ${xs.map((x) => x.tot).join(' ')} | GL calls ${xs[0].gl} (${xs[0].top})`);
  }
}
