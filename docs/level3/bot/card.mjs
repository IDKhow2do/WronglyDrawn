// Level-select picture: the title pose, HUD hidden, saved as webp. Usage: node card.mjs out.webp
import fs from 'node:fs';
import { connect, sleep } from './lib.mjs';
const c = await connect();
await c.ev(`const T3 = await import('/node_modules/.vite/deps/three.js'); WD_COOP.enable(false); document.querySelector('.hud').style.opacity='0'; document.querySelectorAll('.toasts,.story-caption').forEach(e=>e.style.opacity='0'); const s=__WD.app.session; s.ctx.camera.playCine([{pos:new T3.Vector3(-13,4.4,20.4), look:new T3.Vector3(5,1.2,-8), dur:60, fov:56}]); return 1`);
await sleep(2500);
const r = await c.send('Page.captureScreenshot', { format: 'webp', quality: 82 });
fs.writeFileSync(process.argv[2], Buffer.from(r.result.data, 'base64'));
await c.ev(`document.querySelector('.hud').style.opacity=''; document.querySelectorAll('.toasts,.story-caption').forEach(e=>e.style.opacity=''); __WD.app.session.ctx.camera.stopCine(); return 1`);
console.log('ok');
process.exit(0);
