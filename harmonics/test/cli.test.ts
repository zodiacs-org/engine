import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.js";
import * as receipt from "../../src/receipt.js";
import { CLI_SCHEMA, executeChart, parseChartArguments, runCli } from "../src/cli.js";
import { parseChartRequest } from "../src/cli-input.js";
import type { CliChartResult } from "../src/cli.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = fileURLToPath(new URL("../bin/harmonics.mjs", import.meta.url));
const noNetwork = fileURLToPath(new URL("./no-network.mjs", import.meta.url));
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url));

function invoke(args: string[], input = Buffer.alloc(0), cwd = root) {
  return spawnSync(process.execPath, ["--import", noNetwork, bin, ...args], {
    cwd, input, encoding: "utf8", timeout: 15000, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "" }
  });
}

function chartArgs(...extra: string[]) {
  const args = parseChartArguments(["chart", "--input", "-", ...extra]);
  if (args === "help") throw new Error("Expected chart arguments");
  return args;
}

afterEach(() => vi.restoreAllMocks());

describe("CLI chart execution", () => {
  it("delegates casting once and preserves the original receipt outside the transform", async () => {
    const cast = vi.spyOn(api, "natalChart");
    const capture = vi.spyOn(receipt, "createNatalEnvelope");
    const result = await executeChart(parseChartRequest(fixture("chart-birth")), chartArgs("--harmonic", "3"));
    expect(cast).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    if (result.sourceMode !== "birth") throw new Error("Expected birth result");
    expect(result.source.envelope).toBe(capture.mock.results[0]!.value);
    expect(result.source.envelope.receipt.sourceInstant).toBe("2002-04-06T05:00:00+02:00");
    expect(result.source.envelope.receipt.provenance?.runtime)
      .toEqual({ name: "node", version: process.versions.node });
    expect(Object.hasOwn(result.harmonicChart, "receipt")).toBe(false);
  });

  it("rejects birth-only options on supplied points and contradictory engine flags", async () => {
    const cast = vi.spyOn(api, "natalChart");
    await expect(executeChart(parseChartRequest(fixture("chart-points")), chartArgs("--include-angles")))
      .rejects.toMatchObject({ code: "invalid-arguments" });
    expect(cast).not.toHaveBeenCalled();
    const input = Buffer.from('{"birth":{"utc":"2002-04-06","flags":["no-time"]}}');
    await expect(executeChart(parseChartRequest(input), chartArgs())).rejects.toThrow(/flags/u);
  });

  it("writes help and argument errors on separate channels without terminating a host", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    expect(await runCli(["--help"])).toBe(0);
    expect(stdout).toHaveBeenCalledTimes(1);
    expect(stderr).not.toHaveBeenCalled();
    stdout.mockClear();
    expect(await runCli(["chart"])).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(JSON.parse(stderr.mock.calls[0]![0] as string)).toMatchObject({ error: { code: "invalid-arguments" } });
  });
});

describe("offline CLI process integration", () => {
  it("prints hand-derived synthetic longitude transforms from a file", () => {
    const result = invoke(["chart", "--input", "fixtures/chart-points.json", "--harmonic", "3"]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    // 3*10=30; 3*130=390=360+30; 3*250=750=720+30.
    // Supplied speeds are validated but the pure longitude transform omits them.
    expect(JSON.parse(result.stdout)).toEqual({
      schema: CLI_SCHEMA, command: "chart", sourceMode: "points",
      harmonicChart: { harmonic: 3, maxHarmonic: 180, points: [
        { body: "Sun", sourceLon: 10, lon: 30 },
        { body: "Moon", sourceLon: 130, lon: 30 },
        { body: "Mercury", sourceLon: 250, lon: 30 }
      ] }
    });
    expect(result.stdout.endsWith("\n")).toBe(true);
    const repeated = invoke(["chart", "--input", "-", "--harmonic", "3"], fixture("chart-points"));
    expect(repeated.status).toBe(0);
    expect(repeated.stderr).toBe("");
    expect(repeated.stdout).toBe(result.stdout);
  });

  it("reads stdin from another working directory and honors an extended ceiling", () => {
    const input = Buffer.from('{"points":[{"body":"A","lon":0.25}]}');
    const result = invoke(["chart", "--input", "-", "--harmonic", "720", "--max-harmonic", "720"],
      input, fileURLToPath(new URL("../fixtures", import.meta.url)));
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    // 720 * 1/4 = 180 degrees exactly.
    expect(JSON.parse(result.stdout).harmonicChart).toEqual({
      harmonic: 720, maxHarmonic: 720, points: [{ body: "A", sourceLon: 0.25, lon: 180 }]
    });
  });

  it("casts a synthetic birth offline and returns a replayable source receipt and optional points", () => {
    const result = invoke(["chart", "--input", "fixtures/chart-birth.json", "--harmonic", "3",
      "--include-angles", "--include-chart-points"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout) as CliChartResult;
    if (output.sourceMode !== "birth") throw new Error("Expected birth result");
    const decoded = receipt.parseNatalEnvelope(JSON.stringify(output.source.envelope));
    expect(decoded.ok).toBe(true);
    expect(output.source.envelope.receipt.sourceInstant).toBe("2002-04-06T05:00:00+02:00");
    expect(output.source.envelope.receipt.instant).toBe("2002-04-06T03:00:00.000Z");
    expect(output.source.envelope.receipt.engine.ephemeris).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    expect(output.source.flags).toEqual(output.source.envelope.receipt.resultFlags);
    expect(output.harmonicChart.points.find(({ body }) => body === "Ascendant"))
      .not.toHaveProperty("speed");
    expect(output.harmonicChart.points.some(({ body }) => body === "Mean Node")).toBe(true);
    // Integration parity verifies delegation; it is not an independent ephemeris reference.
    const replay = api.natalChart(receipt.natalReplayInput(output.source.envelope));
    expect(output.source.envelope.result.bodies).toEqual(replay.bodies);
    expect(output.source.envelope.result.angles).toEqual(replay.angles);
  });

  it("preserves unknown time, pinned TT and polar fallback semantics", () => {
    const unknown = invoke(["chart", "--input", "-", "--include-angles"], Buffer.from(JSON.stringify({ birth: {
      utc: "2002-04-06T03:00:00Z", timeKnown: false, timeScale: "tt", deltaT: 64, flags: ["lmt", "lmt"]
    } })));
    expect(unknown.status).toBe(0);
    expect(unknown.stderr).toBe("");
    const output = JSON.parse(unknown.stdout);
    expect(output.source.flags).toEqual(["lmt", "no-time"]);
    expect(output.source.envelope.receipt.timeScale).toBe("tt");
    expect(output.source.envelope.result.deltaT).toMatchObject({ model: "pinned", seconds: 64 });
    expect(output.source.envelope.result.angles).toBeNull();
    const polar = invoke(["chart", "--input", "-"], Buffer.from(JSON.stringify({ birth: {
      utc: "2002-04-06T03:00:00Z", latitude: 78, longitude: 24, houseSystem: "placidus"
    } })));
    expect(polar.status).toBe(0);
    expect(polar.stderr).toBe("");
    expect(JSON.parse(polar.stdout).source.envelope.receipt.houses)
      .toEqual({ requested: "placidus", actual: "whole", absenceReason: null });
  });

  it.each([
    { args: ["chart"], input: "", code: "invalid-arguments" },
    { args: ["chart", "--input", "-", "--harmonic", "181"], input: "", code: "invalid-arguments" },
    { args: ["chart", "--input", "missing-input.json"], input: "", code: "input-read" },
    { args: ["chart", "--input", "-"], input: "PRIVATE_INVALID_INPUT", code: "invalid-input" },
    { args: ["chart", "--input", "-"], input: '{"birth":{"utc":"2002-02-30"}}', code: "invalid-input" },
    { args: ["chart", "--input", "-"], input: '{"birth":{"utc":"2002-04-06","flags":["no-time"]}}',
      code: "invalid-input" },
    { args: ["chart", "--input", "-", "--include-chart-points"], input: fixture("chart-points").toString(),
      code: "invalid-arguments" }
  ])("prints one error without a partial result: $code $args", ({ args, input, code }) => {
    const result = invoke(args, Buffer.from(input));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code, message: expect.any(String) } });
    expect(result.stderr).not.toContain("PRIVATE_INVALID_INPUT");
    expect(result.stderr).not.toContain("stack");
  });

  it("reports help successfully with no input or network", () => {
    const result = invoke(["--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("harmonics chart --input FILE|-");
  });
});
