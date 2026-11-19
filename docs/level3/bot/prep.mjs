// Load a level fresh. Usage: node prep.mjs [harbor|plaza] [style]
import { connect, sleep, VITE } from './lib.mjs';
const c = await connect();
const level = process.argv[2] ?? 'harbor';
const style = process.argv[3] ?? '';
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}${style ? '&style=' + style : ''}` });
for (let i = 0; i < 80 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
console.log('ready', await st());
process.exit(0);
