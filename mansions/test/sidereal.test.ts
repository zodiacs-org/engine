import { afterEach, describe, expect, it, vi } from "vitest";
import { calc, CALC_AYANAMSAS } from "../../src/calc.js";
import type { CalcPosition, CalcRefusal, CalcTime } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import {
  classifyLongitude, MANSION_AYANAMSAS, mansionAt, mansionIngresses, mansionRange
} from "../src/index.js";
import type { MansionAtRequest, MansionAtResult, MansionIngressRequest, MansionZodiac } from "../src/index.js";

// Invented instants only. Engine comparisons are integration/regression
// checks, not independent astronomical ingress or physical-accuracy evidence.
const ISO = "2001-02-03T00:00:00.000Z";
const START = Date.parse(ISO);
const DAY = 86_400_000;
const TABLE = "equal28-aries-v1";
const ZODIAC = Object.freeze({ sidereal: "lahiri" } as const);
const atRequest = (time: CalcTime = ISO): MansionAtRequest => ({ time, table: TABLE, zodiac: ZODIAC });
const iso = (elapsed: number) => new Date(START + elapsed).toISOString();
const windowRequest = (days = 3): MansionIngressRequest => ({ from: ISO, to: iso(days * DAY), table: TABLE, zodiac: ZODIAC });
const complete = <T extends { readonly status: "ok" }>(value: T | CalcRefusal): T => {
  if (value.status !== "ok") throw new Error(`Unexpected refusal: ${value.reason}`);
  return value;
};

function checkReplay(position: MansionAtResult) {
  const encoded = JSON.parse(JSON.stringify(position)) as typeof position;
  const selected = complete(calc(encoded.receipt.request));
  const tropical = complete(calc(encoded.tropicalReceipt.request));
  expect(selected.lon).toBe(position.longitude);
  expect(selected.ayanamsa).toEqual(position.ayanamsa);
  expect(selected.bounds).toEqual(position.bounds);
  expect(selected.receipt).toEqual(position.receipt);
  expect(tropical.lon).toBe(position.tropicalLongitude);
  expect(tropical.bounds).toEqual(position.tropicalBounds);
  expect(tropical.receipt).toEqual(position.tropicalReceipt);
  expect(selected.receipt.instants).toEqual(tropical.receipt.instants);
  expect(position.mansion).toBe(classifyLongitude(selected.lon, TABLE).mansion);
}

afterEach(() => vi.restoreAllMocks());

describe("explicit engine sidereal selection", () => {
  it("offers the engine built-ins and retains both zodiac calculations for each choice", () => {
    expect(MANSION_AYANAMSAS).toEqual(CALC_AYANAMSAS);
    expect(Object.isFrozen(MANSION_AYANAMSAS)).toBe(true);
    for (const sidereal of MANSION_AYANAMSAS) {
      const selected = complete(engine.siderealMoon(ISO, sidereal));
      const sample = vi.spyOn(engine, "siderealMoon").mockReturnValueOnce(selected);
      const result = complete(mansionAt({ ...atRequest(), zodiac: { sidereal } }));
      expect(result.zodiac).toEqual({ sidereal });
      expect(result.ayanamsa).toBe(selected.ayanamsa);
      expect(result.bounds).toBe(selected.bounds);
      expect(result.receipt).toBe(selected.receipt);
      expect(result.ayanamsa).toMatchObject({ name: sidereal, subtracted: "true" });
      expect(result.receipt.conventions).toContain(`ayanamsa:${sidereal}`);
      expect(result.receipt.conventions).toContain("zodiac:sidereal");
      expect(result.tropicalReceipt.conventions).toContain("zodiac:tropical");
      checkReplay(result);
      sample.mockRestore();
    }
  });

  it("keeps the engine clock and original time input for both evaluations", () => {
    const times: CalcTime[] = [
      new Date(ISO), "2001-02-03T02:00:00+02:00", { iso: ISO, deltaT: 70 },
      ...(["utc", "ut1", "tt"] as const).map((scale) => ({ jd: 2451943.5, scale, deltaT: 64 }))
    ];
    for (const time of times) checkReplay(complete(mansionAt(atRequest(time))));
  });

  it("keeps tropical as the existing default, with shared receipt and bounds references", () => {
    const implicit = complete(mansionAt({ time: ISO, table: TABLE }));
    const explicit = complete(mansionAt({ time: ISO, table: TABLE, zodiac: "tropical" }));
    expect(explicit).toEqual(implicit);
    expect(implicit.ayanamsa).toBeNull();
    expect(implicit.tropicalLongitude).toBe(implicit.longitude);
    expect(implicit.tropicalBounds).toBe(implicit.bounds);
    expect(implicit.tropicalReceipt).toBe(implicit.receipt);
  });

  it("rejects missing, unknown, custom or malformed sidereal selections before calculation", () => {
    const tropical = vi.spyOn(engine, "tropicalMoon");
    const sidereal = vi.spyOn(engine, "siderealMoon");
    const invalid: unknown[] = [
      null, false, "sidereal", "lahiri", [], {}, new Date(ISO),
      { sidereal: undefined }, { sidereal: null }, { sidereal: "Lahiri" },
      { sidereal: "unknown" }, { sidereal: { epoch: ISO, value: 24, rate: 0 } },
      { sidereal: "lahiri", extra: true }, { sidereal: "lahiri", [Symbol("extra")]: 1 },
      Object.create({ sidereal: "lahiri" }),
      Object.defineProperty({}, "sidereal", { enumerable: true, get() { throw new Error("Do not invoke getter"); } })
    ];
    for (const zodiac of invalid) {
      const value = zodiac as MansionZodiac;
      expect(() => mansionAt({ ...atRequest(), zodiac: value })).toThrow(RangeError);
      expect(() => mansionIngresses({ ...windowRequest(), zodiac: value })).toThrow(RangeError);
      expect(() => mansionRange({ ...windowRequest(), zodiac: value })).toThrow(RangeError);
    }
    expect(tropical).not.toHaveBeenCalled();
    expect(sidereal).not.toHaveBeenCalled();
  });

  it("snapshots zodiac selection without mutating or retaining caller objects", () => {
    const zodiac = { sidereal: "lahiri" } as const;
    const time = new Date(ISO);
    const input = Object.freeze({ ...atRequest(time), zodiac });
    const result = complete(mansionAt(input));
    expect(result.zodiac).not.toBe(zodiac);
    expect(Object.isFrozen(result.zodiac)).toBe(true);
    expect(zodiac).toEqual(ZODIAC);
    expect(time.toISOString()).toBe(ISO);
    expect(mansionAt(input)).toEqual(result);
    const other = complete(mansionAt({ ...input, zodiac: { sidereal: "raman" } }));
    expect(other.longitude).not.toBe(result.longitude);
    expect(other.tropicalLongitude).toBe(result.tropicalLongitude);
  });
});

describe("sidereal ingress and occupancy integration", () => {
  it("uses the selected zodiac at adjacent changed milliseconds and replays both receipts", () => {
    const request = windowRequest();
    const ingresses = complete(mansionIngresses(request));
    const range = complete(mansionRange(request));
    expect(ingresses.ingresses.length).toBeGreaterThan(0);
    expect(range.zodiac).toEqual(ZODIAC);
    expect(ingresses.zodiac).toEqual(ZODIAC);
    expect(range.samples).toBe(ingresses.samples);
    expect(range.receipts).toEqual(ingresses.receipts);
    expect(range.tropicalReceipts).toEqual(ingresses.tropicalReceipts);
    expect(ingresses.tropicalReceipts.from).toEqual(complete(engine.tropicalMoon(ISO)).receipt);
    expect(ingresses.receipts.from).toEqual(complete(engine.siderealMoon(ISO, "lahiri")).receipt);
    for (const ingress of ingresses.ingresses) {
      expect(ingress).toMatchObject(complete(mansionAt(atRequest(ingress.at))));
      expect(ingress.previous).toEqual(complete(mansionAt(atRequest(new Date(Date.parse(ingress.at) - 1)))));
      expect(ingress.mansion).not.toBe(ingress.previous.mansion);
      checkReplay(ingress);
      checkReplay(ingress.previous);
    }
    for (const interval of range.intervals) {
      checkReplay(interval.startPosition);
      checkReplay(interval.endPosition);
      expect(interval.mansion).toBe(interval.startPosition.mansion);
    }
    const tropical = complete(mansionIngresses({ ...request, zodiac: "tropical" }));
    expect(ingresses.ingresses.map((row) => row.at)).not.toEqual(tropical.ingresses.map((row) => row.at));
  });

  it("retains empty-window receipts in both zodiacs and charges every actual engine call", () => {
    const tropical = vi.spyOn(engine, "tropicalMoon");
    const sidereal = vi.spyOn(engine, "siderealMoon");
    const empty = complete(mansionRange({ ...windowRequest(0), maxSamples: 2 }));
    expect(empty.samples).toBe(2);
    expect(tropical).toHaveBeenCalledTimes(1);
    expect(sidereal).toHaveBeenCalledTimes(1);
    expect(empty.intervals).toEqual([]);
    expect(empty.receipts.from).toBe(empty.receipts.to);
    expect(empty.tropicalReceipts.from).toBe(empty.tropicalReceipts.to);
    expect(empty.receipts.from).not.toBe(empty.tropicalReceipts.from);
    for (const maxSamples of [1, 2, 3, 17]) {
      tropical.mockClear();
      sidereal.mockClear();
      const result = mansionRange({ ...windowRequest(), maxSamples });
      expect(result).toMatchObject({ status: "refused", reason: "sample-budget", samples: maxSamples, maxSamples });
      expect(tropical.mock.calls.length + sidereal.mock.calls.length).toBe(maxSamples);
      expect(result).not.toHaveProperty("intervals");
      expect(result).not.toHaveProperty("receipts");
    }
    tropical.mockClear();
    sidereal.mockClear();
    const result = complete(mansionRange(windowRequest()));
    expect(result.samples).toBe(tropical.mock.calls.length + sidereal.mock.calls.length);
  });

  it("passes engine refusals and errors through without partial sidereal or tropical results", () => {
    const refusal: CalcRefusal = { status: "refused", reason: "unsupported-combination", detail: "Synthetic refusal" };
    const sidereal = vi.spyOn(engine, "siderealMoon").mockReturnValue(refusal);
    expect(mansionAt(atRequest())).toBe(refusal);
    expect(mansionIngresses(windowRequest())).toBe(refusal);
    expect(mansionRange(windowRequest())).toBe(refusal);
    sidereal.mockClear();
    expect(mansionAt(atRequest("1701-02-03"))).toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(sidereal).not.toHaveBeenCalled();
    const error = new Error("Synthetic sidereal engine error");
    sidereal.mockImplementation(() => { throw error; });
    expect(() => mansionAt(atRequest())).toThrow(error);
    expect(() => mansionRange(windowRequest())).toThrow(error);
  });
});

// Hand-derived motion: tropical = 24 + 14*t/DAY, true ayanamsa = 24 + t/DAY,
// selected longitude = 13*t/DAY. Mocks test search wiring and arithmetic only;
// their synthetic receipt scaffolding is never used as replay/accuracy evidence.
function syntheticSidereal(direction: 1 | -1) {
  const tropical = complete(engine.tropicalMoon(ISO));
  const selected = complete(engine.siderealMoon(ISO, "lahiri"));
  const wrap = (value: number) => ((value % 360) + 360) % 360;
  const position = (template: CalcPosition, time: CalcTime, sidereal: boolean): CalcPosition => {
    if (!(time instanceof Date)) throw new Error("Expected UTC Date sample");
    const days = (time.getTime() - START) / DAY;
    return {
      ...template,
      lon: wrap(sidereal ? direction * 13 * days : 24 + direction * 14 * days),
      ayanamsa: sidereal ? { ...selected.ayanamsa!, true: 24 + direction * days } : null,
      receipt: {
        ...template.receipt, request: { ...template.receipt.request, time: { iso: time.toISOString() } },
        instants: [{ ...template.receipt.instants[0]!, utc: time.toISOString() }]
      }
    };
  };
  vi.spyOn(engine, "tropicalMoon").mockImplementation((time) => position(tropical, time, false));
  vi.spyOn(engine, "siderealMoon").mockImplementation((time) => position(selected, time, true));
}

describe("independent equal-segment arithmetic with varying synthetic ayanamsa", () => {
  it("finds a circle and wrap from selected longitude rather than a fixed tropical offset", () => {
    syntheticSidereal(1);
    const ingresses = complete(mansionIngresses(windowRequest(30)));
    // t(k) = k*90*DAY/91; integer ceil by independent exact arithmetic.
    expect(ingresses.ingresses).toHaveLength(30);
    ingresses.ingresses.forEach((ingress, index) => {
      const ms = Number((BigInt(index + 1) * 90n * BigInt(DAY) + 90n) / 91n);
      expect(ingress.at).toBe(iso(ms));
      expect(ingress.previous.at).toBe(iso(ms - 1));
      expect(ingress.mansion.index).toBe((index + 1) % 28 + 1);
      expect(ingress.direction).toBe("direct");
      expect(ingress.ayanamsa!.true).toBe(24 + ms / DAY);
      expect(ingress.tropicalLongitude).not.toBe(ingress.longitude);
    });
    const range = complete(mansionRange(windowRequest(30)));
    expect(range.intervals).toHaveLength(31);
    expect(range.intervals.map((row) => row.start)).toEqual([ISO, ...ingresses.ingresses.map((row) => row.at)]);
    expect(range.intervals.at(-1)!.end).toBe(iso(30 * DAY));
    const edge = ingresses.ingresses[0]!.at;
    expect(complete(mansionIngresses({ ...windowRequest(), to: edge })).ingresses).toEqual([ingresses.ingresses[0]]);
    expect(complete(mansionIngresses({ ...windowRequest(), from: edge })).ingresses.every((row) => row.at > edge)).toBe(true);
  });

  it("preserves reverse boundary membership and clips the initial wrap", () => {
    syntheticSidereal(-1);
    const result = complete(mansionIngresses(windowRequest(3)));
    expect(result.ingresses).toHaveLength(4);
    expect(result.ingresses[0]!.at).toBe(iso(1));
    expect(result.ingresses[0]!.previous.mansion.index).toBe(1);
    result.ingresses.forEach((ingress, index) => {
      expect(ingress.direction).toBe("retrograde");
      expect(ingress.mansion.index).toBe(28 - index);
      expect(ingress.boundary).toBe(ingress.previous.mansion.start);
      if (index > 0) {
        const firstMs = Number((BigInt(index) * 90n * BigInt(DAY)) / 91n) + 1;
        expect(ingress.at).toBe(iso(firstMs));
      }
    });
    const range = complete(mansionRange(windowRequest(3)));
    expect(range.intervals[0]!.start).toBe(ISO);
    expect(range.intervals[0]!.end).toBe(iso(1));
    expect(range.intervals[0]!.startClipped).toBe(true);
    expect(range.intervals.map((row) => row.mansion.index)).toEqual([1, 28, 27, 26, 25]);
  });
});
