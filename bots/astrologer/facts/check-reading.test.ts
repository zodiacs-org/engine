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
    expect(kinds("Jupiter returns on 2027-01-08.")).toEqual(["not-on-sheet: Jupiter conjunction Jupiter"]);
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
