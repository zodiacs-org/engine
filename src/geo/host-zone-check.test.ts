import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../index.js";
import { createNatalEnvelope, parseNatalEnvelope } from "../receipt.js";
import { offsetAt, prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "../geo.js";
import { HOST_PROBES, HOST_PROBES_TZDB, HOST_PROBES_UNTIL } from "./host-probes-data.js";
import { setHostForTests } from "./timezone.js";
import { nameHash } from "./zone-history.js";
// @ts-expect-error: a plain .mjs script without declarations
import { decodeTable } from "../../scripts/build-host-zone-probes.mjs";

// ZOD-283: a wall time from 1970 on is read on the host's Intl, which may carry older time zone data than the
// pinned tzdb release. Near a span in which tzdata 2021a and the pinned release differ, the host is asked for its
// offset at one probe, and a host that disagrees flags the chart "host-zone-data-differs". The two hosts below
// answer as the zic-compiled default builds of 2021a and of the pinned release inside every span (the generator's
// spelled-out intervals, which docs/evidence/host-zone-probes-20261117/ checks against zdump), and as this
// machine's Intl elsewhere, where the two releases agree. Synthetic births.

type Row = [from: string, to: string | null, probe: string, pinned: number, baseline: number];
const SPELLED = JSON.parse(readFileSync(new URL("./host-probes-intervals.json", import.meta.url), "utf8")) as {
  pinned: { version: string };
  baseline: { version: string };
  horizon: string;
  intervals: number;
  byName: Record<string, Row[]>;
};
const SPANS = new Map(
  Object.entries(SPELLED.byName).map(([name, rows]) => [
    name.toLowerCase(),
    rows.map(([from, to, , pinned, baseline]) => ({ from: Date.parse(from), to: to === null ? Infinity : Date.parse(to), pinned, baseline }))
  ])
);

/** A host whose data is the release `which` inside every span, and this machine's Intl outside them. */
function emulate(which: "pinned" | "baseline", tzdbVersion: string | null = null) {
  return {
    offsetAt(timeZone: string, ms: number): number {
      const span = SPANS.get(timeZone.toLowerCase())?.find(({ from, to }) => ms >= from && ms < to);
      return span ? span[which] / 60 : offsetAt(timeZone, ms);
    },
    tzdbVersion: () => tzdbVersion
  };
}

const STALE = () => emulate("baseline");
const CURRENT = () => emulate("pinned");

afterEach(() => setHostForTests(null));

describe("the generated table", () => {
  it("is the pinned release against 2021a, and its two generated files agree", () => {
    expect(HOST_PROBES_TZDB).toBe(SPELLED.pinned.version);
    expect(SPELLED.baseline.version).toBe("2021a");
    expect(new Date(HOST_PROBES_UNTIL).toISOString()).toBe(SPELLED.horizon.replace("Z", ".000Z"));
    const decoded = decodeTable(HOST_PROBES) as Map<number, [number, number | null, number][]>;
    let count = 0;
    for (const [name, rows] of Object.entries(SPELLED.byName)) {
      const iso = (s: number) => new Date(s * 1000).toISOString().replace(".000Z", "Z");
      expect(decoded.get(nameHash(name))?.map(([from, to, pinned]) => [iso(from), to === null ? null : iso(to), pinned]), name).toEqual(
        rows.map(([from, to, , pinned]) => [from, to, pinned])
      );
      count += rows.length;
    }
    expect(count).toBe(SPELLED.intervals);
  });

  it("names the zones whose rules changed since 2021a", () => {
    for (const name of ["America/Havana", "America/Vancouver", "America/Edmonton", "America/Winnipeg", "America/Inuvik", "Africa/Casablanca"]) {
      expect(SPELLED.byName[name]?.length, name).toBeGreaterThan(0);
    }
    // tzdata 2026f: Cuba keeps -04 through 2027-11-07; 2021a fell back on 2026-11-01 and sprang forward on 2027-03-14.
    expect(SPELLED.byName["America/Havana"]).toEqual([["2026-11-01T05:00:00Z", "2027-03-14T05:00:00Z", "2027-01-06T17:00:00Z", -14_400, -18_000]]);
  });
});

describe("a wall time the host reads", () => {
  it("is flagged where the host answers as tzdata 2021a, and keeps the host's instant", () => {
    setHostForTests(STALE());
    const resolved = resolveLocalToUtc("2026-12-15", "12:00", "America/Havana");
    expect(resolved.flags).toEqual(["host-zone-data-differs"]);
    expect(resolved.utc.toISOString()).toBe("2026-12-15T17:00:00.000Z");
    expect(resolved.offsetMinutes).toBe(-300);
    expect(resolved.zone.source).toBe("intl");
    expect(resolved.zone.hostCheck).toEqual({
      status: "differs",
      probe: "2027-01-06T17:00:00.000Z",
      hostOffsetMinutes: -300,
      tzdbOffsetMinutes: -240,
      tzdbVersion: HOST_PROBES_TZDB
    });
  });

  it("is not flagged where the host answers as the pinned release", () => {
    setHostForTests(CURRENT());
    const resolved = resolveLocalToUtc("2026-12-15", "12:00", "America/Havana");
    expect(resolved.flags).toEqual([]);
    expect(resolved.utc.toISOString()).toBe("2026-12-15T16:00:00.000Z");
    expect(resolved.zone.hostCheck).toMatchObject({ status: "current", hostOffsetMinutes: -240, tzdbOffsetMinutes: -240 });
  });

  it("is unchecked outside every span, whatever the host", () => {
    for (const host of [STALE(), CURRENT()]) {
      setHostForTests(host);
      const resolved = resolveLocalToUtc("1985-06-01", "12:00", "America/Vancouver");
      expect(resolved.flags).toEqual([]);
      expect(resolved.zone.hostCheck).toEqual({ status: "unchecked" });
    }
  });

  it("is checked within 36 hours of a span: Havana's first hour of 2026-11-01, before the span starts", () => {
    setHostForTests(STALE());
    const resolved = resolveLocalToUtc("2026-11-01", "00:30", "America/Havana");
    // 2021a repeats 00:00 to 01:00 that night; the earlier pass is 04:30Z, half an hour before the span.
    expect(resolved.utc.toISOString()).toBe("2026-11-01T04:30:00.000Z");
    expect(resolved.flags).toEqual(["dst-fold", "host-zone-data-differs"]);
    setHostForTests(CURRENT());
    expect(resolveLocalToUtc("2026-11-01", "00:30", "America/Havana").flags).toEqual([]);
  });

  it("probes inside a span one hour long: Chisinau, where 2026a moved the change from 00:00Z to 01:00Z", () => {
    setHostForTests(STALE());
    const resolved = resolveLocalToUtc("2024-03-31", "02:30", "Europe/Chisinau");
    expect(resolved.flags).toEqual(["dst-gap", "host-zone-data-differs"]);
    expect(resolved.zone.hostCheck).toMatchObject({ status: "differs", probe: "2024-03-31T00:30:00.000Z", hostOffsetMinutes: 180, tzdbOffsetMinutes: 120 });
    setHostForTests(CURRENT());
    const current = resolveLocalToUtc("2024-03-31", "02:30", "Europe/Chisinau");
    expect(current.flags).toEqual([]);
    expect(current.utc.toISOString()).toBe("2024-03-31T00:30:00.000Z");
  });

  it("checks a span still open at the horizon only up to it: Casablanca 2030-01-20 12:00 (conformance L3-TZ-0045)", () => {
    // tzdata 2021a and 2025c leave Morocco on +01 outside Ramadan and +00 in it; 2026f keeps +00 from 2026-09-20.
    // The span open from 2029-02-18 holds to the horizon, 2029-10-27, but not past it: in Ramadan 2030 the old rules
    // give +00 again. This host answers as 2021a inside the span and +00 after the horizon, as 2025c does then.
    const stale = STALE();
    setHostForTests({
      offsetAt: (zone, ms) => (zone === "Africa/Casablanca" && ms >= HOST_PROBES_UNTIL ? 0 : stale.offsetAt(zone, ms)),
      tzdbVersion: () => null
    });
    const ramadan = resolveLocalToUtc("2030-01-20", "12:00", "Africa/Casablanca");
    expect(ramadan.utc.toISOString()).toBe("2030-01-20T12:00:00.000Z");
    expect(ramadan.flags).toEqual([]);
    expect(ramadan.zone.hostCheck).toEqual({ status: "unchecked" });
    // Before the horizon, and within 36 hours after it, the span is checked as before.
    for (const [date, utc] of [["2029-10-01", "2029-10-01T11:00:00.000Z"], ["2029-10-26", "2029-10-26T11:00:00.000Z"]] as const) {
      const inside = resolveLocalToUtc(date, "12:00", "Africa/Casablanca");
      expect(inside.utc.toISOString(), date).toBe(utc);
      expect(inside.flags, date).toEqual(["host-zone-data-differs"]);
      expect(inside.zone.hostCheck, date).toMatchObject({ status: "differs", probe: "2029-04-04T02:00:00.000Z", hostOffsetMinutes: 60, tzdbOffsetMinutes: 0 });
    }
    expect(resolveLocalToUtc("2029-10-28", "06:00", "Africa/Casablanca").flags).toEqual(["host-zone-data-differs"]);
    expect(resolveLocalToUtc("2029-10-28", "12:00", "Africa/Casablanca").zone.hostCheck).toEqual({ status: "unchecked" });
  });

  it("flags a link name as its target", () => {
    setHostForTests(STALE());
    expect(resolveLocalToUtc("2026-12-15", "12:00", "Cuba").flags).toEqual(["host-zone-data-differs"]);
    expect(resolveLocalToUtc("2027-01-15", "12:00", "Canada/Pacific").flags).toEqual(["host-zone-data-differs"]);
    expect(resolveLocalToUtc("2027-01-15", "12:00", "America/Vancouver").flags).toEqual(["host-zone-data-differs"]);
    expect(resolveLocalToUtc("2026-12-15", "12:00", "america/havana").zone.hostCheck?.status).toBe("differs");
  });

  it("never probes a fixed zone", () => {
    setHostForTests(STALE());
    for (const zone of ["Etc/UTC", "UTC", "Etc/GMT+5"]) {
      const resolved = resolveLocalToUtc("2026-12-15", "12:00", zone);
      expect(resolved.zone.hostCheck, zone).toEqual({ status: "unchecked" });
      expect(resolved.flags, zone).toEqual([]);
    }
  });

  it("never probes before 1970, where the shipped history answers", async () => {
    await prepareLocalTime("1965-07-01", "America/Havana");
    setHostForTests(STALE());
    const resolved = resolveLocalToUtc("1965-07-01", "12:00", "America/Havana");
    expect(resolved.zone.source).toBe("tzdb");
    expect(resolved.zone.hostCheck).toBeUndefined();
    expect(resolved.flags).not.toContain("host-zone-data-differs");
  });

  it("keeps the RangeError of a zone name the host does not know", () => {
    setHostForTests(STALE());
    expect(() => resolveLocalToUtc("2026-12-15", "12:00", "Not/A_Zone")).toThrow(RangeError);
  });

  it("is not flagged where a runtime names a release later than the pinned one, which may know a newer rule", () => {
    setHostForTests(emulate("baseline", "2099a"));
    const resolved = resolveLocalToUtc("2026-12-15", "12:00", "America/Havana");
    expect(resolved.flags).toEqual([]);
    expect(resolved.zone.hostCheck?.status).toBe("newer");
    // A runtime naming the pinned release or an earlier one is flagged as any other.
    for (const version of [HOST_PROBES_TZDB, "2025c"]) {
      setHostForTests(emulate("baseline", version));
      expect(resolveLocalToUtc("2026-12-15", "12:00", "America/Havana").flags, version).toEqual(["host-zone-data-differs"]);
    }
  });

  it("asks the host once per zone and probe", () => {
    const probe = Date.parse("2027-01-06T17:00:00Z");
    let asked = 0;
    const stale = STALE();
    setHostForTests({ offsetAt: (zone, ms) => (ms === probe && asked++, stale.offsetAt(zone, ms)), tzdbVersion: stale.tzdbVersion });
    for (const date of ["2026-12-01", "2026-12-15", "2027-02-01"]) resolveLocalToUtc(date, "12:00", "America/Havana");
    expect(asked).toBe(1);
  });

  it("matches this machine's Intl where its tzdb is the pinned release or later, and records what it says", () => {
    const version = process.versions.tz ?? "";
    const disagreements: string[] = [];
    for (const [name, rows] of Object.entries(SPELLED.byName)) {
      for (const [, , probe, pinned] of rows) {
        if (Math.round(offsetAt(name, Date.parse(probe)) * 60) !== pinned) disagreements.push(`${name} ${probe}`);
      }
    }
    if (version >= HOST_PROBES_TZDB) expect(disagreements).toEqual([]);
    else expect(disagreements.length).toBeGreaterThan(0);
  });
});

describe("a chart from a flagged birth", () => {
  beforeAll(() => setHostForTests(null));

  it("carries the flag through natalChart and a receipt that round-trips", () => {
    setHostForTests(STALE());
    const { birth, resolution } = resolveLocalBirth({ date: "2026-12-15", time: "12:00", timeZone: "America/Havana", latitude: 23.1, longitude: -82.4 });
    expect(birth.flags).toEqual(["host-zone-data-differs"]);
    const chart = natalChart(birth);
    expect(chart.flags).toContain("host-zone-data-differs");
    const envelope = createNatalEnvelope(chart, { localResolution: resolution.localResolution });
    expect(envelope.receipt.inputFlags).toEqual(["host-zone-data-differs"]);
    const parsed = parseNatalEnvelope(JSON.stringify(envelope));
    expect(parsed.ok).toBe(true);
    expect(parsed.ok && parsed.envelope).toEqual(JSON.parse(JSON.stringify(envelope)));
  });

  it("is a time flag a caller may assert, as lmt is, refused by a receipt before 1970 or on the shipped history", async () => {
    expect(natalChart({ utc: "2027-01-01T12:00:00Z", flags: ["host-zone-data-differs"] }).flags).toContain("host-zone-data-differs");
    const envelope = (utc: string) => createNatalEnvelope(natalChart({ utc, flags: ["host-zone-data-differs"], latitude: 40, longitude: 0 }));
    expect(parseNatalEnvelope(JSON.stringify(envelope("1970-01-01T00:00:00Z"))).ok).toBe(true);
    for (const utc of ["1969-12-31T23:59:59Z", "1900-01-01T00:00:00Z"]) expect(() => envelope(utc), utc).toThrow();
    await prepareLocalTime("1965-07-01", "America/Havana");
    const shipped = resolveLocalToUtc("1965-07-01", "12:00", "America/Havana");
    const chart = natalChart({ utc: shipped.utc, flags: ["host-zone-data-differs"], latitude: 23.1, longitude: -82.4 });
    expect(() => createNatalEnvelope(chart, { localResolution: shipped.localResolution })).toThrow();
  });
});

describe("every span (property)", () => {
  // A fixed-seed generator: the same 20 instants per span on every run.
  let seed = 0x2830_2026;
  const random = () => ((seed = (Math.imul(seed, 1_103_515_245) + 12_345) >>> 0) / 2 ** 32);
  const pad = (value: number, width = 2) => String(value).padStart(width, "0");

  it("flags 20 instants inside each span on a 2021a host and none on a pinned host", async () => {
    await prepareLocalTime("1970-01-01", "America/Mazatlan");
    const rows = Object.entries(SPELLED.byName).flatMap(([name, list]) => list.map((row) => [name, row] as const));
    expect(rows.length).toBe(SPELLED.intervals);
    for (const name of new Set(rows.filter(([, [from]]) => from < "1970-01-03").map(([name]) => name))) await prepareLocalTime("1969-12-31", name);
    const failures: string[] = [];
    const handover: string[] = [];
    for (const [name, [fromText, toText]] of rows) {
      const from = Date.parse(fromText);
      const to = toText === null ? HOST_PROBES_UNTIL : Date.parse(toText);
      for (let draw = 0; draw < 20; draw += 1) {
        const instant = from + Math.floor((random() * (to - from)) / 60_000) * 60_000;
        for (const [which, flagged] of [["baseline", true], ["pinned", false]] as const) {
          const host = emulate(which);
          setHostForTests(host);
          const wall = new Date(instant + host.offsetAt(name, instant) * 60_000);
          const date = `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}`;
          const resolved = resolveLocalToUtc(date, `${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`, name);
          // In the first hours of 1970 a wall time can also be read on the shipped history, before 1970: the earlier
          // reading is taken, and an instant before 1970 is never probed.
          if (resolved.zone.source === "tzdb" && resolved.utc.getTime() < 0) {
            handover.push(`${which} ${name} ${new Date(instant).toISOString()}`);
            continue;
          }
          if (resolved.flags.includes("host-zone-data-differs") !== flagged) failures.push(`${which} ${name} ${new Date(instant).toISOString()}`);
        }
      }
    }
    expect(failures).toEqual([]);
    // Only the 1970 hand-over, only on the 2021a host, and only for a few draws.
    expect(handover.every((line) => line.startsWith("baseline ") && line.includes(" 1970-01-01T0"))).toBe(true);
    expect(handover.length).toBeLessThan(20);
  }, 120_000);
});
