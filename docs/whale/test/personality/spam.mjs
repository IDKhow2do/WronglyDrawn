// Spam check: 300 simulated seconds of level 1 with the partner on (rule brain). WAI walks between spots, picks fights
// with whatever is near (simulated spray), sprays her twice and calls her three times in a row once.
// Counts every line she says, per kind for the show-off lines.
import { connect } from './lib.mjs';
const c = await connect();
const out = await c.ev(`
  const s = __WD.session, p = WD_COOP.partner;
  const all = []; const say = p.say.bind(p); p.say = (text, llm, face) => { all.push(Math.round(p.time) + 's ' + text); return say(text, llm, face); };
  __WD.advance(8);
  const t0 = p.time; const spots = [[-2, 30], [10, 20], [-12, 12], [0, 0], [8, -8], [-6, 22]]; let si = 0, fightT = 0, foe = null;
  while (p.time - t0 < 300) {
    const t = p.time - t0;
    if (!foe && t > fightT) {
      foe = s.enemies.filter((e) => !e.disposed && !e.harmless && e !== s.boss && e.pos.distanceTo(s.player.pos) < 25).sort((a, b) => a.pos.distanceTo(s.player.pos) - b.pos.distanceTo(s.player.pos))[0] ?? null;
      fightT = t + 55;
      if (!foe) { const sp = spots[si++ % spots.length]; WD_AGENT.act({ type: 'move_to', x: sp[0], z: sp[1], run: false }); }
    }
    if (foe) {
      if (foe.disposed || foe.repaint >= 0.999 || foe.harmless) { foe = null; const sp = spots[si++ % spots.length]; WD_AGENT.act({ type: 'move_to', x: sp[0], z: sp[1], run: false }); }
      else for (let k = 0; k < 5; k++) foe.applyDamage({ amount: 4.2, point: foe.pos.clone().setY(foe.pos.y + foe.bigness * 2 + 0.3), dir: foe.pos.clone().sub(s.player.pos).setY(0).normalize(), collider: null, kind: 'paint', color: '#ff4fa3' });
    }
    if (Math.abs(t - 100) < 0.26 || Math.abs(t - 200) < 0.26) p.pip.proxy.applyDamage();
    if (Math.abs(t - 150) < 0.26) { await WD_COOP.chat('过来'); __WD.advance(2); await WD_COOP.chat('过来'); __WD.advance(2); await WD_COOP.chat('快过来'); }
    s.player.hp = Math.max(s.player.hp, 3);
    __WD.advance(0.5);
  }
  return { simSecs: Math.round(p.time - t0), lines: all.length, swaggerSaid: p.swagger.said, goofs: p.goofs.count, fights: p.swagger.ledger.history.map((r) => (r.real ? 'REAL ' : 'small ') + Math.round(r.share * 100) + '% ' + r.foes.join('+') + ' ' + Math.round(r.secs) + 's'), swaggerLog: p.swagger.log, perMinute: +(all.length / 5).toFixed(1), all };
`);
console.log(JSON.stringify(out, null, 1));
process.exit(0);
