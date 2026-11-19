// Mute Harbor playthrough via WD_AGENT (+ T helpers). Copy of the old harbor bot (/tmp/wdstyle/h2bot.mjs), adapted to the
// level-2 expansion: 'pre' = mouth + ferry + clock (the Bell Bridge now stays up: Bandstand Pier comes next, see pier.mjs),
// 'post' = lighthouse + Hush + exit. Usage: node h2bot.mjs [all|pre|post|mouth|ferry|clock|light|boss|exit] [--walk]
import { connect, sleep } from './lib.mjs';
const { ev, shot, ws } = await connect();
const log = (...a) => console.log(new Date().toISOString().slice(14, 19), ...a);
const O = () => ev('return WD_AGENT.observe()');
const act = (c) => ev(`return WD_AGENT.act(${JSON.stringify(c)})`);
const errs = () => ev('return (window.__errs||[]).slice(-5)');
const organ = (o, t) => o.player.organs.find((x) => x.type === t);
const enemy = (o, id) => o.enemies.find((e) => e.id === id);
const stage = process.argv[2] ?? 'all';
const WALK = process.argv.includes('--walk');
const until = async (label, cond, maxS, tick, every = 300) => {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < maxS) {
    const o = await O();
    if (await cond(o)) { log('✓', label, ((Date.now() - t0) / 1000).toFixed(1) + 's'); return o; }
    if (tick) await tick(o);
    await sleep(every);
  }
  const o = await O();
  log('✗', label, 'TIMEOUT', JSON.stringify({ obj: o.objective, hint: o.hint, pos: o.player?.pos, hp: o.player?.hp }));
  await shot('fail_' + label.replace(/\W+/g, '_'));
  return null;
};
const guideTarget = () => ev('const t=__WD.app.session.guide.target; return t? [t.x,t.y,t.z] : null');
/** Deal with Hush moths near WAI: shout at a veiled one, spray a ringing one. Returns true if it acted. */
const mothTime = new Map();
const handleMoths = async (o, range = 9) => {
  const now = Date.now();
  const moths = o.enemies.filter((e) => {
    if (e.kind !== 'hushmoth' || e.harmless || e.dist >= range) return false;
    if (!mothTime.has(e.id)) mothTime.set(e.id, now);
    // a moth we can't get at for 10 s: walk on (players can ignore them too)
    return e.state === 'RINGING' || now - mothTime.get(e.id) < 10000;
  });
  if (!moths.length) return false;
  moths.sort((a, b) => a.dist - b.dist);
  const m = moths[0];
  const at = [m.pos[0], m.pos[1] + 0.6, m.pos[2]];
  if (m.state === 'RINGING') {
    await act({ type: 'spray', seconds: 0.6, at });
    if (m.dist > 6) await act({ type: 'move_to', x: m.pos[0], z: m.pos[2], run: true });
  } else {
    await act({ type: 'look_at', x: at[0], y: at[1], z: at[2] });
    await sleep(120);
    await act({ type: 'shout', at });
    if (m.state === 'TELL') await act({ type: 'dodge' });
  }
  return true;
};
const follow = async (label, done, maxS = 120, fight = true) => until(label, done, maxS, async (o) => {
  if (o.cinematic) return;
  if (fight && (await handleMoths(o, 7))) return;
  const g = await guideTarget();
  if (g) await act({ type: 'move_to', x: g[0], z: g[2], run: true });
}, 250);
const tp = async (x, y, z, yaw) => { await act({ type: 'stop' }); await ev(`T.tp(${x},${y},${z},${yaw ?? 'undefined'}); return 1`); await sleep(400); };
const shoutAt = async (p, big = false) => {
  await act({ type: 'look_at', x: p[0], y: p[1], z: p[2] });
  await sleep(350);
  await act({ type: 'shout', at: p, big });
  await sleep(big ? 1100 : 500);
};
const cineOver = () => until('cine over', (o) => !o.cinematic, 25);
/** Cross the moored boats: walk to the market landing, then hop deck to deck and jump up onto the old quay (3 tries). */
const crossDecks = async () => {
  const sp = await ev('const s=__WD.session.level.spots; return {e:[s.pontoonEast.x,s.pontoonEast.z], w:[s.pontoonWest.x,s.pontoonWest.z], d:s.decks.map(v=>[v.x,v.y,v.z])}');
  const hd = (p, q) => Math.hypot(p[0] - q[0], p[2] - q[1]);
  const legs = [...sp.d.map((v) => [v[0], v[2], v[1]]), [sp.w[0] - 1.2, sp.w[1], 1.5]];
  for (let attempt = 1; attempt <= 3; attempt++) {
    await until('at the market landing', (o) => hd(o.player.pos, sp.e) < 1.2, 40, (o) => o.cinematic ? null : act({ type: 'move_to', x: sp.e[0], z: sp.e[1], run: true }), 250);
    let all = true;
    for (const [i, [x, z, y]] of legs.entries()) {
      let jumped = false;
      const ok = await until(`leg ${i + 1}/${legs.length} (try ${attempt})`, (o) => Math.hypot(o.player.pos[0] - x, o.player.pos[2] - z) < 0.9 && o.player.pos[1] > y - 0.3, 12, async (o) => {
        if (o.cinematic) return;
        await act({ type: 'move_to', x, z, run: false });
        const d = Math.hypot(o.player.pos[0] - x, o.player.pos[2] - z);
        // take off at the edge of the deck WAI stands on (centres are 2.7 m apart; the last leg is the quay)
        if (!jumped && d < (i === legs.length - 1 ? 2.6 : 2.1)) { jumped = true; await act({ type: 'jump' }); }
        if (jumped && d > 3.2) jumped = false; // fell back (water → last deck): try again
      }, 60);
      if (!ok) { all = false; break; }
      if (attempt === 1) await shot(`h2_06_leg${i + 1}`);
    }
    if (all) { await act({ type: 'stop' }); return true; }
  }
  await act({ type: 'stop' });
  return false;
};

log('start', JSON.stringify(await errs()), 'level', (await O()).level);

const pre = stage === 'pre', post = stage === 'post';
if (stage === 'all' || pre || stage === 'mouth') {
  await shot('h2_00_start');
  // the Chomper Bin on the landing: spray its back, TAG it, take the Mouth
  await until('chomper repainted', (o) => { const e = enemy(o, 'chomper'); return !e || e.harmless || organ(o, 'MOUTH').have || o.droppedOrgans.some((d) => d.type === 'MOUTH'); }, 80, async (o) => {
    const e = enemy(o, 'chomper'); if (!e) return;
    const p = o.player.pos;
    await act({ type: 'move_to', x: e.pos[0] - e.facing[0] * 3.6, z: e.pos[2] - e.facing[1] * 3.6, run: true });
    await act({ type: 'spray', seconds: 0.5, at: [e.pos[0], e.pos[1] + 0.8, e.pos[2]] });
    if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) await act({ type: 'interact' });
    void p;
  }, 150);
  await shot('h2_01_chomper');
  await until('MOUTH collected', (o) => organ(o, 'MOUTH').have, 25, async (o) => {
    const d = o.droppedOrgans.find((x) => x.type === 'MOUTH');
    if (d) await act({ type: 'move_to', x: d.pos[0], z: d.pos[2], run: true });
  });
  await ev(`__WD.app.input.virtualDown('KeyR'); return 1`);
  await until('MOUTH purified', (o) => !organ(o, 'MOUTH').corrupted, 8);
  await ev(`__WD.app.input.virtualUp('KeyR'); return 1`);
  await sleep(600);
  // the bell gate: shout at its bell
  // move_to steers in a straight line. While the Mouth is purified the arrow can point south (26, 12) for a moment, and
  // WAI walks into the pocket between the nose and cyclops halls (x 29.7–32.3, z < 33.6, fence at 31.2); from there the
  // straight line to the bell runs into the nose hall (regression 2026-11-14). Step back out onto the landing first.
  if (WALK) {
    const p0 = (await O()).player.pos;
    if (p0[0] > 18 && p0[2] < 35) {
      for (const [x, z] of [[Math.min(33, Math.max(19, p0[0])), 35.8], [20, 35.8]])
        await until(`back onto the landing (${x.toFixed(1)}, ${z})`, (o) => Math.hypot(o.player.pos[0] - x, o.player.pos[2] - z) < 1.2, 12, (o) => o.cinematic ? null : act({ type: 'move_to', x, z, run: true }), 250);
    }
    await follow('walk to the gate (guide)', (o) => Math.hypot(o.player.pos[0] - 2, o.player.pos[2] - 33.5) < 3.5, 40, false);
  }
  else await tp(2, 0.8, 35, Math.PI);
  await shot('h2_02_gate_closed');
  await until('gate open', async () => ev('return __WD.session.level.gateOpen'), 15, async () => shoutAt([2, 5.2, 31.2]));
  await sleep(1500);
  await shot('h2_03_gate_open');
  log('errs', JSON.stringify(await errs()));
}

if (stage === 'all' || pre || stage === 'ferry') {
  if (stage === 'ferry') await ev(`__WD.session.debugWarp('mouth'); return 1`);
  await follow('walk to the ferry (guide)', (o) => (o.hosts.find((h) => h.id === 'ferry')?.dist ?? 99) < 4.5, 60);
  await until('lend MOUTH → ferry', (o) => o.guardiansAwake.includes('ferry'), 30, async (o) => { if (!o.cinematic) await act({ type: 'lend', organ: 'MOUTH', host: 'ferry' }); });
  await sleep(1800); await shot('h2_04_ferry_horn');
  await sleep(2600); await shot('h2_05_boats');
  await cineOver();
  await until('mouth back', (o) => organ(o, 'MOUTH').worn, 10);
  await until('pontoon ready', async () => ev('return __WD.session.level.pontoonReady'), 20);
  await sleep(800); await shot('h2_06_pontoon');
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}

if (stage === 'all' || pre || stage === 'clock') {
  if (stage === 'clock') await ev(`__WD.session.debugWarp('ferry'); return 1`);
  // cross the boats deck to deck, then climb to the square (fighting the moths on the way)
  await crossDecks();
  await shot('h2_06b_crossed');
  await follow('walk to the clock square (guide)', (o) => o.player.pos[1] > 4.5 && Math.hypot(o.player.pos[0] + 32, o.player.pos[2] + 24) < 11, 150);
  await shot('h2_07_square');
  // clear the square's moths first (they'd bother the fork chord)
  await until('square moths repainted', (o) => !o.enemies.some((e) => e.kind === 'hushmoth' && !e.harmless && e.dist < 16), 90, async (o) => {
    if (o.cinematic) return;
    const moths = o.enemies.filter((e) => e.kind === 'hushmoth' && !e.harmless && e.dist < 16);
    if (!moths.length) return;
    if (!(await handleMoths(o, 9))) await act({ type: 'move_to', x: moths[0].pos[0], z: moths[0].pos[2], run: true });
  }, 200);
  // the chord: three forks humming at once
  const forks = await ev('return __WD.session.level.forks.map(f=>[f.pos.x,f.pos.y,f.pos.z])');
  await until('clock awake', (o) => o.guardiansAwake.includes('clock'), 60, async (o) => {
    if (o.cinematic) return;
    for (const f of forks) {
      // walk up to each fork (≈5 m, from the square's side) and shout at it
      const dx = -32 - f[0], dz = -24 - f[2], l = Math.hypot(dx, dz);
      const tx = f[0] + (dx / l) * 5, tz = f[2] + (dz / l) * 5;
      await act({ type: 'move_to', x: tx, z: tz, run: true });
      for (let i = 0; i < 20; i++) { const q = await O(); if (Math.hypot(q.player.pos[0] - tx, q.player.pos[2] - tz) < 1.2) break; await sleep(150); }
      await shoutAt(f);
    }
  }, 500);
  await sleep(1500); await shot('h2_08_clock_bell');
  await sleep(3000); await shot('h2_09_bridge');
  await cineOver();
  // the Red Pen strikes the bridge out (a second cine follows the clock's own)
  await sleep(1500); await shot('h2_09b_redpen');
  await until('sky moment over', async () => ev('return !__WD.session.ctx.camera.inCine && __WD.session.pierBuilt.gateOpen'), 30);
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}

if (stage === 'all' || post || stage === 'light') {
  if (stage === 'light') await ev(`__WD.session.debugWarp('clock'); return 1`);
  await follow('walk to the lighthouse foot (guide)', (o) => Math.hypot(o.player.pos[0] - 13, o.player.pos[2] + 46.5) < 4.5, 120);
  await shot('h2_10_cocoon');
  const coc = await ev('const c=__WD.session.level.spots.cocoon; return [c.x,c.y,c.z]');
  await until('cocoon burst', async () => ev('return __WD.session.level.cocoonBurst'), 20, async () => shoutAt(coc, true));
  await follow('climb the spiral (guide)', (o) => o.player.pos[1] > 16, 120);
  await shot('h2_11_gallery');
  const lamp = await ev('const c=__WD.session.level.spots.lamp; return [c.x,c.y,c.z]');
  await until('lighthouse awake', (o) => o.guardiansAwake.includes('lighthouse'), 25, async (o) => {
    if (o.cinematic) return;
    const p = o.player.pos;
    if (Math.hypot(p[0] - lamp[0], p[2] - lamp[2]) > 3.2) await act({ type: 'move_to', x: lamp[0], z: lamp[2], run: false });
    await shoutAt(lamp, true);
  }, 600);
  await sleep(1500); await shot('h2_12_lighthouse');
  await sleep(3500); await shot('h2_13_hush_rises');
  await cineOver();
  log('woken', JSON.stringify((await O()).guardiansAwake), 'errs', JSON.stringify(await errs()));
}

if (stage === 'all' || post || stage === 'boss') {
  if (stage === 'boss') await ev(`__WD.session.debugWarp('lighthouse'); return 1`);
  await follow('go down to the arena (guide)', (o) => o.boss.awake, 120);
  await sleep(1200); await shot('h2_14_boss_intro');
  await cineOver();
  const t0 = Date.now(); let n = 0; const states = new Set(); let lastHp = 101;
  while ((Date.now() - t0) / 1000 < 300) {
    const o = await O();
    if (o.boss.repainted) break;
    states.add(o.boss.state);
    if (o.cinematic) { await sleep(200); continue; }
    const b = o.boss.pos; const p = o.player.pos;
    const d = Math.hypot(b[0] - p[0], b[2] - p[2]);
    const veiled = await ev('return __WD.session.hush.veiled');
    const core = [b[0], b[1] + 3.3, b[2]];
    const st = o.boss.state;
    if (p[1] < 3) { await ev('T.tp(3,4.3,-37,Math.PI/2); return 1'); log('fell → back'); }
    if (st === 'STING_TELL' && d < 13) await act({ type: 'dodge' });
    else if (st === 'DOME_TELL') await shoutAt(core);
    else if (st === 'DIVE_TELL') await act({ type: 'move', forward: 0, right: 1, seconds: 0.6 });
    else if (st === 'DIVE') await act({ type: 'jump' });
    else if (veiled && !['DIVE_UP'].includes(st)) await shoutAt(core);
    else {
      // circle at ~7 m and paint the core
      const ang = Math.atan2(p[2] - b[2], p[0] - b[0]) + 0.4;
      let tx = b[0] + Math.cos(ang) * 6.5, tz = b[2] + Math.sin(ang) * 6.5;
      const cx = tx - 9, cz = tz + 37, cr = Math.hypot(cx, cz);
      if (cr > 7.5) { tx = 9 + cx * 7.5 / cr; tz = -37 + cz * 7.5 / cr; }
      await act({ type: 'move_to', x: tx, z: tz, run: false });
      await act({ type: 'spray', seconds: 0.6, at: core });
      if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) await act({ type: 'interact' });
    }
    await handleMoths(o, 5);
    if (o.boss.hp <= lastHp - 15) { lastHp = o.boss.hp; await shot(`h2_15_boss_${String(n++).padStart(2, '0')}`); log('boss hp', o.boss.hp, 'state', st, 'wai hp', o.player.hp); }
    await sleep(150);
  }
  const o = await O();
  log('boss done?', o.boss.repainted, 'hp', o.boss.hp, 'states', [...states].join(','), 'time', ((Date.now() - t0) / 1000).toFixed(0));
  await act({ type: 'stop' });
  await sleep(2500); await shot('h2_16_finale');
  await sleep(4000); await shot('h2_17_finale2');
  await cineOver();
}

if (stage === 'all' || post || stage === 'boss' || stage === 'exit') {
  if (stage === 'exit') await ev(`__WD.session.debugWarp('exit'); return 1`);
  await until('boat docked', async () => ev('return __WD.session.guide.target != null'), 20);
  await follow('board the paper boat (guide)', async () => ev('return __WD.session.completed'), 90, false);
  await sleep(2500); await shot('h2_18_complete');
  log('state', await ev('return __WD.state + "|" + __WD.session.completed'));
}
log('end', JSON.stringify((await O()).objective), 'errs', JSON.stringify(await errs()));
ws.close();
