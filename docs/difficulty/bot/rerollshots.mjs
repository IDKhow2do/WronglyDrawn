// Screenshots of the boon re-roll pity rule, en + zh: the hand whose re-roll button promises gold (last re-roll,
// no gold shown yet) and the re-rolled hand with its GUARANTEED card. Usage: node rerollshots.mjs (Vite :5194, Chrome :9363)
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
  await c.send('Page.navigate', { url: 'http://localhost:5194/?test&difficulty=normal&level=plaza&style=graffiti' });
  await sleep(1500);
  await c.ev(`localStorage.setItem('wd.lang','${lang}'); localStorage.removeItem('wd.boons'); return 1`);
  await c.send('Page.reload');
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await sleep(1000);
  await c.ev("document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await sleep(3000);
  // one re-roll already spent without gold: the next one is the last and carries the guarantee
  const shown = await c.ev(`const a=__WD.app.arsenal; a.rerolls=1; a.goldSeen=false; __WD.app.offerBoon(); await new Promise(r=>setTimeout(r,900));
    return document.querySelector('.boon-reroll').textContent`);
  console.log(lang, 'button:', shown);
  await save(`reroll-promise-${lang}`);
  const after = await c.ev(`document.querySelector('.boon-reroll').click(); await new Promise(r=>setTimeout(r,1200));
    return [...document.querySelectorAll('.boon-card')].map(b=>b.className).join(' | ') + ' || ' + document.querySelector('.boon-reroll').textContent`);
  console.log(lang, 'after:', after);
  await save(`reroll-guaranteed-${lang}`);
}
process.exit(0);
