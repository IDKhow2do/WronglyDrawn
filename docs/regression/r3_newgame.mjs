// Spot check (docs/REGRESSION.md, round 3): a first-ever new game from the title WITHOUT ?test:
// TITLE → setup screen (SetupScreen) → LET'S DRAW → intro book → SKIP → level card → PLAYING. Console errors and uncaught
// exceptions are collected over CDP for the whole flow. Usage: node r3_newgame.mjs <en|zh>   (WD_CDP / WD_VITE / WD_SHOTS set)
// It clears this origin's localStorage first (the regression profile only), so the setup screen is owed again.
import { connect, sleep, VITE } from '../level3/bot/lib.mjs';
const lang = process.argv[2] ?? 'en';
const c = await connect();
const errs = [];
const on0 = c.ws.onmessage;
c.ws.onmessage = (m) => {
  on0(m);
  const d = JSON.parse(m.data);
  if (d.method === 'Runtime.exceptionThrown') errs.push('EXC ' + (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
  if (d.method === 'Runtime.consoleAPICalled' && (d.params.type === 'error' || d.params.type === 'assert')) errs.push('ERR ' + d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errs.push('LOG ' + d.params.entry.text.slice(0, 300) + ' ' + (d.params.entry.url ?? ''));
};
await c.send('Runtime.enable');
await c.send('Log.enable');
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const vis = (sel) => c.ev(`const e = document.querySelector('${sel}'); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0`).catch(() => false);
const wait = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return (Date.now() - t0) / 1000; await sleep(200); } return null; };
const steps = [];
const step = async (name, ok) => { steps.push([name, ok]); await c.shot(`r3_newgame_${lang}_${steps.length}_${name}`); };

await c.send('Page.navigate', { url: `${VITE}/` });
await sleep(1500);
await c.ev(`localStorage.clear(); localStorage.setItem('wd.lang', '${lang}'); return 1`);
await c.send('Page.navigate', { url: `${VITE}/` });
await step('title', await wait(async () => (await st()) === 'TITLE' && (await vis('.start-btn')), 40000));
await c.ev(`document.querySelector('.start-btn').click(); return 1`);
await step('setup', await wait(() => vis('.setup-screen')));
const setupText = await c.ev(`return document.querySelector('.setup-screen')?.innerText.replace(/\\s+/g, ' ').slice(0, 220)`);
await c.ev(`document.querySelector('.setup-screen .su-go').click(); return 1`);
await step('intro', await wait(() => vis('.sb-skip')));
await sleep(1200); // SKIP_ARM_SEC = 0.8
await c.ev(`document.querySelector('.sb-skip').click(); return 1`);
const card = await wait(async () => (await st()) === 'INTRO' || (await st()) === 'PLAYING');
await step('card', card);
const playing = await wait(async () => (await st()) === 'PLAYING', 30000);
await sleep(1500);
await step('playing', playing);
const store = await c.ev(`return { setup: localStorage.getItem('wd.setup'), story: localStorage.getItem('wd.story'), lang: document.documentElement.lang, diff: localStorage.getItem('wd.difficulty'), state: __WD.state, level: __WD.session?.levelId }`);
console.log(JSON.stringify({ lang, steps, setupText, store, errs }, null, 1));
process.exit(0);
