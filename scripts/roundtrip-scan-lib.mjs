/*
 * The engine audit's all-zone round-trip scan (finding time-9; the Zodiacs
 * site's localToUtc-roundtrip.test.ts), run against the zone clock this
 * package ships: the tzdb 2025c history with backzone before 1970, the host's
 * Intl after. For every zone it finds every offset change of that clock from
 * 1850 on, resolves wall minutes around each with resolveLocalToUtc, and
 * compares with a brute-force reading: every offset in force near the change
 * is tried; one match is the answer, two are a fold (the earlier, with
 * `dst-fold`), none is a gap (moved forward by the offset just before, with
 * `dst-gap`).
 *
 * `geo` is the package's geo entry (source or build); `scope` is
 * { end, stepDays, deltas, dense } as in `SCOPES`.
 */
export const SCOPES = {
  // The unit suite's: to the end of 2037, a three-day step, the minute before,
  // at and after each edge of every gap or fold, and its midpoint. A step finds
  // a change whose offset lasts at least that long; the shortest in this span
  // lasts 3.99 days (Freetown, 1939-09-01 to 09-05), so the scan finds every
  // one of zic's 39,839 (rc.15's first cut stepped two weeks and missed 10).
  default: { end: Date.UTC(2038, 0, 1), stepDays: 3, deltas: [-1, 0, 1], dense: false },
  // The audit's: to 2100, a daily step, wider sampling.
  full: { end: Date.UTC(2101, 0, 1), stepDays: 1, deltas: [-120, -60, -30, -2, -1, 0, 1, 2, 30, 60, 120], dense: true }
};

const START = Date.UTC(1850, 0, 1);
const MINUTE = 60_000;
const HOUR = 3_600_000;

/** Zones to scan: every name the shipped history holds that the host's Intl supports, and every Intl zone. */
export async function scanZones(geo, loaders) {
  const names = new Set(Intl.supportedValuesOf("timeZone"));
  for (const load of loaders) for (const shard of Object.values((await load()).default)) names.add(shard.n);
  const zones = [];
  for (const name of [...names].sort()) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
    } catch {
      continue;
    }
    await geo.prepareLocalTime("1850-01-01", name);
    zones.push(name);
  }
  return zones;
}

export function scanZone(geo, zone, scope) {
  const offsetAt = (ms) => geo.zoneOffsetAt(zone, ms);
  const step = scope.stepDays * 86_400_000;
  const firstChange = (lo, hi) => {
    const from = offsetAt(lo);
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (offsetAt(mid) === from) lo = mid;
      else hi = mid;
    }
    return hi;
  };
  const changes = [];
  let previous = offsetAt(START);
  for (let t = START + step; t <= scope.end; t += step) {
    const current = offsetAt(t);
    if (current === previous) continue;
    // Several changes inside one step are found one after another.
    for (let lo = t - step; offsetAt(lo) !== current; ) {
      const at = firstChange(lo, t);
      changes.push({ at, before: offsetAt(at - 1), after: offsetAt(at) });
      lo = at;
    }
    previous = current;
  }
  const failures = [];
  let tested = 0;
  for (const change of changes) {
    const near = new Set([offsetAt(change.at - 50 * HOUR), offsetAt(change.at + 50 * HOUR)]);
    for (const other of changes) {
      if (Math.abs(other.at - change.at) < 60 * HOUR) near.add(other.before).add(other.after);
    }
    const low = change.at + Math.min(change.before, change.after) * MINUTE;
    const high = change.at + Math.max(change.before, change.after) * MINUTE;
    const walls = new Set();
    for (const edge of [low, high]) for (const delta of scope.deltas) walls.add(edge + delta * MINUTE);
    if (scope.dense) for (let wall = low - 2 * HOUR; wall <= high + 2 * HOUR; wall += 10 * MINUTE) walls.add(wall);
    else walls.add(low + (high - low) / 2);
    for (const raw of walls) {
      const wall = Math.floor(raw / MINUTE) * MINUTE;
      if (wall < START || wall >= scope.end) continue;
      const matches = [...near]
        .map((offset) => wall - Math.round(offset * MINUTE))
        .filter((utc) => Math.abs(offsetAt(utc) * MINUTE - (wall - utc)) < 1)
        .sort((a, b) => a - b);
      const expected =
        matches.length === 0
          ? { utc: wall - Math.round(offsetAt(change.at - 1) * MINUTE), flag: "dst-gap" }
          : { utc: matches[0], flag: matches.length > 1 ? "dst-fold" : null };
      const iso = new Date(wall).toISOString();
      const resolved = geo.resolveLocalToUtc(iso.slice(0, 10), iso.slice(11, 16), zone);
      const flag = resolved.flags.find((f) => f === "dst-gap" || f === "dst-fold") ?? null;
      if (resolved.utc.getTime() !== expected.utc || flag !== expected.flag) {
        failures.push(
          `${zone} ${iso.slice(0, 16)}: got ${resolved.utc.toISOString()} ${flag}, ` +
            `expected ${new Date(expected.utc).toISOString()} ${expected.flag}`
        );
      }
      tested += 1;
    }
  }
  return { transitions: changes.length, changes: changes.map((change) => change.at), tested, failures };
}
