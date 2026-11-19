// Spawn a level-3 creature in front of WAI on F2 and frame it. Usage: node creature.mjs press|snake|compass name [state]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const kind = process.argv[2];
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session;
  s.player.teleport(new T3.Vector3(13, 9, 10), Math.PI); const at=new T3.Vector3(13, 9, 5);
  const mod = { press:['/src/enemy/StampPress.ts','StampPress'], snake:['/src/enemy/RulerSnake.ts','RulerSnake'], compass:['/src/enemy/CompassSpinner.ts','CompassSpinner'] }['${kind}'];
  const M = await import(mod[0]); const e = new M[mod[1]](s.ctx, 'shot-${kind}', at); e.root.userData.wdPrep?.(); s.enemies.push(e); window.__te=e; s.player.invuln = 999; return 1`);
await sleep(4000);
const e = await c.ev('const e=window.__te; return [e.pos.x,e.pos.y,e.pos.z, e.state]');
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); __WD.app.session.ctx.camera.playCine([{pos:new T3.Vector3(${e[0] + 3.2},${e[1] + 2.2},${e[2] + 3.6}), look:new T3.Vector3(${e[0]},${e[1] + 1.0},${e[2]}), dur:30, fov:45}], {gameplay:true}); return 1`);
await sleep(900);
console.log(await c.shot(process.argv[3] ?? kind), e[3]);
await c.ev('const e=window.__te; e.dispose(); __WD.app.session.ctx.camera.stopCine(); return 1');
process.exit(0);
