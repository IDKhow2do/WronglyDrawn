// Attack stills (docs/level3/ROUND3.md job 1): one creature in F1's yard, WAI standing 5 m off; at each moment of its
// attack the game drops into slow motion and the frame is saved. Usage: node attackshots.mjs snake|compass [tag]
//   snake:   tell (red line, ticks racing), lock (line locked), whip (the hit: strike mark), rest (stretched out)
//   compass: plant (preview circle), spin (pencil half way), close (the circle closes on WAI: fill, hatching, screen circle)
import { connect, sleep } from '../bot/lib.mjs';
const c = await connect();
const kind = process.argv[2] ?? 'snake';
const tag = process.argv[3] ?? 'after';
const MOMENTS = {
  snake: [['tell', 'SNAP_TELL', 0.45], ['lock', 'SNAP_TELL', 0.95], ['whip', 'SNAP', 0.12], ['rest', 'REST', 0.5]],
  compass: [['plant', 'PLANT', 0.6], ['spin', 'SPIN', 1.1], ['close', 'CIRCLE', 0.06], ['after', 'CIRCLE', 0.7]],
}[kind];
await c.ev(`const s=__WD.app.session; const T3={Vector3:s.player.pos.constructor}; s.debugWarp('legs');
  for (const e of s.enemies) if (e !== s.pen && !e.disposed) e.dispose(); if (s.coop) { s.coop.dispose(); s.coop=null; }
  s.player.teleport(new T3.Vector3(-2, 0.2, 18.5), Math.PI); s.ctx.camera.yaw = Math.PI;
  const mod = { snake:['/src/enemy/RulerSnake.ts','RulerSnake'], compass:['/src/enemy/CompassSpinner.ts','CompassSpinner'] }['${kind}'];
  const M = await import(mod[0]); const e = new M[mod[1]](s.ctx, 'shot-${kind}', new T3.Vector3(-2, 0, 13.5)); e.root.userData.wdPrep?.();
  s.enemies.push(e); window.__ae = e; s.events.on('player:damaged', () => setTimeout(() => (s.player.hp = 6), 600));
  window.__moment = null; return 1`);
for (const [name, state, at] of MOMENTS) {
  // the page watches for the moment and freezes time there (slow motion), then we take the frame
  await c.ev(`const s=__WD.app.session, e=window.__ae; window.__moment='wait';
    const w = () => { if (window.__moment !== 'wait') return; if (e.state === '${state}' && e.stateT >= ${at}) { s.ctx.time.slowmo(0.02, 6); window.__moment = 'hit'; return; } requestAnimationFrame(w); }; w(); return 1`);
  for (let i = 0; i < 160 && (await c.ev('return window.__moment')) !== 'hit'; i++) await sleep(150);
  await sleep(120);
  console.log(name, await c.shot(`attack-${kind}-${name}-${tag}`));
  await c.ev(`__WD.app.session.ctx.time.slowmo(1, 0.01); return 1`);
}
await c.ev('window.__ae.dispose(); return 1');
process.exit(0);
