// node ev.mjs file.js [args json]  — runs file contents in page (async body), prints JSON result
import fs from 'node:fs';
import { connect } from './lib.mjs';
const c = await connect();
const code = fs.readFileSync(process.argv[2], 'utf8');
const args = process.argv[3] ?? 'null';
const r = await c.ev(`const ARGS=${args};\n${code}`);
console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
if (process.env.SHOT) await c.shot(process.env.SHOT);
process.exit(0);
