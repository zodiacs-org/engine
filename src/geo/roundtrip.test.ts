import { beforeAll, describe, expect, it } from "vitest";

import { SCOPES, scanZone, scanZones } from "../../scripts/roundtrip-scan-lib.mjs";
import { SHARD_LOADERS } from "../tzdb/tzdb-2025c.js";
import * as geo from "./timezone.js";

const HOST_IS_2025C = (globalThis as { process?: { versions?: { tz?: string } } }).process?.versions?.tz === "2025c";

/*
 * The audit's all-zone round-trip scan against the shipped zone clock (tzdb
 * 2025c with backzone before 1970, Intl after): every offset change of every
 * zone from 1850 to the end of 2037, found on a three-day step, shorter than
 * the shortest-lived offset of that span (3.99 days, Freetown in 1939), with
 * the minute before, at and after each edge of every gap or fold and its
 * midpoint. The full scope, to 2100 on a daily step with wider sampling, is
 * scripts/roundtrip-scan.mjs, whose result is recorded in
 * docs/evidence/rc15-20260929/.
 */
describe("resolveLocalToUtc on the shipped zone clock, around every offset change, 1850-2037", () => {
  let zones: string[] = [];
  const totals = { transitions: 0, tested: 0 };
  beforeAll(async () => {
    zones = await scanZones(geo, SHARD_LOADERS);
  }, 120_000);

  const GROUPS = 12;
  it.each(Array.from({ length: GROUPS }, (_, group) => group + 1))("round-trips zone group %i of 12", (group) => {
    const failures: string[] = [];
    for (const zone of zones.filter((_, index) => index % GROUPS === group - 1)) {
      const result = scanZone(geo, zone, SCOPES.default);
      totals.transitions += result.transitions;
      totals.tested += result.tested;
      failures.push(...result.failures);
    }
    expect(failures.slice(0, 10)).toEqual([]);
  }, 300_000);

  it("covered every zone and every offset change it found", () => {
    expect(zones.length).toBeGreaterThan(590);
    expect(totals.transitions).toBeGreaterThan(30_000);
    expect(totals.tested).toBeGreaterThan(200_000);
    // zic 2025c's own count for the 597 names (docs/evidence/rc15-20260929/README.md), where Intl is tzdb 2025c.
    if (HOST_IS_2025C) expect(totals.transitions).toBe(39_839);
  });

  it.each([
    // [zone, the excursion's first change, its last] from zic 2025c; rc.15's two-week step missed all five.
    ["Africa/Freetown", "1939-09-01T01:00:00Z", "1939-09-05T00:40:00Z"],
    ["America/Boa_Vista", "2000-10-08T04:00:00Z", "2000-10-15T03:00:00Z"],
    ["America/Noronha", "2000-10-08T02:00:00Z", "2000-10-15T01:00:00Z"],
    ["Brazil/DeNoronha", "2000-10-08T02:00:00Z", "2000-10-15T01:00:00Z"],
    ["America/Recife", "2000-10-08T03:00:00Z", "2000-10-15T02:00:00Z"]
  ])("finds and round-trips %s's offset of under a week, %s to %s", (zone, from, to) => {
    const result = scanZone(geo, zone, SCOPES.default);
    expect(result.changes).toContain(Date.parse(from));
    expect(result.changes).toContain(Date.parse(to));
    expect(result.failures).toEqual([]);
  });
});
