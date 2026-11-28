import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import type { CalcRefusal } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import {
  EQUAL28_ARIES_V1, INGRESS_SEARCH_LIMITS, mansionAt, mansionIngresses
} from "../src/index.js";
import type { MansionIngressRequest, MansionIngressResult } from "../src/index.js";

// Invented instants. Engine comparisons below establish numerical behavior,
// not accuracy against an independent ephemeris or a published ingress.
const ISO = "2001-02-03T00:00:00.000Z";
const START = Date.parse(ISO);
const DAY = 86_400_000;
const TABLE = "equal28-aries-v1";
const iso = (elapsed: number) => new Date(START + elapsed).toISOString();
const request = (from = 0, to = DAY, maxSamples?: number): MansionIngressRequest => ({
  from: iso(from), to: iso(to), table: TABLE,
  ...(maxSamples === undefined ? {} : { maxSamples })
});
const complete = (result: ReturnType<typeof mansionIngresses>): MansionIngressResult => {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
};

// Replace only the numerical longitude source for hand-derived motion checks.
// The receipt scaffolding is synthetic and is never used as accuracy evidence
// or replay evidence. Separate real-engine tests check actual receipt replay.
function syntheticMotion(longitude: (elapsed: number) => number) {
  const template = engine.tropicalMoon(ISO);
  if (template.status !== "ok") throw new Error("Unexpected engine refusal");
  return vi.spyOn(engine, "tropicalMoon").mockImplementation((time) => {
    if (!(time instanceof Date)) throw new Error("Search must sample UTC Dates");
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

describe("hand-derived equal-segment ingress arithmetic", () => {
  it("refines a full circuit and wrap to integer ceilings of independent rational times", () => {
    // lambda(t) = 14*t/DAY; boundary k = k*360/28.
    // t(k) = k*90*DAY/98, so the first entered millisecond is ceil(t(k)).
    syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const result = complete(mansionIngresses(request(0, 30 * DAY)));
    expect(result.ingresses).toHaveLength(32);
    result.ingresses.forEach((ingress, index) => {
      const k = BigInt(index + 1);
      const numerator = k * 90n * BigInt(DAY);
      const firstMs = Number((numerator + 97n) / 98n);
      expect(ingress.at).toBe(iso(firstMs));
      expect(ingress.previous.at).toBe(iso(firstMs - 1));
      expect(ingress.mansion.index).toBe((index + 1) % 28 + 1);
      expect(ingress.previous.mansion.index).toBe(index % 28 + 1);
      expect(ingress.boundary).toBe(ingress.mansion.start);
      expect(ingress.direction).toBe("direct");
    });
    expect(result.endpointConvention).toBe("(from,to]");
    expect(result.resolution).toBe("first-changed-millisecond");
    expect(result.table).toBe(EQUAL28_ARIES_V1);
  });

  it("excludes from and includes to at an exactly representable table boundary", () => {
    syntheticMotion((elapsed) => 90 * elapsed / DAY);
    const left = complete(mansionIngresses(request(0, DAY)));
    const right = complete(mansionIngresses(request(DAY, 2 * DAY)));
    expect(left.ingresses).toHaveLength(7);
    expect(right.ingresses).toHaveLength(7);
    expect(left.ingresses.at(-1)?.at).toBe(iso(DAY));
    expect(Date.parse(right.ingresses[0]!.at)).toBeGreaterThan(START + DAY);
    expect(right.ingresses.at(-1)?.at).toBe(iso(2 * DAY));
    expect(left.ingresses[0]!.at).not.toBe(iso(0));
  });

  it("partitions a rounded-root edge consistently across adjacent windows", () => {
    syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const whole = complete(mansionIngresses(request(0, 2 * DAY)));
    const edge = Date.parse(whole.ingresses[0]!.at) - START;
    const left = complete(mansionIngresses(request(0, edge)));
    const right = complete(mansionIngresses(request(edge, 2 * DAY)));
    expect(left.ingresses).toEqual(whole.ingresses.slice(0, 1));
    expect(right.ingresses).toEqual(whole.ingresses.slice(1));
    // The event exists in a one-millisecond window ending on it.
    expect(complete(mansionIngresses(request(edge - 1, edge))).ingresses)
      .toEqual(whole.ingresses.slice(0, 1));
  });

  it("returns no ingress for stationary longitude, empty windows or touches", () => {
    syntheticMotion(() => 0);
    expect(complete(mansionIngresses(request())).ingresses).toEqual([]);
    const empty = complete(mansionIngresses(request(0, 0)));
    expect(empty.ingresses).toEqual([]);
    expect(empty.samples).toBe(1);
    expect(empty.receipts.from).toBe(empty.receipts.to);
    vi.restoreAllMocks();
    // At midnight plus half a day the synthetic motion touches 90 degrees
    // from above; the half-open classifier remains in mansion 8 throughout.
    syntheticMotion((elapsed) => 90 + (elapsed / DAY - 0.5) ** 2);
    expect(complete(mansionIngresses(request())).ingresses).toEqual([]);
  });

  it("uses half-open boundary membership for reverse crossings too", () => {
    syntheticMotion((elapsed) => 91 - elapsed / DAY * 2);
    const result = complete(mansionIngresses(request()));
    expect(result.ingresses).toHaveLength(1);
    const event = result.ingresses[0]!;
    // At equality (90 degrees) mansion 8 still applies. The first
    // millisecond below it enters mansion 7.
    expect(event.at).toBe(iso(DAY / 2 + 1));
    expect(event.previous.at).toBe(iso(DAY / 2));
    expect(event.previous.mansion.index).toBe(8);
    expect(event.mansion.index).toBe(7);
    expect(event.direction).toBe("retrograde");
    expect(event.boundary).toBe(event.previous.mansion.start);
    const beforeEdge = complete(mansionIngresses(request(0, DAY / 2)));
    expect(beforeEdge.ingresses).toEqual([]);
    expect(complete(mansionIngresses(request(DAY / 2, DAY))).ingresses).toEqual([event]);
    expect(complete(mansionIngresses(request(DAY / 2, DAY / 2 + 1))).ingresses).toEqual([event]);
  });
});

describe("engine ingress integration (numerical regression evidence only)", () => {
  it("reports a real month chronologically with receipts at adjacent changed milliseconds", () => {
    const result = complete(mansionIngresses(request(0, 30 * DAY)));
    expect(result.ingresses.length).toBeGreaterThan(28);
    let previousTime = START;
    for (const ingress of result.ingresses) {
      const ms = Date.parse(ingress.at);
      expect(ms).toBeGreaterThan(previousTime);
      expect(ms).toBeLessThanOrEqual(START + 30 * DAY);
      previousTime = ms;
      expect(ingress.direction).toBe("direct");
      expect(ingress.mansion.index).toBe(ingress.previous.mansion.index % 28 + 1);
      expect(mansionAt({ time: new Date(ms), table: TABLE })).toMatchObject({
        at: ingress.at, mansion: ingress.mansion, longitude: ingress.longitude,
        receipt: ingress.receipt, bounds: ingress.bounds
      });
      expect(mansionAt({ time: new Date(ms - 1), table: TABLE })).toEqual(ingress.previous);
      const encoded = JSON.parse(JSON.stringify(ingress));
      const replay = calc(encoded.receipt.request);
      expect(replay).toMatchObject({ status: "ok", lon: ingress.longitude,
        receipt: ingress.receipt, bounds: ingress.bounds });
      expect(ingress.receipt.instants[0]!.utc).toBe(ingress.at);
      expect(ingress.previous.receipt.instants[0]!.utc).toBe(ingress.previous.at);
    }
    expect(result.receipts.from).toEqual(completeReceipt(iso(0)));
    expect(result.receipts.to).toEqual(completeReceipt(iso(30 * DAY)));
  });

  it("keeps real ingress membership consistent when the event is a window endpoint", () => {
    const whole = complete(mansionIngresses(request(0, 2 * DAY)));
    expect(whole.ingresses.length).toBeGreaterThan(0);
    const edge = Date.parse(whole.ingresses[0]!.at) - START;
    const left = complete(mansionIngresses(request(0, edge)));
    const right = complete(mansionIngresses(request(edge, 2 * DAY)));
    expect([...left.ingresses, ...right.ingresses]).toEqual(whole.ingresses);
    expect(left.ingresses.at(-1)?.at).toBe(iso(edge));
  });

  it("normalizes ISO offsets and dates and leaves supplied Dates unchanged", () => {
    const from = new Date(ISO);
    const to = new Date(START + DAY);
    const input = Object.freeze({ from, to, table: TABLE });
    const result = complete(mansionIngresses(input));
    expect(result.from).toBe(ISO);
    expect(result.to).toBe(iso(DAY));
    expect(from.toISOString()).toBe(ISO);
    expect(to.toISOString()).toBe(iso(DAY));
    expect(mansionIngresses({ from: "2001-02-03", to: "2001-02-04T02:00:00+02:00", table: TABLE }))
      .toEqual(result);
  });
});

function completeReceipt(time: string) {
  const result = engine.tropicalMoon(time);
  if (result.status !== "ok") throw new Error("Unexpected engine refusal");
  return result.receipt;
}

describe("bounded work and refusals", () => {
  it("shares a strict evaluation budget across all boundaries, refinements and receipts", () => {
    const sample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const result = mansionIngresses(request(0, 30 * DAY, 200));
    expect(result).toMatchObject({ status: "refused", reason: "sample-budget", samples: 200, maxSamples: 200 });
    expect(result).not.toHaveProperty("ingresses");
    expect(sample).toHaveBeenCalledTimes(200);
    vi.restoreAllMocks();
    const successSample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const success = complete(mansionIngresses(request()));
    expect(success.samples).toBe(successSample.mock.calls.length);
    expect(success.maxSamples).toBe(INGRESS_SEARCH_LIMITS.defaultMaxSamples);
    expect(success.stepDays).toBe(INGRESS_SEARCH_LIMITS.stepDays);
    expect(success.samples).toBeLessThanOrEqual(success.maxSamples);
    // Cache hits consume no additional engine evaluation.
    const times = successSample.mock.calls.map(([time]) => (time as Date).getTime());
    expect(new Set(times).size).toBe(times.length);
  });

  it("can finish at an exact budget and refuses one evaluation short", () => {
    syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const expected = complete(mansionIngresses(request()));
    expect(complete(mansionIngresses(request(0, DAY, expected.samples)))).toEqual({
      ...expected, maxSamples: expected.samples
    });
    expect(mansionIngresses(request(0, DAY, expected.samples - 1))).toMatchObject({
      status: "refused", reason: "sample-budget", samples: expected.samples - 1
    });
    expect(mansionIngresses(request(0, DAY, 1))).toMatchObject({
      status: "refused", reason: "sample-budget", samples: 1, maxSamples: 1
    });
    expect(complete(mansionIngresses(request(0, 0, 1))).samples).toBe(1);
  });

  it("never samples outside the requested interval, including tiny windows", () => {
    const sample = syntheticMotion((elapsed) => 90 * elapsed / DAY);
    for (const [from, to] of [[0, DAY], [DAY - 1, DAY], [DAY, DAY + 1]] as const) {
      sample.mockClear();
      complete(mansionIngresses(request(from, to)));
      for (const [time] of sample.mock.calls) {
        const elapsed = (time as Date).getTime() - START;
        expect(elapsed).toBeGreaterThanOrEqual(from);
        expect(elapsed).toBeLessThanOrEqual(to);
      }
    }
  });

  it("passes through endpoint and interior engine refusals without partial output", () => {
    const refusal: CalcRefusal = {
      status: "refused", reason: "out-of-range", detail: "Synthetic refusal",
      span: { from: ISO, to: iso(DAY) }
    };
    vi.spyOn(engine, "tropicalMoon").mockReturnValueOnce(refusal);
    expect(mansionIngresses(request())).toBe(refusal);
    vi.restoreAllMocks();
    const sample = syntheticMotion((elapsed) => 14 * elapsed / DAY);
    const originalMock = sample.getMockImplementation()!;
    sample.mockImplementation((time) => (time as Date).getTime() === START + DAY / 4
      ? refusal : originalMock(time));
    expect(mansionIngresses(request())).toBe(refusal);
    vi.restoreAllMocks();
    expect(mansionIngresses({ from: "1701-02-03", to: "1701-02-04", table: TABLE }))
      .toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(mansionIngresses({ from: "2199-12-31T23:59:58Z", to: "2199-12-31T23:59:59Z", table: TABLE }))
      .toMatchObject({ status: "refused", reason: "out-of-range" });
  });

  it("propagates unexpected engine exceptions", () => {
    const error = new Error("Synthetic calculation error");
    vi.spyOn(engine, "tropicalMoon").mockImplementationOnce(() => { throw error; });
    expect(() => mansionIngresses(request())).toThrow(error);
  });

  it("accepts the maximum elapsed range and maximum finite budget", () => {
    syntheticMotion(() => 20);
    const result = complete(mansionIngresses(request(0, INGRESS_SEARCH_LIMITS.maxDays * DAY,
      INGRESS_SEARCH_LIMITS.maxSamples)));
    expect(result.ingresses).toEqual([]);
    expect(result.to).toBe(iso(366 * DAY));
    expect(result.maxSamples).toBe(100_000);
  });

  it("validates table, timestamps, range limit and finite budget before sampling", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    const invalid: unknown[] = [
      undefined, null, [], new Date(ISO), {}, { ...request(), table: undefined },
      { ...request(), table: "equal28-aries" }, { ...request(), table: "star-v1" },
      { ...request(), from: 0 }, { ...request(), to: null },
      { ...request(), from: new Date(NaN) }, { ...request(), to: "2001-02-30" },
      { ...request(), to: "2001-02-04T12:00" }, { ...request(), to: "2001-02-04T24:00Z" },
      { ...request(), from: { iso: ISO } }, { ...request(), to: { jd: 2451943.5, scale: "tt" } },
      request(DAY, 0), request(0, INGRESS_SEARCH_LIMITS.maxDays * DAY + 1),
      ...[0, -1, 1.5, null, "100", NaN, Infinity, 100_001].map((maxSamples) => ({ ...request(), maxSamples })),
      { ...request(), zodiac: "sidereal" }, { ...request(), stepDays: 5 },
      { ...request(), [Symbol("option")]: true },
      Object.defineProperty(request(), "maxSamples", { get() { throw new Error("Do not invoke getter"); } })
    ];
    for (const value of invalid) {
      expect(() => mansionIngresses(value as MansionIngressRequest)).toThrow(RangeError);
    }
    expect(sample).not.toHaveBeenCalled();
    expect(INGRESS_SEARCH_LIMITS).toEqual({
      stepDays: 0.25, maxDays: 366, defaultMaxSamples: 20_000, maxSamples: 100_000
    });
    expect(Object.isFrozen(INGRESS_SEARCH_LIMITS)).toBe(true);
  });
});
