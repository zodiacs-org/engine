/*
 * Natal records and the continuous-UTC rule (docs/time.md, "Receipts").
 *
 * A chart whose time basis is "continuous-utc" is written under its own
 * conventions set, which requires the feature "time-basis-continuous-utc", so
 * that 1.1.0 and 2.0.0-rc.2 refuse it as unsupported_feature
 * (docs/evidence/continuous-utc-20261117/results/new-receipt-on-earlier-engines.json).
 * A record those engines wrote after the IERS table, on their rule (UTC read as
 * UT1, basis "delta-t", UT1 − UTC 0 within 0.9 s), still verifies, by that
 * rule, and replays to the same numbers as a UT1 request.
 *
 * src/fixtures/receipt-1.1.0-after-table.json and
 * receipt-2.0.0-rc.2-after-table.json were serialized by the carried archives
 * for a synthetic chart, 2030-06-15T12:00:00Z at 51.5 N 0.12 W
 * (docs/evidence/continuous-utc-20261117/make-receipt.mjs).
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { natalConventionIds } from "./conventions.js";
import { setDefaultEphemeris } from "./ephemeris.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import type { NatalEnvelope } from "./receipt.js";
import { timeBasis, timeBasisBeforeContinuousUtc } from "./time-scale.js";

const FIXTURES = {
  "1.1.0": "5ca2dde3a14e5de5f797c62df5ae0d861e1c0afaa749f675c08432930cd2c32d",
  "2.0.0-rc.2": "a7d26844903fa3177740746b5837cc2dc66570335eed983634d2832949543871"
} as const;
const text = (version: string) => readFileSync(new URL(`./fixtures/receipt-${version}-after-table.json`, import.meta.url), "utf8");
const parsed = (json: string): NatalEnvelope => {
  const result = parseNatalEnvelope(json);
  if (!result.ok) throw new Error(result.code);
  return result.envelope;
};
const BIRTH = { utc: "2030-06-15T12:00:00Z", latitude: 51.5, longitude: -0.12 } as const;
const OLD_TIME_SCALE = "tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;delta-t-model-otherwise;in-result";
/** The ids the edited fields name, so that only the rule under test can refuse the record. */
const withOwnIds = (envelope: any) => {
  envelope.receipt.conventionIds = natalConventionIds(envelope);
  return JSON.stringify(envelope);
};

beforeAll(() => setDefaultEphemeris("de440"));
afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe.each(Object.keys(FIXTURES) as (keyof typeof FIXTURES)[])("a %s record after the IERS table", (version) => {
  it("is the carried archive's, on the rule before continuous UTC", () => {
    expect(createHash("sha256").update(text(version)).digest("hex")).toBe(FIXTURES[version]);
    const { receipt, result } = parsed(text(version));
    expect(receipt.engine.version).toBe(version);
    expect(receipt.conventions.timeScale).toBe(OLD_TIME_SCALE);
    expect(receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[6]);
    expect(result.timeScale).toEqual({ input: "utc", basis: "delta-t", ut1MinusUtc: { seconds: 0, sigma: 0.9, source: "fallback" }, leapSeconds: null });
    expect(receipt.resultFlags).toEqual(["delta-t-extrapolated"]);
  });

  it("verifies by that rule: its ΔT and time scale are the old rule's, and this engine's would be refused under its set", () => {
    const envelope = JSON.parse(text(version));
    const old = timeBasisBeforeContinuousUtc(Date.parse(BIRTH.utc));
    expect(envelope.result.deltaT.seconds).toBe(old.deltaT.seconds);
    // The same record carrying this engine's time basis under the old set is inconsistent.
    const now = natalChart(BIRTH);
    envelope.result.deltaT = { ...now.deltaT };
    envelope.result.timeScale = { ...now.timeScale };
    expect(parseNatalEnvelope(withOwnIds(envelope))).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("replays as the UT1 instant that engine read, to the bit", () => {
    const envelope = parsed(text(version));
    const request = natalReplayInput(envelope);
    expect(request).toMatchObject({ utc: "2030-06-15T12:00:00.000Z", timeScale: "ut1" });
    const replay = natalChart(request);
    const stored = envelope.result;
    expect(replay.ephemeris?.name).toBe("jpl-de440");
    expect(replay.bodies.map(({ body, lon, lat, speed }) => ({ body, lon, lat, speed }))).toEqual(
      stored.bodies.map(({ body, lon, lat, speed }) => ({ body, lon, lat, speed }))
    );
    expect(replay.angles).toEqual(stored.angles);
    expect(replay.houses?.cusps).toEqual(stored.houses?.cusps);
    expect(replay.aspects.length).toBe(stored.aspects.length);
    expect(replay.deltaT).toEqual(stored.deltaT);
    expect(replay.flags).toEqual(envelope.receipt.resultFlags);
    // Its time scale says what the old engine did: the instant read as UT1, now on the continuous-UTC basis.
    expect(replay.timeScale).toMatchObject({ input: "ut1", basis: "continuous-utc" });
    // A record of the replay is a new record, under the continuous-UTC set, and replays to itself.
    const again = parsed(serializeNatalEnvelope(createNatalEnvelope(replay)));
    expect(natalReplayInput(again)).toMatchObject({ timeScale: "ut1" });
  });
});

describe("a 0.1.1-rc.14 record after the IERS table, under the rc.8 set", () => {
  // Written by the carried rc.14 archive (docs/evidence/continuous-utc-20261117/make-receipt.mjs), which read
  // every instant as UT1 and had no time scale in its result.
  const json = () => readFileSync(new URL("./fixtures/receipt-0.1.1-rc.14-after-table.json", import.meta.url), "utf8");

  it("replays as the UT1 instant that engine read, so that the continuous-UTC rule does not move it", () => {
    expect(createHash("sha256").update(json()).digest("hex")).toBe("1667adc5dcb8640bc6e5b7f8418ab1cfdc9baff6b444bd14eca2367e2b0f59f0");
    const envelope = parsed(json());
    expect(envelope.receipt.engine.version).toBe("0.1.1-rc.14");
    expect(envelope.receipt.conventions.deltaT).toBe("tt-minus-ut1;ut1-read-as-utc;value-in-result");
    expect(envelope.result.timeScale).toBeUndefined();
    const request = natalReplayInput(envelope);
    expect(request).toMatchObject({ utc: "2030-06-15T12:00:00.000Z", timeScale: "ut1" });
    setDefaultEphemeris("astronomy-engine");
    try {
      // The same UT1 and the same model ΔT, so the same TT: what moves is the nutation since rc.16 (docs/time.md).
      const replay = natalChart(request);
      expect(Math.abs(replay.deltaT.seconds - envelope.result.deltaT!.seconds)).toBeLessThan(1e-6);
      const moon = (bodies: readonly { body: string; lon: number }[]) => bodies.find((row) => row.body === "Moon")!.lon;
      expect(Math.abs(moon(replay.bodies) - moon(envelope.result.bodies)) * 3600).toBeLessThan(1);
      // Read on UTC its TT would be 0.47 s earlier, about 0.26″ of the Moon's motion, on top.
      const ms = Date.parse(request.utc as string);
      expect((timeBasis(ms, "ut1").ttDays - timeBasis(ms, "utc").ttDays) * 86_400).toBeCloseTo(69.654 - 69.184, 3);
    } finally {
      setDefaultEphemeris("de440");
    }
  });

  it("leaves a record of the same set inside the table on UTC, as it replayed before", () => {
    // src/fixtures/receipt-rc14-1973.json, the carried rc.14 archive's (src/replay-time-basis.test.ts).
    const inside = parsed(readFileSync(new URL("./fixtures/receipt-rc14-1973.json", import.meta.url), "utf8"));
    expect(inside.result.timeScale).toBeUndefined();
    expect(natalReplayInput(inside)).not.toHaveProperty("timeScale");
  });
});

describe("a record of a chart on the continuous-UTC rule", () => {
  const sets = (de440: boolean) => NATAL_RECEIPT_CONVENTION_SETS[de440 ? 8 : 7];

  it.each([true, false])("is written under its own set and requires its feature (DE440 pack: %s)", (de440) => {
    setDefaultEphemeris(de440 ? "de440" : "astronomy-engine");
    try {
      const chart = natalChart(BIRTH);
      expect(chart.timeScale.basis).toBe("continuous-utc");
      const envelope = parsed(serializeNatalEnvelope(createNatalEnvelope(chart)));
      expect(envelope.receipt.conventions).toEqual(sets(de440));
      expect(envelope.receipt.conventions.timeScale).toBe(
        "tt-from-leap-seconds-and-ut1-from-iers-1972-to-table-end;tt-utc-plus-69.184s-and-ut1-from-delta-t-model-after;delta-t-model-before-1972;in-result"
      );
      expect(envelope.requiredFeatures).toEqual(["convention-ids", ...(de440 ? ["ephemeris-jpl-de440"] : []), "time-basis-continuous-utc"]);
      expect(envelope.receipt.conventionIds).toContain("time-basis:continuous-utc");
      expect(envelope.receipt.conventionIds).toContain("ut1-source:model");
      // Its replay is the same request and the same chart, to the bit.
      const request = natalReplayInput(envelope);
      expect(request).not.toHaveProperty("timeScale");
      const replay = natalChart(request);
      expect(replay.bodies).toEqual(chart.bodies);
      expect(replay.angles).toEqual(chart.angles);
      expect(replay.timeScale).toEqual(chart.timeScale);
      expect(replay.deltaT).toEqual(chart.deltaT);
    } finally {
      setDefaultEphemeris("de440");
    }
  });

  it("keeps the earlier sets for every other chart: inside the table, before 1972, pinned", () => {
    for (const birth of [
      { utc: "2027-10-02T00:00:00.000Z", latitude: 10, longitude: 10 },
      { utc: "1960-01-01T00:00:00Z", latitude: 10, longitude: 10 },
      { ...BIRTH, deltaT: 70 }
    ]) {
      const envelope = createNatalEnvelope(natalChart(birth));
      expect(envelope.receipt.conventions.timeScale, birth.utc).toBe(OLD_TIME_SCALE);
      expect(envelope.requiredFeatures).not.toContain("time-basis-continuous-utc");
    }
  });

  it("is refused without its feature, under an earlier set, or naming an engine before the rule", () => {
    const json = serializeNatalEnvelope(createNatalEnvelope(natalChart(BIRTH)));
    const withoutFeature = JSON.parse(json);
    withoutFeature.requiredFeatures = withoutFeature.requiredFeatures.filter((feature: string) => feature !== "time-basis-continuous-utc");
    expect(parseNatalEnvelope(JSON.stringify(withoutFeature))).toMatchObject({ ok: false, code: "inconsistent_result" });
    const underOldSet = JSON.parse(json);
    underOldSet.receipt.conventions = { ...NATAL_RECEIPT_CONVENTION_SETS[6] };
    underOldSet.requiredFeatures = ["convention-ids", "ephemeris-jpl-de440"];
    expect(parseNatalEnvelope(withOwnIds(underOldSet))).toMatchObject({ ok: false, code: "inconsistent_result" });
    const earlyEngine = JSON.parse(json);
    earlyEngine.receipt.engine.version = "1.1.0";
    expect(parseNatalEnvelope(withOwnIds(earlyEngine))).toMatchObject({ ok: false, code: "inconsistent_result" });
    // An unknown feature is refused before anything else, as an earlier engine refuses this one.
    const unknown = JSON.parse(json);
    unknown.requiredFeatures.push("time-basis-something-else");
    expect(parseNatalEnvelope(JSON.stringify(unknown))).toMatchObject({ ok: false, code: "unsupported_feature" });
  });

  it("bounds UT1 − UTC to a day and its band to 3,600 s, and takes the source model only on this basis", () => {
    const json = serializeNatalEnvelope(createNatalEnvelope(natalChart(BIRTH)));
    const edit = (change: (ut1: any) => void) => {
      const envelope = JSON.parse(json);
      change(envelope.result.timeScale.ut1MinusUtc);
      return parseNatalEnvelope(withOwnIds(envelope));
    };
    expect(edit((ut1) => (ut1.seconds = 86_401))).toMatchObject({ ok: false, code: "invalid_value" });
    expect(edit((ut1) => (ut1.sigma = 3601))).toMatchObject({ ok: false, code: "invalid_value" });
    expect(edit((ut1) => (ut1.source = "fallback"))).toMatchObject({ ok: false, code: "inconsistent_result" });
    // A value the engine does not give at the instant is inconsistent with it.
    expect(edit((ut1) => (ut1.seconds += 0.5))).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("writes and reads a record in 2957 and later, where UT1 − UTC passes an hour", () => {
    setDefaultEphemeris("astronomy-engine");
    try {
      const chart = natalChart({ utc: "3197-09-19T00:00:00Z", latitude: 10, longitude: 10 });
      expect(chart.timeScale.ut1MinusUtc!.seconds).toBeLessThan(-3600);
      expect(parseNatalEnvelope(serializeNatalEnvelope(createNatalEnvelope(chart))).ok).toBe(true);
    } finally {
      setDefaultEphemeris("de440");
    }
  });
});
