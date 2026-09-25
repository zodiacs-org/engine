import { readFileSync } from "node:fs";
import { MakeTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { natalChart, positions } from "./api.js";
import { DELTA_T_MODEL, DELTA_T_TABLE, deltaT, deltaTAt } from "./deltat.js";
import { bodyLongitude, computeChart } from "./ephemeris.js";
import {
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";

const J2000 = Date.UTC(2000, 0, 1, 12);
const utOf = (date: Date) => (date.getTime() - J2000) / 86_400_000;
const birth = {
  utc: "2026-09-22T12:00:00Z",
  latitude: 51.5,
  longitude: -0.12,
  houseSystem: "placidus" as const,
  timeKnown: true
};

describe("the engine's clock", () => {
  it("computes every chart on the model and says so", () => {
    const chart = natalChart(birth);
    expect(chart.deltaT).toEqual(deltaTAt(utOf(chart.input.utc)));
    expect(chart.deltaT.model).toBe(DELTA_T_MODEL);
    expect(chart.deltaT.table).toBe(DELTA_T_TABLE.version);
    expect(chart.deltaT.tableDigest).toBe(DELTA_T_TABLE.digest);
    // astronomy-engine's own clock now reads the model.
    const time = MakeTime(chart.input.utc);
    expect((time.tt - time.ut) * 86_400).toBeCloseTo(deltaT(time.ut), 6);
  });

  it("uses a caller's pin for one chart and restores the model after it", () => {
    const utc = new Date(birth.utc);
    const model = bodyLongitude("Moon", utc);
    const modelSeconds = deltaT(utOf(utc));
    const pinned = natalChart({ ...birth, deltaT: modelSeconds + 60 });
    expect(pinned.deltaT).toEqual({
      seconds: modelSeconds + 60,
      sigma: null,
      model: "pinned",
      table: null,
      tableDigest: null,
      segment: "pinned"
    });
    expect(pinned.input.deltaT).toBe(modelSeconds + 60);
    // A minute of ΔT moves the Moon by about half a minute of arc.
    const moon = pinned.bodies.find((body) => body.body === "Moon")!;
    expect(Math.abs(moon.lon - model) * 3600).toBeGreaterThan(20);
    expect(bodyLongitude("Moon", utc)).toBe(model);
    expect(natalChart(birth).deltaT.model).toBe(DELTA_T_MODEL);
  });

  it("restores the model when a pinned chart throws", () => {
    expect(() =>
      computeChart({
        utc: new Date(Number.NaN),
        houseSystem: "whole",
        timeKnown: false,
        deltaT: 1_000
      })
    ).toThrow();
    const utc = new Date(birth.utc);
    const time = MakeTime(utc);
    expect((time.tt - time.ut) * 86_400).toBeCloseTo(deltaT(utOf(utc)), 6);
  });

  it("refuses a pin that is not a finite number of seconds", () => {
    for (const bad of [Number.NaN, Infinity, 1e11, "60" as unknown as number]) {
      expect(() => natalChart({ ...birth, deltaT: bad })).toThrow(RangeError);
    }
  });

  it("moves today's Moon by what the old clock got wrong", () => {
    // rc.7 used astronomy-engine's 2004 polynomial: 75.497 s on 2026-09-22,
    // where IERS has 69.196 s.
    const utc = new Date(birth.utc);
    const modelSeconds = deltaT(utOf(utc));
    expect(Math.abs(modelSeconds - 69.196)).toBeLessThan(0.2);
    const old = natalChart({ ...birth, deltaT: 75.497 }).bodies[1]!;
    const now = positions(utc)[1]!;
    expect(old.body).toBe("Moon");
    const shift = (old.lon - now.lon) * 3600;
    expect(shift).toBeGreaterThan(3);
    expect(shift).toBeLessThan(4);
  });
});

describe("ΔT in receipts", () => {
  const json = serializeNatalEnvelope(createNatalEnvelope(natalChart(birth)));
  const edit = (change: (envelope: any) => void) => {
    const envelope = JSON.parse(json);
    change(envelope);
    return JSON.stringify(envelope);
  };

  it("records the model's value and checks it against this release's table", () => {
    const parsed = parseNatalEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.result.deltaT).toEqual(natalChart(birth).deltaT);
    expect((parsed.envelope.receipt.conventions as Record<string, string>).deltaT).toBe(
      "tt-minus-ut1;ut1-read-as-utc;value-in-result"
    );
    const moved = edit((e) => {
      e.result.deltaT.seconds += 0.5;
    });
    expect(parseNatalEnvelope(moved)).toMatchObject({ ok: false, code: "inconsistent_result" });
    const segment = edit((e) => {
      e.result.deltaT.segment = "extrapolated";
    });
    expect(parseNatalEnvelope(segment)).toMatchObject({ ok: false, code: "inconsistent_result" });
  });

  it("reads a value from another release's table as a claim", () => {
    const other = edit((e) => {
      e.result.deltaT.tableDigest = "0123456789abcdef";
      e.result.deltaT.table = "2027-06-01";
      e.result.deltaT.seconds += 0.05;
    });
    expect(parseNatalEnvelope(other).ok).toBe(true);
  });

  it("refuses a missing, unknown or malformed ΔT", () => {
    expect(parseNatalEnvelope(edit((e) => delete e.result.deltaT))).toMatchObject({
      ok: false,
      code: "invalid_shape"
    });
    expect(
      parseNatalEnvelope(edit((e) => (e.result.deltaT.model = "espenak-meeus-2004")))
    ).toMatchObject({ ok: false, code: "unsupported_feature" });
    expect(parseNatalEnvelope(edit((e) => (e.result.deltaT.sigma = -1)))).toMatchObject({
      ok: false,
      code: "invalid_value"
    });
    expect(parseNatalEnvelope(edit((e) => (e.result.deltaT.tableDigest = "XYZ")))).toMatchObject({
      ok: false,
      code: "invalid_value"
    });
    expect(parseNatalEnvelope(edit((e) => (e.result.deltaT.extra = 1)))).toMatchObject({
      ok: false,
      code: "invalid_shape"
    });
  });

  it("does not let an older conventions set carry a ΔT", () => {
    const rc7 = JSON.parse(
      readFileSync(new URL("./fixtures/receipt-rc7.json", import.meta.url), "utf8")
    );
    rc7.result.deltaT = natalChart(birth).deltaT;
    expect(parseNatalEnvelope(JSON.stringify(rc7))).toMatchObject({
      ok: false,
      code: "invalid_shape"
    });
  });

  it("replays a pinned chart with its pin, and a modelled one without", () => {
    const pinnedJson = serializeNatalEnvelope(
      createNatalEnvelope(natalChart({ ...birth, deltaT: 70 }))
    );
    const pinned = parseNatalEnvelope(pinnedJson);
    expect(pinned.ok).toBe(true);
    if (!pinned.ok) return;
    const replay = natalChart(natalReplayInput(pinned.envelope));
    expect(replay.deltaT.seconds).toBe(70);
    expect(replay.bodies).toEqual(pinned.envelope.result.bodies);
    const inconsistent = JSON.parse(pinnedJson);
    inconsistent.result.deltaT.sigma = 0.1;
    expect(parseNatalEnvelope(JSON.stringify(inconsistent))).toMatchObject({
      ok: false,
      code: "inconsistent_result"
    });
    const modelled = parseNatalEnvelope(json);
    if (!modelled.ok) return;
    expect(natalReplayInput(modelled.envelope)).not.toHaveProperty("deltaT");
    expect(natalChart(natalReplayInput(modelled.envelope)).bodies).toEqual(
      modelled.envelope.result.bodies
    );
  });
});
