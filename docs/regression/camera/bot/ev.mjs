// Evaluate code in the page. Usage: node ev.mjs "<code with return>"  |  node ev.mjs -f file.js
import fs from 'node:fs';
process.env.WD_CDP ??= '9400';
process.env.WD_VITE ??= '5300';
const { connect } = await import('<local-path>');
const c = await connect();
const a = process.argv.slice(2);
const code = a[0] === '-f' ? fs.readFileSync(a[1], 'utf8') : a.join(' ');
const r = await c.ev(code);
console.log(typeof r === 'string' ? r : JSON.stringify(r));
if (process.env.SHOT) await c.shot(process.env.SHOT);
process.exit(0);
