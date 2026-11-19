// Entrance-shot proof (docs/level3/ROUND3.md job 2): load Limp Works fresh, press start, and screenshot the opening every
// 0.3 s (wall clock) with the camera position, so a frame that clips through the tower wall shows up.
// Usage: node entrance.mjs [tag] [seconds]   → $WD_SHOTS/entrance-<tag>/NNN.jpg and cams.json
import fs from 'node:fs';
import { connect, sleep, VITE } from '../bot/lib.mjs';
const c = await connect();
const tag = process.argv[2] ?? 'after';
const sec = +(process.argv[3] ?? 18);
const dir = `${process.env.WD_SHOTS ?? '/tmp/wd-r3/shots'}/entrance-${tag}`;
fs.mkdirSync(dir, { recursive: true });
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=works` });
for (let i = 0; i < 80 && (await st()) !== 'TITLE'; i++) await sleep(500);
await sleep(1500);
await c.ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
const cams = [];
const t0 = Date.now();
for (let i = 0; (Date.now() - t0) / 1000 < sec; i++) {
  const due = t0 + i * 300;
  if (Date.now() < due) await sleep(due - Date.now());
  const cam = await c.ev(`const a=__WD.app; const p=a.camera.camera.position; const s=a.session; return { st: a.state, cam: [p.x,p.y,p.z].map(v=>+v.toFixed(2)), wai: s ? s.player.pos.toArray().map(v=>+v.toFixed(2)) : null, cine: !!a.camera.inCine }`).catch((e) => ({ err: String(e).slice(0, 80) }));
  const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 });
  const name = String(i).padStart(3, '0');
  fs.writeFileSync(`${dir}/${name}.jpg`, Buffer.from(r.result.data, 'base64'));
  cams.push({ i, t: +((Date.now() - t0) / 1000).toFixed(2), ...cam });
}
fs.writeFileSync(`${dir}/cams.json`, JSON.stringify(cams, null, 0).replace(/},{/g, '},\n{'));
console.log(dir, cams.length, 'frames');
process.exit(0);
