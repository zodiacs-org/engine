#!/usr/bin/env node
/*
 * A conformance adapter (conformance/SPEC.md) that answers in a real browser.
 * It bundles page-entry.mjs (the Node adapter's own handlers over ../../dist)
 * with esbuild, serves the bundle from a loopback server that serves nothing
 * else, opens it in Chromium, Firefox or WebKit through Playwright, and
 * passes each request line to the page and each answer back, in order.
 *
 *   node browser-adapter.mjs <chromium|firefox|webkit> [--entry core] [--receipts <file>]
 *
 * --receipts writes the page's five synthetic receipts (receipt-cases.mjs)
 * to a file after the last answer.
 *
 * RUNTIME_CONFORMANCE_MUTATE=<browser>:<vector id> moves that vector's
 * answered longitude by 2 arcseconds in that browser. It exists only to show
 * that the workflow fails when one answer is wrong; nothing sets it by
 * default.
 *
 * The loopback server and the request policy (only the page and its own
 * modules, from the loopback origin; everything else refused) follow
 * edge/scripts/smoke-browser.mjs on the infra/edge branch (PR 45).
 */
import { writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { bundlePage } from './bundle.mjs';
import * as playwright from 'playwright';

const BROWSERS = ['chromium', 'firefox', 'webkit'];
const name = process.argv[2];
const entryIndex = process.argv.indexOf('--entry');
const entry = entryIndex === -1 ? 'root' : process.argv[entryIndex + 1];
if (!BROWSERS.includes(name) || !['root', 'core'].includes(entry)) {
  console.error(`usage: browser-adapter.mjs <${BROWSERS.join('|')}> [--entry core] [--receipts <file>]`);
  process.exit(2);
}
const receiptsIndex = process.argv.indexOf('--receipts');
const receiptsPath = receiptsIndex === -1 ? null : process.argv[receiptsIndex + 1];
const [mutateBrowser, mutateId] = (process.env.RUNTIME_CONFORMANCE_MUTATE ?? '').split(':');
const mutate = mutateBrowser === name && mutateId ? mutateId : null;

/** Serves only the captured assets, on loopback; no path is read from disk. */
async function serve(assets) {
  const server = createServer((request, response) => {
    const asset = request.method === 'GET' ? assets.get(request.url) : undefined;
    if (!asset) {
      response.writeHead(404, { 'content-type': 'text/plain', connection: 'close' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'content-type': `${asset.type}; charset=utf-8`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    response.end(asset.body);
  });
  await new Promise((fulfil, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', fulfil);
  });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((fulfil) => { server.closeAllConnections(); server.close(() => fulfil()); }) };
}

const playwrightVersion = createRequire(import.meta.url)('playwright/package.json').version;
const assets = await bundlePage({ entry });
const host = await serve(assets);
let browser;
try {
  browser = await playwright[name].launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', acceptDownloads: false });
  const refused = [];
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === host.origin && assets.has(url.pathname) && !url.search && route.request().method() === 'GET') await route.continue();
    else {
      refused.push(route.request().url());
      await route.abort();
    }
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error.message)));
  await page.goto(`${host.origin}/`, { waitUntil: 'load' });
  await page.evaluate(() => import('/page-entry.js'));
  const facts = await page.evaluate(() => ({
    header: globalThis.runtimeConformance.header(),
    userAgent: navigator.userAgent,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    longOffset: (() => {
      try {
        return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', timeZoneName: 'longOffset' }).format(0).includes('GMT+05:30');
      } catch {
        return false;
      }
    })(),
  }));
  const runtime = {
    name,
    version: browser.version(),
    engine: { chromium: 'V8', firefox: 'SpiderMonkey', webkit: 'JavaScriptCore' }[name],
    userAgent: facts.userAgent,
    intlTzdb: 'not exposed',
    hostTimeZone: facts.timeZone,
    intlLongOffset: facts.longOffset,
    driver: `playwright ${playwrightVersion}, headless, on ${process.platform} ${process.arch}`,
    ...(name === 'webkit' ? { note: "Playwright's WebKit build on Linux, not Safari" } : {}),
  };
  process.stdout.write(`${JSON.stringify({ adapter: { ...facts.header, runtime } })}\n`);

  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const request = JSON.parse(line);
    const response = await page.evaluate((one) => globalThis.runtimeConformance.answer(one), request);
    if (mutate && response.id === mutate && typeof response.output?.lon === 'number') {
      response.output.lon += 2 / 3600;
      console.error(`browser-adapter: RUNTIME_CONFORMANCE_MUTATE moved ${mutate}'s longitude by 2 arcseconds in ${name}`);
    }
    process.stdout.write(`${JSON.stringify(response)}\n`);
  }
  if (receiptsPath) {
    const receipts = await page.evaluate(() => globalThis.runtimeConformance.receipts());
    writeFileSync(receiptsPath, `${JSON.stringify({ runtime, engineVersion: facts.header.engineVersion, receipts })}\n`);
  }
  if (pageErrors.length) throw new Error(`the page reported errors: ${pageErrors.join('; ')}`);
  if (refused.length) throw new Error(`the page asked for something other than its own modules: ${refused.slice(0, 5).join(', ')}`);
} catch (error) {
  console.error(`browser-adapter (${name}): ${error instanceof Error ? error.stack : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await host.close();
}
