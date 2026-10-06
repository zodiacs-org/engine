/*
 * M3d: receipts carry the time basis. The current conventions set records the
 * instant's scale (receipt.timeScale) and how it became UT1 and TT
 * (result.timeScale), and a receipt of the rc.8 set, which read the instant as
 * UT1, stays readable. src/fixtures/receipt-rc13.json was serialized by the
 * carried 0.1.1-rc.13 archive (artifacts/zodiacs-engine-0.1.1-rc.13.tgz,
 * sha256 12db9dce0f2c7551924b41caa5609f57bf31dfb9051a72901b94cdae29d3b840) for
 * a synthetic chart, 1990-06-15 08:30 in New York, and
 * src/fixtures/receipt-rc14.json by the carried 0.1.1-rc.14 archive
 * (artifacts/zodiacs-engine-0.1.1-rc.14.tgz, sha256
 * adc9805e22cd2468fa3340a864d9c53b36ff91e8f1592fdb35d8da8b69f4476e) for the
 * same chart (docs/evidence/rc15-20260929/make-receipt-rc14.mjs).
 */
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
import type { NatalEnvelope, NatalEnvelopeErrorCode } from "./receipt.js";
import type { BirthInput } from "./types.js";

const RC13 = readFileSync(new URL("./fixtures/receipt-rc13.json", import.meta.url), "utf8");
const RC14 = readFileSync(new URL("./fixtures/receipt-rc14.json", import.meta.url), "utf8");

function envelopeOf(birth: Partial<BirthInput> = {}): NatalEnvelope {
  return createNatalEnvelope(
    natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus", ...birth })
  );
}

/** Parse after `change` edits a JSON copy; the codec's verdict. */
function verdict(envelope: NatalEnvelope | string, change: (copy: any) => void = () => {}): "ok" | NatalEnvelopeErrorCode {
  const copy = JSON.parse(typeof envelope === "string" ? envelope : serializeNatalEnvelope(envelope));
  change(copy);
  const parsed = parseNatalEnvelope(JSON.stringify(copy));
  return parsed.ok ? "ok" : parsed.code;
}

describe("a receipt written by 0.1.1-rc.13 (the rc.8 conventions set)", () => {
  it("still parses, under the set its engine recorded, with no time basis", () => {
    const parsed = parseNatalEnvelope(RC13);
    if (!parsed.ok) throw new Error(parsed.code);
    const { receipt, result } = parsed.envelope;
    expect(receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[2]);
    expect(receipt.conventions).toMatchObject({ deltaT: "tt-minus-ut1;ut1-read-as-utc;value-in-result" });
    expect(receipt.engine.version).toBe("0.1.1-rc.13");
    expect("timeScale" in receipt).toBe(false);
    expect("timeScale" in result).toBe(false);
    expect(result.deltaT?.model).toBe("zodiacs-deltat/1");
    expect(receipt.localResolution).toEqual({
      date: "1990-06-15",
      time: "08:30",
      timeZone: "America/New_York",
      offsetMinutes: -240,
      gapShiftMinutes: 0,
      policy: { fold: "earlier", gap: "shift-forward" }
    });
    expect(serializeNatalEnvelope(parsed.envelope)).toBe(serializeNatalEnvelope(JSON.parse(RC13)));
  });

  it("replays as a UTC request; today's basis moves the result by well under an arcsecond", () => {
    const parsed = parseNatalEnvelope(RC13);
    if (!parsed.ok) throw new Error(parsed.code);
    const replay = natalReplayInput(parsed.envelope);
    expect(replay).toEqual({
      utc: "1990-06-15T12:30:00.000Z",
      houseSystem: "placidus",
      timeKnown: true,
      flags: [],
      latitude: 40.7128,
      longitude: -74.006
    });
    const chart = natalChart(replay);
    const stored = parsed.envelope.result;
    for (const body of stored.bodies) {
      expect(Math.abs(chart.bodies.find((row) => row.body === body.body)!.lon - body.lon)).toBeLessThan(1e-5);
    }
    // UT1 − UTC was −0.013 s: 0.2″ of sidereal time.
    expect(chart.timeScale.ut1MinusUtc?.seconds).toBeCloseTo(-0.01304, 4);
    expect(Math.abs(chart.angles!.asc - stored.angles!.asc)).toBeLessThan(1e-4);
    expect(Math.abs(chart.angles!.mc - stored.angles!.mc)).toBeLessThan(1e-4);
  });

  it("is refused with a time basis added, or under a version the set did not come from", () => {
    expect(verdict(RC13, (copy) => (copy.receipt.timeScale = "utc"))).toBe("invalid_shape");
    expect(verdict(RC13, (copy) => (copy.result.timeScale = envelopeOf().result.timeScale))).toBe("invalid_shape");
    // The rc.8 set was written by rc.8 to rc.14, and by no later engine.
    for (const version of ["0.1.1-rc.8", "0.1.1-rc.12", "0.1.1-rc.14", "0.1.1-rc.14+build.1"]) {
      expect(verdict(RC13, (copy) => (copy.receipt.engine.version = version))).toBe("ok");
    }
    for (const version of ["0.1.1-rc.15", "0.1.1-rc.16", "0.1.1", "0.2.0", "0.1.1-rc.7"]) {
      expect(verdict(RC13, (copy) => (copy.receipt.engine.version = version))).toBe("inconsistent_result");
    }
  });
});

describe("a receipt written by 0.1.1-rc.14 (the rc.8 conventions set)", () => {
  it("still parses, under the set its engine recorded, with no time basis", () => {
    const parsed = parseNatalEnvelope(RC14);
    if (!parsed.ok) throw new Error(parsed.code);
    const { receipt, result } = parsed.envelope;
    expect(receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[2]);
    expect(receipt.engine).toEqual({ name: "@zodiacs/engine", version: "0.1.1-rc.14", ephemeris: { name: "astronomy-engine", version: "2.1.19" } });
    expect("timeScale" in receipt).toBe(false);
    expect("timeScale" in result).toBe(false);
    expect(result.deltaT?.model).toBe("zodiacs-deltat/1");
    expect(serializeNatalEnvelope(parsed.envelope)).toBe(serializeNatalEnvelope(JSON.parse(RC14)));
    // rc.14 computed the same natal results as rc.13; only the engine version differs.
    const rc13 = JSON.parse(RC13);
    expect(JSON.parse(RC14).result).toEqual(rc13.result);
  });

  it("replays as a UTC request under this engine, within the time basis's change", () => {
    const parsed = parseNatalEnvelope(RC14);
    if (!parsed.ok) throw new Error(parsed.code);
    const replay = natalReplayInput(parsed.envelope);
    expect(replay).toEqual({
      utc: "1990-06-15T12:30:00.000Z",
      houseSystem: "placidus",
      timeKnown: true,
      flags: [],
      latitude: 40.7128,
      longitude: -74.006
    });
    const chart = natalChart(replay);
    const stored = parsed.envelope.result;
    for (const body of stored.bodies) {
      expect(Math.abs(chart.bodies.find((row) => row.body === body.body)!.lon - body.lon)).toBeLessThan(1e-5);
    }
    expect(Math.abs(chart.angles!.asc - stored.angles!.asc)).toBeLessThan(1e-4);
    expect(Math.abs(chart.angles!.mc - stored.angles!.mc)).toBeLessThan(1e-4);
    // Replayed today, the chart's own receipt is of the current set, under this version.
    const today = createNatalEnvelope(chart);
    expect(today.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(today.receipt.engine.version).toBe("0.1.1-rc.17");
    expect(verdict(today)).toBe("ok");
  });

  it("is refused under a version after rc.14, and with a time basis added", () => {
    expect(verdict(RC14, (copy) => (copy.receipt.engine.version = "0.1.1-rc.15"))).toBe("inconsistent_result");
    expect(verdict(RC14, (copy) => (copy.receipt.timeScale = "utc"))).toBe("invalid_shape");
  });
});

describe("a receipt of the current conventions set", () => {
  it("records the scale, the basis and the ΔT it came with", () => {
    const envelope = envelopeOf();
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(envelope.receipt.timeScale).toBe("utc");
    expect(envelope.result.timeScale).toEqual({
      input: "utc",
      basis: "iers",
      ut1MinusUtc: { seconds: expect.closeTo(-0.01304, 4), sigma: expect.any(Number), source: "observed" },
      leapSeconds: { taiMinusUtc: 25, listed: true }
    });
    expect(envelope.result.deltaT).toMatchObject({ model: "iers-utc/1", segment: "observed" });
    expect(envelope.result.deltaT!.seconds).toBeCloseTo(32.184 + 25 + 0.01304, 4);
    expect(verdict(envelope)).toBe("ok");
  });

  it.each([
    ["the receipt's scale removed", (copy: any) => delete copy.receipt.timeScale, "invalid_shape"],
    ["an unknown receipt scale", (copy: any) => (copy.receipt.timeScale = "tai"), "invalid_value"],
    ["the result's basis removed", (copy: any) => delete copy.result.timeScale, "invalid_shape"],
    ["another input scale", (copy: any) => (copy.result.timeScale.input = "tt"), "inconsistent_result"],
    ["another basis", (copy: any) => (copy.result.timeScale.basis = "delta-t"), "inconsistent_result"],
    ["an unknown basis", (copy: any) => (copy.result.timeScale.basis = "gps"), "invalid_value"],
    ["UT1 − UTC moved 1 µs", (copy: any) => (copy.result.timeScale.ut1MinusUtc.seconds += 1e-6), "inconsistent_result"],
    ["UT1 − UTC beyond a second", (copy: any) => (copy.result.timeScale.ut1MinusUtc.seconds = 1.5), "invalid_value"],
    ["its σ changed", (copy: any) => (copy.result.timeScale.ut1MinusUtc.sigma *= 2), "inconsistent_result"],
    ["a predicted source", (copy: any) => (copy.result.timeScale.ut1MinusUtc.source = "predicted"), "inconsistent_result"],
    ["no UT1 − UTC", (copy: any) => (copy.result.timeScale.ut1MinusUtc = null), "inconsistent_result"],
    ["another TAI − UTC", (copy: any) => (copy.result.timeScale.leapSeconds.taiMinusUtc = 26), "inconsistent_result"],
    ["a fractional TAI − UTC", (copy: any) => (copy.result.timeScale.leapSeconds.taiMinusUtc = 25.5), "invalid_value"],
    ["the list marked expired", (copy: any) => (copy.result.timeScale.leapSeconds.listed = false), "inconsistent_result"],
    ["ΔT moved 1 µs", (copy: any) => (copy.result.deltaT.seconds += 1e-6), "inconsistent_result"],
    ["the model's ΔT in the leap-second era", (copy: any) => (copy.result.deltaT.model = "zodiacs-deltat/1"), "inconsistent_result"],
    ["a model the set does not know", (copy: any) => (copy.result.deltaT.model = "iers-utc/2"), "unsupported_feature"],
    ["the IERS model without a basis to match", (copy: any) => (copy.result.timeScale.basis = "pinned"), "inconsistent_result"]
  ])("refuses %s", (_, change, code) => {
    expect(verdict(envelopeOf(), change)).toBe(code);
  });

  it("keeps another release's UT1 table as a claim, checked for shape only", () => {
    const foreign = (copy: any) => {
      copy.result.deltaT.tableDigest = "0123456789abcdef";
      copy.result.deltaT.table = "2027-03-01";
      copy.result.deltaT.seconds += 0.002;
      copy.result.timeScale.ut1MinusUtc.seconds -= 0.002;
    };
    expect(verdict(envelopeOf(), foreign)).toBe("ok");
    expect(verdict(envelopeOf(), (copy) => (foreign(copy), (copy.result.timeScale.ut1MinusUtc.source = "tabled")))).toBe("invalid_value");
  });

  it("is refused under an engine version before the set, which 0.1.1-rc.16 released", () => {
    // 0.1.1-rc.15 wrote the time-basis set without the nutation (src/receipt-nutation.test.ts).
    for (const version of ["0.1.1-rc.12", "0.1.1-rc.13", "0.1.1-rc.14", "0.1.1-rc.14+build.1", "0.1.1-rc.15", "0.1.0"]) {
      expect(verdict(envelopeOf(), (copy) => (copy.receipt.engine.version = version))).toBe("inconsistent_result");
    }
    for (const version of ["0.1.1-rc.16", "0.1.1-rc.17", "0.1.1", "0.2.0"]) {
      expect(verdict(envelopeOf(), (copy) => (copy.receipt.engine.version = version))).toBe("ok");
    }
  });

  it("records the model before 1972, and after the IERS table the fallback band", () => {
    const early = envelopeOf({ utc: "1960-03-01T12:00:00Z" });
    expect(early.result.timeScale).toEqual({ input: "utc", basis: "delta-t", ut1MinusUtc: null, leapSeconds: null });
    expect(early.result.deltaT).toMatchObject({ model: "zodiacs-deltat/1" });
    expect(verdict(early)).toBe("ok");
    expect(verdict(early, (copy) => (copy.result.deltaT.seconds += 1e-6))).toBe("inconsistent_result");
    const late = envelopeOf({ utc: "2030-03-01T12:00:00Z" });
    expect(late.result.timeScale).toEqual({
      input: "utc",
      basis: "delta-t",
      ut1MinusUtc: { seconds: 0, sigma: 0.9, source: "fallback" },
      leapSeconds: null
    });
    expect(verdict(late)).toBe("ok");
    expect(verdict(late, (copy) => (copy.result.timeScale.ut1MinusUtc = null))).toBe("inconsistent_result");
  });

  it("records a pinned ΔT as the pinned basis", () => {
    const pinned = envelopeOf({ deltaT: 60 });
    expect(pinned.result.deltaT).toMatchObject({ model: "pinned", seconds: 60 });
    expect(pinned.result.timeScale?.basis).toBe("pinned");
    expect(verdict(pinned)).toBe("ok");
    expect(verdict(pinned, (copy) => (copy.result.timeScale.basis = "iers"))).toBe("inconsistent_result");
    expect(natalReplayInput(pinned).deltaT).toBe(60);
  });
});

describe("a local resolution in rc.14's shape, under the current set", () => {
  // The six fields rc.14 took, without the seven rc.15 added: the record the
  // Zodiacs site's calculator builds (src/lib/engine/calculator-receipt.ts).
  // The types mark the seven optional, and so does the codec: 0.1.1-rc.15 as
  // first cut refused this record with invalid_shape.
  const RC14_LOCAL = {
    date: "1990-06-15",
    time: "08:30",
    timeZone: "America/New_York",
    offsetMinutes: -240,
    gapShiftMinutes: 0,
    policy: { fold: "earlier", gap: "shift-forward" }
  } as const;
  const withLocal = (local: object) => (copy: any) => (copy.receipt.localResolution = { ...RC14_LOCAL, ...local });

  it("is accepted by createNatalEnvelope, as rc.14 accepted it, and parses back unchanged", () => {
    const envelope = createNatalEnvelope(
      natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006 }),
      { reference: "supplied-instant", localResolution: RC14_LOCAL }
    );
    expect(envelope.receipt.conventions).toEqual(NATAL_RECEIPT_CONVENTION_SETS[0]);
    expect(envelope.receipt.timeScale).toBe("utc");
    expect(envelope.receipt.localResolution).toEqual(RC14_LOCAL);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(parsed).toEqual({ ok: true, envelope });
    // Its six fields are still checked: the wall time must give the instant.
    expect(verdict(envelope, withLocal({ offsetMinutes: -300 }))).toBe("invalid_context");
    expect(verdict(envelope, (copy) => delete copy.receipt.localResolution.policy)).toBe("invalid_shape");
    expect(verdict(envelope, withLocal({ zone: "America/New_York" }))).toBe("invalid_shape");
  });

  it.each([
    ["calendar gregorian", { calendar: "gregorian" }, "ok"],
    ["an unknown calendar", { calendar: "hebrew" }, "invalid_value"],
    ["the date as written, with no calendar", { writtenDate: "1990-06-15" }, "ok"],
    ["another written date, with no calendar (so Gregorian)", { writtenDate: "1990-06-02" }, "invalid_context"],
    ["a Julian written date that converts to the date", { calendar: "julian", writtenDate: "1990-06-02" }, "ok"],
    ["a Julian written date that does not", { calendar: "julian", writtenDate: "1990-06-15" }, "invalid_context"],
    ["a tzdb version", { tzdbVersion: "2025c" }, "ok"],
    ["a malformed tzdb version", { tzdbVersion: "latest" }, "invalid_value"],
    ["the host's data", { dataForm: "host", tzdbVersion: null }, "ok"],
    ["shipped data with no tzdb version", { dataForm: "main+backzone", tzdbVersion: null }, "invalid_context"],
    ["a legal clock", { clock: "legal" }, "ok"],
    ["a local-mean-time clock without the lmt flag", { clock: "local-mean-time" }, "invalid_context"],
    ["no transition", { transition: null }, "ok"],
    ["the transition behind the offset", { transition: { at: "1990-04-01T07:00:00.000Z", offsetBeforeMinutes: -300, offsetAfterMinutes: -240, cause: "dst" } }, "ok"],
    ["a transition to another offset", { transition: { at: "1990-04-01T07:00:00.000Z", offsetBeforeMinutes: -240, offsetAfterMinutes: -300, cause: "dst" } }, "invalid_context"],
    ["a date-line cause for an hour", { transition: { at: "1990-04-01T07:00:00.000Z", offsetBeforeMinutes: -300, offsetAfterMinutes: -240, cause: "date-line" } }, "invalid_context"],
    ["no birthplace mean time", { localMeanTime: null }, "ok"],
    ["a birthplace mean time that read nothing", { localMeanTime: { longitude: -74.006, zoneOffsetMinutes: -296.0333333333333 } }, "invalid_context"]
  ])("checks %s when that field is the only one added", (_, fields, code) => {
    expect(verdict(envelopeOf(), withLocal(fields))).toBe(code);
  });

  it("stays refused, with any field rc.15 added, under the rc.8 set", () => {
    const parsed = parseNatalEnvelope(RC14);
    if (!parsed.ok) throw new Error(parsed.code);
    expect(parsed.envelope.receipt.localResolution).toEqual(RC14_LOCAL);
    expect(verdict(RC14, withLocal({ calendar: "gregorian" }))).toBe("invalid_shape");
    expect(verdict(RC14, withLocal({ transition: null }))).toBe("invalid_shape");
  });
});

describe("receipts of an instant on TT or UT1", () => {
  it.each(["tt", "ut1"] as const)("record the %s instant and replay the same request and result", (timeScale) => {
    const utc = envelopeOf();
    const instant = timeScale === "tt" ? "1990-06-15T12:30:57.197Z" : "1990-06-15T12:29:59.987Z";
    const envelope = envelopeOf({ utc: instant, timeScale });
    expect(envelope.receipt.instant).toBe(instant);
    expect(envelope.receipt.timeScale).toBe(timeScale);
    expect(envelope.result.timeScale?.input).toBe(timeScale);
    expect(envelope.result.timeScale?.basis).toBe("iers");
    expect(verdict(envelope)).toBe("ok");
    // Within a millisecond of the UTC chart's instant: the same sky.
    for (const body of utc.result.bodies) {
      expect(envelope.result.bodies.find((row) => row.body === body.body)!.lon).toBeCloseTo(body.lon, 5);
    }
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    if (!parsed.ok) throw new Error(parsed.code);
    const replay = natalReplayInput(parsed.envelope);
    expect(replay.timeScale).toBe(timeScale);
    expect(replay.utc).toBe(instant);
    const again = createNatalEnvelope(natalChart(replay));
    expect(again.receipt).toEqual(envelope.receipt);
    expect(again.result.timeScale).toEqual(envelope.result.timeScale);
    expect(again.result.deltaT).toEqual(envelope.result.deltaT);
    // The engine's nutation is computed for each instant (src/nutation.ts), so
    // the replay gives the first run's result, whatever was computed between.
    expect(again.result).toEqual(envelope.result);
    // The scale is part of the request: read as UTC, the same digits are another instant.
    expect(verdict(envelope, (copy) => (copy.receipt.timeScale = "utc"))).toBe("inconsistent_result");
  });

  it("refuses a local resolution on any scale but UTC", () => {
    // 12:30 TT: the digits of 08:30 in New York, but not its instant.
    const envelope = envelopeOf({ utc: "1990-06-15T12:30:00Z", timeScale: "tt" });
    const local = {
      date: "1990-06-15",
      time: "08:30",
      timeZone: "America/New_York",
      offsetMinutes: -240,
      gapShiftMinutes: 0,
      policy: { fold: "earlier", gap: "shift-forward" },
      calendar: "gregorian",
      writtenDate: "1990-06-15",
      tzdbVersion: null,
      dataForm: "host",
      clock: "legal",
      transition: null,
      localMeanTime: null
    };
    expect(verdict(envelope, (copy) => (copy.receipt.localResolution = local))).toBe("invalid_context");
    expect(verdict(envelopeOf(), (copy) => (copy.receipt.localResolution = local))).toBe("ok");
  });
});
