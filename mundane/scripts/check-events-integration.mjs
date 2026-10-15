import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile, symlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Read branch objects from this repository. All materialized sources and build
// output stay under ignored mundane/generated/. No worktree or git mutation.
const root = new URL("../../", import.meta.url);
const project = new URL("../", import.meta.url);
const generated = new URL("generated/", project);
await mkdir(generated, { recursive: true });
const scratch = await mkdtemp(fileURLToPath(new URL("events-bridge-", generated)));
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const revision = git(["rev-parse", "origin/infra/events"]);
const sources = `${scratch}/events/src`;
await mkdir(sources, { recursive: true });
for (const name of ["types", "context", "root", "engine", "eclipses"]) {
  await writeFile(`${sources}/${name}.ts`, git(["show", `${revision}:events/src/${name}.ts`]) + "\n");
}
await symlink(fileURLToPath(new URL("src/", root)), `${scratch}/src`, "dir");
const entry = `${sources}/bridge-entry.ts`;
await writeFile(entry, 'export { EvaluationContext } from "./context.js";\nexport { searchEclipses } from "./eclipses.js";\n');
const common = { bundle: true, platform: "node", format: "esm", target: "node22",
  alias: { "astronomy-engine": fileURLToPath(new URL("node_modules/astronomy-engine/esm/astronomy.js", project)) } };
await build({ ...common, entryPoints: [entry], outfile: `${scratch}/events.mjs` });
await build({ ...common, entryPoints: [fileURLToPath(new URL("src/index.ts", project))], outfile: `${scratch}/mundane.mjs` });
const source = await import(`${scratch}/events.mjs`);
const mundane = await import(`${scratch}/mundane.mjs`);
// Explicit illustrative radii are inputs, not new physical accuracy evidence.
const settings = { model: { sunRadiusAu: 0.00465, moonRadiusAu: 0.0000116, earthRadiusAu: 0.0000426 },
  stepMs: 3_600_000, derivativeStepMs: 1000, maxEvaluations: 10_000 };
for (const [from, to] of [["2024-03-25", "2024-03-26"], ["2024-04-08", "2024-04-09"]]) {
  const window = { startMs: Date.parse(from), endMs: Date.parse(to), clock: "utc" };
  const request = { from, to, place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 } };
  const actual = mundane.searchEclipseCharts(request, mundane.createEventsEclipseAdapter(source, settings));
  const context = new source.EvaluationContext(window, { maxEvaluations: settings.maxEvaluations });
  const expected = ["solar", "lunar"].flatMap(kind => {
    const result = source.searchEclipses(context, kind, settings.model,
      { stepMs: settings.stepMs, derivativeStepMs: settings.derivativeStepMs });
    assert.equal(result.status, "complete");
    return result.events;
  }).sort((a, b) => a.atMs - b.atMs);
  assert.equal(actual.status, "complete");
  assert(expected.length > 0, "exercise a nonempty delegated result");
  assert.deepEqual(actual.eclipses.map(row => row.supplied.provenance), expected);
  assert.equal(actual.evaluations, context.evaluations);
  assert(actual.eclipses.every(row => row.contactKind === "minimum-shadow-axis-distance" && row.chart.at === row.at));
  const refused = mundane.searchEclipseCharts(request,
    mundane.createEventsEclipseAdapter(source, { ...settings, maxEvaluations: 1 }));
  assert.equal(refused.status, "refused");
  assert.equal(refused.reason, "evaluation-budget");
  assert.deepEqual(refused.eclipses, []);
}
console.log(`PASS: actual events branch ${revision}; delegated solar/lunar minima, raw geometry, cumulative budgets, and atomic refusal.`);
console.log("Integration only: no independent astronomical accuracy or contact-timing claim.");
