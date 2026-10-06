import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { offsetAt, prepareLocalTime, resolveLocalToUtc, zoneOffsetAt } from "./timezone.js";

/*
 * Step 1.12 of the engine brief, ported from the Zodiacs site's
 * src/lib/time/localToUtc-history.test.ts: before 1970 a zone's offsets come
 * from the tzdb 2025c history with backzone shipped in this package, not from
 * the host, whose default build gives many places another city's history.
 * Each case below differs from the host (Node's ICU, tzdb 2025c without
 * backzone), which the "host" column records; the resolver reports that
 * reading as its cross-check, `intlOffsetMinutes`.
 */
const HOST_IS_2025C = (globalThis as { process?: { versions?: { tz?: string } } }).process?.versions?.tz === "2025c";

const CASES: [label: string, date: string, zone: string, longitude: number, utc: string, offset: number, host: number][] = [
  // Sweden kept +1:00 all year from 1917 to 1979; Berlin had summer time, and double summer time in 1947.
  ["Stockholm, July 1947", "1947-07-01", "Europe/Stockholm", 18.07, "1947-07-01T11:00:00.000Z", 60, 120],
  ["Stockholm, June 1947", "1947-06-15", "Europe/Stockholm", 18.07, "1947-06-15T11:00:00.000Z", 60, 180],
  // Amsterdam's own summer time, +1:20, where the host has Brussels's +1:00.
  ["Amsterdam, 1938", "1938-06-15", "Europe/Amsterdam", 4.89, "1938-06-15T10:40:00.000Z", 80, 60],
  // Amsterdam Mean Time was Dutch legal time from 1835; the host has Brussels's +0:17:30.
  ["Rotterdam, 1880", "1880-06-15", "Europe/Amsterdam", 4.48, "1880-06-15T11:40:28.000Z", 19 + 32 / 60, 17.5],
  ["Reykjavik, 1950", "1950-01-15", "Atlantic/Reykjavik", -21.9, "1950-01-15T13:00:00.000Z", -60, 0],
  ["Oslo, 1960", "1960-07-01", "Europe/Oslo", 10.75, "1960-07-01T10:00:00.000Z", 120, 60],
  ["Oranjestad, 1943", "1943-06-01", "America/Aruba", -70.03, "1943-06-01T16:30:00.000Z", -270, -180],
  ["St John's, Antigua, 1930", "1930-06-01", "America/Antigua", -61.85, "1930-06-01T17:00:00.000Z", -300, -240],
  ["Copenhagen, 1945", "1945-08-20", "Europe/Copenhagen", 12.57, "1945-08-20T11:00:00.000Z", 60, 180],
  // Kinshasa adopted West Africa Time in 1897; the host has Lagos's mean time.
  ["Kinshasa, 1900", "1900-06-01", "Africa/Kinshasa", 15.31, "1900-06-01T11:00:00.000Z", 60, 13 + 35 / 60]
];

describe("the shipped zone history before 1970", () => {
  beforeAll(() =>
    Promise.all(
      [...new Set([...CASES.map((row) => row[2]), "America/New_York", "WET", "Indian/Kerguelen"])].map((zone) =>
        prepareLocalTime("1900-01-01", zone)
      )
    )
  );

  it.each(CASES)("%s", (_label, date, zone, longitude, utc, offset, host) => {
    for (const options of [{ longitude }, undefined]) {
      const resolved = resolveLocalToUtc(date, "12:00", zone, options);
      expect(resolved.utc.toISOString()).toBe(utc);
      expect(resolved.offsetMinutes).toBeCloseTo(offset, 9);
      expect(resolved.zone).toMatchObject({ source: "tzdb", tzdbVersion: "2025c", dataForm: "main+backzone" });
      expect(resolved.localResolution).toMatchObject({ tzdbVersion: "2025c", dataForm: "main+backzone" });
      // The host's reading at the same instant, as the cross-check.
      expect(resolved.intlOffsetMinutes).toBeCloseTo(offsetAt(zone, resolved.utc.getTime()), 12);
      if (HOST_IS_2025C) expect(resolved.intlOffsetMinutes).toBeCloseTo(host, 9);
    }
  });

  it("changes nothing where the host already has the place's history", () => {
    const resolved = resolveLocalToUtc("1950-07-01", "12:00", "America/New_York", { longitude: -74.01 });
    expect(resolved).toEqual(resolveLocalToUtc("1950-07-01", "12:00", "America/New_York"));
    expect(resolved.offsetMinutes).toBe(-240);
    expect(resolved.intlOffsetMinutes).toBe(-240);
  });

  it("resolves across the hand-over to the host at 1970", () => {
    for (const [date, time, utc, source] of [
      ["1969-12-31", "23:30", "1969-12-31T22:30:00.000Z", "tzdb"],
      ["1970-01-01", "00:30", "1969-12-31T23:30:00.000Z", "tzdb"],
      ["1970-01-01", "01:30", "1970-01-01T00:30:00.000Z", "intl"]
    ] as const) {
      const resolved = resolveLocalToUtc(date, time, "Europe/Stockholm", { longitude: 18.07 });
      expect(resolved.utc.toISOString()).toBe(utc);
      expect(resolved.flags).toEqual([]);
      expect(resolved.zone.source).toBe(source);
    }
  });

  it("matches a zone name in any letter case, as Intl does", async () => {
    await prepareLocalTime("1947-07-01", "europe/stockholm");
    for (const zone of ["europe/stockholm", "EUROPE/STOCKHOLM", "Europe/Stockholm"]) {
      expect(resolveLocalToUtc("1947-07-01", "12:00", zone).utc.toISOString()).toBe("1947-07-01T11:00:00.000Z");
    }
  });

  it('reads the host where the shipped history has no local time ("-00")', () => {
    // tzdb has no local time for the Kerguelen Islands before 1950.
    const resolved = resolveLocalToUtc("1940-01-01", "12:00", "Indian/Kerguelen", { longitude: 70.22 });
    expect(resolved.zone.source).toBe("intl");
    expect(resolved.offsetMinutes).toBe(offsetAt("Indian/Kerguelen", resolved.utc.getTime()));
  });

  it("gives a name whose backzone history differs after 1970 the default build's history, so 1970 cannot jump", () => {
    const resolved = resolveLocalToUtc("1950-06-15", "12:00", "WET", { longitude: -9.14 });
    expect(resolved).toEqual(resolveLocalToUtc("1950-06-15", "12:00", "WET"));
    expect(resolved.zone).toMatchObject({ source: "tzdb", dataForm: "main" });
    if (HOST_IS_2025C) expect(resolved.offsetMinutes).toBe(resolved.intlOffsetMinutes);
  });

  it("offers the zone's own clock as zoneOffsetAt", () => {
    expect(zoneOffsetAt("Europe/Stockholm", Date.UTC(1947, 6, 1, 11))).toBe(60);
    expect(zoneOffsetAt("Europe/Stockholm", Date.UTC(2020, 6, 1, 11))).toBe(120);
  });
});

describe("loading the shipped history", () => {
  it("refuses a time before 1970 until the zone is prepared, and nothing else prepares it", async () => {
    vi.resetModules();
    const fresh = await import("./timezone.js");
    expect(() => fresh.resolveLocalToUtc("1938-06-15", "12:00", "Europe/Luxembourg")).toThrow("prepareLocalTime");
    await fresh.prepareLocalTime("1938-06-15", "Europe/Zagreb");
    expect(() => fresh.resolveLocalToUtc("1938-06-15", "12:00", "Europe/Luxembourg")).toThrow("prepareLocalTime");
    // 1971 needs nothing, and a fixed zone never does.
    expect(() => fresh.resolveLocalToUtc("1971-06-15", "12:00", "Europe/Luxembourg")).not.toThrow();
    expect(() => fresh.resolveLocalToUtc("0001-06-15", "12:00", "Etc/GMT-3")).not.toThrow();
    await fresh.prepareLocalTime("1938-06-15", "Europe/Luxembourg");
    expect(() => fresh.resolveLocalToUtc("1938-06-15", "12:00", "Europe/Luxembourg")).not.toThrow();
    vi.resetModules();
  });

  it("gives zoneOffsetAt one answer for one question, whatever was loaded before", async () => {
    // rc.15's first cut answered from Intl until another call loaded the history:
    // Stockholm 1947-07-01T10Z was +120, then +60.
    vi.resetModules();
    const fresh = await import("./timezone.js");
    const at = Date.UTC(1947, 6, 1, 10);
    const answers: (number | string)[] = [];
    const ask = () => {
      try {
        answers.push(fresh.zoneOffsetAt("Europe/Stockholm", at));
      } catch (error) {
        answers.push(String(error));
      }
    };
    ask();
    expect(answers[0]).toMatch(/prepareLocalTime/);
    // 1970 on, and the fixed zones, need nothing.
    expect(fresh.zoneOffsetAt("Europe/Stockholm", Date.UTC(2020, 6, 1, 11))).toBe(120);
    expect(fresh.zoneOffsetAt("Europe/Stockholm", Date.UTC(1970, 0, 1))).toBe(60);
    expect(fresh.zoneOffsetAt("Etc/GMT-3", Date.UTC(1900, 0, 1))).toBe(180);
    // Loading another zone does not answer for this one.
    await fresh.prepareLocalTime("1947-07-01", "Europe/Oslo");
    ask();
    await fresh.prepareLocalTime("1947-07-01", "Europe/Stockholm");
    ask();
    ask();
    expect(answers.slice(1)).toEqual([answers[0], 60, 60]);
    expect(() => fresh.zoneOffsetAt("Europe/Luxembourg", Date.UTC(1938, 5, 15))).toThrow("prepareLocalTime");
    // A class to catch it by, since an error's message is not part of the API.
    expect(() => fresh.zoneOffsetAt("Europe/Luxembourg", Date.UTC(1938, 5, 15))).toThrow(fresh.ZoneHistoryNotLoadedError);
    expect(() => fresh.resolveLocalToUtc("1938-06-15", "12:00", "Europe/Luxembourg")).toThrow(fresh.ZoneHistoryNotLoadedError);
    expect(new fresh.ZoneHistoryNotLoadedError()).toBeInstanceOf(Error);
    expect(new fresh.ZoneHistoryNotLoadedError()).not.toBeInstanceOf(RangeError);
    expect(new fresh.ZoneHistoryNotLoadedError().name).toBe("ZoneHistoryNotLoadedError");
    vi.resetModules();
  });

  it("prepares 1 January 1970, whose early wall times fall in 1969", async () => {
    vi.resetModules();
    const fresh = await import("./timezone.js");
    await fresh.prepareLocalTime("1970-01-01", "Asia/Tokyo");
    expect(fresh.resolveLocalToUtc("1970-01-01", "06:00", "Asia/Tokyo").utc.toISOString()).toBe("1969-12-31T21:00:00.000Z");
    vi.resetModules();
  });

  it("refuses a malformed date or zone", async () => {
    await expect(prepareLocalTime("1947-7-1", "Europe/Stockholm")).rejects.toThrow(RangeError);
    await expect(prepareLocalTime("1947-07-01", "Synthetic/Zone")).rejects.toThrow(RangeError);
    await expect(prepareLocalTime("1947-07-01", "" as string)).rejects.toThrow(RangeError);
  });

  it("loads a bucket once, and does not remember a failed load", async () => {
    vi.resetModules();
    let calls = 0;
    let fail = true;
    vi.doMock("../tzdb/tzdb-2025c.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("../tzdb/tzdb-2025c.js")>();
      return {
        ...original,
        SHARD_LOADERS: original.SHARD_LOADERS.map((load) => () => {
          calls += 1;
          return fail ? Promise.reject(new Error("offline")) : load();
        })
      };
    });
    const fresh = await import("./timezone.js");
    await expect(fresh.prepareLocalTime("1947-07-01", "Europe/Stockholm")).rejects.toThrow("offline");
    fail = false;
    await fresh.prepareLocalTime("1947-07-01", "Europe/Stockholm");
    await fresh.prepareLocalTime("1930-01-01", "Europe/Stockholm");
    expect(calls).toBe(2);
    expect(fresh.resolveLocalToUtc("1947-07-01", "12:00", "Europe/Stockholm").offsetMinutes).toBe(60);
    vi.doUnmock("../tzdb/tzdb-2025c.js");
    vi.resetModules();
  });

  it("raises no unhandled rejection when a caller stops waiting for a failed load", async () => {
    vi.resetModules();
    vi.doMock("../tzdb/tzdb-2025c.js", async (importOriginal) => {
      const original = await importOriginal<typeof import("../tzdb/tzdb-2025c.js")>();
      return { ...original, SHARD_LOADERS: original.SHARD_LOADERS.map(() => () => Promise.reject(new Error("offline"))) };
    });
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => {
      unhandled.push(reason);
    };
    process.on("unhandledRejection", listener);
    try {
      const fresh = await import("./timezone.js");
      void fresh.prepareLocalTime("1947-07-01", "Europe/Oslo");
      await new Promise((settle) => setTimeout(settle, 50));
      expect(unhandled).toEqual([]);
      await expect(fresh.prepareLocalTime("1947-07-01", "Europe/Oslo")).rejects.toThrow();
    } finally {
      process.off("unhandledRejection", listener);
      vi.doUnmock("../tzdb/tzdb-2025c.js");
      vi.resetModules();
    }
  });
});

/*
 * Brief v1 M3's rule for step 1.12: "the 98-zone divergence list resolves to
 * backzone truth". The list (fixtures/tzdb-divergence-98.json, copied
 * unchanged from the audit, sha256 d3258be9…) gives, for each zone, up to
 * three segments where the audit's reference (Debian's tzdata 2025b TZif
 * files, built with backzone) and Node's Intl (tzdb 2025c, default build)
 * disagree, in minutes. So a birth at 12:00 inside each segment, resolved by
 * the engine, should differ from the host's offset at the same instant by the
 * listed minutes. The list is relative to tzdb 2025c's default build, so the
 * comparison runs where the host is that build.
 */
describe("the audit's 98-zone divergence list", () => {
  const text = readFileSync(new URL("../fixtures/tzdb-divergence-98.json", import.meta.url), "utf8");
  const list = JSON.parse(text) as {
    zones: { tz: string; sample: { from: string; to: string; tzifMinusIcuMinutes: number; days: number }[] }[];
  };
  const DAY = 86_400_000;

  it("is the audit's list", () => {
    expect(createHash("sha256").update(text).digest("hex")).toBe(
      "d3258be9118494fba3cff97dea1a954f13f7c084249494674f5eaed7b816ee3e"
    );
    expect(list.zones).toHaveLength(98);
  });

  it.runIf(HOST_IS_2025C)("reproduces every segment before 1970 but six, which the reference got otherwise", async () => {
    const rows: { zone: string; date: string; listed: number; moved: number; kind: string }[] = [];
    for (const zone of list.zones) {
      for (const segment of zone.sample) {
        const from = Date.parse(`${segment.from}T00:00:00Z`);
        const to = Date.parse(`${segment.to}T00:00:00Z`);
        const dates = (segment.days <= 2 ? [from, to] : [from + Math.floor((to - from) / DAY / 2) * DAY]).map((ms) =>
          new Date(ms).toISOString().slice(0, 10)
        );
        let row = { zone: zone.tz, date: dates[0]!, listed: segment.tzifMinusIcuMinutes, moved: 0, kind: "" };
        for (const date of dates) {
          await prepareLocalTime(date, zone.tz);
          const resolved = resolveLocalToUtc(date, "12:00", zone.tz);
          const moved = Math.round((resolved.offsetMinutes - offsetAt(zone.tz, resolved.utc.getTime())) * 60) / 60;
          const kind =
            Number(date.slice(0, 4)) >= 1970
              ? "after 1970"
              : resolved.zone.source === "intl"
                ? "no local time (-00)"
                : resolved.zone.dataForm === "main"
                  ? "default build"
                  : "before 1970";
          row = { zone: zone.tz, date, listed: segment.tzifMinusIcuMinutes, moved, kind };
          if (Math.abs(moved - segment.tzifMinusIcuMinutes) < 1e-9) break;
        }
        rows.push(row);
      }
    }
    const before = rows.filter((row) => row.kind === "before 1970");
    const disagree = before.filter((row) => Math.abs(row.moved - row.listed) >= 1e-9);
    // Tijuana: tzdb 2025c changed Baja California's history (1953, 1961, 1962).
    // Coral_Harbour: Debian built backzone with PACKRATLIST=zone.tab, which makes
    // it a link to Atikokan; backzone in full has its own zone.
    expect(disagree.map((row) => row.zone).sort()).toEqual([
      "America/Coral_Harbour",
      "America/Coral_Harbour",
      "America/Coral_Harbour",
      "America/Tijuana",
      "America/Tijuana",
      "America/Tijuana"
    ]);
    expect(before.length - disagree.length).toBe(179);
    expect(rows.filter((row) => row.kind === "no local time (-00)")).toHaveLength(8);
    // Stockholm 1947-07-01 12:00 resolves to +60.
    expect(resolveLocalToUtc("1947-07-01", "12:00", "Europe/Stockholm").offsetMinutes).toBe(60);
  }, 120_000);
});
