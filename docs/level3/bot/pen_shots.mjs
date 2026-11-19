// The Red Pen's look (SOULS.md "Playtest fixes", item 8): the intro name card, front / side / back close-ups before the
// fight (neutral light) and in it (red dusk), the open clip close up. Run prep.mjs works first. Shots: $WD_SHOTS/fix_pen_*.jpg
import { connect, sleep } from './lib.mjs';
const c = await connect();
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor, I=__WD.app.input; ${code}`);
const clean = () => ev(`document.querySelectorAll('.toast,.toasts > *').forEach(e=>e.remove()); return 1`);
const shot = async (name) => { await clean(); await c.shot(name); console.log('shot', name); };
const until = async (code, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`return !!(${code})`)) return true; await sleep(80); } return false; };
// the camera on a ring round the Pen: yaw from its face (0 = front), height and distance in metres, looking at `along`
const orbit = (yawFromFace, dist, h, along) => ev(`const pose = pen.penBody.pose; const at = pose.point(${along}); const a = pose.face + ${yawFromFace};
  cam.override = { pos: new T3(at.x + Math.sin(a) * ${dist}, at.y + ${h}, at.z + Math.cos(a) * ${dist}), look: at, fov: 40 }; return 1`);
const off = () => ev(`cam.override = null; return 1`);

// ── before the fight (neutral light): the Pen waits on the roof ──
await ev(`s.debugWarp('roof'); return 1`);
await sleep(2500);
await ev(`p.hp = 6; p.invuln = 99; return 1`);
for (const [name, yaw] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI]]) {
  await orbit(yaw, 9, 1.5, 11.5);
  await sleep(500);
  await shot(`fix_pen_${name}_cap`);
}
await orbit(0.5, 10, -2, 4);
await sleep(400);
await shot('fix_pen_grip_nib');
// wide: the exact Pen against the hand-drawn skyline (the contrast is the point)
await orbit(0.3, 34, 2, 7);
await sleep(400);
await shot('fix_pen_wide_skyline');
await off();
// ── the intro: walk in through the ink gate; the name card ──
await ev(`const g = s.built.roof.ring.gatePos, c0 = s.built.roof.ring.center; const d = new T3(g.x - c0.x, 0, g.z - c0.z).normalize();
  p.teleport(g.clone().addScaledVector(d, 2.5).setY(pen.floorY + 0.05)); cam.yaw = Math.atan2(-d.x, -d.z); I.virtualMove.y = 1; return 1`);
console.log('intro', await until(`s.souls.mode === 'intro'`, 8000));
await ev(`I.virtualMove.y = 0; return 1`);
for (const k of [1, 2, 3, 4]) {
  await sleep(1100);
  await shot(`fix_pen_intro_${k}`);
}
await until(`s.souls.mode === 'on'`, 12000);
await sleep(1500);
// ── in the fight (red dusk) ──
await ev(`p.invuln = 99; pen.hz.clear(); return 1`);
for (const [name, yaw] of [['front', 0], ['side', Math.PI / 2], ['back', Math.PI]]) {
  await orbit(yaw, 16, 0, 9);
  await sleep(450);
  await shot(`fix_pen_dusk_${name}`);
}
await off();
// ── the clip open: a sweep tips it over, the camera beside its cap ──
await ev(`pen.ground.start('sweep', p); return 1`);
await until(`pen.state === 'SPRAWL'`, 9000);
await ev(`const pose = pen.penBody.pose; const at = pen.penBody.weakPos('clip'); const ey = pen.penBody.weakPos('eyes'); const sd = at.clone().sub(pose.point(12)).normalize();
  cam.override = { pos: at.clone().addScaledVector(sd, 6).add(new T3(0, 2.5, 0)), look: at.clone().lerp(ey, 0.3), fov: 46 }; return [at.y - pen.floorY]`).then((r) => console.log('clip height over the roof', JSON.stringify(r)));
await sleep(400);
await shot('fix_pen_clip_open');
await off();
console.log('pen meshes', await ev(`let n = 0; pen.look.root.traverseVisible(o => { if (o.isMesh) n++; }); return n`));
console.log('errs', JSON.stringify(await ev(`return (window.__errs||[]).slice(-3)`)));
process.exit(0);
