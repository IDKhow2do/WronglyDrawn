// Repeat the deck crossing N times from the market landing; log each leg's result and splashes.
import { connect, sleep } from './lib.mjs';
const { ev } = await connect();
const N = Number(process.argv[2] ?? 3);
const act = (c) => ev(`return WD_AGENT.act(${JSON.stringify(c)})`);
const P = () => ev('return __WD.session.player.pos.toArray()');
const sp = await ev('const s=__WD.session.level.spots; return {e:[s.pontoonEast.x,s.pontoonEast.z], w:[s.pontoonWest.x,s.pontoonWest.z], d:s.decks.map(v=>[v.x,v.y,v.z])}');
const legs = [...sp.d.map((v) => [v[0], v[2], v[1]]), [sp.w[0] - 1.2, sp.w[1], 1.5]];
for (let r = 0; r < N; r++) {
  await ev(`T.tp(${sp.e[0] + 1.5}, 0.8, ${sp.e[1]}, -Math.PI/2); return 1`); await sleep(600);
  for (const [i, [x, z, y]] of legs.entries()) {
    let jumped = false, ok = false; const t0 = Date.now(); const trail = [];
    while (Date.now() - t0 < 12000) {
      const p = await P(); trail.push(p.map((v) => +v.toFixed(2)));
      const d = Math.hypot(p[0] - x, p[2] - z);
      if (d < 0.9 && p[1] > y - 0.3) { ok = true; break; }
      await act({ type: 'move_to', x, z, run: false });
      if (!jumped && d < (i === legs.length - 1 ? 2.6 : 2.1)) { jumped = true; await act({ type: 'jump' }); }
      if (jumped && d > 3.2) jumped = false;
      await sleep(60);
    }
    console.log(`run ${r} leg ${i + 1}`, ok ? 'ok' : 'FAIL', ((Date.now() - t0) / 1000).toFixed(1) + 's', ok ? '' : JSON.stringify(trail.filter((_, k) => k % 4 === 0).slice(-25)));
    if (!ok) break;
  }
}
await act({ type: 'stop' });
console.log('errs', JSON.stringify(await ev('return (window.__errs||[]).slice(-3)')));
process.exit(0);
