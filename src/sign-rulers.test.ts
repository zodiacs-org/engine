import { describe, expect, it } from "vitest";

import { SIGN_SLUGS } from "./signs.js";
import { DOMICILE_RULERS } from "./techniques.js";
import { TRADITIONAL_RULERS } from "./timing.js";
import { SIGN_LORDS } from "./vedic.js";

describe("the three tables of traditional sign rulers", () => {
  it("agree sign by sign: techniques, timing and vedic each carry a copy", () => {
    expect(SIGN_SLUGS.map((sign) => DOMICILE_RULERS[sign])).toEqual([...SIGN_LORDS]);
    expect(SIGN_SLUGS.map((sign) => TRADITIONAL_RULERS[sign])).toEqual([...SIGN_LORDS]);
    expect(Object.keys(DOMICILE_RULERS)).toEqual([...SIGN_SLUGS]);
    expect(Object.keys(TRADITIONAL_RULERS)).toEqual([...SIGN_SLUGS]);
    expect(SIGN_LORDS).toHaveLength(12);
  });
});
