import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { EQUAL28_ARIES_V1, getBoundaryTable } from "../src/tables.js";
import type { BoundaryTableId, RationalDegrees } from "../src/tables.js";

interface NameWitness {
  sourceId: string;
  entries: {
    index: number;
    page: number;
    ocrName: string;
    normalizedLatinLabel: string;
    arabicSpelling: string;
  }[];
}
const names = JSON.parse(readFileSync(new URL("fixtures/biruni-1879-names.json", import.meta.url), "utf8")) as NameWitness;

// Cross multiply exact integer fractions. No engine longitude or production
// endpoint formula supplies the expected value.
function expectFraction(actual: RationalDegrees, numerator: bigint, denominator: bigint) {
  expect(Number.isSafeInteger(actual.numerator)).toBe(true);
  expect(Number.isSafeInteger(actual.denominator)).toBe(true);
  expect(actual.denominator).toBeGreaterThan(0);
  expect(BigInt(actual.numerator) * denominator).toBe(numerator * BigInt(actual.denominator));
}

describe("equal28-aries-v1 convention and independent arithmetic", () => {
  it("tiles a complete circle with exact equal rational widths at every endpoint", () => {
    const table = getBoundaryTable("equal28-aries-v1");
    expect(table.mansions).toHaveLength(28);
    expect(table.zeroPoint.degrees).toBe(0);
    expect(table.intervalConvention).toBe("[start,end)");
    expectFraction(table.width, 360n, 28n);
    for (let offset = 0; offset < 28; offset += 1) {
      const row = table.mansions[offset]!;
      expect(row.index).toBe(offset + 1);
      expectFraction(row.start, 360n * BigInt(offset), 28n);
      expectFraction(row.end, 360n * BigInt(offset + 1), 28n);
      const widthNumerator = BigInt(row.end.numerator) * BigInt(row.start.denominator)
        - BigInt(row.start.numerator) * BigInt(row.end.denominator);
      const widthDenominator = BigInt(row.end.denominator) * BigInt(row.start.denominator);
      expect(widthNumerator * 28n).toBe(360n * widthDenominator);
      if (offset > 0) expect(row.start).toEqual(table.mansions[offset - 1]!.end);
    }
    expectFraction(table.mansions[0]!.start, 0n, 1n);
    expectFraction(table.mansions[27]!.end, 360n, 1n);
  });

  it("distinguishes the exact width from its rounded sexagesimal display", () => {
    // A full circle contains 1,296,000 arcseconds. Divide by 28:
    // 46,285 + 5/7 seconds = 12 degrees, 51 minutes, 25 + 5/7 seconds.
    const arcsecondsPerCircle = 360n * 60n * 60n;
    expect(arcsecondsPerCircle / 28n).toBe(46_285n);
    expect(arcsecondsPerCircle % 28n).toBe(20n);
    expect(20n * 7n).toBe(5n * 28n);
    expect(46_285n / 3600n).toBe(12n);
    expect((46_285n % 3600n) / 60n).toBe(51n);
    expect(46_285n % 60n).toBe(25n);
    const roundedWidthTenths = 12n * 36_000n + 51n * 600n + 257n;
    expect(arcsecondsPerCircle * 10n - roundedWidthTenths * 28n).toBe(4n);
    // Exact table closure was checked above, without using the rounded width.
  });

  it("preserves the cited naming order, page locators and explicit editorial spellings", () => {
    const table = EQUAL28_ARIES_V1;
    expect(names.entries).toHaveLength(28);
    for (const [offset, witness] of names.entries.entries()) {
      const row = table.mansions[offset]!;
      expect(row.index).toBe(witness.index);
      expect(row.arabicName).toBe(witness.arabicSpelling);
      expect(row.latinLabel).toBe(witness.normalizedLatinLabel);
      expect(row.nameSource).toEqual({ id: names.sourceId, page: witness.page, entry: witness.index });
      expect(witness.ocrName.length).toBeGreaterThan(0);
      expect(row.arabicName).toMatch(/\p{Script=Arabic}/u);
    }
    expect(new Set(table.mansions.map((row) => row.arabicName)).size).toBe(28);
    expect(new Set(table.mansions.map((row) => row.latinLabel)).size).toBe(28);
    expect(table.mansions[25]!.latinLabel).toBe("al-Fargh al-Awwal");
    expect(table.mansions[26]!.latinLabel).toBe("al-Fargh al-Thānī");
    expect(table.mansions[27]!.latinLabel).toBe("Baṭn al-Ḥūt");
  });

  it("requires the explicit versioned table identity without a silent fallback", () => {
    expect(getBoundaryTable("equal28-aries-v1")).toBe(EQUAL28_ARIES_V1);
    expect(EQUAL28_ARIES_V1).toMatchObject({
      id: "equal28-aries-v1", version: 1,
      kind: "equal-longitude-segments", provenance: "SOURCES.md#equal28-aries-v1"
    });
    for (const id of [undefined, null, "", "equal28", "equal28-aries-v2", "__proto__", {}, 1]) {
      expect(() => getBoundaryTable(id as BoundaryTableId)).toThrow(RangeError);
    }
  });

  it("protects the versioned table from mutation by callers", () => {
    function checkFrozen(value: unknown) {
      if (value === null || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) checkFrozen(child);
    }
    checkFrozen(EQUAL28_ARIES_V1);
    expect(() => Reflect.set(EQUAL28_ARIES_V1.mansions[0]!.start, "numerator", 1)).not.toThrow();
    expect(Reflect.set(EQUAL28_ARIES_V1.mansions[0]!.start, "numerator", 1)).toBe(false);
    expectFraction(getBoundaryTable("equal28-aries-v1").mansions[0]!.start, 0n, 1n);
  });
});
