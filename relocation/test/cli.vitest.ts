import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Readable, Writable } from "node:stream";
import { natalChart } from "@zodiacs/engine";
import { createNatalEnvelope } from "@zodiacs/engine/receipt";
import { CLI_ERROR_SCHEMA, encodeResult, main, parseArguments, readRequest } from "../src/cli-main.js";
import { MAX_CLI_INPUT_BYTES } from "../src/cli-request.js";
import { relocateChart } from "../src/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const launcher = fileURLToPath(new URL("../bin/relocation.mjs", import.meta.url));
// Synthetic birth and destinations; equality checks are regression checks.
const source = { utc: "2004-05-06T07:08:09.010Z", latitude: 12, longitude: 34,
  houseSystem: "placidus" as const, deltaT: 65 };
const destination = { latitude: 80, longitude: -180 };
const chartRequest = JSON.stringify({ source, destination });
let temporary: string;

beforeAll(async () => {
  await mkdir(root + ".cache", { recursive: true });
  temporary = await mkdtemp(root + ".cache/cli-test-");
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });

function launch(args: string[], input = "") {
  const result = spawnSync(process.execPath, [launcher, ...args], {
    cwd: temporary, input, encoding: "utf8", timeout: 10_000, maxBuffer: 1_500_000
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

function capture() {
  let text = "";
  const stream = new Writable({ write(chunk, _encoding, callback) { text += chunk.toString(); callback(); } });
  return { stream, text: () => text };
}

describe("offline CLI launcher and stream behavior", () => {
  it("returns full chart receipts on stdout from piped JSON with no diagnostics", () => {
    const output = launch(["chart"], chartRequest);
    expect(output.status).toBe(0);
    expect(output.stderr).toBe("");
    expect(JSON.parse(output.stdout)).toEqual(relocateChart(source, destination));
    expect(output.stdout.endsWith("\n")).toBe(true);
    expect(output.stdout.split("\n")).toHaveLength(2);
  });

  it("reads a file with spaces from another cwd, pretty prints and accepts stdin explicitly", async () => {
    const input = temporary + "/synthetic request.json";
    await writeFile(input, chartRequest);
    const file = launch(["chart", "--input", input, "--pretty"]);
    const piped = launch(["chart", "--input", "-"], chartRequest);
    expect(file.status).toBe(0);
    expect(file.stderr).toBe("");
    expect(file.stdout).toContain('\n  "schema":');
    expect(JSON.parse(file.stdout)).toEqual(JSON.parse(piped.stdout));
  });

  it("accepts an engine envelope in a real process and preserves the requested house system", () => {
    const envelope = createNatalEnvelope(natalChart({ ...source, latitude: 80 }));
    const output = launch(["chart"], JSON.stringify({ source: envelope, destination: { latitude: 12, longitude: 34 } }));
    expect(output.status).toBe(0);
    expect(output.stderr).toBe("");
    const result = JSON.parse(output.stdout);
    expect(result.natal.result.houses.system).toBe("whole");
    expect(result.relocated.result.houses.system).toBe("placidus");
  });

  it("runs all line modes and both grid modes in real processes", () => {
    const requests = [
      ["lines", "angular", { bounds: { south: -90, north: 90, west: -180, east: 180 },
        latitudeStep: 90, bodies: ["Sun"], maxEvaluations: 64 }, "zodiacs.relocation-lines.v1"],
      ["lines", "path", { from: { latitude: 80, longitude: 170 }, to: { latitude: 75, longitude: -170 },
        stepDegrees: 5, bodies: ["Sun"], lines: ["MC"], maxEvaluations: 64, maxRefinements: 8,
        coordinateTolerance: 0.001, residualTolerance: 0.001 }, "zodiacs.relocation-path-crossings.v1"],
      ["lines", "local-space", { origin: { latitude: -75, longitude: 175 }, lengthDegrees: 60,
        stepDegrees: 30, bodies: ["Sun"], maxEvaluations: 32 }, "zodiacs.relocation-local-space.v1"],
      ["grid", "charts", { bounds: { south: 75, north: 80, west: 175, east: -175 },
        latitudeStep: 5, longitudeStep: 10, maxSamples: 4 }, "zodiacs.relocation-grid.v1"],
      ["grid", "crossings", { bounds: { south: 75, north: 80, west: 175, east: -175 },
        latitudeStep: 5, longitudeStep: 10, bodies: ["Sun"], maxEvaluations: 32, maxRefinements: 0,
        coordinateTolerance: 0.001, residualTolerance: 0.001 }, "zodiacs.relocation-grid-crossings.v1"]
    ] as const;
    for (const [command, mode, options, schema] of requests) {
      const output = launch([command], JSON.stringify({ source, mode, options }));
      expect(output.status).toBe(0);
      expect(output.stderr).toBe("");
      expect(JSON.parse(output.stdout).schema).toBe(schema);
    }
  });

  it("runs the committed synthetic examples from the documented local input paths", async () => {
    for (const [command, name] of [["chart", "chart"], ["lines", "lines"], ["grid", "grid"],
      ["lines", "path"], ["lines", "local-space"], ["grid", "grid-crossings"]] as const) {
      const inputPath = root + `examples/${name}.json`;
      const file = launch([command, "--input", inputPath]);
      const piped = launch([command], await readFile(inputPath, "utf8"));
      expect(file.status).toBe(0);
      expect(file.stderr).toBe("");
      expect(file.stdout).toBe(piped.stdout);
    }
  });

  it("retains receipts and unresolved metadata when a grid exhausts its refinement budget", () => {
    const output = launch(["grid"], JSON.stringify({ source, mode: "crossings", options: {
      bounds: { south: -10, north: 10, west: -180, east: 180 }, latitudeStep: 20, longitudeStep: 120,
      bodies: ["Sun"], maxEvaluations: 9, maxRefinements: 32,
      coordinateTolerance: 1e-6, residualTolerance: 1e-6 } }));
    expect(output.status).toBe(0);
    expect(output.stderr).toBe("");
    const result = JSON.parse(output.stdout);
    expect(result.status).toBe("ok");
    expect(result.sampling.evaluations).toEqual({ positions: 1, houses: 8 });
    expect(result.unresolvedCells.length).toBeGreaterThan(0);
    expect(result.edgeResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "unresolved", reason: "refinement-budget" })]));
    expect(result.sampling.samples.every((sample: { engine: { receipt: unknown } }) => sample.engine.receipt)).toBe(true);
  });

  it("uses a separate refusal exit code with structured output and keeps unknown-time charts valid", () => {
    for (const utc of [source.utc, "2500-01-01T00:00:00Z"]) {
      const natal = { ...source, utc, ...(utc === source.utc ? { timeKnown: false } : {}) };
      const output = launch(["lines"], JSON.stringify({ source: natal, mode: "angular",
        options: { bounds: { south: -30, north: 30, west: -180, east: 180 }, latitudeStep: 30,
          bodies: ["Sun"], maxEvaluations: 64 } }));
      expect(output.status).toBe(2);
      expect(output.stderr).toBe("");
      expect(JSON.parse(output.stdout)).toMatchObject({ status: "refused",
        reason: utc === source.utc ? "unknown-time" : "engine-refusal" });
    }
    const untimed = launch(["chart"], JSON.stringify({ source: { ...source, timeKnown: false }, destination }));
    expect(untimed.status).toBe(0);
    expect(JSON.parse(untimed.stdout).relocated.result.angles).toBeNull();
  });

  it("reports invalid arguments, malformed JSON and file failures without partial stdout or input echo", () => {
    for (const [args, input, code] of [
      [[], chartRequest, "invalid-arguments"], [["unknown"], chartRequest, "invalid-arguments"],
      [["chart", "--pretty", "--pretty"], chartRequest, "invalid-arguments"],
      [["chart", "--input"], chartRequest, "invalid-arguments"],
      [["chart", "--input", "--pretty"], chartRequest, "invalid-arguments"],
      [["chart", "--input", "-", "--input", "-"], chartRequest, "invalid-arguments"],
      [["chart", "--output", "unexpected.json"], chartRequest, "invalid-arguments"],
      [["chart"], '{"private-example-value":', "invalid-json"],
      [["chart", "--input", temporary + "/absent.json"], "", "input-io"],
      [["chart"], JSON.stringify({ source, destination: { latitude: 90, longitude: 0 } }), "invalid-request"],
      [["chart"], JSON.stringify({ source: { schema: "invalid" }, destination }), "invalid-source"]
    ] as const) {
      const output = launch([...args], input);
      expect(output.status).toBe(1);
      expect(output.stdout).toBe("");
      expect(output.stderr).not.toContain("private-example-value");
      expect(output.stderr).not.toContain(temporary);
      expect(JSON.parse(output.stderr)).toMatchObject({ schema: CLI_ERROR_SCHEMA, status: "error", code });
    }
  });

  it("encodes overflow budget diagnostics explicitly without silent Infinity conversion", () => {
    const output = launch(["grid"], JSON.stringify({ source, mode: "charts", options: {
      bounds: { south: -80, north: 80, west: -180, east: 180 }, latitudeStep: Number.MIN_VALUE,
      longitudeStep: 1, maxSamples: 4 } }));
    expect(output.status).toBe(1);
    expect(output.stdout).toBe("");
    expect(JSON.parse(output.stderr)).toMatchObject({ code: "budget", budget: {
      unit: "samples", required: null, requiredRepresentable: false, maximum: 4 } });
    expect(() => encodeResult({ value: Infinity }, false)).toThrow(/unrepresentable/);
    expect(() => encodeResult({ value: NaN }, false)).toThrow(/unrepresentable/);
  });

  it("bounds streaming bytes before parsing, refuses invalid UTF-8 and handles failed input streams", async () => {
    expect(await readRequest(Readable.from([Buffer.from("{\"x\":\""), Buffer.from("é"), Buffer.from("\"}")]))).toBe('{"x":"é"}');
    const bytes = Buffer.from('{"x":"é"}');
    expect(await readRequest(Readable.from([...bytes].map((b) => Buffer.from([b]))))).toBe('{"x":"é"}');
    await expect(readRequest(Readable.from([Buffer.alloc(MAX_CLI_INPUT_BYTES), Buffer.from("x")]))).rejects.toMatchObject({ code: "input-limit" });
    await expect(readRequest(Readable.from([Buffer.from([0xc3, 0x28])]))).rejects.toMatchObject({ code: "invalid-json" });
    const failed = new Readable({ read() { this.destroy(new Error("private input details")); } });
    await expect(readRequest(failed)).rejects.toMatchObject({ code: "input-io", message: "Could not read the local JSON input." });
    const output = launch(["chart"], chartRequest.padEnd(MAX_CLI_INPUT_BYTES + 1));
    expect(output.status).toBe(1);
    expect(output.stdout).toBe("");
    expect(JSON.parse(output.stderr).code).toBe("input-limit");
  });

  it("prints help without reading input, rejects interactive waiting and handles output failures", async () => {
    expect(parseArguments(["--help"])).toBe("help");
    expect(parseArguments(["lines", "--help"])).toBe("help");
    const stdout = capture();
    const stderr = capture();
    const stdin = Object.assign(new Readable({ read() { throw new Error("must not read"); } }), { isTTY: true });
    expect(await main(["--help"], { stdin, stdout: stdout.stream, stderr: stderr.stream })).toBe(0);
    expect(stdout.text()).toContain("Usage: relocation");
    const help = launch(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stderr).toBe("");
    const other = capture();
    expect(await main(["chart"], { stdin, stdout: other.stream, stderr: stderr.stream })).toBe(1);
    expect(other.text()).toBe("");
    expect(JSON.parse(stderr.text()).code).toBe("invalid-arguments");
    const broken = new Writable({ write(_chunk, _encoding, callback) { callback(new Error("private pipe details")); } });
    const diagnostic = capture();
    expect(await main(["chart"], { stdin: Readable.from([chartRequest]), stdout: broken, stderr: diagnostic.stream })).toBe(1);
    expect(JSON.parse(diagnostic.text())).toMatchObject({ code: "output-io" });
    const brokenDiagnostic = new Writable({ write(_chunk, _encoding, callback) { callback(new Error("closed")); } });
    expect(await main([], { stdin: Readable.from([]), stdout: other.stream, stderr: brokenDiagnostic })).toBe(1);
  });
});
