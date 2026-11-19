// Level 2: log the guide arrow's target every 100 ms from the Mouth's purification to the bell gate (docs/regression/FIXES_L23.md).
// Run after `node ../level2-expansion/bot/prep.mjs harbor`; it starts a page-side sampler, runs `h2bot.mjs mouth --walk`
// in a child process, then prints the samples. Usage: WD_CDP=9382 WD_VITE=5282 node docs/regression/l2arrow.mjs [x z]
// With x z: the moment WAI picks up the corrupted Mouth he is put at (x, z) (24 38 = beside the Chomper Bin, where the
// regression saw the arrow swing south), so the purification happens there.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { connect } from '../level2-expansion/bot/lib.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const c = await connect();
await c.ev(`
  window.__arrow = [];
  const s = __WD.app.session, t0 = performance.now();
  clearInterval(window.__arrowT);
  const at = ${JSON.stringify(process.argv.slice(2, 4).map(Number))}; let put = at.length < 2;
  window.__arrowT = setInterval(() => {
    const g = s.guide.target, p = s.player.pos, m = s.inventory.get('MOUTH');
    if (!put && m?.corrupted) { put = true; T.tp(at[0], 0.8, at[1]); window.__arrow.push({ t: 0, g: null, p: at, area: 'PUT', mouth: 'corrupted', gate: false }); }
    window.__arrow.push({ t: +((performance.now() - t0) / 1000).toFixed(1), g: g ? [g.x, g.z].map((v) => +v.toFixed(1)) : null,
      p: [p.x, p.z].map((v) => +v.toFixed(1)), area: s.guide.area(p), mouth: !m ? 'none' : m.corrupted ? 'corrupted' : 'clean', gate: s.level.gateOpen });
  }, 100);
  return 1`);
try {
  execFileSync('node', [path.join(here, '../level2-expansion/bot/h2bot.mjs'), 'mouth', '--walk'], { stdio: 'inherit', env: process.env });
} finally {
  const rows = await c.ev('clearInterval(window.__arrowT); return window.__arrow');
  const i0 = rows.findIndex((r) => r.mouth === 'clean');
  const i1 = rows.findIndex((r, i) => i > i0 && Math.hypot(r.p[0] - 2, r.p[1] - 33.5) < 3.5);
  console.log(`samples ${rows.length}; purified at row ${i0} (t ${rows[i0]?.t}); at the gate at row ${i1} (t ${rows[i1]?.t})`);
  let off = 0;
  for (const r of rows.slice(Math.max(0, i0), i1 < 0 ? undefined : i1 + 1)) {
    // the bell gate's arrow points at the bell (2, 31.2); anything else after the purification is a detour
    const ok = r.g && Math.hypot(r.g[0] - 2, r.g[1] - 31.2) < 0.5;
    if (!ok) off++;
    console.log(`${r.t.toFixed(1).padStart(6)}s  guide ${JSON.stringify(r.g)}  WAI ${JSON.stringify(r.p)}  ${r.area}  mouth ${r.mouth}${r.gate ? '  GATE OPEN' : ''}${ok ? '' : '  <-- not the bell'}`);
  }
  console.log(off ? `DETOUR: ${off} samples not at the bell` : 'NO DETOUR: every sample points at the bell (2, 31.2)');
  process.exit(0);
}
