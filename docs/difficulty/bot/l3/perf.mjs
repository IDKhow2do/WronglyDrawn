// Draw calls / triangles / frame time on each floor of Limp Works (gameplay camera, WAI teleported). Usage: node perf.mjs
import { connect, sleep } from './lib.mjs';
const c = await connect();
await c.ev(`__WD.app.session.debugWarp('archive'); return 1`); await sleep(1500);
const poses = [
  ['F1 entry', [0, 0, 18.6], Math.PI], ['F1 belts', [-14, 0, -1.2], -Math.PI / 2], ['F1 lift', [10, 0, -12], Math.PI / 2],
  ['F2 lift', [12.5, 9, -9], Math.PI / 2], ['F2 pit', [10.5, 9, -1], -Math.PI / 2], ['F2 west', [-12, 9, 6], Math.PI], ['F2 stamp run', [19, 9, -10.5], 0],
  ['F3 arrive', [-19.9, 18, -12.6], Math.PI / 2], ['F3 reading', [-1.5, 18, 0], Math.PI], ['F3 index', [12.6, 18, 9.5], Math.PI],
  ['Roof', [14.2, 27, 19.6], -2.4], ['Roof arena', [0, 27, 8], Math.PI],
];
for (const [name, wai, yaw] of poses) {
  const r = await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session; s.ctx.camera.stopCine(); s.player.teleport(new T3.Vector3(${wai}), ${yaw}); s.ctx.camera.yaw=${yaw}; s.ctx.camera.pitch=0.2;
    await new Promise(r=>setTimeout(r,1200)); const R=__WD.app.renderer.renderer; R.info.autoReset=false; let calls=0, tris=0, n=0;
    await new Promise(r=>requestAnimationFrame(r)); R.info.reset(); const t0=performance.now();
    for (let i=0;i<30;i++){ await new Promise(r=>requestAnimationFrame(r)); calls+=R.info.render.calls; tris+=R.info.render.triangles; R.info.reset(); n++; }
    R.info.autoReset=true;
    return [Math.round(calls/n), Math.round(tris/n/1000), +((performance.now()-t0)/n).toFixed(1), s.built.shown]`);
  console.log(name.padEnd(14), 'calls', r[0], 'ktris', r[1], 'ms/frame', r[2], 'floors', r[3].toString(2));
}
process.exit(0);
