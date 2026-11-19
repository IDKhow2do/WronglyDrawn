// The same creature attack on WAI, then on the partner (she holds its aggro): half hearts lost each time.
// Usage: DIFF=normal node prep.mjs plaza en rules && node hits.mjs <enemyId> [seconds]
import { connect } from './lib.mjs';
const c = await connect();
const id = process.argv[2] ?? 'grub-0', secs = Number(process.argv[3] ?? 20);
const out = await c.ev(`
  __WD.app.loop.stop(); // deterministic: only __WD.advance moves the game
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  const D = (await import('/src/meta/Difficulty.ts')).Difficulty;
  const e = s.enemies.find((x) => x.id === '${id}');
  const res = { difficulty: D.id, enemy: e.id, kind: e.kind };
  // her reflexes off for the test (else she rolls out of most of it)
  pip.autoDodge = () => null; pip.requestDodge = () => false;
  const firstHit = (who) => {
    const body = who === 'wai' ? s.player : pip;
    let t = 0, before = body.hp;
    while (t < ${secs}) {
      body.invuln = Math.min(body.invuln, 0); // no lingering blink from setup
      const hp0 = body.hp;
      __WD.advance(0.05); t += 0.05;
      if (body.hp < hp0) return { before: hp0, after: body.hp, lost: hp0 - body.hp, at: +t.toFixed(2), state: e.state, invulnAfter: +body.invuln.toFixed(2) };
      if (who === 'pip') p.startAggro(e, 30);
      if (who === 'wai') { s.player.hp = Math.max(s.player.hp, 2); }
    }
    return { before, after: body.hp, lost: 0, timeout: true };
  };
  // A) WAI alone in front of it; she is parked far away (standing order: stay)
  const far = e.pos.clone().add(new T(0, 0, 0));
  s.player.teleport(e.pos.clone().add(new T(2.2, 0.2, 0)), -Math.PI / 2);
  pip.teleportNear(s.player.pos.clone().add(new T(-14, 0, 0)), 0, 'regroup', true);
  p.setStance({ mode: 'stay' }, 'api');
  e.alerted = true;
  s.player.hp = 6; s.player.invuln = 0;
  res.wai = firstHit('wai');
  // B) WAI steps back 12 m; she stands in front of it and holds its aggro
  s.player.teleport(e.pos.clone().add(new T(-12, 0.2, 0)), Math.PI / 2);
  s.player.invuln = 99;
  pip.teleportNear(e.pos.clone().add(new T(2.2, 0, 0)), 0, 'regroup', true);
  pip.hp = 6; pip.invuln = 0;
  p.setStance({ mode: 'stay' }, 'api');
  e.alerted = true;
  p.startAggro(e, 30);
  res.pip = firstHit('pip');
  res.pipChasedBy = p.aggroOn(e) ? 'pip' : 'wai';
  res.heartTag = p.life.tagText;
  s.player.invuln = 0;
  return JSON.stringify(res, null, 1);
`);
console.log(out);
await c.shot(`hits-${id}`);
process.exit(0);
