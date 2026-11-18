// The root entry computes what it computed before @zodiacs/engine/core was
// added (ZOD-292). The core build needs the root's default source and the
// opener of its pack to sit in a module of their own, src/ephemeris-shipped.ts,
// which src/ephemeris.ts now imports; nothing else under the root changed.
//
// The reference is the carried archive of the version in package.json
// (artifacts/archives.json): for 2.0.0-rc.2, the archive that main at 373ceda
// builds byte for byte. Its dist/ is extracted to a temporary folder and
// loaded in this same process, beside this checkout's root (src/index.ts,
// and dist/index.js when it has been built), so that both run on the same
// JavaScript engine and must agree exactly, with no tolerance. On a new copy
// of each root's modules, as an application gets them, at every distinct
// input of the conformance suite's L1 and L2 vectors (174 births), each
// computes a plain natalChart (on the shipped DE440 pack), chartPoints and
// chartDeclinations, then the same after setDefaultEphemeris("astronomy-engine");
// and each reports its default source (defaultEphemeris()) and its export
// names. Everything is compared as JSON, but the engine's version.
//
// A regression test: it holds the root to its own released output and is not
// accuracy evidence. A later change that is meant to change what the root
// computes fails it, as it fails the archive check, until the candidate that
// carries the change is cut.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { conformanceBirths } from "./conformance-inputs.mjs";

const at = (path) => new URL(`../${path}`, import.meta.url);
const VERSION = JSON.parse(readFileSync(at("package.json"), "utf8")).version;
const CARRIED = JSON.parse(readFileSync(at("artifacts/archives.json"), "utf8")).archives.find((entry) => entry.version === VERSION);

/** JSON without the engine's version, which names the build and not what it computes. */
const text = (value) => JSON.stringify(value, (key, entry) => (key === "engineVersion" ? undefined : entry));

/** What a root computes: its export names, its default source, and its results on the pack and on astronomy-engine. */
function computed(root) {
  const births = conformanceBirths(root.HOUSE_SYSTEMS);
  const results = () => births.map(({ id, birth }) => {
    try {
      const chart = root.natalChart(birth);
      return { id, chart, points: root.chartPoints(chart), declinations: root.chartDeclinations(chart) };
    } catch (error) {
      return { id, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  });
  const exports = Object.keys(root).sort().map((name) => [name, typeof root[name]]);
  const defaultSource = text(root.defaultEphemeris());
  const de440 = text(results());
  root.setDefaultEphemeris("astronomy-engine");
  const astronomyEngine = text(results());
  root.setDefaultEphemeris("de440");
  return { exports, defaultSource, de440, astronomyEngine };
}

let folder;
let reference;
beforeAll(async () => {
  expect(CARRIED, `artifacts/archives.json carries no archive of ${VERSION}`).toBeTruthy();
  folder = mkdtempSync(join(tmpdir(), "root-unchanged-"));
  const modules = join(folder, "node_modules");
  mkdirSync(join(modules, "@zodiacs", "engine"), { recursive: true });
  const unpacked = spawnSync("tar", ["-xzf", fileURLToPath(at(`artifacts/${CARRIED.file}`)), "-C", join(modules, "@zodiacs", "engine"), "--strip-components=1"], { encoding: "utf8" });
  expect(unpacked.status, unpacked.stderr).toBe(0);
  symlinkSync(fileURLToPath(at("node_modules/astronomy-engine")), join(modules, "astronomy-engine"), "dir");
  vi.resetModules();
  reference = computed(await import(pathToFileURL(join(modules, "@zodiacs", "engine", "dist", "index.js")).href));
}, 120_000);

afterAll(() => {
  vi.resetModules();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`the root entry against the carried archive of ${VERSION}`, () => {
  it("is the reference itself: the archive's root computes on the pack by default", () => {
    expect(JSON.parse(reference.defaultSource).name).toBe("de440");
    expect(reference.de440).toContain('"jpl-de440"');
    expect(reference.astronomyEngine).not.toContain('"jpl-de440"');
    expect(reference.de440).not.toContain(VERSION);
  });

  it("computes from this checkout's source exactly what the archive computes", async () => {
    vi.resetModules();
    const root = computed(await import("../src/index.ts"));
    expect(root.exports).toEqual(reference.exports);
    expect(root.defaultSource).toBe(reference.defaultSource);
    expect(root.de440 === reference.de440, "the root's results on the shipped pack changed").toBe(true);
    expect(root.astronomyEngine === reference.astronomyEngine, "the root's results on astronomy-engine changed").toBe(true);
  });

  it.runIf(existsSync(at("dist/index.js")))("computes from this checkout's build exactly what the archive computes", async () => {
    const root = computed(await import(at("dist/index.js").href));
    expect(root.exports).toEqual(reference.exports);
    expect(root.defaultSource).toBe(reference.defaultSource);
    expect(root.de440 === reference.de440, "the built root's results on the shipped pack changed").toBe(true);
    expect(root.astronomyEngine === reference.astronomyEngine, "the built root's results on astronomy-engine changed").toBe(true);
  });
});
