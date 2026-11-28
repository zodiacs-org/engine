import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { prepareEvents } from "./prepare-events.mjs";

assert(process.argv.length <= 3 && [undefined, "--write", "--check"].includes(process.argv[2]),
  "Usage: node scripts/streaming-evidence.mjs [--check|--write]");
assert.equal(process.versions.node, "22.22.2", "Reproduce committed evidence on Node 22.22.2.");
await prepareEvents();
register(new URL("./typescript-loader.mjs", import.meta.url));
const { measureLongRange, longRangeRequest, longRangeOptions } = await import("../test/support/long-range.ts");
const { currentEngineIdentity } = await import("../src/engine.ts");
const pin = JSON.parse(await readFile(new URL("../events-source.json", import.meta.url), "utf8"));
const sourceHash = createHash("sha256");
for (const file of (await readdir(new URL("../src/", import.meta.url))).filter(name => name.endsWith(".ts")).sort()) {
  sourceHash.update(file + "\0").update(await readFile(new URL(`../src/${file}`, import.meta.url))).update("\0");
}
const runs = [];
for (const windowDays of [7, 31]) runs.push(await measureLongRange(windowDays));
assert.equal(runs[0].recordSha256, runs[1].recordSha256, "Window sizes changed event records.");
assert.equal(runs[0].wireSha256, runs[1].wireSha256, "Window sizes changed wire bytes.");
const report = { schema: "zodiacs-calendar-streaming-evidence/1",
  scope: "Engine regression and bounded streaming/parser checks; no astronomical accuracy or heap bound claim.",
  runtime: { node: process.versions.node }, engine: currentEngineIdentity(),
  source: { eventsCommit: pin.commit, engineTree: pin.engineTree, calendarSourceSha256: sourceHash.digest("hex") },
  request: longRangeRequest, options: longRangeOptions, runs };
const encoded = JSON.stringify(report, null, 2) + "\n";
assert(Buffer.byteLength(encoded) < 2_000_000);
const target = new URL("../docs/evidence/long-range.json", import.meta.url);
if (process.argv[2] === "--write") await writeFile(target, encoded);
else assert.equal(await readFile(target, "utf8"), encoded, "Streaming evidence changed; review before regeneration.");
process.stdout.write(encoded);
