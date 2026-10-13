import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveIanaTime } from "../src/iana-time.js";

interface ZoneVector {
  id: string;
  kind: string;
  input: { zone: string; local: string };
  expected: {
    status: "ok" | "ambiguous" | "nonexistent";
    utc_offset_s?: number;
    utc_offsets_s?: number[];
  };
  arbiter: string;
}

// Invented civil-time queries from the existing independent IANA 2025c
// conformance corpus. Its arbiter uses zic, zdump, a TZif reader and Python
// zoneinfo, not engine output. Read the committed vectors without copying them.
const corpus = JSON.parse(readFileSync(
  new URL("../../conformance/vectors/L3-time-calendars.json", import.meta.url), "utf8"
)) as { vectors: ZoneVector[] };
const selectedIds = [
  "L3-TZ-0001", "L3-TZ-0002", "L3-TZ-0003", "L3-TZ-0020",
  "L3-TZ-0021", "L3-TZ-0022", "L3-TZ-0023", "L3-TZ-0024",
  "L3-TZ-0025", "L3-TZ-0026", "L3-TZ-0028", "L3-TZ-0029",
  "L3-TZ-0030", "L3-TZ-0031", "L3-TZ-0032", "L3-TZ-0033",
  "L3-TZ-0037", "L3-TZ-0038", "L3-TZ-0039", "L3-TZ-0040",
  "L3-TZ-0043"
] as const;

function vector(id: string): ZoneVector {
  const found = corpus.vectors.find((entry) => entry.id === id);
  if (!found || found.kind !== "time.zone-offset" || found.arbiter !== "tzdb-2025c-backzone") {
    throw new Error(`Missing independent timezone vector ${id}`);
  }
  return found;
}

async function fromVector(reference: ZoneVector) {
  expect(reference.input.local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/u);
  return resolveIanaTime(reference.input.local.slice(0, 10), reference.input.local.slice(11, 16), reference.input.zone);
}

describe("IANA adapter against committed independent tzdb vectors", () => {
  it.each(selectedIds)("preserves the provider outcome for %s", async (id) => {
    const reference = vector(id);
    const result = await fromVector(reference);
    expect(result).toMatchObject({
      provider: "iana", timeZone: reference.input.zone, status: reference.expected.status
    });
    if (result.status === "unavailable") throw new Error(`Reference zone unavailable for ${id}`);

    const resolution = result.resolution;
    const chosenOffset = reference.expected.utc_offset_s ?? reference.expected.utc_offsets_s?.[0];
    if (chosenOffset !== undefined) {
      // Compare minutes directly, preserving whole-second source offsets
      // without introducing a second floating-point conversion in the assertion.
      expect(resolution.offsetMinutes).toBe(chosenOffset / 60);
      const expectedUtc = Date.parse(`${reference.input.local}Z`) - chosenOffset * 1000;
      expect(resolution.utc.getTime()).toBe(expectedUtc);
    }

    expect(resolution.localMeanTime).toBeNull();
    expect(resolution.localResolution.localMeanTime).toBeNull();
    expect(resolution.localResolution).toMatchObject({
      date: reference.input.local.slice(0, 10),
      time: reference.input.local.slice(11, 16),
      timeZone: reference.input.zone,
      policy: { fold: "earlier", gap: "shift-forward" },
      offsetMinutes: resolution.offsetMinutes,
      calendar: "gregorian"
    });

    if (reference.expected.status === "ambiguous") {
      expect(resolution.flags).toContain("dst-fold");
      expect(resolution.jump?.kind).toBe("fold");
      expect(resolution.localResolution.gapShiftMinutes).toBe(0);
      expect(resolution.transition?.offsetBeforeMinutes).toBe(reference.expected.utc_offsets_s![0]! / 60);
      expect(resolution.transition?.offsetAfterMinutes).toBe(reference.expected.utc_offsets_s![1]! / 60);
    } else if (reference.expected.status === "nonexistent") {
      expect(resolution.flags).toContain("dst-gap");
      expect(resolution.jump?.kind).toBe("gap");
      const transition = resolution.transition;
      if (!transition) throw new Error(`Missing gap transition for ${id}`);
      // Policy checks, not independent offset evidence: the reference marks
      // the reading nonexistent and intentionally provides no chosen instant.
      expect(resolution.offsetMinutes).toBe(transition.offsetAfterMinutes);
      expect(resolution.localResolution.gapShiftMinutes).toBe(
        transition.offsetAfterMinutes - transition.offsetBeforeMinutes
      );
      expect(resolution.localResolution.gapShiftMinutes).toBeGreaterThan(0);
      expect(resolution.utc.getTime()).toBe(
        Date.parse(`${reference.input.local}Z`) - transition.offsetBeforeMinutes * 60_000
      );
    } else {
      expect(resolution.flags).not.toContain("dst-gap");
      expect(resolution.flags).not.toContain("dst-fold");
      expect(resolution.jump).toBeNull();
      expect(resolution.localResolution.gapShiftMinutes).toBe(0);
    }

    if (reference.input.local < "1970-01-01") {
      expect(resolution.zone).toMatchObject({
        source: "tzdb", tzdbVersion: "2025c", dataForm: "main+backzone"
      });
      expect(resolution.intlOffsetMinutes).toEqual(expect.any(Number));
    } else {
      expect(resolution.zone).toEqual({
        source: "intl", tzdbVersion: process.versions.tz ?? null,
        dataForm: "host", abbreviation: null, dst: null
      });
      expect(resolution.intlOffsetMinutes).toBeNull();
    }
    expect(resolution.localResolution.tzdbVersion).toBe(resolution.zone.tzdbVersion);
    expect(resolution.localResolution.dataForm).toBe(resolution.zone.dataForm);
    expect(resolution.localResolution.transition).toEqual(resolution.transition);
  });

  it("keeps the IANA zone clock for LMT instead of substituting a birthplace longitude", async () => {
    const reference = vector("L3-TZ-0037");
    const result = await fromVector(reference);
    if (result.status === "unavailable") throw new Error("Reference zone unavailable");
    expect(result.resolution.offsetMinutes).toBe(reference.expected.utc_offset_s! / 60);
    expect(result.resolution.flags).toContain("lmt");
    expect(result.resolution.localResolution.clock).toBe("local-mean-time");
    expect(result.resolution.localMeanTime).toBeNull();
  });
});

describe("IANA adapter input and availability", () => {
  it("reports a missing zone without substituting UTC", async () => {
    expect(await resolveIanaTime("2000-06-15", "12:30", null)).toEqual({
      provider: "iana", status: "unavailable", timeZone: null, reason: "missing-timezone"
    });
  });

  it("reports an unsupported identifier without guessing an offset", async () => {
    expect(await resolveIanaTime("1947-06-15", "12:30", "Synthetic/Unlisted")).toEqual({
      provider: "iana", status: "unavailable", timeZone: "Synthetic/Unlisted", reason: "unsupported-timezone"
    });
  });

  it.each([
    ["2024-02-30", "12:30"], ["1900-02-29", "12:30"],
    ["2024-00-01", "12:30"], ["2024-13-01", "12:30"],
    ["2024-01-00", "12:30"], ["2024-1-01", "12:30"],
    ["2024-01-01T00:00:00Z", "12:30"], [" 2024-01-01", "12:30"],
    ["2024-01-01", "24:00"], ["2024-01-01", "12:60"],
    ["2024-01-01", "1:30"], ["2024-01-01", "12:30:00"],
    ["2024-01-01", "12:30Z"], ["2024-01-01", " 12:30"],
    ["", "12:30"], ["2024-01-01", ""]
  ])("rejects invalid civil input %s %s before zone availability", async (date, time) => {
    for (const zone of ["UTC", "Synthetic/Unlisted", null]) {
      await expect(resolveIanaTime(date, time, zone)).rejects.toThrow(RangeError);
    }
  });

  it("prepares the historical data at the local 1970 handover", async () => {
    // Integration regression for an engine loading edge, not a new accuracy
    // claim: this civil reading resolves before UTC 1970 and needs its shard.
    const result = await resolveIanaTime("1970-01-01", "06:00", "Asia/Tokyo");
    if (result.status === "unavailable") throw new Error("Reference zone unavailable");
    expect(result.status).toBe("ok");
    expect(result.resolution.utc.toISOString()).toBe("1969-12-31T21:00:00.000Z");
    expect(result.resolution.zone).toMatchObject({
      source: "tzdb", tzdbVersion: "2025c", dataForm: "main+backzone"
    });
  });

  it("accepts an actual Gregorian leap day and preserves years before 0100", async () => {
    for (const date of ["2000-02-29", "0001-01-01", "0099-12-31"]) {
      const result = await resolveIanaTime(date, "12:30", "UTC");
      if (result.status === "unavailable") throw new Error("UTC unavailable");
      expect(result.status).toBe("ok");
      expect(result.resolution.utc.toISOString()).toBe(`${date}T12:30:00.000Z`);
      expect(result.resolution.zone.source).toBe("intl");
    }
  });
});
