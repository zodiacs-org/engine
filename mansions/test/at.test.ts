import { afterEach, describe, expect, it, vi } from "vitest";
import { calc, CALC_SPAN } from "../../src/calc.js";
import type { CalcRefusal, CalcTime } from "../../src/calc.js";
import * as engine from "../src/engine.js";
import { EQUAL28_ARIES_V1, mansionAt } from "../src/index.js";
import type { MansionAtRequest, MansionAtResult } from "../src/index.js";

// Synthetic instants, not birth data. Integration checks are regression
// evidence only; independently derived boundary arithmetic is tested in M3.
const ISO = "2001-02-03T04:05:06.000Z";
const TABLE = "equal28-aries-v1";
const request = (time: CalcTime): MansionAtRequest => ({ time, table: TABLE });
const computed = (result: ReturnType<typeof mansionAt>): MansionAtResult => {
  if (result.status !== "ok") throw new Error(`Unexpected refusal: ${result.reason}`);
  return result;
};

afterEach(() => vi.restoreAllMocks());

describe("tropical mansion at API", () => {
  it("attaches the selected table and names to the engine Moon longitude", () => {
    for (const time of [ISO, "1901-06-07T08:09:10Z", "2101-11-12T13:14:15Z"]) {
      const moon = engine.tropicalMoon(time);
      if (moon.status !== "ok") throw new Error("Unexpected engine refusal");
      const result = computed(mansionAt(request(time)));
      expect(result.at).toBe(moon.receipt.instants[0]!.utc);
      expect(result.zodiac).toBe("tropical");
      expect(result.longitude).toBe(moon.lon);
      expect(result.table).toBe(EQUAL28_ARIES_V1);
      // These samples are far from a boundary. Separate integer arithmetic
      // tests cover the nonrepresentable rational boundaries themselves.
      const index = Math.floor(moon.lon * 7 / 90);
      expect(result.mansion).toBe(EQUAL28_ARIES_V1.mansions[index]);
      expect(result.mansion.arabicName).not.toBe("");
      expect(result.mansion.latinLabel).not.toBe("");
    }
  });

  it("retains the exact engine receipt and bounds objects and allows JSON replay", () => {
    const moon = engine.tropicalMoon(ISO);
    if (moon.status !== "ok") throw new Error("Unexpected engine refusal");
    vi.spyOn(engine, "tropicalMoon").mockReturnValueOnce(moon);
    const result = computed(mansionAt(request(ISO)));
    expect(result.receipt).toBe(moon.receipt);
    expect(result.bounds).toBe(moon.bounds);
    const encoded = JSON.parse(JSON.stringify(result)) as MansionAtResult;
    expect(calc(encoded.receipt.request)).toEqual(moon);
    expect(encoded.receipt.conventions).toContain("zodiac:tropical");
    expect(encoded.receipt.request.body).toBe("Moon");
    expect(encoded.receipt.instants[0]!.timeScale.input).toBe("utc");
  });

  it("accepts engine ISO, Date, pinned and explicitly scaled Julian-date inputs", () => {
    const jd = 2451943.5; // Synthetic midnight, derived as J2000 JD + 398.5 days.
    const inputs: CalcTime[] = [
      "2001-02-03", "2001-02-03T04:05:06+02:00", new Date(ISO),
      { iso: ISO }, { iso: ISO, deltaT: 64 },
      { jd, scale: "utc" }, { jd, scale: "ut1" }, { jd, scale: "tt" }
    ];
    for (const time of inputs) {
      const result = computed(mansionAt(request(time)));
      const moon = engine.tropicalMoon(time);
      if (moon.status !== "ok") throw new Error("Unexpected engine refusal");
      expect(result.longitude).toBe(moon.lon);
      expect(result.receipt).toEqual(moon.receipt);
      expect(result.at).toBe(moon.receipt.instants[0]!.utc);
    }
    expect(computed(mansionAt(request("2001-02-03"))).at).toBe("2001-02-03T00:00:00.000Z");
    expect(computed(mansionAt(request("2001-02-03T04:05:06+02:00"))).at).toBe("2001-02-03T02:05:06.000Z");
  });

  it("rejects malformed instants through the engine's strict parser", () => {
    const invalid: unknown[] = [
      undefined, null, 0, NaN, Infinity, {}, [], new Date(NaN),
      "2001-02-30", "1900-02-29", "2001-02-03T04:05:06",
      "2001-02-03T24:00Z", "2001-02-03T04:05:60Z",
      "2001-02-03T04:05:06.0001Z", "02/03/2001", `${ISO}\n`,
      { iso: ISO, scale: "utc" }, { iso: ISO, deltaT: NaN },
      { jd: 2451943.5 }, { jd: 2451943.5, scale: "UTC" },
      { jd: Infinity, scale: "tt" }, { iso: ISO, extra: true }
    ];
    for (const time of invalid) {
      expect(() => mansionAt(request(time as CalcTime))).toThrow(RangeError);
    }
    expect(computed(mansionAt(request("2000-02-29"))).status).toBe("ok");
  });

  it("requires an explicit known table and rejects unknown options before sampling", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    const invalid: unknown[] = [
      undefined, null, [], ISO, new Date(ISO),
      {}, { time: ISO }, { time: ISO, table: null },
      { time: ISO, table: "equal28-aries" }, { time: ISO, table: "other-v1" },
      { time: ISO, table: TABLE, zodiac: "sidereal" },
      { time: ISO, table: TABLE, latitude: 0 }
    ];
    for (const value of invalid) {
      expect(() => mansionAt(value as MansionAtRequest)).toThrow(RangeError);
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("passes through coverage refusals without inventing positions or receipts", () => {
    for (const time of ["1701-02-03", "2301-02-03", "+030000-01-01"]) {
      const result = mansionAt(request(time));
      expect(result).toEqual(engine.tropicalMoon(time));
      expect(result).toMatchObject({ status: "refused", reason: "out-of-range", span: CALC_SPAN });
      expect(result).not.toHaveProperty("mansion");
      expect(result).not.toHaveProperty("receipt");
    }
    const refusal: CalcRefusal = {
      status: "refused", reason: "out-of-range", span: CALC_SPAN, detail: "Synthetic refusal"
    };
    vi.spyOn(engine, "tropicalMoon").mockReturnValueOnce(refusal);
    expect(mansionAt(request(ISO))).toBe(refusal);
  });

  it("honors coverage checks on UT1 and TT rather than only the UTC label", () => {
    expect(mansionAt(request(CALC_SPAN.from)).status).toBe("ok");
    expect(mansionAt(request(new Date(Date.parse(CALC_SPAN.from) - 1000))).status).toBe("refused");
    expect(mansionAt(request("2199-12-31T23:00:00Z")).status).toBe("ok");
    // UTC is before the upper edge, but TT is already beyond it.
    expect(mansionAt(request("2199-12-31T23:59:59Z"))).toMatchObject({
      status: "refused", reason: "out-of-range"
    });
    expect(mansionAt(request(CALC_SPAN.to)).status).toBe("refused");
  });

  it("does not mutate caller inputs or retain results between calls", () => {
    const date = new Date(ISO);
    const input = Object.freeze(request(date));
    const first = computed(mansionAt(input));
    mansionAt(request("1901-06-07"));
    expect(mansionAt(input)).toEqual(first);
    expect(date.toISOString()).toBe(ISO);
    // The immutable registry table can be shared; engine receipt data is fresh.
    const next = computed(mansionAt(input));
    expect(next).not.toBe(first);
    expect(next.receipt).not.toBe(first.receipt);
  });

  it("does not disguise calculation exceptions as a successful or partial result", () => {
    const error = new RangeError("Synthetic calculation failure");
    vi.spyOn(engine, "tropicalMoon").mockImplementationOnce(() => { throw error; });
    expect(() => mansionAt(request(ISO))).toThrow(error);
  });
});
