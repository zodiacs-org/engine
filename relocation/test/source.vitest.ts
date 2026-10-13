import { describe, expect, it } from "vitest";
import { natalChart } from "@zodiacs/engine";
import type { BirthInput, Chart } from "@zodiacs/engine";
import { resolveLocalToUtc } from "@zodiacs/engine/geo";
import {
  createNatalEnvelope,
  NATAL_ENVELOPE_LIMITS,
  NatalEnvelopeError,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "@zodiacs/engine/receipt";
import type { NatalEnvelope } from "@zodiacs/engine/receipt";
import { relocateChart } from "../src/index.js";
import type { RelocationSource } from "../src/index.js";

// Invented birth and destinations. Engine parity is regression evidence only.
const birth: BirthInput = {
  utc: "2004-05-06T07:08:09.010-03:00",
  latitude: 17.25,
  longitude: -32.5,
  houseSystem: "placidus"
};
const destination = { latitude: -21.75, longitude: 142.25 };

function copyEnvelope(envelope: NatalEnvelope): NatalEnvelope {
  const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
  if (!parsed.ok) throw new Error(parsed.code);
  return parsed.envelope;
}

describe("existing relocation sources", () => {
  it("accepts a full Chart and captures its numerical result without mutating it", () => {
    const chart = natalChart(birth);
    const snapshot = createNatalEnvelope(chart);
    const result = relocateChart(chart, destination);
    expect(result.natal).toEqual(snapshot);
    expect(result.relocated).toEqual(createNatalEnvelope(natalChart({ ...birth, ...destination })));
    expect(createNatalEnvelope(chart)).toEqual(snapshot);
    expect(result.natal.result.bodies).not.toBe(chart.bodies);
    result.natal.result.bodies[0]!.speed = 123;
    result.natal.receipt.inputFlags.push("lmt");
    expect(createNatalEnvelope(chart)).toEqual(snapshot);
    expect(result.relocated.receipt.inputFlags).toEqual([]);
  });

  it("accepts a JSON-decoded envelope and keeps its source context only on natal", () => {
    const envelope = createNatalEnvelope(natalChart(birth), {
      sourceInstant: birth.utc as string,
      provenance: { runtime: { name: "synthetic-test-runtime" } },
      extensions: { note: "synthetic source", nested: { keep: true } }
    });
    const imported = JSON.parse(serializeNatalEnvelope(envelope)) as NatalEnvelope;
    const result = relocateChart(imported, destination);
    expect(result.natal).toEqual(envelope);
    expect(result.natal).not.toBe(imported);
    expect(result.relocated).toEqual(createNatalEnvelope(natalChart({ ...birth, ...destination }), {
      sourceInstant: birth.utc as string
    }));
    expect(result.relocated.receipt.provenance).toBeNull();
    expect(result.relocated.receipt.localResolution).toBeNull();
    expect(result.relocated.extensions).toBeUndefined();
    result.natal.extensions!.note = "changed";
    result.natal.result.bodies[0]!.speed = 123;
    expect(imported).toEqual(envelope);
  });

  it("retains accepted source claims but computes destination values with the installed engine", () => {
    const envelope = createNatalEnvelope(natalChart(birth));
    // Structurally accepted version/position claims do not authenticate origin.
    envelope.receipt.engine.version = "1.0.0-rc.1";
    envelope.result.bodies[0]!.speed = 123;
    envelope.result.bodies[0]!.retrograde = false;
    const result = relocateChart(envelope, destination);
    expect(result.natal).toEqual(envelope);
    const expected = createNatalEnvelope(natalChart({ ...birth, ...destination }));
    expect(result.relocated).toEqual(expected);
    expect(result.relocated.receipt.engine.version).not.toBe(envelope.receipt.engine.version);
    expect(result.relocated.result.bodies[0]!.speed).not.toBe(123);
  });

  it("retains birthplace time-resolution context only on the source receipt", () => {
    const resolved = resolveLocalToUtc("2004-05-06", "10:08", "Etc/UTC");
    const envelope = createNatalEnvelope(natalChart({ ...birth, utc: resolved.utc, flags: resolved.flags }), {
      localResolution: resolved.localResolution
    });
    const result = relocateChart(envelope, destination);
    expect(result.natal.receipt.localResolution).toEqual(resolved.localResolution);
    expect(result.relocated.receipt.localResolution).toBeNull();
    expect(result.relocated.receipt.instant).toBe(result.natal.receipt.instant);
  });

  it("replays scale, pinned delta-T and time-resolution flags for both source forms", () => {
    for (const timeScale of ["utc", "ut1", "tt"] as const) {
      const input = { ...birth, timeScale, deltaT: 72.25, flags: ["dst-fold", "lmt"] as const };
      const chart = natalChart(input);
      for (const source of [chart, createNatalEnvelope(chart)]) {
        const result = relocateChart(source, destination);
        expect(result.relocated).toEqual(createNatalEnvelope(natalChart({ ...input, ...destination })));
        expect(natalReplayInput(result.relocated)).toMatchObject({
          houseSystem: "placidus", timeKnown: true, deltaT: 72.25,
          flags: ["dst-fold", "lmt"], ...destination
        });
        expect(result.relocated.receipt.timeScale).toBe(timeScale);
      }
    }
  });

  it("preserves each requested polar system rather than replaying whole-sign fallback", () => {
    for (const houseSystem of ["placidus", "koch"] as const) {
      for (const latitude of [-89.5, 89.5]) {
        const chart = natalChart({ ...birth, houseSystem, latitude });
        for (const source of [chart, createNatalEnvelope(chart)]) {
          const normal = relocateChart(source, destination);
          expect(normal.natal.receipt.houses).toEqual({
            requested: houseSystem, actual: "whole", absenceReason: null
          });
          expect(normal.natal.receipt.resultFlags).toContain("polar-fallback");
          expect(normal.relocated.receipt.houses).toEqual({
            requested: houseSystem, actual: houseSystem, absenceReason: null
          });
          expect(normal.relocated.receipt.resultFlags).not.toContain("polar-fallback");
          const opposite = relocateChart(source, { latitude: -latitude, longitude: 180 });
          expect(opposite.relocated.receipt.houses).toEqual(normal.natal.receipt.houses);
          expect(opposite.relocated.receipt.resultFlags).toContain("polar-fallback");
          expect(opposite.relocated.result).toEqual(createNatalEnvelope(natalChart({
            ...birth, houseSystem, latitude: -latitude, longitude: 180
          })).result);
        }
      }
    }
  });

  it("retains an unknown-time reference instant without inferring destination noon", () => {
    const chart = natalChart({ ...birth, utc: "2004-05-06T12:00:00Z", timeKnown: false });
    const envelope = createNatalEnvelope(chart, { reference: "utc-noon" });
    for (const source of [chart, envelope]) {
      const result = relocateChart(source, destination);
      expect(result.natal.receipt.reference).toBe(source === chart ? "supplied-instant" : "utc-noon");
      expect(result.relocated.receipt.instant).toBe("2004-05-06T12:00:00.000Z");
      expect(result.relocated.receipt.timeKnown).toBe(false);
      expect(result.relocated.receipt.reference).toBe("supplied-instant");
      expect(result.relocated.result.angles).toBeNull();
      expect(result.relocated.result.houses).toBeNull();
      expect(result.relocated.receipt.resultFlags).toEqual(["no-time"]);
    }
  });

  it("accepts a chart/envelope without a birthplace and supplies only destination coordinates", () => {
    const chart = natalChart({ utc: birth.utc, houseSystem: "koch" });
    for (const source of [chart, createNatalEnvelope(chart)]) {
      const result = relocateChart(source, destination);
      expect(result.natal.receipt.coordinates).toBeNull();
      expect(result.natal.receipt.houses.absenceReason).toBe("missing-location");
      expect(result.relocated.receipt.houses.requested).toBe("koch");
      expect(result.relocated.result.angles).not.toBeNull();
    }
  });

  it.each([null, undefined, [], "{}", 123])("rejects unsupported sources: %j", (source) => {
    expect(() => relocateChart(source as unknown as RelocationSource, destination)).toThrow(RangeError);
  });

  it("routes incomplete chart/envelope records to receipt validation", () => {
    for (const source of [{ input: {} }, { bodies: [] }, { receipt: {} }, { schema: "unknown" }, {
      // A valid birth alongside a broken record must not bypass that validator.
      ...birth, result: {}
    }]) {
      expect(() => relocateChart(source as RelocationSource, destination)).toThrow(NatalEnvelopeError);
    }
  });

  it("rejects inconsistent charts instead of silently recomputing their source", () => {
    const chart = natalChart(birth);
    chart.flags.push("polar-fallback");
    expect(() => relocateChart(chart, destination)).toThrow(NatalEnvelopeError);
    const incomplete = natalChart(birth) as Partial<Chart>;
    delete incomplete.timeScale;
    expect(() => relocateChart(incomplete as Chart, destination)).toThrow(NatalEnvelopeError);
  });

  it("delegates envelope shape, conventions and result checks to the engine codec", () => {
    const original = createNatalEnvelope(natalChart(birth));
    const changes: Array<(envelope: NatalEnvelope) => void> = [
      (envelope) => { envelope.schema = "unknown" as NatalEnvelope["schema"]; },
      (envelope) => { envelope.requiredFeatures.push("unknown"); },
      (envelope) => { envelope.receipt.houses.actual = "whole"; },
      (envelope) => { envelope.receipt.resultFlags.push("no-time"); },
      (envelope) => { envelope.receipt.sourceInstant = "2004-05-07"; },
      (envelope) => { envelope.result.bodies[0]!.lon = NaN; },
      (envelope) => { envelope.receipt.coordinates!.latitude = 90; }
    ];
    for (const change of changes) {
      const envelope = copyEnvelope(original);
      change(envelope);
      expect(() => relocateChart(envelope, destination)).toThrow(NatalEnvelopeError);
    }
  });

  it("rejects executable or cyclic envelope data without invoking toJSON or accessors", () => {
    const envelope = createNatalEnvelope(natalChart(birth));
    let called = false;
    Object.defineProperty(envelope, "toJSON", { enumerable: true, value: () => { called = true; } });
    expect(() => relocateChart(envelope, destination)).toThrow(NatalEnvelopeError);
    expect(called).toBe(false);
    const accessor = copyEnvelope(createNatalEnvelope(natalChart(birth)));
    Object.defineProperty(accessor, "receipt", { enumerable: true, get: () => { called = true; } });
    expect(() => relocateChart(accessor, destination)).toThrow(NatalEnvelopeError);
    expect(called).toBe(false);
    const cycle = createNatalEnvelope(natalChart(birth));
    cycle.extensions = {};
    cycle.extensions.self = cycle.extensions;
    expect(() => relocateChart(cycle, destination)).toThrow(NatalEnvelopeError);
  });

  it("enforces the engine's envelope size limit before destination calculation", () => {
    const envelope = createNatalEnvelope(natalChart(birth));
    envelope.extensions = { data: "x".repeat(NATAL_ENVELOPE_LIMITS.bytes + 1) };
    expect(() => relocateChart(envelope, destination)).toThrowError(
      new NatalEnvelopeError("size_limit")
    );
  });

  it("returns replayable envelopes after successive relocations across the antimeridian", () => {
    const first = relocateChart(natalChart(birth), { latitude: 35, longitude: 180 });
    const second = relocateChart(first.relocated, { latitude: -35, longitude: -180 });
    expect(second.natal).toEqual(first.relocated);
    expect(second.relocated.result).toEqual(createNatalEnvelope(natalChart({
      ...birth, latitude: -35, longitude: -180
    })).result);
    expect(createNatalEnvelope(natalChart(natalReplayInput(second.relocated))).result)
      .toEqual(second.relocated.result);
  });
});
