// What one PAINT SLAM deals to each creature (live code: weak points, preDamage rules, Paint Time off), dropping from
// the max counted height (drop ≥ 3 m) right beside it. Usage: DIFF=gentle node slammeasure.mjs   (Vite :5194, Chrome :9363)
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const st = () => c.ev('return window.__WD?.state').catch(() => null);
for (const level of ['plaza', 'harbor']) {
  await c.send('Page.navigate', { url: `http://localhost:5194/?test&difficulty=${process.env.DIFF || 'gentle'}&level=${level}&style=graffiti` });
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  const rows = await c.ev(`
    const s = __WD.session; const out = []; const seen = new Set();
    for (const e of s.enemies) {
      if (seen.has(e.kind + e.baseHp)) continue; seen.add(e.kind + e.baseHp);
      e.alerted = true; if (e.state === 'IDLE') e.state = 'FIGHT';
      const hp0 = e.hp; const feet = e.pos.clone(); feet.x += e.bodyRadius + 0.6;
      s.weapon.paintSlam(feet, 3);
      const d = hp0 - e.hp; e.hp = hp0;
      out.push(e.kind + ' ' + Math.round(e.maxHp) + ': ' + Math.round(d) + ' (' + (100 * d / e.maxHp).toFixed(1) + ' %)');
    }
    return out;`).catch((err) => String(err).slice(0, 300));
  console.log(level, JSON.stringify(rows));
}
process.exit(0);
