import { describe, expect, it } from "vitest";

import { HORIZON, PINNED, decodeTable, differences, encodeTable, probeOf } from "./build-host-zone-probes.mjs";
import { nameHash } from "./build-tz-shards.mjs";

const at = (iso) => Date.parse(iso) / 1000;

/*
 * Two clocks as zic writes them (RFC 8536: type 0 before the first
 * transition). The baseline falls back each November and springs forward each
 * March; the pinned one stays on summer time from 2026-03-08, as tzdata 2026f
 * has Cuba do until 2027-11-07.
 */
const baseline = {
  t: [at("2026-03-08T05:00:00Z"), at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), at("2027-11-07T05:00:00Z")],
  typeOf: [1, 0, 1, 0],
  offsets: [-18_000, -14_400]
};
const pinned = {
  t: [at("2026-03-08T05:00:00Z"), at("2027-11-07T05:00:00Z")],
  typeOf: [1, 0],
  offsets: [-18_000, -14_400]
};

describe("differences", () => {
  it("finds the run in which the two clocks differ, with both offsets", () => {
    expect(differences(pinned, baseline)).toEqual([[at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), -14_400, -18_000]]);
  });

  it("splits a run where either offset changes, and leaves a run reaching the horizon open", () => {
    const stays = { t: [at("2026-03-08T05:00:00Z")], typeOf: [1], offsets: [-18_000, -14_400] };
    const found = differences(stays, baseline);
    expect(found).toEqual([
      [at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), -14_400, -18_000],
      [at("2027-11-07T05:00:00Z"), null, -14_400, -18_000]
    ]);
    // A second baseline offset inside one difference makes two intervals.
    const twoStep = {
      t: [at("2026-03-08T05:00:00Z"), at("2026-11-01T05:00:00Z"), at("2026-12-01T05:00:00Z"), at("2027-03-14T05:00:00Z")],
      typeOf: [1, 0, 2, 1],
      offsets: [-18_000, -14_400, -21_600]
    };
    expect(differences(stays, twoStep)).toEqual([
      [at("2026-11-01T05:00:00Z"), at("2026-12-01T05:00:00Z"), -14_400, -18_000],
      [at("2026-12-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), -14_400, -21_600]
    ]);
  });

  it("ignores everything before 1970", () => {
    const old = { t: [at("1960-01-01T00:00:00Z")], typeOf: [1], offsets: [0, 3600] };
    const same = { t: [], typeOf: [], offsets: [3600] };
    expect(differences(old, same)).toEqual([]);
  });
});

describe("the probe", () => {
  it("is the midpoint rounded down to the minute, or 45 days in when open-ended", () => {
    expect(new Date(probeOf(at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z")) * 1000).toISOString()).toBe("2027-01-06T17:00:00.000Z");
    expect(probeOf(0, 3600)).toBe(1800);
    expect(probeOf(0, 180)).toBe(60);
    expect(probeOf(1000 * 60, null)).toBe(1000 * 60 + 45 * 86_400);
  });

  it("horizon is three years after the pinned release", () => {
    expect(new Date(HORIZON * 1000).toISOString().slice(0, 10)).toBe(`${Number(PINNED.released.slice(0, 4)) + 3}${PINNED.released.slice(4)}`);
  });
});

describe("the table", () => {
  it("round-trips, sharing one row between names with the same intervals", () => {
    const byName = new Map([
      ["America/Havana", [[at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), -14_400]]],
      ["Cuba", [[at("2026-11-01T05:00:00Z"), at("2027-03-14T05:00:00Z"), -14_400]]],
      ["Africa/Casablanca", [[at("2026-02-15T02:00:00Z"), at("2026-03-22T02:00:00Z"), 3600], [at("2029-02-18T02:00:00Z"), null, 0]]]
    ]);
    const text = encodeTable(byName);
    expect(text.split(";")).toHaveLength(2);
    const decoded = decodeTable(text);
    for (const [name, intervals] of byName) expect(decoded.get(nameHash(name)), name).toEqual(intervals);
  });

  it("refuses an instant or offset that is not a whole minute", () => {
    expect(() => encodeTable(new Map([["X", [[30, 3600, 0]]]]))).toThrow(/whole minute/);
    expect(() => encodeTable(new Map([["X", [[0, 3600, 30]]]]))).toThrow(/whole minute/);
  });
});
