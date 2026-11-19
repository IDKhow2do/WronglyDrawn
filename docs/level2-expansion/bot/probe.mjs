// Evaluate JS in the page. Usage: node probe.mjs "return 1+1"
import { connect } from './lib.mjs';
const c = await connect();
console.log(JSON.stringify(await c.ev(process.argv[2]), null, 0));
process.exit(0);
