// Round 3 (docs/level3/PEN_ROUND3.md): hits WAI takes in the Red Pen's sky phase (phase 2: correction marks, swoops,
// blots, tiles). Run prep.mjs works first. Usage: node sky_probe.mjs <gentle|normal|hard> <dodge|still> [gameSec=60] [penHp=0.6]
//   dodge = the fight bot (souls_brain.js: walks off marks, rolls, shouts the Pen down, paints)
//   still = WAI stands where he landed and does nothing
// The Pen's paint is held at penHp of its bar (it never leaves phase 2) and WAI's hearts are topped up (never smudged), so the
// number is hits per minute of sky phase. Prints hits by word, marks volleys placed / cancelled by the Hush, the Eraser n/a.
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [diff = 'gentle', mode = 'dodge', secS = '60', hpS = '0.6'] = process.argv.slice(2);
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player; ${code}`);
await c.ev(`(await import('/src/meta/Difficulty.ts')).Difficulty.set('${diff}'); return 1`);
await ev(`s.debugWarp('roof'); return 1`);
await sleep(1500);
await ev(`s.souls.warpIn(); pen.debugPhase(2); s.ctx.camera.stopCine(); const T3 = p.pos.constructor; p.teleport(pen.arena.clone().add(new T3(3, 0.05, 6)), Math.PI); return 1`);
await sleep(500);
await ev(`window.__sky = { hits: {}, n: 0, volleys: 0, marks: 0, muffled: 0 };
  const H = window.__sky, hit0 = pen.hit.bind(pen);
  pen.hit = (heavy, from, knock, word) => { const ok = hit0(heavy, from, knock, word); if (ok) { H.n++; H.hits[word] = (H.hits[word] || 0) + 1; } return ok; };
  const vol0 = pen.hz.marks.volley.bind(pen.hz.marks);
  pen.hz.marks.volley = (...a) => { const r = vol0(...a); H.volleys++; H.marks += r.length; return r; };
  const can0 = pen.hz.marks.cancel.bind(pen.hz.marks);
  pen.hz.marks.cancel = (m) => { if (!m.cancelled && !m.landed) H.muffled++; can0(m); };
  return 1`);
if (mode === 'dodge') {
  const brain = fs.readFileSync(new URL('./souls_brain.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '');
  console.log('brain', await c.ev(`return (${brain})`));
} else await ev(`__WD.app.agent.enabled = false; return 1`);
const t0 = await ev(`return s.stats.time`);
let shot = 0;
while (true) {
  const o = await ev(`if (pen.hp < pen.maxHp * ${hpS}) pen.hp = pen.maxHp * ${hpS}; if (p.hp < 4) p.hp = 6; if (p.smudged) return { smudged: true };
    return { t: s.stats.time, ph: pen.phase, st: pen.state, sky: window.__sky }`);
  if (o.smudged) { console.log('SMUDGED (should not happen)'); break; }
  if (o.t - t0 > +secS) {
    const min = (o.t - t0) / 60;
    console.log(JSON.stringify({ diff, mode, gameSec: Math.round(o.t - t0), hits: o.sky.n, perMin: +(o.sky.n / min).toFixed(1), byWord: o.sky.hits, volleys: o.sky.volleys, marks: o.sky.marks, muffledByHush: o.sky.muffled, phase: o.ph }));
    break;
  }
  if (process.env.WD_SKYSHOTS && shot < 6 && o.st === 'MARKS') { await c.shot(`sky_${diff}_${mode}_${shot++}`); await sleep(400); }
  await sleep(400);
}
await c.ev('if (window.__soulsBot) window.__soulsBot.on = false; return 1');
process.exit(0);
