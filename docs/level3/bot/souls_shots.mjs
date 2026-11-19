// Screenshots of the souls-like Red Pen fight and the level-3 playtest fixes (docs/level3/shots/fix_*.jpg, SOULS.md
// "Playtest fixes"). Loads nothing: run prep.mjs works first. Stages each moment with dev hooks; aiming is done by turning
// the camera (no lock-on, no Y), like a player with a mouse. Prints numbers per shot (camera gap to the Pen, paint landed).
// Usage: WD_SHOTS=docs/level3/shots node souls_shots.mjs [door|press|fight|all]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const part = process.argv[2] ?? 'all';
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor; ${code}`);
const clean = () => ev(`document.querySelectorAll('.toast,.toasts > *,.unlock,.pickup-card').forEach(e=>e.remove()); return 1`);
const shot = async (name) => { await clean(); await c.shot(name); console.log('shot', name); };
const until = async (code, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`return !!(${code})`)) return true; await sleep(60); } return false; };
// turn the camera (the "mouse") until the crosshair ray from the camera runs through `expr` (a Vector3 expression)
const aim = (expr, ms = 900) => ev(`const t0 = performance.now(); while (performance.now() - t0 < ${ms}) { await new Promise(r => requestAnimationFrame(r));
  const at = ${expr}; const cp = cam.camera.position; const dx = at.x - cp.x, dy = at.y - cp.y, dz = at.z - cp.z;
  const yaw = Math.atan2(dx, dz), pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  cam.yaw += Math.atan2(Math.sin(yaw - cam.yaw), Math.cos(yaw - cam.yaw)) * 0.3; cam.pitch += (Math.max(-1.25, Math.min(1.05, pitch)) - cam.pitch) * 0.3; } return 1`);
// stand WAI `d` m from a world point on the side toward the arena centre, facing it
const standOff = (expr, d) => ev(`const at = ${expr}; const c = pen.arena; const dir = new T3(c.x - at.x + 0.01, 0, c.z - at.z).normalize();
  p.teleport(new T3(at.x + dir.x * ${d}, c.y + 0.05, at.z + dir.z * ${d}), Math.atan2(-dir.x, -dir.z)); cam.yaw = Math.atan2(-dir.x, -dir.z); cam.pitch = 0.1; return 1`);
const calm = () => ev(`p.hp = 6; p.invuln = 99; pen.hz.clear(); return 1`);
// the camera: gap to the Pen's surface (m, < 0 = inside), distance from the ring centre vs its radius, the Pen's fade
const camInfo = () => ev(`const cp = cam.camera.position; return { gap: +pen.penBody.gap(cp.clone().setY(cp.y - 0.65)).toFixed(2), ring: +s.souls.view.ring.radial(cp).toFixed(1) + ' / ' + s.souls.view.ring.R.toFixed(1), fade: +pen.nearAlpha.toFixed(2), cine: cam.inCine }`);
// spray for `ms` with the crosshair on `expr`; returns the Pen's paint landed (hp drop)
const spray = async (expr, ms) => {
  const hp0 = await ev(`return pen.hp`);
  await ev(`__WD.app.input.virtualDown('Mouse0'); return 1`);
  await aim(expr, ms);
  const hp1 = await ev(`return pen.hp`);
  return Math.round(hp0 - hp1);
};
const release = () => ev(`__WD.app.input.virtualUp('Mouse0'); return 1`);

// ── F3: the card-catalogue door, closed then open (and does it block?) ──
if (part === 'door' || part === 'all') {
  await ev(`s.debugWarp('archive'); return 1`);
  await sleep(4000);
  await ev(`s.ctx.camera.stopCine(); p.teleport(new T3(5.0, 18.05, 9.5), Math.PI / 2); cam.yaw = Math.PI / 2; cam.pitch = 0.1; p.invuln = 99; for (const e of s.enemies) if (e.kind === 'compass') e.root.visible = false; return 1`);
  await sleep(1500);
  await shot('fix_door_closed');
  // walk into it for 1.5 s: WAI must stay on the Reading Room side
  await ev(`__WD.app.input.virtualMove.y = 1; return 1`);
  await sleep(1500);
  console.log('closed: WAI x after walking at the door (door at x 10, must stay < 9.5):', await ev(`__WD.app.input.virtualMove.y = 0; return +p.pos.x.toFixed(2)`));
  await ev(`p.teleport(new T3(5.0, 18.05, 9.5), Math.PI / 2); cam.yaw = Math.PI / 2; s.built.archive.gate.unlock(); return 1`);
  await sleep(450);
  await shot('fix_door_opening');
  await sleep(1800);
  await shot('fix_door_open');
  await ev(`__WD.app.input.virtualMove.y = 1; return 1`);
  await sleep(1800);
  console.log('open: WAI x after walking through (must be > 10.5):', await ev(`__WD.app.input.virtualMove.y = 0; return +p.pos.x.toFixed(2)`));
}

// ── a Stamp Press: its tell (the shockwave ring drawn round the landing mark) and a slam ──
if (part === 'press' || part === 'all') {
  await ev(`s.debugWarp('index'); return 1`);
  await sleep(3000);
  await ev(`s.ctx.camera.stopCine(); const e = s.enemies.find(x => x.kind === 'stamppress' && !x.harmless && Math.abs(x.pos.y - 18) < 2); window.__press = e;
    p.teleport(e.pos.clone().add(new T3(0, 0.05, 7)), Math.PI); cam.yaw = Math.PI; cam.pitch = 0.42; p.invuln = 99; return e.id`);
  console.log('press tell', await until(`window.__press.state === 'TELL_RUN'`, 15000));
  await sleep(450);
  await shot('fix_press_tell');
  // the first slam: the ram comes down (hopping turns off)
  await until(`window.__press.state === 'RUN' && window.__press.hopping`, 4000);
  await until(`!window.__press.hopping`, 3000);
  await sleep(180);
  await shot('fix_press_slam');
  console.log('press', JSON.stringify(await ev(`const e = window.__press; return { state: e.state, tune: (await import('/src/meta/Difficulty.ts')).stampTuning() }`)));
  await ev(`p.invuln = 0; return 1`);
}

if (part !== 'fight' && part !== 'all') process.exit(0);

// ── the fight ──
await ev(`s.debugWarp('boss'); return 1`);
await sleep(3000);
await calm();
// the closest TAG: a stab sticks, WAI walks right up to the nib and TAGs (the Pen's own two shots frame it)
const stuck = async (d) => {
  await calm();
  await until(`pen.state === 'IDLE' || pen.state === 'HOP'`, 9000);
  // in the middle of the ring (the stab lands where WAI stands)
  await ev(`p.teleport(pen.arena.clone().add(new T3(0, 0.05, 3)).setY(pen.floorY + 0.05)); pen.ground.start('stab', p); return 1`);
  await until(`pen.state === 'STAB'`, 5000);
  await standOff(`pen.penBody.pose.pivot`, d);
  return until(`pen.state === 'STUCK'`, 4000);
};
await stuck(6);
await ev(`p.teleport(pen.penBody.pose.pivot.clone().add(new T3(1.6, 0, 1.6)).setY(pen.floorY + 0.05)); return 1`);
await sleep(120);
console.log('tag', await ev(`const ok = pen.canBeTagged; if (ok) s.combat.tag(pen); return [ok, pen.state]`));
await sleep(300);
console.log('tag shot 1', JSON.stringify(await camInfo()));
await shot('fix_tag_close_1');
await sleep(450);
console.log('tag shot 2', JSON.stringify(await camInfo()));
await shot('fix_tag_close_2');
await sleep(700);
console.log('after the TAG (play camera)', JSON.stringify(await camInfo()), await ev(`const e = p.renderPos.clone(); e.y += cam.targetHeight; const f = new T3(); cam.camera.getWorldDirection(f); return 'deg off WAI ' + (Math.acos(f.dot(e.sub(cam.camera.position).normalize())) * 57.3).toFixed(0) + ', mode ' + s.souls.mode`));
await shot('fix_tag_after');
// GRIP: another stab sticks, WAI aims at the grip from 6 m
await stuck(6);
console.log('grip paint', await spray(`pen.penBody.weakPos('grip')`, 900), JSON.stringify(await camInfo()));
await shot('fix_aim_grip');
await release();
// NIB: the ink flick, then it blows on its nib
await calm();
await until(`pen.state === 'IDLE' || pen.state === 'HOP'`, 9000);
await ev(`pen.ground.start('splat', p); return 1`);
await until(`pen.state === 'DRY'`, 8000);
await calm();
await standOff(`pen.penBody.pose.pivot`, 5);
console.log('nib paint', await spray(`pen.penBody.weakPos('nib')`, 900), JSON.stringify(await camInfo()));
await shot('fix_aim_nib');
await release();
// CLIP, then EYES: a sweep tips it over each time; WAI stands near its cap and aims
for (const id of ['clip', 'eyes']) {
  await calm();
  await until(`pen.state === 'IDLE' || pen.state === 'HOP'`, 9000);
  await ev(`pen.ground.start('sweep', p); return 1`);
  await until(`pen.state === 'SPRAWL'`, 8000);
  await calm();
  // the clip hangs on the cap's side: stand off that side; the eyes face up, any side will do
  if (id === 'clip') await ev(`const at = pen.penBody.weakPos('clip'), mid = pen.penBody.pose.point(12); const d = at.clone().sub(mid).setY(0).normalize();
    p.teleport(at.clone().addScaledVector(d, 5).setY(pen.floorY + 0.05)); cam.yaw = Math.atan2(-d.x, -d.z); cam.pitch = 0.1; return 1`);
  else await standOff(`pen.penBody.weakPos('${id}')`, 5);
  console.log(id + ' paint', await spray(`pen.penBody.weakPos('${id}')`, 800), JSON.stringify(await camInfo()));
  await shot('fix_aim_' + id);
  await release();
}
// the Y swing: one tap turns the view onto the Pen, the mouse takes it back at once
await ev(`cam.yaw += 2.2; return 1`);
await sleep(200);
await ev(`__WD.app.input.virtualDown('KeyY'); await new Promise(r => setTimeout(r, 60)); __WD.app.input.virtualUp('KeyY'); return 1`);
await sleep(600);
console.log('Y swing: crosshair-to-Pen angle (deg)', await ev(`const cp = cam.camera.position, d = new T3(); cam.camera.getWorldDirection(d); const at = s.souls.lock.point.clone().sub(cp).normalize(); return +(Math.acos(Math.min(1, d.dot(at))) * 57.3).toFixed(1)`));
// phase 2: the Hush beside WAI (4.2 m), then a SHOUT: its dust over the flying Pen, it sinks
await ev(`pen.debugPhase(2); return 1`);
await calm();
await until(`pen.hush.shown && pen.state === 'FLY'`, 8000);
await sleep(1500);
await calm();
await aim(`pen.hush.pos.clone().setY(pen.hush.pos.y + 1)`, 800);
console.log('hush', JSON.stringify(await ev(`return { shown: pen.hush.shown, at: pen.hush.pos.toArray().map(v => +v.toFixed(1)), wai: p.pos.toArray().map(v => +v.toFixed(1)), state: pen.state }`)));
await shot('fix_helper_hush');
await until(`pen.shoutable`, 8000);
await ev(`pen.onShout(true, p.pos); return pen.state`);
await sleep(1600);
await calm();
await aim(`pen.penBody.pose.point(6)`, 700);
console.log('hush wrap', JSON.stringify(await ev(`return { state: pen.state, wrapping: pen.hush.wrapping }`)));
await shot('fix_helper_hush_wrap');
// phase 3: the Eraser beside the Pen; then spray the body a while (late fight: still red, paint on it)
await ev(`pen.debugPhase(3); return 1`);
await calm();
await sleep(5000);
await calm();
await standOff(`pen.penBody.pose.pivot`, 9);
await aim(`pen.eraser.pos.clone().lerp(pen.penBody.pose.point(4), 0.5)`, 900);
console.log('eraser', JSON.stringify(await ev(`return { shown: pen.eraser.shown, at: pen.eraser.pos.toArray().map(v => +v.toFixed(1)), state: pen.state }`)));
await shot('fix_helper_eraser');
// late fight (phase 3): WAI aims with the Eye (True Sight makes the sketch real) and paints the body; then a look at it
await calm();
await standOff(`pen.penBody.pose.pivot`, 9);
await ev(`__WD.app.input.virtualDown('Mouse2'); return 1`);
for (const along of [3, 5, 8, 11]) await spray(`pen.penBody.pose.point(${along})`, 500);
await release();
await calm();
await standOff(`pen.penBody.pose.pivot`, 11);
await aim(`pen.penBody.pose.point(5)`, 600);
await shot('fix_late_red');
await ev(`__WD.app.input.virtualUp('Mouse2'); return 1`);
console.log('late', JSON.stringify(await ev(`return { phase: pen.phase, hp: +(pen.hp / pen.maxHp).toFixed(2), lacquer: pen.look.mats[0].type }`)));
// the ending: straight to the fall, the last TAG, the Pen draws (a red pen with paint on it)
await ev(`pen.debugPhase(4); return 1`);
await sleep(600);
await ev(`p.teleport(pen.pos.clone().add(new T3(3, 0, 3)).setY(pen.floorY + 0.05)); return 1`);
await sleep(300);
await ev(`s.combat.tag(pen); return 1`);
await until(`s.bossDone`, 8000);
await sleep(2700);
await shot('fix_ending');
// the result card itself (LEVEL COMPLETE over the postcard view)
await until(`__WD.state === 'COMPLETE'`, 40000);
await sleep(6000);
console.log('result', JSON.stringify(await ev(`return { wai: p.pos.toArray().map(v => +v.toFixed(1)), cam: cam.camera.position.toArray().map(v => +v.toFixed(1)) }`)));
await c.shot('fix_result');
console.log('shot fix_result');
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-5)`)));
process.exit(0);
