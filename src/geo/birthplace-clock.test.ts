import { beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "../api.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "../receipt.js";
import { SHARD_LOADERS } from "../tzdb/tzdb-2025c.js";
import type { ZoneShard } from "./zone-history.js";
import { offsetAt, prepareLocalTime, resolveLocalBirth, resolveLocalToUtc } from "./timezone.js";

/*
 * Ported from the Zodiacs site's localToUtc-birthplace-clock.test.ts and
 * localToUtc-birthplace-identity.test.ts. Every wall minute near a zone's
 * local mean time era end, and near each change of its shipped history, is
 * checked against a separate brute-force model read straight from the raw
 * shard: before the end, wall = t + the town's mean time; from the end,
 * wall = t + the zone's legal offset. One reading is the answer; two are a
 * fold (the earlier, `dst-fold`); none a gap, moved forward by the offset in
 * force just before (`dst-gap`).
 */
const shards = new Map<string, ZoneShard>();

/** The shard's offset (seconds east) at an instant before 1970, read from its raw fields; null for "-00". */
function shardOffset(shard: ZoneShard, ms: number): number | null {
  let index = 0;
  let at = 0;
  const parts = shard.t ? shard.t.split(",") : [];
  for (let i = 0; i < parts.length; i += 1) {
    at = i === 0 ? parseInt(parts[i]!, 36) : at + parseInt(parts[i]!, 36);
    if (at * 1000 > ms) break;
    index = i + 1;
  }
  const type = index === 0 ? 0 : parseInt(shard.k[2 * (index - 1)]!, 36);
  return shard.y[type]![0];
}

/** The zone's legal offset in seconds: the shard's before 1970 (Intl's where it has none), Intl's after. */
function legalOffset(zone: string, ms: number): number {
  const shard = shards.get(zone)!;
  const offset = ms < 0 ? shardOffset(shard, ms) : null;
  return offset ?? Math.round(offsetAt(zone, ms) * 60);
}

function wallParts(ms: number): [string, string] {
  const iso = new Date(ms).toISOString();
  return [iso.slice(0, 10), iso.slice(11, 16)];
}

async function prepare(zones: string[]): Promise<void> {
  for (const zone of zones) await prepareLocalTime("1800-01-01", zone);
  for (const load of SHARD_LOADERS) {
    for (const shard of Object.values((await load()).default)) shards.set(shard.n, shard);
  }
}

const CASES: [zone: string, town: string, longitude: number][] = [
  ["America/New_York", "Buffalo", -78.88],
  ["America/New_York", "Hartford", -72.69],
  ["America/New_York", "New York", -74.01],
  ["America/Chicago", "Omaha", -95.94],
  ["Europe/Paris", "Brest", -4.49],
  ["Europe/Paris", "Strasbourg", 7.75],
  ["Europe/Dublin", "Galway", -9.05],
  ["Europe/London", "Norwich", 1.3],
  ["Europe/Oslo", "Bergen", 5.32],
  ["America/Toronto", "Montreal", -73.57],
  ["America/Toronto", "Thunder Bay", -89.25],
  ["Asia/Kolkata", "Mumbai", 72.88],
  ["America/Mexico_City", "Merida", -89.62],
  ["America/Sitka", "Sitka", -135.33],
  ["Africa/Maseru", "Butha-Buthe", 28.25],
  ["Africa/Ouagadougou", "Aribinda", -0.87],
  ["Africa/Ouagadougou", "Bobo-Dioulasso", -4.3],
  ["Asia/Muscat", "Muscat", 58.41],
  ["Africa/Mbabane", "Manzini", 31.38],
  // Towns whose mean time puts an in-era reading one second before the end.
  ["Asia/Seoul", "Andong", 128.72],
  ["Africa/Cairo", "Armant", 32.54]
];

describe("the birthplace clock at the end of its local mean time era", () => {
  beforeAll(() => prepare([...new Set(CASES.map(([zone]) => zone))]));

  it.each(CASES)("%s: %s", (zone, _town, longitude) => {
    const shard = shards.get(zone)!;
    const endMs = shard.e!.at(-1)![0] * 1000;
    const legalAt = (t: number) => legalOffset(zone, Math.max(t, endMs));
    const meanSeconds = Math.round(longitude * 240);
    const zoneBefore = shard.e!.at(-1)![1];
    const place = meanSeconds + Math.round((zoneBefore - meanSeconds) / 86_400) * 86_400;
    const endWall = endMs + place * 1000;
    const start = Math.floor((endWall - 26 * 3_600_000) / 60_000) * 60_000;
    const failures: string[] = [];
    let receipts = 0;
    let previousFlag = "";
    for (let wall = start; wall <= endWall + 26 * 3_600_000; wall += 60_000) {
      const readings: { t: number; offset: number }[] = [];
      const inEra = wall - place * 1000;
      if (inEra < endMs) readings.push({ t: inEra, offset: place });
      const legal = new Set([endMs, wall - 36 * 3_600_000, wall, wall + 36 * 3_600_000, endMs + 86_400_000].map(legalAt));
      for (const offset of legal) {
        const t = wall - offset * 1000;
        if (t >= endMs && legalAt(t) === offset && !readings.some((r) => r.t === t)) readings.push({ t, offset });
      }
      readings.sort((a, b) => a.t - b.t);
      const expected =
        readings.length === 0
          ? { t: inEra, offset: legalAt(inEra), flag: "dst-gap" }
          : { t: readings[0]!.t, offset: readings[0]!.offset, flag: readings.length > 1 ? "dst-fold" : "" };
      const [date, time] = wallParts(wall);
      const resolved = resolveLocalToUtc(date, time, zone, { longitude });
      const flag = resolved.flags.filter((f) => f !== "lmt").join(",");
      const lmtAgrees = resolved.flags.includes("lmt") === resolved.utc.getTime() < endMs;
      if (
        resolved.utc.getTime() !== expected.t ||
        Math.abs(resolved.offsetMinutes - expected.offset / 60) > 1e-9 ||
        flag !== expected.flag ||
        !lmtAgrees
      ) {
        failures.push(
          `${date} ${time}: got ${resolved.utc.toISOString()} ${resolved.offsetMinutes} [${resolved.flags}], ` +
            `expected ${new Date(expected.t).toISOString()} ${expected.offset / 60} [${expected.flag}]`
        );
      }
      // Every jump at the era end is the legal change out of local mean time.
      if (expected.flag && resolved.jump?.cause !== "legal-change" && Math.abs(expected.offset - place) < 43_200) {
        failures.push(`${date} ${time}: cause ${resolved.jump?.cause}`);
      }
      // A receipt for the first minute of each run of flagged readings, and every six hours.
      const firstFlagged = flag !== "" && flag !== previousFlag;
      previousFlag = flag;
      if (firstFlagged || (wall - start) % (6 * 60 * 60_000) === 0) {
        receipts += 1;
        const { birth, resolution, reference } = resolveLocalBirth({
          date, time, timeZone: zone, latitude: 40, longitude, houseSystem: "placidus"
        });
        const envelope = createNatalEnvelope(natalChart(birth), { reference, localResolution: resolution.localResolution });
        if (!parseNatalEnvelope(serializeNatalEnvelope(envelope)).ok) failures.push(`${date} ${time}: receipt did not validate`);
      }
    }
    expect(receipts).toBeGreaterThan(8);
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

const LEGAL_CASES: [zone: string, town: string, longitude: number][] = [
  ["America/New_York", "New York", -74.01],
  ["Europe/Stockholm", "Stockholm", 18.07],
  ["Europe/Amsterdam", "Amsterdam", 4.89],
  ["Atlantic/Reykjavik", "Reykjavik", -21.9],
  ["America/Aruba", "Oranjestad", -70.03]
];

describe("the birthplace clock at each change of its shipped history before 1970", () => {
  beforeAll(() => prepare(LEGAL_CASES.map(([zone]) => zone)));

  it.each(LEGAL_CASES)("%s: %s", (zone, _town, longitude) => {
    const shard = shards.get(zone)!;
    const eraEnd = shard.e ? shard.e.at(-1)![0] * 1000 : Number.NEGATIVE_INFINITY;
    const failures: string[] = [];
    let changes = 0;
    let gaps = 0;
    let folds = 0;
    let at = 0;
    const parts = shard.t.split(",");
    parts.forEach((part, index) => {
      at = index === 0 ? parseInt(part, 36) : at + parseInt(part, 36);
      const ms = at * 1000;
      const before = legalOffset(zone, ms - 1);
      const after = legalOffset(zone, ms);
      if (ms - eraEnd < 2 * 86_400_000 || before === after) return;
      changes += 1;
      const jumpWall = ms + Math.min(before, after) * 1000;
      const first = Math.floor((jumpWall - 90 * 60_000) / 60_000) * 60_000;
      for (let wall = first; wall <= jumpWall + 90 * 60_000 + Math.abs(after - before) * 1000; wall += 60_000) {
        const readings = [before, after]
          .map((offset) => ({ t: wall - offset * 1000, offset }))
          .filter(({ t, offset }) => legalOffset(zone, t) === offset)
          .sort((a, b) => a.t - b.t);
        const expected =
          readings.length === 0
            ? { t: wall - before * 1000, offset: legalOffset(zone, wall - before * 1000), flag: "dst-gap" }
            : {
                t: readings[0]!.t,
                offset: readings[0]!.offset,
                flag: readings.length > 1 && readings[0]!.t !== readings[1]!.t ? "dst-fold" : ""
              };
        if (expected.flag === "dst-gap") gaps += 1;
        if (expected.flag === "dst-fold") folds += 1;
        const [date, time] = wallParts(wall);
        const resolved = resolveLocalToUtc(date, time, zone, { longitude });
        const flag = resolved.flags.filter((f) => f !== "lmt").join(",");
        if (
          resolved.utc.getTime() !== expected.t ||
          Math.abs(resolved.offsetMinutes - expected.offset / 60) > 1e-9 ||
          flag !== expected.flag
        ) {
          failures.push(
            `${date} ${time}: got ${resolved.utc.toISOString()} ${resolved.offsetMinutes} [${resolved.flags}], ` +
              `expected ${new Date(expected.t).toISOString()} ${expected.offset / 60} [${expected.flag}]`
          );
        }
        if (expected.flag && resolved.transition?.at !== new Date(ms).toISOString()) {
          failures.push(`${date} ${time}: transition ${resolved.transition?.at}`);
        }
      }
    });
    expect(changes).toBeGreaterThan(0);
    expect(gaps + folds).toBeGreaterThan(0);
    expect(failures.slice(0, 5)).toEqual([]);
  });
});

/*
 * A town on its zone's own reference meridian keeps the zone's clock. So at
 * every era end where the shipped history continues the era's own mean time
 * up to the end and changes there, resolving with that meridian's longitude
 * must give what resolving without one gives: the same instant, offset and
 * flags, minute by minute across the jump and an hour either side, and every
 * two hours within 26 hours of the end.
 */
describe("the birthplace clock on its zone's own meridian", () => {
  const agreeing: string[] = [];
  beforeAll(async () => {
    await prepare([]);
    for (const shard of shards.values()) {
      if (!shard.e || shard.h) continue;
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: shard.n });
      } catch {
        continue;
      }
      await prepareLocalTime("1800-01-01", shard.n);
      const endMs = shard.e.at(-1)![0] * 1000;
      const eraSeconds = shard.e.at(-1)![1];
      const before = shardOffset(shard, endMs - 1);
      const after = shardOffset(shard, endMs);
      if (before !== eraSeconds || after === null || after === before) continue;
      if (shardOffset(shard, endMs + 36 * 3_600_000) !== after) continue;
      agreeing.push(shard.n);
    }
  }, 120_000);

  it("covers most era ends", () => {
    // 438 of the 518 eras; most of the rest end in a legal mean time at the
    // same offset (Paris, Dublin, Lisbon), where no clock jumps.
    expect(agreeing.length).toBeGreaterThan(430);
  });

  it("matches the zone clock at every such era end", () => {
    const failures: string[] = [];
    let checked = 0;
    let jumps = 0;
    for (const zone of agreeing) {
      const shard = shards.get(zone)!;
      const endMs = shard.e!.at(-1)![0] * 1000;
      const seconds = shard.e!.at(-1)![1];
      // The same mean time, on the side of the date line a longitude can name.
      const longitude = (Math.abs(seconds) > 43_200 ? seconds - Math.sign(seconds) * 86_400 : seconds) / 240;
      const walls = [endMs + seconds * 1000, endMs + (shardOffset(shard, endMs) ?? 0) * 1000];
      const low = Math.floor((Math.min(...walls) - 3_600_000) / 60_000) * 60_000;
      const high = Math.max(...walls) + 3_600_000;
      const times = new Set<number>();
      for (let wall = low; wall <= high; wall += 60_000) times.add(wall);
      for (let wall = low - 26 * 3_600_000; wall <= high + 26 * 3_600_000; wall += 2 * 3_600_000) times.add(wall);
      for (const wall of times) {
        const [date, time] = wallParts(wall);
        const zoneClock = resolveLocalToUtc(date, time, zone);
        const ownMeridian = resolveLocalToUtc(date, time, zone, { longitude });
        checked += 1;
        if (zoneClock.jump) jumps += 1;
        if (
          ownMeridian.utc.getTime() !== zoneClock.utc.getTime() ||
          Math.abs(ownMeridian.offsetMinutes - zoneClock.offsetMinutes) > 1e-9 ||
          ownMeridian.flags.join() !== zoneClock.flags.join()
        ) {
          failures.push(
            `${zone} ${date} ${time}: ${ownMeridian.utc.toISOString()} [${ownMeridian.flags}] ` +
              `where the zone clock gives ${zoneClock.utc.toISOString()} [${zoneClock.flags}]`
          );
        }
      }
    }
    expect(checked).toBeGreaterThan(70_000);
    expect(jumps).toBeGreaterThan(5_000);
    expect(failures.slice(0, 5)).toEqual([]);
  }, 300_000);
});
