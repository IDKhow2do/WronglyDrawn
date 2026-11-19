// What one TAG and one ENCORE stamp deal to every TAG-able creature, as a share of its paint (live game code,
// weak points and phase floors included). Usage: DIFF=gentle node tagmeasure.mjs   (Vite :5194, Chrome :9363)
import { connect, sleep } from './l1/lib.mjs';
const c = await connect();
const st = () => c.ev('return window.__WD?.state').catch(() => null);
for (const level of ['plaza', 'harbor', 'works']) {
  await c.send('Page.navigate', { url: `http://localhost:5194/?test&difficulty=${process.env.DIFF || 'gentle'}&level=${level}&style=graffiti` });
  for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
  if ((await st()) !== 'TITLE') { console.log(level, 'did not load'); continue; }
  const rows = await c.ev(`
    const T = (await import('/src/combat/CombatDirector.ts')).TAG_DMG; // undefined on the old code
    const s = __WD.session; const out = []; const seen = new Set();
    for (const e of s.enemies) {
      if (e.bigness < 0.3 || seen.has(e.kind + e.baseHp)) continue;
      seen.add(e.kind + e.baseHp);
      const top = e.pos.clone(); top.y += 1.0 + e.bigness * 1.4;
      const dir = top.clone().sub(s.player.pos).setY(0).normalize();
      const boss = e.baseHp >= 1000;
      const hit = (amount) => { const hp0 = e.maxHp; e.hp = hp0; e.staggerT = 0.5; e.staggersDone = 0; e.tagSpent = false;
        e.applyDamage({ amount, point: top.clone(), dir, collider: null, kind: 'spit', color: '#ffd23a', tag: true });
        const d = hp0 - e.hp; e.hp = hp0; if (e.state === 'STUNNED') e.state = 'IDLE'; return d; };
      const D = (await import('/src/meta/Difficulty.ts')).Difficulty.s.tagMul ?? 1;
      const b = (x) => (e.maxHp * x.share + x.flat) * D;
      const tagAmt = T ? b(boss ? T.boss : T.creature) : (boss ? e.maxHp * 0.05 : e.maxHp * 0.24 + 40);
      const stampAmt = T ? b(boss ? T.stampBoss : T.stampCreature) : (boss ? e.maxHp * 0.012 + 8 : e.maxHp * 0.04 + 12);
      const tag = hit(tagAmt), stamp = hit(stampAmt);
      out.push({ kind: e.kind, paint: Math.round(e.maxHp), tag: Math.round(tag), tagPct: +(100 * tag / e.maxHp).toFixed(1), stamp: Math.round(stamp), stampPct: +(100 * stamp / e.maxHp).toFixed(1) });
    }
    return out;`).catch((err) => String(err).slice(0, 300));
  console.log(level, JSON.stringify(rows));
}
process.exit(0);
