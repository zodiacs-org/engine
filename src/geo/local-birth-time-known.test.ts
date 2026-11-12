/**
 * How resolveLocalBirth reads `time` and `timeKnown` together: the default
 * for `timeKnown` follows whether a time was given, a known time must be
 * given, and `reference` says whether the instant is the caller's or local
 * noon. Synthetic dates in UTC, so no zone history is involved.
 */
import { describe, expect, it } from "vitest";

import { resolveLocalBirth } from "./timezone.js";

const base = { date: "2001-03-04", timeZone: "UTC" } as const;

describe("resolveLocalBirth time and timeKnown", () => {
  it("refuses timeKnown: true without a time, instead of reading local noon as a known time", () => {
    expect(() => resolveLocalBirth({ ...base, timeKnown: true })).toThrow(new RangeError("time is required when timeKnown is true."));
  });

  it("defaults timeKnown to whether a time was given", () => {
    const withTime = resolveLocalBirth({ ...base, time: "06:15" });
    expect(withTime.birth.timeKnown).toBe(true);
    expect(withTime.reference).toBe("supplied-instant");
    expect(withTime.birth.utc).toEqual(new Date("2001-03-04T06:15:00.000Z"));

    const without = resolveLocalBirth({ ...base });
    expect(without.birth.timeKnown).toBe(false);
    expect(without.reference).toBe("local-noon");
    expect(without.birth.utc).toEqual(new Date("2001-03-04T12:00:00.000Z"));
  });

  it("keeps a given time as the instant when timeKnown is false, and says so in reference", () => {
    const resolved = resolveLocalBirth({ ...base, time: "06:15", timeKnown: false });
    expect(resolved.birth.timeKnown).toBe(false);
    expect(resolved.reference).toBe("supplied-instant");
    expect(resolved.birth.utc).toEqual(new Date("2001-03-04T06:15:00.000Z"));
  });

  it("refuses a field it does not know, naming it", () => {
    expect(() => resolveLocalBirth({ ...base, tz: "UTC" } as never)).toThrow(new RangeError('Unknown local birth field "tz".'));
  });
});
