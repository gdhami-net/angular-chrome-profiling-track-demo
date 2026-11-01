// Serves a built copy of the app, opens it in Chrome with tracing on,
// clicks Refresh a few times, and saves the trace.
// Usage: node scripts/record-trace.mjs <dist folder> <trace file> [--console]
// --console calls ng.enableProfiling() after the page has loaded.
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import puppeteer from 'puppeteer';

const [distArg, traceArg] = process.argv.slice(2);
const consoleMode = process.argv.includes('--console');
if (!distArg || !traceArg) {
  console.error('usage: node scripts/record-trace.mjs <dist folder> <trace file>');
  process.exit(2);
}
const root = resolve(distArg, 'browser');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ico': 'image/x-icon' };

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  let file = join(root, path === '/' ? 'index.html' : path);
  if (!existsSync(file)) file = join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${server.address().port}/`;

// Own profile folder, deleted in finally (also on Ctrl+C).
const profile = await mkdtemp(join(tmpdir(), 'ng-profiling-demo-'));
let browser;
const cleanup = async () => {
  try { await browser?.close(); } catch {}
  server.close();
  for (let i = 0; i < 10; i++) {
    try { await rm(profile, { recursive: true, force: true }); break; }
    catch { await new Promise((r) => setTimeout(r, 500)); }
  }
};
process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

try {
  browser = await puppeteer.launch({ headless: true, userDataDir: profile });
  const page = await browser.newPage();
  // Puppeteer turns on the protocol's Performance domain for page.metrics().
  // With it on, Chrome sends a metrics snapshot for every console.timeStamp,
  // which made each click about 200 ms slower with 1,000 components and
  // skewed the numbers. The Performance panel's recording doesn't do that.
  await page._client().send('Performance.disable');
  // Start before navigation so bootstrap is in the trace.
  await page.tracing.start({ categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline'] });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('app-shipping-estimate p');
  const ngGlobal = await page.evaluate(() => typeof globalThis.ng?.enableProfiling);
  if (consoleMode) {
    // What you would type in the DevTools console once the page is up.
    await page.evaluate(() => { globalThis.ng.enableProfiling(); });
  }
  for (let i = 0; i < 3; i++) {
    await page.click('#refresh');
    await page.waitForFunction((n) => document.querySelector('app-order-header p')?.textContent?.includes(`Refreshed ${n} times`), {}, i + 1);
  }
  const estimateCalls = await page.evaluate(() => globalThis.__estimateCalls ?? 0);
  const trace = await page.tracing.stop();
  await writeFile(traceArg, trace);
  await writeFile(traceArg.replace(/\.json$/, '') + '.calls.json', JSON.stringify({ estimateCalls, refreshes: 3, ngGlobal, browser: await browser.version() }));
  console.log(`trace written: ${traceArg}, estimateDays() calls: ${estimateCalls}, typeof ng.enableProfiling: ${ngGlobal}`);
} finally {
  await cleanup();
}
