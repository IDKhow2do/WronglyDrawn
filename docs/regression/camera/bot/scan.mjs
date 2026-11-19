// Jitter scan. Usage: node scan.mjs <level> <tag> [spotsFile]
//  without spotsFile: picks a seeded sample from window.__cands (run cands.js first) and saves it to spots-<level>.json
import fs from 'node:fs';
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
const { connect } = await import('<local-path>');
const c = await connect();
const [level, tag, spotsFile] = process.argv.slice(2);
let spots;
if (spotsFile) spots = JSON.parse(fs.readFileSync(spotsFile, 'utf8'));
else {
  const cands = (await c.ev("return window.__cands")).filter((q) => q.p[1] > -1);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
  spots = [...pick(cands.filter((q) => q.corner), 40), ...pick(cands.filter((q) => !q.corner), 15)].map((q) => q.p);
  fs.writeFileSync(`/tmp/wd-cam/spots-${level}.json`, JSON.stringify(spots));
}
await c.ev(fs.readFileSync('/tmp/wd-cam/probe.js', 'utf8') + '; return 1');
await c.ev('__cam.freeze(); return 1');
const res = [];
for (const sp of spots) {
  const r = await c.ev(`const sp=${JSON.stringify(sp)}; const o=[];
    for (let k=0;k<8;k++){ const yaw=k/8*Math.PI*2; const at=__cam.place(sp[0],sp[1],sp[2],yaw);
      __cam.run(20,{keepHp:true}); const still=__cam.run(45,{keepHp:true}); const sw=__cam.run(75,{keepHp:true,sweep:0.4});
      const moved=Math.hypot(sw.end[0]-at[0],sw.end[2]-at[2]);
      o.push({yaw:+yaw.toFixed(2), moved:+moved.toFixed(2), still:still.m, sweep:sw.m}); }
    return o;`);
  const ok = r.filter((q) => q.moved < 0.3);
  const worst = ok.reduce((m, q) => Math.max(m, q.still.jit, q.sweep.jit), 0);
  const flips = ok.reduce((m, q) => Math.max(m, q.still.flips, q.sweep.flips), 0);
  const maxStep = ok.reduce((m, q) => Math.max(m, q.still.maxStep, q.sweep.maxStep), 0);
  const closeMin = ok.reduce((m, q) => Math.min(m, q.still.closeMin, q.sweep.closeMin), 99);
  res.push({ sp, worst: +worst.toFixed(1), flips, maxStep, closeMin, valid: ok.length, yaws: r });
  console.log(JSON.stringify({ sp, worst: +worst.toFixed(1), flips, maxStep, closeMin, valid: ok.length }));
}
fs.writeFileSync(`/tmp/wd-cam/scan-${level}-${tag}.json`, JSON.stringify(res));
process.exit(0);
