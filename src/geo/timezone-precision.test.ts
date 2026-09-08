import { describe, expect, it } from "vitest";
import { natalChart } from "../index.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { resolveBirth, resolveLocalToUtc } from "./timezone.js";

// Finite host-IANA regression cases. Exact offsets were rechecked through Intl;
// these do not certify historical records or the engine's astronomical range.
const cases = [
  ["1913-12-31", "23:59", "America/Manaus", "1914-01-01T03:59:04.000Z", ["lmt"]],
  ["1914-01-01", "00:00", "America/Manaus", "1914-01-01T04:00:04.000Z", ["dst-gap"]],
  ["1914-01-01", "00:01", "America/Manaus", "1914-01-01T04:01:00.000Z", []],
  ["1914-01-01", "12:00", "America/Manaus", "1914-01-01T16:00:00.000Z", []],
  ["1884-01-01", "00:00", "America/Dawson_Creek", "1884-01-01T08:00:56.000Z", ["dst-gap"]],
  ["1884-01-01", "00:01", "America/Dawson_Creek", "1884-01-01T08:01:00.000Z", []],
  ["1890-01-01", "00:00", "America/Caracas", "1890-01-01T04:27:44.000Z", ["dst-gap", "lmt"]],
  ["1890-01-01", "00:01", "America/Caracas", "1890-01-01T04:28:40.000Z", ["lmt"]],
  ["1883-11-18", "11:59", "America/Denver", "1883-11-18T18:58:56.000Z", ["lmt"]],
  ["1883-11-18", "12:00", "America/Denver", "1883-11-18T18:59:56.000Z", ["dst-fold", "lmt"]],
  ["1883-11-18", "12:01", "America/Denver", "1883-11-18T19:01:00.000Z", []],
  ["1911-12-31", "23:59", "Africa/Ndjamena", "1911-12-31T22:58:48.000Z", ["lmt"]],
  ["1912-01-01", "00:00", "Africa/Ndjamena", "1911-12-31T23:00:00.000Z", []]
] as const;

describe("second-precise local minute matching", () => {
  it.each(cases)(
    "resolves %s %s in %s without shortening candidate wall times",
    (date, time, zone, instant, flags) => {
      const result = resolveLocalToUtc(date, time, zone);
      expect(result.utc.toISOString()).toBe(instant);
      expect(result.flags).toEqual(flags);
      expect(result.utc.getUTCMilliseconds()).toBe(0);
      const birth = resolveBirth({ date, time, timeZone: zone });
      expect(birth.utc).toEqual(result.utc);
      expect(birth.flags).toEqual(flags);
    }
  );

  it.each([
    ["1914-01-01", "America/Manaus", -240, 4, ["dst-gap"]],
    ["1884-01-01", "America/Dawson_Creek", -480, 56, ["dst-gap"]],
    ["1890-01-01", "America/Caracas", -(4 * 60 + 27 + 40 / 60), 4, ["dst-gap", "lmt"]]
  ] as const)(
    "retains the actual %s gap in %s through the public receipt codec",
    (date, timeZone, offsetMinutes, gapSeconds, flags) => {
      const input = resolveBirth({
        date,
        time: "00:00",
        timeZone,
        latitude: -3.1,
        longitude: -60.02
      });
      const envelope = createNatalEnvelope(natalChart(input), {
        reference: "supplied-instant",
        localResolution: {
          date,
          time: "00:00",
          timeZone,
          offsetMinutes,
          gapShiftMinutes: gapSeconds / 60,
          policy: { fold: "earlier", gap: "shift-forward" }
        }
      });
      expect(parseNatalEnvelope(serializeNatalEnvelope(envelope))).toEqual({ ok: true, envelope });
      expect(envelope.receipt.inputFlags).toEqual(flags);
      expect(envelope.receipt.localResolution?.gapShiftMinutes).toBe(gapSeconds / 60);
    }
  );

  it("keeps unknown-time local noon ordinary immediately after a seconds-sized gap", () => {
    const input = resolveBirth({
      date: "1914-01-01",
      timeZone: "America/Manaus",
      timeKnown: false
    });
    expect(input.utc).toEqual(new Date("1914-01-01T16:00:00.000Z"));
    expect(input.flags).toEqual([]);
    expect(input.timeKnown).toBe(false);
  });
});
