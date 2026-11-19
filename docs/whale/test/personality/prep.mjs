// Load a level fresh with the partner on. Usage: node prep.mjs [plaza|harbor|works] [zh|en] [rules|auto]
import { connect, sleep, VITE } from './lib.mjs';
const c = await connect();
const level = process.argv[2] ?? 'plaza', lang = process.argv[3] ?? 'zh', brain = process.argv[4] ?? 'rules';
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
for (let i = 0; i < 80 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev(`localStorage.setItem('wd.lang','${lang}'); (await import('/src/i18n/index.ts')).setLang('${lang}'); (await import('/src/render/Quality.ts')).Quality.setPref('low'); localStorage.setItem('wd.boons','auto'); WD_COOP.setBrain('${brain}'); WD_COOP.enable(true); document.querySelector('.start-btn').click(); return 1`);
for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
console.log('ready', await st(), await c.ev('return JSON.stringify({lang: document.documentElement.lang, coop: !!WD_COOP.partner, level: __WD.session?.levelId})'));
process.exit(0);
