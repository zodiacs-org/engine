import { execFileSync, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { sha256 } from "../src/horizons-client.ts";
import { parseOfflineArguments } from "../scripts/check-offline.ts";
import { readLocalBounded, verifyInstalledDependencies, verifyPinnedLocalFile } from "../scripts/offline-integrity.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const temporary: string[] = [];
async function scratch() {
  await mkdir(new URL("../.cache/", import.meta.url), { recursive: true });
  const directory = await mkdtemp(`${project}/.cache/offline-setup-`);
  temporary.push(directory);
  return pathToFileURL(`${directory}/`);
}
afterEach(async () => { for (const directory of temporary.splice(0)) await rm(directory, { force: true, recursive: true }); });

it("requires an explicit full-data preflight and rejects ambiguous flags", () => {
  expect(parseOfflineArguments([])).toBe("pilot");
  expect(parseOfflineArguments(["--full"])).toBe("full");
  expect(parseOfflineArguments(["--help"])).toBe("help");
  for (const args of [["full"], ["--full", "--full"], ["--help", "--full"], ["--fetch"]]) {
    expect(() => parseOfflineArguments(args)).toThrow(/Usage/);
  }
});

it("detects missing, shortened and same-length corrupted original files", async () => {
  const root = await scratch();
  const file = new URL("capture.json", root);
  const bytes = '{"original":true}\n';
  const pin = { byteLength: Buffer.byteLength(bytes), sha256: sha256(bytes) };
  await expect(verifyPinnedLocalFile(file, pin)).rejects.toThrow();
  await writeFile(file, bytes);
  await verifyPinnedLocalFile(file, pin);
  await writeFile(file, bytes.replace("true", "null"));
  await expect(verifyPinnedLocalFile(file, pin)).rejects.toThrow(/digest differs/);
  await writeFile(file, bytes.slice(0, -1));
  await expect(verifyPinnedLocalFile(file, pin)).rejects.toThrow(/byte length differs/);
});

it("rejects symlinks, directories and empty data before accepting local data", async () => {
  const root = await scratch();
  const file = new URL("source.json", root);
  const link = new URL("link.json", root);
  await writeFile(file, "{}");
  await symlink(fileURLToPath(file), link);
  await expect(readLocalBounded(link)).rejects.toThrow(/regular local file/);
  await expect(readLocalBounded(root)).rejects.toThrow(/regular local file/);
  await writeFile(file, "");
  await expect(readLocalBounded(file)).rejects.toThrow(/size limits/);
});

it("refuses stale installed dependencies and disagreement with the lock", async () => {
  const root = await scratch();
  const packageFile = new URL("package.json", root);
  const lockFile = new URL("package-lock.json", root);
  const installed = new URL("node_modules/example/package.json", root);
  const devDependencies = { example: "1.2.3" };
  const lock = { packages: { "": { devDependencies }, "node_modules/example": { version: "1.2.3" } } };
  await writeFile(packageFile, JSON.stringify({ devDependencies }));
  await writeFile(lockFile, JSON.stringify(lock));
  await expect(verifyInstalledDependencies(root)).rejects.toThrow();
  await mkdir(new URL("node_modules/example/", root), { recursive: true });
  await writeFile(installed, JSON.stringify({ version: "1.2.3" }));
  expect(await verifyInstalledDependencies(root)).toEqual(devDependencies);
  await writeFile(installed, JSON.stringify({ version: "1.2.4" }));
  await expect(verifyInstalledDependencies(root)).rejects.toThrow(/Installed version differs/);
  await writeFile(installed, JSON.stringify({ version: "1.2.3" }));
  lock.packages["node_modules/example"].version = "1.2.4";
  await writeFile(lockFile, JSON.stringify(lock));
  await expect(verifyInstalledDependencies(root)).rejects.toThrow(/Lock version differs/);
});

it("runs a real pilot readiness check with fetch disabled from another working directory", () => {
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/generate-pilot.ts", "--build"], {
    cwd: project, timeout: 60_000, encoding: "utf8"
  });
  const guard = "data:text/javascript," + encodeURIComponent(
    'globalThis.fetch = () => { throw new Error("Readiness must remain offline."); };'
  );
  const result = spawnSync(process.execPath, ["--import", guard, "--import",
    fileURLToPath(new URL("../scripts/register-source.mjs", import.meta.url)), "--experimental-strip-types",
    fileURLToPath(new URL("../scripts/check-offline.ts", import.meta.url))], {
    cwd: fileURLToPath(new URL("./", import.meta.url)), timeout: 60_000, encoding: "utf8"
  });
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(result.stderr).toBe("");
  const report = JSON.parse(result.stdout);
  expect(report).toMatchObject({ status: "ready", mode: "pilot", scope: "local-prerequisites-and-integrity;not-an-accuracy-validation" });
  expect(report.checks.map((item: { name: string }) => item.name)).toEqual([
    "node-runtime", "installed-dependencies", "independent-reference-environment", "pilot-sources-and-coefficients"
  ]);
  expect(report.checks.every((item: { status: string }) => item.status === "ok")).toBe(true);
}, 60_000);
