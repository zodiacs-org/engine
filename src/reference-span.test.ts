import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { natalChart, transits } from "./api.js";
import { computeChart } from "./ephemeris.js";
import { REFERENCE_SPAN, outsideReferenceSpan } from "./reference-span.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import { EPHEMERIS } from "./types.js";

const FLAG = "outside-reference-span";
const chartAt = (utc: string) =>
  natalChart({ utc, latitude: 51.5, longitude: -0.12, houseSystem: "whole", timeKnown: true });

describe("reference span (rule 1e)", () => {
  it("runs from 1800-01-01T00:00Z up to, not including, 2200-01-01T00:00Z", () => {
    expect(REFERENCE_SPAN).toEqual({
      from: "1800-01-01T00:00:00.000Z",
      to: "2200-01-01T00:00:00.000Z"
    });
    expect(outsideReferenceSpan(new Date(REFERENCE_SPAN.from))).toBe(false);
    expect(outsideReferenceSpan(new Date("2199-12-31T23:59:59.999Z"))).toBe(false);
    expect(outsideReferenceSpan(new Date(REFERENCE_SPAN.to))).toBe(true);
    expect(outsideReferenceSpan(new Date("1799-12-31T23:59:59.999Z"))).toBe(true);
    expect(Object.isFrozen(REFERENCE_SPAN)).toBe(true);
  });

  it("flags a chart in 2300 and one in 900, and none inside the span", () => {
    expect(chartAt("2300-06-01T12:00:00Z").flags).toContain(FLAG);
    expect(chartAt("0900-06-01T12:00:00Z").flags).toContain(FLAG);
    expect(chartAt("2026-06-01T12:00:00Z").flags).not.toContain(FLAG);
    expect(chartAt("1800-01-01T00:00:00Z").flags).not.toContain(FLAG);
    expect(
      computeChart({ utc: new Date("2300-06-01T12:00:00Z"), houseSystem: "whole", timeKnown: false })
        .flags
    ).toEqual(["no-time", FLAG]);
  });

  it("accepts the flag as an echo only where the calculation derives it", () => {
    expect(
      natalChart({ utc: "2300-06-01T12:00:00Z", timeKnown: true, flags: [FLAG] }).flags
    ).toEqual([FLAG]);
    expect(() => natalChart({ utc: "2026-06-01T12:00:00Z", flags: [FLAG] })).toThrow(RangeError);
    // A supplied Chart's flags must agree with its instant.
    const outside = chartAt("2300-06-01T12:00:00Z");
    expect(() => transits(outside, "2300-06-02T00:00:00Z")).not.toThrow();
    expect(() => transits({ ...outside, flags: [] }, "2300-06-02T00:00:00Z")).toThrow(RangeError);
    const inside = chartAt("2026-06-01T12:00:00Z");
    expect(() => transits({ ...inside, flags: [FLAG] }, "2026-06-02T00:00:00Z")).toThrow(
      RangeError
    );
  });

  it("carries the flag through a receipt, which checks it against the instant", () => {
    const json = serializeNatalEnvelope(createNatalEnvelope(chartAt("2300-06-01T12:00:00Z")));
    const parsed = parseNatalEnvelope(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.receipt.resultFlags).toEqual([FLAG]);
    const dropped = JSON.parse(json);
    dropped.receipt.resultFlags = [];
    expect(parseNatalEnvelope(JSON.stringify(dropped))).toMatchObject({
      ok: false,
      code: "inconsistent_result"
    });
    const inside = JSON.parse(
      serializeNatalEnvelope(createNatalEnvelope(chartAt("2026-06-01T12:00:00Z")))
    );
    inside.receipt.resultFlags = [FLAG];
    expect(parseNatalEnvelope(JSON.stringify(inside))).toMatchObject({
      ok: false,
      code: "inconsistent_result"
    });
  });

  it("does not let an older conventions set carry the flag", () => {
    const rc7 = JSON.parse(
      readFileSync(new URL("./fixtures/receipt-rc7.json", import.meta.url), "utf8")
    );
    rc7.receipt.resultFlags = [FLAG];
    expect(parseNatalEnvelope(JSON.stringify(rc7))).toMatchObject({
      ok: false,
      code: "invalid_value"
    });
  });
});

describe("ephemeris identity (rule 1j)", () => {
  it("names the exact astronomy-engine version the package depends on", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    const installed = JSON.parse(
      readFileSync(new URL("../node_modules/astronomy-engine/package.json", import.meta.url), "utf8")
    );
    expect(manifest.dependencies["astronomy-engine"]).toBe(EPHEMERIS.version);
    expect(installed.version).toBe(EPHEMERIS.version);
    expect(EPHEMERIS).toEqual({ name: "astronomy-engine", version: "2.1.19" });
    expect(Object.isFrozen(EPHEMERIS)).toBe(true);
  });

  it("puts it in every receipt and refuses a current receipt without it", () => {
    const envelope = createNatalEnvelope(chartAt("2026-06-01T12:00:00Z"));
    expect(envelope.receipt.engine.ephemeris).toEqual(EPHEMERIS);
    const json = serializeNatalEnvelope(envelope);
    const without = JSON.parse(json);
    delete without.receipt.engine.ephemeris;
    expect(parseNatalEnvelope(JSON.stringify(without))).toMatchObject({
      ok: false,
      code: "invalid_shape"
    });
    const other = JSON.parse(json);
    other.receipt.engine.ephemeris.name = "other-ephemeris";
    expect(parseNatalEnvelope(JSON.stringify(other))).toMatchObject({
      ok: false,
      code: "unsupported_feature"
    });
    const badVersion = JSON.parse(json);
    badVersion.receipt.engine.ephemeris.version = "latest";
    expect(parseNatalEnvelope(JSON.stringify(badVersion))).toMatchObject({
      ok: false,
      code: "invalid_value"
    });
  });
});
