// Sprint-jump test: from (x,z) toward (tx,tz), jump when 'at' metres ahead is over air. Prints the trajectory.
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [x, z, tx, tz, jumpAt] = process.argv.slice(2).map(Number);
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session; for (const e of s.enemies) if (e.kind==='rulersnake') e.alerted=false; s.player.teleport(new T3.Vector3(${x},9.05,${z}), Math.atan2(${tx - x},${tz - z})); s.ctx.camera.yaw=Math.atan2(${tx - x},${tz - z}); s.player.hp=6; return 1`);
await sleep(500);
await c.ev(`WD_AGENT.act({type:'move_to', x:${tx}, z:${tz}, run:true}); return 1`);
let jumped = false;
for (let i = 0; i < 40; i++) {
  const p = await c.ev(`const p=__WD.app.session.player; return [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), p.grounded, p.longLegs]`);
  console.log(JSON.stringify(p));
  if (!jumped && Math.abs(p[0]) < jumpAt) { jumped = true; await c.ev(`WD_AGENT.act({type:'jump'}); return 1`); console.log('JUMP'); }
  await sleep(80);
}
process.exit(0);
