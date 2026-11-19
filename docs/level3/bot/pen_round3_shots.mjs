// Round 3 proof shots (docs/level3/PEN_ROUND3.md). Run prep.mjs works first. Stages each moment with dev hooks.
// Usage: WD_SHOTS=dir node pen_round3_shots.mjs [sky|allies|voice|hud|all]
//   sky    : a correction-mark volley from above (telegraph, then landing)
//   allies : the Hush smothering a mark; the Eraser rubbing out an ink pool; the Eraser rubbing the Pen's nib open
//   voice  : a Pen line on screen (cold) and a late wavering one
//   hud    : the bottom of the screen in the fight (bar, Pen line, cards, FRENZY badge, lock hint), en + zh, 1280×720 and 2000×1060
import { connect, sleep } from './lib.mjs';
const c = await connect();
const part = process.argv[2] ?? 'all';
const ev = (code) => c.ev(`const s=__WD.app.session, pen=s.pen, p=s.player, cam=__WD.app.camera, T3=p.pos.constructor; ${code}`);
const clean = () => ev(`document.querySelectorAll('.toasts > *,.unlock,.pickup-card,.sticker-tip').forEach(e=>e.remove()); return 1`);
const shot = async (name) => { await clean(); await c.shot(name); console.log('shot', name); };
const until = async (code, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(`return !!(${code})`)) return true; await sleep(50); } return false; };
const size = (w, h) => c.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const lang = (l) => c.ev(`(await import('/src/i18n/index.ts')).setLang('${l}'); return 1`);
// into the fight at act `ph`, WAI inside the ring, safe
const fight = async (ph) => {
  await ev(`if (!s.souls.active) { s.debugWarp('roof'); } return 1`);
  await sleep(1200);
  await ev(`if (!s.souls.active) s.souls.warpIn(); if (pen.phase < ${ph}) pen.debugPhase(${ph}); s.ctx.camera.stopCine(); p.invuln = 9999;
    p.teleport(pen.arena.clone().add(new T3(2, 0.05, 7)), Math.PI); cam.yaw = Math.PI; return 1`);
  await sleep(ph === 3 ? 5200 : 1500);
  await ev(`s.ctx.camera.stopCine(); return 1`);
};
await size(1280, 720);
await lang('en');

if (part === 'sky' || part === 'all') {
  await fight(2);
  // look down at WAI's patch of roof from his shoulder
  await ev(`cam.pitch = 0.75; pen.hz.clear(); return 1`);
  await until(`pen.state === 'FLY'`, 8000);
  await ev(`pen.sky.attackCd = 0; pen.sky.n = 0; return 1`);
  await until(`pen.state === 'MARKS'`, 6000);
  await sleep(700);
  await shot('r3_sky_telegraph');
  await until(`pen.hz.marks.marks.some(m => m.on && m.landed && !m.cancelled)`, 6000);
  await sleep(120);
  await shot('r3_sky_landing');
  await ev(`cam.pitch = -0.25; return 1`);
  await sleep(250);
  await shot('r3_sky_pen_spraying');
}

if (part === 'allies' || part === 'all') {
  await fight(2);
  await ev(`cam.pitch = 0.7; pen.hz.clear(); pen.hush.muffleCd = 0; return 1`);
  // a volley of three marks away from WAI's feet, so the Hush has one to take
  await ev(`const q = p.pos.clone(); pen.hz.marks.volley(q.clone().add(new T3(0, 0, -5)), 3, 3.2, 0.3); return pen.hz.marks.pending().length`);
  console.log('hush busy', await until(`pen.hush.busy`, 3000));
  await until(`!pen.hush.busy`, 4000);
  await shot('r3_hush_smothers');
  // phase 3: the Eraser
  await fight(3);
  await until(`pen.state === 'IDLE'`, 8000);
  await ev(`cam.pitch = 0.55; pen.eraser.penCd = 99; pen.eraser.floorCd = 0; pen.eraser.job = 'none'; pen.hz.pool(p.pos.clone().add(new T3(-3, 0, -2)), 1.9, 9); return 1`);
  console.log('eraser rubs pool', await until(`pen.eraser.rubT > 0.6`, 6000));
  await shot('r3_eraser_rubs_pool');
  await ev(`pen.eraser.penCd = 0; pen.eraser.job = 'none'; return 1`);
  console.log('eraser rubs nib', await until(`pen.openPoints().some(w => w.id === 'nib') && pen.eraser.rubT > 0`, 12000));
  await ev(`const n = pen.penBody.pose.pivot; const d = new T3(p.pos.x - n.x, 0, p.pos.z - n.z).normalize(); p.teleport(new T3(n.x + d.x * 6, pen.floorY + 0.05, n.z + d.z * 6), Math.atan2(-d.x, -d.z)); cam.yaw = Math.atan2(-d.x, -d.z); cam.pitch = 0.05; return 1`);
  await sleep(150);
  await shot('r3_eraser_rubs_nib');
}

if (part === 'voice' || part === 'all') {
  await fight(1);
  await ev(`pen.voice.clear(); pen.voice.say('legs'); return 1`);
  await sleep(500);
  await shot('r3_voice_en');
  await lang('zh');
  await sleep(200);
  await shot('r3_voice_zh');
  await lang('en');
  await ev(`pen.voice.clear(); pen.voice.waver = 0.9; pen.voice.say('lateHurt'); return 1`);
  await sleep(500);
  await shot('r3_voice_waver');
}

if (part === 'hud' || part === 'all') {
  await fight(1);
  // everything that can sit low on the screen at once: a Pen line, the FRENZY badge (charged), the lock hint
  await ev(`window.__force = true; const ui = __WD.app.ui; const f = () => { if (!window.__force) return; requestAnimationFrame(f);
      const b = document.querySelector('.frenzy-badge'); if (b) { b.classList.remove('hidden'); b.classList.add('ready'); b.textContent = (window.__t || ((x) => x))('FRENZY READY — next ENCORE can’t slip!'); }
      ui.setLockHint(window.__t ? window.__t('Click to take control') : 'Click to take control'); };
    window.__t = (await import('/src/i18n/index.ts')).t; f(); return 1`);
  for (const [w, h] of [[1280, 720], [2000, 1060]]) {
    await size(w, h);
    for (const l of ['en', 'zh']) {
      await lang(l);
      await ev(`pen.voice.clear(); pen.voice.say('mouth'); return 1`);
      await sleep(600);
      const boxes = await ev(`const q = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || +cs.opacity === 0) return null; const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; };
        const out = {}; for (const k of ['.souls-boss', '.souls-line', '.cards', '.frenzy-badge', '.lock-hint', '.help', '.souls-stam']) out[k] = q(k);
        const keys = Object.keys(out).filter(k => out[k]); const hits = [];
        for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { const a = out[keys[i]], b = out[keys[j]]; if (a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3]) hits.push(keys[i] + ' x ' + keys[j]); }
        return { out, overlaps: hits }`);
      console.log(w, h, l, JSON.stringify(boxes));
      await shot(`r3_hud_${l}_${w}`);
    }
  }
  await ev(`window.__force = false; __WD.app.ui.setLockHint(null); return 1`);
  await size(1280, 720);
  await lang('en');
}
process.exit(0);
