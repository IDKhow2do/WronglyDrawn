// Frame cost in the souls fight's busiest moment: ink pools on the roof, then a SWEEP (the 14 m body swinging), lock-on on.
// Reports draw calls / triangles (mean, max) and frame times (mean, worst) over the swing. Usage: node souls_perf.mjs
import { connect, sleep } from './lib.mjs';
const c = await connect();
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, T3=p.pos.constructor; ${code}`);
await ev(`s.debugWarp('boss'); return 1`);
await sleep(2500);
const measure = (label, sec) => ev(`const R=__WD.app.renderer.renderer; R.info.autoReset=false; let calls=0, tris=0, maxC=0, maxT=0, n=0, worst=0, last=performance.now(); const t0=last;
  await new Promise(r=>requestAnimationFrame(r)); R.info.reset(); last=performance.now();
  while (performance.now()-t0 < ${sec * 1000}) { await new Promise(r=>requestAnimationFrame(r)); const now=performance.now(); worst=Math.max(worst, now-last); last=now;
    calls+=R.info.render.calls; tris+=R.info.render.triangles; maxC=Math.max(maxC,R.info.render.calls); maxT=Math.max(maxT,R.info.render.triangles); R.info.reset(); n++; }
  R.info.autoReset=true;
  return { label: '${label}', frames: n, calls: Math.round(calls/n), maxCalls: maxC, ktris: Math.round(tris/n/1000), maxKtris: Math.round(maxT/1000), msMean: +((last-t0)/n).toFixed(1), msWorst: +worst.toFixed(1), state: pen.state }`);
console.log(JSON.stringify(await measure('roof, Pen idle', 2)));
await ev(`p.teleport(pen.arena.clone().add(new T3(0, 0.05, 7))); pen.ground.start('splat', p); return 1`);
await sleep(2600);
await ev(`pen.ground.start('sweep', p); return 1`);
console.log(JSON.stringify(await measure('pools + SWEEP (tell → swing → sprawl)', 3)));
await ev(`pen.debugPhase(2); return 1`);
await sleep(3000);
await ev(`pen.sky.startSwoop(p); return 1`);
console.log(JSON.stringify(await measure('phase 2 SWOOP + line', 2.5)));
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-3)`)));
process.exit(0);
