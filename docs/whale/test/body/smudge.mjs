// Her hearts run out: WAI's smudge blink, rubbed out, drawn back in next to WAI with full hearts.
// Usage: node prep.mjs plaza en rules && node smudge.mjs
import { connect } from './lib.mjs';
const c = await connect();
await c.ev(`
  __WD.app.loop.stop(); // deterministic: only __WD.advance moves the game
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  for (const e of s.enemies) { e.alerted = false; e.step = () => {}; }
  s.player.teleport(new T(-2, 0.15, 44), Math.PI);
  __WD.advance(0.5);
  pip.teleportNear(s.player.pos.clone().add(new T(-2.4, 0, -3)), 0, 'regroup', true);
  p.setStance({ mode: 'stay' }, 'api');
  s.ctx.camera.yaw = Math.PI + 0.35;
  __WD.advance(1.2);
  pip.hp = 3; pip.invuln = 0;
  // a grub-sized hit (1 half heart) from in front of her: the heart tag shows 2/6
  pip.takeHit(pip.pos.clone().add(new T(1, 0, 0)), 1, 5);
  __WD.advance(0.4);
  window.__rows = [];
  return 1;
`);
await c.shot('smudge-a-hurt');
const rows = [];
let n = 0;
for (let k = 0; k < 64; k++) {
  const r = await c.ev(`
    const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
    if (${k} === 0) { pip.invuln = 0; pip.hp = 1; pip.takeHit(pip.pos.clone().add(new T(1, 0, 0)), 1, 5); window.__fell = pip.pos.clone(); }
    // WAI walks off while she is rubbed out: she must come back next to HIM, not where she fell
    if (${k} === 20) { s.player.teleport(s.player.pos.clone().add(new T(0, 0, -8)), Math.PI); s.ctx.camera.yaw = Math.PI + 0.35; }
    __WD.advance(0.1);
    return { t: +((${k} + 1) * 0.1).toFixed(1), hp: pip.hp, phase: pip.health.phase, down: +pip.down.toFixed(2), shown: pip.shown, squash: +pip.squash.toFixed(2), invuln: +pip.invuln.toFixed(2), toWai: +pip.pos.distanceTo(s.player.pos).toFixed(1), fromFall: +pip.pos.distanceTo(window.__fell).toFixed(1), tag: p.life.tagText, smudgedObs: p.observe().pip.smudged, said: p.bubble.current };
  `);
  rows.push(r);
  if ([0, 3, 8, 14, 17, 22, 30, 34, 37, 40, 45, 60].includes(k)) await c.shot(`smudge-b-${String(k).padStart(2, '0')}`);
}
console.log(rows.map((r) => `${r.t}s hp=${r.hp} ${r.phase} down=${r.down} shown=${r.shown} squash=${r.squash} inv=${r.invuln} toWai=${r.toWai} fromFall=${r.fromFall} tag=${r.tag} obs.smudged=${r.smudgedObs}`).join('\n'));
console.log('lines:', [...new Set(rows.map((r) => r.said).filter(Boolean))]);
console.log(await c.ev(`return JSON.stringify({ events: WD_COOP.partner.events.slice(-4), journal: WD_COOP.partner.journal.entries?.slice?.(-3) })`));
process.exit(0);
