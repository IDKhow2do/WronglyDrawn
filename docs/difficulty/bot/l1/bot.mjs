import { connect, sleep } from './lib.mjs';
const { ev, shot, ws } = await connect();
const log = (...a) => console.log(new Date().toISOString().slice(14, 19), ...a);
const O = () => ev('return WD_AGENT.observe()');
const act = (c) => ev(`return WD_AGENT.act(${JSON.stringify(c)})`);
const until = async (label, cond, maxS, tick, every = 400) => { const t0 = Date.now(); while ((Date.now() - t0) / 1000 < maxS) { const o = await O(); if (await cond(o)) { log('✓', label, ((Date.now() - t0) / 1000).toFixed(1) + 's'); return o; } if (tick) await tick(o); await sleep(every); } const o = await O(); log('✗', label, 'TIMEOUT', JSON.stringify({ obj: o.objective, hint: o.hint, pos: o.player?.pos, hp: o.player?.hp, organs: o.player?.organs })); await shot('fail_' + label.replace(/\W+/g, '_')); return null; };
const errs = () => ev('return (window.__errs||[]).slice(-5)');
const organ = (o, t) => o.player.organs.find((x) => x.type === t);
const enemy = (o, id) => o.enemies.find((e) => e.id === id);
const fightTagAndTake = async (id, aimY, organType, maxS = 60, flank = false) => {
  // spray it until it reels, TAG it, pick up its organ
  await until(`${id} reeling/tagged`, async (o) => { const e = enemy(o, id); if (!e) return o.droppedOrgans?.some((d) => d.type === organType) || organ(o, organType).have; return e.harmless || e.repaintPct >= 100 || organ(o, organType).have; }, maxS, async (o) => {
    const e = enemy(o, id); if (!e) return;
    const p = o.player.pos; const d = Math.hypot(e.pos[0] - p[0], e.pos[2] - p[2]);
    if (flank && e.facing) await act({ type: 'move_to', x: e.pos[0] - e.facing[0] * 3.5, z: e.pos[2] - e.facing[1] * 3.5, run: true });
    else if (d > 7) await act({ type: 'move_to', x: e.pos[0] + (p[0] - e.pos[0]) * 5 / d, z: e.pos[2] + (p[2] - e.pos[2]) * 5 / d, run: true });
    else if (d < 2.5) await act({ type: 'move', forward: -1, right: 0.4, seconds: 0.3 });
    await act({ type: 'spray', seconds: 0.5, at: [e.pos[0], e.pos[1] + aimY, e.pos[2]] });
    if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) await act({ type: 'interact' });
    if (o.player.paintTank < 0.08) await act({ type: 'stop' });
  }, 150);
  await shot(`${id}_down`);
  await until(`${organType} collected`, (o) => organ(o, organType).have, 25, async (o) => {
    if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) await act({ type: 'interact' });
    // walk over the dropped organ: the session's drop list
    const d = (o.droppedOrgans ?? []).find((x) => x.type === organType);
    if (d) await act({ type: 'move_to', x: d.pos[0], z: d.pos[2], run: true });
  });
};
const purify = async (t) => {
  const key = { EYE: 'KeyQ', MOUTH: 'KeyR', LEG: 'KeyF' }[t];
  await ev(`__WD.app.input.virtualDown('${key}'); return 1`);
  const ok = await until(`${t} purified`, (o) => !organ(o, t).corrupted, 8);
  await ev(`__WD.app.input.virtualUp('${key}'); return 1`);
  return ok;
};
const lend = async (t, host, label) => {
  await until(`lend ${t} → ${host}`, (o) => organ(o, t).lentTo === host, 40, async (o) => {
    if (o.cinematic) return;
    await act({ type: 'lend', organ: t, host });
  });
  await sleep(1500); await shot(label);
  await until('cine over', (o) => !o.cinematic, 20);
};
const tp = async (x, y, z, yaw) => { await act({ type: 'stop' }); await ev(`T.tp(${x},${y},${z},${yaw ?? 'undefined'}); return 1`); await sleep(500); };
const follow = async (label, done, maxS = 90) => until(label, done, maxS, async (o) => {
  if (o.cinematic) return;
  const g = await ev('const t=__WD.app.session.guide.target; return t? [t.x,t.y,t.z] : null');
  if (g) await act({ type: 'move_to', x: g[0], z: g[2], run: true });
}, 300);
const recall = async (t) => { await act({ type: 'recall', organ: t }); return until(`recall ${t}`, (o) => !organ(o, t).lentTo, 10); };

const stage = process.argv[2] ?? 'all';
log('start', JSON.stringify(await errs()));
if (stage === 'all' || stage === 'eye') {
  await shot('00_start');
  await fightTagAndTake('starter-lamp', 3.4, 'EYE', 70);
  await purify('EYE');
  await lend('EYE', 'sleepyWall', '01_cliff_awake');
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}
if (stage === 'all' || stage === 'mouth') {
  await recall('EYE');
  if (process.env.WALK) await follow('walk to the chomper (guide)', (o) => (o.enemies.find((e) => e.id === 'chomper')?.dist ?? 99) < 9, 120);
  else await tp(-44, 0.3, 15, Math.PI * 1.2);
  await shot('02_quay');
  await fightTagAndTake('chomper', 0.8, 'MOUTH', 90, true);
  await purify('MOUTH');
  // the bastion is reached by its ramp on the south side (the arrow points straight at the face)
  if (process.env.WALK) for (const [x, z] of [[-48, 12.5], [-48, 6], [-46.5, -1]]) await until(`ramp ${x},${z}`, (o) => Math.hypot(o.player.pos[0] - x, o.player.pos[2] - z) < 1.2, 20, async () => act({ type: 'move_to', x, z, run: true }), 300);
  if (process.env.WALK) await follow('walk to the gatehouse (guide)', (o) => (o.hosts.find((h) => h.id === 'gatehouse')?.dist ?? 99) < 8, 120);
  else await tp(-45.5, 3.3, 0, Math.PI);
  await lend('MOUTH', 'gatehouse', '03_gate_awake');
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}
if (stage === 'all' || stage === 'statue') {
  if (process.env.WALK) await follow('walk to the statue (guide)', (o) => (o.hosts.find((h) => h.id === 'statue')?.dist ?? 99) < 7, 120);
  else await tp(-13, 1.8, 10, -Math.PI / 2);
  await lend('EYE', 'statue', '04_statue_awake');
  if (process.env.WALK || process.env.CLIMB) { await ev(process.env.FROM_QUAY ? 'T.tp(-45,0.4,15,0); return 1' : 'T.tp(0,1.7,0,Math.PI); return 1'); await follow('climb to the summit (guide)', (o) => o.eraser.awake, 180); await shot('05_summit_walk'); }
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}
log('end', JSON.stringify((await O()).objective), JSON.stringify(await errs()));
ws.close();
