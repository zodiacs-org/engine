import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { measureCase, measurePhysicalCenters, renderReport } from "./validation.mjs";

const project = fileURLToPath(new URL("../", import.meta.url));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (path) => readFileSync(join(project, path));
const json = (path) => JSON.parse(read(path).toString("utf8"));
const evidencePath = "docs/evidence/m10/RESULTS.md";

function treeIdentity(directory) {
  const paths = [];
  function visit(relative) {
    for (const entry of readdirSync(join(project, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) paths.push(path);
      else throw new Error(`Non-file in implementation identity: ${path}`);
    }
  }
  visit(directory);
  return digest(paths.sort().map((path) => `${path}\0${digest(read(path))}\n`).join(""));
}

/** Full offline evaluation. The injected API is built code in the CLI and the
 * TypeScript library in Vitest; reference generation never calls this function.
 */
export function buildReport(api) {
  const planBytes = read("references/plan.json");
  const planSha256 = digest(planBytes), plan = JSON.parse(planBytes.toString("utf8"));
  const development = json("references/manifest.json");
  const held = json("references/held-out/manifest.json");
  for (const manifest of [development, held]) {
    if (manifest.schema !== "apsides-reference-manifest/1" || manifest.planSha256 !== planSha256) {
      throw new Error("Reference manifest registration mismatch.");
    }
  }
  const descriptors = [...development.fixtures, ...held.fixtures];
  const expected = plan.cases.map((entry) => entry.split === "development"
    ? `fixtures/${entry.id}.json` : `held-out/${entry.id}.json`);
  if (JSON.stringify(descriptors.map((item) => item.path)) !== JSON.stringify(expected)) {
    throw new Error("Reference manifest omits, reorders or adds a registered case.");
  }
  function loadFixture(descriptor) {
    if (!descriptor || !/^(?:fixtures\/dev-[a-z0-9-]+|held-out\/(?:held-[a-z0-9-]+|physical-centers))\.json$/u.test(descriptor.path)) {
      throw new Error("Invalid reference descriptor.");
    }
    const bytes = read(`references/${descriptor.path}`);
    if (digest(bytes) !== descriptor.sha256) throw new Error(`Reference digest mismatch: ${descriptor.path}`);
    const fixture = JSON.parse(bytes.toString("utf8"));
    if (fixture.planSha256 !== planSha256) throw new Error("Fixture registration mismatch.");
    return fixture;
  }
  const cases = descriptors.map((descriptor, index) => {
    const fixture = loadFixture(descriptor);
    if (fixture.schema !== "apsides-horizons-reference/1" ||
        JSON.stringify(fixture.case) !== JSON.stringify(plan.cases[index]) ||
        JSON.stringify(fixture.target) !== JSON.stringify(plan.targets[fixture.case.body])) {
      throw new Error("Fixture case or center differs from registration.");
    }
    const options = { from: { jd: fixture.grid[0][0], scale: "tt" },
      to: { jd: fixture.grid.at(-1)[0], scale: "tt" } };
    let result;
    try {
      result = fixture.case.body === "Moon" ? api.searchLunarApsides(options)
        : api.searchPlanetaryApsides(fixture.case.body, options);
    } catch (error) {
      result = { status: "error", reason: "exception", detail: String(error), events: [] };
    }
    return measureCase(fixture, plan.budgets[fixture.case.body], plan.solverNumericalBudgetSeconds,
      result, api.sampleDistance);
  });
  const physical = loadFixture(held.physicalCenters);
  if (physical.schema !== "apsides-horizons-physical-centers/1" ||
      JSON.stringify(physical.registration) !== JSON.stringify(plan.physicalCenterChecks)) {
    throw new Error("Physical-center registration mismatch.");
  }
  const archive = json("package.json").dependencies["@zodiacs/engine"];
  if (!archive.startsWith("file:../artifacts/")) throw new Error("Expected carried engine archive dependency.");
  return {
    schema: "apsides-validation/1",
    runtime: { node: process.versions.node, platform: process.platform, arch: process.arch },
    identities: {
      "M2 registration": planSha256,
      "Development manifest": digest(read("references/manifest.json")),
      "Held-out manifest": digest(read("references/held-out/manifest.json")),
      "Engine archive": digest(read(archive.slice("file:".length))),
      "Dependency lock": digest(read("package-lock.json")),
      "Implementation src/": treeIdentity("src"),
      "Validation scripts": digest(["scripts/validation.mjs", "scripts/validate-references.mjs"]
        .map((path) => `${path}\0${digest(read(path))}\n`).join(""))
    },
    pass: cases.every((item) => item.pass), cases,
    physicalCenters: measurePhysicalCenters(physical, api.sampleDistance)
  };
}

export async function main(args) {
  if (args.length > 1 || args.some((arg) => !["--write-evidence", "--check-evidence"].includes(arg))) {
    throw new Error("Usage: node scripts/validate-references.mjs [--write-evidence|--check-evidence]");
  }
  // Bind the measured build to the source identity even for direct Node usage.
  // Only this project's ignored output is written; the engine is never rebuilt.
  execFileSync(process.execPath, [join(project, "node_modules/typescript/bin/tsc"),
    "-p", "tsconfig.build.json"], { cwd: project, stdio: "inherit", timeout: 60_000 });
  const api = await import("../.generated/cli/index.js");
  const report = buildReport(api), markdown = renderReport(report);
  mkdirSync(join(project, ".generated/validation"), { recursive: true });
  // Keep large/raw generated data out of the authored tree. This compact report
  // includes every signed error and failed check, not full duplicate receipts.
  const encoded = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(encoded) >= 2_000_000) throw new Error("Validation report exceeds file budget.");
  writeFileSync(join(project, ".generated/validation/report.json"), encoded);
  if (args[0] === "--write-evidence") {
    mkdirSync(join(project, "docs/evidence/m10"), { recursive: true });
    writeFileSync(join(project, evidencePath), markdown);
  }
  if (args[0] === "--check-evidence" && read(evidencePath).toString("utf8") !== markdown) {
    throw new Error("Committed validation report is stale; review and regenerate its evidence.");
  }
  for (const item of report.cases) {
    console.log(`${item.id}: ${item.pass ? "PASS" : "FAIL"}; search ${item.search.status}; ${item.failures.length} failed checks`);
  }
  console.log(`Independent acceptance: ${report.pass ? "PASS" : "FAIL"}; detailed measurements in .generated/validation/report.json`);
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
