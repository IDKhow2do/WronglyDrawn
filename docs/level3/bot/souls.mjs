// The souls-like Red Pen fight, played by the in-page bot (souls_brain.js). Usage: node souls.mjs [roof|none] [maxSec] [difficulty]
// `roof` warps to the top of the roof stair (outside the ink gate); `none` assumes the session is already there (w3bot hands over).
// The bot aims by turning the camera (never Y). Logs milestones + the bot's stats; screenshots to $WD_SHOTS (default /tmp/wd-l3/shots) as souls_bot_*.jpg.
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const start = process.argv[2] ?? 'roof';
const maxSec = +(process.argv[3] ?? 600);
const diff = process.argv[4];
const t0 = Date.now();
const log = (...a) => console.log(((Date.now() - t0) / 1000).toFixed(0).padStart(4) + 's', ...a);
if (diff) await c.ev(`(await import('/src/meta/Difficulty.ts')).Difficulty.set('${diff}'); return 1`);
if (start === 'roof') { await c.ev(`__WD.app.session.debugWarp('roof'); return 1`); await sleep(1500); }
const brain = fs.readFileSync(new URL('./souls_brain.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '');
log('brain', await c.ev(`return (${brain})`));
const marks = {};
const mark = async (k, txt) => { if (!marks[k]) { marks[k] = Math.round((Date.now() - t0) / 1000); log(txt); await c.shot('souls_bot_' + k); } };
let lastLog = 0;
while ((Date.now() - t0) / 1000 < maxSec) {
  const o = await c.ev(`const s=__WD.app.session, pen=s.pen, b=window.__soulsBot;
    return { mode: s.souls.mode, st: pen.state, ph: pen.phase, hp: Math.round(pen.hp / pen.maxHp * 1000) / 10, wai: s.player.hp, stam: Math.round(s.souls.stamina.value),
      done: s.bossDone, complete: s.completed, stats: b?.stats, last: b?.last, errs: (window.__errs||[]).slice(-3), diff: (await import('/src/meta/Difficulty.ts')).Difficulty.id }`);
  if (o.mode === 'on') await mark('fight', `fight on (${o.diff})`);
  if (o.ph >= 2) await mark('ph2', 'phase 2');
  if (o.ph >= 3) await mark('ph3', 'phase 3');
  if (o.st === 'FINAL') await mark('final', 'FINAL');
  if (o.done) await mark('won', 'the Red Pen DRAWS');
  if (o.complete) { await mark('complete', 'LEVEL COMPLETE'); break; }
  if (Date.now() - lastLog > 5000) { lastLog = Date.now(); log(o.mode, o.st, 'ph' + o.ph, o.hp + '%', 'wai', o.wai, 'stam', o.stam, '|', o.last, o.errs.length ? 'ERRS ' + JSON.stringify(o.errs) : ''); }
  await sleep(500);
}
const end = await c.ev(`const s=__WD.app.session; return { stats: window.__soulsBot?.stats, log: window.__soulsBot?.log.slice(-25), time: s.stats.time, smudges: s.stats.smudges, errs: (window.__errs||[]).slice(-5) }`);
await c.ev('if (window.__soulsBot) window.__soulsBot.on = false; return 1');
log('END marks', JSON.stringify(marks), 'stats', JSON.stringify(end.stats), 'game time', end.time.toFixed(0), 'smudges', end.smudges, 'errs', JSON.stringify(end.errs));
log('tail', JSON.stringify(end.log));
process.exit(0);
