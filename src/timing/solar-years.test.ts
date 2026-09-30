import { describe, expect, it } from "vitest";

import { solarYears } from "./solar-years.js";

const DAY = 86_400_000;
const TROPICAL_YEAR = 365.2422 * DAY;

describe("solar-return years", () => {
  it("stay within hours of the mean tropical year, far inside the three days the solver searches", () => {
    // The figures docs/timing-hellenistic.md gives: 24 births from 1800 to
    // 1992, spread through the year, and the largest distance of return n
    // from birth + n × 365.2422 days over the first 110 and 300 returns.
    let within110 = 0;
    let within300 = 0;
    for (let index = 0; index < 24; index += 1) {
      const birth = Date.UTC(1800, 0, 1) + index * (200 / 24) * 365.2425 * DAY + index * 15.2 * DAY;
      const years = solarYears(new Date(birth));
      for (let n = 1; n <= 300; n += 1) {
        const minutes = Math.abs(years.returnMs(n) - (birth + n * TROPICAL_YEAR)) / 60_000;
        if (n <= 110) within110 = Math.max(within110, minutes);
        within300 = Math.max(within300, minutes);
      }
    }
    expect(within110.toFixed(0)).toBe("108");
    expect(within300.toFixed(0)).toBe("268");
    expect(within300).toBeLessThan((3 * 24 * 60) / 10);
  });
});
