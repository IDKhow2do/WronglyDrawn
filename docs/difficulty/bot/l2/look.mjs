// Fixed-pose screenshots of the district for the art check. Usage: node look.mjs [prefix]
// (warps to 'pier', freezes the creatures, then poses the camera on each spot)
import { connect, sleep } from './lib.mjs';
const c = await connect();
const pre = process.argv[2] ?? 'look';
await c.ev("__WD.app.session.debugWarp('pier'); return 1"); await sleep(1500);
const poses = [
  ['gate', [-44.5, 9.5, -42], [-47.6, 6.5, -52]],
  ['yard', [-41, 10, -57], [-52, 6, -68]],
  ['crab', null, 'p-crab-yard-0'],
  ['fogwalk', [-58, 10, -61], [-70, 5, -66]],
  ['jelly', null, 'p-jelly-walk-0'],
  ['landing', [-74, 10, -54], [-82, 6, -66]],
  ['gallery', [-74, 9, -46], [-82, 6, -54]],
  ['carousel', [-70, 11, -78], [-82, 6, -90]],
  ['barker', null, 'p-barker'],
  ['bandstand', [-66, 15, -76], [-54, 10, -88]],
  ['gramophone', null, 'gramophone'],
  ['overview', [-30, 30, -50], [-62, 4, -80]],
];
for (const [name, pos, look] of poses) {
  let P = pos, L = look;
  if (!pos) {
    const e = await c.ev(`const e=__WD.app.session.enemies.find(e=>e.id==='${look}'); if(!e) return null; return [e.pos.x,e.pos.y,e.pos.z,e.bigness, e.facing]`);
    if (!e) { console.log('no', look); continue; }
    const k = 2 + e[3] * 6;
    P = [e[0] + Math.sin(e[4]) * k + 1.5, e[1] + 1.5 + e[3] * 3, e[2] + Math.cos(e[4]) * k + 1.5];
    L = [e[0], e[1] + 0.8 + e[3] * 2, e[2]];
  }
  await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); __WD.app.session.ctx.camera.playCine([{pos:new T3.Vector3(${P}), look:new T3.Vector3(${L}), dur:60, fov:52}]); return 1`);
  await sleep(1200);
  console.log(await c.shot(`${pre}_${name}`));
}
await c.ev('__WD.app.session.ctx.camera.stopCine(); return 1');
process.exit(0);
