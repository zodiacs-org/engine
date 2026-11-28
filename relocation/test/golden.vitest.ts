import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { ENGINE_VERSION, EPHEMERIS, natalChart } from "@zodiacs/engine";
import { calc, houses } from "@zodiacs/engine/calc";
import { createNatalEnvelope, natalReplayInput, parseNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
import { goldenCases, goldenCliRequest, projectGoldenResult, runGoldenCase } from "../scripts/golden-data.js";
import type { GoldenResult } from "../scripts/golden-data.js";
import { containsPoint, relocateChart, sampleGrid, wrapLongitude } from "../src/index.js";
import type { PolylineVertex } from "../src/index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const fixtures = new URL("./fixtures/", import.meta.url);
const launcher = fileURLToPath(new URL("../bin/relocation.mjs", import.meta.url));
// This tolerance absorbs tiny runtime arithmetic differences in regression
// output. Counts, indices, exact integers, topology and metadata must match.
const numericalTolerance = 1e-9;

function compare(actual: unknown, expected: unknown, path = "output"): void {
  if (typeof expected === "number") {
    expect(typeof actual, path).toBe("number");
    expect(Number.isFinite(actual), path).toBe(true);
    if (Number.isInteger(expected)) expect(actual, path).toBe(expected);
    else expect(Math.abs((actual as number) - expected), path).toBeLessThanOrEqual(numericalTolerance);
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    const values = actual as unknown[];
    expect(values.length, path).toBe(expected.length);
    expected.forEach((value, index) => compare(values[index], value, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === "object") {
    expect(actual !== null && typeof actual === "object" && !Array.isArray(actual), path).toBe(true);
    const values = actual as Record<string, unknown>;
    const record = expected as Record<string, unknown>;
    expect(Object.keys(values).sort(), path).toEqual(Object.keys(record).sort());
    for (const key of Object.keys(record)) compare(values[key], record[key], `${path}.${key}`);
  } else {
    expect(actual, path).toBe(expected);
  }
}

function ok(result: GoldenResult) {
  if (result.status !== "ok") throw new Error(result.reason);
  return result;
}

function polylines(result: ReturnType<typeof ok>): readonly (readonly PolylineVertex[])[] {
  if ("lines" in result) return result.lines.flatMap((line) => line.polylines);
  if ("cells" in result) return result.cells.flatMap((cell) => cell.polylines);
  return result.polylines;
}

describe("generated synthetic golden polylines", () => {
  it("binds the fixture inventory and engine identity to the carried archive", async () => {
    const manifest = JSON.parse(await readFile(new URL("manifest.json", fixtures), "utf8")) as {
      schema: string; node: string; engine: unknown;
      archive: { path: string; sha256: string; integrity: string };
      fixtures: { file: string; bytes: number; sha256: string }[];
    };
    expect(manifest.schema).toBe("zodiacs.relocation-golden-manifest.v1");
    expect(manifest.node).toBe("22.22.2");
    expect(manifest.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION, ephemeris: EPHEMERIS });
    const archive = await readFile(new URL(manifest.archive.path, new URL("../", import.meta.url)));
    expect(createHash("sha256").update(archive).digest("hex")).toBe(manifest.archive.sha256);
    const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
    expect(manifest.archive.integrity).toBe("sha512-" + createHash("sha512").update(archive).digest("base64"));
    expect(lock.packages["node_modules/@zodiacs/engine"].integrity).toBe(manifest.archive.integrity);
    expect(manifest.fixtures.map((entry) => entry.file)).toEqual(goldenCases.map((spec) => spec.id + ".json"));
    expect((await readdir(fixtures)).filter((file) => file.endsWith(".json")).sort())
      .toEqual(["manifest.json", ...manifest.fixtures.map((entry) => entry.file)].sort());
    for (const entry of manifest.fixtures) {
      const bytes = await readFile(new URL(entry.file, fixtures));
      expect(bytes.length).toBe(entry.bytes);
      expect(bytes.length).toBeLessThanOrEqual(100_000);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(entry.sha256);
    }
  });

  for (const spec of goldenCases) {
    it(`${spec.id}: matches geometry and metadata through birth, chart, envelope and CLI entry points`, async () => {
      const fixture = JSON.parse(await readFile(new URL(spec.id + ".json", fixtures), "utf8"));
      expect(fixture.schema).toBe("zodiacs.relocation-golden.v1");
      expect(fixture.id).toBe(spec.id);
      expect(fixture.request).toEqual(spec);
      expect(fixture.reference).toBe("installed-carried-engine-regression;not-independent-accuracy");
      const chart = natalChart(spec.source);
      const envelope = createNatalEnvelope(chart, { sourceInstant: spec.source.utc as string });
      const decoded = parseNatalEnvelope(serializeNatalEnvelope(envelope));
      if (!decoded.ok) throw new Error(decoded.code);
      for (const source of [spec.source, chart, decoded.envelope]) {
        const result = runGoldenCase(spec, source);
        const projection = projectGoldenResult(result);
        // Chart capture cannot recover the submitted ISO spelling. Check
        // its engine capture context separately, keeping geometry comparison.
        if (source === chart) {
          expect(projection.sampling.natalReceipt.sourceInstant).toBe(createNatalEnvelope(chart).receipt.sourceInstant);
          const expected = structuredClone(fixture.output);
          expected.sampling.natalReceipt.sourceInstant = projection.sampling.natalReceipt.sourceInstant;
          compare(projection, expected);
        } else compare(projection, fixture.output);
      }
      const { command, request } = goldenCliRequest(spec);
      const cli = spawnSync(process.execPath, [launcher, command], { cwd: project + ".cache",
        input: JSON.stringify(request), encoding: "utf8", timeout: 10_000, maxBuffer: 1_500_000 });
      expect(cli.error).toBeUndefined();
      expect(cli.signal).toBeNull();
      expect(cli.status).toBe(0);
      expect(cli.stderr).toBe("");
      const output = JSON.parse(cli.stdout);
      const result = request.mode === "angular" ? output.results[0] : output;
      const projection = projectGoldenResult(result);
      if (request.mode === "angular") {
        // The dispatcher assigns each family its conservative reservation
        // inside the aggregate CLI budget; the library retains the caller cap.
        expect(output.results).toHaveLength(1);
        expect(output.maxEvaluations).toBe(spec.options.maxEvaluations);
        expect(output.requiredEvaluations).toBe(fixture.output.plan.requiredEvaluations);
        expect(projection.plan.maxEvaluations).toBe(output.requiredEvaluations);
        const expected = structuredClone(fixture.output);
        expected.plan.maxEvaluations = output.requiredEvaluations;
        compare(projection, expected);
      } else compare(projection, fixture.output);
    });

    it(`${spec.id}: replays every receipt and resolves sample, seam and crossing provenance`, () => {
      const result = ok(runGoldenCase(spec));
      const sampling = result.sampling;
      expect(sampling.evaluations.positions + sampling.evaluations.houses).toBeLessThanOrEqual(spec.options.maxEvaluations);
      expect(sampling.evaluations.positions).toBe(sampling.positions.length);
      expect(sampling.evaluations.houses).toBe(sampling.samples.filter((observer) => observer.status === "ok").length);
      expect(createNatalEnvelope(natalChart(natalReplayInput(sampling.natal))).result).toEqual(sampling.natal.result);
      for (const position of sampling.positions) {
        expect(calc(position.engine.receipt.request)).toEqual(position.engine);
      }
      for (const [index, observer] of sampling.samples.entries()) {
        expect(observer.index).toBe(index);
        if (observer.status === "undefined") {
          expect(Math.abs(observer.point.latitude)).toBe(90);
          expect(observer.engine).toBeNull();
          expect(observer.bodies).toEqual([]);
          continue;
        }
        expect(houses(observer.engine.receipt.request)).toEqual(observer.engine);
        expect(observer.engine.requested).toBe(spec.source.houseSystem);
        expect(observer.engine.receipt.request.place).toEqual(observer.point);
        for (const row of observer.bodies) {
          const position = sampling.positions[row.positionIndex]!;
          expect(position.body).toBe(row.body);
          expect(position.engine.receipt.instants).toEqual(observer.engine.receipt.instants);
        }
        if (Math.abs(observer.point.latitude) >= 75) expect(observer.engine.system).toBe("whole");
      }
      for (const line of polylines(result)) {
        for (const [index, vertex] of line.entries()) {
          expect(Math.abs(vertex.point.latitude)).toBeLessThan(90);
          expect(Math.abs(vertex.point.longitude)).toBeLessThanOrEqual(180);
          if (index > 0) expect(Math.abs(vertex.point.longitude - line[index - 1]!.point.longitude)).toBeLessThanOrEqual(180);
          if (vertex.source.kind === "sample") {
            const observer = sampling.samples[vertex.source.index]!;
            expect(observer.status).toBe("ok");
            expect(vertex.point.latitude).toBe(observer.point.latitude);
            expect(wrapLongitude(vertex.point.longitude)).toBe(wrapLongitude(observer.point.longitude));
          } else {
            expect(Math.abs(vertex.point.longitude)).toBe(180);
            expect(vertex.source.fraction).toBeGreaterThanOrEqual(0);
            expect(vertex.source.fraction).toBeLessThanOrEqual(1);
            for (const index of [vertex.source.fromIndex, vertex.source.toIndex]) {
              expect(sampling.samples[index]!.status).toBe("ok");
            }
          }
          if ("bounds" in spec.options) expect(containsPoint(spec.options.bounds, vertex.point)).toBe(true);
        }
      }
      if ("crossings" in result) {
        for (const crossing of result.crossings) {
          const observer = sampling.samples[crossing.observerIndex]!;
          if (observer.status !== "ok") throw new Error(observer.reason);
          expect(crossing.point).toEqual(observer.point);
          expect(crossing.body).toBe(sampling.positions[crossing.positionIndex]!.body);
          const row = observer.bodies[crossing.positionIndex]!;
          expect(crossing.residual).toBe(row.residuals[crossing.kind]);
          expect(Math.abs(crossing.residual)).toBeLessThanOrEqual(result.plan.residualTolerance);
          const searches = "edgeResults" in result ? result.edgeResults : result.intervalResults;
          const admitted = searches.filter((search) => search.crossingIndex === crossing.index);
          expect(admitted.length).toBeGreaterThan(0);
          for (const search of admitted) expect(search.bracket!.width).toBeLessThanOrEqual(result.plan.coordinateTolerance);
          const relocated = relocateChart(sampling.natal, observer.point);
          expect(relocated.relocated.receipt.houses.actual).toBe(observer.engine.system);
          const replay = natalReplayInput(relocated.relocated);
          expect(replay).toMatchObject({ ...observer.point, deltaT: spec.source.deltaT });
          expect(replay.timeScale ?? "utc").toBe(spec.source.timeScale ?? "utc");
        }
      }
    });
  }

  it("retains the intended singularities, partial results and seam coverage in the corpus", () => {
    const results = new Map(goldenCases.map((spec) => [spec.id, ok(runGoldenCase(spec))]));
    const meridians = results.get("meridians-poles")!;
    expect(meridians.sampling.natal.receipt.houses.actual).toBe("whole");
    expect(meridians.sampling.samples.some((sample) => sample.status === "undefined")).toBe(true);
    const horizons = results.get("horizons-tangencies")!;
    if (!("lines" in horizons)) throw new Error("Expected horizon lines");
    for (const state of ["gap", "tangent", "undefined"]) {
      expect(horizons.lines.some((line) => line.samples.some((sample) => sample.status === state))).toBe(true);
    }
    for (const id of ["horizons-tangencies", "horizons-wrapped-clipping", "grid-seam-crossings",
      "path-seam-crossing", "local-space-seam-tt"]) {
      expect(polylines(results.get(id)!).flat().some((vertex) => vertex.source.kind === "seam"), id).toBe(true);
    }
    const grid = results.get("grid-seam-crossings")!;
    if (!("cells" in grid)) throw new Error("Expected grid cells");
    expect(grid.crossings.length).toBeGreaterThan(0);
    expect(grid.cells.some((cell) => cell.polylines.length > 0)).toBe(true);
    const stopped = results.get("grid-budget-stop")!;
    if (!("edgeResults" in stopped)) throw new Error("Expected grid edge searches");
    expect(stopped.unresolvedCells.length).toBeGreaterThan(0);
    expect(stopped.edgeResults.some((edge) => edge.reason === "refinement-budget")).toBe(true);
    const path = results.get("path-polar-gap")!;
    if (!("unresolvedIntervals" in path)) throw new Error("Expected path intervals");
    expect(path.unresolvedIntervals.some((interval) => interval.reason === "geographic-pole")).toBe(true);
  });

  it("feeds a wrapped chart grid's stored natal receipt into angular generation without changing settings", () => {
    const spec = goldenCases[0]!;
    const grid = sampleGrid(spec.source, { bounds: { south: 75, north: 80, west: 175, east: -175 },
      latitudeStep: 5, longitudeStep: 10, maxSamples: 4 });
    for (const sample of grid.samples) {
      const replay = natalReplayInput(sample.envelope);
      expect(sample.envelope.receipt.houses).toMatchObject({ requested: "placidus", actual: "whole" });
      expect(replay).toMatchObject({ ...sample.point, deltaT: 65 });
      expect(replay.timeScale ?? "utc").toBe("utc");
      const result = ok(runGoldenCase(spec, sample.envelope));
      expect(result.sampling.natal).toEqual(sample.envelope);
      expect(result.sampling.positions).toEqual(ok(runGoldenCase(spec)).sampling.positions);
    }
  });

  it.skipIf(process.versions.node !== "22.22.2")("regenerates every fixture byte on the recorded runtime", () => {
    const checked = spawnSync(process.execPath, [project + "scripts/generate-golden.mjs", "--check"], {
      cwd: project + ".cache", encoding: "utf8", timeout: 10_000
    });
    expect(checked.error).toBeUndefined();
    expect(checked.signal).toBeNull();
    expect(checked.stderr).toBe("");
    expect(checked.status).toBe(0);
    expect(checked.stdout).toContain("Golden fixtures checked:");
  });
});
