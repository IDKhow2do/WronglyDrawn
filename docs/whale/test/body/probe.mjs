import { connect } from './lib.mjs';
const c = await connect();
console.log(await c.ev(process.argv[2]));
process.exit(0);
