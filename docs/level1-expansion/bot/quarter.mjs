// Level-1 expansion bot: from the Gatehouse's wake, walk the Crossed-Out Quarter by the guide arrow,
// fight what's there, cross the tear, paint the spring, beat the Red Inkwell, wake the statue.
import { connect, sleep } from './lib.mjs';
const c = await connect();
const t00 = Date.now();
const log = (...a) => console.log(((Date.now() - t00) / 1000).toFixed(0).padStart(4) + 's', ...a);
const act = (x) => c.ev(`return WD_AGENT.act(${JSON.stringify(x)})`);
const O = () => c.ev('return WD_AGENT.observe()');
const S = () => c.ev(`const s=__WD.app.session; const q=s.quarter; const k=q.inkwell; const g=s.guide.target;
  return { g: g? g.toArray():null, ink:{st:k.state,t:+k.stateT.toFixed(2),corked:k.corked,hp:Math.round(k.hp),pos:k.pos.toArray(),stag:k.canBeTagged, engaged:k.engaged},
    cleared:q.cleared, spring: s.ambient3.springDone(s.level.quarter.springs[0].pos), staplers: s.enemies.filter(e=>e.kind==='stapler'&&!e.harmless).map(e=>({id:e.id,st:e.state,t:e.stateT,pin:e.pinned,pos:e.pos.toArray()})) }`);
const inTear = (x, z) => x > 37.8 && x < 44.7 && z < -30.4 && z > -43.2;
const safeMove = (x, z, run) => (inTear(x, z) ? Promise.resolve() : act({ type: 'move_to', x, z, run }));
const ENEMY_KINDS = new Set(['grub', 'stapler', 'whiteout', 'lamp']);
const stats = { fights: {}, falls: 0 };
let lastShot = 0;
const shotEvery = async (name) => { if (Date.now() - lastShot > 15000) { lastShot = Date.now(); await c.shot(name); } };

async function fightStep(o, s) {
  const p = o.player.pos;
  // pinned: mash
  if (s.staplers.some((x) => x.st === 'PIN')) { for (let i = 0; i < 7; i++) { await act({ type: 'jump' }); await sleep(100); } return true; }
  if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) { await act({ type: 'interact' }); await sleep(250); return true; }
  // a stapler crouching at us: side-step + roll late in the tell
  for (const st of s.staplers) if (st.st === 'CROUCH' && st.t > 0.55 && Math.hypot(st.pos[0] - p[0], st.pos[2] - p[2]) < 10) { await act({ type: 'move', forward: 0, right: 1, seconds: 0.35 }); await sleep(20); await act({ type: 'dodge' }); await sleep(300); return true; }
  const tearZ = (z) => z < -30.5 && z > -43;
  const across = (e) => tearZ(e.pos[2]) && tearZ(p[2]) && Math.sign(e.pos[0] - 41.2) !== Math.sign(p[0] - 41.2);
  const foes = o.enemies.filter((e) => ENEMY_KINDS.has(e.kind) && !e.harmless && e.dist < 13 && Math.abs(e.pos[1] - p[1]) < 3 && (e.state !== 'IDLE' || e.dist < 7) && !across(e));
  if (!foes.length) return false;
  const e = foes.sort((a, b) => a.dist - b.dist)[0];
  stats.fights[e.id] = (stats.fights[e.id] ?? 0) + 1;
  const aimY = e.kind === 'lamp' ? 3.4 : e.kind === 'grub' ? 0.3 : 0.8;
  if (e.kind === 'whiteout' && e.state !== 'DIZZY') {
    await safeMove(e.pos[0] - e.facing[0] * 3.5, e.pos[2] - e.facing[1] * 3.5, true);
  } else if (e.dist > 7) await safeMove(e.pos[0] + (p[0] - e.pos[0]) * 5 / e.dist, e.pos[2] + (p[2] - e.pos[2]) * 5 / e.dist, true);
  else if (e.dist < 2.5 && e.kind !== 'grub') await act({ type: 'move', forward: -1, right: 0.4, seconds: 0.3 });
  else if (Math.random() < 0.3) await act({ type: 'move', forward: 0, right: Math.random() < 0.5 ? 1 : -1, seconds: 0.4 }); // strafe: no staring through a kiosk
  await act({ type: 'spray', seconds: 0.45, at: [e.pos[0], e.pos[1] + aimY, e.pos[2]] });
  return true;
}

async function bossStep(o, s) {
  const k = s.ink; const p = o.player.pos; const e = k.pos;
  const d = Math.hypot(e[0] - p[0], e[2] - p[2]);
  if ((k.st === 'LINE_TELL' && k.t > 0.85) || (k.st === 'CROSS_TELL' && k.t > 0.65)) { await act({ type: 'jump' }); await sleep(250); return; }
  if (o.prompt && /TAG|盖上涂鸦/i.test(o.prompt)) { await act({ type: 'interact' }); await sleep(300); return; }
  if (k.corked && !k.stag) {
    if (d > 3) await act({ type: 'move_to', x: e[0] + (p[0] - e[0]) * 2.4 / d, z: e[2] + (p[2] - e[2]) * 2.4 / d, run: true });
    else { await act({ type: 'stop' }); await act({ type: 'jump' }); await sleep(230); await act({ type: 'dodge' }); await sleep(600); }
    return;
  }
  const ang = Math.atan2(p[2] - e[2], p[0] - e[0]) + 0.35;
  await act({ type: 'move_to', x: e[0] + Math.cos(ang) * 6, z: e[2] + Math.sin(ang) * 6, run: false });
  await act({ type: 'spray', seconds: 0.5, at: [e[0], e[1] + (k.stag ? 1.5 : 2.9), e[2]] });
}

const start = process.argv[2] ?? 'gate';
if (start !== 'none') { await c.ev(`__WD.app.session.debugWarp('${start}'); return 1`); await sleep(1500); }
await c.ev("__WD.app.session.stats.time = 0; return 1");
let phase = 'walk'; let aiming = false; const tStart = Date.now(); let lastP = null, stuckT = 0; let lastLog = 0;
const marks = {};
while ((Date.now() - tStart) / 1000 < 900) {
  const o = await O(); const s = await S();
  if (o.cinematic) { await sleep(250); continue; }
  const p = o.player.pos;
  if (o.guardiansAwake.includes('statue')) { log('STATUE AWAKE'); break; }
  if (!marks.quarter && p[0] > 27.5 && p[1] > 11.5) { marks.quarter = (Date.now() - tStart) / 1000; log('entered the quarter', JSON.stringify(p)); await c.shot('qb_enter'); }
  if (!marks.boss && s.ink.engaged) { marks.boss = (Date.now() - tStart) / 1000; log('boss engaged'); }
  if (!marks.cleared && s.cleared) { marks.cleared = (Date.now() - tStart) / 1000; log('quarter cleared'); await c.shot('qb_cleared'); }
  if (Date.now() - lastLog > 10000) { lastLog = Date.now(); log('pos', JSON.stringify(p), 'hp', o.player.hp, 'hint', o.hint, 'guide', JSON.stringify(s.g?.map((v) => +v.toFixed(1)))); await shotEvery('qb_' + Math.round((Date.now() - tStart) / 1000)); }
  // the boss. The Inkwell can wake while WAI is still south of the East Walk barricade (x 48.6–55.8, z -24.4):
  // then the only way in is the spring, not a straight walk at the boss (regression 2026-11-14, Normal run 2).
  const southOfBar = !s.cleared && p[2] < -24.2 && p[0] > 46 && p[1] < 15.5;
  if (s.ink.engaged && !s.cleared && !southOfBar) { if (aiming) { await act({ type: 'aim', on: false }); aiming = false; } await bossStep(o, s); await sleep(150); continue; }
  // fights on the way
  if (await fightStep(o, s)) { await sleep(150); continue; }
  // the statue at the end
  if (s.cleared && (o.hosts.find((h) => h.id === 'statue')?.dist ?? 99) < 8) { await act({ type: 'lend', organ: 'EYE', host: 'statue' }); await sleep(2500); continue; }
  // the tear: aim at the planks and walk over
  const atTear = p[0] > 33.5 && p[0] < 44.6 && p[2] < -33.5 && p[2] > -39.5 && p[1] > 12 && !s.cleared;
  if (atTear) {
    if (!aiming) { await act({ type: 'aim', on: true }); aiming = true; }
    await act({ type: 'look_at', x: Math.min(45, Math.max(41, p[0] + 3)), y: 12.6, z: -36.6 });
    // line up with the planks first, then walk straight over
    if (p[0] < 38.2 && Math.abs(p[2] + 36.6) > 0.9) await act({ type: 'move_to', x: 37.3, z: -36.6, run: false });
    else await act({ type: 'move_to', x: 46, z: -36.6, run: false });
    await sleep(200); continue;
  } else if (aiming) { await act({ type: 'aim', on: false }); aiming = false; }
  // the spring: paint it, then jump on it
  const sp = [52.2, 13, -27.4];
  const dSp = Math.hypot(sp[0] - p[0], sp[2] - p[2]);
  if (!s.cleared && (dSp < 7 || (southOfBar && s.ink.engaged)) && p[1] > 12 && p[2] < -24.6) {
    if (!s.spring) { await act({ type: 'move_to', x: sp[0] - 2.5, z: sp[2] - 2.5, run: false }); await act({ type: 'spray', seconds: 0.8, at: [sp[0], sp[1], sp[2]] }); await sleep(600); continue; }
    await act({ type: 'move_to', x: sp[0], z: sp[2], run: false }); await sleep(300); continue;
  }
  // otherwise: follow the arrow
  if (s.g) await act({ type: 'move_to', x: s.g[0], z: s.g[2], run: true });
  // stuck detector
  if (lastP && Math.hypot(lastP[0] - p[0], lastP[2] - p[2]) < 0.05) { stuckT += 0.3; if (stuckT > 6) { log('STUCK at', JSON.stringify(p), 'guide', JSON.stringify(s.g)); await c.shot('qb_stuck'); stuckT = 0; await act({ type: 'jump' }); } } else stuckT = 0;
  lastP = p;
  await sleep(300);
}
const o = await O();
const gameT = await c.ev('return __WD.app.session.stats.time');
log('END marks', JSON.stringify(marks), 'game time', gameT.toFixed(0), 'hp', o.player.hp, 'fights', JSON.stringify(stats.fights), 'errs', JSON.stringify(await c.ev('return (window.__errs||[]).slice(-5)')));
await c.shot('qb_end');
process.exit(0);
