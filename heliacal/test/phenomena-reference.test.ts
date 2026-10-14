import { afterEach, describe, expect, it, vi } from "vitest";
import type { SkyEventKind } from "../../src/sky/riseset.js";
import type { ReceiptedSkyEvent } from "../src/engine.js";
import { HORIZON_PHENOMENA, HORIZON_TERMINOLOGY, horizonPhenomena } from "../src/phenomena.js";
import type { HorizonPhenomenon } from "../src/phenomena.js";
import * as windows from "../src/windows.js";
import type { ObservingWindowsResult } from "../src/windows.js";
import reference from "./fixtures/horizon-terminology.json" with { type: "json" };

const SITE = { latitude: 0, longitude: 0, height: 0 };
const START = Date.parse("2001-02-03");
const HOUR = 3_600_000;
const ms = (day: number, hour = 0) => START + (24 * day + hour) * HOUR;
const iso = (day: number, hour = 0) => new Date(ms(day, hour)).toISOString();

// These invented schedules check the published pairing definitions and exact
// integer arithmetic. The structural position doubles only check identity;
// they are not valid engine receipts or an ephemeris/observation reference.
function schedule(sunKind: string, targetKind: string, offsets: readonly (number | null)[]) {
  const event = (kind: SkyEventKind, day: number, hour: number) => ({
    kind, at: new Date(ms(day, hour)), altitude: 0, azimuth: 0,
    position: { status: "ok", receipt: { synthetic: `${kind}-${day}-${hour}` } }
  } as unknown as ReceiptedSkyEvent);
  const sun: ReceiptedSkyEvent[] = [];
  const target: ReceiptedSkyEvent[] = [];
  for (let day = 0; day < offsets.length; day += 1) {
    sun.push(event("lower-transit", day, 0), event("rise", day, 6), event("upper-transit", day, 12), event("set", day, 18));
    if (offsets[day] !== null) target.push(event(targetKind as SkyEventKind, day, (sunKind === "rise" ? 6 : 18) + offsets[day]!));
  }
  sun.push(event("lower-transit", offsets.length, 0));
  const result = {
    status: "complete", body: "Moon", observer: SITE, windows: [],
    horizons: {
      sun: { status: "complete", events: sun }, target: { status: "complete", events: target }
    }, diagnostics: [], receiptScope: "event-positions"
  } as unknown as ObservingWindowsResult;
  vi.spyOn(windows, "observingWindows").mockReturnValue(result);
  return { sun, target, result, event };
}

afterEach(() => vi.restoreAllMocks());

describe("Harris 1773 horizon definitions and independent schedule arithmetic", () => {
  it("preserves the cited mapping instead of inferring names from conjunction or opposition", () => {
    expect(HORIZON_TERMINOLOGY.id).toBe(reference.convention);
    expect(HORIZON_PHENOMENA).toEqual(reference.cases.map((row) => row.kind));
    for (const row of reference.cases) {
      expect(HORIZON_TERMINOLOGY.definitions[row.kind as HorizonPhenomenon])
        .toEqual({ sunKind: row.sunKind, targetKind: row.targetKind });
    }
  });

  describe.each(reference.cases)("$kind", ({ kind: label, sunKind, targetKind, period }) => {
    const kind = label as HorizonPhenomenon;
    it.each([
      { offsets: [-1, 2], expected: "target-earlier-to-later" },
      { offsets: [2, -1], expected: "target-later-to-earlier" }
    ])("brackets $expected while keeping the original Sun and target times", ({ offsets, expected }) => {
      const source = schedule(sunKind, targetKind, offsets);
      const result = horizonPhenomena("Moon", SITE, iso(0), iso(2), { kinds: [kind] });
      expect(result.status).toBe("complete");
      expect(result.events).toHaveLength(1);
      const event = result.events[0]!;
      expect(event).toMatchObject({
        body: "Moon", kind, sunKind, targetKind, at: null, direction: expected,
        definition: "geometric-horizon-order", receiptScope: "event-positions",
        bracket: { kind: "successive-horizon-pairs" }
      });
      expect(event.bracket.before.lagMilliseconds).toBe(offsets[0]! * HOUR);
      expect(event.bracket.after.lagMilliseconds).toBe(offsets[1]! * HOUR);
      expect(event.bracket.before.period).toBe(period);
      expect(event.bracket.before.targetCrossing).toBe(source.target[0]);
      expect(event.bracket.after.targetCrossing).toBe(source.target[1]);
      expect(event.bracket.before.sunCrossing).toBe(source.sun.find((row) => row.kind === sunKind));
      expect(event.bracket.before.targetCrossing.position).toBe(source.target[0]!.position);
      const hour = period === "morning" ? 6 : 18;
      expect(event.bracket.from).toBe(iso(0, hour + Math.min(offsets[0]!, 0)));
      expect(event.bracket.to).toBe(iso(1, hour + Math.max(offsets[1]!, 0)));
      expect(event.terminology).toBe(HORIZON_TERMINOLOGY);
      expect(result.observing).toBe(source.result);
    });

    it("reports a sampled equality once, without duplicate adjacent reversals", () => {
      schedule(sunKind, targetKind, [-1, 0, 1]);
      const result = horizonPhenomena("Moon", SITE, iso(0), iso(3), { kinds: [kind] });
      expect(result.events).toHaveLength(1);
      const event = result.events[0]!;
      const at = iso(1, period === "morning" ? 6 : 18);
      expect(event).toMatchObject({ at, direction: "coincident", bracket: { from: at, to: at, kind: "coincident-engine-crossings" } });
      expect(event.bracket.before).toBe(event.bracket.after);
    });

    it.each([[-1, -2], [1, 2]])("does not call an unchanged order an event: %j", (...offsets) => {
      schedule(sunKind, targetKind, offsets);
      const result = horizonPhenomena("Moon", SITE, iso(0), iso(2), { kinds: [kind] });
      expect(result.events).toEqual([]);
    });

    it.each(["missing-target", "multiple-target", "missing-sun", "multiple-sun", "wrong-half"])(
      "breaks adjacency at a %s gap", (gap) => {
        const source = schedule(sunKind, targetKind, [-1, 0, 1]);
        if (gap === "missing-target") source.target.splice(1, 1);
        if (gap === "multiple-target") source.target.push({ ...source.target[1]!, at: new Date(ms(1, period === "morning" ? 7 : 19)) });
        if (gap === "missing-sun") source.sun.splice(source.sun.findIndex((row) => row.kind === sunKind && row.at.getTime() >= ms(1)), 1);
        if (gap === "multiple-sun") source.sun.push(source.event(sunKind as SkyEventKind, 1, period === "morning" ? 7 : 19));
        if (gap === "wrong-half") source.target[1] = { ...source.target[1]!, at: new Date(ms(1, period === "morning" ? 18 : 6)) };
        source.sun.sort((a, b) => a.at.getTime() - b.at.getTime());
        const result = horizonPhenomena("Moon", SITE, iso(0), iso(3), { kinds: [kind] });
        expect(result.status).toBe("complete");
        expect(result.events).toEqual([]);
        expect(result.opportunities.map((row) => row.status)).toEqual(["paired", "unavailable", "paired"]);
        expect(result.diagnostics).toHaveLength(1);
        expect(result.diagnostics[0]!.kind).toBe(kind);
      }
    );
  });

  it("does not turn a daily wrap from morning to evening into a reversal", () => {
    const source = schedule("rise", "rise", [5, null, -5]);
    source.target.push(source.event("rise", 1, 13));
    const result = horizonPhenomena("Moon", SITE, iso(0), iso(3), { kinds: ["cosmical-rising"] });
    expect(result.events).toEqual([]);
    expect(result.diagnostics[0]!.reason).toBe("missing-target-crossing");
  });

  it("requires both crossings inside the range, with no event inferred at a clipped edge", () => {
    schedule("rise", "rise", [-1, 1]);
    expect(horizonPhenomena("Moon", SITE, iso(0, 6), iso(2), { kinds: ["cosmical-rising"] }).events).toEqual([]);
    expect(horizonPhenomena("Moon", SITE, iso(0), iso(1, 7), { kinds: ["cosmical-rising"] }).events).toEqual([]);
    // Both target crossings included, but the first Sun crossing excluded.
    vi.restoreAllMocks();
    schedule("rise", "rise", [1, -1]);
    const result = horizonPhenomena("Moon", SITE, iso(0, 7), iso(2), { kinds: ["cosmical-rising"] });
    expect(result.events).toEqual([]);
    expect(result.diagnostics[0]!.reason).toBe("sun-crossing-outside-range");
  });
});
