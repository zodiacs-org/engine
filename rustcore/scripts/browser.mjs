import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
// Keep the browser installation out of both the parent package and the home
// directory. The exact Playwright dependency pins its Chromium revision.
process.env.PLAYWRIGHT_BROWSERS_PATH = join(root, ".cache", "playwright");
process.env.TMPDIR = join(root, ".cache", "browser-tmp");
await mkdir(process.env.TMPDIR, { recursive: true });
const { chromium } = await import("playwright");

if (process.argv[2] === "--install") {
  const result = spawnSync(process.execPath, [join(root, "node_modules", "playwright", "cli.js"),
    "install", "chromium", "--only-shell"], { cwd: root, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, "Playwright Chromium installation failed.");
  process.exit(0);
}
assert.equal(process.argv.length, 2, "Expected no arguments, or --install.");

const options = {
  absWorkingDir: root, bundle: true, write: false, platform: "browser", format: "esm", target: "es2022"
};
const core = await build({ ...options, entryPoints: ["ts/index.ts"], metafile: true });
for (const input of Object.keys(core.metafile.inputs)) {
  const path = relative(root, join(root, input));
  assert(!path.startsWith(`..${sep}`) && !path.includes(`node_modules${sep}`),
    `Browser runtime imported code outside rustcore: ${input}`);
  assert(/^(ts|pkg|generated)[/\\]/.test(path), `Unexpected browser runtime module: ${input}`);
}
for (const output of Object.values(core.metafile.outputs)) {
  assert.deepEqual(output.imports, [], "Browser runtime must not contain external imports or Node builtins.");
}
const fixture = await build({ ...options, entryPoints: ["tests/browser.smoke.ts"], plugins: [{
  name: "load-runtime-separately",
  setup(plugin) {
    plugin.onResolve({ filter: /^\.\.\/ts\/index\.js$/ }, () => ({ path: "/core.js", external: true }));
  }
}] });
const wasm = await readFile(join(root, "pkg", "zodiacs_rustcore_bg.wasm"));
const routes = new Map([
  ["/", ["text/html", '<!doctype html><title>Rust core browser smoke</title><link rel="icon" href="data:,">']],
  ["/core.js", ["text/javascript", core.outputFiles[0].contents]],
  ["/fixture.js", ["text/javascript", fixture.outputFiles[0].contents]],
  ["/core.wasm", ["application/wasm", wasm]]
]);
const requests = [];
const server = createServer((request, response) => {
  requests.push(request.url);
  const route = routes.get(request.url);
  if (!route) { response.writeHead(404).end(); return; }
  response.writeHead(200, { "content-type": route[0], "cache-control": "no-store" }).end(route[1]);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  const executablePath = process.env.RUSTCORE_BROWSER_EXECUTABLE;
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const results = [];
  for (const mode of ["bytes", "module"]) {
    // Each context has its own JS module singleton, so both initialization
    // forms must work as the first successful initialization.
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      const errors = [];
      const nonlocalRequests = [];
      page.on("pageerror", error => errors.push(error.message));
      await context.route("**/*", route => {
        if (!route.request().url().startsWith(`${origin}/`)) {
          nonlocalRequests.push(route.request().url());
          return route.abort();
        }
        return route.continue();
      });
      await page.goto(origin);
      let deadline;
      try {
        results.push(await Promise.race([
          page.evaluate(async mode => {
            const { runSmoke } = await import("/fixture.js");
            return runSmoke(mode);
          }, mode),
          new Promise((_, reject) => {
            deadline = setTimeout(() => reject(new Error(`Browser ${mode} smoke exceeded 30 seconds.`)), 30_000);
          })
        ]));
      } finally { clearTimeout(deadline); }
      assert.deepEqual(errors, [], "Browser emitted an uncaught page error.");
      assert.deepEqual(nonlocalRequests, [], "Browser requested a nonlocal resource.");
    } finally { await context.close(); }
  }
  assert(requests.every(path => routes.has(path)), `Unexpected browser requests: ${requests.join(", ")}`);
  console.log(JSON.stringify({ browser: browser.version(), runtimeModules: Object.keys(core.metafile.inputs), results }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
