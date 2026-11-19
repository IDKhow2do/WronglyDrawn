// Screenshot of the Eraser fight's safety net: WAI dropped into the Gate Tower door pocket, then put back (ArenaGuard).
// Usage: WD_VITE=5301 node guardshot.mjs
import { connect, sleep } from './lib.mjs';
const c = await connect();
await c.load('plaza', 'normal');
await c.ev(`const s=__WD.session; s.debugWarp('statue'); s.debugWarp('summit'); return 1`);
await c.adv(1);
await c.ev(`const s=__WD.session; s.player.teleport(s.eraser.arena.clone().add(new s.player.pos.constructor(0,0.3,5)), Math.PI); return 1`);
for (let i = 0; i < 20 && !(await c.ev('return __WD.session.eraser.awake')); i++) await c.adv(0.3);
await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); s.eraser.attackCd=99; return 1`);
await c.adv(2);
await c.ev(`const s=__WD.session, V=s.player.pos.constructor; s.eraser.attackCd=99; s.player.teleport(new V(0, 14.05, -50.9), Math.PI); window.__hp=s.player.hp; window.__paint=s.eraser.hp; return 1`);
await c.adv(0.6);
const inPocket = await c.shot('guard_eraser_in_pocket');
let t = 0.6;
while (t < 4 && (await c.ev('return __WD.session.arenaGuard.returns')) === 0) { await c.adv(0.1); t += 0.1; }
await c.adv(0.15);
const back = await c.shot('guard_eraser_back_in');
console.log(JSON.stringify({ secondsInPocket: +t.toFixed(1), pos: await c.ev('return __WD.session.player.pos.toArray().map(v=>+v.toFixed(2))'), hpSame: await c.ev('return __WD.session.player.hp===window.__hp'), paintSame: await c.ev('return __WD.session.eraser.hp===window.__paint'), shots: [inPocket, back] }));
process.exit(0);
