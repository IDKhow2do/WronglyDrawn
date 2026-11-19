// Fixed camera look for screenshots. Usage: node cam.mjs name px py pz lx ly lz [fov]  (camera.override; "off" clears it)
import { connect, sleep } from './lib.mjs';
const c = await connect();
const [name, ...v] = process.argv.slice(2);
if (name === 'off') { await c.ev('__WD.app.camera.override = null; return 1'); process.exit(0); }
const T = "const T3=__WD.app.session.player.pos.constructor;";
await c.ev(`${T} __WD.app.camera.override = { pos: new T3(${v[0]},${v[1]},${v[2]}), look: new T3(${v[3]},${v[4]},${v[5]}), fov: ${v[6] ?? 55} }; return 1`);
await sleep(700);
await c.shot(name);
await c.ev('__WD.app.camera.override = null; return 1');
process.exit(0);
