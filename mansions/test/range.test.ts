import { afterEach, describe, expect, it, vi } from "vitest";
import { calc, CALC_SPAN } from "../../src/calc.js";
import type { CalcRefusal } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import { EQUAL28_ARIES_V1, mansionAt, mansionRange } from "../src/index.js";
import type { MansionRangeRequest, MansionRangeResult } from "../src/index.js";

// Invented instants. Synthetic motion supplies independent arithmetic checks;
// real-engine calls below are integration and replay checks only.
const ISO = "2001-02-03T00:00:00.000Z";
const START = Date.parse(ISO);
const DAY = 86_400_000;
const TABLE = "equal28-aries-v1";
const iso = (elapsed: number) => new Date(START + elapsed).toISOString();
const request = (from = 0, to = DAY, maxSamples?: number): MansionRangeRequest => ({
  from: iso(from), to: iso(to), table: TABLE,
  ...(maxSamples === undefined ? {} : { maxSamples })
});
const complete = (result: ReturnType<typeof mansionRange>): MansionRangeResult => {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
};

function syntheticMotion(longitude: (elapsed: number) => number) {
  const template = engine.tropicalMoon(ISO);
  if (template.status !== "ok") throw new Error("Unexpected engine refusal");
  // Receipts in synthetic tests are scaffolding, never independent ephemeris
  // evidence. Only the real-engine tests below assert receipt replay.
  return vi.spyOn(engine, "tropicalMoon").mockImplementation((time) => {
    if (!(time instanceof Date)) throw new Error("Range must sample UTC Dates");
    const at = time.toISOString();
    return {
      ...template,
      lon: ((longitude(time.getTime() - START) % 360) + 360) % 360,
      receipt: {
        ...template.receipt,
        request: { ...template.receipt.request, time: { iso: at } },
        instants: [{ ...template.receipt.instants[0]!, utc: at }]
      }
    };
  });
}

afterEach(() => vi.restoreAllMocks());

describe("hand-derived occupancy intervals", () => {
  it("partitions a full circuit and wrap at independent rational ingress times", () => {
    syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const result = complete(mansionRange(request(0, 30 * DAY)));
    // lambda = 14*t/DAY; boundary k = 90*k/7, so t = 90*k*DAY/98.
    const edges = [0];
    for (let k = 1n; k <= 32n; k += 1n) {
      edges.push(Number((k * 90n * BigInt(DAY) + 97n) / 98n));
    }
    edges.push(30 * DAY);
    expect(result.intervals).toHaveLength(edges.length - 1);
    expect(result.endpointConvention).toBe("[from,to)");
    expect(result.table).toBe(EQUAL28_ARIES_V1);
    expect(result.zodiac).toBe("tropical");
    result.intervals.forEach((interval, index) => {
      expect(interval.start).toBe(iso(edges[index]!));
      expect(interval.end).toBe(iso(edges[index + 1]!));
      expect(interval.mansion).toBe(EQUAL28_ARIES_V1.mansions[index % 28]);
      expect(interval.startClipped).toBe(index === 0);
      expect(interval.endClipped).toBe(index === result.intervals.length - 1);
      expect(interval.startPosition.at).toBe(interval.start);
      expect(interval.endPosition.at).toBe(interval.end);
      expect(interval.startPosition.mansion).toBe(interval.mansion);
      if (index > 0) {
        expect(interval.entry).toBe(result.intervals[index - 1]!.exit);
        expect(interval.entry).toBe(interval.startPosition);
      } else expect(interval.entry).toBeNull();
      if (interval.exit) {
        expect(interval.exit).toBe(interval.endPosition);
        expect(interval.exit.previous.mansion).toBe(interval.mansion);
        expect(interval.exit.previous.at).toBe(iso(edges[index + 1]! - 1));
      } else expect(interval.endPosition.mansion).toBe(interval.mansion);
      for (const elapsed of [edges[index]!, edges[index + 1]! - 1]) {
        expect(mansionAt({ time: new Date(START + elapsed), table: TABLE }))
          .toMatchObject({ mansion: interval.mansion });
      }
    });
    expect(result.intervals[27]!.mansion.index).toBe(28);
    expect(result.intervals[28]!.mansion.index).toBe(1);
  });

  it("returns one clipped interval when no ingress occurs", () => {
    syntheticMotion(() => 20);
    const result = complete(mansionRange(request()));
    expect(result.intervals).toHaveLength(1);
    expect(result.intervals[0]).toMatchObject({
      start: ISO, end: iso(DAY), mansion: { index: 2 },
      startClipped: true, endClipped: true, entry: null, exit: null,
      startPosition: { longitude: 20 }, endPosition: { longitude: 20 }
    });
    expect(result.intervals[0]!.startPosition.receipt).toBe(result.receipts.from);
    expect(result.intervals[0]!.endPosition.receipt).toBe(result.receipts.to);
  });

  it("keeps empty ranges empty while validating and recording their instant", () => {
    const sample = syntheticMotion(() => 90);
    const result = complete(mansionRange(request(0, 0, 1)));
    expect(result.intervals).toEqual([]);
    expect(result.samples).toBe(1);
    expect(sample).toHaveBeenCalledTimes(1);
    expect(result.receipts.from).toBe(result.receipts.to);
    expect(result.receipts.from.instants[0]!.utc).toBe(ISO);
  });

  it("includes the starting mansion and excludes the mansion entered exactly at to", () => {
    syntheticMotion((elapsed) => 90 * elapsed / DAY);
    const result = complete(mansionRange(request(0, DAY)));
    expect(result.intervals.map((interval) => interval.mansion.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const last = result.intervals.at(-1)!;
    expect(last.end).toBe(iso(DAY));
    expect(last.endClipped).toBe(false);
    expect(last.exit?.mansion.index).toBe(8);
    expect(last.endPosition.mansion.index).toBe(8);
    const right = complete(mansionRange(request(DAY, DAY + 1)));
    expect(right.intervals).toHaveLength(1);
    expect(right.intervals[0]).toMatchObject({
      start: iso(DAY), end: iso(DAY + 1), mansion: { index: 8 },
      startClipped: true, entry: null
    });
  });

  it("partitions adjacent windows at a rounded ingress without a gap or duplicate occupancy", () => {
    syntheticMotion((elapsed) => 14 * elapsed / DAY);
    // First boundary time is ceil(90*DAY/98), independent of solver output.
    const edge = Number((90n * BigInt(DAY) + 97n) / 98n);
    const whole = complete(mansionRange(request(0, 2 * DAY)));
    const left = complete(mansionRange(request(0, edge)));
    const right = complete(mansionRange(request(edge, 2 * DAY)));
    const spans = (result: MansionRangeResult) => result.intervals.map(({ start, end, mansion }) => ({
      start, end, index: mansion.index
    }));
    expect([...spans(left), ...spans(right)]).toEqual(spans(whole));
    expect(left.intervals.at(-1)!.exit?.at).toBe(iso(edge));
    expect(right.intervals[0]!.startClipped).toBe(true);
    expect(right.intervals[0]!.entry).toBeNull();
    const tiny = complete(mansionRange(request(edge - 1, edge)));
    expect(tiny.intervals).toHaveLength(1);
    expect(tiny.intervals[0]).toMatchObject({
      start: iso(edge - 1), end: iso(edge), mansion: { index: 1 }, endClipped: false
    });
  });

  it("clips an interval split away from an ingress without searching for external boundaries", () => {
    const sample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const left = complete(mansionRange(request(0, DAY / 2)));
    const right = complete(mansionRange(request(DAY / 2, DAY)));
    expect(left.intervals.at(-1)!.end).toBe(right.intervals[0]!.start);
    expect(left.intervals.at(-1)!.endClipped).toBe(true);
    expect(right.intervals[0]!.startClipped).toBe(true);
    expect(left.intervals.at(-1)!.mansion).toBe(right.intervals[0]!.mansion);
    for (const [time] of sample.mock.calls) {
      expect((time as Date).getTime()).toBeGreaterThanOrEqual(START);
      expect((time as Date).getTime()).toBeLessThanOrEqual(START + DAY);
    }
  });

  it("retains reverse ingress direction and exact boundary membership", () => {
    syntheticMotion((elapsed) => 91 - 2 * elapsed / DAY);
    const result = complete(mansionRange(request()));
    expect(result.intervals.map(({ mansion }) => mansion.index)).toEqual([8, 7]);
    expect(result.intervals[0]!.end).toBe(iso(DAY / 2 + 1));
    expect(result.intervals[0]!.exit?.direction).toBe("retrograde");
    expect(result.intervals[1]!.entry).toBe(result.intervals[0]!.exit);
  });
});

describe("range receipts, bounded work and refusals", () => {
  it("preserves replayable engine samples at every interval edge (regression only)", () => {
    const result = complete(mansionRange(request(0, 3 * DAY)));
    expect(result.intervals.length).toBeGreaterThan(1);
    expect(result.receipts.from.instants[0]!.utc).toBe(ISO);
    expect(result.receipts.to.instants[0]!.utc).toBe(iso(3 * DAY));
    for (const interval of result.intervals) {
      for (const position of [interval.startPosition, interval.endPosition, interval.exit?.previous]) {
        if (!position) continue;
        const encoded = JSON.parse(JSON.stringify(position));
        expect(calc(encoded.receipt.request)).toMatchObject({
          status: "ok", lon: position.longitude, bounds: position.bounds, receipt: position.receipt
        });
        expect(position.receipt.instants[0]!.utc).toBe(position.at);
      }
      const inside = mansionAt({ time: new Date(Date.parse(interval.end) - 1), table: TABLE });
      expect(inside).toMatchObject({ status: "ok", mansion: interval.mansion });
    }
  });

  it("shares the ingress budget without additional endpoint or interval evaluations", () => {
    const sample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const result = complete(mansionRange(request()));
    expect(result.samples).toBe(sample.mock.calls.length);
    const times = sample.mock.calls.map(([time]) => (time as Date).getTime());
    expect(new Set(times).size).toBe(times.length);
    sample.mockClear();
    expect(complete(mansionRange(request(0, DAY, result.samples)))).toEqual({
      ...result, maxSamples: result.samples
    });
    expect(sample).toHaveBeenCalledTimes(result.samples);
    sample.mockClear();
    const refused = mansionRange(request(0, DAY, result.samples - 1));
    expect(refused).toMatchObject({ status: "refused", reason: "sample-budget", samples: result.samples - 1 });
    expect(refused).not.toHaveProperty("intervals");
    expect(sample).toHaveBeenCalledTimes(result.samples - 1);
  });

  it("passes through engine coverage and interior refusals without partial intervals", () => {
    expect(mansionRange({ from: "1701-02-03", to: "1701-02-03", table: TABLE }))
      .toMatchObject({ status: "refused", reason: "out-of-range" });
    const refusal: CalcRefusal = {
      status: "refused", reason: "out-of-range", span: CALC_SPAN, detail: "Synthetic refusal"
    };
    vi.spyOn(engine, "tropicalMoon").mockReturnValueOnce(refusal);
    expect(mansionRange(request())).toBe(refusal);
    vi.restoreAllMocks();
    const sample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const original = sample.getMockImplementation()!;
    sample.mockImplementation((time) => (time as Date).getTime() === START + DAY / 4
      ? refusal : original(time));
    expect(mansionRange(request())).toBe(refusal);
  });

  it("refuses detected occupancy disagreements if a solver loses one or all interior ingresses", () => {
    for (const omitAll of [false, true]) {
      vi.restoreAllMocks();
      syntheticMotion((elapsed) => 14 * elapsed / DAY);
      const solver = engine.searchLongitudeCrossingsWith;
      vi.spyOn(engine, "searchLongitudeCrossingsWith").mockImplementation(
        (longitudeAt, body, longitude, from, to, options) => omitAll || longitude === 90 / 7
          ? { status: "complete", crossings: [], samples: 0 }
          : solver(longitudeAt, body, longitude, from, to, options)
      );
      const result = mansionRange(request(0, 2 * DAY));
      expect(result).toMatchObject({ status: "refused", reason: "unsupported-combination" });
      expect(result).not.toHaveProperty("intervals");
    }
  });

  it("uses the search's strict validation and propagates calculation errors", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    const invalid: unknown[] = [
      undefined, null, {}, { from: ISO, to: iso(DAY) }, request(DAY, 0),
      request(0, 367 * DAY), { ...request(), to: "2001-02-30" },
      { ...request(), from: { iso: ISO } }, { ...request(), maxSamples: 0 },
      { ...request(), table: "other-v1" }, { ...request(), zodiac: "sidereal" }
    ];
    for (const input of invalid) {
      expect(() => mansionRange(input as MansionRangeRequest)).toThrow(RangeError);
    }
    expect(sample).not.toHaveBeenCalled();
    const error = new Error("Synthetic calculation error");
    sample.mockImplementationOnce(() => { throw error; });
    expect(() => mansionRange(request())).toThrow(error);
  });

  it("copies Date endpoints and normalizes ISO offsets without mutating inputs", () => {
    syntheticMotion(() => 20);
    const from = new Date(ISO);
    const to = new Date(START + DAY);
    const input = Object.freeze({ from, to, table: TABLE });
    const result = complete(mansionRange(input));
    expect(result.from).toBe(ISO);
    expect(result.to).toBe(iso(DAY));
    expect(from.toISOString()).toBe(ISO);
    expect(to.toISOString()).toBe(iso(DAY));
    expect(mansionRange({ from: "2001-02-03", to: "2001-02-04T02:00+02:00", table: TABLE }))
      .toEqual(result);
  });
});
