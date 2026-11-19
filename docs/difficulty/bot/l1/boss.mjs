import { connect, sleep } from './lib.mjs';
const { ev, shot, ws } = await connect();
const log = (...a) => console.log(new Date().toISOString().slice(14, 19), ...a);
const O = () => ev('return WD_AGENT.observe()');
const act = (c) => ev(`return WD_AGENT.act(${JSON.stringify(c)})`);
await act({ type: 'stop' });
let o;
if (process.argv[2] === 'walk') {
  // climb the switchbacks by the guide arrow (no warp) until the Eraser engages
  const t0c = Date.now();
  while (!(o = await O()).eraser.awake && (Date.now() - t0c) / 1000 < 240) {
    if (!o.cinematic) { const g = await ev('const t=__WD.app.session.guide.target; return t? [t.x,t.y,t.z] : null'); if (g) await act({ type: 'move_to', x: g[0], z: g[2], run: true }); else await act({ type: 'move_to', x: 0, z: -40, run: false }); }
    await sleep(300);
  }
  log('climbed to the summit in', ((Date.now() - t0c) / 1000).toFixed(0), 's, awake', o.eraser.awake);
} else {
  await ev('__WD.app.session.debugWarp("summit"); return 1'); await sleep(6000); await ev('T.tp(0, 14.4, -35.5, Math.PI); return 1');
  o = await O(); log('at summit edge', JSON.stringify(o.player.pos), 'eraser', JSON.stringify(o.eraser));
  await act({ type: 'move_to', x: 0, z: -39, run: false });
  for (let i = 0; i < 30 && !(o = await O()).eraser.awake; i++) await sleep(300);
}
log('boss awake?', o.eraser.awake, 'cine', o.cinematic); await sleep(1200); await shot('05_boss_intro');
for (let i = 0; i < 40 && (o = await O()).cinematic; i++) await sleep(300);
log('intro over', JSON.stringify(o.objective), JSON.stringify(o.hint));
const t0 = Date.now(); let lastHp = 100; let shots = 0; const states = new Set();
while ((Date.now() - t0) / 1000 < 240) {
  o = await O();
  if (o.eraser.repainted) break;
  const st = await ev("return __WD.app.session.eraser.state"); states.add(st);
  const e = o.eraser.pos; const p = o.player.pos;
  const d = Math.hypot(e[0] - p[0], e[2] - p[2]);
  if (st === 'RUB_TELL' && d < 12) { await act({ type: 'dodge' }); }
  if (!o.cinematic) {
    if (p[1] < 13) { await ev('T.tp(0, 14.4, -37, Math.PI); return 1'); log('fell off the summit → back up'); }
    // circle the boss at ~8 m, staying inside the arena (centre 0,-43 r 9.5)
    const ang = Math.atan2(p[2] - e[2], p[0] - e[0]) + 0.5;
    let tx = e[0] + Math.cos(ang) * 8, tz = e[2] + Math.sin(ang) * 8;
    const cx = tx - 0, cz = tz + 43, cr = Math.hypot(cx, cz);
    if (cr > 7.5) { tx = cx * 7.5 / cr; tz = -43 + cz * 7.5 / cr; }
    await act({ type: 'move_to', x: tx, z: tz, run: d < 6 });
    await act({ type: 'spray', seconds: 0.5, at: [e[0], e[1] + 2.4, e[2]] });
    if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) await act({ type: 'interact' });
  }
  if (o.eraser.hp <= lastHp - 20 || (Date.now() - t0) / 1000 > shots * 25) { lastHp = o.eraser.hp; await shot(`06_boss_${String(shots++).padStart(2, '0')}`); log('boss hp', o.eraser.hp, 'state', st, 'wai hp', o.player.hp); }
  await sleep(150);
}
o = await O(); log('boss done?', o.eraser.repainted, 'hp', o.eraser.hp, 'states', [...states].join(','), 'wai', o.player.hp, 'time', ((Date.now() - t0) / 1000).toFixed(0));
await act({ type: 'stop' });
for (let i = 0; i < 40 && (o = await O()).cinematic; i++) await sleep(400);
await shot('07_finale'); log('objective', o.objective, o.hint);
let done = false;
for (let i = 0; i < 120 && !done; i++) {
  const st = await ev('return __WD.state + "|" + __WD.app.session.completed');
  if (st.includes('true')) { log('LEVEL COMPLETE', st); done = true; break; }
  // run, not walk: at the agent's walk (stick 0.6, 2.6 m/s) WAI cannot step up the summit stairs' 0.5 m risers, and a
  // smudge after the win (the Eraser's grubs stay) respawns him at their foot (regression 2026-11-14)
  if (i % 5 === 0) { const oo = await O(); if (!oo.cinematic) await act({ type: 'move_to', x: 0, z: -50.5, run: true }); if (i % 20 === 0) log('to the door', JSON.stringify(oo.player.pos)); }
  await sleep(400);
}
if (!done) log('LEVEL NOT COMPLETE');
await sleep(2500); await shot('08_complete');
log('errs', JSON.stringify(await ev('return (window.__errs||[]).slice(-5)')));
ws.close();
