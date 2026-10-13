// Reproduce a small engine regression fixture, never an accuracy reference.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { register } from "node:module";
import { prepareEvents } from "./prepare-events.mjs";

assert(process.argv.length <= 3 && [undefined, "--write", "--check"].includes(process.argv[2]),
  "Usage: node scripts/mixed-fixture.mjs [--check|--write]");
await prepareEvents();
register(new URL("./typescript-loader.mjs", import.meta.url));
const { configureFeed } = await import("../src/cli-config.ts");
const { streamCalendar, streamSchedule } = await import("../src/stream.ts");
const example = JSON.parse(await readFile(new URL("../examples/synthetic-complete.json", import.meta.url), "utf8"));
const { request, options } = configureFeed(example, { utc: true });
let text = "";
for await (const chunk of streamCalendar(streamSchedule(request), options)) {
  text += chunk;
  assert(Buffer.byteLength(text) < 2_000_000, "Fixture must stay below the file size limit.");
}
const target = new URL("../test/fixtures/synthetic-complete.ics", import.meta.url);
if (process.argv[2] === "--write") await writeFile(target, text);
else assert.deepEqual(Buffer.from(text), await readFile(target), "Mixed fixture changed.");
process.stdout.write("Verified complete synthetic mixed-feed fixture.\n");
