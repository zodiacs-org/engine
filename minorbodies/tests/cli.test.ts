import { beforeAll, describe, expect, it, vi } from "vitest";
import { preparePilot } from "../scripts/generate-pilot.ts";
import { createBodyAdapter } from "../src/body-adapter.ts";
import type { BodyAdapter } from "../src/body-adapter.ts";
import type { MinorBody } from "../src/catalog.ts";
import { parseCliArgs, runCli } from "../src/cli.ts";
import { loadMinorBodyEphemeris } from "../src/ephemeris.ts";
import type { MinorBodyEphemeris } from "../src/ephemeris.ts";
import { createIngressSearcher } from "../src/ingresses.ts";
import { PILOT_RECIPE } from "../src/pilot-recipe.ts";
import { createRetrogradeWindowSearcher } from "../src/retrogrades.ts";
import { createStationSearcher } from "../src/stations.ts";

const positionArgs = ["position", "--body", "Chiron", "--jd", "2451600.25", "--scale", "tt"];
const intervalArgs = ["--body", "Chiron", "--from-jd", "2451545.5", "--to-jd", "2451908.5", "--scale", "tt"];
const intervalRequest = {
  body: "Chiron" as const,
  from: { jd: 2451545.5, scale: "tt" as const },
  to: { jd: 2451908.5, scale: "tt" as const }
};

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: {
    stdout: (text: string) => { stdout.push(text); },
    stderr: (text: string) => { stderr.push(text); }
  } };
}

function jsonOutput(parts: readonly string[]): unknown {
  const text = parts.join("");
  expect(text.endsWith("\n")).toBe(true);
  return JSON.parse(text);
}

function asJson(value: unknown): unknown { return JSON.parse(JSON.stringify(value)); }

describe("CLI argument contract", () => {
  it("defaults to full data and retains an explicit TT Julian epoch", () => {
    expect(parseCliArgs(positionArgs)).toEqual({ command: "position", dataset: "full",
      request: { body: "Chiron", time: { jd: 2451600.25, scale: "tt" } } });
  });

  it.each(["utc", "ut1", "tt"] as const)("accepts explicit %s Julian dates and decimal scientific pins", scale => {
    expect(parseCliArgs(["position", "--body", "Vesta", "--jd", "2.45160025e6", "--scale", scale,
      "--delta-t", "-8e1", "--dataset", "full"]))
      .toEqual({ command: "position", dataset: "full", request: {
        body: "Vesta", time: { jd: 2451600.25, scale, deltaT: -80 }
      } });
  });

  it("retains ISO offset text and a zero Delta T pin instead of relabelling the clock", () => {
    const iso = "2000-06-01T07:00:00-05:00";
    expect(parseCliArgs(["position", "--dataset", "pilot", "--iso", iso, "--body", "Chiron", "--delta-t", "0"]))
      .toEqual({ command: "position", dataset: "pilot", request: { body: "Chiron", time: { iso, deltaT: 0 } } });
  });

  it.each(["stations", "retrogrades", "ingresses"] as const)("parses %s settings and both endpoint pins", command => {
    expect(parseCliArgs([command, ...intervalArgs, "--dataset", "pilot", "--step-days", "2.5e-1",
      "--max-samples", "2000", "--delta-t", "120"]))
      .toEqual({ command, dataset: "pilot", request: {
        body: "Chiron", from: { ...intervalRequest.from, deltaT: 120 },
        to: { ...intervalRequest.to, deltaT: 120 }, stepDays: 0.25, maxSamples: 2000
      } });
  });

  it("accepts ISO endpoints and an explicitly unlimited budget", () => {
    const from = "2000-01-02T00:00:00Z";
    const to = "2000-12-30T00:00:00Z";
    expect(parseCliArgs(["stations", "--body", "Chiron", "--from-iso", from, "--to-iso", to,
      "--max-samples", "unlimited"]))
      .toEqual({ command: "stations", dataset: "full", request: {
        body: "Chiron", from: { iso: from }, to: { iso: to }, maxSamples: Infinity
      } });
  });

  it.each(["Chiron", "Ceres", "Pallas", "Juno", "Vesta"] as const)("accepts the exact catalogue label %s", body => {
    const parsed = parseCliArgs(["position", "--body", body, "--iso", "2000-06-01"]);
    expect(parsed).toMatchObject({ command: "position", dataset: "full", request: { body } });
  });

  it.each([
    ["--help"], ["position", "--help"], ["stations", "--help"], ["retrogrades", "--help"], ["ingresses", "--help"]
  ].map(argv => [argv] as const))("recognizes help without requiring data arguments: %j", argv => {
    const parsed = parseCliArgs(argv);
    expect(parsed.command).toBe("help");
    if (parsed.command !== "help") throw new Error("Expected help.");
    expect(parsed.text).toContain("--body");
    expect(parsed.text).toMatch(/TT|tt/);
    expect(parsed.text).toContain("--scale");
  });

  const invalidArgs = [
    [], ["unknown"], ["help"], ["--help", "--body", "Chiron"], ["unknown", "--help"],
    ["position"], ["position", "--body", "Chiron"],
    ["position", "--body", "chiron", "--iso", "2000-06-01"],
    ["position", "--body", "Pholus", "--iso", "2000-06-01"],
    ["position", "--body", " Chiron", "--iso", "2000-06-01"],
    ["position", "--body", "Mars", "--iso", "2000-06-01"],
    ["position", "--body", "Ceres", "--iso", "2000-06-01", "--dataset", "pilot"],
    [...positionArgs, "--dataset", "remote"], [...positionArgs, "--body", "Chiron"],
    [...positionArgs, "--unexpected", "yes"], [...positionArgs, "trailing"],
    [...positionArgs, "--help"], [...positionArgs, "--dataset"], [...positionArgs, "--dataset", ""],
    [...positionArgs, "--iso", "2000-06-01"], [...positionArgs, "--step-days", "1"],
    [...positionArgs, "--max-samples", "10"], [...positionArgs, "--from-jd", "2451545"],
    ["position", "--body", "Chiron", "--jd", "2451600.25"],
    ["position", "--body", "Chiron", "--jd", "2451600.25", "--scale", "TT"],
    ["position", "--body", "Chiron", "--iso", "2000-06-01", "--scale", "utc"],
    ["position", "--body", "Chiron", "--iso", "2000-02-30"],
    ["position", "--body", "Chiron", "--iso", "2000-06-01T12:00:00"],
    ["position", "--body", "Chiron", "--iso", "2000-06-01T24:00:00Z"],
    ["position", "--body", "Chiron", "--iso", "2000-06-01T00:00:60Z"],
    ["position", "--body", "Chiron", "--iso", ""],
    ["stations", ...intervalArgs, "--iso", "2000-06-01"],
    ["stations", ...intervalArgs, "--jd", "2451600.25"],
    ["stations", ...intervalArgs, "--to-iso", "2000-12-30"],
    ["stations", "--body", "Chiron", "--from-iso", "2000-01-02"],
    ["stations", "--body", "Chiron", "--from-iso", "2000-01-02", "--to-jd", "2451908.5", "--scale", "tt"],
    ["stations", "--body", "Chiron", "--from-jd", "2451908.5", "--to-jd", "2451545.5", "--scale", "tt"],
    ["stations", "--body", "Chiron", "--from-iso", "2000-12-30", "--to-iso", "2000-01-02"],
    ...["", " ", "0x256888", "Infinity", "-Infinity", "NaN", "2_451_600", "2451600.25junk", "1e999", "2451600.25 "]
      .map(value => ["position", "--body", "Chiron", "--jd", value, "--scale", "tt"]),
    ...["NaN", "Infinity", "10000000001", "-10000000001", "", " 80"]
      .map(value => [...positionArgs, "--delta-t", value]),
    ...["0", "-1", "6", "1e-20", "NaN", "Infinity", "unlimited", "0x1"]
      .map(value => ["stations", ...intervalArgs, "--step-days", value]),
    ...["0", "-1", "0.5", "9007199254740992", "Infinity", "UNLIMITED", "NaN", "0x10", "1e999"]
      .map(value => ["stations", ...intervalArgs, "--max-samples", value])
  ];

  it.each(invalidArgs.map(argv => [argv] as const))("rejects malformed or inapplicable arguments before local data loading: %j", async argv => {
    expect(() => parseCliArgs(argv)).toThrow(RangeError);
    const output = capture();
    const loader = vi.fn(async () => { throw new Error("Invalid arguments must not load data."); });
    expect(await runCli(argv, output.io, loader)).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(jsonOutput(output.stderr)).toMatchObject({ schema: "minorbodies-cli-error-v1", status: "error", code: "invalid-arguments" });
    expect(loader).not.toHaveBeenCalled();
  });

  it("prints help without using the loader", async () => {
    const output = capture();
    const loader = vi.fn(async () => { throw new Error("Help must not load data."); });
    expect(await runCli(["--help"], output.io, loader)).toBe(0);
    expect(output.stdout.join("")).toContain("--body");
    expect(output.stderr).toEqual([]);
    expect(loader).not.toHaveBeenCalled();
  });
});

describe("CLI library dispatch and receipts", () => {
  let ephemeris: MinorBodyEphemeris;
  let adapter: BodyAdapter;
  let stations: Awaited<ReturnType<typeof createStationSearcher>>;
  let retrogrades: Awaited<ReturnType<typeof createRetrogradeWindowSearcher>>;
  let ingresses: Awaited<ReturnType<typeof createIngressSearcher>>;

  beforeAll(async () => {
    // Integration equality only. Original training sources are fitted in memory;
    // this does not add an astronomical accuracy claim or need generated files.
    const pilot = await preparePilot();
    const rawSources = new Map(pilot.sourceManifest.entries.map((entry, index) =>
      [entry.rawFile, pilot.captures[index]!.capture.raw] as const));
    ephemeris = await loadMinorBodyEphemeris({
      sourceManifestText: pilot.sourceManifestText,
      sourceManifestSha256: pilot.descriptor.sourceManifestSha256,
      rawSources, shards: [{ text: pilot.text, descriptor: pilot.descriptor }]
    });
    adapter = await createBodyAdapter([ephemeris]);
    [stations, retrogrades, ingresses] = await Promise.all([
      createStationSearcher(adapter), createRetrogradeWindowSearcher(adapter), createIngressSearcher(adapter)
    ]);
  }, 60_000);

  async function run(argv: readonly string[]) {
    const output = capture();
    const loader = vi.fn(async (_dataset: "full" | "pilot", _body: MinorBody) => ephemeris);
    const exitCode = await runCli(argv, output.io, loader);
    return { ...output, loader, exitCode };
  }

  it("prints the exact adapter position JSON with complete provenance and a pinned TT epoch", async () => {
    const argv = [...positionArgs, "--dataset", "pilot", "--delta-t", "120"];
    const output = await run(argv);
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toEqual([]);
    expect(output.loader).toHaveBeenCalledTimes(1);
    expect(output.loader).toHaveBeenCalledWith("pilot", "Chiron");
    const expected = adapter.calcWithMinorBodies({ body: "Chiron", time: { jd: 2451600.25, scale: "tt", deltaT: 120 } });
    expect(jsonOutput(output.stdout)).toEqual(asJson(expected));
    expect(jsonOutput(output.stdout)).toMatchObject({ status: "ok", result: { jdTt: 2451600.25 },
      receipt: { request: { time: { jd: 2451600.25, scale: "tt", deltaT: 120 } }, time: { jdTt: 2451600.25 } } });
  });

  it("preserves the same physical epoch for equivalent ISO offsets", async () => {
    const results = [];
    for (const iso of ["2000-06-01T12:00:00Z", "2000-06-01T07:00:00-05:00"]) {
      const output = await run(["position", "--body", "Chiron", "--iso", iso]);
      expect(output.exitCode).toBe(0);
      const expected = adapter.calcWithMinorBodies({ body: "Chiron", time: { iso } });
      expect(jsonOutput(output.stdout)).toEqual(asJson(expected));
      if (expected.status !== "ok" || expected.provider !== "minorbodies") throw new Error("Expected pilot position.");
      results.push(expected.result);
    }
    expect(results[0]).toEqual(results[1]);
  });

  it.each(["stations", "retrogrades", "ingresses"] as const)("preserves the entire %s library result and receipts", async command => {
    const request = { ...intervalRequest, stepDays: 1, maxSamples: 10_000 };
    const expected = command === "stations" ? stations.searchStations(request)
      : command === "retrogrades" ? retrogrades.searchRetrogradeWindows(request)
      : ingresses.searchIngresses(request);
    expect(expected.status).toBe("complete");
    if (expected.status !== "complete") throw new Error(`Unexpected integration refusal: ${expected.reason}`);
    if ("stations" in expected) expect(expected.stations.length).toBeGreaterThan(0);
    if ("windows" in expected) expect(expected.windows.length).toBeGreaterThan(0);
    // Chiron does not cross a sign boundary in this retained pilot interval.
    if ("ingresses" in expected) expect(expected.ingresses).toEqual([]);
    const output = await run([command, ...intervalArgs, "--dataset", "pilot", "--step-days", "1", "--max-samples", "10000"]);
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toEqual([]);
    expect(jsonOutput(output.stdout)).toEqual(asJson(expected));
  }, 60_000);

  it("serializes an explicitly unlimited budget as the library's null receipt field", async () => {
    const output = await run(["stations", "--body", "Chiron", "--from-jd", "2451600.25",
      "--to-jd", "2451600.25", "--scale", "tt", "--max-samples", "unlimited"]);
    expect(output.exitCode).toBe(0);
    expect(jsonOutput(output.stdout)).toMatchObject({ status: "complete", stations: [], samples: 0,
      receipt: { settings: { maxSamples: null } } });
  });

  it.each(["stations", "retrogrades", "ingresses"] as const)("returns exit 3 and an intact %s budget refusal with no partial output", async command => {
    const request = { ...intervalRequest, maxSamples: 1 };
    const expected = command === "stations" ? stations.searchStations(request)
      : command === "retrogrades" ? retrogrades.searchRetrogradeWindows(request)
      : ingresses.searchIngresses(request);
    expect(expected).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
    const output = await run([command, ...intervalArgs, "--max-samples", "1"]);
    expect(output.exitCode).toBe(3);
    expect(output.stderr).toEqual([]);
    expect(jsonOutput(output.stdout)).toEqual(asJson(expected));
  });

  it("returns an out-of-coverage refusal rather than clipping a position or dropping its receipt", async () => {
    const time = { jd: PILOT_RECIPE.endJdTt, scale: "tt" as const };
    const expected = adapter.calcWithMinorBodies({ body: "Chiron", time });
    const output = await run(["position", "--body", "Chiron", "--jd", String(time.jd), "--scale", "tt"]);
    expect(output.exitCode).toBe(3);
    expect(output.stderr).toEqual([]);
    expect(jsonOutput(output.stdout)).toEqual(asJson(expected));
    expect(jsonOutput(output.stdout)).toMatchObject({ status: "refused", reason: "outside-coverage", receipt: { time: { jdTt: time.jd } } });
  });

  it("does not fetch when invoking positions or event commands", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Runtime network forbidden."));
    try {
      for (const command of ["position", "stations", "retrogrades", "ingresses"]) {
        const argv = command === "position" ? positionArgs
          : [command, "--body", "Chiron", "--from-jd", "2451600.25", "--to-jd", "2451600.25", "--scale", "tt"];
        expect((await run(argv)).exitCode).toBe(0);
      }
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it.each([
    [Object.assign(new Error("Local source absent."), { code: "ENOENT" }), "data-missing"],
    [new RangeError("Dataset digest mismatch."), "data-invalid"]
  ] as const)("classifies a loader error without a result or receipt fabrication: %s", async (error, code) => {
    const output = capture();
    expect(await runCli(positionArgs, output.io, async () => { throw error; })).toBe(1);
    expect(output.stdout).toEqual([]);
    const failure = jsonOutput(output.stderr);
    expect(failure).toMatchObject({ schema: "minorbodies-cli-error-v1", status: "error", code });
    expect(failure).not.toHaveProperty("receipt");
    expect(failure).not.toHaveProperty("stack");
  });

  it.each([new Error("Unexpected provider failure."), new RangeError("Unexpected numerical domain failure.")])(
    "reports unexpected evaluation failure as a calculation error, without a partial JSON result: %s", async error => {
    const output = capture();
    const broken = { ...ephemeris, calculate: () => { throw error; } };
    expect(await runCli(positionArgs, output.io, async () => broken)).toBe(1);
    expect(output.stdout).toEqual([]);
    expect(jsonOutput(output.stderr)).toMatchObject({ schema: "minorbodies-cli-error-v1", status: "error", code: "calculation-failed" });
  });
});
