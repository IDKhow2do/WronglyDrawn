// Teleport WAI and shoot the gameplay camera. Usage: node view.mjs name x y z yaw [pitch] [hideHud]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [name, x, y, z, yaw, pitch] = process.argv.slice(2);
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); const s=__WD.app.session; s.ctx.camera.stopCine(); s.player.teleport(new T3.Vector3(${x},${y},${z}), ${yaw}); s.ctx.camera.yaw=${yaw}; s.ctx.camera.pitch=${pitch ?? 0.25}; document.querySelector('.hud').style.opacity='0'; return 1`);
await sleep(1600);
console.log(await c.shot(name));
await c.ev(`document.querySelector('.hud').style.opacity=''; return 1`);
process.exit(0);
