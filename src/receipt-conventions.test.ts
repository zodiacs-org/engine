import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";

// Serialized by the published rc.6 package, nine minutes before the new moon
// of 2027-01-07: it records the Sun–Moon conjunction as not applying.
const rc6 = readFileSync(new URL("./fixtures/receipt-rc6.json", import.meta.url), "utf8").trim();
const edit = (json: string, change: (envelope: any) => void) => {
  const envelope = JSON.parse(json);
  change(envelope);
  return JSON.stringify(envelope);
};
const conjunction = (envelope: any) =>
  envelope.result.aspects.find((row: any) => [row.a, row.b].sort().join() === "Moon,Sun");

describe("receipt conventions", () => {
  it("still reads an rc.6 receipt and replays it", () => {
    const parsed = parseNatalEnvelope(rc6);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.engine.version).toBe("0.1.1-rc.6");
    expect(conjunction(parsed.envelope).applying).toBe(false);
    expect(natalReplayInput(parsed.envelope).utc).toBe("2027-01-07T20:15:00.000Z");
  });

  it("records the current conventions, and judges applying by them", () => {
    const envelope = createNatalEnvelope(
      natalChart({
        utc: new Date("2027-01-07T20:15:00Z"),
        latitude: 51.5,
        longitude: -0.12,
        houseSystem: "placidus",
        timeKnown: true
      })
    );
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(envelope.receipt.conventions.speed).toBe(
      "degrees-per-day;central-difference-plus-minus-0.001-day;nodes-plus-minus-0.25-day"
    );
    expect(envelope.receipt.conventions.angles).toBe("gast-and-true-obliquity");
    expect(conjunction(envelope).applying).toBe(true);
    const json = serializeNatalEnvelope(envelope);
    expect(parseNatalEnvelope(json).ok).toBe(true);
    const flipped = edit(json, (e) => {
      conjunction(e).applying = false;
    });
    expect(parseNatalEnvelope(flipped)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("still reads an rc.7 receipt, and keeps each set to the engines that wrote it", () => {
    // Serialized by the published rc.7 package (sha256 49b2b03f…) at the same instant.
    const rc7 = readFileSync(new URL("./fixtures/receipt-rc7.json", import.meta.url), "utf8").trim();
    const parsed = parseNatalEnvelope(rc7);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.engine).toEqual({ name: "@zodiacs/engine", version: "0.1.1-rc.7" });
    expect(parsed.envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[1]);
    expect(parsed.envelope.receipt.conventions.planetPositions).toBe(
      "apparent-geocentric-ecliptic-of-date"
    );
    expect(conjunction(parsed.envelope).applying).toBe(true);
    expect(natalReplayInput(parsed.envelope).utc).toBe("2027-01-07T20:15:00.000Z");
    const relabelled = edit(rc7, (e) => {
      e.receipt.engine.version = "0.1.1-rc.8";
    });
    expect(parseNatalEnvelope(relabelled)).toMatchObject({ ok: false, code: "inconsistent_result" });
    const named = edit(rc7, (e) => {
      e.receipt.engine.ephemeris = { name: "astronomy-engine", version: "2.1.19" };
    });
    expect(parseNatalEnvelope(named)).toMatchObject({ ok: false, code: "invalid_shape" });
    const current = serializeNatalEnvelope(
      createNatalEnvelope(
        natalChart({ utc: new Date("2027-01-07T20:15:00Z"), latitude: 51.5, longitude: -0.12, houseSystem: "placidus", timeKnown: true })
      )
    );
    for (const older of ["0.1.1-rc.7", "0.1.1-rc.6", "0.1.0"]) {
      const backdated = edit(current, (e) => {
        e.receipt.engine.version = older;
      });
      expect(parseNatalEnvelope(backdated)).toMatchObject({ ok: false, code: "inconsistent_result" });
    }
  });

  it("names what the positions are corrected for", () => {
    const [current] = NATAL_RECEIPT_CONVENTION_SETS;
    expect(current.planetPositions).toBe("aberrated-geocentric-ecliptic-of-date;no-deflection");
    expect(current.moonPosition).toBe(
      "astronomy-engine-ecliptic-geo-moon;no-light-time;no-aberration"
    );
  });

  it("does not judge an old receipt's flags by the new rule", () => {
    const flipped = edit(rc6, (e) => {
      conjunction(e).applying = true;
    });
    expect(parseNatalEnvelope(flipped).ok).toBe(true);
  });

  it("refuses a mixed conventions set, and an old set from a newer engine", () => {
    const hybrid = edit(rc6, (e) => {
      e.receipt.conventions.speed = NATAL_RECEIPT_CONVENTION_SETS[0].speed;
    });
    expect(parseNatalEnvelope(hybrid)).toMatchObject({ ok: false, code: "unsupported_feature" });
    const trueObliquity = edit(rc6, (e) => {
      e.receipt.conventions.angles = NATAL_RECEIPT_CONVENTION_SETS[0].angles;
    });
    expect(parseNatalEnvelope(trueObliquity)).toMatchObject({
      ok: false,
      code: "unsupported_feature"
    });
    const other = edit(rc6, (e) => {
      e.receipt.conventions.angles = "other-convention";
    });
    expect(parseNatalEnvelope(other)).toMatchObject({ ok: false, code: "unsupported_feature" });
    const relabelled = edit(rc6, (e) => {
      e.receipt.engine.version = "0.1.1-rc.7";
    });
    expect(parseNatalEnvelope(relabelled)).toMatchObject({
      ok: false,
      code: "inconsistent_result"
    });
  });
});
