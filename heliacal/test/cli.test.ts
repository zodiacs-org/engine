import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { serializeCliJson } from "../src/cli-json.js";

const site = ["--latitude", "13", "--longitude", "-42"];
const range = ["--from", "2001-02-03", "--to", "2001-02-06"];
const phase = ["phase", "--body", "Moon", "--at", "2001-02-03", ...site];
const arcus = ["events", "--mode", "heliacal", "--body", "Venus", ...range, ...site, "--model", "horizon-arcus-visionis/1"];
const crescent = ["crescent", ...range, ...site, "--model", "odeh-2006/1", "--last-category", "B", "--max-elongation-deg", "30"];

function replace(args: string[], name: string, value: string): string[] {
  const copy = [...args];
  copy[copy.indexOf(`--${name}`) + 1] = value;
  return copy;
}

describe("strict CLI input boundary", () => {
  const invalid: { label: string; args: string[] }[] = [
    { label: "no command", args: [] },
    { label: "unknown command", args: ["unknown"] },
    { label: "help mixed with computation", args: [...phase, "--help"] },
    { label: "unknown option", args: [...phase, "--altitude", "4"] },
    { label: "cross-command option", args: [...phase, "--max-samples", "5"] },
    { label: "duplicate option", args: [...phase, "--latitude=10"] },
    { label: "duplicate equal form", args: ["phase", "--body=Moon", "--body=Moon"] },
    { label: "missing value", args: [...phase, "--height"] },
    { label: "empty value", args: [...phase, "--height="] },
    { label: "option as value", args: [...phase, "--height", "--foo", "1"] },
    { label: "extra positional", args: [...phase, "Moon"] },
    { label: "bare separator", args: [...phase, "--"] },
    { label: "short option", args: [...phase, "-x"] },
    { label: "missing body", args: ["phase", "--at", "2001-02-03", ...site] },
    { label: "unsupported body", args: replace(phase, "body", "Sun") },
    { label: "body case", args: replace(phase, "body", "moon") },
    { label: "calendar rollover", args: replace(phase, "at", "2001-02-30") },
    { label: "local datetime", args: replace(phase, "at", "2001-02-03T12:00") },
    { label: "hexadecimal", args: replace(phase, "latitude", "0x10") },
    { label: "exponent", args: replace(phase, "latitude", "1e1") },
    { label: "NaN", args: replace(phase, "latitude", "NaN") },
    { label: "infinity", args: replace(phase, "latitude", "Infinity") },
    { label: "numeric whitespace", args: replace(phase, "latitude", " 13 ") },
    { label: "latitude domain", args: replace(phase, "latitude", "91") },
    { label: "longitude domain", args: replace(phase, "longitude", "181") },
    { label: "empty range", args: replace(crescent, "to", "2001-02-03") },
    { label: "reversed range", args: replace(crescent, "to", "2001-02-02") },
    { label: "nonpositive budget", args: [...crescent, "--max-samples", "0"] },
    { label: "fractional budget", args: [...crescent, "--max-geometry-samples", "1.5"] },
    { label: "unsafe budget", args: [...crescent, "--max-samples", "9007199254740992"] },
    { label: "infinite budget", args: [...crescent, "--max-samples", "Infinity"] },
    { label: "exponent budget", args: [...crescent, "--max-samples", "1e5"] },
    { label: "missing arcus thresholds", args: arcus },
    { label: "negative threshold", args: [...arcus, "--first-morning-deg", "-1"] },
    { label: "excessive threshold", args: [...arcus, "--first-morning-deg", "91"] },
    { label: "inapplicable appearance", args: [...replace(arcus, "body", "Mars"), "--first-evening-deg", "10"] },
    { label: "inapplicable lunar appearance", args: [...replace(arcus, "body", "Moon"), "--first-morning-deg", "10"] },
    { label: "unapplied photometry", args: [...arcus, "--first-morning-deg", "10", "--extinction", "0.2"] },
    { label: "arcus with horizon kinds", args: [...arcus, "--kinds", "cosmical-rising"] },
    { label: "horizon with visibility model", args: replace(arcus, "mode", "horizon") },
    { label: "missing event mode", args: ["events", "--body", "Venus", ...range, ...site] },
    { label: "unknown crescent model", args: replace(crescent, "model", "yallop") },
    { label: "invalid Odeh category", args: replace(crescent, "last-category", "D") },
    { label: "invalid Yallop category", args: replace(replace(crescent, "model", "yallop-1997/1"), "last-category", "E") },
    { label: "elongation zero", args: replace(crescent, "max-elongation-deg", "0") },
    { label: "elongation domain", args: replace(crescent, "max-elongation-deg", "91") },
    { label: "unknown morning timing", args: [...crescent, "--morning-timing", "true"] },
    { label: "crescent arbitrary body", args: [...crescent, "--body", "Venus"] },
    ...["", "cosmical-rising,", "cosmical-rising,cosmical-rising", "acronychal", "cosmical-rising, cosmical-setting"].map((kinds) => ({
      label: `invalid horizon kinds '${kinds}'`, args: ["events", "--mode", "horizon", "--body", "Mars", ...range, ...site, "--kinds", kinds]
    }))
  ];
  it.each(invalid)("rejects $label without success output", ({ args }) => {
    const result = runCli(args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toMatchObject({ schema: "heliacal-cli/1", error: { code: "invalid-input" } });
  });

  it.each([[], ["events"], ["crescent"], ["phase"]])("provides help without required inputs: %j", (...command) => {
    const result = runCli([...command, "--help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Usage: heliacal");
    expect(result.stdout).toContain("Exit: 0 complete/ok/help; 1 invalid input or execution error; 2 refused; 3 unresolved.");
  });

  it("retains a phase engine refusal as structured output", () => {
    const result = runCli(replace(phase, "at", "2201-01-01"));
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).result).toMatchObject({ status: "refused" });
  });

  it.each([
    { command: "crescent", args: [...crescent, "--max-samples", "1"], reason: "sample-budget" },
    { command: "crescent", args: [...replace(replace(crescent, "from", "2024-06-06"), "to", "2024-06-10"), "--max-geometry-samples", "1"], reason: "geometry-budget" },
    { command: "events", args: [...arcus, "--first-morning-deg", "10", "--max-geometry-samples", "1"], reason: "geometry-budget" }
  ])("forwards $command $reason budgets without returning partial events", ({ args, reason }) => {
    const result = runCli(args);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).result).toMatchObject({ status: "refused", reason, events: [], opportunities: [] });
  });

  it("keeps a complete empty polar search successful with its gaps", () => {
    const result = runCli(["events", "--mode", "heliacal", "--body", "Venus", "--latitude", "80", "--longitude", "0",
      "--from", "2024-06-20", "--to", "2024-06-23", "--model", "horizon-arcus-visionis/1", "--first-morning-deg", "10"]);
    expect(result.exitCode).toBe(0);
    const document = JSON.parse(result.stdout);
    expect(document.result).toMatchObject({ status: "complete", events: [] });
    expect(document.result.diagnostics.length).toBeGreaterThan(0);
  });
});

describe("deterministic CLI JSON", () => {
  it("sorts keys recursively, retains array order and normalizes Dates without mutation", () => {
    const at = new Date("2001-02-03T19:00:00+07:00");
    const shared = { z: 1, a: false };
    const input = { z: [shared, null, 0, shared], a: { when: at, absent: undefined, a: -0 } };
    expect(serializeCliJson(input)).toBe('{"a":{"a":0,"when":"2001-02-03T12:00:00.000Z"},"z":[{"a":false,"z":1},null,0,{"a":false,"z":1}]}\n');
    expect(Object.keys(input)).toEqual(["z", "a"]);
    expect(at.toISOString()).toBe("2001-02-03T12:00:00.000Z");
  });

  it("preserves all finite JSON numeric precision and escapes text", () => {
    const values = [Number.MIN_VALUE, Number.MAX_VALUE, 1 + Number.EPSILON, -1e-100];
    expect(JSON.parse(serializeCliJson({ values, text: 'quote"\nline' }))).toEqual({ values, text: 'quote"\nline' });
  });

  it.each([
    { label: "NaN", value: NaN }, { label: "infinity", value: Infinity }, { label: "negative infinity", value: -Infinity },
    { label: "invalid Date", value: new Date(NaN) }, { label: "root undefined", value: undefined },
    { label: "BigInt", value: 1n }, { label: "Set", value: new Set() },
    { label: "undefined array slot", value: [undefined] }, { label: "sparse array", value: new Array(1) }
  ])("rejects values that would be silently lost: $label", ({ value }) => {
    expect(() => serializeCliJson(value)).toThrow();
  });

  it("rejects cycles while allowing repeated noncyclic receipt objects", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => serializeCliJson(cyclic)).toThrow(/cycles/);
  });
});
