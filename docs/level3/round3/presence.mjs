// Presence test (docs/level3/ROUND3.md): how many hits WAI takes in N seconds of game time next to ONE creature.
// Usage (after `node docs/level3/bot/prep.mjs works`): node presence.mjs snake|compass|press|limp still|stroll|dodge|counter [sec] [tag]
// still   = WAI stands where he is put, no input at all (his hearts are topped up after each hit so he never smudges).
// counter = the in-page counter brain (counter_brain.js) plays the creature's counter, frame by frame;
// dodge   = the same brain without paint (the creature is never repainted: the dodge alone over the full time);
// stroll  = WAI ignores it but keeps walking 3 m left and right (an attack that only hits a statue is no threat).
// Prints one JSON line: hits, hits per kind of attack, the states seen, paint dealt, whether the creature was repainted.
import fs from 'node:fs';
import { connect, sleep } from '../bot/lib.mjs';
const c = await connect();
const kind = process.argv[2] ?? 'snake';
const mode = process.argv[3] ?? 'still';
const sec = +(process.argv[4] ?? 30);
const tag = process.argv[5] ?? `${kind}-${mode}`;
// F1's entry yard: the creature 5 m from WAI on open floor, no drop near (all other creatures are removed first)
await c.ev(`const s=__WD.app.session; s.debugWarp('legs'); return 1`);
await sleep(1200);
await c.ev(`const s=__WD.app.session; const T3 = { Vector3: s.player.pos.constructor };
  for (const e of s.enemies) if (e !== s.pen && !e.disposed) e.dispose();
  if (s.coop) { s.coop.dispose(); s.coop = null; } // the co-op partner would fight the creature: WAI alone here
  const at = new T3.Vector3(-2, 0, 13.5), me = new T3.Vector3(-2, 0.2, 18.5);
  s.player.teleport(me, Math.PI); s.ctx.camera.yaw = Math.PI; s.player.hp = 6;
  const mod = { press:['/src/enemy/StampPress.ts','StampPress'], snake:['/src/enemy/RulerSnake.ts','RulerSnake'], compass:['/src/enemy/CompassSpinner.ts','CompassSpinner'], limp:['/src/enemy/CrookedLegMutant.ts','CrookedLegMutant'] }['${kind}'];
  const M = await import(mod[0]); const e = new M[mod[1]](s.ctx, 'presence-${kind}', at); e.root.userData.wdPrep?.();
  s.enemies.push(e); e.onFinished = () => {}; window.__pe = e;
  const R = window.__pres = { hits: 0, halfHearts: 0, by: {}, states: {}, t0: s.stats.time, hp0: e.maxHp, words: [] };
  // which attack landed: the comic word the creature pops over WAI right after takeHit
  const comic = s.ctx.effects.comic.bind(s.ctx.effects);
  s.ctx.effects.comic = (p, text, ...rest) => { if (p.distanceTo(s.player.pos) < 3) R.words.push(text); return comic(p, text, ...rest); };
  // the caller of every landed hit (for hits that pop no word)
  const th = s.player.takeHit.bind(s.player);
  s.player.takeHit = (...a) => { const ok = th(...a); if (ok) { const f = (new Error().stack || '').split(String.fromCharCode(10))[2] || ''; R.words.push(f.trim().split(' ')[1] || '?'); } return ok; };
  window.__presOff = s.events.on('player:damaged', ({ hp }) => { R.hits++; R.halfHearts += 6 - hp; setTimeout(() => { const w = R.words.pop() ?? '?'; R.by[w] = (R.by[w] ?? 0) + 1; R.words.length = 0; s.player.hp = 6; }, 30); });
  let last = ''; const tick = () => { if (!window.__pres) return; const st = e.state; if (st !== last) { R.states[st] = (R.states[st] ?? 0) + 1; last = st; } requestAnimationFrame(tick); }; tick();
  WD_AGENT.act({ type: 'stop' }); return 1`);
if (mode === 'counter' || mode === 'dodge' || mode === 'stroll') {
  await c.ev(`window.__counterPaint = ${mode === 'counter'}; window.__counterStroll = ${mode === 'stroll'}; return 1`);
  const brain = fs.readFileSync(new URL('./counter_brain.js', import.meta.url), 'utf8');
  console.log('brain', await c.ev(`return (${brain.replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '')})`));
}
const t0 = Date.now();
let shotN = 0;
for (;;) {
  const r = await c.ev('const s=__WD.app.session; return [s.stats.time - window.__pres.t0, s.player.smudged]');
  if (r[0] >= sec) break;
  if (Date.now() - t0 > (sec * 6 + 60) * 1000) { console.log('wall-clock cap'); break; }
  if (process.env.WD_SHOTS && shotN < 6 && r[0] > 3 + shotN * 5) { await c.shot(`pres-${tag}-${shotN++}`); }
  await sleep(250);
}
const out = await c.ev(`const s=__WD.app.session; const e=window.__pe; const R=window.__pres; window.__pres=null; window.__presOff?.();
  if (window.__counterBot) window.__counterBot.on = false;
  const res = { kind:'${kind}', mode:'${mode}', sec:+(s.stats.time - R.t0).toFixed(1), hits:R.hits, halfHearts:R.halfHearts, by:R.by, states:R.states, paint:+(1 - e.hp / e.maxHp).toFixed(2), repainted: e.harmless, bot: window.__counterBot?.stats ?? null, errs:(window.__errs||[]).slice(-3) };
  WD_AGENT.act({ type: 'stop' }); __WD.app.input.virtualMove.x = __WD.app.input.virtualMove.y = 0; e.dispose(); return res`);
console.log(JSON.stringify(out));
process.exit(0);
