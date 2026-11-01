// Builds the app three ways, records a Chrome trace of each, and checks
// what the Angular track holds. Run with: npm run check
import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { readAngularEntries, componentTotals } from './read-trace.mjs';
import { clickTimes } from './time-clicks.mjs';

let failures = 0;
function check(ok, text) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${text}`);
  if (!ok) failures++;
}
const run = (cmd) => execSync(cmd, { stdio: 'pipe' });
const calls = (file) => JSON.parse(readFileSync(file.replace(/\.json$/, '.calls.json'), 'utf8'));

mkdirSync('traces', { recursive: true });
console.log('building dev, console and production bundles...');
run('npx ng build --configuration development --output-path dist/dev');
run('npx ng build --configuration console --output-path dist/console');
run('npx ng build --configuration production --output-path dist/prod');
run('npx ng build --configuration many-rows --output-path dist/many-dev');
run('npx ng build --configuration many-rows-production --output-path dist/many-prod');

console.log('recording traces...');
run('node scripts/record-trace.mjs dist/dev traces/dev.json');
run('node scripts/record-trace.mjs dist/console traces/console.json --console');
run('node scripts/record-trace.mjs dist/prod traces/prod.json');
run('node scripts/record-trace.mjs dist/many-dev traces/many-dev.json');
run('node scripts/record-trace.mjs dist/many-prod traces/many-prod.json');
console.log(`browser: ${calls('traces/dev.json').browser}\n`);

// 1. Development build, enableProfiling() in main.ts before bootstrap.
console.log('-- development build, enableProfiling() before bootstrap');
const dev = readAngularEntries('traces/dev.json');
check(dev.length > 0, `the trace has ${dev.length} entries on the "🅰️ Angular" track`);
check(dev.every((e) => Number.isFinite(e.durationMs)), 'every entry pairs with its start marker');
check(dev.some((e) => e.name === 'Bootstrap application'), 'startup is on the track ("Bootstrap application")');
const comps = componentTotals(dev);
console.log('   components, by self time (child components subtracted):');
for (const c of comps) {
  console.log(`     ${c.name.padEnd(20)} self ${c.selfMs.toFixed(1).padStart(7)} ms   entries ${c.count}`);
}
check(comps[0]?.name === '_ShippingEstimate', 'the slow component is named, and has the most self time');
const shipping = comps.find((c) => c.name === '_ShippingEstimate');
const next = comps[1];
check(shipping && next && shipping.selfMs > 5 * next.selfMs, `it has more than 5x the self time of the next one (${next?.name})`);
const nonRoot = dev.filter((e) => e.color === 'primary-light' && e.name !== '_App');
const longest = nonRoot.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
check(longest.name === '_ShippingEstimate', `the longest component entry below the root is ${longest.name} (${longest.durationMs.toFixed(1)} ms)`);
const templates = dev.filter((e) => e.name.endsWith(' (update)'));
const longestTemplate = templates.reduce((a, b) => (b.durationMs > a.durationMs ? b : a));
check(longestTemplate.name === 'ShippingEstimate_Template (update)', `the longest template entry is "${longestTemplate.name}"`);
const cd = dev.filter((e) => /^Change detection \d+$/.test(e.name));
check(cd.length === 4, `${cd.length} "Change detection N" entries: startup plus 3 clicks`);

// 2. Console route: ng.enableProfiling() after the page loaded.
console.log('-- development build, ng.enableProfiling() typed after load');
const con = readAngularEntries('traces/console.json');
check(calls('traces/console.json').ngGlobal === 'function', 'ng.enableProfiling exists on the page in dev mode');
check(!con.some((e) => e.name.startsWith('Bootstrap')), 'startup is missing from the track: it ran before the call');
check(con.some((e) => e.name === '_ShippingEstimate'), 'the clicks after the call are on it, slow component included');

// 3. Production build: the same main.ts call does nothing.
console.log('-- production build, same main.ts');
const prod = readAngularEntries('traces/prod.json');
const prodCalls = calls('traces/prod.json');
check(prodCalls.estimateCalls === 4, `the app ran: estimateDays() was called ${prodCalls.estimateCalls} times`);
check(prod.length === 0, `the trace has ${prod.length} entries on the Angular track`);
check(prodCalls.ngGlobal === 'undefined', 'there is no ng global to call from the console');
const bundle = readFileSync(`dist/prod/browser/${readdirSync('dist/prod/browser').find((f) => /^main-.*\.js$/.test(f))}`, 'utf8');
const body = bundle.match(/function \w+\(\)\{return \w+\("Chrome DevTools profiling"\),\(\)=>\{\}\}/);
check(body !== null, `enableProfiling compiles to an empty stub: ${body?.[0]}`);
const leftovers = ['\\u{1F170}', 'Change detection ', 'Bootstrap component', 'timeStamp'].filter((s) => bundle.includes(s));
check(leftovers.length === 0, 'the profiler itself is not in the bundle (no track name, entry names or timeStamp calls)');

// 4. Many small components: 1,000 OrderRow children under OrderTable.
console.log('-- 1,000 row components, development vs production');
const many = readAngularEntries('traces/many-dev.json');
const manyComps = componentTotals(many);
for (const c of manyComps) {
  console.log(`     ${c.name.padEnd(20)} self ${c.selfMs.toFixed(1).padStart(7)} ms   total ${c.totalMs.toFixed(1).padStart(7)} ms   entries ${c.count}`);
}
check(manyComps.find((c) => c.name === '_OrderRow')?.count === 8000, '_OrderRow has 8,000 entries (1,000 rows x 8 passes)');
check(manyComps[0]?.name === '_ShippingEstimate', 'the slow component still has the most self time');
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const timing = (file) => median(clickTimes(file)).toFixed(1);
console.log(`   change detection per click (median of 3, not asserted, machine-dependent):`);
console.log(`     5 components:   dev + track ${timing('traces/dev.json')} ms   production ${timing('traces/prod.json')} ms`);
console.log(`     1,000 rows:     dev + track ${timing('traces/many-dev.json')} ms   production ${timing('traces/many-prod.json')} ms`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
