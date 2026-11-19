// Screenshots of the first-run difficulty picker and the pause row, in English and Chinese.
// Usage: node shots.mjs   (no-HMR Vite on :5194, headless Chrome on :9363). Writes docs/difficulty/*.jpg
import fs from 'node:fs';
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const OUT = new URL('..', import.meta.url).pathname;
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const save = async (name) => {
  const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 });
  fs.writeFileSync(`${OUT}${name}.jpg`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
await c.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
for (const lang of ['en', 'zh']) {
  // a first-time player: no stored choice, no ?test
  await c.send('Page.navigate', { url: 'http://localhost:5194/?level=plaza&style=graffiti' });
  await sleep(1500);
  await c.ev(`localStorage.removeItem('wd.difficulty'); localStorage.setItem('wd.lang','${lang}'); localStorage.setItem('wd.boons','auto'); return 1`);
  await c.send('Page.reload');
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await sleep(1500);
  await c.ev("document.querySelector('.start-btn').click(); return 1");
  await sleep(900);
  await save(`picker-${lang}`);
  // pick MARKER (preselected) and go
  await c.ev("document.querySelector('.diff-go').click(); return 1");
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  await sleep(9000);
  await c.ev("window.__WD.app.setPaused(true); return 1");
  await sleep(800);
  await save(`pause-${lang}`);
  console.log(lang, 'stored', await c.ev("return localStorage.getItem('wd.difficulty')"));
}
process.exit(0);
