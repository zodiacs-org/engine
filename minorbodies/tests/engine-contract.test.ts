import { describe, expect, it } from "vitest";
import { searchLongitudeCrossingsWith } from "../../src/crossings.js";
import type { BodyLongitudeAt } from "../../src/crossings.js";
import { createAspectPolicy, findConfiguredAspects } from "../../src/configured-aspects.js";
import type { AspectPosition } from "../../src/configured-aspects.js";
import type { MinorBody } from "../src/index.js";

// These are invented functions and positions, never astronomical accuracy evidence.
const DAY = 86_400_000;
const from = new Date("2000-01-01T00:00:00Z");
const to = new Date(from.getTime() + 2 * DAY);

describe("existing engine extension boundaries", () => {
  it("accepts a typed minor-body callback in the existing crossing solver", () => {
    const seen = new Set<MinorBody>();
    const longitudeAt: BodyLongitudeAt<MinorBody> = (body, date) => {
      seen.add(body);
      return (359 + (date.getTime() - from.getTime()) / DAY) % 360;
    };
    const result = searchLongitudeCrossingsWith(longitudeAt, "Chiron", 0, from, to, {
      stepDays: 0.5, maxSamples: 100
    });
    expect([...seen]).toEqual(["Chiron"]);
    expect(result.status).toBe("complete");
    expect(result.crossings).toEqual([{ at: new Date(from.getTime() + DAY), retrograde: false }]);
  });

  it("preserves a sample-budget refusal without evaluating the provider", () => {
    const longitudeAt: BodyLongitudeAt<MinorBody> = () => { throw new Error("must not sample"); };
    expect(searchLongitudeCrossingsWith(longitudeAt, "Vesta", 30, from, to, {
      stepDays: 0.5, maxSamples: 1
    })).toEqual({ status: "refused", reason: "sample-budget", samples: 0, maxSamples: 1, crossings: [] });
  });

  it("accepts minor-body rows when configured aspects select their labels", () => {
    const rows: readonly AspectPosition[] = [
      { body: "Chiron", lon: 10, speed: -0.1 },
      { body: "Ceres", lon: 100, speed: 0.2 }
    ];
    expect(findConfiguredAspects(rows, createAspectPolicy()).aspects).toEqual([]);
    const policy = createAspectPolicy({
      bodies: ["Chiron", "Ceres"], aspects: [{ type: "square", orb: 0 }]
    });
    expect(findConfiguredAspects(rows, policy).aspects).toHaveLength(1);
    expect(findConfiguredAspects(rows, policy).aspects[0]).toMatchObject({
      a: "Chiron", b: "Ceres", type: "square", orb: 0
    });
  });
});
