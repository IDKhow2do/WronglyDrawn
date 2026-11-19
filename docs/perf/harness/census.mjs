// Draw census: where do the draw calls of one level come from? node census.mjs <dist> [level] [tier] [w] [h]
import { readFile } from 'node:fs/promises';
import { serve, launch, sleep, START } from './cdp.mjs';

const [dist, level = 'plaza', tier = 'low', w = '1425', h = '657'] = process.argv.slice(2);
const srv = await serve(dist);
const c = await launch({ width: +w, height: +h });
await c.send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 1, mobile: false });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('wd.gfx','${tier}');localStorage.setItem('wd.levels','["plaza","harbor","works"]')}catch{}` });
const t0 = Date.now();
await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test&dev&level=${level}&style=graffiti` });
await c.waitFor(`window.T && document.querySelector('.start-btn') && window.__WD && __WD.state === 'TITLE'`);
const loadMs = Date.now() - t0;
const state = console.error(JSON.stringify(await c.ev(START)));
await c.ev(await readFile(new URL('./probe.js', import.meta.url), 'utf8'));
await c.ev(`(() => { const q = __WD.app; const Q = q.renderer; return 1; })()`);
await sleep(1500);
const out = { level, tier, loadMs, state, poses: [] };
const yaw0 = await c.ev(`__WD.app.camera.yaw`);
for (let i = 0; i < 4; i++) {
  await c.ev(`(() => { __WD.app.camera.yaw = ${yaw0} + ${i} * Math.PI / 2; })()`);
  await sleep(600);
  await c.ev(`__P.start(true)`);
  await sleep(2500);
  const r = await c.ev(`__P.stop()`);
  out.poses.push(r);
}
out.errors = c.errors;
console.log(JSON.stringify(out));
c.close();
srv.close();
