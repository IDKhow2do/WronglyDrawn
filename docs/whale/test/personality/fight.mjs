// One scripted fight: WAI's spray is simulated (applyDamage every 0.1 s, ~42 paint/s at the creature's body); the partner
// fights with her own brain. Prints the ledger's report, the bubble line, and a stack-based tally as a cross-check.
// Usage: node fight.mjs <enemyId> [waiPaintPerSec] [shotName]
import { connect } from './lib.mjs';
const c = await connect();
const id = process.argv[2] ?? 'mutant', rate = Number(process.argv[3] ?? 42), shot = process.argv[4];
const out = await c.ev(`
  (await import('/src/coop/Swagger.ts')).SWAGGER.creditChance = Number('${process.env.CHANCE ?? 0.65}');
  const s = __WD.session, p = WD_COOP.partner, T = await import('/node_modules/.vite/deps/three.js').catch(() => null);
  const e = s.enemies.find((x) => x.id === '${id}');
  // independent tally: every applyDamage on a creature, split by whether the call stack comes from src/coop
  let proto = Object.getPrototypeOf(e); while (proto && !Object.prototype.hasOwnProperty.call(proto, 'stagger')) proto = Object.getPrototypeOf(proto);
  if (!proto.__brag) { const orig = proto.applyDamage; proto.__brag = true; proto.applyDamage = function (info) { const b = this.repaint * this.baseHp; const r = orig.call(this, info); const d = this.repaint * this.baseHp - b; const t = (window.__tal ??= { pip: 0, other: 0 }); if ((new Error().stack || '').includes('/coop/')) t.pip += d; else t.other += d; return r; }; }
  window.__tal = { pip: 0, other: 0 };
  const dir = e.pos.clone().sub(s.player.pos).setY(0).normalize();
  const feet = e.pos.clone().addScaledVector(dir, -7); feet.y = e.pos.y;
  s.player.teleport(feet, Math.atan2(dir.x, dir.z));
  p.pip.teleportNear(s.player.pos, s.player.facing, 'regroup', true);
  __WD.advance(0.5);
  const log = []; let t = 0;
  while (e.repaint < 0.999 && t < 90) {
    if (!e.harmless) e.applyDamage({ amount: ${rate} * 0.1, point: e.pos.clone().setY(e.pos.y + e.bigness * 2 + 0.3), dir: dir.clone(), collider: null, kind: 'paint', color: '#ff4fa3' });
    s.player.hp = Math.max(s.player.hp, 4);
    __WD.advance(0.1); t += 0.1;
    if (Math.abs(t % 3) < 0.05) log.push(t.toFixed(0) + 's repaint ' + Math.round(e.repaint * 100) + '% live ' + JSON.stringify(p.swagger.ledger.live, (k, v) => typeof v === 'number' ? Math.round(v) : v));
  }
  const fightSecs = t;
  const n0 = p.swagger.log.length;
  for (let i = 0; i < 300 && !p.swagger.log.slice(n0).some((l) => / credit/.test(l)); i++) __WD.advance(0.1);
  return { id: '${id}', fightSecs: +fightSecs.toFixed(1), log, report: p.swagger.ledger.history.at(-1), tally: window.__tal, swaggerLog: p.swagger.log.slice(-4), bubble: p.bubble.current, events: p.events.slice(-4) };
`);
console.log(JSON.stringify(out, null, 1));
if (shot) await c.shot(shot);
process.exit(0);
