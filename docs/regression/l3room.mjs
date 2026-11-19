// Level 3: the Index crowd's home room (docs/regression/FIXES_L23.md). Run after `node ../level3/bot/prep.mjs works`.
//   compass (default): warp to the Index (gate open), repaint the snake + press, then
//     A. lure: WAI wakes the Index compass and walks out through the gate into the Reading Room; the compass must stay in
//        the Index (x > 10) and give up when WAI is far out;
//     B. pulled out: the compass is put at the regression's stall spot (9.6, 1.5) on the Reading Room side, WAI goes back
//        into the Index; it must walk home through the gate (z 7.9–11.1 at x 10), and the arrow must route via the gate.
//   others: the Ruler Snake and the Stamp Press are put outside the same way (WAI in the Index); both must walk in by the gate.
// Positions every 100 ms (page clock). Usage: WD_CDP=9382 WD_VITE=5282 node docs/regression/l3room.mjs [compass|others]
import { connect, sleep } from '../level3/bot/lib.mjs';

const mode = process.argv[2] ?? 'compass';
const c = await connect();
const act = (a) => c.ev(`return WD_AGENT.act(${JSON.stringify(a)})`);
const log = (...a) => console.log(...a);
await c.ev(`__WD.app.session.debugWarp('index'); return 1`);
await sleep(2500);
const ids = mode === 'compass' ? ['w3-compass-index'] : ['w3-snake-index', 'w3-press-index'];
const others = ['w3-compass-index', 'w3-snake-index', 'w3-press-index'].filter((i) => !ids.includes(i));
await c.ev(`const s = __WD.app.session; for (const id of ${JSON.stringify(others)}) s.enemies.find((e) => e.id === id).debugRepaint(); return 1`);
log('gate open', await c.ev('return __WD.app.session.built.archive.gate.open'));

// page-side sampler: creature positions + state, WAI, the arrow
await c.ev(`
  window.__room = []; const s = __WD.app.session, t0 = performance.now(); clearInterval(window.__roomT);
  const es = ${JSON.stringify(ids)}.map((id) => s.enemies.find((e) => e.id === id));
  window.__roomT = setInterval(() => {
    s.player.hp = Math.max(s.player.hp, 4); // the test is about where they walk, not WAI's health
    const g = s.guide.target, p = s.player.pos;
    window.__room.push({ t: +((performance.now() - t0) / 1000).toFixed(1), p: [+p.x.toFixed(1), +p.z.toFixed(1)], g: g ? [+g.x.toFixed(1), +g.z.toFixed(1)] : null,
      e: es.map((e) => ({ id: e.id, x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), st: e.state })) });
  }, 100);
  return 1`);
const mark = (label) => c.ev(`window.__room.push({ mark: ${JSON.stringify(label)} }); return 1`);
const walk = async (x, z, maxS) => {
  for (let t = 0; t < maxS * 4; t++) {
    const p = await c.ev('const p = __WD.app.session.player.pos; return [p.x, p.z]');
    if (Math.hypot(p[0] - x, p[1] - z) < 0.9) break;
    await act({ type: 'move_to', x, z, run: true });
    await sleep(250);
  }
  await act({ type: 'stop' });
};
/** Put a creature at (x, z) on F3 as if shoved there. */
const putAt = (id, x, z) => c.ev(`const e = __WD.app.session.enemies.find((e) => e.id === '${id}'); const y = 18;
  e.body.setTranslation({ x: ${x}, y: y + e.cOff + 0.05, z: ${z} }, true); e.body.setNextKinematicTranslation({ x: ${x}, y: y + e.cOff + 0.05, z: ${z} });
  e.pos.set(${x}, y, ${z}); e.prevPos.copy(e.pos); return [e.pos.x, e.pos.z, e.state]`);

if (mode === 'compass') {
  await mark('A. lure: WAI walks up to the compass, then out through the gate into the Reading Room');
  await walk(14.5, 9.5, 6);
  await sleep(1500);
  await walk(12, 9.5, 5);
  await walk(8, 9.5, 5);
  await walk(3, 7, 6);
  await sleep(4000);
  await walk(0, 4, 6);
  await sleep(6000);
  await mark('B. pulled out: compass put at (9.6, 1.5), Reading Room side; WAI walks back into the Index to (19.9, 7.9)');
  await walk(8, 9.5, 8);
  await walk(13, 9.5, 5);
  log('put', JSON.stringify(await putAt('w3-compass-index', 9.6, 1.5)));
  await walk(19.9, 7.9, 6);
  await sleep(16000);
} else {
  await mark('C. snake put at (6, 3) and press at (7, 14), Reading Room side; WAI in the Index at (19, 0)');
  await walk(19, 0, 10);
  log('put', JSON.stringify(await putAt('w3-snake-index', 6, 3)), JSON.stringify(await putAt('w3-press-index', 7, 14)));
  await sleep(20000);
}
const rows = await c.ev('clearInterval(window.__roomT); return window.__room');
let outside = {}, crossedWall = 0;
const prev = {};
for (const r of rows) {
  if (r.mark) { log('---', r.mark); continue; }
  for (const e of r.e) {
    // crossing x 10 anywhere but the gate (z 7.9–11.1) would be through the catalogue wall
    const q = prev[e.id];
    if (q && (q.x - 10) * (e.x - 10) < 0 && !(e.z > 7.9 && e.z < 11.1)) crossedWall++;
    prev[e.id] = e;
    if (e.x < 10) outside[e.id] = (outside[e.id] ?? 0) + 1;
  }
  log(`${r.t.toFixed(1).padStart(5)}s WAI ${JSON.stringify(r.p)} arrow ${JSON.stringify(r.g)} ` + r.e.map((e) => `${e.id.replace('w3-', '')} (${e.x.toFixed(2)}, ${e.z.toFixed(2)}) ${e.st}`).join('  '));
}
const last = rows.filter((r) => !r.mark).at(-1);
log('samples outside the Index (x < 10):', JSON.stringify(outside), '· crossings of x 10 outside the gate:', crossedWall);
log('end:', last.e.map((e) => `${e.id} (${e.x}, ${e.z}) ${e.st} ${e.x > 10 ? 'IN the Index' : 'OUTSIDE'}`).join(' · '));
process.exit(0);
