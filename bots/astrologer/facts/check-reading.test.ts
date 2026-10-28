import { describe, expect, it } from "vitest";
import { checkReading, findMentions, formatViolations, parseSheet } from "./check-reading.js";
import { buildReadingFacts, formatReadingFacts } from "./reading-facts.js";
import type { ReadingInput } from "./reading-facts.js";

// A hand-written sheet in the builder's format (synthetic chart, no real person).
const SHEET = [
  "[N1] Age at the window start (2026-11-01): 36 years 4 months (calendar age from the local birth date). Stage: adult.",
  "[P1] Ascendant 25°47' Pisces; Midheaven 27°33' Sagittarius (whole sign house 10)",
  "[P2] Moon 3°47' Pisces, whole sign house 1",
  "Tightest aspect: [A1] Jupiter trine Pluto, orb 0°17'",
  "[A1] 1. Jupiter trine Pluto, orb 0°17'",
  "[A2] 2. Moon square Mercury, orb 0°24'",
  "[A3] 3. Jupiter opposition Neptune, orb 1°58'",
  "[A4] 4. Saturn opposition Ascendant, orb 2°10'",
  "- [C1] Saturn opposition Ascendant, orb 2°10': on the Descendant, same as [A4]",
  "- [T1] transiting Sun square natal Mars: exact 2027-01-01",
  "- [T2] transiting Sun opposition natal Mercury: exact 2026-11-20",
  "- [T3] transiting Uranus square natal Moon: in orb (within 1°) from 2026-10-28 to 2026-12-17 (each end plus or minus 1 day); exact 2026-11-23 (each plus or minus 1 day)",
  "- [T4] transiting Mars square natal Mercury: exact 2026-11-20",
  "- [S1] Mars stations retrograde 2027-01-10 (plus or minus 1 day) at 9°10' Virgo. Contacts:",
  "  - [S1a] stationing Mars square natal Sun, orb 0°20'",
  "- [S2] Mercury stations direct 2026-11-14 (plus or minus 1 day) at 5°02' Scorpio. Contacts:",
  "  - [S2a] stationing Mercury trine natal Moon, orb 1°14'"
].join("\n");

const check = (reading: string) => checkReading(SHEET, reading);
const kinds = (reading: string) => check(reading).violations.map((v) => `${v.kind}: ${v.named}`);

describe("parseSheet", () => {
  it("reads natal aspects, transits and station contacts with their IDs", () => {
    const s = parseSheet(SHEET);
    expect(s.relations.map((r) => `${r.id} ${r.kind} ${r.a} ${r.type} ${r.b}`)).toEqual([
      "A1 natal Jupiter trine Pluto",
      "A2 natal Moon square Mercury",
      "A3 natal Jupiter opposition Neptune",
      "A4 natal Saturn opposition Ascendant",
      "C1 natal Saturn opposition Ascendant",
      "T1 transit Sun square Mars",
      "T2 transit Sun opposition Mercury",
      "T3 transit Uranus square Moon",
      "T4 transit Mars square Mercury",
      "S1a station Mars square Sun",
      "S2a station Mercury trine Moon"
    ]);
    expect([...s.ids.keys()]).toContain("N1");
    expect([...s.ids.keys()]).toContain("S1");
  });
});

describe("checkReading", () => {
  it("passes quoted sheet lines and natal aspects named in either order", () => {
    const r = check([
      "[A1] Jupiter trine Pluto, orb 0°17', is the tightest aspect.",
      "Mercury squares the Moon, so feeling and thought pull apart.",
      "The Jupiter\u2013Neptune opposition asks for realism.",
      "[T3] transiting Uranus square natal Moon: in orb from 2026-10-28 to 2026-12-17.",
      "Mars stations retrograde on 10 January: [S1a] stationing Mars square natal Sun, orb 0°20'."
    ].join("\n"));
    expect(r.violations).toEqual([]);
    expect(r.mentions).toBeGreaterThanOrEqual(5);
    expect(r.cited.sort()).toEqual(["A1", "S1a", "T3"]);
  });

  it("flags a square called a conjunction", () => {
    expect(kinds("The Moon conjoins Mercury.")).toEqual(["wrong-aspect: Moon conjunction Mercury"]);
  });

  it("flags a point said to be on an angle when the sheet has no such conjunction", () => {
    expect(kinds("Here the Moon is on the Ascendant.")).toEqual(["not-on-sheet: Moon conjunction Ascendant"]);
    expect(kinds("The Moon in Pisces on the Ascendant is sensitive.")).toEqual(["not-on-sheet: Moon conjunction Ascendant"]);
  });

  it("flags a transit with the moving body and the natal point swapped", () => {
    expect(kinds("Mercury opposes your natal Sun on 20 November.")).toEqual(["reversed: Mercury opposition Sun"]);
    expect(kinds("The Sun opposes your natal Mercury on 20 November.")).toEqual([]);
  });

  it("flags a station contact given the wrong aspect", () => {
    expect(kinds("With Mars stationing retrograde on your natal Sun around 10 January, slow down.")).toEqual(["wrong-aspect: Mars conjunction Sun"]);
  });

  it("checks every subject of a compound sentence", () => {
    expect(kinds("The Sun and Mars oppose Mercury (20 November).")).toEqual(["wrong-aspect: Mars opposition Mercury"]);
  });

  it("flags a planet's return the sheet does not list", () => {
    expect(kinds("Jupiter returns on 2027-01-08.")).toEqual(["not-on-sheet: Jupiter conjunction Jupiter", "date-mismatch: 2027-01-08"]);
  });

  it("reads an aspect to the Descendant as the matching aspect to the Ascendant", () => {
    expect(kinds("Saturn conjunct your Descendant gives partnerships weight.")).toEqual([]);
    expect(kinds("Saturn opposes your Descendant.")).toEqual(["wrong-aspect: Saturn conjunction Ascendant"]);
  });

  it("skips a negated aspect", () => {
    expect(kinds("Mars makes no square to the Moon.")).toEqual([]);
  });

  it("flags an ID that is not on the sheet, and an ID quoted with another line's planets", () => {
    expect(kinds("[T99] transiting Sun square natal Mars.")).toEqual(["unknown-id: [T99]"]);
    expect(kinds("[A1] Moon square Mercury.")).toEqual(["id-mismatch: Moon square Mercury"]);
  });

  it("lists violations with their sentence for a revision prompt", () => {
    const text = formatViolations(check("Here the Moon is on the Ascendant."));
    expect(text).toMatch(/^1\. In "Here the Moon is on the Ascendant\.": names Moon conjunction Ascendant/);
  });

  it("finds the station's planet for a contact listed after the station", () => {
    const [m] = findMentions("Mercury direct 14 Nov 2026 at 5°02' Scorpio: trine natal Moon, orb 1°14'.");
    expect(m).toMatchObject({ a: "Mercury", b: "Moon", type: "trine", context: "station" });
  });
});

describe("angle claims", () => {
  it("passes a planet on the axis or the angle the sheet puts it on", () => {
    expect(kinds("Saturn on the Ascendant axis steadies the chart.")).toEqual([]);
    expect(kinds("Saturn sits on the Ascendant-Descendant axis.")).toEqual([]);
    expect(kinds("Saturn on the Descendant asks for serious partnerships.")).toEqual([]);
  });

  it("flags a planet put on an angle or axis the sheet does not give (v4 O12, P12)", () => {
    expect(kinds("Venus on the Ascendant axis softens it.")).toEqual(["not-on-sheet: Venus on the Ascendant axis (conjunction or opposition Ascendant)"]);
    expect(kinds("Mars on the MC/IC axis drives ambition.")).toEqual(["not-on-sheet: Mars on the Midheaven axis (conjunction or opposition Midheaven)"]);
    expect(kinds("The Jupiter-Neptune opposition is eased, with the Sagittarian Venus on the rising degree softening it.")).toEqual(["not-on-sheet: Venus conjunction Ascendant"]);
    expect(kinds("Mercury conjunct the MC sharpens the voice.")).toEqual(["not-on-sheet: Mercury conjunction Midheaven"]);
    expect(kinds("Jupiter culminating gives public reach.")).toEqual(["not-on-sheet: Jupiter conjunction Midheaven"]);
  });

  it("reads 'Saturn rising' as Saturn on the Ascendant, and leaves a rising sign alone", () => {
    expect(kinds("Saturn rising makes you serious.")).toEqual(["wrong-aspect: Saturn conjunction Ascendant"]);
    expect(kinds("With Pisces rising and the rising sign ruled by Jupiter, you feel first.")).toEqual([]);
    expect(kinds("The Moon, rising in Pisces, is in the first house.")).toEqual([]);
  });

  it("quotes the sheet's angle lines in the message", () => {
    const [v] = check("Venus on the rising degree softens it.").violations;
    expect(v!.message).toContain("Planets on an angle, per the sheet: [C1] Saturn opposition Ascendant");
  });
});

describe("birthday and age claims", () => {
  // A child born 2015-11-11 (synthetic): next birthday and solar return on 2026-11-11.
  const CHILD = [
    "[N1] Age at the window start (2026-11-01): 10 years 11 months (calendar age from the local birth date). Stage: child (under 18).",
    "[N2] Next birthday (calendar anniversary of the local birth date 2015-11-11): 2026-11-11, when the person turns 11; inside the window.",
    "[B1] Solar return (transiting Sun conjunction natal Sun, the Sun back at its birth longitude) for the birthday of 2026-11-11: exact 2026-11-11, inside the window, date in Europe/London.",
    "- [T6] transiting Sun conjunction natal Sun: exact 2026-11-11"
  ].join("\n");
  const childKinds = (reading: string) => checkReading(CHILD, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("flags a date called the day after the birthday when it is the birthday itself (v4 H7)", () => {
    expect(childKinds("[T6] transiting Sun conjunction natal Sun, exact 2026-11-11. The last falls on the day after the birthday anniversary.")).toEqual([
      "date-mismatch: 2026-11-11 as the day after the birthday"
    ]);
    expect(childKinds("12 November is the day after your child's birthday.")).toEqual([]);
  });

  it("flags a birthday or solar return given another date, and passes the sheet's", () => {
    expect(childKinds("Your child's birthday on 2026-11-11 opens the year.")).toEqual([]);
    expect(childKinds("The solar return, 11 November, is a good day for a quiet celebration.")).toEqual([]);
    expect(childKinds("The birthday on 12 November marks a new year.")).toEqual(["date-mismatch: birthday 12 November"]);
    expect(childKinds("The solar return (November 12) starts a new cycle.")).toEqual(["date-mismatch: solar return November 12"]);
  });

  it("flags an age at the birthday that differs from the sheet", () => {
    expect(childKinds("Your child turns 11 on 2026-11-11.")).toEqual([]);
    expect(childKinds("Your child turns 12 this month.")).toEqual(["age-mismatch: turns 12"]);
    expect(childKinds("Plan the 10th birthday quietly.")).toEqual(["age-mismatch: 10th birthday"]);
  });

  it("gives an unknown ID its sentence", () => {
    expect(check("Mars is strong. [Q7] says so.").violations[0]!.sentence).toBe("[Q7] says so.");
  });
});

describe("a builder sheet read as a reading", () => {
  // Synthetic births from bots/astrologer/testset/charts.inputs.json (no real person).
  const inputs: ReadingInput[] = [
    { date: "1998-04-04", time: "14:44", timeKnown: true, zone: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 },
    { date: "2026-03-08", time: "02:30", timeKnown: true, zone: "America/New_York", lat: 40.7128, lon: -74.006 },
    { date: "1968-11-01", time: "12:00", timeKnown: true, zone: "Europe/London", lat: 51.5074, lon: -0.1278 },
    { date: "2002-04-13", time: null, timeKnown: false, zone: "America/Toronto", lat: 43.6532, lon: -79.3832 }
  ];
  it("passes itself: every line names a relation that is on the sheet", async () => {
    for (const input of inputs) {
      const sheet = formatReadingFacts(await buildReadingFacts(input));
      const r = checkReading(sheet, sheet);
      expect(r.violations).toEqual([]);
      expect(r.mentions).toBeGreaterThan(10);
      expect(parseSheet(sheet).relations.length).toBeGreaterThan(10);
    }
  }, 120_000);
});

describe("dates, ranges, orbs, houses and signs of transiting bodies", () => {
  // A hand-written sheet in the builder's current format (synthetic chart, no real person): Libra rising.
  const WINDOW = [
    "[P1] Ascendant 6°56' Libra; Midheaven 8°10' Cancer (whole sign house 10)",
    "[P2] Sun 14°02' Gemini, whole sign house 9",
    "[P3] Moon 3°47' Pisces, whole sign house 6",
    "[P4] Venus 22°04' Sagittarius, whole sign house 3",
    "[P5] Jupiter 25°32' Scorpio, whole sign house 2",
    "[P6] Saturn 13°40' Aquarius, whole sign house 5",
    "[A1] 1. Sun trine Saturn, orb 0°33'",
    "- [C1] Sun opposition Midheaven, orb 0°49': on the IC, same as [A9]",
    "[H1] Points in the angular houses (whole sign houses 1, 4, 7 and 10; a house placement, not a contact with the angle's degree): none.",
    "Transits 2026-11-01 to 2027-01-29 inclusive (90 days), dates in the person's zone (Europe/London).",
    "- [T1] transiting Neptune conjunction natal Venus: in orb (within 1°) from 2026-12-01 to 2027-03-03 (each end plus or minus 1 day); exact 2027-01-30 (each plus or minus 1 day); transiting Neptune in Sagittarius, whole sign house 3",
    "- [T2] transiting Pluto square natal Sun: in orb (within 1°) from 2026-07-19 to 2027-01-05 (each end plus or minus 1 day); exact 2026-11-26 (each plus or minus 1 day); transiting Pluto in Pisces, whole sign house 6",
    "- [T3] transiting Saturn square natal Midheaven: exact 2026-11-05, 2027-01-15; transiting Saturn in Aries, whole sign house 7",
    "- [T4] transiting Sun conjunction natal Venus: exact 2026-12-14; transiting Sun in Sagittarius, whole sign house 3",
    "- [T5] transiting Jupiter opposition natal Midheaven: exact 2026-11-08, 2027-01-16; transiting Jupiter in Capricorn, whole sign house 4",
    "- [T6] transiting Sun trine natal Moon: exact 2026-11-20; transiting Sun in Scorpio, whole sign house 2",
    "- [S1] Mercury stations direct 2026-11-13 (plus or minus 1 day) at 5°02' Scorpio, whole sign house 2. Contacts:",
    "  - [S1a] stationing Mercury trine natal Moon, orb 1°14'",
    "- [S2] Venus stations direct 2026-11-14 (plus or minus 1 day) at 22°51' Libra, whole sign house 1. Contacts:",
    "  - [S2a] stationing Venus conjunction natal Venus, orb 0°48'"
  ].join("\n");
  const flags = (reading: string, sheet = WINDOW) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);
  /** The same sheet as v5 sheets were written: no sign or house for a transiting body. */
  const OLD = WINDOW.replace(/; transiting \w+ in \w+, whole sign house \d+/g, "").replace(/, whole sign house (\d+)\. Contacts/g, ". Contacts");

  it("passes dates copied from the tied line, in ISO or natural form", () => {
    expect(flags("[T1] transiting Neptune conjunction natal Venus is exact 2027-01-30 (plus or minus 1 day).")).toEqual([]);
    expect(flags("Neptune's exact contact with your Venus comes on 30 January 2027.")).toEqual([]);
    expect(flags("[T3] transiting Saturn square natal Midheaven falls on November 5 and again on January 15.")).toEqual([]);
    expect(flags("The window runs from 1 November 2026 to 29 January 2027.")).toEqual([]);
  });

  it("flags a date restated with the wrong year or tied to the wrong line (v5 E2)", () => {
    expect(flags("Neptune's exact contact at the close of the window, on 2026-01-30 (plus or minus 1 day), falls just after it.")).toEqual(["date-mismatch: 2026-01-30"]);
    expect(flags("[T4] transiting Sun conjunction natal Venus on 2026-11-20 lifts the mood.")).toEqual(["date-mismatch: 2026-11-20"]);
    expect(flags("Mercury turns direct on 14 November.")).toEqual(["date-mismatch: 14 November"]);
    expect(flags("Plan a quiet day on 2026-12-02.")).toEqual(["date-mismatch: 2026-12-02"]);
  });

  it("flags a span made of two lines' dates, and passes a line's own range (v5 H5)", () => {
    expect(flags("The Sun's passage through this house runs from [T6] transiting Sun trine natal Moon on 2026-11-20 to [T4] transiting Sun conjunction natal Venus on 2026-12-14.")).toEqual(["range-mismatch: 2026-11-20 to 2026-12-14"]);
    expect(flags("*13 to 14 November:* the two stations.")).toEqual(["range-mismatch: 13 to 14 November"]);
    expect(flags("[T1] transiting Neptune conjunction natal Venus is in orb from 2026-12-01 to 2027-03-03 (each end plus or minus 1 day).")).toEqual([]);
  });

  it("flags 'through the window' for a range that ends inside it (v5 O1)", () => {
    expect(flags("[T2] transiting Pluto square natal Sun is in orb through the window, exact 2026-11-26 (plus or minus 1 day).")).toEqual(["range-mismatch: through the window"]);
    expect(flags("[T1] transiting Neptune conjunction natal Venus lasts until the end of the window.")).toEqual([]);
  });

  it("flags an orb that is not the quoted line's (v5 P3)", () => {
    expect(flags("[C1] Sun opposition Midheaven, orb 0°... puts the Sun on the IC.")).toEqual(["orb-mismatch: orb 0°..."]);
    expect(flags("[C1] Sun opposition Midheaven, orb 0°49', puts the Sun on the IC.")).toEqual([]);
  });

  it("flags a house for a transiting body that the sheet does not give (v5 M3, P3)", () => {
    const m3 = "[T3] transiting Saturn square natal Midheaven falls on 2026-11-05 and 2027-01-15, and Saturn sits peregrine in your tenth house.";
    expect(flags(m3)).toEqual(["house-mismatch: transiting Saturn in house 10"]);
    expect(flags(m3, OLD)).toEqual(["house-mismatch: transiting Saturn in house 10"]);
    expect(flags("[T3] transiting Saturn square natal Midheaven falls on 2026-11-05. Saturn is in your seventh house.")).toEqual([]);
    expect(flags("[T3] transiting Saturn square natal Midheaven falls on 2026-11-05. Saturn is in your seventh house.", OLD)).toEqual(["house-mismatch: transiting Saturn in house 7"]);
  });

  it("flags a house said of a transit in the next sentence (v5 P11) or of a station (v5 P8)", () => {
    expect(flags("[T5] transiting Jupiter opposition natal Midheaven is exact 2026-11-08. It tests the balance between role and enjoyment in your tenth house.")).toEqual([]);
    expect(flags("[T5] transiting Jupiter opposition natal Midheaven is exact 2026-11-08. It tests the balance between role and enjoyment in your fifth house.")).toEqual(["house-mismatch: house 5"]);
    expect(flags("[S2] Venus also stations direct then, with [S2a] stationing Venus conjunction natal Venus. That day tests relationships in the third house, Libra.", OLD)).toEqual([]);
    expect(flags("[S1] Mercury stations direct, with [S1a] stationing Mercury trine natal Moon. That day tests thinking in the third house.", OLD)).toEqual(["house-mismatch: house 3"]);
  });

  it("checks the natal house and sign of a planet, and the sign given for a transiting body", () => {
    expect(flags("Saturn sits in your fifth house.")).toEqual([]);
    expect(flags("Your third-house Venus is generous.")).toEqual([]);
    expect(flags("Saturn sits in your tenth house.")).toEqual(["house-mismatch: Saturn in house 10"]);
    expect(flags("Transiting Saturn in Taurus squares your Midheaven on 2026-11-05.")).toEqual(["sign-mismatch: transiting Saturn in Taurus"]);
    expect(flags("Transiting Saturn in Aries meets resistance.")).toEqual([]);
    expect(flags("The Moon is 3°47' into Pisces.")).toEqual([]);
    expect(flags("The ruler of your tenth house is the Moon.")).toEqual([]);
  });

  it("resolves a planet with no ID as natal or moving from its context", () => {
    // Natal Saturn is in Aquarius, house 5; transiting Saturn ([T3]) in Aries, house 7.
    expect(flags("**November.** Saturn is in Aries, in your seventh house.")).toEqual([]);
    expect(flags("Saturn, now in Aries in house 7, leads the window.")).toEqual([]);
    expect(flags("Saturn is in Aries, in your seventh house.")).toEqual(["sign-mismatch: Saturn in Aries", "house-mismatch: Saturn in house 7"]);
    expect(flags("**November.** Saturn is in Taurus, in your eighth house.")).toEqual(["sign-mismatch: Saturn in Taurus", "house-mismatch: Saturn in house 8"]);
    // An appositive, a parenthesis and a clause's only planet still carry the claim.
    expect(flags("Venus, the benefic of sect, is in Sagittarius in the fourth house.")).toEqual(["house-mismatch: Venus in house 4"]);
    expect(flags("Jupiter rules the chart and sits in Scorpio in the fifth house.")).toEqual(["house-mismatch: Jupiter in house 5"]);
    expect(flags("The Midheaven would be in Leo if the birth time were later.")).toEqual([]);
  });

  it("flags 'runs the whole window' said of the transit before it (v6 M5)", () => {
    expect(flags("[T2] transiting Pluto square natal Sun is in orb from 2026-07-19 to 2027-01-05. It runs the whole window and sits in your sixth house.")).toEqual(["range-mismatch: runs the whole window"]);
    expect(flags("[T1] transiting Neptune conjunction natal Venus is in orb from 2026-12-01 to 2027-03-03. Set one goal for the window.")).toEqual([]);
  });
});

describe("house, sign and chart rulers", () => {
  // Libra rising: house 1 Libra (Venus), 2 Scorpio (Mars), 3 Sagittarius (Jupiter), 5 Aquarius (Saturn), 9 Gemini (Mercury), 10 Cancer (Moon).
  const RULED = [
    "[P1] Ascendant 6°56' Libra; Midheaven 8°10' Cancer (whole sign house 10)",
    "[P2] Sun 14°02' Gemini, whole sign house 9",
    "[P3] Moon 3°47' Pisces, whole sign house 6",
    "[P4] Mercury 2°11' Leo, whole sign house 11",
    "[R1] Chart ruler: Venus (Libra rising). Venus 22°04' Sagittarius, whole sign house 3. Condition ([D4]): dignities none; debilities none; peregrine. Sect role: benefic of sect."
  ].join("\n");
  const flags = (reading: string) => checkReading(RULED, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("passes the whole sign ruler of a house, in any wording", () => {
    expect(flags("Mars rules your second house.")).toEqual([]);
    expect(flags("The second house, ruled by Mars, holds your resources.")).toEqual([]);
    expect(flags("Saturn, your fifth-house ruler, asks for patience.")).toEqual([]);
    expect(flags("The ruler of the Cancer tenth, the Moon, is in Pisces.")).toEqual([]);
    expect(flags("Mercury rules the ninth and twelfth houses.")).toEqual([]);
  });

  it("flags a planet made ruler of a house its sign does not rule (v6 H6)", () => {
    expect(flags("Mercury is peregrine and rules your eleventh house, where it sits.")).toEqual(["ruler-mismatch: Mercury rules house 11"]);
    expect(flags("Your second-house ruler, Venus, is generous.")).toEqual(["ruler-mismatch: Venus rules house 2"]);
    expect(flags("The ruler of the Leo second, the Sun, shines.")).toEqual(["ruler-mismatch: house 2 in Leo"]);
    expect(checkReading(RULED, "Mercury is peregrine and rules your eleventh house.").violations[0]!.message).toContain("house 11 is Leo, ruled by Sun");
  });

  it("checks sign rulers, the chart ruler and a planet's ruler", () => {
    expect(flags("Mercury rules Gemini and Virgo.")).toEqual([]);
    expect(flags("Mercury rules Leo.")).toEqual(["ruler-mismatch: Mercury rules Leo"]);
    expect(flags("Pluto rules Scorpio.")).toEqual(["ruler-mismatch: Pluto rules Scorpio"]);
    expect(flags("Pluto, the modern ruler of Scorpio, adds depth.")).toEqual([]);
    expect(flags("Venus rules the chart.")).toEqual([]);
    expect(flags("**Mars, the ruler.** Your chart ruler is generous.")).toEqual([]);
    expect(flags("Mars rules your chart.")).toEqual(["ruler-mismatch: Mars rules the chart"]);
    expect(flags("Gemini rising would make Mercury the chart ruler.")).toEqual([]);
    expect(flags("The Moon is peregrine, so it takes its colour from its ruler, Jupiter.")).toEqual([]);
    expect(flags("The Moon is peregrine, so it takes its colour from its ruler, Saturn.")).toEqual(["ruler-mismatch: Saturn rules Moon"]);
    expect(flags("Scorpio's lord is Mars.")).toEqual([]);
    expect(flags("Venus does not rule your second house.")).toEqual([]);
  });
});

describe("angle paraphrases", () => {
  const flags = (reading: string) => kinds(reading);
  it("reads the rising edge, the top or bottom of the chart and the horizon as angles (v5 O12)", () => {
    expect(flags("Moon and Venus on the rising edge give you warmth.")).toEqual(["not-on-sheet: Venus conjunction Ascendant", "not-on-sheet: Moon conjunction Ascendant"]);
    expect(flags("Saturn on the setting edge asks for serious partnerships.")).toEqual([]);
    expect(flags("Jupiter at the top of the chart gives public reach.")).toEqual(["not-on-sheet: Jupiter conjunction Midheaven"]);
    expect(flags("Mars at the bottom of the chart works at home.")).toEqual(["not-on-sheet: Mars opposition Midheaven"]);
    expect(flags("Saturn on the horizon weighs on partnership.")).toEqual([]);
    expect(flags("Mars on the horizon pushes.")).toEqual(["not-on-sheet: Mars on the Ascendant axis (conjunction or opposition Ascendant)"]);
    expect(flags("Venus setting makes you gentle with others.")).toEqual(["not-on-sheet: Venus opposition Ascendant"]);
    expect(flags("Setting limits matters, and Venus setting the pace is fine.")).toEqual([]);
  });

  it("flags 'angular' for a planet on no angle and in no angular house", () => {
    expect(flags("Saturn is angular and heavy.")).toEqual([]);
    expect(flags("Venus is angular, so she shows.")).toEqual(["not-on-sheet: Venus angular"]);
    expect(flags("The angular houses are empty.")).toEqual([]);
  });
});

describe("two charts (fold or gap)", () => {
  // A hand-written fold sheet in the builder's format (synthetic chart, no real person): Libra rising in both charts.
  const TWO = [
    "[N1] Age at the window start (2026-11-01): 30 years 0 months (calendar age from the local birth date). Stage: adult.",
    "[G1] Chart A is the earlier occurrence of 01:30: 01:30 on a clock still on UTC-04:00, before the change. Instant 1996-10-27T05:30Z; the zone's clocks showed 1996-10-27 01:30.",
    "[G2] Chart B is the later occurrence of 01:30: 01:30 on a clock already on UTC-05:00, after the change. Instant 1996-10-27T06:30Z; the zone's clocks showed 1996-10-27 01:30.",
    "=== Chart A: earlier occurrence (clock on UTC-04:00) ===",
    "[A-P1] Ascendant 6°56' Libra; Midheaven 8°10' Cancer (whole sign house 10)",
    "[A-P2] Moon 29°40' Pisces, whole sign house 6",
    "[A-P3] Saturn 13°40' Aquarius, whole sign house 5",
    "[A-A1] 1. Sun trine Saturn, orb 0°33'",
    "Transits 2026-11-01 to 2027-01-29 inclusive (90 days), dates in the person's zone (America/New_York).",
    "- [A-T1] transiting Sun square natal Ascendant: exact 2026-11-05; transiting Sun in Scorpio, whole sign house 2",
    "- [A-T2] transiting Pluto square natal Midheaven: in orb (within 1°) from 2026-10-01 to 2026-12-20 (each end plus or minus 1 day); exact 2026-11-10 (each plus or minus 1 day); transiting Pluto in Aquarius, whole sign house 5",
    "- [A-T3] transiting Jupiter trine natal Moon: exact 2026-11-23, 2027-01-01; transiting Jupiter in Cancer, whole sign house 10",
    "- [A-S1] Jupiter stations retrograde 2026-12-12 (plus or minus 1 day) at 27°01' Cancer, whole sign house 10. Contacts:",
    "  - [A-S1a] stationing Jupiter trine natal Moon, orb 0°37'",
    "",
    "=== Chart B: later occurrence (clock on UTC-05:00) ===",
    "[B-P1] Ascendant 19°10' Libra; Midheaven 20°02' Cancer (whole sign house 10)",
    "[B-P2] Moon 0°10' Aries, whole sign house 7",
    "[B-P3] Saturn 13°41' Aquarius, whole sign house 5",
    "[B-A1] 1. Sun trine Saturn, orb 0°31'",
    "Transits 2026-11-01 to 2027-01-29 inclusive (90 days), dates in the person's zone (America/New_York).",
    "- [B-T1] transiting Sun square natal Ascendant: exact 2026-11-18; transiting Sun in Scorpio, whole sign house 2",
    "- [B-T2] transiting Jupiter trine natal Moon: exact 2026-11-24, 2027-01-01; transiting Jupiter in Cancer, whole sign house 10",
    "- [B-S1] Jupiter stations retrograde 2026-12-12 (plus or minus 1 day) at 27°01' Cancer, whole sign house 10. Contacts:",
    "  - [B-S1a] stationing Jupiter trine natal Moon, orb 0°34'",
    "",
    "=== Both charts compared (engine comparison of chart A and chart B, line by line; quote it, never compare the charts yourself) ===",
    "[X1] Rising sign and chart ruler: the same in both charts: Libra rising, chart ruler Venus, so the whole sign houses are the same."
  ].join("\n");
  /** The same sheet with v6's IDs: numbered through both charts, no chart letter. */
  const V6 = TWO.replace(/\[A-([A-Z])(\d+)/g, "[$1$2").replace(/\[B-([A-Z])(\d+)/g, (_, l: string, n: string) => `[${l}${Number(n) + 20}`).replace(/=== Chart [AB]: /g, "=== Chart: ");
  const flags = (reading: string, sheet = TWO) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("reads each line's chart from its ID or its heading", () => {
    for (const sheet of [TWO, V6]) {
      const s = parseSheet(sheet);
      expect(s.charts).toEqual(["A", "B"]);
      expect(s.chartSides.get("A")).toEqual({ side: "before", offset: "UTC-04:00" });
      expect(s.chartNatal.get("B")!.get("Moon")!.houses).toEqual(new Set([7]));
    }
    expect(parseSheet(TWO).chartOf.get("B-T2")).toBe("B");
    expect(parseSheet(V6).chartOf.get("T22")).toBe("B");
  });

  it("flags a contact said to be only in one chart when the other has it too (v6 F6, F3)", () => {
    expect(flags("[A-T2] transiting Pluto square natal Midheaven appears only in chart A.")).toEqual([]);
    expect(flags("[A-T1] transiting Sun square natal Ascendant appears only in the earlier chart.")).toEqual(["chart-mismatch: Sun square Ascendant"]);
    expect(flags("[T1] transiting Sun square natal Ascendant appears only in the earlier chart.", V6)).toEqual(["chart-mismatch: Sun square Ascendant"]);
    expect(flags("The Sun contacts to the Ascendant appear only in the later chart.")).toEqual(["chart-mismatch: Sun contacts to Ascendant"]);
  });

  it("flags a contact said to be shared, or put in the other chart, or named with no chart", () => {
    expect(flags("Both charts have transiting Pluto square natal Midheaven.")).toEqual(["chart-mismatch: Pluto square Midheaven"]);
    expect(flags("In chart B, transiting Pluto square natal Midheaven presses on your standing.")).toEqual(["chart-mismatch: Pluto square Midheaven"]);
    expect(flags("Transiting Pluto square natal Midheaven presses on your standing.")).toEqual(["chart-mismatch: Pluto square Midheaven"]);
    expect(flags("In chart A, transiting Pluto square natal Midheaven presses on your standing.")).toEqual([]);
    expect(flags("**If chart A is right.** Transiting Pluto square natal Midheaven presses on your standing.")).toEqual([]);
    expect(flags("The tightest aspect is [A-A1] Sun trine Saturn in chart A and [B-A1] Sun trine Saturn in chart B.")).toEqual([]);
  });

  it("flags one chart's date or orb given with no chart when the other chart's differs (v6 F6)", () => {
    expect(flags("[T3] transiting Jupiter trine natal Moon is exact on 2026-11-23.", V6)).toEqual(["chart-mismatch: [T3] 2026-11-23"]);
    expect(flags("[T3] transiting Jupiter trine natal Moon is exact on 2027-01-01.", V6)).toEqual([]);
    expect(flags("[T3]/[T22] transiting Jupiter trine natal Moon is exact on 2026-11-23 in chart A and 2026-11-24 in chart B.", V6)).toEqual([]);
    expect(flags("[S1a] stationing Jupiter trine natal Moon has an orb of 0°37'.", V6)).toEqual(["chart-mismatch: [S1a] orb 0°37'"]);
    expect(flags("[A-T3] transiting Jupiter trine natal Moon is exact on 2026-11-23.")).toEqual([]);
  });

  it("checks a natal house or sign against the chart it is said of", () => {
    expect(flags("Saturn is in your fifth house.")).toEqual([]);
    expect(flags("The Moon is in your sixth house.")).toEqual(["chart-mismatch: Moon in house 6"]);
    expect(flags("In chart A the Moon is in your sixth house.")).toEqual([]);
    expect(flags("In chart B the Moon is in your sixth house.")).toEqual(["chart-mismatch: Moon in house 6"]);
  });

  it("checks which clock reading gives which chart (v6 G2, G3)", () => {
    expect(flags("If the time came from a clock that had not yet changed, it is chart A; from a clock that had already changed, chart B.")).toEqual([]);
    expect(flags("Did it come from a clock that had not yet changed (so chart B), or one that had changed (so chart A)?")).toEqual(["chart-mismatch: chart B from a clock before the change", "chart-mismatch: chart A from a clock after the change"]);
    expect(flags("Was the birth before the clocks moved (chart A) or after (chart B)?")).toEqual([]);
    expect(flags("Was the birth before the clocks moved (chart B) or after (chart A)?")).toEqual(["chart-mismatch: chart B born before the change", "chart-mismatch: chart A born after the change"]);
  });
});
