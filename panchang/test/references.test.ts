import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LIMB_KINDS, panchangDay, searchLimbTransitions } from "../src/index.js";
import type { LimbKind, LimbTransition } from "../src/index.js";

interface Sample {
  utc: string;
  sunTropical: number;
  moonTropical: number;
  lahiriTrue: number;
}
interface ReferenceEvent {
  kind: LimbKind;
  beforeIndex: number;
  afterIndex: number;
  at: string;
  left: Sample;
  right: Sample;
}
interface Origin { url: string; responseSHA256: string; version: string; source: string }
interface ReferenceWindow {
  from: string;
  to: string;
  start: Sample;
  end: Sample;
  horizons: { sun: Origin; moon: Origin };
  transitions: ReferenceEvent[];
}
const fixture = JSON.parse(readFileSync(new URL("./fixtures/transition-references.json", import.meta.url), "utf8")) as {
  acceptanceSeconds: number;
  ayanamsa: "lahiri";
  pyerfa: string;
  referenceTool: string;
  referenceToolSHA256: string;
  windows: ReferenceWindow[];
  usno: { url: string; responseSHA256: string; rows: {
    phase: "New Moon" | "Full Moon" | "First Quarter" | "Last Quarter";
    at: string; karanaAfterIndex: number;
  }[] };
};

// Independent definition arithmetic, intentionally using neither classifiers
// nor their exact-arithmetic helpers. Fixture endpoints are clear of boundaries.
const counts = { tithi: 30, karana: 60, nakshatra: 27, yoga: 27, pada: 108 };
const turn = (angle: number): number => (angle % 360 + 360) % 360;
function phase(row: Sample, kind: LimbKind): number {
  if (kind === "tithi" || kind === "karana") return turn(row.moonTropical - row.sunTropical);
  if (kind === "yoga") return turn(row.moonTropical + row.sunTropical - 2 * row.lahiriTrue);
  return turn(row.moonTropical - row.lahiriTrue);
}
const referenceIndex = (row: Sample, kind: LimbKind): number => Math.floor(phase(row, kind) * counts[kind] / 360);
const indexOf = (state: LimbTransition["after"], kind: LimbKind): number => kind === "pada"
  ? state.nakshatra.index * 4 + state.nakshatra.pada - 1 : state[kind].index;

describe("independent reference extract integrity and interpolation (SOURCES.md M11)", () => {
  it("retains the registered cases, threshold, independent tool and provider requests", () => {
    expect(fixture.acceptanceSeconds).toBe(60);
    expect(fixture.ayanamsa).toBe("lahiri");
    expect(fixture.pyerfa).toBe("2.0.1.5");
    expect(fixture.windows.map(({ from }) => from.slice(0, 10))).toEqual(["2024-03-20", "2024-04-08", "2024-09-17"]);
    const tool = readFileSync(new URL(`../../${fixture.referenceTool}`, import.meta.url));
    expect(createHash("sha256").update(tool).digest("hex")).toBe(fixture.referenceToolSHA256);
    for (const window of fixture.windows) {
      for (const [body, origin] of [["10", window.horizons.sun], ["301", window.horizons.moon]] as const) {
        const request = new URL(origin.url);
        expect(request.origin).toBe("https://ssd.jpl.nasa.gov");
        for (const [key, value] of Object.entries({ COMMAND: body, CENTER: "500@399", QUANTITIES: "31",
          STEP_SIZE: "1 m", TIME_TYPE: "UT", APPARENT: "AIRLESS" })) {
          expect(request.searchParams.get(key)).toBe(`'${value}'`);
        }
        expect(origin.responseSHA256).toMatch(/^[a-f0-9]{64}$/);
        expect(origin.source).toBe("NASA/JPL Horizons API");
      }
    }
    expect(fixture.usno.responseSHA256).toMatch(/^[a-f0-9]{64}$/);
    expect(new URL(fixture.usno.url).origin).toBe("https://aa.usno.navy.mil");
  });

  it.each(fixture.windows)("reconstructs every $from boundary from independent bracketing coordinates", (window) => {
    expect(window.start.utc).toBe(window.from);
    expect(window.end.utc).toBe(window.to);
    expect(Date.parse(window.to) - Date.parse(window.from)).toBe(86_400_000);
    expect([...window.transitions].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) ||
      LIMB_KINDS.indexOf(a.kind) - LIMB_KINDS.indexOf(b.kind))).toEqual(window.transitions);
    for (const event of window.transitions) {
      expect(referenceIndex(event.left, event.kind)).toBe(event.beforeIndex);
      expect(referenceIndex(event.right, event.kind)).toBe(event.afterIndex);
      expect(event.afterIndex).toBe((event.beforeIndex + 1) % counts[event.kind]);
      expect(Date.parse(event.right.utc) - Date.parse(event.left.utc)).toBe(60_000);
      const a = phase(event.left, event.kind);
      const delta = turn(phase(event.right, event.kind) - a);
      expect(delta).toBeGreaterThan(0);
      expect(delta).toBeLessThan(360 / counts[event.kind]);
      const fraction = ((event.beforeIndex + 1) * 360 / counts[event.kind] - a) / delta;
      expect(fraction).toBeGreaterThan(0);
      expect(fraction).toBeLessThanOrEqual(1);
      // Python rounds datetime to microseconds, then writes milliseconds.
      // One millisecond permits that independent serialization rounding only.
      expect(Math.abs(Date.parse(event.at) - (Date.parse(event.left.utc) + 60_000 * fraction))).toBeLessThanOrEqual(1);
    }
    for (const kind of LIMB_KINDS) {
      const changes = window.transitions.filter((event) => event.kind === kind);
      const begin = referenceIndex(window.start, kind);
      const end = referenceIndex(window.end, kind);
      expect(changes.length).toBe((end - begin + counts[kind]) % counts[kind]);
      expect(changes.map(({ beforeIndex }) => beforeIndex)).toEqual(changes.map((_, i) => (begin + i) % counts[kind]));
    }
  });
});

describe("JPL DE441 / independent ERFA physical transition comparisons, finite reference windows", () => {
  it.each(fixture.windows)("matches all reference transitions and labels in [$from,$to)", (window) => {
    const result = searchLimbTransitions(window.from, window.to, { ayanamsa: fixture.ayanamsa });
    if (result.status !== "ok") throw new Error(result.reason);
    expect(result.transitions).toHaveLength(window.transitions.length);
    for (const kind of LIMB_KINDS) {
      const expected = window.transitions.filter((event) => event.kind === kind);
      const actual = result.transitions.filter((event) => event.kind === kind);
      expect(actual).toHaveLength(expected.length);
      expect(indexOf(result.startState, kind)).toBe(referenceIndex(window.start, kind));
      const intervals = result.intervals.filter((interval) => interval.kind === kind);
      expect(intervals.at(-1)!.index).toBe(referenceIndex(window.end, kind));
      for (const [i, event] of actual.entries()) {
        const reference = expected[i]!;
        expect(indexOf(event.before, kind)).toBe(reference.beforeIndex);
        expect(indexOf(event.after, kind)).toBe(reference.afterIndex);
        expect(Math.abs(Date.parse(event.at) - Date.parse(reference.at)) / 1000,
          `${kind} at ${reference.at}`).toBeLessThanOrEqual(fixture.acceptanceSeconds);
        expect(event.after.ayanamsa.name).toBe(fixture.ayanamsa);
        expect(event.after.sun.tropical.receipt.instants[0]!.timeScale.input).toBe("utc");
        expect(event.after.moon.sidereal.receipt.conventions).toContain("ayanamsa:lahiri");
      }
    }
  });
});

describe("published USNO primary phase instants (UT minute labels)", () => {
  it("covers each phase with the independent phase-to-sector definition", () => {
    const phases = { "New Moon": 0, "First Quarter": 15, "Full Moon": 30, "Last Quarter": 45 };
    expect(fixture.usno.rows.map(({ phase }) => phase).sort()).toEqual(Object.keys(phases).sort());
    for (const row of fixture.usno.rows) expect(row.karanaAfterIndex).toBe(phases[row.phase]);
  });

  it.each(fixture.usno.rows)("matches $phase at $at without ayanamsa-dependent expectations", (row) => {
    const ms = Date.parse(row.at);
    const result = searchLimbTransitions(new Date(ms - 300_000), new Date(ms + 300_000));
    if (result.status !== "ok") throw new Error(result.reason);
    const expected = row.karanaAfterIndex;
    const changes = result.transitions.filter(({ kind }) => kind === "karana");
    expect(changes).toHaveLength(1);
    const event = changes[0]!;
    expect(event.before.karana.index).toBe((expected + 59) % 60);
    expect(event.after.karana.index).toBe(expected);
    expect(Math.abs(Date.parse(event.at) - ms) / 1000).toBeLessThanOrEqual(fixture.acceptanceSeconds);
    const tithis = result.transitions.filter(({ kind }) => kind === "tithi");
    if (expected % 2 === 0) {
      expect(tithis).toHaveLength(1);
      expect(tithis[0]!.at).toBe(event.at);
      expect(tithis[0]!.after.tithi.index).toBe(expected / 2);
      expect(tithis[0]!.after.tithi.paksha).toBe(expected === 0 ? "shukla" : "krishna");
    } else expect(tithis).toHaveLength(0);
    if (row.phase === "New Moon") {
      expect(event.before.karana.name).toBe("Naga");
      expect(event.after.karana.name).toBe("Kimstughna");
    }
  });
});

describe("published limb references in sunrise-day output at a synthetic observer", () => {
  it.each(fixture.windows)("retains the reference changes in $from day segments", (window) => {
    const result = panchangDay({ date: window.from.slice(0, 10), timeZone: "Asia/Kolkata",
      observer: { latitude: 12.5, longitude: 75.25 } }, { monthConvention: "amanta" });
    if (result.status !== "ok") throw new Error(result.reason);
    // UTC reference windows and local sunrise windows differ. Test only the
    // shared interior, keeping a full acceptance width clear of either sunrise.
    const from = Math.max(Date.parse(window.from), Date.parse(result.sunrise.start.utc));
    const to = Math.min(Date.parse(window.to), Date.parse(result.sunrise.end.utc));
    const margin = fixture.acceptanceSeconds * 1000;
    const expected = window.transitions.filter(({ at }) => Date.parse(at) > from + margin && Date.parse(at) < to - margin);
    expect(expected.length).toBeGreaterThan(0);
    for (const reference of expected) {
      const candidates = result.timeline.transitions.filter((event) => event.kind === reference.kind &&
        Math.abs(Date.parse(event.at) - Date.parse(reference.at)) <= margin);
      expect(candidates).toHaveLength(1);
      const event = candidates[0]!;
      const segment = result.segments.find(({ start }) => start === event.at);
      expect(segment).toBeDefined();
      const interval = segment!.intervals[reference.kind];
      expect(interval.index).toBe(reference.afterIndex);
      expect(interval.start.at).toBe(event.at);
      const preceding = result.segments.find(({ end }) => end === event.at);
      expect(preceding!.intervals[reference.kind].index).toBe(reference.beforeIndex);
      expect(preceding!.intervals[reference.kind].end.at).toBe(event.at);
    }
  });
});
