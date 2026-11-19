// Hold the camera at a pose and screenshot. Usage: node cine.mjs name px py pz lx ly lz [fov]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [name, px, py, pz, lx, ly, lz, fov] = process.argv.slice(2);
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const cam=__WD.app.session.ctx.camera; cam.playCine([{pos:new T3.Vector3(${px},${py},${pz}), look:new T3.Vector3(${lx},${ly},${lz}), dur:30, fov:${fov ?? 55}}]); return 1`);
await sleep(1500);
console.log(await c.shot(name));
await c.ev('__WD.app.session.ctx.camera.stopCine(); return 1');
process.exit(0);
