// Live route A/B: walk forward, turn steadily, spray in bursts, for SECS seconds. Interleaved builds.
// node route.mjs <level> <secs> <throttle> <reps> <dist...>   env IOS=1 → the iOS app's settings (932x430 @3x)
import { readFile } from 'node:fs/promises';
import { serve, launch, sleep, START } from './cdp.mjs';
const [level, secs, throttle, reps, ...dists] = process.argv.slice(2);
const IOS = process.env.IOS === '1';
const [W, H, DPR] = IOS ? [932, 430, 3] : [1425, 657, 1];
const res = {};
async function run(dist) {
  const srv = await serve(dist);
  const c = await launch({ width: W, height: H });
  await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: IOS });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{${IOS ? 'window.__WD_IOS_APP=true;' : "localStorage.setItem('wd.gfx','low');"}localStorage.setItem('wd.levels','["plaza","harbor","works"]')}catch{}` });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test&dev&level=${level}&style=graffiti` });
  await c.waitFor(`window.T && document.querySelector('.start-btn') && window.__WD && __WD.state === 'TITLE'`);
  await c.ev(START);
  await c.ev(await readFile(new URL('./probe.js', import.meta.url), 'utf8'));
  // hold the resolution: the scaler must not answer the throttle differently in the two builds
  await c.ev(`(() => { const R = __WD.app.renderer.renderer; R.setPixelRatio = () => {}; R.setDrawingBufferSize = () => {}; R.setSize = () => {}; __WD.app.session.player.hp = 99; return 1; })()`);
  if (+throttle > 1) await c.send('Emulation.setCPUThrottlingRate', { rate: +throttle });
  await sleep(1500);
  await c.ev(`(() => { window.__route = setInterval(() => { const a = __WD.app; a.camera.yaw += 0.035; a.session.player.hp = Math.max(a.session.player.hp, 6); }, 50); T.down('KeyW'); window.__spray = setInterval(() => { T.mdown(0); setTimeout(() => T.mup(0), 900); }, 1800); __P.start(false); return 1; })()`);
  await sleep(+secs * 1000);
  const out = await c.ev(`(() => { clearInterval(window.__route); clearInterval(window.__spray); T.up('KeyW'); const r = __P.stop(); r.out = __WD.app.batch ? __WD.app.batch.stats.out : -1; return r; })()`);
  if (c.errors.length) console.error('ERR', dist, c.errors[0]);
  c.close(); srv.close();
  return out;
}
for (let r = 0; r < +reps; r++) for (const d of dists) (res[d] ??= []).push(await run(d));
console.log(`${level} ${IOS ? 'iOS settings' : 'web Low'} throttle ${throttle}x, ${secs}s route; per run: p50 / p95 / p99 ms, frames >33.4 ms of total, render CPU p50, draws main+shadow, buffer`);
for (const d of dists) for (const x of res[d]) console.log(`  ${d.split('/').pop().padEnd(8)} ${x.dt.p50} / ${x.dt.p95} / ${x.dt.p99}   long ${x.dt.over33}/${x.frames}   cpuRender ${x.cpuRender.p50}   draws ${x.main.calls}+${x.shadow.calls}   ${x.buffer.join('x')}`);
