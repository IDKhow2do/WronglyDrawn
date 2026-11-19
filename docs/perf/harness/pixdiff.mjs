// Exact A/B in one page: frozen scene, render with merged copies, then with the sources only; compare pixels.
import { writeFile } from 'node:fs/promises';
import { serve, launch, sleep, START } from './cdp.mjs';
const [dist, level = 'plaza', tier = 'low', style = 'graffiti', shots = ''] = process.argv.slice(2);
const srv = await serve(dist);
const W = 1425, H = 657;
const c = await launch({ width: W, height: H });
await c.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('wd.gfx','${tier}');localStorage.setItem('wd.levels','["plaza","harbor","works"]')}catch{}` });
await c.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/?test&dev&level=${level}&style=${style}` });
await c.waitFor(`window.T && document.querySelector('.start-btn') && window.__WD && __WD.state === 'TITLE'`);
console.error(JSON.stringify(await c.ev(START)));
await sleep(1200);
const out = await c.ev(`(async () => {
  const app = __WD.app, R = app.renderer.renderer, gl = R.getContext(), b = app.batch;
  app.loop.stop(); __WD.advance(0.5);
  const grab = () => { app.renderer.render(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
  const setBatched = (on) => { b.reveal(!on); for (const x of b.batches) x.mesh.visible = on; if (b.ink) for (const g of b.ink.groups.values()) g.mesh.visible = on; };
  const p0 = app.session.player.pos.clone(); const yaw0 = app.camera.yaw;
  const poses = [[0,0,0,0],[0,0,0,1.57],[0,0,0,3.14],[0,0,0,4.71],[6,0,-8,0.6],[-9,0,-14,2.2],[12,0,-22,4.0],[-4,0,-30,5.3],[3,0,-45,1.0],[-15,0,-55,3.0]];
  const rows = [];
  for (const [dx, dy, dz, dyaw] of poses) {
    T.tp(p0.x + dx, p0.y + dy + (dx||dz ? 1.5 : 0), p0.z + dz, yaw0 + dyaw); __WD.advance(0.7);
    setBatched(true); const a1 = grab(); const a2 = grab();
    setBatched(false); const s = grab();
    setBatched(true);
    const cmp = (x, y) => { let n = 0, n2 = 0, n8 = 0, mx = 0; for (let i = 0; i < x.length; i += 4) { const d = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i+1] - y[i+1]), Math.abs(x[i+2] - y[i+2])); if (d) { n++; if (d > 2) n2++; if (d > 8) n8++; if (d > mx) mx = d; } } return { n, n2, n8, mx }; };
    rows.push({ pose: [dx, dz, dyaw], noise: cmp(a1, a2), diff: cmp(a1, s), calls: 0, out: b.stats.out });
    ${shots ? `if (rows.length <= 3) { setBatched(true); app.renderer.render(); const u1 = R.domElement.toDataURL('image/jpeg', 0.9); setBatched(false); app.renderer.render(); const u2 = R.domElement.toDataURL('image/jpeg', 0.9); setBatched(true); rows[rows.length-1].shots = [u1, u2]; }` : ''}
  }
  return { px: gl.drawingBufferWidth * gl.drawingBufferHeight, stats: b.stats, rows };
})()`);
let i = 0;
for (const r of out.rows) { if (r.shots) { await writeFile(`${shots}_${level}_${tier}_${style}_pose${i}_batched.jpg`, Buffer.from(r.shots[0].split(',')[1], 'base64')); await writeFile(`${shots}_${level}_${tier}_${style}_pose${i}_sources.jpg`, Buffer.from(r.shots[1].split(',')[1], 'base64')); delete r.shots; } i++; }
console.log(level, tier, style, 'pixels', out.px, JSON.stringify(out.stats));
for (const r of out.rows) console.log(' pose', JSON.stringify(r.pose), 'noise', JSON.stringify(r.noise), 'batched-vs-sources', JSON.stringify(r.diff));
if (c.errors.length) console.log('ERRORS', c.errors);
c.close(); srv.close();
