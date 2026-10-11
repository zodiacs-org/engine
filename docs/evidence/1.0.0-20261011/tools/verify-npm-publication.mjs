// After the Release workflow: what npm serves for @zodiacs/engine@<version>,
// against the carried archive. It reads the registry's metadata, downloads the
// tarball npm serves and compares it with artifacts/zodiacs-engine-<version>.tgz
// byte for byte, installs the version in a clean consumer and runs
// `npm audit signatures` there (registry signatures and provenance), imports it
// in Node and in Deno, and runs the repository's packed-consumer check on the
// downloaded tarball. Prints JSON; exits non-zero on any failed check.
//
//   node verify-npm-publication.mjs <engine checkout> <version> <scratch directory>
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [checkoutArg, version, scratchArg] = process.argv.slice(2);
if (!checkoutArg || !version || !scratchArg) throw new Error("usage: node verify-npm-publication.mjs <engine checkout> <version> <scratch directory>");
const checkout = resolve(checkoutArg);
const scratch = resolve(scratchArg);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: "utf8", maxBuffer: 1 << 28, ...options });
const checks = {};

rmSync(scratch, { recursive: true, force: true });
mkdirSync(scratch, { recursive: true });
const view = JSON.parse(run("npm", ["view", `@zodiacs/engine@${version}`, "version", "dist", "--json"], { cwd: scratch }));
const tags = JSON.parse(run("npm", ["view", "@zodiacs/engine", "dist-tags", "--json"], { cwd: scratch }));
checks.registry = { version: view.version, tarball: view.dist?.tarball, integrity: view.dist?.integrity, attestations: view.dist?.attestations ?? null, distTags: tags };

const carried = readFileSync(join(checkout, "artifacts", `zodiacs-engine-${version}.tgz`));
const packDir = join(scratch, "pack");
mkdirSync(packDir);
const packed = JSON.parse(run("npm", ["pack", `@zodiacs/engine@${version}`, "--json", "--pack-destination", packDir], { cwd: scratch }));
const served = readFileSync(join(packDir, packed[0].filename));
checks.tarball = {
  carriedSha256: sha256(carried),
  servedSha256: sha256(served),
  carriedBytes: carried.length,
  servedBytes: served.length,
  identical: Buffer.compare(carried, served) === 0,
  integrityMatches: view.dist?.integrity === `sha512-${createHash("sha512").update(served).digest("base64")}`,
};

const consumer = join(scratch, "consumer");
mkdirSync(consumer);
writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "npm-publication-consumer", private: true, type: "module" }, null, 2));
run("npm", ["install", "--no-audit", "--no-fund", `@zodiacs/engine@${version}`], { cwd: consumer });
let signatures;
try { signatures = { status: 0, output: run("npm", ["audit", "signatures"], { cwd: consumer }) }; }
catch (error) { signatures = { status: error.status, output: String(error.stdout ?? "") + String(error.stderr ?? "") }; }
checks.signatures = { exitCode: signatures.status, output: signatures.output.trim().split("\n").slice(-6) };

const probe = `import { natalChart, ENGINE_VERSION } from "@zodiacs/engine";
const chart = natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "whole" });
console.log(JSON.stringify({ version: ENGINE_VERSION, sun: chart.bodies.find((body) => body.body === "Sun")?.lon ?? null }));`;
writeFileSync(join(consumer, "probe.mjs"), probe);
checks.node = { version: process.version, output: JSON.parse(run(process.execPath, ["probe.mjs"], { cwd: consumer }).trim()) };
const denoProbe = probe.replace('"@zodiacs/engine"', `"npm:@zodiacs/engine@${version}"`);
writeFileSync(join(scratch, "deno-probe.mjs"), denoProbe);
try {
  // Deno refuses npm versions younger than its minimum dependency age; this
  // version was published minutes ago, so the age check is turned off here.
  const denoArgs = ["run", "--quiet", "--minimum-dependency-age=0", "--allow-read", "--allow-env", "--allow-net=registry.npmjs.org", join(scratch, "deno-probe.mjs")];
  checks.deno = { version: run("deno", ["--version"]).split("\n")[0], args: denoArgs.slice(0, -1), output: JSON.parse(run("deno", denoArgs, { cwd: scratch }).trim()) };
} catch (error) {
  checks.deno = { failed: String(error.stderr ?? error.message).slice(0, 2000) };
}

let consumerCheck;
mkdirSync(join(scratch, "tmp"));
try { consumerCheck = { exitCode: 0, tail: run(process.execPath, [join(checkout, "scripts/verify-packed-consumer.mjs"), join(packDir, packed[0].filename)], { cwd: checkout, env: { ...process.env, TMPDIR: join(scratch, "tmp") }, stdio: ["ignore", "pipe", "pipe"] }).trim().split("\n").slice(-4) }; }
catch (error) { consumerCheck = { exitCode: error.status, tail: (String(error.stdout ?? "") + String(error.stderr ?? "")).trim().split("\n").slice(-12) }; }
checks.packedConsumer = consumerCheck;

const ok = checks.registry.version === version
  && tags.latest === version
  && checks.registry.attestations?.provenance?.predicateType === "https://slsa.dev/provenance/v1"
  && checks.tarball.identical && checks.tarball.integrityMatches
  && checks.signatures.exitCode === 0
  && checks.node.output.version === version
  && checks.deno.output?.version === version
  && typeof checks.node.output.sun === "number" && checks.node.output.sun === checks.deno.output?.sun
  && checks.packedConsumer.exitCode === 0;
console.log(JSON.stringify({ schema: "zodiacs.npm-publication-check.v1", checkedAt: new Date().toISOString(), version, ok, checks }, null, 2));
if (!ok) process.exitCode = 1;
