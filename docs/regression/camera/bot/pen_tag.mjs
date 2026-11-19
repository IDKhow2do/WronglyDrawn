// Screenshots of the souls-like Red Pen fight and the level-3 playtest fixes (docs/level3/shots/fix_*.jpg, SOULS.md
// "Playtest fixes"). Loads nothing: run prep.mjs works first. Stages each moment with dev hooks; aiming is done by turning
// the camera (no lock-on, no Y), like a player with a mouse. Prints numbers per shot (camera gap to the Pen, paint landed).
// Usage: WD_SHOTS=docs/level3/shots node souls_shots.mjs [door|press|fight|all]
import { connect, sleep } from '<local-path>';
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
await ev(`document.querySelectorAll('.encore').forEach(e=>e.style.visibility='hidden'); return 1`);
console.log('wai', JSON.stringify(await ev(`const cp=cam.camera.position, h=p.renderPos.clone(); h.y+=0.9; const ndc=h.clone().project(cam.camera); const d=h.clone().sub(cp); const L=d.length(); d.normalize(); const rc=new (__WD.app.fader.ray.constructor)(cp.clone(), d, 0, L-0.2); const hits=rc.intersectObject(pen.root,true).filter(q=>q.object.visible&&!q.object.userData.isOutline); return {ndc:[+ndc.x.toFixed(2),+ndc.y.toFixed(2)], penHits:hits.length, close:+cam.closeness.toFixed(2), wai:[p.pos.x,p.pos.y,p.pos.z].map(v=>+v.toFixed(1)), cam:[cp.x,cp.y,cp.z].map(v=>+v.toFixed(1))}`)));
await shot('fix_tag_after');

process.exit(0);
