import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveLocalBirth } from "../../src/geo.js";
import { prepareEngineInput, runEngineExample, SYNTHETIC_REQUESTS } from "../examples/engine-input.js";
import { loadAtlasTimeProvider } from "../src/atlas-time.js";
import { buildGeoNamesIndex } from "../src/build-index.js";
import { createGeocoder } from "../src/index.js";
import type { AtlasTimeResult, GeocodeResult, PlaceDataset } from "../src/index.js";
import { loadPlaceIndex } from "../src/load-index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
let directory: string;
let index: string;
let dataset: PlaceDataset;
let answers: Awaited<ReturnType<typeof runEngineExample>>;

beforeAll(async () => {
  await mkdir(join(project, ".tmp"), { recursive: true });
  directory = await mkdtemp(join(project, ".tmp", "engine-example-"));
  index = join(directory, "sample index");
  const receipt = JSON.parse(await readFile(join(project, "data/sample-receipt.json"), "utf8")) as {
    outputs: Array<{ file: string; sha256: string }>;
  };
  function source(file: string) {
    return {
      path: join(project, "data", file), url: "https://download.geonames.org/export/dump/",
      expectedSha256: receipt.outputs.find((entry) => entry.file === file)!.sha256
    };
  }
  await buildGeoNamesIndex({
    places: source("geonames-sample.tsv"), countries: source("country-info-sample.tsv"),
    admin1: source("admin1-sample.tsv"), outputDirectory: index
  });
  dataset = await loadPlaceIndex(index);
  answers = await runEngineExample(index);
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

function answer(label: string) {
  const found = answers.find((entry) => entry.label === label);
  if (!found) throw new Error("Missing example answer");
  return found;
}

// This checks application handoff against the existing APIs, not astronomy
// or independent historical accuracy. No chart is calculated by this example.
describe("synthetic engine input example", () => {
  it("prepares the existing engine's input without rereading a covered comparison zone", () => {
    const { geocode, handoff } = answer("documented-atlas");
    expect(handoff.status).toBe("ready");
    if (geocode.status !== "time-result" || geocode.time.provider !== "atlas" || handoff.status !== "ready") {
      throw new Error("Expected a documented atlas handoff");
    }
    const instant = geocode.time.resolution.instants[0]!;
    expect(handoff.engineInput).toEqual({
      utc: new Date(instant.utcMs), latitude: geocode.time.provenance.place.latitude,
      longitude: geocode.time.provenance.place.longitude,
      houseSystem: "whole", timeKnown: true, timeScale: "utc"
    });
    expect(geocode.time.provenance.citations.length).toBeGreaterThan(0);
    expect(geocode.provenance).toEqual(dataset.provenance);
  });

  it.each(["assigned-iana", "polar-place"])("hands %s to the engine using the native resolved instant and flags", (label) => {
    const { geocode, handoff } = answer(label);
    if (geocode.status !== "time-result" || geocode.time.provider !== "iana"
        || geocode.time.status !== "ok" || handoff.status !== "ready") {
      throw new Error("Expected an IANA handoff");
    }
    const native = resolveLocalBirth({
      date: geocode.input.date, time: geocode.input.time, timeZone: geocode.time.timeZone,
      // Omit coordinates while resolving: longitude would enable birthplace
      // mean-time substitution. Coordinates enter only the resolved BirthInput.
      houseSystem: "whole", timeKnown: true
    });
    expect(handoff.engineInput.utc).toEqual(native.birth.utc);
    expect(handoff.engineInput.flags).toEqual(native.birth.flags);
    expect(handoff.engineInput.latitude).toBe(geocode.place.latitude);
    expect(handoff.engineInput.longitude).toBe(geocode.place.longitude);
    expect(handoff.engineInput.utc).not.toBe(geocode.time.resolution.utc);
    (handoff.engineInput.utc as Date).setTime(0);
    expect(geocode.time.resolution.utc).toEqual(native.birth.utc);
    // Restore only our detached example input for the following launcher parity check.
    (handoff.engineInput.utc as Date).setTime((native.birth.utc as Date).getTime());
  });

  it.each([
    ["ambiguous-place", "place-selection"], ["unknown-time", "clock-time"],
    ["skipped-reading", "clock-change"], ["repeated-reading", "clock-change"],
    ["uncertain-atlas", "historical-uncertainty"], ["inferred-atlas", "historical-uncertainty"]
  ])("keeps %s unresolved for application review", (label, reason) => {
    expect(answer(label!).handoff).toEqual({ status: "needs-review", reason });
    expect(answer(label!).handoff).not.toHaveProperty("engineInput");
  });

  it("uses atlas coordinates even if the lookup snapshot has newer coordinates", async () => {
    const changed = {
      ...dataset, places: dataset.places.map((place) => place.id === "geonames:2988507"
        ? { ...place, latitude: 12, longitude: 34, timeZone: "Etc/UTC" } : place)
    };
    const result = await createGeocoder(changed, loadAtlasTimeProvider()).resolve(SYNTHETIC_REQUESTS[0]!.request);
    expect(prepareEngineInput(result)).toEqual(answer("documented-atlas").handoff);
    expect(result.place).toMatchObject({ latitude: 12, longitude: 34 });
  });

  it.each(["no-match", "unknown-place"] as const)("does not manufacture engine input for %s", (status) => {
    const result: GeocodeResult = {
      status, input: { kind: "civil-time", date: "2000-01-01", time: "12:00" },
      provenance: dataset.provenance, lookup: null, place: null, selection: null, time: null
    };
    expect(prepareEngineInput(result)).toEqual({ status: "needs-review", reason: "place-selection" });
  });

  it.each([null, "Invented/Unavailable"])("keeps unavailable zone case %# out of the engine", async (timeZone) => {
    const changed = { ...dataset, places: dataset.places.map((place) => ({ ...place, timeZone })) };
    const result = await createGeocoder(changed, loadAtlasTimeProvider()).resolve(SYNTHETIC_REQUESTS[1]!.request);
    expect(prepareEngineInput(result)).toEqual({ status: "needs-review", reason: "time-unavailable" });
  });

  it("keeps a covered clock refusal out of the engine", () => {
    const { geocode } = answer("documented-atlas");
    if (geocode.status !== "time-result" || geocode.time.provider !== "atlas") throw new Error("Expected atlas");
    const time: AtlasTimeResult = { ...geocode.time, status: "no-such-clock",
      resolution: { ...geocode.time.resolution, status: "no-such-clock", instants: [] } };
    expect(prepareEngineInput({ ...geocode, time })).toEqual({ status: "needs-review", reason: "time-unavailable" });
  });

  it("runs the documented example from an unrelated working directory with Node network APIs blocked", () => {
    const result = spawnSync(process.execPath, [
      "--import", join(project, "tests/fixtures/no-network.mjs"), join(project, "examples/run.mjs"), index
    ], { cwd: directory, encoding: "utf8", timeout: 20_000,
      env: { ...process.env, NODE_OPTIONS: "", TZ: "Pacific/Honolulu" } });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(answers)));
  });

  it("prints private diagnostics and no partial answers for a missing local index", () => {
    const privatePath = join(directory, "PRIVATE-SYNTHETIC-missing-index");
    const result = spawnSync(process.execPath, [join(project, "examples/run.mjs"), privatePath], {
      cwd: directory, encoding: "utf8", timeout: 20_000, env: { ...process.env, NODE_OPTIONS: "" }
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Cannot run the example");
    expect(result.stderr).not.toContain(privatePath);
  });

  it("documents the required local index argument", () => {
    const result = spawnSync(process.execPath, [join(project, "examples/run.mjs")], {
      cwd: directory, encoding: "utf8", timeout: 20_000, env: { ...process.env, NODE_OPTIONS: "" }
    });
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Usage: node examples/run.mjs <local-index>");
  });
});
