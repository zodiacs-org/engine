// Regression tests for the two 2.1.1 fixes to the calc entry's time basis.
//
// E1: a calc receipt names the continuous-UTC rule's time-basis id when any of
// its instants lies after the IERS table on the "continuous-utc" basis, as
// createNatalEnvelope chooses its conventions set by the chart's basis; every
// other receipt keeps the id it has always carried, so that it replays.
//
// E2: a search window is checked in order on the scale it was given on before
// it is converted, and again once converted; a 1 ms UT1 window across the end
// of the IERS table, which converts to TT backwards, is refused with a
// RangeError that says where the time basis steps back.
//
// These pin the engine's own behaviour: they are regression tests, not
// accuracy evidence.
import { describe, expect, it } from "vitest";

import { calc, chart, events, houses, searchLunations, searchStations } from "./calc.js";
import type { CalcRefusal, CalcTime } from "./calc.js";
import { NATAL_RECEIPT_CONVENTION_SETS } from "./receipt.js";
import { timeBasis } from "./time-scale.js";
import { UT1_TO_MS } from "./time-scale-data.js";

const LEGACY_ID = "time:tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise";
const CONTINUOUS_ID =
  "time:tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;tt-utc-plus-69.184s-and-ut1-from-delta-t-model-after;delta-t-model-before-1972";

const J2000_JD = 2_451_545;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** 2027-10-02T00:00:00Z: the end of the IERS table. */
const SEAM = UT1_TO_MS;
const jd = (ms: number, scale: "utc" | "ut1" | "tt"): CalcTime => ({ jd: J2000_JD + (ms - J2000_MS) / DAY_MS, scale });
const iso = (ms: number): string => new Date(ms).toISOString();

const PLACE = { latitude: 51.48, longitude: 0 };
const BEFORE = "2026-06-01T12:00:00Z";
const AFTER = "2028-03-01T12:00:00Z";

type WithReceipt = { status: "ok"; receipt: { conventions: readonly string[]; instants: readonly { timeScale: { basis: string } }[] } };
function ok<T>(result: T | CalcRefusal): T & WithReceipt {
  if ((result as { status: string }).status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return result as T & WithReceipt;
}
const timeIds = (result: WithReceipt): string[] => result.receipt.conventions.filter((id) => id.startsWith("time:tt-"));

describe("E1: the time-basis id on calc receipts", () => {
  it("are the natal receipt sets' own time-basis ids, less the natal record's in-result", () => {
    const named = new Set(NATAL_RECEIPT_CONVENTION_SETS.map((set) => set.timeScale).filter((id) => id !== undefined));
    expect(named).toContain(`${LEGACY_ID.slice("time:".length)};in-result`);
    expect(named).toContain(`${CONTINUOUS_ID.slice("time:".length)};in-result`);
  });

  it("names the continuous-UTC rule on calc() after the IERS table, on every scale", () => {
    for (const time of [AFTER, jd(Date.parse(AFTER), "utc"), jd(Date.parse(AFTER), "ut1"), jd(Date.parse(AFTER), "tt")] as CalcTime[]) {
      const result = ok(calc({ body: "Mars", time }));
      expect(result.receipt.instants[0]!.timeScale.basis).toBe("continuous-utc");
      expect(timeIds(result)).toEqual([CONTINUOUS_ID]);
    }
  });

  it("keeps the legacy id on calc() on or before the table's end, so that earlier receipts replay", () => {
    for (const time of [BEFORE, "1990-05-03T08:30:00Z", "1900-01-01T00:00:00Z", iso(SEAM), jd(SEAM, "ut1")] as CalcTime[]) {
      const result = ok(calc({ body: "Mars", time }));
      expect(result.receipt.instants[0]!.timeScale.basis).not.toBe("continuous-utc");
      expect(timeIds(result)).toEqual([LEGACY_ID]);
    }
  });

  it("keeps the legacy id for a pinned ΔT after the table, whose basis is pinned", () => {
    const result = ok(calc({ body: "Mars", time: { iso: AFTER, deltaT: 70 } }));
    expect(result.receipt.instants[0]!.timeScale.basis).toBe("pinned");
    expect(result.receipt.conventions).toContain("deltat:pinned");
    expect(timeIds(result)).toEqual([LEGACY_ID]);
  });

  it("switches at the first millisecond after the table", () => {
    expect(timeIds(ok(calc({ body: "Sun", time: iso(SEAM) })))).toEqual([LEGACY_ID]);
    expect(timeIds(ok(calc({ body: "Sun", time: iso(SEAM + 1) })))).toEqual([CONTINUOUS_ID]);
  });

  it("names the rule on houses() and chart() after the table, and not before", () => {
    expect(timeIds(ok(houses({ time: AFTER, place: PLACE })))).toEqual([CONTINUOUS_ID]);
    expect(timeIds(ok(houses({ time: BEFORE, place: PLACE })))).toEqual([LEGACY_ID]);
    expect(timeIds(ok(chart({ time: AFTER, place: PLACE })))).toEqual([CONTINUOUS_ID]);
    expect(timeIds(ok(chart({ time: BEFORE, place: PLACE })))).toEqual([LEGACY_ID]);
  });

  it("names the rule on events() when either end lies after the table", () => {
    const search = (from: string, to: string) =>
      ok(events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from, to }));
    expect(timeIds(search("2028-01-01T00:00:00Z", "2028-12-31T00:00:00Z"))).toEqual([CONTINUOUS_ID]);
    expect(timeIds(search("2027-01-01T00:00:00Z", "2027-12-31T00:00:00Z"))).toEqual([CONTINUOUS_ID]);
    expect(timeIds(search("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z"))).toEqual([LEGACY_ID]);
  });

  it("names the rule on searchStations() and searchLunations() when either end lies after the table", () => {
    const window = (from: string, to: string) => ({ from, to });
    for (const [from, to, id] of [
      ["2028-01-01T00:00:00Z", "2028-03-01T00:00:00Z", CONTINUOUS_ID],
      ["2027-09-01T00:00:00Z", "2027-11-01T00:00:00Z", CONTINUOUS_ID],
      ["2026-01-01T00:00:00Z", "2026-03-01T00:00:00Z", LEGACY_ID]
    ] as const) {
      expect(timeIds(ok(searchStations({ body: "Mercury", ...window(from, to) })))).toEqual([id]);
      expect(timeIds(ok(searchLunations({ phaseDegrees: 180, ...window(from, to) })))).toEqual([id]);
    }
  });

  it("replays: a receipt's own request gives the same conventions again", () => {
    const first = ok(calc({ body: "Moon", time: AFTER }));
    const again = ok(calc(first.receipt.request as never));
    expect(again.receipt.conventions).toEqual(first.receipt.conventions);
    const lunations = ok(searchLunations({ phaseDegrees: 0, from: "2027-09-01T00:00:00Z", to: "2027-11-01T00:00:00Z" }));
    const replayed = ok(searchLunations(JSON.parse(JSON.stringify(lunations.receipt.request))));
    expect(replayed.receipt.conventions).toEqual(lunations.receipt.conventions);
  });

  it("carries the time-basis id once, after the ΔT id", () => {
    const { conventions } = ok(calc({ body: "Venus", time: AFTER })).receipt;
    expect(conventions.filter((id) => id.startsWith("time:tt-"))).toHaveLength(1);
    expect(conventions.indexOf(CONTINUOUS_ID)).toBe(conventions.indexOf("deltat:time-basis") + 1);
  });
});

describe("E2: search windows across a step of the time basis", () => {
  it("has TT step back by 1 ms on UT1 input at the end of the IERS table", () => {
    // The step the refusal guards against: the last table millisecond and the first after it, on UT1.
    const tt = (ms: number) => Math.round(J2000_MS + timeBasis(ms, "ut1").ttDays * DAY_MS);
    expect(timeBasis(SEAM, "ut1").timeScale.basis).toBe("iers");
    expect(timeBasis(SEAM + 1, "ut1").timeScale.basis).toBe("continuous-utc");
    expect(tt(SEAM) - tt(SEAM + 1)).toBe(1);
  });

  const searches = {
    searchStations: (from: CalcTime, to: CalcTime) => searchStations({ body: "Mars", from, to }),
    searchLunations: (from: CalcTime, to: CalcTime) => searchLunations({ phaseDegrees: 0, from, to }),
    events: (from: CalcTime, to: CalcTime) => events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from, to })
  };

  for (const [name, search] of Object.entries(searches)) {
    describe(name, () => {
      it("refuses a 1 ms UT1 window across the table's end with a RangeError that names the step", () => {
        let thrown: unknown;
        try {
          search(jd(SEAM, "ut1"), jd(SEAM + 1, "ut1"));
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(RangeError);
        const message = (thrown as Error).message;
        expect(message).toMatch(/^The search window is in order on ut1 but reversed once converted, where the time basis steps back /u);
        expect(message).toMatch(/at the end of the IERS table, 2027-10-02/u);
        expect(message).toMatch(/Give both ends on tt\.$/u);
      });

      it("still runs UT1 windows across the table's end that convert in order", () => {
        expect(ok(search(jd(SEAM - 1, "ut1"), jd(SEAM + 1, "ut1"))).status).toBe("ok");
        expect(ok(search(jd(SEAM - HOUR_MS, "ut1"), jd(SEAM + HOUR_MS, "ut1"))).status).toBe("ok");
        expect(ok(search(jd(SEAM - 1, "ut1"), jd(SEAM, "ut1"))).status).toBe("ok");
        expect(ok(search(jd(SEAM + 1, "ut1"), jd(SEAM + 2, "ut1"))).status).toBe("ok");
      });

      it("runs the same window given on TT and on UTC", () => {
        expect(ok(search(jd(SEAM, "tt"), jd(SEAM + 1, "tt"))).status).toBe("ok");
        expect(ok(search(iso(SEAM), iso(SEAM + 1))).status).toBe("ok");
      });

      it("refuses a reversed window on one scale before converting it", () => {
        // Both ends lie far outside the span, where a conversion would give the out-of-range refusal:
        // a RangeError shows the order was checked first, on the input's own scale.
        for (const [from, to, scale] of [
          ["3000-01-02T00:00:00Z", "3000-01-01T00:00:00Z", "utc"],
          [jd(Date.parse("3000-01-02T00:00:00Z"), "tt"), jd(Date.parse("3000-01-01T00:00:00Z"), "tt"), "tt"],
          [jd(SEAM + 5, "ut1"), jd(SEAM, "ut1"), "ut1"]
        ] as const) {
          expect(() => search(from, to), scale).toThrowError(/^The search window must have from <= to\.$/u);
        }
      });

      it("refuses a window whose ends, on different scales, convert reversed", () => {
        // 2028-01-01T00:00:00 on TT is about 69 s before the same label on UTC.
        const at = Date.parse("2028-01-01T00:00:00Z");
        expect(() => search(iso(at), jd(at + 1000, "tt"))).toThrowError(/^The search window must have from <= to\.$/u);
        expect(ok(search(jd(at + 1000, "tt"), iso(at))).status).toBe("ok");
      });

      it("keeps a zero-length window on one scale", () => {
        expect(ok(search(jd(SEAM, "ut1"), jd(SEAM, "ut1"))).status).toBe("ok");
      });
    });
  }
});
