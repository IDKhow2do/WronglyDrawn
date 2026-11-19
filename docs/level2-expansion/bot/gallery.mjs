// The Echo Gallery challenge: warp to the pier, step onto the gallery, shout each horn as it pops up.
import { connect, sleep } from './lib.mjs';
const c = await connect();
const act = (x) => c.ev(`return WD_AGENT.act(${JSON.stringify(x)})`);
await c.ev("__WD.app.session.debugWarp('pier'); return 1"); await sleep(1500);
await c.ev("T.tp(-81, 6.2, -60.5, Math.PI); return 1"); await sleep(500);
await act({ type: 'move_to', x: -81, z: -53.5, run: true }); await sleep(2500);
let shots = 0;
for (let i = 0; i < 90; i++) {
  const h = await c.ev('const g=__WD.app.session.pier.gallery; const h=g.horns[g.cur]; return h && h.up > 0.6 && !g.hit ? h.pos.toArray() : null');
  if (h) {
    await act({ type: 'look_at', x: h[0], y: h[1], z: h[2] }); await sleep(150);
    await act({ type: 'shout', at: h }); shots++; await sleep(350);
    if (shots === 3) await c.shot('gallery_horn');
  }
  if (await c.ev('return __WD.app.session.pier.gallery.won')) break;
  await sleep(150);
}
console.log('won', await c.ev('return __WD.app.session.pier.gallery.won'), 'crown hidden', await c.ev("return __WD.app.session.level.crowns.find(c=>c.id==='crown-gallery').hidden"), 'shouts', shots, 'errs', await c.ev('return window.__errs'));
process.exit(0);
