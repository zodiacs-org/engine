import { describe, expect, it, vi } from "vitest";

// A later release may add fields to the ΔT and time scale a chart carries. A
// record keeps the fields its conventions set names, and the reader compares a
// record with this engine's own basis as a record holds it, so records stay
// readable. Here every basis this engine computes gains a field.
vi.mock("./time-scale.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./time-scale.js")>();
  return {
    ...original,
    timeBasis: (...args: Parameters<typeof original.timeBasis>) => {
      const basis = original.timeBasis(...args);
      const { ut1MinusUtc, leapSeconds } = basis.timeScale;
      return {
        ...basis,
        deltaT: { ...basis.deltaT, note: "grown" },
        timeScale: {
          ...basis.timeScale,
          tdbMinusTt: 0.001,
          ut1MinusUtc: ut1MinusUtc && { ...ut1MinusUtc, bulletin: "A" },
          leapSeconds: leapSeconds && { ...leapSeconds, announced: "2000-07-01" }
        }
      };
    }
  };
});

const { natalChart } = await import("./api.js");
const { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } = await import("./receipt.js");

describe("a record written when a chart's time basis has grown", () => {
  it.each([
    ["utc", "2001-12-21T09:00:00Z"],
    ["tt", "2001-12-21T09:01:04.184Z"],
    ["utc", "1820-03-01T12:00:00Z"]
  ] as const)("keeps the recorded fields and reads back (%s %s)", (timeScale, utc) => {
    const chart = natalChart({ utc, timeScale, latitude: 51.5, longitude: -0.1, houseSystem: "placidus" });
    expect(chart.deltaT).toHaveProperty("note", "grown");
    expect(chart.timeScale).toHaveProperty("tdbMinusTt", 0.001);
    const envelope = createNatalEnvelope(chart);
    expect(Object.keys(envelope.result.deltaT!).sort()).toEqual(["model", "seconds", "segment", "sigma", "table", "tableDigest"]);
    expect(Object.keys(envelope.result.timeScale!).sort()).toEqual(["basis", "input", "leapSeconds", "ut1MinusUtc"]);
    const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
    expect(parsed).toEqual({ ok: true, envelope });
  });
});
