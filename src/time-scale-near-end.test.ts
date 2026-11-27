/*
 * What the continuous-UTC rule changes within six hours of the IERS table's
 * end (docs/time.md, "Receipts"). A chart's speed is the change over samples
 * 0.002 day apart (the true node's 0.5 day); where one sample lies on the
 * other side of 2027-10-02T00:00Z, it is read on the other rule, so the speed
 * moves by a second-order amount and nothing else does. Held against the
 * carried 2.0.0-rc.2 archive's charts (src/fixtures/near-table-end-2.0.0-rc.2.json,
 * written by docs/evidence/continuous-utc-20261117/make-near-end-reference.mjs):
 * at or before the end a request replayed as it is, after it as the UT1
 * instant that engine read. Longitudes, latitudes, angles and cusps are the
 * same to the bit; speeds within 4e-7 degrees a day, the true node's within
 * 4e-6; and outside the six hours every speed is the same to the bit too.
 * Measured on every minute of the twelve hours and every 100 ms within 100 s
 * of the end: docs/evidence/continuous-utc-20261117/results/near-table-end-*.json.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { useDe440 } from "./de440-pack.js";
import { setDefaultEphemeris } from "./ephemeris.js";

const TEXT = readFileSync(new URL("./fixtures/near-table-end-2.0.0-rc.2.json", import.meta.url), "utf8");
const REFERENCE = JSON.parse(TEXT) as {
  version: string;
  place: { latitude: number; longitude: number; houseSystem: "placidus" };
  sources: Record<
    "de440" | "astronomy-engine",
    { utc: string; bodies: [string, number, number, number][]; angles: Record<string, number>; cusps: number[] }[]
  >;
};
const END = Date.UTC(2027, 9, 2);
const SIX_HOURS = 6 * 3_600_000;
const BOUND = { node: 4e-6, other: 4e-7 };

// The shipped pack is loaded once (useDe440(), which makes it the default) and the default set back to
// astronomy-engine, so that each test chooses its source with setDefaultEphemeris.
beforeAll(() => {
  useDe440();
  setDefaultEphemeris("astronomy-engine");
});
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("charts within six hours of the IERS table's end, against 2.0.0-rc.2", () => {
  it("are the archive's", () => {
    expect(createHash("sha256").update(TEXT).digest("hex")).toBe("c04c299d06a44b8c67c135fb580378dc103991700b8379e9d314bb998a2083aa");
    expect(REFERENCE.version).toBe("2.0.0-rc.2");
  });

  it.each(["de440", "astronomy-engine"] as const)("keep every position, angle and cusp, and move a speed only within its bound (%s)", (source) => {
    setDefaultEphemeris(source);
    let moved = 0;
    for (const old of REFERENCE.sources[source]) {
      const at = Date.parse(old.utc);
      const chart = natalChart({ utc: new Date(at), ...(at > END ? { timeScale: "ut1" as const } : {}), ...REFERENCE.place });
      expect(chart.angles, old.utc).toEqual(old.angles);
      expect(chart.houses!.cusps, old.utc).toEqual(old.cusps);
      for (const [body, lon, lat, speed] of old.bodies) {
        const row = chart.bodies.find((candidate) => candidate.body === body)!;
        expect([row.lon, row.lat], `${body} ${old.utc}`).toEqual([lon, lat]);
        const change = Math.abs(row.speed - speed);
        if (Math.abs(at - END) > SIX_HOURS) expect(change, `${body} ${old.utc}`).toBe(0);
        else expect(change, `${body} ${old.utc}`).toBeLessThanOrEqual(body.endsWith("Node") ? BOUND.node : BOUND.other);
        if (change > 0) moved += 1;
      }
    }
    // The fixture holds the instants where the change is largest, so some speeds do move.
    expect(moved).toBeGreaterThan(10);
  });
});
