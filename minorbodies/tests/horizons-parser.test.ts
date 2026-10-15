import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import type { MinorBody } from "../src/catalog.ts";
import {
  HORIZONS_ENDPOINT, MAX_HORIZONS_EPOCHS, assertHorizonsRequest, makeHorizonsRequest
} from "../src/horizons-request.ts";
import type { HorizonsRequest } from "../src/horizons-request.ts";
import {
  HorizonsParseError, assertSameHorizonsSolution, parseHorizonsResponse
} from "../src/horizons-parser.ts";

const EPOCHS = Object.freeze([2451545, 2451545.125, 2451546]);
const request = makeHorizonsRequest("Chiron", EPOCHS);
const raw = readFileSync(new URL("fixtures/horizons/chiron.json", import.meta.url), "utf8");
const original = JSON.parse(raw) as { signature: { source: string; version: string }; result: string };
function changeResult(change: (result: string) => string): string {
  const result = change(original.result);
  if (result === original.result) throw new Error("Test did not change its source fixture.");
  return JSON.stringify({ ...original, result });
}
function changeText(before: string | RegExp, after: string): string {
  return changeResult((result) => result.replace(before, () => after));
}
function changeFirstRow(change: (columns: string[]) => string[]): string {
  return changeResult((result) => result.replace(/(\$\$SOE\n)([^\n]+)/,
    (_all, marker: string, row: string) => marker + change(row.split(",")).join(",")));
}
function changeField(index: number, value: string): string {
  return changeFirstRow((fields) => { fields[index] = value; return fields; });
}

describe("deterministic explicit Horizons requests", () => {
  it.each(MINOR_BODY_NAMES)("selects numbered %s without a major-body ambiguity", (body) => {
    const built = makeHorizonsRequest(body, EPOCHS);
    expect(built).toEqual(makeHorizonsRequest(body, [...EPOCHS]));
    expect(built.endpoint).toBe(HORIZONS_ENDPOINT);
    expect(built.schema).toBe("minorbodies-horizons-request-v1");
    const query = new URL(built.url).searchParams;
    expect(Object.fromEntries(query.entries())).toEqual(built.parameters);
    expect(query.get("COMMAND")).toMatch(/^'\d+;'$/);
    expect(query.get("TLIST")).toBe("'2451545' '2451545.125' '2451546'");
    expect(query.get("TIME_TYPE")).toBe("'TT'");
    expect(query.get("VEC_CORR")).toBe("'LT+S'");
    expect(query.get("CENTER")).toBe("'500@399'");
    expect(query.get("REF_PLANE")).toBe("'FRAME'");
    expect(query.get("REF_SYSTEM")).toBe("'ICRF'");
    expect(query.get("OUT_UNITS")).toBe("'AU-D'");
    expect(query.get("VEC_TABLE")).toBe("'2'");
    expect(query.get("TLIST_TYPE")).toBe("'JD'");
    expect(query.get("format")).toBe("json");
    expect(query.has("START_TIME")).toBe(false);
    expect(query.has("STOP_TIME")).toBe(false);
    expect(query.has("STEP_SIZE")).toBe(false);
    expect(() => assertHorizonsRequest(built)).not.toThrow();
    expect(() => assertHorizonsRequest(JSON.parse(JSON.stringify(built)) as HorizonsRequest)).not.toThrow();
    expect(Object.isFrozen(built)).toBe(true);
    expect(Object.isFrozen(built.parameters)).toBe(true);
    expect(Object.isFrozen(built.epochs)).toBe(true);
  });

  it("copies epoch input and permits future coverage padding", () => {
    const input = [2378496.5, 2524958.5];
    const built = makeHorizonsRequest("Ceres", input);
    input[0] = 2451545;
    expect(built.epochs).toEqual([2378496.5, 2524958.5]);
  });

  it.each([
    [], [NaN], [Infinity], [-Infinity], [0], [-1], [2451545, 2451545],
    [2451546, 2451545], [1, 1 + Number.EPSILON], Array.from({ length: 129 }, (_, i) => 2451545 + i)
  ].map((epochs) => [epochs] as const))("rejects invalid epoch lists %j", (epochs) => {
    expect(() => makeHorizonsRequest("Chiron", epochs)).toThrow(RangeError);
  });

  it("rejects malformed runtime values", () => {
    for (const epochs of [null, {}, "2451545", ["2451545"], new Float64Array([2451545])]) {
      expect(() => makeHorizonsRequest("Chiron", epochs as unknown as number[])).toThrow(RangeError);
    }
    expect(() => makeHorizonsRequest("Sun" as MinorBody, EPOCHS)).toThrow(RangeError);
    expect(MAX_HORIZONS_EPOCHS).toBe(128);
    expect(makeHorizonsRequest("Vesta", Array.from({ length: 128 }, (_, i) => 2451545 + i)).epochs).toHaveLength(128);
  });

  it.each([
    { schema: "other" }, { endpoint: "https://example.invalid/" }, { url: "https://example.invalid/" },
    { parameters: {} }, { parameters: { ...request.parameters, TIME_TYPE: "'TDB'" } },
    { parameters: { ...request.parameters, EXTRA: "YES" } }, { epochs: [2451545] }
  ])("rejects modified imported request fields %j", (change) => {
    expect(() => assertHorizonsRequest({ ...request, ...change } as HorizonsRequest)).toThrow(RangeError);
  });
});

describe("original JPL numerical response parsing", () => {
  // These checks validate intake and column meanings. They do not measure a fitted ephemeris.
  it.each(MINOR_BODY_NAMES)("validates the original %s response", (body) => {
    const text = readFileSync(new URL(`fixtures/horizons/${body.toLowerCase()}.json`, import.meta.url), "utf8");
    const parsed = parseHorizonsResponse(text, makeHorizonsRequest(body, EPOCHS));
    expect(parsed.signature).toEqual({ source: "NASA/JPL Horizons API", version: "1.2" });
    expect(parsed.identity.body).toBe(body);
    expect(parsed.identity.targetName).toContain(body);
    expect(parsed.rows.map((row) => row.jdTt)).toEqual(EPOCHS);
    expect(parsed.identity.targetSource).toMatch(/^JPL#\d+$/);
    expect(parsed.identity.centerSource).toMatch(/^DE\d+$/);
    expect(parsed.identity.smallPerturbersSource).toMatch(/^SB\d+-N\d+$/);
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.signature)).toBe(true);
    expect(Object.isFrozen(parsed.identity)).toBe(true);
    expect(Object.isFrozen(parsed.identity.initialPositionAu)).toBe(true);
    expect(Object.isFrozen(parsed.identity.initialVelocityAuPerDay)).toBe(true);
    expect(Object.isFrozen(parsed.rows)).toBe(true);
    for (const row of parsed.rows) {
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.isFrozen(row.positionAu)).toBe(true);
      expect(Object.isFrozen(row.velocityAuPerDay)).toBe(true);
    }
  });

  it("preserves source position and velocity without swapping columns or units", () => {
    const parsed = parseHorizonsResponse(raw, request);
    expect(parsed.rows[0]).toEqual({
      jdTt: 2451545,
      positionAu: [-3.353665355054553, -9.562320504056743, -3.320512897435734],
      velocityAuPerDay: [0.02217878420947133, -0.0007284184567692325, 0.0004305424200884474]
    });
  });

  it("matches TT epochs at the printed Julian date precision", () => {
    const near = makeHorizonsRequest("Chiron", [2451545 + 2 ** -31, 2451545.125, 2451546]);
    expect(parseHorizonsResponse(raw, near).rows[0]!.jdTt).toBe(2451545);
    const wrong = makeHorizonsRequest("Chiron", [2451545 + 2 ** -30, 2451545.125, 2451546]);
    expect(() => parseHorizonsResponse(raw, wrong)).toThrow(/epoch/);
  });

  it.each([
    "invalid JSON", "null", "[]", "{}",
    JSON.stringify({ ...original, error: "failure" }), JSON.stringify({ ...original, error: "" }),
    JSON.stringify({ ...original, result: null }),
    JSON.stringify({ ...original, signature: { ...original.signature, version: "1.3" } }),
    JSON.stringify({ ...original, signature: { ...original.signature, version: "2.0" } }),
    JSON.stringify({ ...original, signature: { ...original.signature, source: "untrusted" } })
  ])("rejects invalid envelopes and unreviewed signatures", (text) => {
    expect(() => parseHorizonsResponse(text, request)).toThrow(HorizonsParseError);
  });

  it("rejects input at the file-size limit", () => {
    expect(() => parseHorizonsResponse(" ".repeat(2_000_000), request)).toThrow(/too large/);
    expect(() => parseHorizonsResponse("é".repeat(1_000_000), request)).toThrow(/too large/);
  });

  it.each([
    ["target number", "Target body name: 2060", "Target body name: 2061"],
    ["target name", "Target body name: 2060 Chiron", "Target body name: 2060 Ceres"],
    ["record number", "Rec #:    2060", "Rec #:    2061"],
    ["solution disagreement", "1: soln ref.= JPL#171", "1: soln ref.= JPL#999"],
    ["unreviewed orbit suffix", "1: soln ref.= JPL#171, OCC=0", "1: soln ref.= JPL#171, OCC=0 arbitrary"],
    ["invalid radar suffix", "1: soln ref.= JPL#171, OCC=0", "1: soln ref.= JPL#171, OCC=0 radar(60 delay, NaN Dop.)"],
    ["planet center", "Center body name: Earth (399)", "Center body name: Earth (3)"],
    ["site", "Center-site name: BODY CENTER", "Center-site name: Observatory"],
    ["coordinates", "Center geodetic : 0.0, 0.0, 0.0", "Center geodetic : 1.0, 0.0, 0.0"],
    ["units", "Output units    : AU-D", "Output units    : KM-S"],
    ["corrections", "Output type     : LT+S CORRECTED", "Output type     : LT CORRECTED"],
    ["frame", "Reference frame : ICRF", "Reference frame : Ecliptic of J2000.0"],
    ["table type", "Output format   : 2 (position and velocity)", "Output format   : 3 (position and velocity)"],
    ["input list", "Step-size       : DISCRETE TIME-LIST", "Step-size       : 1 day"],
    ["time metadata", "12:00:00.0000 TT", "12:00:00.0000 TDB"],
    ["time column", "JDTT ,", "JDTDB ,"],
    ["column names", "Calendar Date (TT )", "Calendar Date (TDB)"],
    ["perturbers", "Small perturbers: Yes", "Small perturbers: No"],
    ["initial epoch", "Initial IAU76/J2000 heliocentric", "Initial changed heliocentric"],
    ["initial frame", "Equivalent ICRF heliocentric", "Equivalent FK4 heliocentric"],
    ["initial finite state", "X= 1.843374627977423E+01", "X= 1e999"],
    ["duplicate metadata", "Output units    : AU-D", "Output units    : AU-D\nOutput units    : AU-D"],
    ["missing marker", "$$EOE", "END"],
    ["duplicate marker", "$$SOE", "$$SOE\n$$SOE"],
    ["malformed marker", "$$SOE", " $$SOE"],
    ["extra row", "$$EOE", "\n$$EOE"]
  ])("rejects changed %s", (_label, before, after) => {
    expect(() => parseHorizonsResponse(changeText(before!, after!), request)).toThrow(HorizonsParseError);
  });

  it.each(["NaN", "Infinity", "-Infinity", "1e999", "0x12", "", "1.2 junk"])("rejects nondecimal/nonfinite vector %s", (value) => {
    for (const column of [2, 3, 4, 5, 6, 7]) {
      expect(() => parseHorizonsResponse(changeField(column, value), request)).toThrow(HorizonsParseError);
    }
  });

  it("rejects missing, additional and reordered columns or rows", () => {
    expect(() => parseHorizonsResponse(changeFirstRow((fields) => fields.slice(0, -1)), request)).toThrow(/column/);
    expect(() => parseHorizonsResponse(changeFirstRow((fields) => [...fields, "extra"]), request)).toThrow(/column/);
    expect(() => parseHorizonsResponse(changeField(0, "2451545.1"), request)).toThrow(/precision/);
    expect(() => parseHorizonsResponse(changeField(0, "2451546.000000000"), request)).toThrow(/epoch/);
    expect(() => parseHorizonsResponse(changeText(/\$\$SOE\n[^\n]+\n/, "$$SOE\n"), request)).toThrow(/row count/);
    const reversed = makeHorizonsRequest("Ceres", EPOCHS);
    expect(() => parseHorizonsResponse(raw, reversed)).toThrow(/target/);
  });

  it("rejects inconsistent request manifests before trusting a response", () => {
    expect(() => parseHorizonsResponse(raw, { ...request, url: "https://example.invalid" })).toThrow(RangeError);
  });

  it("compares complete source identities without depending on returned epochs", () => {
    const parsed = parseHorizonsResponse(raw, request);
    expect(() => assertSameHorizonsSolution(parsed, parseHorizonsResponse(raw, request))).not.toThrow();
    const subset = changeResult((result) => result.replace(/(\$\$SOE\n)([^\n]+\n)[\s\S]*?(\$\$EOE)/,
      (_all, start: string, first: string, end: string) => start + first + end));
    expect(() => assertSameHorizonsSolution(parsed, parseHorizonsResponse(subset, makeHorizonsRequest("Chiron", [2451545])))).not.toThrow();
    for (const [before, after] of [
      [/JPL#171/g, "JPL#172"], ["DE441", "DE442"], ["SB441-N16", "SB442-N16"],
      ["2026-Jun-05_06:09:00", "2026-Jun-06_06:09:00"], ["eop.261014.p270110", "eop.261015.p270111"],
      ["X= 1.843374627977423E+01", "X= 1.843374627977424E+01"]
    ] as const) {
      const changed = parseHorizonsResponse(changeText(before, after), request);
      expect(() => assertSameHorizonsSolution(parsed, changed)).toThrow(/mixed Horizons solution/);
    }
  });
});
