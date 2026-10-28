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

  it("reads 'through Jupiter on Saturn' as a chain of lords, not a conjunction (v9 P10)", () => {
    expect(kinds("Its purpose leans on Jupiter, and through Jupiter on Saturn, in daily work.")).toEqual([]);
    expect(kinds("Its purpose leans on Jupiter, its domicile lord, and through Jupiter on Saturn, Jupiter's own domicile lord.")).toEqual([]);
    expect(kinds("The ruler leans via the Moon on Saturn.")).toEqual([]);
    expect(kinds("Jupiter on Saturn makes duty heavy.")).toEqual(["not-on-sheet: Jupiter conjunction Saturn"]);
    // The message quotes the words read as the relation, so the writer can find them.
    expect(check("Jupiter on Saturn makes duty heavy.").violations[0]!.message).toContain('in the words "Jupiter on Saturn"');
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

  it("does not tie a date across ', and' to the birthday (v8 G4)", () => {
    const dates = (reading: string) => childKinds(reading).filter((k) => /^date-mismatch: (birthday|solar return)/.test(k));
    expect(dates("The window runs 2026-11-01 to 2027-01-29, and the next birthday is 2026-11-11, when your child turns 11.")).toEqual([]);
    expect(dates("The birthday is 2026-11-11, and the window ends 2027-01-29.")).toEqual([]);
    expect(dates("The birthday is 2026-11-12, and the window ends 2027-01-29.")).toEqual(["date-mismatch: birthday 2026-11-12"]);
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

  it("reads 'the ruler is' with no planet after it as no claim (v8 M2)", () => {
    expect(flags("Its aspects are Venus square Saturn, so the ruler is stretched between direction and restriction.").filter((k) => k.startsWith("ruler"))).toEqual([]);
    expect(flags("Your ruler is Mars.")).toEqual(["ruler-mismatch: Mars rules the chart"]);
  });

  it("flags a planet said to rule the house it occupies when its sign is another planet's (v8 P2)", () => {
    // Mercury in Leo (house 11, the Sun's), the Moon in Pisces (house 6, Jupiter's).
    expect(flags("Mercury also rules the house where it sits with the Sun, the eleventh house, so friends matter.")).toEqual(["ruler-mismatch: Mercury rules its own house"]);
    expect(flags("Mercury rules its own house.")).toEqual(["ruler-mismatch: Mercury rules its own house"]);
    expect(flags("It is peregrine. The Moon is the ruler of the house it occupies.")).toEqual(["ruler-mismatch: Moon rules its own house"]);
    expect(flags("The Moon rules the house it is in.")).toEqual(["ruler-mismatch: Moon rules its own house"]);
    expect(checkReading(RULED, "Mercury rules its own house.").violations[0]!.message).toContain("Mercury is in Leo (whole sign house 11), ruled by Sun");
    expect(flags("Mercury does not rule the house it occupies.")).toEqual([]);
    expect(flags("Mercury would rule the house it sits in with Virgo rising.")).toEqual([]);
  });

  it("passes a planet that rules the house it occupies", () => {
    const own = RULED + "\n[P5] Mars 10°00' Scorpio, whole sign house 2";
    expect(checkReading(own, "Mars rules the house where it sits, the second house.").violations).toEqual([]);
    expect(checkReading(own, "Mars, squared by the Moon, also rules its own house.").violations).toEqual([]);
  });
});

describe("angle contacts read as houses (v7 E1)", () => {
  // Sagittarius rising, Midheaven in Libra in whole sign house 11 (so the IC is in house 5); Saturn in house 10.
  const SHEET_MC = [
    "[P1] Ascendant 25°34' Sagittarius; Midheaven 18°25' Libra (whole sign house 11)",
    "[P2] Jupiter 15°05' Cancer, whole sign house 8, retrograde",
    "[P3] Saturn 2°10' Virgo, whole sign house 10",
    "[A11] 11. Jupiter square Midheaven, orb 3°20'",
    "[A12] 12. Saturn sextile Midheaven, orb 3°45'"
  ].join("\n");
  const flags = (reading: string, sheet = SHEET_MC) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("flags a Midheaven or IC contact glossed as the tenth or fourth house when the angle is in another house", () => {
    expect(flags("[A11] Jupiter square Midheaven touches the parent and carer side of the chart (the tenth house).")).toEqual(["house-mismatch: Midheaven as house 10"]);
    expect(flags("Jupiter square the Midheaven colours your 10th-house matters.")).toEqual(["house-mismatch: Midheaven as house 10"]);
    expect(flags("Jupiter square the IC stirs the fourth house of home.")).toEqual(["house-mismatch: IC as house 4"]);
  });

  it("passes the angle's own house, a house another named point holds, and a negated house", () => {
    expect(flags("[A11] Jupiter square Midheaven touches the Midheaven degree, which sits in your eleventh house.")).toEqual([]);
    expect(flags("Saturn in the tenth house sextiles the Midheaven ([A12]).")).toEqual([]);
    expect(flags("The Midheaven is in the eleventh house, not the tenth house, in whole sign houses.")).toEqual([]);
    expect(flags("[A11] Jupiter square Midheaven touches the tenth house.", SHEET_MC.replace("(whole sign house 11)", "(whole sign house 10)"))).toEqual([]);
  });
});

describe("dispositor chain summaries (v7 O4)", () => {
  // Five chains end at Mercury, four at Venus, one at the Moon; no final dispositor.
  const SHEET_L = [
    "[R1] Chart ruler: Venus (Taurus rising). Venus 2°00' Taurus, whole sign house 1. Condition ([D4]): dignities domicile; debilities none; not peregrine. Sect role: benefic contrary to sect.",
    "[L1] Sun in Gemini: domicile lord Mercury. Chain: Sun → Mercury (ends at Mercury, in its own sign).",
    "[L2] Moon in Cancer: domicile lord Moon. Chain: Moon (ends at Moon, in its own sign).",
    "[L3] Mercury in Gemini: domicile lord Mercury. Chain: Mercury (ends at Mercury, in its own sign).",
    "[L4] Venus in Taurus: domicile lord Venus. Chain: Venus (ends at Venus, in its own sign).",
    "[L5] Mars in Libra: domicile lord Venus. Chain: Mars → Venus (ends at Venus, in its own sign).",
    "[L6] Jupiter in Virgo: domicile lord Mercury. Chain: Jupiter → Mercury (ends at Mercury, in its own sign).",
    "[L7] Saturn in Gemini: domicile lord Mercury. Chain: Saturn → Mercury (ends at Mercury, in its own sign).",
    "[L8] Uranus in Taurus: domicile lord Venus. Chain: Uranus → Venus (ends at Venus, in its own sign).",
    "[L9] Neptune in Gemini: domicile lord Mercury. Chain: Neptune → Mercury (ends at Mercury, in its own sign).",
    "[L10] Pluto in Libra: domicile lord Venus. Chain: Pluto → Venus (ends at Venus, in its own sign).",
    "[L11] Final dispositor: none; the chains end at Mercury (in its own sign) and Moon (in its own sign) and Venus (in its own sign).",
    "[L12] Mutual receptions by domicile (each planet in the other's sign): none."
  ].join("\n");
  // A loop of Sun and Mars collects every chain but Venus's.
  const SHEET_LOOP = [
    "[L1] Sun in Scorpio: domicile lord Mars. Chain: Sun → Mars → Sun (ends in a loop: Sun, Mars dispose one another).",
    "[L2] Moon in Leo: domicile lord Sun. Chain: Moon → Sun → Mars → Sun (ends in a loop: Sun, Mars dispose one another).",
    "[L4] Venus in Libra: domicile lord Venus. Chain: Venus (ends at Venus, in its own sign).",
    "[L5] Mars in Leo: domicile lord Sun. Chain: Mars → Sun → Mars (ends in a loop: Sun, Mars dispose one another).",
    "[L11] Final dispositor: none; the chains end at the loop Sun, Mars and Venus (in its own sign)."
  ].join("\n");
  const flags = (reading: string, sheet = SHEET_L) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("flags a quantified claim the chains do not bear out", () => {
    expect(flags("**Venus rules the chart, and most chains lead to it.**")).toEqual(['ruler-mismatch: "most chains lead to it" (read as Venus)']);
    expect(flags("Venus rules the chart, and most chains lead to it.").length).toBe(1);
    expect(flags("Most of the chains end at Mercury [L11].")).toEqual([]);
    expect(flags("Every chain ends at Mercury.")).toEqual(["ruler-mismatch: \"Every chain ends at Mercury\""]);
    expect(flags("**Mercury at the end of every chain.**")).toEqual(["ruler-mismatch: \"Mercury at the end of every chain\""]);
    expect(flags("In the end, everything runs back to Venus.")).toEqual(["ruler-mismatch: \"In the end, everything runs back to Venus\""]);
    expect(flags("Every chain of rulers ends in that loop ([L11]).", SHEET_LOOP)).toEqual([]);
    expect(flags("Sun and Mars dispose one another, and every chain of rulers ends in their loop ([L11]).", SHEET_LOOP)).toEqual(["ruler-mismatch: \"every chain of rulers ends in their loop [L11]\" (read as Sun and Mars)"]);
    expect(flags("Sun and Mars dispose one another, and nearly every chain ends in their loop.", SHEET_LOOP)).toEqual([]);
  });

  it("checks named chains, listed bodies and the places the chains end", () => {
    expect(flags("The chains end at Mercury, the Moon and Venus [L11].")).toEqual([]);
    expect(flags("The chains end at Mercury and Jupiter.")).toEqual(["ruler-mismatch: \"The chains end at Mercury and Jupiter\""]);
    expect(flags("Mars's chain ends at Venus [L5].")).toEqual([]);
    expect(flags("Saturn's chain ends at Venus.")).toEqual(["ruler-mismatch: \"Saturn's chain ends at Venus\""]);
    expect(flags("Mercury is in its own sign. The Sun, Jupiter and Saturn all lead back to it [L1, L6, L7].")).toEqual([]);
    expect(flags("Mercury is in its own sign. The Sun, Jupiter and Mars all lead back to it.")).toEqual(['ruler-mismatch: "Mars all lead back to it" (read as Mercury)']);
    expect(flags("Your Sun and Jupiter chains both lead to Mercury ([L1], [L6]), and Venus rules the chart.")).toEqual([]);
  });

  it("checks the final dispositor named against [L11]", () => {
    expect(flags("There is no single final dispositor ([L11]).")).toEqual([]);
    expect(flags("[L11] gives no final dispositor; the chains end at Mercury, the Moon and Venus.")).toEqual([]);
    expect(flags("Mercury is the final dispositor.")).toEqual(["ruler-mismatch: Mercury final dispositor"]);
    expect(flags("Its chain ends at Mars: [L11] Final dispositor: Mars.", "[L11] Final dispositor: Mars; every classical planet's chain ends there.\n[L1] Sun in Aries: domicile lord Mars. Chain: Sun → Mars (ends at Mars, in its own sign).")).toEqual([]);
    expect(flags("Venus is the final dispositor.", "[L11] Final dispositor: Mars; every classical planet's chain ends there.\n[L1] Sun in Aries: domicile lord Mars. Chain: Sun → Mars (ends at Mars, in its own sign).")).toEqual(["ruler-mismatch: Venus final dispositor"]);
    expect(flags("If Venus were in Taurus, it would be the final dispositor.")).toEqual([]);
  });
});

describe("group placements, window phases, the same day and complete angle lists (v7 O2, O15, F1)", () => {
  const SHEET_O = [
    "[P1] Ascendant 1°00' Virgo; Midheaven 24°39' Gemini (whole sign house 10)",
    "[P2] Sun 10°00' Pisces, whole sign house 7",
    "[P3] Moon 5°00' Sagittarius, whole sign house 4",
    "[P4] Mercury 12°28' Pisces, whole sign house 7",
    "[A1] 1. Moon square Mercury, orb 0°30'",
    "[A13] 13. Sun conjunction Mercury, orb 2°28'",
    "Transits 2026-11-01 to 2027-01-29 inclusive (90 days), dates in the person's zone (UTC).",
    "- [T4] transiting Sun trine natal Moon: exact 2026-11-21; transiting Sun in Scorpio, whole sign house 3",
    "- [T5] transiting Mars square natal Mars: exact 2026-11-22; transiting Mars in Leo, whole sign house 12",
    "- [T6] transiting Sun square natal Mercury: exact 2026-11-22; transiting Sun in Sagittarius, whole sign house 4",
    "- [T9] transiting Sun opposition natal Sun: exact 2027-01-20; transiting Sun in Capricorn, whole sign house 5",
    "- [S1] Mercury stations direct 2026-11-13 (plus or minus 1 day) at 5°02' Scorpio, whole sign house 3. Contacts:",
    "  - [S1a] stationing Mercury square natal Moon, orb 0°32'",
    "- [C1] Mercury opposition Midheaven, orb 5°02': on the IC, same as [A20]",
    "- [C2] Sun opposition Ascendant, orb 2°00': on the Descendant, same as [A9]"
  ].join("\n");
  const flags = (reading: string) => checkReading(SHEET_O, reading).violations.map((v) => `${v.kind}: ${v.named}`);

  it("flags a house said of an aspect's planets when one is elsewhere", () => {
    expect(flags("[A1] Moon square Mercury and [A13] Sun conjunction Mercury, both in the seventh house of others.")).toEqual(["house-mismatch: Moon, Mercury, Sun both in the seventh house"]);
    expect(flags("[A13] Sun conjunction Mercury, both in the seventh house of others.")).toEqual([]);
    expect(flags("The Sun and Mercury are both in Pisces.")).toEqual([]);
    expect(flags("**Moon and pressure.** The Sun and Mercury sit together in the seventh house.")).toEqual([]);
  });

  it("flags \"near the window's end\" or \"early in the window\" for a date that is not there", () => {
    expect(flags("Near the window's end, [S1a] stationing Mercury square natal Moon falls in mid-November.")).toEqual(["date-mismatch: \"Near the window's end\" for 2026-11-13 ([S1a])"]);
    expect(flags("Near the window's end, [T9] transiting Sun opposition natal Sun is exact 2027-01-20.")).toEqual([]);
    expect(flags("Early in the window, [S1a] stationing Mercury square natal Moon marks a pause.")).toEqual([]);
    expect(flags("Late in the window, [T5] transiting Mars square natal Mars is exact 2026-11-22.")).toEqual(["date-mismatch: \"Late in the window\" for 2026-11-22"]);
  });

  it("flags a line said to fall on the same day as another line with another date", () => {
    expect(flags("Guidance: the week of [T5] transiting Mars square natal Mars, exact 2026-11-22, is a good time to pause. [T4] transiting Sun trine natal Moon falls the same day.")).toEqual(['date-mismatch: [T4] "the same day"']);
    expect(flags("[T5] transiting Mars square natal Mars is exact 2026-11-22. [T6] transiting Sun square natal Mercury falls the same day.")).toEqual([]);
    expect(flags("On 2026-11-22 comes [T5] transiting Mars square natal Mars, with [T6] transiting Sun square natal Mercury on the same day.")).toEqual([]);
    expect(flags("On 2026-11-22 comes [T5] transiting Mars square natal Mars, with [T4] transiting Sun trine natal Moon on the same day.")).toEqual(['date-mismatch: [T4] "the same day"']);
    expect(flags("Keep that day light.")).toEqual([]);
  });

  it("flags a birth-time shift said to keep the rising sign when the [E] line says it changes", () => {
    const sheet = "[P1] Ascendant 11°44' Virgo; Midheaven 9°10' Gemini (whole sign house 10)\n- [E1] Rising sign Virgo (Ascendant 11°44' Virgo): it would be Leo if the birth time were 49 minutes earlier or more, and Libra if the birth time were 75 minutes later or more.";
    const f = (reading: string) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);
    expect(f("[E2] The Moon would be in Aries if the birth time were 141 minutes later or more. A shift of that size would change the Moon's sign, but not the rising sign.".replace("[E2] ", ""))).toEqual(["sign-mismatch: rising sign kept at 141 minutes later"]);
    expect(f("A birth time 30 minutes later would keep the rising sign ([E1]).")).toEqual([]);
  });

  it("flags a list of planets on an angle called complete when it leaves one out", () => {
    expect(flags("[C2] Sun opposition Ascendant puts the Sun on the Descendant. These are the only angle placements.")).toEqual(['not-on-sheet: "the only angle placements" without [C1]']);
    expect(flags("[C2] Sun opposition Ascendant puts the Sun on the Descendant, and [C1] Mercury opposition Midheaven puts Mercury on the IC. No other planet is on an angle.")).toEqual([]);
  });
});

describe("counts of planets on an angle", () => {
  const SHEET4 = [
    "[P1] Ascendant 20°10' Libra; Midheaven 23°36' Cancer (whole sign house 10)",
    "- [C1] Uranus conjunction Midheaven, orb 5°02': on the Midheaven, same as [A16]",
    "- [C2] Neptune conjunction Ascendant, orb 5°27': on the Ascendant, same as [A18]",
    "- [C3] Venus conjunction Midheaven, orb 6°36', out of sign (Venus in Leo, Midheaven in Cancer): on the Midheaven, same as [A22]",
    "- [C4] Moon opposition Midheaven, orb 9°18': on the IC, same as [A24]"
  ].join("\n");
  const flags = (reading: string, sheet = SHEET4) => checkReading(sheet, reading).violations.map((v) => `${v.kind}: ${v.named}`);
  it("flags a count that is not the number of [C] lines (v6 P7)", () => {
    expect(flags("Three planets sit on angles: [C1] Uranus conjunction Midheaven, [C2] Neptune conjunction Ascendant and [C3] Venus conjunction Midheaven.")).toEqual(["not-on-sheet: Three planets sit on angles"]);
    expect(flags("Four planets sit on angles.")).toEqual([]);
    expect(flags("No planet is on an angle.")).toEqual(["not-on-sheet: No planet is on an angle"]);
    expect(flags("No planet is on an angle.", "- [C1] none: no planet or node is on the Ascendant, Descendant, Midheaven or IC within the engine's default orbs.")).toEqual([]);
    expect(checkReading(SHEET4, "Three planets sit on angles.").violations[0]!.message).toContain("[C4] Moon");
  });
});

describe("angle paraphrases", () => {
  const flags = (reading: string) => kinds(reading);
  it("reads the rising edge, the top or bottom of the chart and the horizon as angles (v5 O12)", () => {
    expect(flags("Moon and Venus on the rising edge give you warmth.")).toEqual(["not-on-sheet: Venus conjunction Ascendant", "not-on-sheet: Moon conjunction Ascendant"]);
    expect(flags("Saturn on the setting edge asks for serious partnerships.")).toEqual([]);
    // A bare comma before the point next to "on" starts another item (v8 M2); "and" joins a list.
    expect(flags("The themes follow: Venus with Mars and Moon, Saturn on the setting edge, and more.")).toEqual([]);
    expect(flags("The themes follow: Moon, Saturn on the setting edge.")).toEqual([]);
    expect(flags("Moon, Venus and Saturn on the setting edge.")).toEqual(["not-on-sheet: Venus opposition Ascendant", "not-on-sheet: Moon opposition Ascendant"]);
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

describe("interpretation in the voice of fact (v9 C2)", () => {
  const voice = (reading: string) => check(reading).violations.filter((v) => v.kind === "voice").map((v) => v.named);
  it("flags rankings the sheet does not make", () => {
    expect(voice("Mars is the malefic contrary to sect, the hardest planet in the chart.")).toEqual(["hardest"]);
    expect(voice("December. This is the heaviest phase.")).toEqual(["heaviest"]);
    expect(voice("Venus, the benefic of sect, gives its help most reliably.")).toEqual(["most reliably"]);
    expect(voice("Its strongest aspect is [A2] Moon square Mercury.")).toEqual(["strongest"]);
    // The sheet's own ranking and plain comparatives pass.
    expect(voice("[A1] Jupiter trine Pluto, orb 0°17', is the tightest aspect.")).toEqual([]);
    expect(voice("The station carries more weight than the Sun transits, because it is a station contact.")).toEqual([]);
  });

  it("flags a planet's sign said to hold under a change of birth time (v9 M5, O13)", () => {
    expect(voice("Mercury sits 1°43' before the end of Sagittarius [E3], but a small change in birth time does not move it.")).toEqual(["sign kept under a change of birth time"]);
    expect(voice("[E2] puts Venus at 28°11' Aquarius. Neither changes sign with a small change of birth time.")).toEqual(["sign kept under a change of birth time"]);
    // The Moon and the angles have a shift on the sheet; the rising sign line is checked elsewhere.
    expect(voice("A small change of birth time does not change the rising sign, by [E1].")).toEqual([]);
    expect(voice("Jupiter sits 1°54' before the end of Pisces ([E3]); in Aries it would be peregrine.")).toEqual([]);
  });

  it("flags an outer-planet meaning called traditional (v9 G2, U1, P10)", () => {
    expect(voice("The trines to Uranus and Neptune add, in a traditional reading, intuition.")).toEqual(["traditional reading of an outer planet"]);
    expect(voice("[A1] Jupiter trine Pluto ties the two. A traditional reading is that good things are built slowly.")).toEqual(["traditional reading of an outer planet"]);
    expect(voice("[A1] Jupiter trine Pluto ties the two. A modern reading is that good things are built slowly.")).toEqual([]);
    expect(voice("Pluto has no place in traditional terms, so a modern reading is given.")).toEqual([]);
    expect(voice("The Moon sits at the IC, traditionally the point of roots, with Uranus.")).toEqual([]);
    expect(voice("Mars squares Saturn. A traditional reading is that effort meets delay.")).toEqual([]);
  });
});
