// Spawn a test creature next to WAI and frame it. Usage: node spawn.mjs crab|jelly|barker name
import { connect, sleep } from './lib.mjs';
const c = await connect();
const kind = process.argv[2] ?? 'crab';
await c.ev(`
const T3 = await import('/node_modules/.vite/deps/three.js');
const s=__WD.app.session; const p=s.player.pos;
const at=new T3.Vector3(p.x, p.y, p.z-5);
let e;
if('${kind}'==='jelly'){ const {FogJelly}=await import('/src/enemy/FogJelly.ts'); e=new FogJelly(s.ctx,'tj',at,[at.clone(), at.clone().add(new T3.Vector3(3,0,0))],()=>p.y); }
else { const {MegaphoneCrab}=await import('/src/enemy/MegaphoneCrab.ts'); e=new MegaphoneCrab(s.ctx,'tc',at,'${kind}'==='barker'?1.4:1); }
e.root.userData.wdPrep?.();
s.enemies.push(e); window.__te=e; return 1`);
await sleep(800);
const e = await c.ev('const e=window.__te; return [e.pos.x,e.pos.y,e.pos.z]');
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); __WD.app.session.ctx.camera.playCine([{pos:new T3.Vector3(${e[0]+2.6},${e[1]+2.2},${e[2]+3.4}), look:new T3.Vector3(${e[0]},${e[1]+0.9},${e[2]}), dur:30, fov:45}]); return 1`);
await sleep(900);
console.log(await c.shot(process.argv[3] ?? kind));
process.exit(0);
