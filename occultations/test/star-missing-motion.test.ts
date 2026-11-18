import { expect, it, vi } from "vitest";

// Exercise absent-motion policy with synthetic source variants. The committed
// SAO rows are unchanged; these are API contract tests, not reference astrometry.
vi.mock("../src/catalogue.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/catalogue.js")>();
  const catalogue = original.starCatalogue();
  return { starCatalogue: () => ({
    ...catalogue,
    stars: catalogue.stars.slice(0, 3).map((star, i) => ({
      ...star,
      properMotion: {
        raCosDecMasPerYear: i === 0 || i === 2 ? null : 0,
        decMasPerYear: i === 1 || i === 2 ? null : 0
      },
      limitations: [...star.limitations, "proper-motion-incomplete"]
    }))
  }) };
});

import { starCatalogue } from "../src/catalogue.js";
import { starPositionAt } from "../src/star-position.js";

it("refuses each incomplete motion with its source and valid clock retained", () => {
  for (const source of starCatalogue().stars) {
    const result = starPositionAt({ star: source.id, time: "2000-01-01T12:00:00Z" });
    expect(result.status).toBe("refused");
    expect(result).toMatchObject({ reason: "proper-motion-unavailable" });
    expect(result.receipt.source.properMotion).toEqual(source.properMotion);
    expect(result.receipt.timeBasis).not.toBeNull();
    expect(result.receipt.limitations).toContain("proper-motion-incomplete");
    expect("direction" in result).toBe(false);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(Object.isFrozen(result)).toBe(true);
  }
});
