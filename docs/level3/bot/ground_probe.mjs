// Round 3: how busy the Red Pen is in a ground phase (docs/level3/PEN_ROUND3.md). Run prep.mjs works first.
// Usage: node ground_probe.mjs <gentle|normal|hard> [phase=1] [gameSec=60]. The fight bot plays; the Pen's paint is held in the
// phase. Prints the share of game time it spends walking between moves (IDLE), moves started per minute, hits on WAI.
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [diff = 'normal', phS = '1', secS = '60'] = process.argv.slice(2);
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player; ${code}`);
await c.ev(`(await import('/src/meta/Difficulty.ts')).Difficulty.set('${diff}'); return 1`);
await ev(`s.debugWarp('roof'); return 1`);
await sleep(1500);
await ev(`s.souls.warpIn(); if (${phS} > 1) pen.debugPhase(${phS}); s.ctx.camera.stopCine(); const T3 = p.pos.constructor; p.teleport(pen.arena.clone().add(new T3(3, 0.05, 6)), Math.PI); return 1`);
await sleep(+phS > 2 ? 5000 : 500);
const brain = fs.readFileSync(new URL('./souls_brain.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '');
await c.ev(`return (${brain})`);
await ev(`const G = window.__ground = { idle: 0, all: 0, moves: 0, hits: 0, last: pen.state };
  const hit0 = pen.hit.bind(pen); pen.hit = (...a) => { const ok = hit0(...a); if (ok) G.hits++; return ok; };
  let t = performance.now(); const f = () => { if (!window.__ground) return; requestAnimationFrame(f); const now = performance.now(), dt = Math.min(0.1, (now - t) / 1000); t = now;
    if (s.paused || s.souls.mode !== 'on') return; G.all += dt; if (pen.state === 'IDLE') G.idle += dt;
    if (pen.state !== G.last && G.last === 'IDLE') G.moves++; G.last = pen.state; }; f(); return 1`);
const t0 = await ev(`return s.stats.time`);
while (true) {
  const o = await ev(`const lo = [0, 0.7, 0.36, 0.06][${phS}]; if (pen.hp < pen.maxHp * lo) pen.hp = pen.maxHp * lo; if (p.hp < 3) p.hp = 6; return { t: s.stats.time, g: window.__ground, ph: pen.phase }`);
  if (o.t - t0 > +secS) {
    console.log(JSON.stringify({ diff, phase: o.ph, gameSec: Math.round(o.t - t0), idleShare: +(o.g.idle / o.g.all).toFixed(2), movesPerMin: +(o.g.moves / (o.g.all / 60)).toFixed(1), hits: o.g.hits }));
    break;
  }
  await sleep(500);
}
await c.ev('window.__ground = null; if (window.__soulsBot) window.__soulsBot.on = false; return 1');
process.exit(0);
