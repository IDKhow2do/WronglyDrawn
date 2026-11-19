// WAI mid-hop between two moored boats, from the market quay, and the three boats in place.
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
const save = async (n) => { const r = await c.send('Page.captureScreenshot', { format: 'jpeg', quality: 88 }); fs.writeFileSync(`/tmp/wd-l2x/shots/${n}.jpg`, Buffer.from(r.result.data, 'base64')); console.log(n); };
const pose = (px, py, pz, lx, ly, lz) => c.ev(`const cam=__WD.app.camera.camera; cam.position.set(${px},${py},${pz}); cam.lookAt(${lx},${ly},${lz}); cam.fov=55; cam.updateProjectionMatrix(); __WD.advance(0); return 1`);
await c.ev(`__WD.session.debugWarp('ferry'); document.querySelectorAll('.toasts').forEach(e=>e.style.opacity='0'); return 1`);
await sleep(1500);
// the three boats in place (loop stopped so the camera stays put)
await c.ev('__WD.app.loop.stop(); return 1');
await pose(-9.5, 3.2, 10.5, -15.4, -0.2, 16.2); await save('boats_in_place_side');
await pose(-15.2, 9.5, 24.5, -15.4, -0.5, 16); await save('boats_in_place_top');
await c.ev('__WD.app.loop.start(); return 1');
for (const [k, tag] of [[0, 'e_to_m'], [1, 'm_to_w']]) {
  await c.ev(`const d=__WD.session.level.spots.decks; T.tp(d[${k}].x+0.5, d[${k}].y+0.3, d[${k}].z, -Math.PI/2); return 1`);
  await sleep(800);
  await c.ev(`const d=__WD.session.level.spots.decks; WD_AGENT.act({type:'move_to',x:d[${k + 1}].x,z:d[${k + 1}].z,run:false}); return 1`);
  await sleep(250);
  await c.ev(`WD_AGENT.act({type:'jump'}); return 1`);
  await sleep(330);
  await c.ev('__WD.app.loop.stop(); return 1');
  const p = await c.ev('return __WD.session.player.pos.toArray()');
  console.log(tag, p.map((v) => +v.toFixed(2)));
  await pose(p[0] - 0.3, p[1] + 1.0, p[2] + 5.6, p[0] - 0.8, p[1] - 0.3, p[2]); await save(`wai_midhop_${tag}`);
  await c.ev('__WD.app.loop.start(); return 1');
  await sleep(1200);
}
process.exit(0);
