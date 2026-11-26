// The root entry computes, on the shipped DE440 pack and on astronomy-engine,
// exactly what the carried archive of the version in package.json computes
// (artifacts/archives.json). From 3.0.0 the root's default source is
// astronomy-engine and useDe440(), from @zodiacs/engine/de440/pack, puts it
// on the pack; a 2.x archive's root computes on the pack by default. So each
// root is put on the pack the way its own build offers (useDe440() where its
// pack entry has it, setDefaultEphemeris("de440") otherwise), and then on
// astronomy-engine with setDefaultEphemeris("astronomy-engine"), and the two
// sets of results must be the archive's; and before either, this checkout's
// root must compute on astronomy-engine, unflagged, exactly what the archive
// computes there, and say that no pack is loaded.
//
// The archive's dist/ is extracted to a temporary folder and loaded in this
// same process, beside this checkout's root (src/index.ts with
// src/de440-pack.ts, and dist/index.js with dist/de440-pack.js when it has
// been built), so that both run on the same JavaScript engine and must agree
// exactly, with no tolerance. On a new copy of each root's modules, as an
// application gets them, at every distinct input of the conformance suite's
// L1 and L2 vectors (174 births), each computes natalChart, chartPoints and
// chartDeclinations; and each reports its default source
// (defaultEphemeris()) and its export names. Everything is compared as JSON,
// but the engine's version.
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

/** The shipped pack made a root's default, the way its build offers: useDe440() from 3.0.0, the default itself in 2.x. */
function onPack(root, pack) {
  if (typeof pack.useDe440 === "function") pack.useDe440();
  else root.setDefaultEphemeris("de440");
}

/**
 * What a root computes: its export names; its default source and results
 * before any setting (`plainSource`, `plain`); its default source and results
 * on the shipped pack; and its results on astronomy-engine. `pack` is the same
 * build's @zodiacs/engine/de440/pack. The root is left on its first default.
 */
function computed(root, pack) {
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
  const plainSource = text(root.defaultEphemeris());
  const plain = text(results());
  onPack(root, pack);
  const defaultSource = text(root.defaultEphemeris());
  const de440 = text(results());
  root.setDefaultEphemeris("astronomy-engine");
  const astronomyEngine = text(results());
  root.setDefaultEphemeris(JSON.parse(plainSource).name);
  return { exports, plainSource, plain, defaultSource, de440, astronomyEngine };
}

/** The checkout's root before any setting: on astronomy-engine, with no pack loaded, as the archive's root after setDefaultEphemeris("astronomy-engine"). */
function expectAstronomyEngineFirst(root) {
  expect(JSON.parse(root.plainSource)).toEqual({
    name: "astronomy-engine",
    de440: {
      opened: false, version: null, fromTtDays: null, toTtDays: null,
      error: "the shipped DE440 pack is not loaded: call useDe440() from @zodiacs/engine/de440/pack, or supply a pack through @zodiacs/engine/de440 and withEphemeris"
    }
  });
  expect(root.plain === reference.astronomyEngine, "the root's results before useDe440() are not the archive's on astronomy-engine").toBe(true);
  expect(root.plain).not.toContain("de440-unavailable");
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
  const archived = (file) => import(pathToFileURL(join(modules, "@zodiacs", "engine", "dist", file)).href);
  reference = computed(await archived("index.js"), await archived("de440-pack.js"));
}, 120_000);

afterAll(() => {
  vi.resetModules();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

describe(`the root entry against the carried archive of ${VERSION}`, () => {
  it("is the reference itself: the archive's root computes on the pack, by default in 2.x or after useDe440()", () => {
    expect(JSON.parse(reference.defaultSource).name).toBe("de440");
    expect(JSON.parse(reference.defaultSource).de440.opened).toBe(true);
    expect(reference.de440).toContain('"jpl-de440"');
    expect(reference.astronomyEngine).not.toContain('"jpl-de440"');
    expect(reference.de440).not.toContain(VERSION);
  });

  it("computes from this checkout's source exactly what the archive computes", async () => {
    vi.resetModules();
    const root = computed(await import("../src/index.ts"), await import("../src/de440-pack.ts"));
    expect(root.exports).toEqual(reference.exports);
    expectAstronomyEngineFirst(root);
    expect(root.defaultSource).toBe(reference.defaultSource);
    expect(root.de440 === reference.de440, "the root's results on the shipped pack changed").toBe(true);
    expect(root.astronomyEngine === reference.astronomyEngine, "the root's results on astronomy-engine changed").toBe(true);
  });

  it.runIf(existsSync(at("dist/index.js")))("computes from this checkout's build exactly what the archive computes", async () => {
    const root = computed(await import(at("dist/index.js").href), await import(at("dist/de440-pack.js").href));
    expect(root.exports).toEqual(reference.exports);
    expectAstronomyEngineFirst(root);
    expect(root.defaultSource).toBe(reference.defaultSource);
    expect(root.de440 === reference.de440, "the built root's results on the shipped pack changed").toBe(true);
    expect(root.astronomyEngine === reference.astronomyEngine, "the built root's results on astronomy-engine changed").toBe(true);
  });
});
