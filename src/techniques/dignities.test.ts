import { describe, expect, it } from "vitest";
import { SIGN_SLUGS } from "../signs.js";
import { TRADITIONAL_RULERS } from "../timing/rulers.js";
import {
  CHALDEAN_FACES,
  CLASSICAL_PLANETS,
  DOMICILE_RULERS,
  EGYPTIAN_TERMS,
  EXALTATIONS,
  TRIPLICITY_LORDS,
  dignitiesFor,
  dignityFor,
  dignityRulersAt,
  essentialDignities,
  hasClassicalDignities,
  mutualReceptions
} from "./dignities.js";

// The tables as the sources print them, transcribed independently of the code's form.

/**
 * Ptolemy, Tetrabiblos I.20, "Terms according to the Egyptians" (tr. Robbins,
 * Loeb, 1940): each sign's terms in order, with their lengths in degrees.
 */
const TETRABIBLOS_EGYPTIAN_TERMS: Record<string, [string, number][]> = {
  aries: [["Jupiter", 6], ["Venus", 6], ["Mercury", 8], ["Mars", 5], ["Saturn", 5]],
  taurus: [["Venus", 8], ["Mercury", 6], ["Jupiter", 8], ["Saturn", 5], ["Mars", 3]],
  gemini: [["Mercury", 6], ["Jupiter", 6], ["Venus", 5], ["Mars", 7], ["Saturn", 6]],
  cancer: [["Mars", 7], ["Venus", 6], ["Mercury", 6], ["Jupiter", 7], ["Saturn", 4]],
  leo: [["Jupiter", 6], ["Venus", 5], ["Saturn", 7], ["Mercury", 6], ["Mars", 6]],
  virgo: [["Mercury", 7], ["Venus", 10], ["Jupiter", 4], ["Mars", 7], ["Saturn", 2]],
  libra: [["Saturn", 6], ["Mercury", 8], ["Jupiter", 7], ["Venus", 7], ["Mars", 2]],
  scorpio: [["Mars", 7], ["Venus", 4], ["Mercury", 8], ["Jupiter", 5], ["Saturn", 6]],
  sagittarius: [["Jupiter", 12], ["Venus", 5], ["Mercury", 4], ["Saturn", 5], ["Mars", 4]],
  capricorn: [["Mercury", 7], ["Jupiter", 7], ["Venus", 8], ["Saturn", 4], ["Mars", 4]],
  aquarius: [["Mercury", 7], ["Venus", 6], ["Jupiter", 7], ["Mars", 5], ["Saturn", 5]],
  pisces: [["Venus", 12], ["Jupiter", 4], ["Mercury", 3], ["Mars", 9], ["Saturn", 2]]
};

/** al-Bīrūnī, Book of Instruction §451, "Lords of faces" (tr. Wright), sign by sign. */
const BIRUNI_FACES = [
  ["Mars", "Sun", "Venus"], ["Mercury", "Moon", "Saturn"], ["Jupiter", "Mars", "Sun"], ["Venus", "Mercury", "Moon"],
  ["Saturn", "Jupiter", "Mars"], ["Sun", "Venus", "Mercury"], ["Moon", "Saturn", "Jupiter"], ["Mars", "Sun", "Venus"],
  ["Mercury", "Moon", "Saturn"], ["Jupiter", "Mars", "Sun"], ["Venus", "Mercury", "Moon"], ["Saturn", "Jupiter", "Mars"]
];

/**
 * Dorotheus, Carmen Astrologicum I.1.3 (tr. Pingree, 1976, pp. 161–162): "the
 * lords of the triplicity of Aries by day are the Sun, then Jupiter, then
 * Saturn, by night Jupiter, then the Sun, then Saturn", and so on.
 */
const DOROTHEUS_TRIPLICITIES = {
  fire: { day: ["Sun", "Jupiter", "Saturn"], night: ["Jupiter", "Sun", "Saturn"] },
  earth: { day: ["Venus", "Moon", "Mars"], night: ["Moon", "Venus", "Mars"] },
  air: { day: ["Saturn", "Mercury", "Jupiter"], night: ["Mercury", "Saturn", "Jupiter"] },
  water: { day: ["Venus", "Mars", "Moon"], night: ["Mars", "Venus", "Moon"] }
};

/** Tetrabiblos I.19: each planet's exaltation and depression (fall). */
const TETRABIBLOS_EXALTATIONS = {
  Sun: ["aries", "libra"], Saturn: ["libra", "aries"], Moon: ["taurus", "scorpio"], Jupiter: ["cancer", "capricorn"],
  Mars: ["capricorn", "cancer"], Venus: ["pisces", "virgo"], Mercury: ["virgo", "pisces"]
};

describe("the tables against their sources", () => {
  it("holds the Egyptian terms of Tetrabiblos I.20", () => {
    for (const sign of SIGN_SLUGS) {
      let end = 0;
      const ends = TETRABIBLOS_EGYPTIAN_TERMS[sign]!.map(([planet, length]) => [planet, (end += length)]);
      expect(EGYPTIAN_TERMS[sign], sign).toEqual(ends);
    }
  });

  it("gives each planet terms adding up to 57 (Saturn), 79 (Jupiter), 66 (Mars), 82 (Venus) and 76 (Mercury) degrees, 360 in all", () => {
    const totals: Record<string, number> = {};
    for (const sign of SIGN_SLUGS) {
      let from = 0;
      for (const [planet, end] of EGYPTIAN_TERMS[sign]) {
        totals[planet] = (totals[planet] ?? 0) + end - from;
        from = end;
      }
    }
    expect(totals).toEqual({ Saturn: 57, Jupiter: 79, Mars: 66, Venus: 82, Mercury: 76 });
  });

  it("holds al-Bīrūnī's faces, the planets in descending order from Mars", () => {
    expect(CHALDEAN_FACES).toEqual(BIRUNI_FACES.flat());
    expect(CHALDEAN_FACES).toHaveLength(36);
  });

  it("holds Dorotheus's triplicity lords", () => {
    for (const [element, lords] of Object.entries(DOROTHEUS_TRIPLICITIES)) {
      const table = TRIPLICITY_LORDS[element as keyof typeof TRIPLICITY_LORDS];
      expect([table.day, table.night, table.participating], element).toEqual([lords.day[0], lords.night[0], lords.day[2]]);
      expect(lords.day[2]).toBe(lords.night[2]);
    }
    // Ptolemy's fourth triangle (Tetrabiblos I.18) differs: Mars, with Venus by day and the Moon by night.
    expect(TRIPLICITY_LORDS.water).toEqual({ day: "Venus", night: "Mars", participating: "Moon" });
  });

  it("holds Ptolemy's exaltations and falls", () => {
    for (const [planet, [exaltation, fall]] of Object.entries(TETRABIBLOS_EXALTATIONS)) {
      expect(EXALTATIONS[planet as keyof typeof EXALTATIONS]).toBe(exaltation);
      expect(dignitiesFor(planet as never, fall as never)).toContain("fall");
    }
  });

  it("gives the domiciles of the timing entry's TRADITIONAL_RULERS", () => {
    expect(DOMICILE_RULERS).toEqual(TRADITIONAL_RULERS);
  });
});

describe("sign dignities (the site's cases)", () => {
  it("covers the seven classical planets only", () => {
    for (const planet of CLASSICAL_PLANETS) expect(hasClassicalDignities(planet)).toBe(true);
    for (const planet of ["Uranus", "Neptune", "Pluto", "North Node", "South Node"] as const) {
      expect(hasClassicalDignities(planet)).toBe(false);
      expect(dignityFor(planet, "aries")).toBeNull();
      expect(dignitiesFor(planet, "aries")).toEqual([]);
    }
  });

  it("matches the canonical anchors", () => {
    expect(dignityFor("Sun", "leo")).toBe("domicile");
    expect(dignityFor("Sun", "aries")).toBe("exaltation");
    expect(dignityFor("Sun", "libra")).toBe("fall");
    expect(dignityFor("Moon", "taurus")).toBe("exaltation");
    expect(dignityFor("Venus", "scorpio")).toBe("detriment");
    expect(dignityFor("Mars", "cancer")).toBe("fall");
    expect(dignityFor("Saturn", "aries")).toBe("fall");
    expect(dignityFor("Venus", "gemini")).toBeNull();
  });

  it("reads Mercury in Virgo as exaltation over domicile, and lists both", () => {
    expect(dignityFor("Mercury", "virgo")).toBe("exaltation");
    expect(dignitiesFor("Mercury", "virgo")).toEqual(["domicile", "exaltation"]);
    expect(dignitiesFor("Mercury", "pisces")).toEqual(["detriment", "fall"]);
  });

  it("refuses names that are not bodies or signs", () => {
    expect(() => dignityFor("sun" as never, "aries")).toThrow(RangeError);
    expect(() => dignitiesFor("Sun", "Aries" as never)).toThrow(RangeError);
    expect(() => hasClassicalDignities("toString" as never)).toThrow(RangeError);
  });
});

describe("dignity rulers at a longitude", () => {
  it("gives every ruler at 0° Aries and just before 0° Aries", () => {
    expect(dignityRulersAt(0)).toEqual({
      lon: 0, sign: "aries", domicile: "Mars", exaltation: "Sun",
      triplicity: { element: "fire", day: "Sun", night: "Jupiter", participating: "Saturn" },
      term: { planet: "Jupiter", from: 0, to: 6 }, face: { planet: "Mars", from: 0, to: 10 },
      detriment: "Venus", fall: "Saturn"
    });
    expect(dignityRulersAt(-1e-9)).toMatchObject({
      sign: "pisces", domicile: "Jupiter", exaltation: "Venus", term: { planet: "Saturn", from: 28, to: 30 },
      face: { planet: "Mars", from: 20, to: 30 }, detriment: "Mercury", fall: "Mercury"
    });
    expect(dignityRulersAt(360 + 6).term).toEqual({ planet: "Venus", from: 6, to: 12 });
    expect(dignityRulersAt(90 + 15).exaltation).toBe("Jupiter");
    expect(dignityRulersAt(300).exaltation).toBeNull();
    expect(() => dignityRulersAt(Number.NaN)).toThrow(RangeError);
  });
});

// William Lilly, Christian Astrology (1647), p. 112.
describe("Lilly's examples", () => {
  it("reception by house: the Sun in Aries and Mars in Leo", () => {
    expect(mutualReceptions([{ body: "Sun", lon: 15 }, { body: "Mars", lon: 135 }])).toEqual([
      { a: "Sun", b: "Mars", aReceivesB: ["domicile"], bReceivesA: ["domicile"] }
    ]);
  });

  it("reception by triplicity by day: Venus in Aries and the Sun in Taurus", () => {
    const positions = [{ body: "Venus" as const, lon: 10 }, { body: "Sun" as const, lon: 40 }];
    expect(mutualReceptions(positions, { dignities: ["triplicity"], sect: "day" })).toEqual([
      { a: "Sun", b: "Venus", aReceivesB: ["triplicity"], bReceivesA: ["triplicity"] }
    ]);
    expect(mutualReceptions(positions, { dignities: ["triplicity"], sect: "night" })).toEqual([]);
  });

  it("reception by term: Venus in the 24th degree of Aries and Mars in the 16th of Gemini", () => {
    for (const [venus, mars] of [[23.5, 75.5], [24, 76]] as const) {
      expect(mutualReceptions([{ body: "Venus", lon: venus }, { body: "Mars", lon: mars }], { dignities: ["term"] })).toEqual([
        { a: "Venus", b: "Mars", aReceivesB: ["term"], bReceivesA: ["term"] }
      ]);
    }
  });

  it("peregrine: Saturn in the tenth degree of Aries, not in its 27th or 28th; the Sun anywhere in Aquarius", () => {
    for (const sect of ["day", "night"] as const) {
      expect(essentialDignities("Saturn", 9.5, sect)).toMatchObject({ dignities: [], debilities: ["fall"], peregrine: true });
      expect(essentialDignities("Saturn", 26.5, sect)).toMatchObject({ dignities: ["term"], peregrine: false });
      expect(essentialDignities("Saturn", 27.5, sect).peregrine).toBe(false);
      for (const degree of [0, 7.3, 13.9, 20.2, 29.99]) {
        expect(essentialDignities("Sun", 300 + degree, sect)).toMatchObject({ dignities: [], debilities: ["detriment"], peregrine: true });
      }
    }
  });
});

describe("essential dignities and receptions", () => {
  it("counts the triplicity lord of the chart's sect only", () => {
    expect(essentialDignities("Sun", 125, "day").dignities).toEqual(["domicile", "triplicity"]);
    expect(essentialDignities("Sun", 125, "night").dignities).toEqual(["domicile"]);
    expect(essentialDignities("Jupiter", 125, "night").dignities).toEqual(["triplicity", "term"]);
    expect(essentialDignities("Jupiter", 128, "night").dignities).toEqual(["triplicity"]);
    // Saturn, the participating lord of fire, is not counted (Leo 21°: Mercury's term, Mars's face).
    expect(essentialDignities("Saturn", 141, "day").dignities).toEqual([]);
    expect(essentialDignities("Mars", 21, "day").dignities).toEqual(["domicile", "term"]);
    expect(essentialDignities("Mars", 5, "night").dignities).toEqual(["domicile", "face"]);
  });

  it("finds mixed receptions and ignores other bodies", () => {
    // Venus in Aries is in the Sun's exaltation; the Sun in Taurus in Venus's domicile.
    expect(mutualReceptions([{ body: "Venus", lon: 10 }, { body: "Sun", lon: 40 }, { body: "Pluto", lon: 40 }])).toEqual([
      { a: "Sun", b: "Venus", aReceivesB: ["exaltation"], bReceivesA: ["domicile"] }
    ]);
  });

  it("refuses bad input", () => {
    expect(() => essentialDignities("Uranus" as never, 0, "day")).toThrow(RangeError);
    expect(() => essentialDignities("Sun", 0, "dusk" as never)).toThrow(RangeError);
    expect(() => mutualReceptions([{ body: "Sun", lon: 1 }], { dignities: ["triplicity"] })).toThrow("sect");
    expect(() => mutualReceptions([{ body: "Sun", lon: 1 }], { dignities: ["house" as never] })).toThrow(RangeError);
    expect(() => mutualReceptions([{ body: "Sun", lon: 1 }, { body: "Sun", lon: 2 }])).toThrow(RangeError);
    expect(() => mutualReceptions([{ body: "Sun", lon: Number.NaN }])).toThrow(RangeError);
  });
});
