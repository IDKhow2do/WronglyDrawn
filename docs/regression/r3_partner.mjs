// Spot check (docs/REGRESSION.md, round 3): the co-op partner, rule brain only (no LLM, no key, no /api proxy).
// Usage (WD_CDP / WD_VITE / WD_SHOTS set, as run.sh sets them):
//   node r3_partner.mjs prep <plaza|works> [en|zh]   fresh level, partner on (rules)
//   node r3_partner.mjs sky [gameSec=60]             level 3: Red Pen phase 2, the fight bot plays WAI; every landed mark is
//                                                    checked against her spot (Companion.autoDodge → hz.dangerAt)
//   node r3_partner.mjs share <enemyId|eraser> [rate] level 1: WAI's spray simulated (applyDamage), she fights with her brain;
//                                                    the ledger's share, her hits and seconds of spraying
//   node r3_partner.mjs flood                        level 1: her sprayCam goof; flood blots counted every 0.25 s, shots
//   node r3_partner.mjs off                          partner off again (it persists in localStorage)
import fs from 'node:fs';
import { connect, sleep, VITE } from '../level3/bot/lib.mjs';
const c = await connect();
const [cmd, a1, a2] = process.argv.slice(2);
const st = () => c.ev('return window.__WD?.state').catch(() => null);
const out = (o) => console.log(JSON.stringify(o));

if (cmd === 'prep') {
  const level = a1 ?? 'plaza', lang = a2 ?? 'en';
  await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
  for (let i = 0; i < 80 && (await st()) !== 'TITLE'; i++) await sleep(500);
  await c.ev(`localStorage.setItem('wd.lang','${lang}'); (await import('/src/i18n/index.ts')).setLang('${lang}'); (await import('/src/render/Quality.ts')).Quality.setPref('medium');
    localStorage.setItem('wd.boons','auto'); WD_COOP.setBrain('rules'); WD_COOP.enable(true); document.querySelector('.start-btn').click(); return 1`);
  for (let i = 0; i < 80 && (await st()) !== 'PLAYING'; i++) await sleep(500);
  for (let i = 0; i < 120 && await c.ev("return document.querySelector('.hud').classList.contains('hidden')"); i++) await sleep(500);
  await sleep(3000);
  out({ ready: await st(), coop: await c.ev('return !!WD_COOP.partner'), brain: await c.ev("return localStorage.getItem('wd.coop.brain')") });
}

if (cmd === 'off') out({ off: await c.ev("WD_COOP.enable(false); return localStorage.getItem('wd.coop')") });

if (cmd === 'sky') {
  const secs = +(a1 ?? 60);
  const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, f=WD_COOP.partner; ${code}`);
  await ev(`s.debugWarp('roof'); return 1`);
  await sleep(1500);
  await ev(`s.souls.warpIn(); pen.debugPhase(2); s.ctx.camera.stopCine(); const T3 = p.pos.constructor; p.teleport(pen.arena.clone().add(new T3(3, 0.05, 6)), Math.PI);
    f.pip.teleportNear(p.pos, p.facing, 'regroup', true); return 1`);
  await sleep(500);
  // every mark that lands: was she inside it? was WAI? (hooked on PenMarks.update, after the game's own step)
  await ev(`window.__ps = { landed: 0, onHer: 0, onHerNoDodge: 0, onWai: 0, cancelled: 0, herInDanger: 0, samples: 0, dodges: {}, herHits: 0 };
    const H = window.__ps, mk = pen.hz.marks, up0 = mk.update.bind(mk);
    mk.update = (dt, pl) => { const before = mk.marks.map((m) => m.on && !m.landed && !m.cancelled); up0(dt, pl);
      mk.marks.forEach((m, i) => { if (before[i] && m.landed) { H.landed++; if (mk.inMark(m, f.pip.pos, 0)) H.onHer++; if (mk.inMark(m, p.pos, 0)) H.onWai++; }
        if (before[i] && m.cancelled) H.cancelled++; });
      H.samples++; if (pen.hz.dangerAt(f.pip.pos)) H.herInDanger++; };
    const ad0 = f.pip.autoDodge.bind(f.pip); f.pip.autoDodge = (en) => { const r = ad0(en); if (r) H.dodges[r] = (H.dodges[r] || 0) + 1; return r; };
    return 1`);
  const brain = fs.readFileSync(new URL('../level3/bot/souls_brain.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '').trim().replace(/;$/, '');
  await c.ev(`return (${brain})`);
  const t0 = await ev('return s.stats.time');
  let shots = 0, o;
  while (true) {
    o = await ev(`if (pen.hp < pen.maxHp * 0.6) pen.hp = pen.maxHp * 0.6; if (p.hp < 4) p.hp = 6;
      return { t: s.stats.time, ph: pen.phase, st: pen.state, ps: window.__ps, her: [f.pip.pos.x, f.pip.pos.z].map((v) => +v.toFixed(1)), herDanger: pen.hz.dangerAt(f.pip.pos), errs: (window.__errs || []).length }`);
    if (shots < 4 && o.st === 'MARKS' && o.herDanger === false && o.ps.landed >= 2) { await c.shot(`r3_partner_sky_${shots++}`); }
    if (o.t - t0 > secs) break;
    await sleep(300);
  }
  await c.ev('if (window.__soulsBot) window.__soulsBot.on = false; return 1');
  out({ gameSec: Math.round(o.t - t0), phase: o.ph, ...o.ps, ledger: await c.ev('return WD_COOP.partner.swagger.ledger.live'), errs: o.errs });
}

if (cmd === 'share') {
  const id = a1 ?? 'mutant', rate = +(a2 ?? 42);
  if (id === 'eraser') { await c.ev(`__WD.session.debugWarp('summit'); return 1`); await sleep(2000); }
  const r = await c.ev(`
    const s = __WD.session, f = WD_COOP.partner, pip = f.pip;
    let sprayT = 0, emits = 0; const em0 = pip.spray.emit.bind(pip.spray); pip.spray.emit = (dt, m, t) => { sprayT += dt; emits++; return em0(dt, m, t); };
    const hits0 = pip.spray.hits, dmg0 = pip.spray.damageDealt;
    let e;
    if ('${id}' === 'eraser') {
      e = s.boss; __WD.advance(3); s.player.teleport(new (s.player.pos.constructor)(0, 14.4, -39), Math.PI);
      let t = 0; while (!e.awake && t < 20) { __WD.advance(0.25); t += 0.25; }
      t = 0; while ((s.story.locked || s.ctx.camera.inCine) && t < 30) { __WD.advance(0.25); t += 0.25; }
    } else {
      e = s.enemies.find((x) => x.id === '${id}');
      const dir = e.pos.clone().sub(s.player.pos).setY(0).normalize();
      const feet = e.pos.clone().addScaledVector(dir, -7); feet.y = e.pos.y;
      s.player.teleport(feet, Math.atan2(dir.x, dir.z));
    }
    pip.teleportNear(s.player.pos, s.player.facing, 'regroup', true);
    __WD.advance(0.5);
    let t = 0, maxShare = 0; const trace = []; const h0 = f.swagger.ledger.history.length;
    while (e.repaint < 0.999 && !(s.bossDone && '${id}' === 'eraser') && t < 240) {
      if (!e.harmless) e.applyDamage({ amount: ${rate} * 0.1, point: e.pos.clone().setY(e.pos.y + e.bigness * 2 + 0.3), dir: s.player.pos.clone().sub(e.pos).setY(0).normalize().negate(), collider: null, kind: 'paint', color: '#ff4fa3' });
      s.player.hp = Math.max(s.player.hp, 4);
      __WD.advance(0.1); t += 0.1;
      const L = f.swagger.ledger.live; if (L && L.wai + L.fish > 200) maxShare = Math.max(maxShare, L.fish / (L.wai + L.fish));
      if (Math.round(t * 10) % 50 === 0 && L) trace.push([Math.round(t), Math.round(L.wai), Math.round(L.fish), +(L.fish / Math.max(1, L.wai + L.fish)).toFixed(3)]);
    }
    for (let i = 0; i < 300 && f.swagger.ledger.history.length === h0; i++) __WD.advance(0.1);
    pip.spray.emit = em0;
    return { id: '${id}', fightSecs: +t.toFixed(1), repaint: +e.repaint.toFixed(3), report: f.swagger.ledger.history.length > h0 ? f.swagger.ledger.history.at(-1) : 'no new fight closed', maxLiveShareAfter200: +maxShare.toFixed(3),
      herSprayingSecs: +sprayT.toFixed(1), emits, herHits: pip.spray.hits - hits0, herPaint: Math.round(pip.spray.damageDealt - dmg0), trace, errs: (window.__errs || []).slice(-3) };`);
  out(r);
}

if (cmd === 'flood') {
  // her sprayCam goof, in real time (the blots are CSS animations on the wall clock)
  await c.ev(`const s = __WD.session, f = WD_COOP.partner; f.pip.teleportNear(s.player.pos, s.player.facing, 'regroup', true); return 1`);
  await sleep(1500);
  const ok = await c.ev(`return WD_COOP.partner.goofs.play('sprayCam')`);
  const t0 = Date.now(), counts = [];
  let firstAt = null;
  const shotAt = [0.4, 1.2, 2.2, 3.2, 3.9, 4.6];
  let k = 0;
  while (Date.now() - t0 < 7000) {
    const n = await c.ev(`const fl = document.querySelectorAll('.ink-blot.coop-flood'); const bl = document.querySelectorAll('.ink-blot.coop-blot:not(.coop-flood)');
      const dots = [...fl].filter((el) => { const g = el.querySelector('svg g:last-child'); return g && getComputedStyle(g).display !== 'none'; }).length;
      const op = fl.length ? +getComputedStyle(fl[0]).opacity : 0; return [fl.length, bl.length, dots, +op.toFixed(2)]`);
    const tt = (Date.now() - t0) / 1000;
    if (n[0] > 0 && firstAt === null) firstAt = tt;
    counts.push([+tt.toFixed(2), ...n]);
    if (firstAt !== null && k < shotAt.length && tt - firstAt >= shotAt[k]) { await c.shot(`r3_flood_${String(shotAt[k]).replace('.', '_')}s`); k++; }
    await sleep(120);
  }
  const lastOn = counts.filter((x) => x[1] > 0).at(-1)?.[0];
  out({ goofStarted: ok, floodFirstAt: firstAt, floodGoneAt: lastOn, coveredSecs: firstAt !== null && lastOn ? +(lastOn - firstAt).toFixed(2) : null, maxBlots: Math.max(...counts.map((x) => x[1])),
    dotsShown: Math.max(...counts.map((x) => x[3])), samples: counts.filter((_, i) => i % 4 === 0), errs: await c.ev('return (window.__errs || []).slice(-3)') });
}
process.exit(0);
