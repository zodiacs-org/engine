import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const directory = await mkdtemp(join(tmpdir(), "zodiacs-compute-consumer-"));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    throw new Error("Clean consumer command failed");
  }
  return result.stdout;
}
try {
  const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8")) : null;
  const packageSource = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  if (packageSource.private !== true || packageSource.version !== "0.0.0") throw new Error("Client must remain private preparation");
  const packed = JSON.parse(run("npm", ["pack", "--ignore-scripts", "--json", "--pack-destination", directory], fileURLToPath(root)));
  if (packed.length !== 1 || basename(packed[0].filename) !== packed[0].filename) throw new Error("Unexpected packed archive");
  const archivePath = join(directory, packed[0].filename);
  const archiveBytes = await readFile(archivePath);
  const consumer = join(directory, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", archivePath, "typescript@5.9.3"], consumer);
  const installedPackage = JSON.parse(await readFile(join(consumer, "node_modules/@zodiacs/compute-client/package.json"), "utf8"));
  if (installedPackage.private !== true || installedPackage.version !== "0.0.0") throw new Error("Packed identity changed");
  await mkdir(join(consumer, "checks"));
  await mkdir(join(consumer, "contracts"));
  const contract = await readFile(new URL("contracts/openapi.json", root));
  await writeFile(join(consumer, "contracts/openapi.json"), contract);
  const checks = await readFile(new URL("checks/client.mjs", root), "utf8");
  const typechecks = await readFile(new URL("checks/types.ts", root), "utf8");
  if (!checks.includes('"../dist/index.js"') || !typechecks.includes('"../src/index.js"')) throw new Error("Expected source imports missing");
  await writeFile(join(consumer, "checks/client.mjs"), checks.replace('"../dist/index.js"', '"@zodiacs/compute-client"'));
  await writeFile(join(consumer, "checks/types.ts"), typechecks.replace('"../src/index.js"', '"@zodiacs/compute-client"'));
  const config = JSON.parse(await readFile(new URL("tsconfig.checks.json", root), "utf8"));
  const baseConfig = JSON.parse(await readFile(new URL("tsconfig.json", root), "utf8"));
  await writeFile(join(consumer, "tsconfig.json"), JSON.stringify({ compilerOptions: { ...baseConfig.compilerOptions, ...config.compilerOptions, rootDir: ".", types: [] }, include: ["checks/types.ts"] }, null, 2));
  run(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.json", "--noEmit"], consumer);
  const tap = run(process.execPath, ["--test", "--test-reporter=tap", "checks/client.mjs"], consumer);
  process.stdout.write(tap);
  const record = {
    schema: "zodiacs.compute-client-consumer.v1",
    node: process.version,
    producer: { run: process.env.GITHUB_RUN_ID || null, job: process.env.GITHUB_JOB || null, checkout: process.env.GITHUB_SHA || null, pullRequestHead: event?.pull_request?.head?.sha || null },
    package: { name: installedPackage.name, version: installedPackage.version, private: installedPackage.private, sha256: createHash("sha256").update(archiveBytes).digest("hex"), bytes: archiveBytes.length, files: packed[0].files.map(file => ({ path: file.path, size: file.size })) },
    compiler: "5.9.3",
    contractSha256: createHash("sha256").update(contract).digest("hex"),
    consumerTypeChecksExit: 0,
    consumerRuntimeChecksExit: 0,
    tap,
    limitations: ["Private temporary pack/install, not a carried engine archive or registry publication; contract and transport evidence, not independent numerical accuracy or private scan clearance."]
  };
  await rm(directory, { recursive: true, force: true });
  record.temporaryConsumerRemoved = true;
  const bytes = Buffer.from(JSON.stringify(record, null, 2) + "\n");
  console.log("PROGRAMME_FILE " + JSON.stringify({ path: "clients/typescript/evidence/consumer-node-" + process.versions.node.split(".")[0] + ".json", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), base64: bytes.toString("base64") }));
} finally {
  await rm(directory, { recursive: true, force: true });
}
