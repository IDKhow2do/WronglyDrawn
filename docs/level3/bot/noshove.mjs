// Item 4 (SOULS.md "Playtest fixes"): WAI's body and jumps must not move the Red Pen. Run prep.mjs works first.
// 1 · the Pen STUCK (its own pose holds still): WAI jumps on and against it for 3 s; the pivot and turn must not change.
// 2 · the hop walk: WAI runs a tight circle round the nib (r 1.6 m) and jumps; the lean / face may only ease (no swing).
import { connect, sleep } from './lib.mjs';
const c = await connect();
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor, I=__WD.app.input; ${code}`);
await ev(`s.debugWarp('boss'); return 1`);
await sleep(3000);
const wrap = `const W = (a) => Math.atan2(Math.sin(a), Math.cos(a));`;
// 1 · stuck
await ev(`p.hp = 6; p.invuln = 99; p.teleport(pen.arena.clone().add(new T3(0, 0.05, 3)).setY(pen.floorY + 0.05)); pen.ground.start('stab', p); return 1`);
for (let i = 0; i < 100 && (await ev(`return pen.state`)) !== 'STUCK'; i++) await sleep(100);
console.log('stuck:', await ev(`${wrap} p.invuln = 99; pen.hz.clear(); const pose = pen.penBody.pose; const p0 = pose.pivot.clone(), q0 = pose.q.clone();
  const out = { moved: 0, turned: 0, frames: 0 }; const t0 = performance.now(); let k = 0;
  while (performance.now() - t0 < 2500 && pen.state === 'STUCK') {
    if (k++ % 20 === 0) { const a = Math.random() * 6.28; p.teleport(pose.point(2.5).add(new T3(Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2)).setY(Math.max(pen.floorY + 0.05, pose.point(2.5).y))); I.virtualDown('Space'); setTimeout(() => I.virtualUp('Space'), 120); }
    await new Promise(r => requestAnimationFrame(r)); out.frames++;
    out.moved = Math.max(out.moved, pose.pivot.distanceTo(p0)); out.turned = Math.max(out.turned, 2 * Math.acos(Math.min(1, Math.abs(pose.q.dot(q0)))) * 57.3); }
  out.moved = +out.moved.toFixed(3); out.turned = +out.turned.toFixed(2); return JSON.stringify(out)`));
// 2 · hop walk
for (let i = 0; i < 100 && !['IDLE', 'HOP'].includes(await ev(`return pen.state`)); i++) await sleep(100);
console.log('hop walk:', await ev(`${wrap} p.invuln = 99; pen.hz.clear(); pen.attackCd = 99; const pose = pen.penBody.pose;
  let lean = pose.leanYaw, face = pose.face; const out = { maxLeanStep: 0, maxFaceStep: 0, frames: 0, state: pen.state };
  const t0 = performance.now();
  while (performance.now() - t0 < 3000) {
    const t = (performance.now() - t0) / 1000, piv = pose.pivot;
    p.teleport(new T3(piv.x + Math.sin(t * 4) * 1.6, pen.floorY + 0.05 + (Math.sin(t * 9) > 0.7 ? 1.2 : 0), piv.z + Math.cos(t * 4) * 1.6));
    await new Promise(r => requestAnimationFrame(r)); out.frames++;
    out.maxLeanStep = Math.max(out.maxLeanStep, Math.abs(W(pose.leanYaw - lean)) * 57.3); out.maxFaceStep = Math.max(out.maxFaceStep, Math.abs(W(pose.face - face)) * 57.3);
    lean = pose.leanYaw; face = pose.face; }
  out.maxLeanStep = +out.maxLeanStep.toFixed(2); out.maxFaceStep = +out.maxFaceStep.toFixed(2); out.state2 = pen.state; return JSON.stringify(out)`));
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-3)`)));
process.exit(0);
