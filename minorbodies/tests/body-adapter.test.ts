import { beforeAll, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import type { CalcRequest, CalcTime } from "../../src/calc.js";
import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import { timeBasis } from "../../src/time-scale.js";
import { validatePilot } from "../scripts/validate-pilot.ts";
import { ACCEPTANCE_POLICY } from "../src/acceptance.ts";
import { ASPECT_ROW_CONVENTIONS, BodyAdapterRefusalError, createBodyAdapter } from "../src/body-adapter.ts";
import { sha256 } from "../src/horizons-client.ts";
import { measurePilotAccuracy } from "../src/pilot-validation.ts";
import { PILOT_RECIPE } from "../src/pilot-recipe.ts";

type Adapter = Awaited<ReturnType<typeof createBodyAdapter>>;
type Request = Parameters<Adapter["calcWithMinorBodies"]>[0];
type Result = ReturnType<Adapter["calcWithMinorBodies"]>;
let validation: Awaited<ReturnType<typeof validatePilot>>;
let adapter: Adapter;
const epoch = { jd: 2451600.25, scale: "tt" as const };
const DAY_MS = 86_400_000;
const J2000_MS = Date.UTC(2000, 0, 1, 12);

function minorPosition(result: Result) {
  if (result.status !== "ok" || result.provider !== "minorbodies" || !("longitudeDeg" in result.result)) {
    throw new Error(`Expected a minor-body position, got ${JSON.stringify(result)}`);
  }
  return result.result;
}

function frozenTree(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  expect(Object.isFrozen(value)).toBe(true);
  expect(value).not.toBeInstanceOf(Date);
  for (const child of Object.values(value)) frozenTree(child);
}

beforeAll(async () => {
  // Fits only committed training responses in memory, then loads their checked
  // sources. ERFA independently reduces the held-out JPL validation responses.
  // No generated coefficient files or network access are prerequisites.
  validation = await validatePilot();
  adapter = await createBodyAdapter([validation.ephemeris]);
}, 60_000);

describe("calc-compatible body dispatch", () => {
  it("keeps the engine's closed body list intact while admitting an installed minor body", () => {
    expect(() => calc({ body: "Chiron", time: epoch } as unknown as CalcRequest)).toThrow(RangeError);
    const result = adapter.calcWithMinorBodies({ body: "Chiron", time: epoch });
    expect(minorPosition(result)).toEqual(validation.ephemeris.calculate("Chiron", epoch));
  });

  it.each([
    { body: "Mars", time: epoch },
    { body: "Sun", time: "2000-06-01T12:00:00Z", frame: "equatorial-icrs", flags: { correction: "astrometric", units: "radians", cartesian: true } },
    { body: "Jupiter", time: { jd: 2451600.25, scale: "ut1", deltaT: 80 }, center: "heliocentric", flags: { correction: "geometric", speeds: false } },
    { body: "Saturn", time: epoch, zodiac: { sidereal: "lahiri" } },
    { body: "Moon", time: epoch },
    { body: "North Node", time: epoch }
  ] satisfies CalcRequest[])("delegates the original engine calculation for $body", request => {
    const expected = calc(request);
    expect(expected.status).toBe("ok");
    const actual = adapter.calcWithMinorBodies(request);
    expect(actual).toMatchObject({ status: "ok", provider: "engine", result: expected });
    frozenTree(actual);
  });

  it.each([
    { body: "Earth", time: epoch },
    { body: "Mars", time: "1700-01-01T00:00:00Z" },
    { body: "Mars", time: epoch, flags: { deflection: true } }
  ] satisfies CalcRequest[])("preserves the engine refusal for $body", request => {
    const expected = calc(request);
    if (expected.status !== "refused") throw new Error("Expected an engine refusal.");
    const actual = adapter.calcWithMinorBodies(request);
    expect(actual).toMatchObject({ status: "refused", provider: "engine", reason: expected.reason, refusal: expected });
    frozenTree(actual);
  });

  it("accepts exactly the implemented minor-body convention with explicit defaults", () => {
    const implicit = adapter.calcWithMinorBodies({ body: "Chiron", time: epoch });
    const explicit = adapter.calcWithMinorBodies({ body: "Chiron", time: epoch,
      center: "geocentric", frame: "ecliptic-true-of-date", zodiac: "tropical",
      flags: { correction: "apparent", speeds: true, cartesian: false, units: "degrees", deflection: false }
    });
    expect(minorPosition(explicit)).toEqual(minorPosition(implicit));
    frozenTree(explicit);
  });

  it.each([
    { center: "heliocentric" },
    { center: "barycentric" },
    { center: { topocentric: { latitude: 20, longitude: 30 } } },
    { frame: "equatorial-icrs" },
    { frame: "ecliptic-j2000" },
    { frame: "ecliptic-mean-of-date" },
    { zodiac: { sidereal: "lahiri" } },
    { flags: { correction: "geometric" } },
    { flags: { correction: "astrometric" } },
    { flags: { cartesian: true } },
    { flags: { units: "radians" } },
    { flags: { speeds: false } },
    { flags: { deflection: true } }
  ] satisfies Partial<CalcRequest>[])("refuses an unsupported minor-body request: %j", options => {
    const result = adapter.calcWithMinorBodies({ body: "Chiron", time: epoch, ...options });
    expect(result).toMatchObject({ status: "refused", provider: "minorbodies" });
    if (result.status !== "refused") throw new Error("Expected convention refusal.");
    expect(result.reason).toBeTruthy();
    expect(result.detail).toBeTruthy();
    frozenTree(result.receipt);
  });

  it("distinguishes unknown labels from known bodies whose data is absent", () => {
    for (const body of ["chiron", "Pholus", "toString"]) {
      expect(adapter.calcWithMinorBodies({ body, time: epoch } as Request))
        .toMatchObject({ status: "refused", reason: "unknown-body" });
    }
    for (const body of ["Ceres", "Pallas", "Juno", "Vesta"] as const) {
      expect(adapter.calcWithMinorBodies({ body, time: epoch }))
        .toMatchObject({ status: "refused", provider: "minorbodies", reason: "body-unavailable" });
    }
  });

  it.each([
    null, [], {}, { body: 2060, time: epoch },
    { body: "Chiron", time: "2000-02-30" },
    { body: "Chiron", time: "2000-01-01T12:00:00" },
    { body: "Chiron", time: new Date(NaN) },
    { body: "Chiron", time: 0 },
    { body: "Chiron", time: { jd: NaN, scale: "tt" } },
    { body: "Chiron", time: { jd: Infinity, scale: "tt" } },
    { body: "Chiron", time: { jd: 2451600.25, scale: "TT" } },
    { body: "Chiron", time: { iso: "2000-01-01", jd: 2451544.5, scale: "tt" } },
    { body: "Chiron", time: { iso: new Date("2000-06-01T12:00:00Z") } },
    { body: "Mars", time: { iso: new Date("2000-06-01T12:00:00Z") } },
    { body: "Chiron", time: { iso: "2000-01-01", deltaT: NaN } },
    { body: "Chiron", time: epoch, flags: { speeds: "yes" } },
    { body: "Chiron", time: epoch, flags: { unexpected: true } },
    { body: "Chiron", time: epoch, unexpected: true }
  ])("throws RangeError for malformed input: %j", request => {
    expect(() => adapter.calcWithMinorBodies(request as unknown as Request)).toThrow(RangeError);
  });

  it("loads and calculates without making a runtime network request", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Runtime network access is forbidden."));
    try {
      const offline = await createBodyAdapter([validation.ephemeris]);
      expect(offline.calcWithMinorBodies({ body: "Chiron", time: epoch }).status).toBe("ok");
      expect(offline.calcWithMinorBodies({ body: "Mars", time: epoch }).status).toBe("ok");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });

  it("refuses an unknown frame without relabelling a computed position", () => {
    expect(adapter.calcWithMinorBodies({ body: "Chiron", time: epoch, frame: "invented" } as unknown as Request))
      .toMatchObject({ status: "refused", provider: "minorbodies", reason: "unsupported-frame" });
  });

  it("rejects duplicate minor-body providers and permits an engine-only adapter", async () => {
    await expect(createBodyAdapter([validation.ephemeris, validation.ephemeris])).rejects.toThrow(RangeError);
    const engineOnly = await createBodyAdapter([]);
    expect(engineOnly.calcWithMinorBodies({ body: "Mars", time: epoch })).toMatchObject({ status: "ok", provider: "engine" });
    expect(engineOnly.calcWithMinorBodies({ body: "Chiron", time: epoch }))
      .toMatchObject({ status: "refused", provider: "minorbodies", reason: "body-unavailable" });
  });

  it.each([
    { typo: undefined },
    { flags: { typo: undefined } },
    { time: { ...epoch, typo: undefined } }
  ])("preserves unknown undefined keys for validation: %j", options => {
    const native = { body: "Mars", time: epoch, ...options } as CalcRequest;
    expect(() => calc(native)).toThrow(RangeError);
    for (const body of ["Mars", "Chiron"] as const) {
      expect(() => adapter.calcWithMinorBodies({ ...native, body })).toThrow(RangeError);
    }
  });

  it("continues accepting known optional undefined fields, including an absent ISO alternative", () => {
    const options = {
      time: { ...epoch, iso: undefined, deltaT: undefined },
      frame: undefined, center: undefined, zodiac: undefined,
      flags: { correction: undefined, speeds: undefined, cartesian: undefined, units: undefined, deflection: undefined }
    };
    const nativeRequest = { body: "Mars", ...options } as unknown as CalcRequest;
    const ordinary = adapter.calcWithMinorBodies(nativeRequest);
    expect(ordinary).toMatchObject({ status: "ok", provider: "engine", result: calc(nativeRequest) });
    const minor = adapter.calcWithMinorBodies({ body: "Chiron", ...options } as unknown as Request);
    expect(minorPosition(minor)).toEqual(minorPosition(adapter.calcWithMinorBodies({ body: "Chiron", time: epoch })));
  });
});

describe("adapter clocks, coverage and receipts", () => {
  it.each([
    "2000-06-01T12:00:00Z",
    new Date("2000-06-01T12:00:00Z"),
    { iso: "2000-06-01T12:00:00+00:00", deltaT: 80 },
    { jd: 2451697.123456789, scale: "utc" },
    { jd: 2451697.123456789, scale: "ut1", deltaT: 120 },
    { jd: 2451697.123456789, scale: "tt", deltaT: 0 }
  ] satisfies CalcTime[])("matches the engine's resolved TT for %j", time => {
    const ordinary = calc({ body: "Mars", time });
    if (ordinary.status !== "ok") throw new Error("Expected engine clock reference.");
    const expectedJdTt = ordinary.receipt.instants[0]!.jdTt;
    const actual = minorPosition(adapter.calcWithMinorBodies({ body: "Chiron", time }));
    expect(actual.jdTt).toBe(expectedJdTt);
    expect(actual).toEqual(validation.ephemeris.calculate("Chiron", { jd: expectedJdTt, scale: "tt" }));
  });

  it("retains the half-open coverage after UTC-to-TT conversion", () => {
    for (const jd of [PILOT_RECIPE.startJdTt, PILOT_RECIPE.endJdTt - 1e-6]) {
      expect(adapter.calcWithMinorBodies({ body: "Chiron", time: { jd, scale: "tt" } }).status).toBe("ok");
    }
    for (const jd of [PILOT_RECIPE.startJdTt - 1e-6, PILOT_RECIPE.endJdTt]) {
      const actual = adapter.calcWithMinorBodies({ body: "Chiron", time: { jd, scale: "tt" } });
      expect(actual).toMatchObject({ status: "refused", provider: "minorbodies", reason: "outside-coverage",
        refusal: validation.ephemeris.calculate("Chiron", { jd, scale: "tt" }) });
    }
    expect(adapter.calcWithMinorBodies({ body: "Chiron", time: "2000-12-31T23:59:00Z" }))
      .toMatchObject({ status: "refused", reason: "outside-coverage" });
  });

  it("snapshots caller-owned dates, options and the provider list", async () => {
    const providers = [validation.ephemeris];
    const isolated = await createBodyAdapter(providers);
    providers.length = 0;
    const date = new Date("2000-06-01T12:00:00Z");
    const flags = { correction: "apparent" as const, speeds: true, cartesian: false };
    const request = { body: "Chiron" as const, time: date, flags };
    const before = isolated.calcWithMinorBodies(request);
    const snapshot = JSON.stringify(before);
    date.setUTCFullYear(1900);
    flags.speeds = false;
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(isolated.calcWithMinorBodies({ body: "Chiron", time: "2000-06-01T12:00:00.000Z",
      flags: { correction: "apparent", speeds: true, cartesian: false } })).toEqual(before);
    frozenTree(before);
  });

  it("records the local implementation, installed data and original time conversion", () => {
    const time = { iso: "2000-06-01T12:00:00+00:00", deltaT: 120 };
    const result = adapter.calcWithMinorBodies({ body: "Chiron", time });
    const position = minorPosition(result);
    expect(result.receipt.request).toEqual({ body: "Chiron", time });
    expect(result.receipt.dataset).toEqual(validation.ephemeris.dataset);
    expect(result.receipt.calculation).toEqual(position.receipt);
    expect(result.receipt.time?.jdTt).toBe(position.jdTt);
    const implementation = result.receipt.implementation;
    const { sha256: digest, ...record } = implementation;
    expect(digest).toBe(sha256(JSON.stringify(record)));
    expect(implementation.files.map(file => file.path)).toEqual(expect.arrayContaining([
      "minorbodies/src/body-adapter.ts", "minorbodies/src/adapter-input.ts", "src/calc.ts",
      "src/crossings.ts", "src/configured-aspects.ts", "src/time-scale.ts"
    ]));
    expect(implementation.files.some(file => file.path.startsWith("dist/") || file.path.startsWith(".git/"))).toBe(false);
  });

  it("retains the held-out Horizons/ERFA accuracy gates through calc dispatch", () => {
    const { pilot, reference } = validation;
    const report = measurePilotAccuracy({ shard: pilot.shard, validationRows: pilot.validationRows, reference,
      calculateAt: jdTt => minorPosition(adapter.calcWithMinorBodies({ body: "Chiron", time: { jd: jdTt, scale: "tt" } }))
    });
    for (const metric of Object.keys(ACCEPTANCE_POLICY.limits) as (keyof typeof ACCEPTANCE_POLICY.limits)[]) {
      expect(report.maxima[metric].value, metric).toBeLessThanOrEqual(ACCEPTANCE_POLICY.limits[metric]);
    }
    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
  });
});

describe("mixed configured aspects", () => {
  it("provides real minor-body and planetary rows at one TT instant", () => {
    const time = { iso: "2000-06-01T12:00:00Z", deltaT: 100 };
    const result = adapter.aspectRows(["Chiron", "Mars", "Sun"], time);
    if (result.status !== "ok") throw new Error(`Expected aspect rows, got ${JSON.stringify(result)}`);
    const jdTt = 2451545 + timeBasis(Date.parse(time.iso), "utc", time.deltaT).ttDays;
    const chiron = minorPosition(adapter.calcWithMinorBodies({ body: "Chiron", time: { jd: jdTt, scale: "tt" } }));
    const mars = calc({ body: "Mars", time: { jd: jdTt, scale: "tt", deltaT: time.deltaT } });
    const sun = calc({ body: "Sun", time: { jd: jdTt, scale: "tt", deltaT: time.deltaT } });
    if (mars.status !== "ok" || sun.status !== "ok") throw new Error("Expected ordinary positions.");
    expect(result.rows).toEqual([
      { body: "Chiron", lon: chiron.longitudeDeg, speed: chiron.longitudeSpeedDegPerDay },
      { body: "Mars", lon: mars.lon, speed: mars.speeds!.lon },
      { body: "Sun", lon: sun.lon, speed: sun.speeds!.lon }
    ]);
    const policy = createAspectPolicy({ bodies: ["Chiron", "Mars", "Sun"], aspects: [{ type: "conjunction", orb: 180 }] });
    const aspects = findConfiguredAspects(result.rows, policy);
    expect(aspects.aspects).toHaveLength(3);
    expect(aspects.aspects.some(item => item.a === "Chiron" || item.b === "Chiron")).toBe(true);
    expect(result.receipt.calculations).toHaveLength(3);
    expect(result.receipt.time?.jdTt).toBe(jdTt);
    expect(result.receipt.conventions).toEqual(ASPECT_ROW_CONVENTIONS);
    expect(result.receipt.conventions.engineApproximation).not.toBe(result.receipt.conventions.minorBodyApproximation);
    frozenTree(result);
  });

  it.each(["Moon", "North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"] as const)(
    "refuses %s correction conventions instead of returning a partial aspect table", body => {
      const result = adapter.aspectRows(["Chiron", "Mars", body], epoch);
      expect(result).toMatchObject({ status: "refused", reason: "incompatible-corrections", rows: [] });
      frozenTree(result.receipt);
    });

  it.each([
    { bodies: ["Chiron", "Ceres"] }, { bodies: ["Chiron", "Earth"] }
  ] as const)("returns no rows when any requested member refuses: $bodies", ({ bodies }) => {
    expect(adapter.aspectRows(bodies, epoch)).toMatchObject({ status: "refused", rows: [] });
  });

  it("returns no rows when the converted common time lies outside minor-body coverage", () => {
    expect(adapter.aspectRows(["Mars", "Chiron"], "2000-12-31T23:59:00Z"))
      .toMatchObject({ status: "refused", reason: "outside-coverage", rows: [] });
  });

  it("preserves a TT Delta T pin and the ordinary body's inferred-UT1 range refusal", () => {
    const time = { ...epoch, deltaT: 1e10 };
    const native = calc({ body: "Mars", time });
    expect(native).toMatchObject({ status: "refused", reason: "out-of-range" });
    const result = adapter.aspectRows(["Chiron", "Mars"], time);
    expect(result).toMatchObject({ status: "refused", reason: "out-of-range", rows: [],
      refusal: { provider: "engine", refusal: native } });
    expect(result.receipt.requestTime).toEqual(time);
    expect(result.receipt.calculations).toHaveLength(2);
    expect(result.receipt.calculations[1]!.request.time).toEqual(time);
  });

  it("carries a moderate TT Delta T pin into the native planet receipt and row", () => {
    const time = { ...epoch, deltaT: 120 };
    const native = calc({ body: "Mars", time });
    if (native.status !== "ok") throw new Error("Expected native pinned position.");
    const result = adapter.aspectRows(["Mars", "Chiron"], time);
    if (result.status !== "ok") throw new Error("Expected pinned aspect rows.");
    expect(result.rows[0]).toEqual({ body: "Mars", lon: native.lon, speed: native.speeds!.lon });
    expect(result.receipt.calculations[0]!.calculation).toEqual(native.receipt);
    expect(native.receipt.instants[0]!.deltaT).toMatchObject({ model: "pinned", seconds: time.deltaT });
    expect(result.receipt.calculations[0]!.request.time).toEqual(time);
    expect(result.receipt.requestTime).toEqual(time);
  });

  it("rejects sparse or accessor body arrays without invoking caller getters", () => {
    const sparse: Parameters<Adapter["aspectRows"]>[0][number][] = new Array(2);
    sparse[1] = "Mars";
    expect(() => adapter.aspectRows(sparse, epoch)).toThrow(RangeError);
    const getter = vi.fn(() => "Mars");
    const accessor = ["Chiron", "Mars"] as const;
    Object.defineProperty(accessor, "1", { get: getter, enumerable: true, configurable: true });
    expect(() => adapter.aspectRows(accessor, epoch)).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
  });
});

describe("existing crossing solver callback", () => {
  it("treats Date labels as TT by default and exposes its complete calculation", () => {
    const callback = adapter.createLongitudeCallback();
    const date = new Date("2000-06-01T12:00:00Z");
    const jd = 2451545 + (date.getTime() - J2000_MS) / DAY_MS;
    const expected = adapter.calcWithMinorBodies({ body: "Chiron", time: { jd, scale: "tt" } });
    expect(callback.calculateAt("Chiron", date)).toEqual(expected);
    expect(callback.longitudeAt("Chiron", date)).toBe(minorPosition(expected).longitudeDeg);
    frozenTree(callback.receipt);
  });

  it.each(["utc", "ut1"] as const)("uses the requested %s callback clock", dateScale => {
    const callback = adapter.createLongitudeCallback({ dateScale, deltaT: 150 });
    const date = new Date("2000-06-01T12:00:00Z");
    const jd = 2451545 + (date.getTime() - J2000_MS) / DAY_MS;
    const time = dateScale === "utc" ? { iso: date.toISOString(), deltaT: 150 } : { jd, scale: dateScale, deltaT: 150 };
    const expected = adapter.calcWithMinorBodies({ body: "Chiron", time });
    expect(callback.calculateAt("Chiron", date)).toEqual(expected);
    expect(callback.longitudeAt("Chiron", date)).toBe(minorPosition(expected).longitudeDeg);
  });

  it.each(["utc", "ut1", "tt"] as const)("reads the native Date once without invoking overrides on the %s callback clock", dateScale => {
    const callback = adapter.createLongitudeCallback({ dateScale });
    const date = new Date("2000-06-01T12:00:00.123Z");
    const expected = callback.calculateAt("Chiron", new Date(date));
    const getTime = vi.fn(() => () => Date.UTC(1900, 0, 1));
    const toISOString = vi.fn(() => () => "1900-01-01T00:00:00.000Z");
    Object.defineProperties(date, {
      getTime: { get: getTime },
      toISOString: { get: toISOString }
    });
    const nativeGetTime = Date.prototype.getTime;
    let inputReads = 0;
    const clock = vi.spyOn(Date.prototype, "getTime").mockImplementation(function (this: Date) {
      if (this === date) inputReads++;
      return nativeGetTime.call(this);
    });
    try {
      expect(callback.calculateAt("Chiron", date)).toEqual(expected);
      expect(inputReads).toBe(1);
      expect(getTime).not.toHaveBeenCalled();
      expect(toISOString).not.toHaveBeenCalled();
    } finally { clock.mockRestore(); }
  });

  it("searches a real Chiron longitude with the existing solver", () => {
    // This tests callback/solver integration, not independently validated event timing.
    const callback = adapter.createLongitudeCallback();
    const from = new Date("2000-01-02T00:00:00Z");
    const to = new Date("2000-01-04T00:00:00Z");
    const start = callback.longitudeAt("Chiron", from);
    const end = callback.longitudeAt("Chiron", to);
    expect(end).toBeGreaterThan(start);
    const target = (start + end) / 2;
    const result = searchLongitudeCrossingsWith(callback.longitudeAt, "Chiron", target, from, to,
      { stepDays: 0.25, maxSamples: 1000 });
    expect(result.status).toBe("complete");
    expect(result.crossings).toHaveLength(1);
    expect(result.crossings[0]!.retrograde).toBe(false);
    expect(Math.abs(callback.longitudeAt("Chiron", result.crossings[0]!.at) - target)).toBeLessThan(1e-7);
  });

  it("preserves the solver's no-sample budget refusal", () => {
    const callback = adapter.createLongitudeCallback();
    const result = searchLongitudeCrossingsWith(callback.longitudeAt, "Ceres", 30,
      new Date("2000-01-02T00:00:00Z"), new Date("2000-01-04T00:00:00Z"),
      { stepDays: 0.5, maxSamples: 1 });
    expect(result).toEqual({ status: "refused", reason: "sample-budget", samples: 0, maxSamples: 1, crossings: [] });
  });

  it("throws an error carrying the whole structured refusal when a sample is unavailable", () => {
    const callback = adapter.createLongitudeCallback();
    const date = new Date("2001-01-01T00:00:00Z");
    const refused = callback.calculateAt("Chiron", date);
    expect(refused).toMatchObject({ status: "refused", reason: "outside-coverage" });
    try {
      callback.longitudeAt("Chiron", date);
      throw new Error("Expected callback refusal.");
    } catch (error) {
      expect(error).toBeInstanceOf(BodyAdapterRefusalError);
      expect((error as InstanceType<typeof BodyAdapterRefusalError>).refusal).toEqual(refused);
    }
  });
});
