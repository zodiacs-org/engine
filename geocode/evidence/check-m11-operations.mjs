import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const guard = join(project, "tests/fixtures/no-network.mjs");
const env = { ...process.env, NODE_OPTIONS: "", TSX_DISABLE_CACHE: "1" };

function run(command, args, expectedExit = 0) {
  const result = spawnSync(command, args, { cwd: project, env, encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, expectedExit, result.stderr);
  return result.stdout;
}

function cli(args, expectedExit = 0) {
  return JSON.parse(run(process.execPath, ["--import", guard, "bin/geocode.mjs", ...args], expectedExit));
}

await mkdir(join(project, "generated"), { recursive: true });
const directory = await mkdtemp(join(project, "generated/m11-operations-"));
const index = join(directory, "index");
let server;
let serverExit;
try {
  console.log(`Runtime: Node.js ${process.version}; host tz ${process.versions.tz}; ICU ${process.versions.icu}.`);
  run("python3", ["scripts/select-sample.py", "--check"]);
  run("npm", ["run", "index:build", "--", "--sample", "--out", index]);
  console.log("PASS: offline sample receipt check and documented sample build command.");

  const examples = JSON.parse(run(process.execPath, ["--import", guard, "examples/run.mjs", index]));
  for (const entry of examples) {
    assert.equal(entry.geocode.provenance.license, "CC-BY-4.0");
    if (entry.handoff.status === "ready") assert.ok(entry.handoff.engineInput.utc);
    else assert.equal(Object.hasOwn(entry.handoff, "engineInput"), false);
    console.log(`Example ${entry.label}: ${entry.handoff.status}${entry.handoff.reason ? ` (${entry.handoff.reason})` : ""}.`);
  }

  const ambiguous = cli(["lookup", "Springfield", "--index", index], 4);
  assert.equal(ambiguous.status, "ambiguous");
  const selected = cli(["lookup", "Springfield", "--country", "US", "--region", "IL", "--index", index]);
  assert.equal(selected.status, "unique");
  assert.equal(selected.candidates[0].place.id, "geonames:4250542");
  const dateOnly = cli(["tz", "--place-id", "geonames:4250542", "--date", "2000-01-01", "--index", index]);
  assert.equal(dateOnly.status, "date-only");
  assert.equal(dateOnly.time, null);
  const timed = cli(["tz", "Paris, FR", "--date", "1905-06-01", "--time", "12:00", "--index", index]);
  assert.equal(timed.time.provider, "atlas");
  assert.equal(timed.time.status, "ok");
  console.log("PASS: documented CLI lookup, filtered selection, date-only and atlas-time commands with Node network APIs blocked.");

  server = spawn(process.execPath, ["bin/server.mjs", "--index", index], {
    cwd: project, env, stdio: ["ignore", "pipe", "pipe"]
  });
  // Handle process errors/exit immediately, even if they occur before startup.
  serverExit = once(server, "exit");
  let stderr = "";
  server.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; });
  const address = await new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(() => reject(new Error("Service startup timed out")), 10_000);
    server.once("error", reject);
    server.once("exit", () => reject(new Error("Service exited before startup")));
    server.stdout.setEncoding("utf8").on("data", (part) => {
      stdout += part;
      if (!stdout.includes("\n")) return;
      clearTimeout(timer);
      try {
        const started = JSON.parse(stdout.trim());
        assert.equal(started.status, "listening");
        assert.equal(started.address.address, "127.0.0.1");
        resolve(started.address);
      } catch (error) { reject(error); }
    });
  });
  const origin = `http://${address.address}:${address.port}`;
  const lookupUrl = new URL("/lookup", origin);
  lookupUrl.search = new URLSearchParams({ query: "Springfield", country: "US", region: "IL" });
  const lookup = await fetch(lookupUrl, { signal: AbortSignal.timeout(10_000) });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.headers.get("cache-control"), "no-store");
  assert.deepEqual(await lookup.json(), selected);
  const tz = await fetch(`${origin}/tz`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "Paris, FR", date: "1905-06-01", time: "12:00" }), signal: AbortSignal.timeout(10_000) });
  assert.equal(tz.status, 200);
  assert.deepEqual(await tz.json(), timed);
  server.kill("SIGTERM");
  const [code, signal] = await serverExit;
  assert.equal(code, 0);
  assert.equal(signal, null);
  assert.equal(stderr, "");
  console.log("PASS: documented HTTP request fields match CLI answers on loopback; no-store response and SIGTERM shutdown.");
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    server.kill("SIGKILL");
    await serverExit;
  }
  await rm(directory, { recursive: true, force: true });
}
