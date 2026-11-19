// Normal difficulty: the partner smudged mid-fight does NOT refill the boss; WAI smudged does (control).
import { connect } from './lib.mjs';
const c = await connect();
const out = await c.ev(`
  __WD.app.loop.stop();
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  const D = (await import('/src/meta/Difficulty.ts')).Difficulty;
  s.debugWarp('inkwell'); __WD.advance(1.5);
  const e = s.enemies.find((x) => x.id === 'inkwell');
  e.alerted = true;
  s.player.teleport(e.pos.clone().add(new T(0, 0.2, 6)), Math.PI); __WD.advance(0.5);
  pip.teleportNear(s.player.pos, s.player.facing, 'regroup', true); __WD.advance(1.6);
  e.hp = e.maxHp * 0.55;
  s.player.invuln = 999; // WAI stays out of it for part A
  const before = { hp: Math.round(e.hp), refillT: e.refillT };
  // A) only she is smudged (a real hit path: her takeHit)
  e.alerted = true; pip.invuln = 0; pip.hp = 1; pip.takeHit(e.pos, 1, 5);
  const smudged = pip.health.phase; const engagedA = e.engaged;
  let lowest = e.hp, refilledA = false;
  for (let t = 0; t < 7; t += 0.1) { e.alerted = true; __WD.advance(0.1); lowest = Math.min(lowest, e.hp); if (e.refillT > 0) refilledA = true; }
  const A = { difficulty: D.id, bossReset: D.s.bossReset, herPhaseAfterHit: smudged, bossEngagedAtHerSmudge: engagedA, bossEngagedAfter: e.engaged, back: pip.health.phase, herHp: pip.hp, bossBefore: before, bossAfter: Math.round(e.hp), refilled: refilledA, sessionSmudges: s.stats.smudges };
  // B) control: WAI smudged in the same fight
  e.hp = e.maxHp * 0.55; e.alerted = true; const engagedB = e.engaged; s.player.invuln = 0; s.player.hp = 0;
  let refilledB = false;
  for (let t = 0; t < 4; t += 0.1) { if (t < 0.2) e.alerted = true; __WD.advance(0.1); if (e.refillT > 0) refilledB = true; }
  const B = { bossEngagedAtWaiSmudge: engagedB, refilled: refilledB, bossNow: Math.round(e.hp), max: e.maxHp, sessionSmudges: s.stats.smudges };
  return JSON.stringify({ A, B }, null, 1);
`);
console.log(out);
process.exit(0);
