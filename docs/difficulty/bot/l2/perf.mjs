// Draw calls / triangles at fixed poses (WAI teleported + camera cine pose), after a warp. Usage: node perf.mjs [warp]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const warp = process.argv[2] ?? 'pier';
await c.ev(`__WD.app.session.debugWarp('${warp}'); return 1`); await sleep(1500);
const poses = [
  ['square→pier', [-30, 5.2, -20], [-30, 9, -14], [-60, 6, -75]],
  ['yard', [-48, 5.9, -62], [-41, 10, -57], [-52, 6, -68]],
  ['fogwalk', [-59, 5.9, -66], [-56, 9, -62], [-70, 5, -66]],
  ['carousel', [-80, 5.9, -82], [-70, 11, -78], [-82, 6, -90]],
  ['bandstand', [-60, 9.9, -88], [-66, 15, -76], [-54, 10, -88]],
  ['market (old)', [2, 0.8, 20], [2, 6, 30], [0, 2, 0]],
  ['headland (old)', [6, 4.3, -30], [0, 10, -20], [10, 4, -40]],
];
for (const [name, wai, pos, look] of poses) {
  const r = await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session; s.player.teleport(new T3.Vector3(${wai})); s.ctx.camera.playCine([{pos:new T3.Vector3(${pos}), look:new T3.Vector3(${look}), dur:60, fov:55}]);
    await new Promise(r=>setTimeout(r,900)); const R=__WD.app.renderer.renderer; R.info.autoReset=false; let calls=0, tris=0, n=0;
    await new Promise(r=>requestAnimationFrame(r)); R.info.reset(); const t0=performance.now();
    for (let i=0;i<20;i++){ await new Promise(r=>requestAnimationFrame(r)); calls+=R.info.render.calls; tris+=R.info.render.triangles; R.info.reset(); n++; }
    R.info.autoReset=true;
    return [Math.round(calls/n), Math.round(tris/n/1000), +((performance.now()-t0)/n).toFixed(1)]`);
  console.log(name.padEnd(16), 'calls', r[0], 'ktris', r[1], 'ms/frame', r[2]);
}
await c.ev('__WD.app.session.ctx.camera.stopCine(); return 1');
process.exit(0);
