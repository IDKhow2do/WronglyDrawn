// Level 3 shredder pit (inWater) and level 1 canal / kill plane: fished out next to WAI, WAI's fall price (−½ heart, never the last).
import { connect } from './lib.mjs';
const c = await connect();
const lvl = process.argv[2] ?? 'works';
const out = await c.ev(`
  __WD.app.loop.stop();
  const s = __WD.session, p = WD_COOP.partner, pip = p.pip, T = s.player.pos.constructor;
  for (const e of s.enemies) { e.alerted = false; e.step = () => {}; }
  let into;
  if ('${lvl}' === 'works') {
    s.debugWarp('pit'); __WD.advance(1.5);
    const L = await import('/src/level/works/WorksLayout.ts');
    into = s.player.pos.clone(); into.y = L.WORKS.pitBottom + 0.2;
    // search a point inside the pit near WAI
    let found = null;
    for (let dx = -12; dx <= 12 && !found; dx += 1) for (let dz = -12; dz <= 12 && !found; dz += 1) { const q = s.player.pos.clone().add(new T(dx, 0, dz)); q.y = L.WORKS.pitBottom + 0.3; if (s.inWater(q)) found = q; }
    into = found;
  } else {
    __WD.advance(0.5); into = s.player.pos.clone().add(new T(0, -40, 0));
  }
  if (!into) return 'no pit point found';
  pip.hp = 4; p.setStance({ mode: 'follow' }, 'api');
  pip.body.setTranslation({ x: into.x, y: into.y + 0.5, z: into.z }, true); pip.pos.copy(into);
  const t0 = pip.teleports, log = [];
  for (let t = 0; t < 4; t += 0.1) { __WD.advance(0.1); if (pip.teleports > t0) { log.push({ t: +t.toFixed(1), why: pip.lastTeleport, hp: pip.hp, toWai: +pip.pos.distanceTo(s.player.pos).toFixed(1) }); break; } }
  return JSON.stringify({ level: '${lvl}', into: into.toArray().map((v) => +v.toFixed(1)), inWater: s.inWater(into), rescue: log }, null, 0);
`);
console.log(out);
process.exit(0);
