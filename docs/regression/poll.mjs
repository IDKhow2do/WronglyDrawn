// Level-1 section poller for the regression runs: every 10 s one line
// [game s, hits, smudges, [Inkwell state, hp, engaged], [Eraser state, hp, awake], WAI pos, WAI hp].
// Usage: WD_CDP=9371 node docs/regression/poll.mjs > /tmp/wd-reg/logs/<run>-poll.log   (stops after 25 min)
import { connect, sleep } from '../level3/bot/lib.mjs';
const c = await connect();
const t0 = Date.now();
while (Date.now() - t0 < 25 * 60e3) {
  try {
    console.log(JSON.stringify(await c.ev(`const s=__WD.app.session; const k=s.quarter?.inkwell; const p=s.player.pos;
      return [Math.round(s.stats.time), s.stats.damageTaken, s.stats.smudges, k?[k.state, Math.round(k.hp), k.engaged]:null,
        s.eraser?[s.eraser.state, Math.round(s.eraser.hp), s.eraser.awake]:null, [+p.x.toFixed(1),+p.y.toFixed(1),+p.z.toFixed(1)], s.player.hp]`)));
  } catch (e) { console.log('ERR', String(e).slice(0, 120)); }
  await sleep(10000);
}
process.exit(0);
