import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "../../src/api.js";
import * as receipt from "../../src/receipt.js";
import { CLI_SCHEMA, executeDial, executeSpectrum, parseCliArguments } from "../src/cli.js";
import type { DialArguments, SpectrumArguments } from "../src/cli.js";
import { parseChartRequest } from "../src/cli-input.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const bin = fileURLToPath(new URL("../bin/harmonics.mjs", import.meta.url));
const noNetwork = fileURLToPath(new URL("./no-network.mjs", import.meta.url));
const fixture = (name: string) => readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));

function invoke(args: string[], input: Uint8Array = Buffer.alloc(0)) {
  return spawnSync(process.execPath, ["--import", noNetwork, bin, ...args], {
    cwd: root, input, encoding: "utf8", timeout: 15000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: "" }
  });
}

function success(args: string[], input?: Buffer) {
  const result = invoke(args, input);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout.endsWith("\n")).toBe(true);
  return JSON.parse(result.stdout);
}

function spectrumArgs(...extra: string[]): SpectrumArguments {
  const parsed = parseCliArguments(["spectrum", "--input", "-", ...extra]);
  if (typeof parsed === "string" || parsed.command !== "spectrum") throw new Error("Expected spectrum args");
  return parsed;
}
function dialArgs(...extra: string[]): DialArguments {
  const parsed = parseCliArguments(["dial", "--input", "-", ...extra]);
  if (typeof parsed === "string" || parsed.command !== "dial") throw new Error("Expected dial args");
  return parsed;
}

afterEach(() => vi.restoreAllMocks());

describe("analysis command parsing", () => {
  it("shares source options, resolves defaults and permits extended harmonic selections", () => {
    expect(spectrumArgs()).toEqual({ command: "spectrum", input: "-", maxHarmonic: 180,
      orbScaling: "inverse-harmonic", includeAngles: false, includeChartPoints: false });
    expect(dialArgs()).toEqual({ command: "dial", input: "-", circle: 90, contactOrb: 1,
      repeatedMembers: "distinct", includeAngles: false, includeChartPoints: false });
    expect(spectrumArgs("--harmonics", "720,1", "--max-harmonic", "720", "--include-chart-points"))
      .toMatchObject({ harmonics: [720, 1], maxHarmonic: 720, includeChartPoints: true });
    expect(dialArgs("--circle", "22.5", "--contact-orb", "11.25", "--repeated-members", "doubled",
      "--bodies", '["A","B"]', "--include-angles"))
      .toMatchObject({ circle: 22.5, contactOrb: 11.25, repeatedMembers: "doubled", bodies: ["A", "B"], includeAngles: true });
  });

  it.each([
    ["spectrum", "--harmonic", "3"], ["dial", "--harmonics", "3"], ["chart", "--circle", "90"],
    ["spectrum", "--harmonics", ""], ["spectrum", "--harmonics", "1,,2"],
    ["spectrum", "--harmonics", "1,1"], ["spectrum", "--harmonics", "1,181"],
    ["spectrum", "--harmonics", "1, 2"], ["spectrum", "--harmonics", "01,2"],
    ["spectrum", "--orb-scaling", "inverse"], ["dial", "--circle", "360"],
    ["dial", "--circle", "22.5", "--contact-orb", "11.250000000000002"],
    ...["-1", "+1", "01", "1e0", "NaN", "Infinity", "0x1", ".5", "1.", " 1", "1\n", "1e400"]
      .map((value) => ["dial", "--contact-orb", value]),
    ["dial", "--contact-orb", "1", "--contact-orb", "2"], ["dial", "--repeated-members", "all"],
    ["dial", "--bodies", "[]"], ["spectrum", "--bodies", '["A","A"]'],
    ["dial", "--bodies", '[" A"]'], ["dial", "--bodies", '[null]'],
    ["spectrum", "--policy", "null"], ["spectrum", "--policy", '{"unknown":1}'],
    ["spectrum", "--policy", '{"aspects":[{"type":"square","angle":30,"orb":1}]}'],
    ["spectrum", "--policy", '{"bodies":["A"],"\\u0062odies":["B"]}'],
    ["spectrum", "--policy", '{"aspects":[{"type":"conjunction","orb":1,"orb":2}]}'],
    ["spectrum", "--body-weights", '{"A":1,"A":2}'], ["spectrum", "--body-weights", "[]"],
    ["spectrum", "--body-weights", '{"A":-1}'], ["spectrum", "--aspect-weights", '{"x":null}'],
    ["spectrum", "--aspect-weights", '{"x":1e400}'], ["dial", "--help", "extra"]
  ])("rejects invalid command configuration %j", (command, ...options) => {
    expect(() => parseCliArguments([command!, "--input", "-", ...options])).toThrow();
  });

  it("applies the request byte/depth/duplicate rules to inline JSON options", () => {
    expect(() => spectrumArgs("--policy", " ".repeat(65537))).toThrow();
    expect(() => spectrumArgs("--policy", "[".repeat(17) + "0" + "]".repeat(17))).toThrow();
    expect(() => spectrumArgs("--policy", '{"stationaryRelativeSpeed":1e400}')).toThrow();
  });
});

describe("analysis execution and source receipts", () => {
  it.each(["spectrum", "dial"] as const)("casts once for %s and retains original envelope identity", async (command) => {
    const cast = vi.spyOn(api, "natalChart");
    const capture = vi.spyOn(receipt, "createNatalEnvelope");
    const request = parseChartRequest(fixture("chart-birth"));
    const result = command === "spectrum" ? await executeSpectrum(request, spectrumArgs("--harmonics", "1,3"))
      : await executeDial(request, dialArgs());
    expect(cast).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledTimes(1);
    if (result.sourceMode !== "birth") throw new Error("Expected birth result");
    expect(result.source.envelope).toBe(capture.mock.results[0]!.value);
    expect(result.source.flags).toEqual(result.source.envelope.receipt.resultFlags);
    expect(result.source.envelope.receipt.sourceInstant).toBe("2002-04-06T05:00:00+02:00");
  });

  it("requires explicit filtering for unknown speeds and keeps the complete natal source", async () => {
    const request = parseChartRequest(fixture("chart-birth"));
    await expect(executeSpectrum(request, spectrumArgs("--harmonics", "1", "--include-angles")))
      .rejects.toMatchObject({ code: "invalid-input", message: expect.stringContaining("--bodies") });
    const result = await executeSpectrum(request, spectrumArgs("--harmonics", "1", "--include-angles",
      "--bodies", '["Sun","Moon"]'));
    if (result.sourceMode !== "birth") throw new Error("Expected birth result");
    expect(result.source.points.some((p) => p.body === "Ascendant")).toBe(true);
    expect(result.spectrum.rows[0]!.aspectResult.harmonicChart.points.map((p) => p.body)).toEqual(["Moon", "Sun"]);
    expect(Object.hasOwn(result.source.envelope.result, "spectrum")).toBe(false);
  });

  it.each(["spectrum", "dial"] as const)("rejects birth-only options on supplied %s points", async (command) => {
    const request = parseChartRequest(fixture("chart-points"));
    await expect(command === "spectrum" ? executeSpectrum(request, spectrumArgs("--include-chart-points"))
      : executeDial(request, dialArgs("--include-angles"))).rejects.toMatchObject({ code: "invalid-arguments" });
  });
});

describe("offline spectrum CLI", () => {
  it("ranks the harmonic fixture with hand-derived scores and stable file/stdin output", () => {
    const args = ["spectrum", "--input", "fixtures/chart-points.json", "--harmonics", "3,1,2"];
    const output = success(args);
    expect(output).toMatchObject({ schema: CLI_SCHEMA, command: "spectrum", sourceMode: "points" });
    expect(Object.hasOwn(output, "source")).toBe(false);
    // Differences are 120/240. N=1 and N=2 have no conjunctions; N=3 maps
    // all three to 30. Three exact unit pairs / three possible pairs = 1.
    expect(output.spectrum.rows.map((row: { harmonic: number; score: number }) => [row.harmonic, row.score]))
      .toEqual([[1, 0], [2, 0], [3, 1]]);
    expect(output.spectrum.ranking.map((row: { harmonic: number }) => row.harmonic)).toEqual([3, 1, 2]);
    const repeated = invoke(["spectrum", "--input", "-", "--harmonics", "3,1,2"], fixture("chart-points"));
    expect(repeated.status).toBe(0);
    expect(repeated.stderr).toBe("");
    expect(repeated.stdout).toBe(invoke(args).stdout);
  });

  it("passes custom policies, scaling, motion caps and weights through to spectrum analysis", () => {
    const points = encode({ points: [{ body: "A", lon: 0, speed: 0 }, { body: "B", lon: 0.25, speed: 0 }] });
    const policy = { bodies: ["A", "B"], aspects: [{ type: "conjunction", orb: 2 }],
      bodyOrbs: { A: { applying: 2, separating: 2, stationary: 2 } }, stationaryRelativeSpeed: 0 };
    const args = ["spectrum", "--input", "-", "--harmonics", "4", "--policy", JSON.stringify(policy),
      "--body-weights", '{"A":2,"B":3}', "--aspect-weights", '{"conjunction":4}'];
    const inverse = success(args, points).spectrum;
    const fixed = success([...args, "--orb-scaling", "fixed"], points).spectrum;
    // N=4 separates by 1 degree. Inverse limit 2/4=.5 misses; fixed limit 2
    // gives closeness 1-1/2=.5, pair 2*3=6, contribution 6*4*.5=12 / 24.
    expect(inverse.rows[0].score).toBe(0);
    expect(fixed.rows[0].score).toBe(0.5);
    expect(fixed.weightCapacity).toBe(24);
    expect(fixed.rows[0].contributions[0]).toMatchObject({ pairWeight: 6, aspectWeight: 4,
      contribution: 12, closeness: 0.5, aspect: { maximumOrb: 2, orb: 1, motion: "stationary" } });
    const custom = success(["spectrum", "--input", "-", "--harmonics", "2", "--policy",
      '{"bodies":["A","B"],"aspects":[{"type":"test-angle","angle":30,"orb":0}]}'],
    encode({ points: [{ body: "A", lon: 0, speed: 0 }, { body: "B", lon: 15, speed: 0 }] }));
    // 2*15=30, exact custom-angle contact and zero-orb closeness 1.
    expect(custom.spectrum.rows[0].score).toBe(1);
    expect(custom.spectrum.rows[0].contributions[0].aspect.type).toBe("test-angle");
  });

  it("supports the default selection and a configurable ceiling without silently expanding it", () => {
    const points = encode({ points: [{ body: "Sun", lon: 0.25, speed: 0 }] });
    const defaults = success(["spectrum", "--input", "-"], points).spectrum;
    expect(defaults.harmonics).toEqual(Array.from({ length: 180 }, (_, index) => index + 1));
    const extended = success(["spectrum", "--input", "-", "--harmonics", "720", "--max-harmonic", "720"], points);
    // 720 * 1/4 = 180. No possible pairs gives a zero score.
    expect(extended.spectrum.rows[0].aspectResult.harmonicChart.points[0].lon).toBe(180);
    expect(extended.spectrum.rows[0].score).toBe(0);
  });
});

describe("offline Uranian dial CLI", () => {
  it.each([90, 45, 22.5])("returns hand-derived contacts, pictures and midpoint trees on %s degrees", (circle) => {
    const output = success(["dial", "--input", "fixtures/dial-points.json", "--circle", String(circle), "--contact-orb", "0"]);
    expect(output).toMatchObject({ schema: CLI_SCHEMA, command: "dial", sourceMode: "points" });
    expect(Object.hasOwn(output, "source")).toBe(false);
    const pictures = output.planetaryPictures;
    // A=0, B=20, C=10, D=100. C and D differ by 90, a multiple of every
    // dial circle. A+B-C=10 matches D. Other disjoint pair sums differ by
    // 20 degrees modulo each circle, so only the first canonical picture fits.
    expect(pictures.dial.points.map((p: { lon: number }) => p.lon)).toEqual([0, 20, 10, 10]);
    expect(pictures.dial.contacts).toEqual([{ a: "C", b: "D", orb: 0 }]);
    expect(pictures.pictures).toHaveLength(1);
    expect(pictures.pictures[0]).toMatchObject({ left: ["A", "B"], right: ["C", "D"], orb: 0,
      sensitivePoint: { a: "A", b: "B", c: "C", sourceLon: 10, lon: 10 }, target: { body: "D", sourceLon: 100 } });
    // Midpoint(A,B)=10 and its opposite=190 both fold to 10. Each of C and D
    // gets one AB formula row with both endpoints; the center is never a member.
    const trees = output.midpointTrees.trees;
    for (const index of [2, 3]) {
      const ab = trees[index].contacts.filter((row: { midpoint: { members: string[] } }) =>
        row.midpoint.members.join(",") === "A,B");
      expect(ab).toHaveLength(1);
      expect(ab[0].axes).toEqual([
        { axis: { kind: "near", sourceLon: 10, lon: 10, sector: Math.floor(10 / circle) }, orb: 0 },
        { axis: { kind: "opposite", sourceLon: 190, lon: 10, sector: Math.floor(190 / circle) }, orb: 0 }
      ]);
    }
    expect(output.midpointTrees.dial).toEqual(pictures.dial);
  });

  it("supports explicit point selection, doubled formulas and inclusive seam allowances", () => {
    const output = success(["dial", "--input", "-", "--circle", "45", "--contact-orb", "0.5",
      "--bodies", '["A","B"]', "--repeated-members", "doubled"], encode({ points: [
      { body: "A", lon: 44.75 }, { body: "B", lon: 0.25 }, { body: "Unused", lon: 20 }
    ] }));
    // Seam distance 45 - (44.75-.25) = .5, included exactly.
    expect(output.planetaryPictures.dial.contacts).toEqual([{ a: "A", b: "B", orb: 0.5 }]);
    expect(output.planetaryPictures.repeatedMembers).toBe("doubled");
    expect(output.planetaryPictures.sensitivePoints.map((p: { a: string; b: string; c: string }) => [p.a, p.b, p.c]))
      .toEqual([["A", "A", "B"], ["B", "B", "A"]]);
    const file = invoke(["dial", "--input", "fixtures/dial-points.json"]);
    const stdin = invoke(["dial", "--input", "-"], fixture("dial-points"));
    expect(file.status).toBe(0);
    expect(stdin.status).toBe(0);
    expect(stdin.stdout).toBe(file.stdout);
  });
});

describe("analysis executable receipts and errors", () => {
  it.each(["spectrum", "dial"])("returns a replayable birth receipt for %s after filtering", (command) => {
    const args = [command, "--input", "fixtures/chart-birth.json", "--include-angles", "--include-chart-points",
      "--bodies", '["Sun","Moon","Mercury"]', ...(command === "spectrum" ? ["--harmonics", "1,3"] : [])];
    const output = success(args);
    expect(output.sourceMode).toBe("birth");
    expect(receipt.parseNatalEnvelope(JSON.stringify(output.source.envelope)).ok).toBe(true);
    expect(output.source.envelope.receipt.sourceInstant).toBe("2002-04-06T05:00:00+02:00");
    expect(output.source.envelope.receipt.provenance.runtime).toEqual({ name: "node", version: process.versions.node });
    expect(output.source.points.some((p: { body: string }) => p.body === "Ascendant")).toBe(true);
    const analysis = command === "spectrum" ? output.spectrum.rows[0].aspectResult.harmonicChart : output.planetaryPictures.dial;
    expect(analysis.points).toHaveLength(3);
    expect(Object.hasOwn(analysis, "receipt")).toBe(false);
  });

  it.each([
    { args: ["spectrum", "--harmonics", "1"], input: '{"points":[{"body":"A","lon":0}]}', code: "invalid-input" },
    { args: ["spectrum", "--harmonics", "1", "--policy", '{"bodies":["B"]}'],
      input: '{"points":[{"body":"A","lon":0}]}', code: "invalid-input" },
    { args: ["dial", "--bodies", '["Missing"]'], input: fixture("dial-points").toString(), code: "invalid-input" },
    { args: ["spectrum", "--harmonics", "1", "--body-weights", '{"Other":1}'],
      input: fixture("chart-points").toString(), code: "invalid-input" },
    { args: ["dial", "--circle", "91"], input: "PRIVATE_INPUT", code: "invalid-arguments" },
    { args: ["dial"], input: '{"points":[],"points":[]}', code: "invalid-input" },
    { args: ["spectrum"], input: "PRIVATE_INPUT", code: "invalid-input" }
  ])("writes no partial result for $args", ({ args, input, code }) => {
    const [command, ...options] = args;
    const result = invoke([command!, "--input", "-", ...options], Buffer.from(input));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ error: { code, message: expect.any(String) } });
    expect(result.stderr).not.toContain("PRIVATE_INPUT");
    expect(result.stderr).not.toContain("stack");
  });

  it.each(["spectrum", "dial"])("shows %s help without input", (command) => {
    const result = invoke([command, "--help"]);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(`harmonics ${command} --input FILE|-`);
  });
});
