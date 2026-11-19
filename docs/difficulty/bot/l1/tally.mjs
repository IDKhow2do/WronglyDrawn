// Damage tally per creature kind: TAG + ENCORE stamps vs everything else (spray, slam, bombs…).
// Usage: node tally.mjs install   (after prep; survives until the page reloads)   ·   node tally.mjs report
import { connect } from './lib.mjs';
const c = await connect();
if (process.argv[2] === 'install') {
  console.log(await c.ev(`
    const e = __WD.session.enemies[0]; let p = Object.getPrototypeOf(e);
    while (p && !Object.prototype.hasOwnProperty.call(p, 'stagger')) p = Object.getPrototypeOf(p);
    if (!p || p.__tallied) return 'already / not found';
    const orig = p.applyDamage; p.__tallied = true; window.__tally = {};
    p.applyDamage = function (info) {
      const before = this.hp; const r = orig.call(this, info);
      const cd = __WD.session.combat; const tag = !!info.tag || (!!cd.finishing && cd.finishing.hit && cd.finishing.t < 0.6) || (!!cd.encore && info.kind === 'spit' && info.color === '#ffd23a');
      const t = (window.__tally[this.kind] ??= { tag: 0, other: 0, tags: 0, pip: 0 });
      const d = Math.max(0, before - this.hp);
      // the co-op partner's paint, throws and slams come from src/coop (her moves, her spray)
      if (__WD.session.coop && (new Error().stack || '').includes('/coop/')) t.pip += d;
      else if (tag) { t.tag += d; t.tags++; } else t.other += d;
      return r;
    };
    return 'installed';`));
} else {
  const t = await c.ev('return window.__tally || {}');
  let all = 0, pipAll = 0;
  for (const [k, v] of Object.entries(t)) {
    const sum = v.tag + v.other + (v.pip || 0); all += sum; pipAll += v.pip || 0;
    console.log(`tally ${k}: TAG/ENCORE ${Math.round(v.tag)} (${v.tags} hits) · other ${Math.round(v.other)} · partner ${Math.round(v.pip || 0)} · TAG share ${Math.round((100 * v.tag) / Math.max(1, sum))}% · partner share ${Math.round((100 * (v.pip || 0)) / Math.max(1, sum))}%`);
  }
  console.log(`tally ALL: partner share ${Math.round((100 * pipAll) / Math.max(1, all))}% of ${Math.round(all)}`);
}
process.exit(0);
