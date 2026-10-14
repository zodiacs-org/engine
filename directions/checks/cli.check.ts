import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hitFromNatal, parseHit, parseScan, scanFromNatal } from "../src/index.js";
import type { DirectionHit, DirectionNatalInput, NatalHitSelection, NatalScanInput, ScanComplete } from "../src/index.js";
import { prepareNatal } from "../src/natal.js";
import { HIT_EXAMPLES, HIT_FIXTURE_ARC_TOLERANCE_DEGREES, HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE } from "../evidence/hit-examples.js";
import type { HitExample } from "../evidence/hit-examples.js";
import {
  SCAN_CONTACT_EXAMPLES, SCAN_GEOMETRY, SCAN_SIGNIFICATOR, SCAN_PROMISSOR,
  SCAN_SORTED_ROW_INDICES, SCAN_FIXTURE_ARC_TOLERANCE_DEGREES, SCAN_SOLAR_SAMPLES
} from "../evidence/scan-examples.js";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const launcher = join(project, "bin", "directions.mjs");
const MAX_INPUT_BYTES = 1048576;
let cwd: string;

beforeAll(() => {
  const built = spawnSync(process.execPath, [join(project, "scripts", "build-cli.mjs")], {
    cwd: project, encoding: "utf8", timeout: 30000, maxBuffer: 1048576
  });
  expect(built.error).toBeUndefined();
  expect(built.status, built.stdout + built.stderr).toBe(0);
  mkdirSync(join(project, ".cache"), { recursive: true });
  cwd = mkdtempSync(join(project, ".cache", "cli-checks-"));
}, 35000);

afterAll(() => {
  if (cwd) rmSync(cwd, { recursive: true, force: true });
});

function run(args: readonly string[], input?: string | Buffer) {
  const result = spawnSync(process.execPath, [launcher, ...args], {
    cwd, input, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1048576
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  return result;
}

function stdin(command: "hit" | "scan", envelope: unknown) {
  return run([command, "--input", "-"], JSON.stringify(envelope));
}

function closedPipe(args: readonly string[], pipe: "stdout" | "stderr", input = "") {
  return new Promise<{ status: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CLI did not exit after a closed output pipe."));
    }, 15000);
    child.stdout.on("data", chunk => { stdout += chunk.toString(); });
    child.stderr.on("data", chunk => { stderr += chunk.toString(); });
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.stdin.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", (status, signal) => {
      clearTimeout(timeout);
      resolve({ status, signal, stdout, stderr });
    });
    // Closing the parent's read end before the child writes exercises the
    // write callback and error event, rather than a mocked stream failure.
    child[pipe].destroy();
    child.stdin.end(input);
  });
}

function jsonOutput<T>(result: ReturnType<typeof run>, status: number): T {
  expect(result.status, result.stderr + result.stdout).toBe(status);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  expect(result.stdout.trim().split("\n")).toHaveLength(1);
  return JSON.parse(result.stdout) as T;
}

function cliError(result: ReturnType<typeof run>, code: string): void {
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr.endsWith("\n")).toBe(true);
  expect(result.stderr.trim().split("\n")).toHaveLength(1);
  expect(JSON.parse(result.stderr)).toEqual({ status: "error", stage: "cli", code, message: expect.any(String) });
}

function fixtureRequest(example: HitExample): Record<string, unknown> {
  return {
    convention: {
      system: example.system, mode: example.mode, motion: example.motion,
      latitude: example.latitude, key: example.key,
      ...(example.motion === "converse" ? { converseConstruction: example.converseConstruction } : {})
    },
    geometry: example.geometry,
    significator: "angle" in example.significator
      ? { kind: "angle", angle: example.significator.angle }
      : { kind: "body", id: "Synthetic S", coordinates: example.significator },
    promissor: { kind: "body", id: "Synthetic P", coordinates: example.promissor },
    contact: example.contact, yearUnit: example.yearUnit,
    ...(example.solar ? { solar: example.solar } : {})
  };
}

const base = fixtureRequest(HIT_EXAMPLES[0]);
const envelope = { source: "coordinates", request: base };
const scanInput = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy" },
  geometry: SCAN_GEOMETRY,
  selections: SCAN_CONTACT_EXAMPLES.map(example => ({
    significator: SCAN_SIGNIFICATOR, promissor: SCAN_PROMISSOR, contact: example.contact
  })),
  motions: [{ motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }],
  yearUnit: "tropical-365.2422-days",
  ageRange: { fromYears: 0, toYears: 1000, includeFrom: true, includeTo: true }, maxEvaluations: 100
};

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  }
  return value;
}

describe("CLI hand-derived sphere and timing evidence", () => {
  // The fixtures cite M8-derivations.md and M9-derivations.md. Expected arcs
  // and ages are independently authored, never copied from a CLI/library run.
  for (const example of HIT_EXAMPLES) {
    it(example.id, () => {
      const result = jsonOutput<DirectionHit>(stdin("hit", {
        source: "coordinates", request: fixtureRequest(example)
      }), 0);
      expect(result.status).toBe("ok");
      expect(result.kind).toBe(example.expected.kind);
      expect(Math.abs(result.arcDegrees - example.expected.arcDegrees)).toBeLessThanOrEqual(HIT_FIXTURE_ARC_TOLERANCE_DEGREES);
      const expectedAge = example.expected.directedAgeYears.numerator / example.expected.directedAgeYears.denominator;
      expect(Math.abs(result.directedAgeYears - expectedAge)).toBeLessThanOrEqual(Math.abs(expectedAge) * HIT_FIXTURE_TIMING_RELATIVE_TOLERANCE);
      expect(result.timing.rateDegreesPerYear).toBe(example.expected.rateDegreesPerYear.numerator / example.expected.rateDegreesPerYear.denominator);
      expect(result.geometry.calculation.arcDegrees).toBe(result.arcDegrees);
      expect(result.contact).toEqual(example.contact);
    });
  }

  it("enumerates and stably orders the independent M9 direct and converse contacts", () => {
    const result = jsonOutput<ScanComplete>(stdin("scan", { source: "coordinates", request: scanInput }), 0);
    expect(result.status).toBe("complete");
    expect(result.hits.map(row => row.selectionIndex * 2 + row.motionIndex)).toEqual(SCAN_SORTED_ROW_INDICES);
    for (const row of result.hits) {
      const reference = SCAN_CONTACT_EXAMPLES[row.selectionIndex]!;
      const expected = reference.expected[row.motionIndex === 0 ? "direct" : "converse"];
      expect(Math.abs(row.hit.arcDegrees - expected.arcDegrees)).toBeLessThanOrEqual(SCAN_FIXTURE_ARC_TOLERANCE_DEGREES);
      expect(row.hit.directedAgeYears).toBe(row.hit.arcDegrees);
    }
    expect(result.work).toEqual({ requestedEvaluations: 16, evaluated: 16, maxEvaluations: 100 });
  });

  it("returns a complete empty scan with success instead of manufacturing a later revolution", () => {
    const result = jsonOutput<ScanComplete>(stdin("scan", { source: "coordinates", request: {
      ...scanInput, ageRange: { ...scanInput.ageRange, fromYears: 360 }
    } }), 0);
    expect(result.status).toBe("complete");
    expect(result.hits).toEqual([]);
    expect(result.outsideAgeRangeCount).toBe(16);
  });
});

describe("CLI files, stdin, stable serialization and usage", () => {
  it("runs the documented coordinate hit file against its hand-derived equatorial arc", () => {
    // At latitude and declination zero, both semi-arcs are 90 degrees.
    // Forward rotation takes RA 10 to RA 350 in (10 - 350) mod 360 = 20.
    const result = jsonOutput<DirectionHit>(run(["hit", "--input", join(project, "examples", "coordinate-hit.json")]), 0);
    expect(result.arcDegrees).toBe(20);
    expect(result.directedAgeYears).toBe(20);
  });

  it("runs the documented coordinate scan file against M9 conjunction expectations", () => {
    const result = jsonOutput<ScanComplete>(run(["scan", "--input", join(project, "examples", "coordinate-scan.json")]), 0);
    expect(result.hits).toHaveLength(2);
    for (const row of result.hits) {
      const expected = SCAN_CONTACT_EXAMPLES[0].expected[row.motionIndex === 0 ? "direct" : "converse"];
      expect(Math.abs(row.hit.arcDegrees - expected.arcDegrees)).toBeLessThanOrEqual(SCAN_FIXTURE_ARC_TOLERANCE_DEGREES);
      expect(row.hit.directedAgeYears).toBe(row.hit.arcDegrees);
    }
  });

  for (const command of ["hit", "scan"] as const) {
    it("runs the documented synthetic natal " + command + " file (integration only)", () => {
      const result = jsonOutput<{ status: string }>(run([command, "--input", join(project, "examples", "natal-" + command + ".json")]), 0);
      expect(result.status).toBe(command === "hit" ? "ok" : "complete");
    });
  }

  it("reads relative files with spaces from another working directory identically to stdin", () => {
    const filename = "synthetic input.json";
    writeFileSync(join(cwd, filename), JSON.stringify(envelope));
    const fromFile = run(["hit", "--input", filename]);
    const fromStdin = stdin("hit", envelope);
    jsonOutput<DirectionHit>(fromFile, 0);
    expect(fromFile.stdout).toBe(fromStdin.stdout);
  });

  for (const command of ["hit", "scan"] as const) {
    it("serializes " + command + " identically across processes and object key order", () => {
      const input = { source: "coordinates", request: command === "hit" ? base : scanInput };
      const first = stdin(command, input);
      jsonOutput(first, 0);
      expect(stdin(command, input).stdout).toBe(first.stdout);
      expect(stdin(command, reverseKeys(input)).stdout).toBe(first.stdout);
    });
  }

  for (const args of [["--help"], ["hit", "--help"], ["scan", "--help"]]) {
    it("prints requested help for " + args.join(" "), () => {
      const result = run(args);
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("--input");
      expect(result.stdout).toMatch(/directions (hit|scan)/);
    });
  }

  for (const args of [
    [], ["unknown"], ["hit"], ["hit", "--input"], ["hit", "--input", ""],
    ["hit", "input.json"], ["hit", "--input=-"], ["hit", "--input", "-", "extra"],
    ["hit", "--input", "-", "--input", "-"], ["hit", "--input", "-", "--unknown"],
    ["hit", "--input", "--help"], ["hit", "--help", "--input", "-"],
    ["--help", "extra"], ["scan", "--input", "-", "--motion", "direct"],
    ["scan", "--input", "-", "--format", "json"], ["scan", "--"], ["-h"]
  ]) {
    it("rejects ambiguous or unsupported argv " + JSON.stringify(args), () => {
      cliError(run(args, JSON.stringify(envelope)), "usage");
    });
  }

  it("reports a missing input file without any partial JSON result", () => {
    cliError(run(["hit", "--input", "file-that-does-not-exist.json"]), "input-io");
  });

  it("rejects a directory as an input file", () => {
    cliError(run(["hit", "--input", "."]), "input-io");
  });

  it("reports a closed stdout pipe as one JSON error without an unhandled EPIPE stack", async () => {
    const result = await closedPipe(["hit", "--input", "-"], "stdout", JSON.stringify(envelope));
    expect(result.status).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.stderr.endsWith("\n")).toBe(true);
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stderr)).toEqual({
      status: "error", stage: "cli", code: "unexpected-error", message: expect.any(String)
    });
  });

  it("terminates a usage error cleanly when its stderr pipe is closed", async () => {
    const result = await closedPipe(["unknown"], "stderr");
    expect(result.status).toBe(1);
    expect(result.signal).toBeNull();
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});

describe("strict JSON transport and envelope", () => {
  for (const [label, input] of [
    ["empty", ""], ["whitespace-only", " \r\n\t"], ["truncated", '{"source":'],
    ["comment", JSON.stringify(envelope) + " // comment"],
    ["trailing token", JSON.stringify(envelope) + " null"],
    ["trailing comma", '{"source":"coordinates","request":{},}'],
    ["duplicate source", '{"source":"natal","source":"coordinates","request":{}}'],
    ["escaped duplicate key", '{"source":"coordinates","request":{},"requ\\u0065st":{}}'],
    ["nested duplicate key", '{"source":"coordinates","request":{"geometry":{"ramcDegrees":0,"ramcDegrees":1}}}'],
    ["Infinity token", '{"source":"coordinates","request":{"value":Infinity}}'],
    ["NaN token", '{"source":"coordinates","request":{"value":NaN}}'],
    ["overflow literal", '{"source":"coordinates","request":{"value":1e999}}'],
    ["negative overflow literal", '{"source":"coordinates","request":{"value":-1e999}}'],
    ["unescaped control", '{"source":"coordinates","request":"bad\nstring"}'],
    ["invalid escape", '{"source":"coordinates","request":"bad\\x41"}'],
    ["UTF-8 BOM", "\ufeff" + JSON.stringify(envelope)]
  ]) {
    it("rejects " + label + " as invalid JSON", () => {
      cliError(run(["hit", "--input", "-"], input), "invalid-json");
    });
  }

  it("detects invalid UTF-8 instead of replacing a body label", () => {
    const bytes = Buffer.concat([
      Buffer.from('{"source":"coordinates","request":{"id":"'),
      Buffer.from([0xc3, 0x28]), Buffer.from('"}}')
    ]);
    cliError(run(["hit", "--input", "-"], bytes), "input-encoding");
    writeFileSync(join(cwd, "invalid-utf8.json"), bytes);
    cliError(run(["hit", "--input", "invalid-utf8.json"]), "input-encoding");
  });

  it("accepts the exact byte limit and refuses the next byte on both transports", () => {
    const json = JSON.stringify(envelope);
    const exact = json + " ".repeat(MAX_INPUT_BYTES - Buffer.byteLength(json));
    jsonOutput<DirectionHit>(run(["hit", "--input", "-"], exact), 0);
    cliError(run(["hit", "--input", "-"], exact + " "), "input-size");
    writeFileSync(join(cwd, "limit.json"), exact);
    jsonOutput<DirectionHit>(run(["hit", "--input", "limit.json"]), 0);
    writeFileSync(join(cwd, "limit.json"), exact + " ");
    cliError(run(["hit", "--input", "limit.json"]), "input-size");
  });

  it("counts UTF-8 bytes rather than string length", () => {
    const oversized = '{"request":"' + "\u03bb".repeat(MAX_INPUT_BYTES / 2) + '"}';
    expect(oversized.length).toBeLessThan(MAX_INPUT_BYTES);
    expect(Buffer.byteLength(oversized)).toBeGreaterThan(MAX_INPUT_BYTES);
    cliError(run(["hit", "--input", "-"], oversized), "input-size");
  });

  it("enforces container depth before request validation", () => {
    cliError(run(["hit", "--input", "-"], "[".repeat(64) + "0" + "]".repeat(64)), "invalid-request");
    cliError(run(["hit", "--input", "-"], "[".repeat(65) + "0" + "]".repeat(65)), "invalid-json");
  });

  for (const [label, input] of [
    ["null", null], ["array", []], ["primitive", 1], ["missing fields", {}],
    ["missing source", { request: base }], ["unknown source", { source: "chart", request: base }],
    ["missing request", { source: "coordinates" }], ["extra field", { ...envelope, ignored: true }],
    ["birth with coordinates", { ...envelope, birth: {} }],
    ["missing birth", { source: "natal", request: {} }],
    ["snapshot in place of birth", { source: "natal", snapshot: {}, request: {} }]
  ] as const) {
    it("rejects the " + label + " envelope", () => {
      cliError(stdin("hit", input), "invalid-request");
    });
  }
});

describe("library refusals remain structured calculation results", () => {
  for (const [label, request] of [
    ["null request", null], ["unknown top-level field", { ...base, ignored: true }],
    ["missing convention", { ...base, convention: undefined }],
    ["unknown key", { ...base, convention: { ...(base.convention as object), key: "unknown" } }],
    ["missing key", { ...base, convention: { ...(base.convention as object), key: undefined } }],
    ["unknown coordinate field", { ...base, geometry: { ...(base.geometry as object), ignored: true } }],
    ["missing solar samples", { ...base, convention: { ...(base.convention as object), key: "solar-equatorial-birth-day" } }],
    ["unexpected solar samples", { ...base, solar: SCAN_SOLAR_SAMPLES }]
  ] as const) {
    it("preserves hit refusal for " + label, () => {
      // JSON round-trip removes deliberately omitted fields before both paths.
      const wire = JSON.parse(JSON.stringify({ source: "coordinates", request })) as { request: unknown };
      const result = jsonOutput(stdin("hit", wire), 2);
      expect(result).toEqual(parseHit(wire.request));
    });
  }

  it("preserves a polar sphere refusal", () => {
    const request = { ...base, geometry: { ...(base.geometry as object), latitudeDegrees: 90 } };
    expect(jsonOutput(stdin("hit", { source: "coordinates", request }), 2)).toMatchObject({
      status: "refused", stage: "sphere", code: "geographic-pole"
    });
  });

  it("preserves scan validation and budget refusals without partial rows", () => {
    for (const request of [
      { ...scanInput, ignored: true }, { ...scanInput, maxEvaluations: 1 },
      { ...scanInput, convention: { ...scanInput.convention, motion: "direct" } }
    ]) {
      const result = jsonOutput(stdin("scan", { source: "coordinates", request }), 2);
      expect(result).toEqual(parseScan(request));
      expect(result).toMatchObject({ status: "refused", hits: [] });
    }
  });

  it("discards earlier scan successes when a later converse angle is unsupported", () => {
    const request = { ...scanInput, selections: [scanInput.selections[0], {
      significator: { kind: "angle", angle: "mc" }, promissor: SCAN_PROMISSOR, contact: { kind: "conjunction" }
    }] };
    expect(jsonOutput(stdin("scan", { source: "coordinates", request }), 2)).toMatchObject({
      status: "refused", code: "hit-refused", hits: [], at: { selectionIndex: 1, motionIndex: 1 },
      cause: { code: "unsupported-converse-angle" }
    });
  });
});

const birth: DirectionNatalInput = {
  utc: "2000-01-01T12:00:00Z", timeScale: "ut1", timeKnown: true,
  latitude: 35, longitude: 15, houseSystem: "placidus", deltaT: 64
};
const natalHit = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", motion: "direct", key: "ptolemy" },
  significator: { kind: "body", id: "Moon" }, promissor: { kind: "body", id: "Sun" },
  contact: { kind: "conjunction" }, yearUnit: "julian-365.25-days"
} as const satisfies NatalHitSelection;
const natalScan = {
  convention: { system: "placidus-semiarc", mode: "mundane", latitude: "retain-both", key: "ptolemy" },
  selections: [{ significator: natalHit.significator, promissor: natalHit.promissor, contact: natalHit.contact }],
  motions: [{ motion: "direct" }, { motion: "converse", converseConstruction: "placidus-role-swap" }],
  yearUnit: "julian-365.25-days", ageRange: { fromYears: 0, toYears: 1000, includeFrom: true, includeTo: true },
  maxEvaluations: 2
} as const satisfies NatalScanInput;

describe("synthetic natal CLI integration, not independent arc or ephemeris accuracy", () => {
  it("preserves all natal hit values and audit metadata through the command", () => {
    const result = jsonOutput(stdin("hit", { source: "natal", birth, request: natalHit }), 0);
    expect(result).toEqual(hitFromNatal(prepareNatal(birth), natalHit));
  });

  it("preserves natal scan values and the engine snapshot audit", () => {
    const result = jsonOutput(stdin("scan", { source: "natal", birth, request: natalScan }), 0);
    expect(result).toEqual(scanFromNatal(prepareNatal(birth), natalScan));
  });

  it("preserves caller solar samples without claiming association with the natal epoch", () => {
    const solar = { ...SCAN_SOLAR_SAMPLES,
      start: { ...SCAN_SOLAR_SAMPLES.start, jdTt: 100 }, end: { ...SCAN_SOLAR_SAMPLES.end, jdTt: 101 } };
    const request = { ...natalHit, convention: { ...natalHit.convention, key: "solar-equatorial-birth-day" }, solar } as const;
    const result = jsonOutput(stdin("hit", { source: "natal", birth, request }), 0);
    expect(result).toEqual(hitFromNatal(prepareNatal(birth), request));
    expect(result).toMatchObject({ natal: { solarEpochAssociation: "caller-supplied-unverified" },
      timing: { audit: { kind: "solar-birth-day", samples: solar } } });
  });

  it("refuses a solar key without supplied samples instead of sampling automatically", () => {
    const request = { ...natalHit, convention: { ...natalHit.convention, key: "solar-equatorial-birth-day" } };
    expect(jsonOutput(stdin("hit", { source: "natal", birth, request }), 2)).toMatchObject({
      status: "refused", stage: "timing", code: "invalid-input"
    });
  });

  it("refuses an unknown body identifier", () => {
    const request = { ...natalHit, promissor: { kind: "body", id: "Synthetic unknown body" } };
    expect(jsonOutput(stdin("hit", { source: "natal", birth, request }), 2)).toMatchObject({
      status: "refused", stage: "natal", code: "missing-body"
    });
  });

  it("refuses polar natal geometry before silently substituting another system", () => {
    expect(jsonOutput(stdin("hit", { source: "natal", birth: { ...birth, latitude: 80 }, request: natalHit }), 2))
      .toMatchObject({ status: "refused", code: "polar-geometry" });
  });

  it("preserves the traditional converse angle refusal", () => {
    const request = { ...natalHit, significator: { kind: "angle", angle: "asc" },
      convention: { ...natalHit.convention, motion: "converse", converseConstruction: "placidus-role-swap" } };
    expect(jsonOutput(stdin("hit", { source: "natal", birth, request }), 2)).toMatchObject({
      status: "refused", stage: "angle", code: "unsupported-converse-angle"
    });
  });

  it("refuses coordinates injected into a natal selector and geometry injected into a natal scan", () => {
    const request = { ...natalHit, promissor: { ...natalHit.promissor, coordinates: SCAN_PROMISSOR.coordinates } };
    expect(jsonOutput(stdin("hit", { source: "natal", birth, request }), 2)).toMatchObject({ status: "refused", code: "invalid-input" });
    expect(jsonOutput(stdin("scan", { source: "natal", birth, request: { ...natalScan, geometry: SCAN_GEOMETRY } }), 2))
      .toMatchObject({ status: "refused", code: "invalid-input", hits: [] });
  });
});
