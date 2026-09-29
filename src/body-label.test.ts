import { describe, expect, it } from "vitest";

import { DEFAULT_ASPECT_POLICY, createAspectPolicy, findConfiguredAspects } from "./configured-aspects.js";
import { declinationOrb, declinationsForBodies, findDeclinationAspects } from "./declination.js";
import type { DeclinationBody } from "./declination.js";

const INVALID = [" Mars", "Mars ", "Mars\u0000", "Mars\u007f", "Ma\nrs", "\u00a0Mars", "Mars\ufeff", "Mars\u3000", "", " ",
  "x".repeat(81), "x".repeat(200), "\u{1F600}".repeat(41), 5, null];
// Lengths are UTF-16 code units: forty astral characters are 80. C1 controls,
// U+0085 (which trim keeps), U+200B and lone surrogates are not rejected.
const VALID = ["Mars", "North Node", "x".repeat(80), "\u1e80est point", "__proto__", "sun", "\u{1F600}".repeat(40),
  "Mars\u0085", "M\u009fars", "Mars\u200b", "\ud800"];

/** Every entry that takes a body label, configured-aspect and declination alike. */
const entries: [string, (label: unknown) => unknown][] = [
  ["createAspectPolicy bodies", (label) => createAspectPolicy({ bodies: [label as string] })],
  ["createAspectPolicy bodyOrbs", (label) => createAspectPolicy({ bodies: [label as string], bodyOrbs: { [String(label)]: 1 } })],
  ["findConfiguredAspects", (label) => findConfiguredAspects([{ body: label as string, lon: 0, speed: 0 }], DEFAULT_ASPECT_POLICY)],
  ["declinationsForBodies", (label) => declinationsForBodies([{ body: label as string, lon: 0, lat: 0 }], 23.44)],
  ["findDeclinationAspects", (label) => findDeclinationAspects([{ body: label, lon: 0, lat: 0 } as DeclinationBody], 23.44)],
  ["declinationOrb first", (label) => declinationOrb(label as string, "Mars")],
  ["declinationOrb second", (label) => declinationOrb("Mars", label as string)]
];

describe("one body-label rule for configured aspects and declinations", () => {
  it.each(entries)("%s rejects untrimmed, control-character, empty and over-long labels", (_name, call) => {
    for (const label of INVALID) {
      expect(() => call(label), JSON.stringify(label)).toThrow(RangeError);
      expect(() => call(label), JSON.stringify(label)).toThrow(/^Body labels must be nonempty, trimmed strings of at most 80 characters, without control characters\.$/);
    }
  });

  it.each(entries)("%s accepts the same labels as every other entry", (_name, call) => {
    for (const label of VALID) expect(() => call(label), label).not.toThrow();
  });

  it("rejects the three labels the declination API used to accept", () => {
    for (const label of [" Mars", "Mars\u0000", "x".repeat(200)]) {
      expect(() => declinationsForBodies([{ body: label, lon: 0, lat: 0 }], 23.44)).toThrow(RangeError);
      expect(() => createAspectPolicy({ bodies: [label] })).toThrow(RangeError);
    }
  });
});
