// Level 3 STAMP RUN presses: she stands under a press (WAI outside the lane) → stamped, like WAI is.
import { connect } from './lib.mjs';
const c = await connect();
const out = await c.ev(`
  __WD.app.loop.stop();
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  const L = await import('/src/level/works/WorksLayout.ts');
  for (const e of s.enemies) { e.alerted = false; e.step = () => {}; }
  s.debugWarp('stamp'); __WD.advance(1);
  const lane = L.WORKS.stampRun, y = L.WORKS.stampRunStart.y, lx = (lane.x0 + lane.x1) / 2, z = lane.z0 + 2.4;
  // WAI just outside the lane, she under the first press
  s.player.teleport(new T(lane.x0 - 2.5, y + 0.05, z), Math.PI / 2);
  __WD.advance(0.3);
  const at = new T(lx, y + 0.05, z);
  pip.teleportNear(at, 0, 'regroup', true); pip.nudgeTo(at); pip.body.setTranslation({ x: at.x, y: y + 0.5, z: at.z }, true); pip.pos.copy(at);
  pip.autoDodge = () => null; pip.requestDodge = () => false;
  pip.hp = 6; pip.invuln = 0;
  const w0 = s.player.hp, log = [];
  for (let t = 0; t < 6; t += 0.05) {
    p.order = { mode: 'spray', at: pip.pos.clone().add(new T(-3, 1, 0)), until: p.time + 99, by: 'api' };
    if (Math.hypot(pip.pos.x - at.x, pip.pos.z - at.z) > 0.6 && pip.invuln <= 0) { pip.nudgeTo(at); }
    const h0 = pip.hp; __WD.advance(0.05);
    if (pip.hp < h0) log.push({ t: +t.toFixed(2), lost: h0 - pip.hp, hp: pip.hp });
  }
  return JSON.stringify({ hits: log, waiHp: [w0, s.player.hp], runActive: false }, null, 0);
`);
console.log(out);
await c.shot('press');
process.exit(0);
