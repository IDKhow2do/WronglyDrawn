// Render cost at fixed poses: draw calls, triangles and the time of one synchronous render (GPU flushed by a 1-px read).
// Usage: WD_VITE=5241|5242 node perf.mjs <harbor|works>   (5242 = the HEAD worktree, i.e. "before")
import { connect, sleep, VITE } from './lib.mjs';
const c = await connect();
const level = process.argv[2];
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev("(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); document.querySelector('.start-btn').click(); return 1");
for (let i = 0; i < 120 && (await st()) !== 'PLAYING'; i++) await sleep(500);
await sleep(3000);
const poses = level === 'works'
  ? [['roof', 'roof', [14.2, 27, 19.6], 2.4, 0.15, false], ['roof arena', 'roof', [0, 27, 8], Math.PI, 0.1, false]]
  : [['lighthouse gallery', 'lighthouse', [16.4, 16.8, -47.4], 2.3, 0.3, false], ['gallery + BIG SHOUT', 'lighthouse', [16.4, 16.8, -47.4], 2.3, 0.3, true]];
for (const [name, warp, wai, yaw, pitch, shout] of poses) {
  await c.ev(`__WD.app.session.debugWarp('${warp}'); return 1`); await sleep(3000);
  const r = await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session; s.ctx.camera.stopCine(); s.player.teleport(new T3.Vector3(${wai}), ${yaw}); s.ctx.camera.yaw=${yaw}; s.ctx.camera.pitch=${pitch};
    await new Promise(r=>setTimeout(r,1500));
    if (${shout}) { s.ctx.time.slowmo(0.02, 60); s.shout.fire(s.player, true); await new Promise(r=>setTimeout(r,600)); }
    const A=__WD.app.renderer; const R=A.renderer; const gl=R.getContext(); const px=new Uint8Array(4);
    const once=()=>{ A.render(); gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,px); };
    for (let i=0;i<5;i++) once();
    R.info.autoReset=false; R.info.reset(); once(); const calls=R.info.render.calls, tris=R.info.render.triangles; R.info.autoReset=true;
    const t=[]; for (let i=0;i<25;i++){ const t0=performance.now(); once(); t.push(performance.now()-t0); }
    t.sort((a,b)=>a-b);
    return [calls, Math.round(tris/1000), +t[12].toFixed(2), +t[22].toFixed(2)]`);
  console.log(name.padEnd(22), 'calls', r[0], 'ktris', r[1], 'render ms median', r[2], 'p90', r[3]);
}
process.exit(0);
