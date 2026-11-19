// Gold boons carried between levels: finish level 1 holding the Golden Stamp → level 2 starts holding it (and ENCORE
// works) → a reload between levels keeps it → a new game (clearCarried) drops it. Usage: node carry.mjs
// (Vite :5194, Chrome :9363). `?test&carry` turns carrying on for a test URL.
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const load = async (level) => {
  await c.send('Page.navigate', { url: `http://localhost:5194/?test&carry&difficulty=normal&level=${level}&style=graffiti` });
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev("localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await sleep(800);
};
const held = () => c.ev("const a=__WD.app.arsenal; return {level: __WD.app.levelId, boons:[...a.boons], encoreOn: (await import('/src/meta/Progression.ts')).REWARDS.encore, carriedNow: a.carriedNow.map(b=>b.id), stored: localStorage.getItem('wd.carried.v1'), toasts:[...document.querySelectorAll('.toast')].map(t=>t.textContent)}");
const offered = () => c.ev("const a=__WD.app.arsenal; const seen=new Set(); for(let i=0;i<300;i++) for(const b of a.rollBoons(3).hand) seen.add(b.id); return seen.has('encore')");

await c.send('Page.navigate', { url: 'http://localhost:5194/?test&carry' });
await sleep(1500);
await c.ev("localStorage.removeItem('wd.carried.v1'); return 1");
await load('plaza');
await c.ev("__WD.app.arsenal.takeBoon('encore'); __WD.app.arsenal.takeBoon('pressure'); __WD.session.events.emit('level:complete', {}); return 1");
console.log('1. level 1 complete, holding', JSON.stringify(await held()));
await c.ev("__WD.app.startLevel('harbor'); return 1");
for (let i = 0; i < 60 && (await c.ev('return __WD.app.levelId')) !== 'harbor'; i++) await sleep(500);
for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
await sleep(2500);
console.log('2. level 2 start', JSON.stringify(await held()), 'encore still offered?', await offered());
await load('harbor');
console.log('3. after a reload', JSON.stringify(await held()));
await c.ev('__WD.app.arsenal.clearCarried(); return 1');
await load('plaza');
console.log('4. new game (cleared)', JSON.stringify(await held()));
process.exit(0);
