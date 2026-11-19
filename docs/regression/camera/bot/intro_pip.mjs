// Level intro push-in shots + the partner's corner view. Usage: node intro_pip.mjs <level>
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
process.env.WD_SHOTS ??= '/tmp/wd-cam/shots/checks';
const { connect, sleep, VITE } = await import('<local-path>');
const c = await connect();
const level = process.argv[2] ?? 'plaza';
const st = () => c.ev('return window.__WD?.state').catch(() => null);
await c.send('Page.navigate', { url: `${VITE}/?test&difficulty=gentle&level=${level}` });
for (let i = 0; i < 120 && (await st()) !== 'TITLE'; i++) await sleep(500);
await c.ev(`(await import('/src/render/Quality.ts')).Quality.setPref('medium'); localStorage.setItem('wd.boons','auto'); WD_COOP.setBrain('rules'); WD_COOP.enable(true); document.querySelector('.start-btn').click(); return 1`);
const t0 = Date.now();
for (const ms of [400, 1100, 2000]) {
  await sleep(Math.max(0, ms - (Date.now() - t0)));
  await c.shot(`intro_${level}_${ms}`);
}
for (let i = 0; i < 120 && (await st()) !== 'PLAYING'; i++) await sleep(500);
for (let i = 0; i < 120 && (await c.ev("return document.querySelector('.hud').classList.contains('hidden')")); i++) await sleep(500);
await sleep(2500);
await c.shot(`play_${level}`);
// partner out of sight: WAI walks away behind cover (teleport 25 m off, then wait for the corner view)
const r = await c.ev(`const s=__WD.session, p=s.player, T3=p.pos.constructor; const a=__WD.app.coop; const her=a.partner;
  if(!her) return 'no partner';
  p.teleport(p.pos.clone().add(new T3(0,0.3,-22)), 0); p.hp=6; p.invuln=9;
  for (let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,100)); if (a.pip?.visible) break; }
  return { pip: !!a.pip?.visible, reason: a.pip?.reason }`);
console.log('pip', JSON.stringify(r));
await c.shot(`pip_${level}`);
await c.ev(`WD_COOP.enable(false); return 1`);
process.exit(0);
