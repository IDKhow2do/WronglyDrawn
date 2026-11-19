// Load a level fresh on :5300 / :9400 and inject the probe. Usage: node load.mjs plaza|harbor|works [warp]
import fs from 'node:fs';
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
const { connect, sleep, VITE } = await import('<local-path>');
const c = await connect();
const level = process.argv[2] ?? 'plaza';
const warp = process.argv[3] ?? '';
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
for (let i = 0; i < 120 && (await st()) !== 'PLAYING'; i++) await sleep(500);
for (let i = 0; i < 120 && (await c.ev("return document.querySelector('.hud').classList.contains('hidden')")); i++) await sleep(500);
if (warp) {
  await c.ev(`__WD.session.debugWarp('${warp}'); return 1`);
  await sleep(2500);
}
await c.ev(fs.readFileSync('/tmp/wd-cam/probe.js', 'utf8') + '; return 1');
console.log('ready', await st(), level, warp);
process.exit(0);
