// Level-1 boss arena: can the Eraser's charge, its knock, its push-out or its buck-off carry WAI out of the summit?
// Per trial: WAI stands between the Eraser and the door / a rim point / the south gap; the Eraser charges him (the real
// RUB state), or he takes the same knock (takeHit 16), or he is bucked off its head toward that spot (leap 4.4 m, vy 7).
// Counts trials that end with WAI outside the arena (behind the door plane, past the rim, or below the summit), then
// (after the fix) whether the arena guard brings him back with hearts and boss paint unchanged.
// Usage: DIFF=normal node docs/regression/arenas/eraser_knock.mjs   (Vite :5301, Chrome :9401)
import { connect } from './lib.mjs';
const c = await connect();
const DIFF = process.env.DIFF || 'normal';
await c.load('plaza', DIFF);
await c.ev(`const s=__WD.session; s.debugWarp('statue'); s.debugWarp('summit'); return 1`);
await c.adv(1);
await c.ev(`const s=__WD.session; s.player.teleport(s.eraser.arena.clone().add(new s.player.pos.constructor(0,0.3,5)), Math.PI); return 1`);
for (let i = 0; i < 20 && !(await c.ev('return __WD.session.eraser.awake')); i++) await c.adv(0.3);
await c.ev(`const s=__WD.session; if (s.story.locked) s.story.skip(); __WD.app.camera.stopCine(); return 1`);
await c.adv(3);
// page-side: inside test + one trial
await c.ev(`
  const s=__WD.session, e=s.eraser, p=s.player, V=p.pos.constructor, C=e.arena;
  window.__in = () => { const dx=p.pos.x-C.x, dz=p.pos.z-C.z; return Math.hypot(dx,dz) < 9.0 && p.pos.z > -49.6 && p.pos.y > C.y-1.5; };
  window.__trial = (mode, ang, gap) => {
    // the target spot on the rim at angle ang; WAI 'gap' m in from it; the Eraser 4 m further in
    const dir = new V(Math.cos(ang), 0, Math.sin(ang));
    const rimR = 8.4;
    const wp = C.clone().addScaledVector(dir, rimR - gap); wp.y = C.y + 0.05;
    const ep = C.clone().addScaledVector(dir, rimR - gap - 4.2); ep.y = C.y + 0.05;
    e.setState('IDLE'); e.attackCd = 99; e.hideTells();
    e.pos.copy(ep); e.prevPos.copy(ep); e.facing = Math.atan2(dir.x, dir.z); e.body.setTranslation({x:ep.x, y:ep.y+e.cOff, z:ep.z}, true);
    p.teleport(wp, ang); p.hp = 6; p.invuln = 0;
    if (mode === 'charge') { e.dashDir.copy(dir); e.hitDone = false; e.setState('RUB'); }
    if (mode === 'knock') { p.takeHit(ep, 2, 16); }
    if (mode === 'buck') { const top = ep.clone(); top.y = e.topY + 0.05; p.teleport(top, ang); p.leap(dir, e.bodyRadius*2+2.2, 7); }
    return 1;
  };
  window.__read = () => ({ inside: __in(), pos: p.pos.toArray().map(v=>+v.toFixed(2)), hp: p.hp, paint: +(e.hp/e.maxHp).toFixed(4) });
  return 1`);
const res = [];
const angles = [];
for (let i = 0; i < 24; i++) angles.push((i / 24) * Math.PI * 2);
for (const k of [-0.18, -0.09, 0.09, 0.18]) angles.push(-Math.PI / 2 + k); // extra around the door (north)
for (const mode of ['charge', 'knock', 'buck']) {
  for (const ang of angles) for (const gap of [0.6, 1.6]) {
    await c.ev(`__trial('${mode}', ${ang}, ${gap}); return 1`);
    let left = false, at = null;
    for (let i = 0; i < 25; i++) { await c.adv(0.1); const r = await c.ev('return __read()'); if (!r.inside) { left = true; at = at ?? r; } }
    const end = await c.ev('return __read()');
    // the guard's window: up to 4 s more, standing still
    let back = end.inside, backT = 0;
    if (!end.inside) for (let i = 0; i < 40 && !back; i++) { await c.adv(0.1); backT += 0.1; back = (await c.ev('return __read()')).inside; }
    const fin = await c.ev('return __read()');
    res.push({ mode, ang: +(ang * 180 / Math.PI).toFixed(0), gap, left, endOut: !end.inside, at: at?.pos, back, backT: +backT.toFixed(1), hp: [end.hp, fin.hp], paint: [end.paint, fin.paint] });
  }
}
const sum = {};
for (const r of res) { const s = (sum[r.mode] ??= { trials: 0, leftEver: 0, endedOut: 0, stuckOut: 0, heartsLostToGuard: 0, paintChangedByGuard: 0 }); s.trials++; if (r.left) s.leftEver++; if (r.endOut) s.endedOut++; if (r.endOut && !r.back) s.stuckOut++; if (r.endOut && r.hp[1] !== r.hp[0]) s.heartsLostToGuard++; if (r.endOut && r.paint[1] !== r.paint[0]) s.paintChangedByGuard++; }
console.log('SUMMARY', JSON.stringify(sum));
for (const r of res.filter((r) => r.left)) console.log('OUT', JSON.stringify(r));
console.log('ERRS', JSON.stringify(await c.ev('return window.__errs ?? []').catch(() => 'n/a')));
process.exit(0);
