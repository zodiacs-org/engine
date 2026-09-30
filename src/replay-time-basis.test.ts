/*
 * Replaying a receipt of the rc.8 conventions set, which 0.1.1-rc.8 to rc.14
 * wrote and which read the instant as UT1 ("ut1-read-as-utc"). The receipt
 * contract promises the request, not the values: natalReplayInput gives the
 * recorded instant as a UTC request, and this engine reads UTC as UTC, so the
 * sidereal time moves by UT1 − UTC. Read on UT1 with the recorded ΔT pinned,
 * the same request reproduces what rc.14 recorded (docs/time.md, Receipts).
 *
 * src/fixtures/receipt-rc14-1973.json was serialized by the carried
 * 0.1.1-rc.14 archive for a synthetic chart on a day of large UT1 − UTC,
 * 1973-01-05T06:56:44Z at 59.33 N 18.07 E, whose ascendant lies 8.4″ below
 * the end of Sagittarius (docs/evidence/rc15-20260929/make-receipt-rc14-1973.mjs).
 * The bound over 16,218 such receipts is docs/evidence/rc15-20260929/receipt-replay.json.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { NATAL_RECEIPT_CONVENTION_SETS, natalReplayInput, parseNatalEnvelope } from "./receipt.js";
import { signForLongitude } from "./signs.js";

const TEXT = readFileSync(new URL("./fixtures/receipt-rc14-1973.json", import.meta.url), "utf8");
const arcsec = (from: number, to: number) => (((((to - from) % 360) + 540) % 360) - 180) * 3600;

function parsed() {
  const result = parseNatalEnvelope(TEXT);
  if (!result.ok) throw new Error(result.code);
  return result.envelope;
}

describe("an rc.14 receipt of 1973, when UT1 − UTC was +0.80 s", () => {
  it("is the carried archive's, under the rc.8 set", () => {
    expect(createHash("sha256").update(TEXT).digest("hex")).toBe("6234a8ef034020d26807506659e07fbb20d3ddf6bb822a7ad4446a49f23432e4");
    const { receipt, result } = parsed();
    expect(receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[1]);
    expect(receipt.conventions).toMatchObject({ deltaT: "tt-minus-ut1;ut1-read-as-utc;value-in-result" });
    expect(receipt.engine.version).toBe("0.1.1-rc.14");
    expect(receipt.instant).toBe("1973-01-05T06:56:44.000Z");
    expect(result.deltaT).toMatchObject({ model: "zodiacs-deltat/1", seconds: 43.383795296220306 });
    expect(signForLongitude(result.angles!.asc).slug).toBe("sagittarius");
    expect(result.angles!.asc).toBeCloseTo(269.99765, 5);
  });

  it("replays as the UTC request it records, 11″ of ascendant away and across the sign's edge", () => {
    const envelope = parsed();
    const replay = natalChart(natalReplayInput(envelope));
    const stored = envelope.result;
    expect(replay.timeScale).toMatchObject({ input: "utc", basis: "iers" });
    expect(replay.timeScale.ut1MinusUtc!.seconds).toBeCloseTo(0.799, 3);
    // The sidereal time moves by (UT1 − UTC) × 1.00273781 × 15″/s, 12.02″; the ascendant here by 11.03″.
    expect(arcsec(stored.angles!.mc, replay.angles!.mc)).toBeCloseTo(11.90, 2);
    expect(arcsec(stored.angles!.asc, replay.angles!.asc)).toBeCloseTo(11.03, 2);
    expect(signForLongitude(replay.angles!.asc).slug).toBe("capricorn");
    // The positions move by the change of ΔT, 0.80 s here: the Moon by 0.41″.
    const moon = stored.bodies.findIndex((row) => row.body === "Moon");
    expect(arcsec(stored.bodies[moon]!.lon, replay.bodies[moon]!.lon)).toBeCloseTo(0.408, 3);
  });

  it("reproduces the recorded result on UT1 with the recorded ΔT pinned", () => {
    const envelope = parsed();
    const stored = envelope.result;
    const exact = natalChart({ ...natalReplayInput(envelope), timeScale: "ut1", deltaT: stored.deltaT!.seconds });
    expect(exact.deltaT).toMatchObject({ model: "pinned", seconds: stored.deltaT!.seconds });
    expect(exact.angles).toEqual(stored.angles);
    expect(exact.houses).toEqual(stored.houses);
    exact.bodies.forEach((row, index) => {
      const recorded = stored.bodies[index]!;
      expect(row.body).toBe(recorded.body);
      // TT is the same; rc.14 installed its model for each sample, this run the pin, so the
      // last digits differ, and the true node's velocity, a difference over 0.864 s, a little more.
      expect(Math.abs(arcsec(recorded.lon, row.lon)), row.body).toBeLessThan(1e-5);
      expect(Math.abs(row.speed - recorded.speed), row.body).toBeLessThan(/Node/.test(row.body) ? 5e-6 : 1e-6);
      expect(row.sign).toBe(recorded.sign);
    });
  });
});
