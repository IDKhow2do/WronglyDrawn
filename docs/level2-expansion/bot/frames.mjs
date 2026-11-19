// Frame strip of a cut-in. The game loop is stopped the moment the cut-in starts; then __WD.advance steps it
// deterministically and each frame is captured. Usage:
//   node frames.mjs NAME "<js that arms the trigger: call window.__freeze() when the cine starts>" "<js that starts the action>"
// Times: 1/60, then every 0.1 s to 1.0 s, then every 0.5 s to END (env END, default 6).
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [name, arm, go] = process.argv.slice(2);
const END = Number(process.env.END ?? 6);
const dir = `/tmp/wd-l2x/shots/${name}`;
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
await c.ev(`window.__frozen = 0; window.__freeze = () => { if (window.__frozen) return; window.__frozen = 1; __WD.app.loop.stop(); }; ${arm}; return 1`);
await c.ev(`${go}; return 1`);
for (let i = 0; i < 600 && !(await c.ev('return window.__frozen')); i++) await sleep(50);
if (!(await c.ev('return window.__frozen'))) { console.log('never triggered'); process.exit(1); }
const times = [1 / 60];
for (let k = 1; k <= 10; k++) times.push(k / 10);
for (let k = 1.5; k <= END + 1e-6; k += 0.5) times.push(k);
let t = 0;
const sh = [];
for (const at of times) {
  await c.ev(`__WD.advance(${at - t}); return 1`);
  t = at;
  const f = `${dir}/f${String(sh.length).padStart(2, '0')}.jpg`;
  const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 80 });
  fs.writeFileSync(f, Buffer.from(r.result.data, 'base64'));
  const cam = await c.ev('const p=__WD.app.camera.camera.position; return [p.x,p.y,p.z].map(v=>+v.toFixed(2))').catch(() => null);
  sh.push(f);
  console.log(at.toFixed(2), JSON.stringify(cam));
}
await c.ev('__WD.app.loop.start(); return 1');
// first second (11 frames) + the rest, 6 per row, with the time burnt in
const lab = (i) => times[i].toFixed(2) + 's';
for (let i = 0; i < sh.length; i++)
  execSync(`ffmpeg -loglevel error -y -i ${sh[i]} -vf "scale=426:-1,drawtext=text='${lab(i)}':x=8:y=8:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6" ${dir}/s${String(i).padStart(2, '0')}.jpg`);
const rows = Math.ceil(sh.length / 6);
execSync(`ffmpeg -loglevel error -y -framerate 1 -i ${dir}/s%02d.jpg -vf "tile=6x${rows}:color=black" -frames:v 1 /tmp/wd-l2x/shots/${name}_strip.jpg`);
console.log(`/tmp/wd-l2x/shots/${name}_strip.jpg`);
process.exit(0);
