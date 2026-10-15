import { describe, expect, it } from "vitest";
import type { BodyPosition } from "../../src/index.js";
import { renderChartText, renderComparisonText } from "../src/cli-text.js";
import { compareNatal, draconicChart, draconicCompare, transformNatal } from "../src/index.js";
import type { DraconicSource } from "../src/index.js";

// Invented chart with exact binary fractions. Hand derivations: ARITHMETIC.md.
function source(): DraconicSource {
  const body = (name: BodyPosition["body"], lon: number): BodyPosition => ({
    body: name, lon, lat: 1.25, sign: "aries", degree: 0, speed: 0, retrograde: false
  });
  return {
    node: { kind: "true", enginePoint: "North Node", longitude: 75.25 },
    natal: {
      bodies: [body("Sun", 100.5), body("Moon", 15), body("North Node", 75.25), body("South Node", 255.25)],
      angles: { asc: 350, mc: 80, dsc: 170, ic: 260 },
      houses: { system: "whole", cusps: [330, 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300] }
    }
  };
}

// Receipt context comes from an invented engine chart; it is not an accuracy reference.
const birth = { utc: "2000-04-05T06:07:00Z", latitude: 12.5, longitude: 45.25 };

describe("plain text coordinate presentation", () => {
  it("prints hand-derived rotated bodies, all angles and cusps without recasting", () => {
    const synthetic = source();
    const result = draconicChart(birth);
    result.draconic = transformNatal(synthetic);
    result.conventions.northNode = { ...synthetic.node };
    const before = structuredClone(result);
    const text = renderChartText(result);
    expect(text).toContain("Selected north node: true (North Node); natal longitude 75.25 degrees.");
    expect(text).toContain("node target 0 degrees Aries");
    expect(text).toContain("Sun\t25.25\t1.25\taries\t25.25\t5\n");
    expect(text).toContain("Moon\t299.75\t1.25\tcapricorn\t29.75\t2\n");
    expect(text).toContain("North Node\t0\t1.25\taries\t0\t4\n");
    expect(text).toContain("South Node\t180\t1.25\tlibra\t0\t10\n");
    expect(text).toContain("asc\t274.75\nmc\t4.75\ndsc\t94.75\nic\t184.75\n");
    expect(text).toContain("1\t254.75\n2\t284.75\n3\t314.75\n4\t344.75\n5\t14.75\n6\t44.75\n7\t74.75\n8\t104.75\n9\t134.75\n10\t164.75\n11\t194.75\n12\t224.75\n");
    expect(result).toEqual(before);
  });

  it("prints hand-derived comparison rows with direction, units and half-circle convention", () => {
    const synthetic = source();
    const result = draconicCompare(birth);
    result.comparison = compareNatal(synthetic);
    result.conventions.northNode = { ...synthetic.node };
    const before = structuredClone(result);
    const text = renderComparisonText(result);
    expect(text).toContain("Body\tNatal tropical (degrees)\tDraconic (degrees)\tDelta (degrees)\n");
    expect(text).toContain("Sun\t100.5\t25.25\t-75.25\nMoon\t15\t299.75\t-75.25\n");
    expect(text).toContain("North Node\t75.25\t0\t-75.25\nSouth Node\t255.25\t180\t-75.25\n");
    expect(text).toContain("asc\t350\t274.75\t-75.25\nmc\t80\t4.75\t-75.25\ndsc\t170\t94.75\t-75.25\nic\t260\t184.75\t-75.25\n");
    expect(text).toContain("1\t330\t254.75\t-75.25\n2\t0\t284.75\t-75.25\n");
    expect(text).toContain("12\t300\t224.75\t-75.25\n");
    expect(text).toContain("draconic minus natal, shortest signed circular displacement in (-180, 180] degrees; exact half-circle tie +180.");
    expect(text).toContain("Coordinate differences only; no elapsed time or motion is implied.");
    expect(result).toEqual(before);
  });

  it("preserves small and near-boundary binary64 coordinates without display rounding", () => {
    const synthetic = source();
    synthetic.node.longitude = 0;
    synthetic.natal.bodies[0]!.lon = 29.999999999999996;
    synthetic.natal.bodies[1]!.lon = Number.MIN_VALUE;
    const chart = draconicChart(birth);
    chart.draconic = transformNatal(synthetic);
    const comparison = draconicCompare(birth);
    comparison.comparison = compareNatal(synthetic);
    expect(renderChartText(chart)).toContain("Sun\t29.999999999999996\t1.25\taries\t29.999999999999996\t");
    expect(renderChartText(chart)).toContain("Moon\t5e-324\t1.25\taries\t5e-324\t");
    expect(renderComparisonText(comparison)).toContain("Sun\t29.999999999999996\t29.999999999999996\t0\n");
    expect(renderComparisonText(comparison)).toContain("Moon\t5e-324\t5e-324\t0\n");
  });
});

describe.each(["chart", "compare"] as const)("%s plain text natal context (wiring only)", (command) => {
  const textFor = (input: Parameters<typeof draconicChart>[0]): string =>
    command === "chart" ? renderChartText(draconicChart(input)) : renderComparisonText(draconicCompare(input));

  it.each([
    [{ utc: birth.utc }, "missing-location", "none"],
    [{ ...birth, timeKnown: false }, "unknown-time", "no-time"]
  ] as const)("marks absent geometry and its reason for %j", (input, absence, flag) => {
    const text = textFor(input);
    expect(text).toContain("House systems: requested whole; computed unavailable.");
    expect(text).toContain(`House absence: ${absence}.`);
    expect(text).toContain(`Natal flags: ${flag}.`);
    expect(text).toContain("\nAngles\nunavailable\n\nHouse cusps\nunavailable\n");
  });

  it("distinguishes requested from computed houses and retains fallback and natal time details", () => {
    const text = textFor({ ...birth, latitude: 78.5, houseSystem: "placidus", timeScale: "tt", deltaT: 120.5 });
    expect(text).toContain("House systems: requested placidus; computed whole.");
    expect(text).toContain("Natal flags: polar-fallback.");
    expect(text).toContain("scale tt; time known true.");
    expect(text).toContain("Time basis: pinned; deltaT seconds 120.5; model pinned.");
    expect(text).toContain("Engine natal receipt: @zodiacs/engine ");
    expect(text).toContain("; ephemeris astronomy-engine ");
    expect(text).toContain("Receipt scope: engine natal only; draconic derived by this library.");
    expect(text).toContain("Use --format json for the full natal receipt.");
    expect(text).not.toContain("House absence:");
    expect(text).not.toMatch(/[\u001b\u2014]/);
  });
});
