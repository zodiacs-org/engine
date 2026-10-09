import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const inputs = ["src/index.ts", "src/contract.ts", "contracts/openapi.json", "scripts/generate-contract.mjs", "checks/client.mjs", "checks/types.ts", "checks/run.mjs", "tsconfig.json", "tsconfig.checks.json", "package.json"];
const sources = {};
for (const path of inputs) sources[path] = createHash("sha256").update(await readFile(new URL(path, root))).digest("hex");
const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
const run = spawnSync(process.execPath, ["--test", fileURLToPath(new URL("client.mjs", import.meta.url))], { encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
process.stdout.write(run.stdout || "");
process.stderr.write(run.stderr || "");
if (run.error) throw run.error;
if (run.status !== 0) process.exit(run.status || 1);
const record = {
  schema: "zodiacs.compute-client-checks.v1",
  node: process.version,
  producer: { run: process.env.GITHUB_RUN_ID || null, job: process.env.GITHUB_JOB || null, checkout: process.env.GITHUB_SHA || null, pullRequestHead: event?.pull_request?.head?.sha || null },
  sources,
  exitCode: run.status,
  tap: run.stdout,
  limitations: ["Contract and transport checks; no independent numerical accuracy, registry publication, programme acceptance or private scan clearance."]
};
const bytes = Buffer.from(JSON.stringify(record, null, 2) + "\n");
console.log("PROGRAMME_FILE " + JSON.stringify({ path: "clients/typescript/evidence/node-" + process.versions.node.split(".")[0] + ".json", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), base64: bytes.toString("base64") }));
