import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { timeBasis } from "../../src/time-scale.js";
import { lunarVisibilityOutline, positionAt, searchLunarContacts, OUTLINE_LIMITS } from "../src/index.js";
import { contactGeometry } from "../src/contact-geometry.js";
import { separationDegrees } from "../src/appulse-geometry.js";
import { OCCULTATION_RADII } from "../src/occultation-radii.js";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

interface OutlineReference {
  readonly id: string; readonly kind: string; readonly partition: string;
  readonly pair: readonly ["Moon", "Saturn"];
  readonly window: { readonly from: string; readonly to: string; readonly scale: string };
  readonly published: readonly { readonly side: "south" | "north"; readonly contactLimit: "inner" | "outer";
    readonly latitudeDeg: number; readonly longitudeEastDeg: number }[];
  readonly checks: readonly ReferenceCheck[];
}
const development = JSON.parse(readFileSync(new URL("./fixtures/events/development.json", import.meta.url), "utf8")) as {
  readonly cases: readonly OutlineReference[] };
const references = development.cases.filter((row) => row.kind === "visibility-outline");
const utc = (label: string) => new Date(timeBasis(Date.parse(label + "Z"), "ut1").utcMs).toISOString();

describe("independent development global outline", () => {
  it("retains the frozen entire exact-meridian comparison", () => {
    expect(references.map((r) => r.id)).toEqual(["naoj-map-202408"]);
    expect(references[0]!.published).toHaveLength(8);
    expect(references[0]!.checks.map((c) => c.key)).toEqual(Array.from({ length: 8 }, (_, i) => `node${i}Latitude`));
    for (const check of references[0]!.checks) {
      expect(check.maximumAbsoluteError).toBe(1);
      expect(check.unit).toBe("degrees");
    }
  });

  it.each(references)("meets every published latitude gate with distinct local disk boundaries: $id", (reference) => {
    expect(reference.partition).toBe("development");
    expect(reference.window.scale).toBe("ut1");
    const result = lunarVisibilityOutline({ target: reference.pair[1],
      window: { from: utc(reference.window.from), to: utc(reference.window.to) },
      longitudes: reference.published.map((node) => node.longitudeEastDeg) });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(`Outline refused: ${result.reason}`);
    expect(result.meridians).toHaveLength(reference.published.length);
    const actual: Record<string, number> = {};
    reference.published.forEach((node, i) => {
      const meridian = result.meridians.find((row) => row.longitudeDegrees === node.longitudeEastDeg)!;
      expect(meridian.status, `${i}: ${meridian.reason}`).toBe("resolved");
      expect(meridian.overlap).toHaveLength(1);
      expect(meridian.full).toHaveLength(1);
      const outer = meridian.overlap[0]!, inner = meridian.full[0]!;
      expect(outer.south.latitudeDegrees).toBeLessThan(inner.south.latitudeDegrees);
      expect(inner.north.latitudeDegrees).toBeLessThan(outer.north.latitudeDegrees);
      const boundary = (node.contactLimit === "inner" ? inner : outer)[node.side];
      expect(boundary.cause).toBe("limb");
      expect(boundary.local.targetGeometricAltitudeDegrees).toBeGreaterThan(0);
      actual[`node${i}Latitude`] = boundary.latitudeDegrees;
      // Re-evaluate with the existing topocentric adapters: the plane seed is
      // never accepted as a locally checked boundary just by carrying a label.
      const clearance = (latitude: number) => {
        const observer = { latitude, longitude: node.longitudeEastDeg, elevationMeters: 0 };
        const moon = positionAt({ body: "Moon", time: boundary.at, observer });
        const saturn = positionAt({ body: "Saturn", time: boundary.at, observer });
        if (moon.status !== "ok" || saturn.status !== "ok" || moon.dist === null || saturn.dist === null) throw new Error("Local sample refused");
        const geometry = contactGeometry({ separationDegrees: separationDegrees({ a: moon, b: saturn }),
          moonDistanceKm: moon.dist * OCCULTATION_RADII.auKm, targetDistanceKm: saturn.dist * OCCULTATION_RADII.auKm,
          targetRadiusKm: OCCULTATION_RADII.planetKm.Saturn });
        return node.contactLimit === "inner" ? geometry.internalClearanceDegrees : geometry.externalClearanceDegrees;
      };
      const south = clearance(boundary.latitudeBracket.south), north = clearance(boundary.latitudeBracket.north);
      expect(south * north).toBeLessThanOrEqual(0);
      expect(node.side === "south" ? north : south).toBeLessThanOrEqual(0);
      expect(boundary.latitudeBracket.north - boundary.latitudeBracket.south).toBeLessThanOrEqual(OUTLINE_LIMITS.localLatitudeBracketDegrees);
      expect(Math.abs(boundary.latitudeDegrees - boundary.planeLatitudeDegrees)).toBeLessThanOrEqual(OUTLINE_LIMITS.localLatitudeGuardDegrees);
      // Nearby local searches distinguish a graze boundary from an arbitrary
      // crossing along the sampled shadow, and preserve planetary disk semantics.
      const insideSign = node.side === "south" ? 1 : -1;
      for (const direction of [1, -1]) {
        const nearby = searchLunarContacts({ target: "Saturn",
          observer: { latitude: boundary.latitudeDegrees + direction * insideSign * 0.01,
            longitude: node.longitudeEastDeg, elevationMeters: 0 },
          window: { from: new Date(Date.parse(boundary.at) - 600_000), to: new Date(Date.parse(boundary.at) + 600_000) } });
        expect(nearby.status).toBe("complete");
        if (nearby.status !== "complete") throw new Error("Nearby local contact search refused");
        const intervals = node.contactLimit === "inner" ? nearby.fullCoverageIntervals : nearby.overlapIntervals;
        expect(intervals.length > 0).toBe(direction === 1);
      }
    });
    assertReferenceChecks(reference.checks, actual);
  }, 120_000);
});
