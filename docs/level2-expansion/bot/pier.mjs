// Level-2 expansion bot: from the clock's wake (or a warp), walk Bandstand Pier by the guide arrow,
// fight what's there (crabs: shout when the lid is open; jellies: aim with the Eye, spray), cross the
// fog walk with True Sight, paint the spring, beat the Red Gramophone, until the Bell Bridge is down.
// Usage: node pier.mjs [none|clock|pier|gramophone] [--gallery]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const t00 = Date.now();
const log = (...a) => console.log(((Date.now() - t00) / 1000).toFixed(0).padStart(4) + 's', ...a);
const act = (x) => c.ev(`return WD_AGENT.act(${JSON.stringify(x)})`);
const O = () => c.ev('return WD_AGENT.observe()');
const S = () => c.ev(`const s=__WD.app.session; const d=s.pier; const k=d.gramophone; const g=s.guide.target;
  return { g: g? g.toArray():null, gr:{st:k.state,t:+k.stateT.toFixed(2),hp:Math.round(k.hp),pos:k.pos.toArray(),stag:k.canBeTagged,engaged:k.engaged,dazed:k.dazed,sweep:k.sweepAngle,facing:k.facing,phase:k.phase,disposed:k.disposed},
    cleared:d.cleared, bridge:s.level.bridgeDown, gate:s.pierBuilt.gateOpen, spring: !!s.ambient3.springDone(s.pierBuilt.spring.pos), springPos: s.pierBuilt.spring.pos.toArray(),
    eye: !!s.inventory.get('EYE'), eyeCorrupt: !!s.inventory.get('EYE')?.corrupted, eyeWorn: s.inventory.worn('EYE'), mouthWorn: s.inventory.worn('MOUTH'),
    jellies: s.enemies.filter(e=>e.kind==='fogjelly'&&!e.harmless).map(e=>({id:e.id,st:e.state,pos:e.pos.toArray(),seen:e.seen})),
    crabs: s.enemies.filter(e=>e.kind==='megacrab'&&!e.harmless).map(e=>({id:e.id,st:e.state,t:e.stateT,pos:e.pos.toArray(),tag:e.canBeTagged})),
    locks: [s.pierBuilt.yardLock.open, s.pierBuilt.springLock.open],
    eyeDrop: (s.organs.worldOrgans.find(w=>!w.disposed&&w.organ.type==='EYE')||{}).at?.toArray?.() ?? null, cine: s.ctx.camera.inCine }`);
const stats = { fights: {}, falls: 0, hits: 0 };
let lastShot = 0;
const shotEvery = async (name) => { if (Date.now() - lastShot > 15000) { lastShot = Date.now(); await c.shot(name); } };
let aiming = false;
const aim = async (on) => { if (aiming !== on) { await act({ type: 'aim', on }); aiming = on; } };

async function shoutAt(p, big = false) {
  await act({ type: 'look_at', x: p[0], y: p[1], z: p[2] });
  await sleep(120);
  await act({ type: 'shout', at: p, big });
  await sleep(big ? 950 : 260);
}

async function fightStep(o, s) {
  const p = o.player.pos;
  if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) { await act({ type: 'interact' }); await sleep(250); return true; }
  // crabs: shout into the open lid, spray the flipped ones
  const near = (q, r) => Math.hypot(q[0] - p[0], q[2] - p[2]) < r && Math.abs(q[1] - p[1]) < 2.5;
  const crabs = s.crabs.filter((k) => near(k.pos, 12)).sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]));
  for (const k of crabs) {
    if (k.st === 'OPEN' && near(k.pos, 9.5)) { stats.fights[k.id] = (stats.fights[k.id] ?? 0) + 1; await aim(false); await shoutAt([k.pos[0], k.pos[1] + 1.2, k.pos[2]]); return true; }
  }
  const flipped = crabs.find((k) => k.st === 'FLIPPED');
  if (flipped) { await aim(false); await act({ type: 'spray', seconds: 0.5, at: [flipped.pos[0], flipped.pos[1] + 0.6, flipped.pos[2]] }); if (Math.hypot(flipped.pos[0] - p[0], flipped.pos[2] - p[2]) > 5) await act({ type: 'move_to', x: flipped.pos[0], z: flipped.pos[2], run: true }); return true; }
  // jellies: aim with the Eye, spray the heart (move under it a bit, but not into the ring)
  const jel = s.jellies.filter((j) => near(j.pos, 9.5)).sort((a, b) => Math.hypot(a.pos[0] - p[0], a.pos[2] - p[2]) - Math.hypot(b.pos[0] - p[0], b.pos[2] - p[2]))[0];
  const onWalk = p[0] < -61.5 && p[0] > -76.5 && p[2] < -60 && p[2] > -70;
  if (jel && s.eyeWorn) {
    stats.fights[jel.id] = (stats.fights[jel.id] ?? 0) + 1;
    await aim(true);
    const d = Math.hypot(jel.pos[0] - p[0], jel.pos[2] - p[2]);
    // on the walkway: stand still and paint (stepping back would drop WAI into the fog)
    if (!onWalk && (jel.st === 'TELL' || d < 2.5)) await act({ type: 'move', forward: -1, right: 0.6, seconds: 0.35 });
    else if (onWalk) await act({ type: 'stop' });
    await act({ type: 'spray', seconds: 0.5, at: [jel.pos[0], jel.pos[1] + 1.1, jel.pos[2]] });
    return true;
  }
  // a crab with its lid shut and nothing else: keep ~6 m, spray it (×0.3, slow but it adds up)
  const k = crabs[0];
  if (k && near(k.pos, 9) && k.st !== 'CATCH' && k.st !== 'RETURN') {
    stats.fights[k.id] = (stats.fights[k.id] ?? 0) + 1;
    await aim(false);
    const d = Math.hypot(k.pos[0] - p[0], k.pos[2] - p[2]);
    if (d < 4) await act({ type: 'move', forward: -1, right: 0.5, seconds: 0.3 });
    else if (Math.random() < 0.3) await act({ type: 'move', forward: 0, right: Math.random() < 0.5 ? 1 : -1, seconds: 0.35 });
    await act({ type: 'spray', seconds: 0.45, at: [k.pos[0], k.pos[1] + 0.8, k.pos[2]] });
    return true;
  }
  return false;
}

async function bossStep(o, s) {
  const k = s.gr; const p = o.player.pos; const e = k.pos;
  const d = Math.hypot(e[0] - p[0], e[2] - p[2]);
  if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) { await act({ type: 'interact' }); await sleep(300); return; }
  const mouth = [e[0] + Math.sin(k.facing) * 1.5, e[1] + 4.6, e[2] + Math.cos(k.facing) * 1.5];
  if (k.st === 'INHALE') { await aim(false); await shoutAt(mouth, true); return; }
  if (k.st === 'SWEEP') {
    const bear = Math.atan2(p[0] - e[0], p[2] - e[2]);
    let da = Math.atan2(Math.sin(bear - k.sweep), Math.cos(bear - k.sweep));
    if (Math.abs(da) < 0.75) { await act({ type: 'jump' }); await sleep(350); }
    return;
  }
  if (k.st === 'HUSH') { const r = 0.6 + 8 * k.t; if (Math.abs(r - d) < 1.6) { await act({ type: 'jump' }); await sleep(350); } return; }
  if (k.st === 'BLARE_TELL') { await act({ type: 'move', forward: 0, right: 1, seconds: 0.5 }); return; }
  if (k.dazed) { await aim(false); if (d > 6) await act({ type: 'move_to', x: e[0] + (p[0] - e[0]) * 5 / d, z: e[2] + (p[2] - e[2]) * 5 / d, run: true }); await act({ type: 'spray', seconds: 0.5, at: [e[0], e[1] + 1.6, e[2]] }); return; }
  if (await fightStep(o, s)) return;
  const ang = Math.atan2(p[2] - e[2], p[0] - e[0]) + 0.3;
  await act({ type: 'move_to', x: e[0] + Math.cos(ang) * 6.5, z: e[2] + Math.sin(ang) * 6.5, run: false });
  await act({ type: 'spray', seconds: 0.45, at: [e[0], e[1] + 1.4, e[2]] });
}

const start = process.argv[2] ?? 'pier';
const gallery = process.argv.includes('--gallery');
if (start !== 'none') { await c.ev(`__WD.app.session.debugWarp('${start}'); return 1`); await sleep(1500); }
await c.ev('__WD.app.session.stats.time = 0; return 1');
const tStart = Date.now(); let lastP = null, stuckT = 0, lastLog = 0;
const marks = {};
while ((Date.now() - tStart) / 1000 < 900) {
  const o = await O(); const s = await S();
  if (o.cinematic || s.cine) { await sleep(250); continue; }
  const p = o.player.pos;
  if (s.bridge && s.cleared) { log('BRIDGE DOWN'); break; }
  if (!marks.pier && p[2] < -52.6 && p[0] < -40) { marks.pier = (Date.now() - tStart) / 1000; log('on the pier'); }
  if (!marks.eye && s.eye) { marks.eye = (Date.now() - tStart) / 1000; log('got an EYE'); }
  if (!marks.walk && p[0] < -77) { marks.walk = (Date.now() - tStart) / 1000; log('crossed the fog walk'); await c.shot('pb_landing'); }
  if (!marks.boss && s.gr.engaged) { marks.boss = (Date.now() - tStart) / 1000; log('gramophone engaged'); await c.shot('pb_boss'); }
  if (!marks.cleared && s.cleared) { marks.cleared = (Date.now() - tStart) / 1000; log('gramophone repainted'); await c.shot('pb_cleared'); }
  if (Date.now() - lastLog > 10000) { lastLog = Date.now(); log('pos', JSON.stringify(p.map((v) => +v.toFixed(1))), 'hp', o.player.hp, 'hint', o.hint, 'guide', JSON.stringify(s.g?.map((v) => +v.toFixed(1))), s.gr.engaged ? `gramo ${s.gr.st} hp ${s.gr.hp}` : ''); await shotEvery('pb_' + Math.round((Date.now() - tStart) / 1000)); }
  // the Eye: purify it, wear it
  if (s.eye && s.eyeCorrupt) { await c.ev("__WD.app.input.virtualDown('KeyQ'); return 1"); await sleep(2600); await c.ev("__WD.app.input.virtualUp('KeyQ'); return 1"); continue; }
  if (s.eyeDrop) { await act({ type: 'move_to', x: s.eyeDrop[0], z: s.eyeDrop[2], run: true }); await sleep(300); continue; }
  if (s.gr.engaged && !s.cleared) { await bossStep(o, s); await sleep(140); continue; }
  // no Eye yet: shout at the Lost & Found bell on the ticket booth
  if (!s.eye && p[2] < -52.6 && p[2] > -73 && p[0] > -57) {
    const lf = await c.ev('return __WD.app.session.pierBuilt.lostFound.toArray()');
    if (Math.hypot(lf[0] - p[0], lf[2] + 3.5 - p[2]) > 1.2) { await act({ type: 'move_to', x: lf[0], z: lf[2] + 3.5, run: true }); await sleep(300); continue; }
    await aim(false); await shoutAt(lf); await sleep(900); continue;
  }
  if (await fightStep(o, s)) { await sleep(140); continue; }
  // before the fog walk: lure the jellies to the solid deck and paint them there (they sting on the walkway)
  if (s.eyeWorn && p[0] > -62.3 && p[0] < -55 && p[2] < -59 && p[2] > -73) {
    const j = s.jellies.find((q) => q.id.startsWith('p-jelly-walk') && Math.hypot(q.pos[0] - p[0], q.pos[2] - p[2]) < 11.5);
    if (j) { await aim(true); await act({ type: 'move_to', x: -58.5, z: -66, run: false }); await act({ type: 'look_at', x: j.pos[0], y: j.pos[1] + 1.1, z: j.pos[2] }); await sleep(300); continue; }
  }
  // the fog walk: aim with the Eye at the next bend and walk the zigzag
  const onWalk = p[0] < -59.5 && p[0] > -77 && p[2] < -60 && p[2] > -70 && p[1] > 5;
  if (onWalk && s.g) {
    // aim at the next bend (True Sight shows the planks), turn, then short careful steps (no auto-detour hops)
    await aim(true); await act({ type: 'stop' });
    await act({ type: 'look_at', x: s.g[0], y: s.g[1] - 0.6, z: s.g[2] }); await sleep(260);
    const dd = Math.hypot(s.g[0] - p[0], s.g[2] - p[2]);
    await act({ type: 'move', forward: 1, right: 0, seconds: Math.min(0.45, 0.12 + dd * 0.08) }); await sleep(200); continue;
  }
  await aim(false);
  // optional: the Echo Gallery
  if (gallery && !marks.gallery && p[0] < -76 && p[2] > -72 && p[2] < -58) {
    marks.gallery = 1; log('echo gallery…');
    const r = await c.ev(`const s=__WD.app.session; return s.pier.gallery.won`);
    if (!r) { await act({ type: 'move_to', x: -81, z: -53.5, run: true }); await sleep(2500);
      for (let i = 0; i < 70; i++) { const h = await c.ev(`const g=__WD.app.session.pier.gallery; const i=g.cur; const h=g.horns[i]; return h&&h.up>0.6&&!g.hit? h.pos.toArray():null`); if (h) await shoutAt(h); await sleep(200); }
      log('gallery won?', await c.ev('return __WD.app.session.pier.gallery.won')); }
  }
  // the spring: paint it, then jump on it
  const sp = s.springPos;
  const dSp = Math.hypot(sp[0] - p[0], sp[2] - p[2]);
  if (!s.cleared && dSp < 7 && p[1] < 7.5 && p[0] < -69) {
    if (!s.spring) { await act({ type: 'move_to', x: sp[0] - 2.2, z: sp[2] - 2.2, run: false }); await act({ type: 'spray', seconds: 0.8, at: [sp[0], sp[1], sp[2]] }); await sleep(500); continue; }
    if (s.locks[1]) { await act({ type: 'move_to', x: sp[0], z: sp[2], run: false }); await sleep(300); continue; }
  }
  if (s.g) await act({ type: 'move_to', x: s.g[0], z: s.g[2], run: true });
  if (lastP && Math.hypot(lastP[0] - p[0], lastP[2] - p[2]) < 0.05) { stuckT += 0.3; if (stuckT > 6) { log('STUCK at', JSON.stringify(p), 'guide', JSON.stringify(s.g)); await c.shot('pb_stuck'); stuckT = 0; await act({ type: 'jump' }); } } else stuckT = 0;
  if (p[1] < 3 && lastP && lastP[1] > 4) stats.falls++;
  lastP = p;
  await sleep(250);
}
await aim(false);
const o = await O();
const gameT = await c.ev('return __WD.app.session.stats.time');
log('END marks', JSON.stringify(marks), 'game time', gameT.toFixed(0), 'hp', o.player.hp, 'fights', JSON.stringify(stats.fights), 'falls', stats.falls, 'errs', JSON.stringify(await c.ev('return (window.__errs||[]).slice(-5)')));
await c.shot('pb_end');
process.exit(0);
