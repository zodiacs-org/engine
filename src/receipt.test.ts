import { describe, expect, it, vi } from "vitest";
import { natalChart } from "./api.js";
import { resolveBirth, resolveLocalToUtc } from "./geo.js";
import { ENGINE_VERSION } from "./types.js";
import type { BirthInput, Chart, ChartFlag } from "./types.js";
import {
  createNatalEnvelope,
  parseNatalEnvelope,
  serializeNatalEnvelope,
  natalReplayInput,
  redactNatalEnvelope,
  NatalEnvelopeError,
  NATAL_ENVELOPE_SCHEMA,
  NATAL_ENVELOPE_LIMITS
} from "./receipt.js";
import type { NatalEnvelope, NatalEnvelopeContext, NatalEnvelopeErrorCode } from "./receipt.js";

const INSTANT = "2001-12-21T09:00:00.000Z";
const SECRET = "SYNTHETIC-SECRET-DO-NOT-EMIT";
function chart(overrides: Partial<BirthInput> = {}): Chart {
  return natalChart({
    utc: INSTANT,
    latitude: 78.2232,
    longitude: 15.6267,
    houseSystem: "placidus",
    ...overrides
  });
}
function envelope(
  overrides: Partial<BirthInput> = {},
  context: NatalEnvelopeContext = {}
): NatalEnvelope {
  return createNatalEnvelope(chart(overrides), context);
}
function errorFrom(action: () => unknown, code?: NatalEnvelopeErrorCode): NatalEnvelopeError {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(NatalEnvelopeError);
  const failure = error as NatalEnvelopeError;
  if (code) expect(failure.code).toBe(code);
  expect(failure.message).toBe(`Natal envelope rejected: ${failure.code}.`);
  expect(failure.message).not.toContain(SECRET);
  return failure;
}
function imported(value: unknown) {
  return parseNatalEnvelope(JSON.stringify(value));
}
function local(
  date: string,
  time: string,
  zone: string,
  gapShiftMinutes = 0,
  timeKnown = true,
  reference: NatalEnvelopeContext["reference"] = "supplied-instant"
) {
  const resolved = resolveLocalToUtc(date, time, zone);
  return envelope(
    { utc: resolved.utc, flags: resolved.flags, latitude: 40, timeKnown },
    {
      reference,
      localResolution: {
        date,
        time,
        timeZone: zone,
        offsetMinutes: resolved.offsetMinutes,
        gapShiftMinutes,
        policy: { fold: "earlier", gap: "shift-forward" }
      }
    }
  );
}

describe("Zodiacs draft natal receipt", () => {
  it("preserves a fresh full result and requested Placidus across a polar fallback replay", () => {
    const original = chart();
    const captured = createNatalEnvelope(original);
    expect(captured.schema).toBe(NATAL_ENVELOPE_SCHEMA);
    expect(captured.receipt.engine).toEqual({ name: "@zodiacs/engine", version: ENGINE_VERSION });
    expect(captured.receipt.houses).toEqual({
      requested: "placidus",
      actual: "whole",
      absenceReason: null
    });
    expect(captured.receipt.resultFlags).toEqual(["polar-fallback"]);
    expect(captured.result).toEqual({
      bodies: original.bodies,
      angles: original.angles,
      houses: original.houses,
      aspects: original.aspects
    });
    expect(captured.result.angles?.asc).toBeCloseTo(23.871984112302016, 8);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(captured));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected valid synthetic receipt");
    expect(parsed.envelope).toEqual(captured);
    const replay = natalReplayInput(parsed.envelope);
    expect(replay.houseSystem).toBe("placidus");
    expect(replay.utc).toBe(INSTANT);
    expect(createNatalEnvelope(natalChart(replay))).toEqual(captured);
  });

  it.each([-80, -40, 0, 40, 80])(
    "accepts full public results for synthetic latitude %s without numeric rounding",
    (latitude) => {
      for (const houseSystem of ["whole", "placidus"] as const) {
        const original = chart({ latitude, houseSystem });
        const captured = createNatalEnvelope(original);
        const parsed = parseNatalEnvelope(serializeNatalEnvelope(captured));
        expect(parsed).toEqual({ ok: true, envelope: captured });
        expect(captured.result.bodies).toEqual(original.bodies);
        expect(captured.result.aspects).toEqual(original.aspects);
      }
    }
  );

  it("does not infer noon or a known time for an unknown 08:30 reference", () => {
    const birth = resolveBirth({
      date: "2001-12-21",
      time: "08:30",
      timeKnown: false,
      timeZone: "Etc/UTC",
      latitude: 78.2232,
      longitude: 15.6267,
      houseSystem: "placidus"
    });
    const captured = createNatalEnvelope(natalChart(birth));
    expect(captured.receipt).toMatchObject({
      instant: "2001-12-21T08:30:00.000Z",
      timeKnown: false,
      reference: "supplied-instant",
      sourceInstant: null,
      localResolution: null,
      houses: { requested: "placidus", actual: null, absenceReason: "unknown-time" },
      resultFlags: ["no-time"]
    });
    expect(captured.result.angles).toBeNull();
    expect(captured.result.houses).toBeNull();
    expect(natalReplayInput(captured)).toMatchObject({
      timeKnown: false,
      utc: "2001-12-21T08:30:00.000Z",
      houseSystem: "placidus"
    });
  });

  it("distinguishes known time without coordinates from unknown time", () => {
    const captured = createNatalEnvelope(natalChart({ utc: INSTANT, houseSystem: "placidus" }));
    expect(captured.receipt).toMatchObject({
      timeKnown: true,
      coordinates: null,
      houses: { requested: "placidus", actual: null, absenceReason: "missing-location" },
      resultFlags: []
    });
    expect(natalReplayInput(captured)).not.toHaveProperty("latitude");
  });

  it("accepts actual public omitted/undefined option values, whose output omits optional properties", () => {
    const actual = natalChart({
      utc: INSTANT,
      latitude: undefined,
      longitude: undefined,
      houseSystem: undefined,
      timeKnown: undefined,
      flags: undefined
    } as unknown as BirthInput);
    expect(Object.hasOwn(actual.input, "latitude")).toBe(false);
    expect(Object.hasOwn(actual.input, "flags")).toBe(false);
    expect(createNatalEnvelope(actual).receipt.houses).toEqual({
      requested: "whole",
      actual: null,
      absenceReason: "missing-location"
    });
  });

  it("requires an exact explicitly supplied UTC noon convention", () => {
    const captured = envelope(
      { utc: "2000-02-29T12:00:00Z", timeKnown: false },
      { reference: "utc-noon" }
    );
    expect(captured.receipt.reference).toBe("utc-noon");
    expect(envelope({ utc: "2000-02-29T12:00:00Z", timeKnown: false }).receipt.reference).toBe(
      "supplied-instant"
    );
    for (const utc of [
      "2000-02-29T08:30:00Z",
      "2000-02-29T12:00:01Z",
      "2000-02-29T12:00:00.001Z"
    ]) {
      errorFrom(
        () => envelope({ utc, timeKnown: false }, { reference: "utc-noon" }),
        "invalid_context"
      );
    }
    errorFrom(
      () => envelope({ utc: "2000-02-29T12:00:00Z" }, { reference: "utc-noon" }),
      "invalid_context"
    );
  });

  it("records local noon only with matching captured local civil context", () => {
    const captured = local("2000-02-29", "12:00", "America/New_York", 0, false, "local-noon");
    expect(captured.receipt.instant).toBe("2000-02-29T17:00:00.000Z");
    expect(captured.receipt.localResolution?.time).toBe("12:00");
    expect(natalReplayInput(captured).utc).toBe("2000-02-29T17:00:00.000Z");
    errorFrom(() => envelope({ timeKnown: false }, { reference: "local-noon" }), "invalid_context");
    errorFrom(
      () => local("2000-02-29", "08:30", "America/New_York", 0, false, "local-noon"),
      "invalid_context"
    );
  });

  it.each([
    "2001-12-21T09:00:00Z",
    "2001-12-21T09:00:00+00:00",
    "2001-12-21T09:00:00-00:00",
    "2001-12-21T14:30:00+05:30"
  ])("retains captured offset spelling %s without a timezone inference", (sourceInstant) => {
    const captured = envelope({}, { sourceInstant });
    expect(captured.receipt.sourceInstant).toBe(sourceInstant);
    expect(captured.receipt.instant).toBe(INSTANT);
    expect(captured.receipt.localResolution).toBeNull();
    expect(parseNatalEnvelope(serializeNatalEnvelope(captured))).toEqual({
      ok: true,
      envelope: captured
    });
  });

  it("retains date-only UTC-midnight input if supplied, and rejects mismatched/malformed source strings", () => {
    const captured = envelope({ utc: "2000-02-29" }, { sourceInstant: "2000-02-29" });
    expect(captured.receipt.instant).toBe("2000-02-29T00:00:00.000Z");
    expect(captured.receipt.sourceInstant).toBe("2000-02-29");
    for (const sourceInstant of [
      "2001-02-29",
      "2001-12-21T08:30:00Z",
      "2001-12-21T09:00",
      `${INSTANT}\n`
    ]) {
      errorFrom(() => envelope({}, { sourceInstant }), "invalid_context");
    }
  });

  it.each([
    ["2024-03-10", "02:30", "America/New_York", 60, "2024-03-10T07:30:00.000Z", ["dst-gap"]],
    ["2024-11-03", "01:30", "America/New_York", 0, "2024-11-03T05:30:00.000Z", ["dst-fold"]],
    ["1907-07-06", "08:30", "America/Mexico_City", 0, "1907-07-06T15:06:36.000Z", ["lmt"]]
  ] as const)(
    "preserves captured %s %s resolution without recomputing its historical policy",
    (date, time, zone, shift, instant, flags) => {
      const captured = local(date, time, zone, shift);
      expect(captured.receipt.instant).toBe(instant);
      expect(captured.receipt.inputFlags).toEqual(flags);
      const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
        throw new Error(SECRET);
      });
      try {
        const parsed = parseNatalEnvelope(serializeNatalEnvelope(captured));
        expect(parsed).toEqual({ ok: true, envelope: captured });
        expect(natalReplayInput(captured).utc).toBe(instant);
      } finally {
        spy.mockRestore();
      }
    }
  );

  it.each([
    ["0000-01-01", "00:30", "Etc/GMT-1", "-000001-12-31T23:30:00.000Z"],
    ["0099-12-31", "23:30", "Etc/GMT+1", "0100-01-01T00:30:00.000Z"]
  ])(
    "preserves arithmetic year boundary %s without Date.UTC remapping",
    (date, time, zone, instant) => {
      expect(local(date!, time!, zone!).receipt.instant).toBe(instant);
    }
  );

  it("rejects inconsistent gap shifts, LMT assertions and impossible captured civil values", () => {
    const original = local("2024-03-10", "02:30", "America/New_York", 60);
    for (const change of [
      { gapShiftMinutes: 0 },
      { gapShiftMinutes: 120 },
      { offsetMinutes: -300 },
      { date: "2024-02-30" },
      { time: "24:00" },
      { offsetMinutes: -240.000001 }
    ]) {
      const altered = structuredClone(original);
      Object.assign(altered.receipt.localResolution!, change);
      expect(imported(altered).ok).toBe(false);
    }
    const lmt = local("1907-07-06", "08:30", "America/Mexico_City");
    lmt.receipt.inputFlags = [];
    lmt.receipt.resultFlags = [];
    expect(imported(lmt)).toEqual({ ok: false, code: "invalid_context" });
  });

  it("does not authenticate supplied provenance or echo it in redacted diagnostics", () => {
    const captured = envelope(
      {},
      {
        sourceInstant: "2001-12-21T09:00:00-00:00",
        provenance: {
          source: { repository: `https://example.test/${SECRET}`, commit: "a".repeat(40) },
          artifact: {
            sha256: "b".repeat(64),
            packageVersion: ENGINE_VERSION,
            distributionRepository: "https://example.test/artifacts",
            distributionCommit: "c".repeat(40)
          },
          runtime: { name: SECRET, version: SECRET, icuVersion: SECRET, tzdbVersion: SECRET },
          ephemeris: { name: "astronomy-engine", version: "2.1.19" }
        },
        extensions: { private: SECRET, names: [SECRET], html: `<img src=x onerror="${SECRET}">` }
      }
    );
    expect(captured.receipt.provenance?.status).toBe("claimed");
    expect(parseNatalEnvelope(serializeNatalEnvelope(captured))).toEqual({
      ok: true,
      envelope: captured
    });
    const diagnostic = redactNatalEnvelope(captured);
    expect(diagnostic).toEqual({
      schema: "zodiacs.natal-diagnostic.draft-v1",
      status: "redacted-not-anonymous",
      timeKnown: true,
      houses: { requested: "placidus", actual: "whole", absenceReason: null },
      inputFlags: [],
      resultFlags: ["polar-fallback"]
    });
    const output = JSON.stringify(diagnostic);
    for (const privateValue of [
      SECRET,
      INSTANT,
      "78.2232",
      "23.871984",
      ENGINE_VERSION,
      "a".repeat(40),
      "b".repeat(64),
      "2.1.19"
    ])
      expect(output).not.toContain(privateValue);
    diagnostic.houses.requested = "whole";
    expect(captured.receipt.houses.requested).toBe("placidus");
  });

  it("rejects an artifact claiming a different package version and unsupported provenance facts", () => {
    errorFrom(
      () =>
        envelope(
          {},
          { provenance: { artifact: { sha256: "a".repeat(64), packageVersion: "999.0.0" } } }
        ),
      "invalid_context"
    );
    errorFrom(() =>
      envelope(
        {},
        { provenance: { source: { repository: "https://example.test/repo", commit: SECRET } } }
      )
    );
    errorFrom(
      () =>
        envelope({}, {
          provenance: { runtime: { name: SECRET }, status: "authenticated" }
        } as unknown as NatalEnvelopeContext),
      "invalid_shape"
    );
  });

  it("clones all accepted mutable data and uses lexical code-unit key ordering", () => {
    const original = chart();
    const context = { extensions: { é: [1], _: { a: 2 }, a: true, "!": null, Z: "z" } };
    const captured = createNatalEnvelope(original, context);
    const encoded = serializeNatalEnvelope(captured);
    expect(Object.keys(captured.extensions!)).toEqual(["!", "Z", "_", "a", "é"]);
    original.input.utc.setTime(0);
    original.bodies[0]!.lon = 0;
    context.extensions["é"][0] = 999;
    expect(serializeNatalEnvelope(captured)).toBe(encoded);
    const reversed = {
      ...captured,
      extensions: Object.fromEntries(Object.entries(captured.extensions!).reverse())
    };
    expect(serializeNatalEnvelope(reversed)).toBe(encoded);
  });
});

describe("hostile or inconsistent natal envelopes", () => {
  it.each(["no-time", "polar-fallback", SECRET])(
    "rejects forged caller flag %s instead of publishing it as a derived fact",
    (flag) => {
      const actual = chart({ latitude: 40, houseSystem: "whole" });
      // Mutate after public calculation: the codec must still reject forged
      // Charts even though natalChart now validates caller flags itself.
      actual.input.flags = [flag as ChartFlag];
      actual.flags.push(flag as ChartFlag);
      expect(actual.flags).toContain(flag);
      errorFrom(() => createNatalEnvelope(actual));
    }
  );

  it.each([-90, 90])(
    "rejects known-time angle results at exact latitude %s but permits unknown-time/no-angle input",
    (latitude) => {
      errorFrom(() => envelope({ latitude }), "unsupported_feature");
      expect(envelope({ latitude, timeKnown: false }).result.angles).toBeNull();
      const altered = envelope();
      altered.receipt.coordinates!.latitude = latitude;
      expect(imported(altered)).toEqual({ ok: false, code: "unsupported_feature" });
    }
  );

  it("rejects invalid enum, geometry, precision and flag/result consistency", () => {
    const alterations: Array<(value: NatalEnvelope) => void> = [
      (value) => {
        value.receipt.houses.actual = "placidus";
      },
      (value) => {
        value.receipt.houses.requested = "whole";
      },
      (value) => {
        value.receipt.timeKnown = false;
      },
      (value) => {
        value.receipt.resultFlags = [];
      },
      (value) => {
        value.receipt.inputFlags = ["dst-gap", "dst-fold"];
      },
      (value) => {
        value.result.bodies[1]!.body = value.result.bodies[0]!.body;
      },
      (value) => {
        value.result.bodies.pop();
      },
      (value) => {
        value.result.bodies[0]!.lon = 360;
      },
      (value) => {
        value.result.bodies[0]!.degree += 0.1;
      },
      (value) => {
        value.result.bodies[0]!.retrograde = !value.result.bodies[0]!.retrograde;
      },
      (value) => {
        value.result.angles!.dsc += 1;
      },
      (value) => {
        value.result.houses!.cusps[0] = value.result.houses!.cusps[1]!;
      },
      (value) => {
        value.result.aspects.push({ ...value.result.aspects[0]! });
      },
      (value) => {
        value.result.aspects[0]!.orb += 0.1;
      }
    ];
    for (const alter of alterations) {
      const value = envelope();
      alter(value);
      expect(imported(value).ok).toBe(false);
      errorFrom(() => serializeNatalEnvelope(value));
    }
  });

  it("rejects unsafe JavaScript values before serialization without invoking accessors/toJSON", () => {
    let calls = 0;
    const getter = {
      get hidden() {
        calls++;
        throw new Error(SECRET);
      }
    };
    const toJSON = {
      toJSON() {
        calls++;
        throw new Error(SECRET);
      }
    };
    const inherited = Object.create({
      get hidden() {
        calls++;
        throw new Error(SECRET);
      }
    });
    const accessorArray = [1];
    Object.defineProperty(accessorArray, "0", {
      get() {
        calls++;
        throw new Error(SECRET);
      },
      enumerable: true
    });
    const sparse = new Array(2);
    sparse[1] = 1;
    for (const value of [
      getter,
      toJSON,
      inherited,
      accessorArray,
      sparse,
      NaN,
      Infinity,
      undefined,
      1n,
      Symbol(SECRET),
      new Date()
    ]) {
      errorFrom(() => envelope({}, { extensions: { value } } as unknown as NatalEnvelopeContext));
    }
    const date = new Date(INSTANT);
    Object.defineProperty(date, "toJSON", {
      get() {
        calls++;
        throw new Error(SECRET);
      }
    });
    const actual = chart();
    actual.input.utc = date;
    errorFrom(() => createNatalEnvelope(actual));
    class UnsafeDate extends Date {
      override getTime(): number {
        calls++;
        throw new Error(SECRET);
      }
    }
    actual.input.utc = new UnsafeDate(INSTANT);
    errorFrom(() => createNatalEnvelope(actual));
    expect(calls).toBe(0);
  });

  it("rejects prototype keys, cycles, oversized UTF8 and excessively deep/node-heavy data", () => {
    for (const key of ["__proto__", "prototype", "constructor"]) {
      const value = envelope();
      value.extensions = JSON.parse(`{"${key}":{"polluted":true}}`);
      expect(imported(value)).toEqual({ ok: false, code: "invalid_shape" });
    }
    expect((Object.prototype as { polluted?: boolean }).polluted).toBeUndefined();
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    errorFrom(() => envelope({}, { extensions: cycle } as NatalEnvelopeContext), "invalid_shape");
    expect(parseNatalEnvelope(" ".repeat(NATAL_ENVELOPE_LIMITS.bytes + 1))).toEqual({
      ok: false,
      code: "size_limit"
    });
    expect(parseNatalEnvelope(`"${"🌙".repeat(20_000)}"`)).toEqual({
      ok: false,
      code: "size_limit"
    });
    let deep: unknown = 1;
    for (let i = 0; i < 15; i++) deep = { deeper: deep };
    errorFrom(() => envelope({}, { extensions: deep } as NatalEnvelopeContext), "complexity_limit");
    const value = envelope();
    value.extensions = { many: Array.from({ length: 4096 }, () => 0) };
    expect(imported(value)).toEqual({ ok: false, code: "complexity_limit" });
  });

  it("uses fixed failure codes and rejects unsupported versions/features rather than replaying them", () => {
    expect(parseNatalEnvelope(`{"secret":"${SECRET}",`)).toEqual({
      ok: false,
      code: "invalid_json"
    });
    expect(parseNatalEnvelope(4 as unknown as string)).toEqual({
      ok: false,
      code: "invalid_shape"
    });
    const version = envelope();
    version.schema = "foreign-schema" as typeof NATAL_ENVELOPE_SCHEMA;
    expect(imported(version)).toEqual({ ok: false, code: "unsupported_version" });
    const features = envelope();
    features.requiredFeatures = [SECRET];
    expect(imported(features)).toEqual({ ok: false, code: "unsupported_feature" });
    errorFrom(() => natalReplayInput(features), "unsupported_feature");
    const extra = { ...envelope(), execute: SECRET };
    expect(imported(extra)).toEqual({ ok: false, code: "invalid_shape" });
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error(SECRET);
        }
      }
    );
    errorFrom(() => serializeNatalEnvelope(proxy as NatalEnvelope), "invalid_shape");
  });

  it("rejects duplicate and escaped-equivalent members before last-wins JSON semantics can erase required features", () => {
    const json = serializeNatalEnvelope(envelope());
    for (const prefix of [
      '"schema":"foreign",',
      '"\\u0073chema":"foreign",',
      '"requiredFeatures":["execute"],'
    ]) {
      expect(parseNatalEnvelope(`{${prefix}${json.slice(1)}`)).toEqual({
        ok: false,
        code: "invalid_json"
      });
    }
    const withExtras = { ...envelope(), extensions: { key: "first" } };
    const duplicate = JSON.stringify(withExtras).replace(
      '"key":"first"',
      '"key":"first","\\u006bey":"second"'
    );
    expect(parseNatalEnvelope(duplicate)).toEqual({ ok: false, code: "invalid_json" });
    expect(parseNatalEnvelope(JSON.stringify(envelope(), null, 2)).ok).toBe(true);
  });

  it("reconstructs fixed errors from branded codes without reading caller-mutated messages or getter codes", () => {
    let calls = 0;
    const error = new NatalEnvelopeError("invalid_json");
    error.message = SECRET;
    Object.defineProperty(error, "code", {
      get() {
        calls++;
        throw new Error(SECRET);
      }
    });
    const proxy = new Proxy(
      {},
      {
        ownKeys() {
          throw error;
        }
      }
    );
    errorFrom(() => serializeNatalEnvelope(proxy as NatalEnvelope), "invalid_json");
    const fake = Object.create(NatalEnvelopeError.prototype);
    Object.defineProperty(fake, "code", {
      get() {
        calls++;
        throw new Error(SECRET);
      }
    });
    const forged = new Proxy(
      {},
      {
        ownKeys() {
          throw fake;
        }
      }
    );
    errorFrom(() => serializeNatalEnvelope(forged as NatalEnvelope), "invalid_shape");
    expect(new NatalEnvelopeError(SECRET as NatalEnvelopeErrorCode).message).toBe(
      "Natal envelope rejected: invalid_shape."
    );
    expect(calls).toBe(0);
  });
});
