// Screenshots of the souls-like Red Pen fight (docs/level3/shots/souls_*.jpg). Loads Limp Works fresh, then stages each
// moment with dev hooks. Usage: WD_SHOTS=docs/level3/shots node souls_shots.mjs [only]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const only = process.argv[2];
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor; ${code}`);
const clean = () => ev(`document.querySelectorAll('.toast,.toasts > *').forEach(e=>e.remove()); return 1`);
const shot = async (name) => { await clean(); await c.shot(name); console.log('shot', name); };
const want = (n) => !only || only === n;
// put WAI 9 m in front of the Pen, facing it (the lock-on camera does the rest)
const front = (d = 9) => ev(`const pv = pen.penBody.pose.pivot; const c = pen.arena; const dir = new T3(c.x - pv.x, 0, c.z - pv.z + 0.01).normalize();
  const at = new T3(pv.x + dir.x * ${d}, c.y + 0.05, pv.z + dir.z * ${d}); p.teleport(at, Math.atan2(-dir.x, -dir.z)); cam.yaw = Math.atan2(-dir.x, -dir.z); return 1`);
const until = async (code, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`return !!(${code})`)) return true; await sleep(100); } return false; };

// the gate: WAI before the curtain of wet ink
await ev(`s.debugWarp('roof'); return 1`);
await sleep(1200);
await ev(`p.teleport(new T3(12.2, 27.05, 11.2), -2.4); cam.yaw = -2.42; cam.pitch = 0.1; return 1`);
await sleep(1500);
if (want('gate')) await shot('souls_gate');
// the way in: the intro's wide shot (WAI tiny at the Pen's foot)
await ev(`WD_AGENT.act({ type: 'move_to', x: 8, z: 6, run: false }); return 1`);
await until(`s.souls.mode === 'intro'`);
await ev(`__WD.app.agent.enabled = false; __WD.app.input.virtualMove.x = __WD.app.input.virtualMove.y = 0; return 1`);
await sleep(2300);
if (want('intro')) await shot('souls_intro');
await until(`s.souls.mode === 'on'`);
await sleep(1500);
// phase 1: the nib stab's tell (ring under WAI, the Pen high above), from the lock-on camera
await front(8);
await sleep(400);
await ev(`pen.ground.start('stab', p); return 1`);
await sleep(880);
if (want('phase1')) await shot('souls_phase1');
// it sticks where WAI stood; WAI rolled clear (staged: 6 m off), the grip glows
await until(`pen.state === 'STAB'`, 3000);
await ev(`p.teleport(p.pos.clone().add(new T3(4.5, 0, 4.5))); return 1`);
await until(`pen.state === 'STUCK'`, 4000);
await sleep(700);
if (want('weak')) await shot('souls_weakpoint');
await until(`pen.state === 'IDLE'`, 8000);
// lock-on: the sweep's tell, the reticle on the Pen, the swept sector on the roof
await front(10);
await sleep(600);
await ev(`pen.ground.start('sweep', p); return 1`);
await sleep(1000);
if (want('lockon')) await shot('souls_lockon');
await until(`pen.state === 'IDLE'`, 9000);
// phase 2: the swoop's dotted line
await ev(`pen.debugPhase(2); return 1`);
await until(`pen.state === 'FLY'`, 6000);
await sleep(1500);
await ev(`p.teleport(pen.arena.clone().add(new T3(2, 0.05, 3))); return 1`);
await sleep(500);
await ev(`pen.sky.startSwoop(p); return 1`);
await sleep(1100);
if (want('phase2')) await shot('souls_phase2');
await until(`pen.state === 'FLY'`, 9000);
// phase 3: the sketch, True Sight, the Eraser beside WAI, a sweep coming
await ev(`pen.debugPhase(3); return 1`);
await until(`pen.state === 'IDLE'`, 9000);
await front(9);
await ev(`__WD.app.input.virtualDown('KeyZ'); return 1`);
await sleep(900);
if (want('phase3')) await shot('souls_phase3');
await ev(`__WD.app.input.virtualUp('KeyZ'); return 1`);
// (staging: WAI healed and the Pen calmed, so the smudge below is the one we cause)
await ev(`p.hp = 6; p.invuln = 3; pen.idle(5); pen.hz.clear(); return 1`);
await sleep(1500);
// the death beat (if the Pen already smudged WAI while staging phase 3, walk him back in first)
await until(`s.souls.mode !== 'down'`, 4000);
if (await ev(`return s.souls.mode`) !== 'on') { await ev(`s.souls.warpIn(); return 1`); await sleep(1500); }
await ev(`p.hp = 0; return 1`);
await until(`s.souls.mode === 'down'`, 3000);
await sleep(700);
if (want('death')) await shot('souls_death');
await until(`s.souls.mode === 'off'`, 6000);
await sleep(1200);
// the ending: back in, straight to the fall, the last TAG, the Pen draws
await ev(`s.souls.warpIn(); pen.debugPhase(4); return 1`);
await sleep(600);
await ev(`p.teleport(pen.pos.clone().add(new T3(2.5, 0.1, 2.5))); return 1`);
await sleep(300);
await ev(`s.combat.tag(pen); return 1`);
await until(`s.bossDone`, 8000);
await sleep(2700);
if (want('ending')) await shot('souls_ending');
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-5)`)));
process.exit(0);
