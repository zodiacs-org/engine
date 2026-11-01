// `@zodiacs/engine/time` (src/time.ts): its names, what it refuses, that it
// gives the engine's own values, its frozen frames, the committed ERFA
// references through it, natalChart's longitudes through it, and its graph
// and state, as docs/evidence/1.1.0-rc.2-20261102/time-entry/PREREGISTRATION.md
// fixes them (R1, T1, T2, T5, T7c, T10 and T11, here on samples; the
// preregistered checks run its corpora on the built package).
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

import { Body, GeoMoon, GeoMoonState, GeoVector, MakeTime, SetDeltaTFunction } from "astronomy-engine";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { deltaT } from "./deltat.js";
import * as engineFrame from "./frame.js";
import * as engineNutation from "./nutation.js";
import { EPHEMERIS_SPAN } from "./reference-span.js";
import * as engineTime from "./time-scale.js";
import type { TimeScaleName } from "./time-scale.js";
import * as time from "./time.js";
import type { EclipticFrame, TimeBasis } from "./time.js";

const DAY = 86_400_000;
const RAD = 180 / Math.PI;
/** R1: the entry's runtime exports. */
const VALUES = [
  "DELTA_T_IERS_MODEL", "EPHEMERIS_SPAN", "TIME_SCALE_NAMES", "eclipticFrame", "eclipticOfDate", "elapsedDays", "meanEcliptic", "tilt",
  "timeBasis"
];
/** R1: its declarations, the nine values and the types they take and give. */
const DECLARED = [
  ...VALUES, "DeltaT", "DeltaTSegment", "EclipticFrame", "LeapSeconds", "Tilt", "TimeBasis", "TimeScale", "TimeScaleName", "Ut1MinusUtc"
].sort();
const SCALES: TimeScaleName[] = ["utc", "ut1", "tt"];
const PINS = [undefined, 69.184, -1.5];

/** The site generator's leap-second edges (corpus K1's), each at -1,000, -1, 0, +1 and +1,000 ms. */
function edges(): number[] {
  const days = [Date.UTC(1972, 0, 1), Date.UTC(1973, 0, 2), Date.UTC(2027, 9, 2), Date.UTC(2027, 5, 28)];
  for (const [year, month] of [[1972, 6], [1973, 0], [1974, 0], [1975, 0], [1976, 0], [1977, 0], [1978, 0], [1979, 0], [1980, 0],
    [1981, 6], [1982, 6], [1983, 6], [1985, 6], [1988, 0], [1990, 0], [1991, 0], [1992, 6], [1993, 6], [1994, 6], [1996, 0],
    [1997, 6], [1999, 0], [2006, 0], [2009, 0], [2012, 6], [2015, 6], [2017, 0]] as const) days.push(Date.UTC(year, month, 1));
  return days.flatMap((day) => [day - 1_000, day - 1, day, day + 1, day + 1_000]);
}
/** Every 400th instant of K1's ten-day grid from 1800 to 2200, at noon. */
function grid(): number[] {
  const instants: number[] = [];
  for (let t = Date.UTC(1800, 0, 1, 12), i = 0; t < Date.UTC(2200, 0, 1); t += 10 * DAY, i += 1) if (i % 400 === 0) instants.push(t);
  return instants;
}
/** Corpus K3's seams, at the offsets that stay inside the Date range. */
function seams(): number[] {
  const out: number[] = [];
  for (const at of [Date.UTC(2026, 8, 24), Date.UTC(2027, 9, 2) + 148, -915_170_400_000, -441_806_400_000, -84_889_944_000_000,
    -62_125_272_000_000, 64_018_728_000_000, -8.64e15, 8.64e15]) {
    for (const offset of [-1_000, -1, 0, 1, 1_000]) if (Math.abs(at + offset) <= 8.64e15) out.push(at + offset);
  }
  return out;
}
const DIRECTIONS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.36, -0.48, 0.8], [-0.6, 0.64, -0.48]] as const;

interface ErfaEpoch { tt: number; dpsi: number; deps: number; epsA: number; ee2000B: number; eclipticOfDate: number[] }
const ERFA = JSON.parse(readFileSync(new URL("./fixtures/nutation-erfa.json", import.meta.url), "utf8")) as {
  tolerance: { nutationArcsec: number; meanObliquityArcsec: number; equationOfEquinoxesArcsec: number; rotationArcsec: number };
  epochs: ErfaEpoch[];
};

describe("@zodiacs/engine/time", () => {
  it("exports exactly the nine values of R1", () => {
    expect(Object.keys(time).sort()).toEqual(VALUES);
  });

  it("declares exactly R1's eighteen names in api/time.api.md", () => {
    const report = readFileSync(new URL("../api/time.api.md", import.meta.url), "utf8");
    const block = /## Exported \((\d+)\)\n\n```ts\n([\s\S]*?)\n```/u.exec(report);
    expect(block?.[1]).toBe(String(DECLARED.length));
    const names = [...block![2]!.matchAll(/^(?:declare const|declare function|interface|type) ([A-Za-z_]\w*)/gmu)].map((match) => match[1]);
    expect(names.sort()).toEqual(DECLARED);
    expect(report).not.toContain("## Referenced, not exported here");
  });

  it("throws RangeError for each argument it refuses (T10)", () => {
    const basis = engineTime.timeBasis(0);
    const refused: [string, () => unknown][] = [
      ["timeBasis(NaN)", () => time.timeBasis(Number.NaN)],
      ["timeBasis(Infinity)", () => time.timeBasis(Number.POSITIVE_INFINITY)],
      ["timeBasis(8.64e15 + 1)", () => time.timeBasis(8.64e15 + 1)],
      ['timeBasis(0, "UTC")', () => time.timeBasis(0, "UTC" as TimeScaleName)],
      ['timeBasis(0, "utc", NaN)', () => time.timeBasis(0, "utc", Number.NaN)],
      ['timeBasis(0, "utc", 1e10 + 1)', () => time.timeBasis(0, "utc", 1e10 + 1)],
      ["elapsedDays(b, b, NaN)", () => time.elapsedDays(basis, basis, Number.NaN)],
      ["tilt(NaN)", () => time.tilt(Number.NaN)],
      ["eclipticFrame(Infinity)", () => time.eclipticFrame(Number.POSITIVE_INFINITY)],
      ["meanEcliptic(eclipticFrame(0), NaN, 0, 0)", () => time.meanEcliptic(time.eclipticFrame(0), Number.NaN, 0, 0)],
      ["eclipticOfDate(0, 0, 0, 0)", () => time.eclipticOfDate(0, 0, 0, 0)],
      ["eclipticOfDate(1, 0, 0, NaN)", () => time.eclipticOfDate(1, 0, 0, Number.NaN)]
    ];
    for (const [call, run] of refused) expect(run, call).toThrow(RangeError);
  });

  it("accepts the ends of the Date range and of a pin, and an absent scale, giving the engine's records (T10)", () => {
    const accepted: [number, TimeScaleName | undefined, number | undefined][] = [
      [8.64e15, undefined, undefined], [-8.64e15, "tt", undefined], [0, "tt", -1e10], [0, undefined, undefined]
    ];
    for (const [ms, scale, pin] of accepted) {
      expect(isDeepStrictEqual(time.timeBasis(ms, scale, pin), engineTime.timeBasis(ms, scale, pin)), `${ms} ${scale} ${pin}`).toBe(true);
    }
  });

  it("gives what the engine's own functions give, value for value", () => {
    const instants = [...edges(), ...grid(), ...seams()];
    let compared = 0;
    for (const ms of instants) {
      for (const scale of SCALES) {
        for (const pin of PINS) {
          const basis = time.timeBasis(ms, scale, pin);
          expect(isDeepStrictEqual(basis, engineTime.timeBasis(ms, scale, pin)), `${ms} ${scale} ${pin}`).toBe(true);
          for (const [step, days] of [[86_400, 0.002], [21_600_000, 0.5]] as const) {
            if (Math.abs(ms) + step > 8.64e15) continue;
            const before = time.timeBasis(ms - step, scale, pin);
            const after = time.timeBasis(ms + step, scale, pin);
            expect(Object.is(time.elapsedDays(before, after, days), engineTime.elapsedDays(before, after, days))).toBe(true);
          }
          compared += 1;
        }
      }
      const tt = engineTime.timeBasis(ms).ttDays;
      expect(isDeepStrictEqual(time.tilt(tt), engineNutation.tilt(tt))).toBe(true);
      const frame = time.eclipticFrame(tt);
      expect(isDeepStrictEqual({ ...frame, rows: [...frame.rows], tilt: { ...frame.tilt } }, engineFrame.eclipticFrame(tt))).toBe(true);
      for (const [x, y, z] of DIRECTIONS) {
        expect(isDeepStrictEqual(time.meanEcliptic(frame, x, y, z), engineFrame.meanEcliptic(engineFrame.eclipticFrame(tt), x, y, z))).toBe(true);
        expect(isDeepStrictEqual(time.eclipticOfDate(x, y, z, tt), engineFrame.eclipticOfDate(x, y, z, tt))).toBe(true);
      }
    }
    expect(compared).toBe(instants.length * 9);
    expect(time.EPHEMERIS_SPAN).toBe(EPHEMERIS_SPAN);
    expect(time.DELTA_T_IERS_MODEL).toBe(engineTime.DELTA_T_IERS_MODEL);
    expect(time.TIME_SCALE_NAMES).toBe(engineTime.TIME_SCALE_NAMES);
    expect(Object.isFrozen(time.TIME_SCALE_NAMES) && time.TIME_SCALE_NAMES.join()).toBe("utc,ut1,tt");
  });

  it("gives frozen copies and never hands out the frame the engine keeps (T10)", () => {
    const tt = 9_496.5;
    const frame: EclipticFrame = time.eclipticFrame(tt);
    expect([Object.isFrozen(frame), Object.isFrozen(frame.rows), Object.isFrozen(frame.tilt), Object.isFrozen(time.tilt(tt))]).toEqual([true, true, true, true]);
    const kept = engineFrame.eclipticFrame(tt);
    expect(frame).not.toBe(kept);
    expect(frame.rows).not.toBe(kept.rows);
    expect(frame.tilt).not.toBe(kept.tilt);
    const before = time.eclipticOfDate(0.36, -0.48, 0.8, tt);
    // A write throws in strict code (this module) and is ignored otherwise.
    expect(() => {
      (frame.rows as number[])[0] = 0;
    }).toThrow(TypeError);
    const sloppy = new Function("rows", "rows[0] = 0; return rows[0];") as (rows: readonly number[]) => number;
    expect(sloppy(frame.rows)).toBe(kept.rows[0]);
    expect(isDeepStrictEqual(time.eclipticOfDate(0.36, -0.48, 0.8, tt), before)).toBe(true);
    expect(engineFrame.eclipticFrame(tt).rows[0]).toBe(frame.rows[0]);
  });

  it("meets the committed ERFA references through its public functions (T7c)", () => {
    const { tolerance } = ERFA;
    const unit = (lon: number, lat: number) => {
      const [l, b] = [lon / RAD, lat / RAD];
      return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
    };
    let rotation = 0;
    for (const epoch of ERFA.epochs) {
      const { dpsi, deps, mobl, ee } = time.tilt(epoch.tt);
      expect(Math.abs(dpsi - epoch.dpsi)).toBeLessThanOrEqual(tolerance.nutationArcsec);
      expect(Math.abs(deps - epoch.deps)).toBeLessThanOrEqual(tolerance.nutationArcsec);
      expect(Math.abs(mobl * 3600 - epoch.epsA)).toBeLessThanOrEqual(tolerance.meanObliquityArcsec);
      expect(Math.abs(ee - epoch.ee2000B)).toBeLessThanOrEqual(tolerance.equationOfEquinoxesArcsec);
      const m = epoch.eclipticOfDate;
      for (const [x, y, z] of DIRECTIONS) {
        const expected = [0, 1, 2].map((row) => m[3 * row]! * x + m[3 * row + 1]! * y + m[3 * row + 2]! * z);
        const { lon, lat } = time.eclipticOfDate(x, y, z, epoch.tt);
        const actual = unit(lon, lat);
        const cross = Math.hypot(
          actual[1]! * expected[2]! - actual[2]! * expected[1]!,
          actual[2]! * expected[0]! - actual[0]! * expected[2]!,
          actual[0]! * expected[1]! - actual[1]! * expected[0]!
        );
        const dot = actual[0]! * expected[0]! + actual[1]! * expected[1]! + actual[2]! * expected[2]!;
        rotation = Math.max(rotation, Math.atan2(cross, dot) * RAD * 3600);
      }
    }
    expect(rotation).toBeLessThanOrEqual(tolerance.rotationArcsec);
  });

  it("turns astronomy-engine's vectors to natalChart's longitudes, bit for bit (T5's method)", () => {
    const PLANETS = ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"] as const;
    // As zodiacs.org's generator takes them: ΔT held at the basis's for the call, time made at its UT1.
    const longitudes = (basis: TimeBasis) => {
      const seconds = basis.deltaT.seconds;
      SetDeltaTFunction(() => seconds);
      try {
        const at = MakeTime(basis.ut1Days);
        const out = new Map<string, number>();
        for (const name of PLANETS) {
          const vector = GeoVector(Body[name], at, true);
          out.set(name, time.eclipticOfDate(vector.x, vector.y, vector.z, at.tt).lon);
        }
        const moon = GeoMoon(at);
        out.set("Moon", time.eclipticOfDate(moon.x, moon.y, moon.z, at.tt).lon);
        const state = GeoMoonState(at);
        const frame = time.eclipticFrame(at.tt);
        const [x, y] = time.meanEcliptic(frame, state.y * state.vz - state.z * state.vy, state.z * state.vx - state.x * state.vz,
          state.x * state.vy - state.y * state.vx);
        const node = (((Math.atan2(x, -y) * RAD + frame.tilt.dpsi / 3600) % 360) + 360) % 360;
        out.set("North Node", node);
        out.set("South Node", (((node + 180) % 360) + 360) % 360);
        return out;
      } finally {
        SetDeltaTFunction(deltaT);
      }
    };
    let bodies = 0;
    for (const ms of [...edges(), ...grid()]) {
      const basis = time.timeBasis(ms, "utc");
      const chart = natalChart({ utc: new Date(ms), timeKnown: false });
      expect(isDeepStrictEqual([basis.deltaT, basis.timeScale], [chart.deltaT, chart.timeScale]), new Date(ms).toISOString()).toBe(true);
      const framed = longitudes(basis);
      for (const body of chart.bodies) {
        expect(Object.is(framed.get(body.body), body.lon), `${body.body} ${new Date(ms).toISOString()}`).toBe(true);
        bodies += 1;
      }
    }
    expect(bodies).toBe(12 * (155 + 37));
  });

  it("imports no ephemeris: its source graph is the nine modules of T2", () => {
    const graph = new Map<string, string[]>();
    const visit = (path: string) => {
      if (graph.has(path)) return;
      const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const specifiers: string[] = [];
      for (const statement of source.statements) {
        if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) specifiers.push((statement.moduleSpecifier as ts.StringLiteral).text);
        if (ts.isExportDeclaration(statement) && !statement.isTypeOnly && statement.moduleSpecifier) {
          specifiers.push((statement.moduleSpecifier as ts.StringLiteral).text);
        }
      }
      graph.set(path, specifiers);
      for (const specifier of specifiers) {
        expect(specifier, `${path} imports ${specifier}`).toMatch(/^\.\/[a-z-]+\.js$/u);
        visit(`src/${specifier.slice(2, -3)}.ts`);
      }
    };
    visit("src/time.ts");
    expect([...graph.keys()].sort()).toEqual([
      "src/deltat.ts", "src/frame.ts", "src/houses.ts", "src/nutation.ts", "src/reference-span.ts", "src/signs.ts", "src/time-scale-data.ts",
      "src/time-scale.ts", "src/time.ts"
    ]);
  });

  it("keeps no module state of its own (T11)", () => {
    const text = readFileSync(new URL("./time.ts", import.meta.url), "utf8");
    const source = ts.createSourceFile("src/time.ts", text, ts.ScriptTarget.Latest, true);
    const imported = new Set<string>();
    for (const statement of source.statements) {
      const clause = ts.isImportDeclaration(statement) ? statement.importClause : undefined;
      if (clause?.name) imported.add(clause.name.text);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) imported.add(element.name.text);
      if (bindings && ts.isNamespaceImport(bindings)) imported.add(bindings.name.text);
    }
    const problems: string[] = [];
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      if (!(statement.declarationList.flags & ts.NodeFlags.Const)) problems.push(`let or var: ${statement.getText()}`);
      for (const { initializer } of statement.declarationList.declarations) {
        if (initializer && (ts.isArrayLiteralExpression(initializer) || ts.isObjectLiteralExpression(initializer) ||
          (ts.isNewExpression(initializer) && /^(?:Map|Set|WeakMap|WeakSet|Array|Object)$/u.test(initializer.expression.getText())))) {
          problems.push(`a mutable value: ${statement.getText()}`);
        }
      }
    }
    const visit = (node: ts.Node) => {
      const target = ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment ? node.left
        : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
          (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) ? node.operand : undefined;
      if (target && ts.isIdentifier(target) && imported.has(target.text)) problems.push(`assigns to ${target.text}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(problems).toEqual([]);
    expect(imported.size).toBeGreaterThan(0);
  });
});
