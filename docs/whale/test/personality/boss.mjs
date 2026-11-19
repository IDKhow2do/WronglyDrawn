// The Eraser boss fight, scripted: warp to the summit, wake it, simulate WAI's spray on it (applyDamage every 0.1 s),
// the partner fights with her own brain. Prints the ledger report and the credit line. Usage: node boss.mjs [rate] [shot]
import { connect, sleep } from './lib.mjs';
const c = await connect();
const rate = Number(process.argv[2] ?? 120), shot = process.argv[3];
await c.ev(`__WD.advance(8); __WD.session.debugWarp('summit'); return 1`);
await sleep(1500);
const out = await c.ev(`
  const s = __WD.session, p = WD_COOP.partner, b = s.boss;
  __WD.advance(4);
  s.player.teleport(new (s.player.pos.constructor)(0, 14.4, -39), Math.PI);
  let t = 0; while (!b.awake && t < 20) { __WD.advance(0.25); t += 0.25; }
  t = 0; while ((s.story.locked || s.ctx.camera.inCine) && t < 30) { __WD.advance(0.25); t += 0.25; }
  const log = ['awake ' + b.awake + ' after cine ' + t];
  t = 0; let k = 0;
  while (!s.bossDone && b.repaint < 0.999 && t < 200) {
    b.applyDamage({ amount: ${rate} * 0.1, point: b.pos.clone().setY(b.pos.y + 1.5), dir: s.player.pos.clone().sub(b.pos).setY(0).normalize().negate(), collider: null, kind: 'paint', color: '#ff4fa3' });
    s.player.hp = Math.max(s.player.hp, 4);
    __WD.advance(0.1); t += 0.1;
    if (++k % 100 === 0) log.push(t.toFixed(0) + 's boss ' + Math.round(b.repaint * 100) + '% phase ' + b.phase + ' live ' + JSON.stringify(p.swagger.ledger.live, (kk, v) => typeof v === 'number' ? Math.round(v) : v));
  }
  log.push('done at ' + t.toFixed(0) + 's, bossDone ' + s.bossDone);
  return { log };
`);
// real time between steps from here on: the HUD's boss-down effects run on the wall clock
let w = 0, said = null;
const n0 = await c.ev('return WD_COOP.partner.swagger.log.length');
while (w < 40 && !said) { await sleep(250); said = await c.ev(`__WD.advance(0.25); const l = WD_COOP.partner.swagger.log.slice(${n0}).find((x) => / credit/.test(x)); return l ?? null`); w += 0.25; }
out.credit = { after: w, said, name: await c.ev('return WD_COOP.partner.name'), fact: await c.ev("return WD_COOP.memory().events.filter((e) => /fight won/.test(e.text)).map((e) => e.text).slice(-1)") };
out.report = await c.ev('return WD_COOP.partner.swagger.ledger.history.at(-1)');
console.log(JSON.stringify(out, null, 1));
if (shot) { await sleep(300); await c.shot(shot); }
process.exit(0);
