// The Red Pen's sky moment: warp past the ferry, make the forks hum, and shoot the cine as it plays.
import { connect, sleep } from './lib.mjs';
const c = await connect();
await c.ev("__WD.app.session.debugWarp('ferry'); return 1"); await sleep(1500);
await c.ev("const s=__WD.app.session; s.player.teleport(s.level.spots.clockFace.clone().setY(5.2).add({x:0,y:0,z:8}), Math.PI); for (const f of s.level.forks) f.humT = 10; s.events.emit('harbor:fork', {n: 3}); return 1");
const t0 = Date.now();
for (const at of [2, 5, 7.2, 8.4, 9.6, 10.8, 12.2, 13.4, 14.4]) {
  while ((Date.now() - t0) / 1000 < at) await sleep(50);
  console.log(await c.shot(`sky_${String(at).replace('.', '_')}`), await c.ev("return document.querySelector('.story-caption, .caption')?.textContent ?? ''"));
}
await sleep(3000);
console.log('gate open', await c.ev('return __WD.app.session.pierBuilt.gateOpen'), 'errs', await c.ev('return window.__errs'));
process.exit(0);
