import { describe, expect, it } from "vitest";
import { ageAt, angleContactsFrom, buildReadingFacts, dispositorChains, formatReadingFacts, degreeText, nextBirthday, orbText, sectRole, SECT_TEAMS, STATION_ORB, SLOW } from "./reading-facts.js";
import type { ReadingFacts, ReadingInput } from "./reading-facts.js";
import { bodyLongitude, longitudeSpeed } from "../../../src/ephemeris.js";
import { natalChart } from "../../../src/api.js";

// Synthetic births from bots/astrologer/testset/charts.inputs.json (no real person).
const RESOLVED: ReadingInput = { date: "1998-04-04", time: "14:44", timeKnown: true, zone: "Europe/Istanbul", lat: 41.0082, lon: 28.9784 };
const GAP: ReadingInput = { date: "2026-03-08", time: "02:30", timeKnown: true, zone: "America/New_York", lat: 40.7128, lon: -74.006 };
const FOLD: ReadingInput = { date: "2026-11-01", time: "01:30", timeKnown: true, zone: "America/New_York", lat: 40.7128, lon: -74.006 };
const UNKNOWN: ReadingInput = { date: "2002-04-13", time: null, timeKnown: false, zone: "America/Toronto", lat: 43.6532, lon: -79.3832 };

const T = 60_000;
const cache = new Map<ReadingInput, Promise<ReadingFacts>>();
const facts = (input: ReadingInput) => {
  if (!cache.has(input)) cache.set(input, buildReadingFacts(input));
  return cache.get(input)!;
};

/** Separation in [0, 180], written out here rather than taken from the engine. */
const sep = (a: number, b: number) => {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
};

describe("civil time", () => {
  it("gives both readings of a skipped wall time (IANA: New York sprang from UTC-5 to UTC-4 at 02:00 on 2026-03-08)", async () => {
    const f = await facts(GAP);
    expect(f.status).toBe("gap");
    expect(f.versions.map((v) => v.utc)).toEqual(["2026-03-08T06:30Z", "2026-03-08T07:30Z"]);
  }, 60_000);

  it("gives both occurrences of a repeated wall time (IANA: New York fell back from UTC-4 to UTC-5 at 02:00 on 2026-11-01)", async () => {
    const f = await facts(FOLD);
    expect(f.status).toBe("fold");
    expect(f.versions.map((v) => v.utc)).toEqual(["2026-11-01T05:30Z", "2026-11-01T06:30Z"]);
    expect(f.versions.every((v) => v.ascendant !== null && v.sect !== null)).toBe(true);
  }, 60_000);

  it("never gives houses, angles, sect or a Moon degree without a birth time", async () => {
    const f = await facts(UNKNOWN);
    expect(f.status).toBe("time-unknown");
    const [v] = f.versions;
    expect(v!.ascendant).toBeNull();
    expect(v!.midheaven).toBeNull();
    expect(v!.sect).toBeNull();
    expect(v!.placements.some((p) => p.point === "Moon")).toBe(false);
    expect(v!.placements.every((p) => p.house === null)).toBe(true);
    expect(v!.transitPoints).not.toContain("Moon");
    expect(v!.transitPoints).not.toContain("Ascendant");
    expect(v!.moonSigns).toEqual(["Aries", "Taurus"]);
    const text = formatReadingFacts(f);
    expect(text).not.toMatch(/house \d/);
    expect(text).toContain("Sect: unavailable");
  }, 60_000);
});

describe("natal facts", () => {
  it("ranks aspects by orb, tightest first, numbered from 1", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      for (const v of (await facts(input)).versions) {
        const orbs = v.aspects.map((a) => a.orb);
        expect(orbs).toEqual([...orbs].sort((a, b) => a - b));
        expect(v.aspects.map((a) => a.rank)).toEqual(v.aspects.map((_, i) => i + 1));
      }
    }
  }, 120_000);

  it("states sect from the Sun's side of the horizon (Istanbul 14:44 local: the Sun is up)", async () => {
    expect((await facts(RESOLVED)).versions[0]!.sect).toBe("day");
  }, 60_000);

  it("lists every point within 2 degrees of a sign edge, and only those", async () => {
    const v = (await facts(RESOLVED)).versions[0]!;
    const all = [...v.placements, v.ascendant!, v.midheaven!];
    const near = all.filter((p) => p.lon % 30 < 2 || p.lon % 30 > 28).map((p) => p.point).sort();
    expect(v.edges.map((e) => e.point).sort()).toEqual(near);
  }, 60_000);

  it("gives the birth-time shift each way that changes the rising sign, to the minute (v7 O15)", async () => {
    const v = (await facts(RESOLVED)).versions[0]!;
    const r = v.risingShift!;
    const ms = Date.parse(v.utc.replace("Z", ":00Z"));
    const signAt = (minutes: number) => Math.floor(natalChart({ utc: new Date(ms + minutes * T), latitude: RESOLVED.lat, longitude: RESOLVED.lon, houseSystem: "whole", timeKnown: true }).angles!.asc / 30);
    const here = signAt(0);
    expect(signAt(-r.earlier!.minutes)).toBe((here + 11) % 12);
    expect(signAt(-(r.earlier!.minutes - 1))).toBe(here);
    expect(signAt(r.later!.minutes)).toBe((here + 1) % 12);
    expect(signAt(r.later!.minutes - 1)).toBe(here);
    expect(formatReadingFacts(await facts(RESOLVED))).toContain(`Rising sign ${r.sign} (Ascendant ${r.degree} ${r.sign}): it would be ${r.earlier!.sign} if the birth time were ${r.earlier!.minutes} minutes earlier or more`);
    expect((await facts(UNKNOWN)).versions[0]!.risingShift).toBeNull();
  }, 60_000);

  it("formats degrees truncated and orbs rounded to the arcminute", () => {
    expect(degreeText(29.9999)).toBe("29°59'");
    expect(degreeText(30)).toBe("0°00'");
    expect(orbText(0.0499)).toBe("0°03'");
  });
});

describe("window facts", () => {
  it("finds stations where the speed changes sign", async () => {
    const f = await facts(RESOLVED);
    expect(f.stations.length).toBeGreaterThan(0);
    for (const s of f.stations) {
      const at = Date.parse(s.utc);
      const before = longitudeSpeed(s.body, new Date(at - 1440 * T));
      const after = longitudeSpeed(s.body, new Date(at + 1440 * T));
      expect(Math.sign(before)).toBe(s.kind === "retrograde" ? 1 : -1);
      expect(Math.sign(after)).toBe(s.kind === "retrograde" ? -1 : 1);
    }
  }, 60_000);

  it("reports a station's contacts, and 'none' only when no natal point is within the orb", async () => {
    for (const input of [RESOLVED, GAP, UNKNOWN]) {
      for (const v of (await facts(input)).versions) {
        const lons = new Map([...v.placements, ...(v.ascendant ? [v.ascendant, v.midheaven!] : [])].map((p) => [p.point, p.lon]));
        for (const sc of v.stationContacts) {
          const expected = [...lons]
            .filter(([, lon]) => [0, 60, 90, 120, 180].some((angle) => Math.abs(sep(sc.station.lon, lon) - angle) <= STATION_ORB))
            .map(([name]) => name)
            .sort();
          expect(sc.contacts.map((c) => c.natal).sort()).toEqual(expected);
        }
      }
    }
  }, 120_000);

  it("gives Uranus, Neptune and Pluto transits as date ranges, never a single day", async () => {
    let seen = 0;
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      for (const v of (await facts(input)).versions) {
        for (const t of v.transits.filter((x) => SLOW.includes(x.body))) {
          seen += 1;
          expect(t.range).not.toBeNull();
          expect(t.range!.from <= t.range!.to).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    const text = formatReadingFacts(await facts(GAP));
    expect(text).toMatch(/transiting Neptune conjunction natal Venus: in orb \(within 1°\) from \d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/);
  }, 120_000);

  it("dates an exact transit on the day the body sits on the aspect", async () => {
    const f = await facts(RESOLVED);
    const v = f.versions[0]!;
    const t = v.transits.find((x) => x.body === "Sun" && x.range === null)!;
    const natal = [...v.placements, v.ascendant!, v.midheaven!].find((p) => p.point === t.natal)!;
    const angle = { conjunction: 0, square: 90, trine: 120, opposition: 180 }[t.aspect]!;
    // Somewhere on that local date (Istanbul is UTC+3 all year) the Sun is within 1 degree of exact.
    const noon = Date.parse(`${t.exact[0]}T09:00:00Z`);
    expect(Math.abs(sep(bodyLongitude("Sun", new Date(noon)), natal.lon) - angle)).toBeLessThan(1);
  }, 60_000);
});

describe("age, sect team and dignities", () => {
  it("gives the calendar age at the window start", () => {
    expect(ageAt("1990-06-15", "2026-11-01")).toMatchObject({ years: 36, months: 4, stage: "adult", bornAfterStart: false });
    expect(ageAt("2026-03-08", "2026-11-01")).toMatchObject({ years: 0, months: 7, stage: "infant" });
    expect(ageAt("2016-02-29", "2026-11-01")).toMatchObject({ years: 10, months: 8, stage: "child" });
    expect(ageAt("2010-11-01", "2026-11-01")).toMatchObject({ years: 16, months: 0, stage: "adolescent" });
    expect(ageAt("2026-11-01", "2026-11-01")).toMatchObject({ years: 0, months: 0, stage: "infant", bornAfterStart: false });
    expect(ageAt("2026-11-05", "2026-11-01")).toMatchObject({ bornAfterStart: true, daysAfterStart: 4 });
  });

  it("states the sect team of the chart's sect (Ptolemy, Tetrabiblos I.7)", async () => {
    const day = (await facts(RESOLVED)).versions[0]!;
    expect(day.sectTeam).toEqual({ sect: "day", light: "Sun", beneficOfSect: "Jupiter", maleficOfSect: "Saturn", beneficContrary: "Venus", maleficContrary: "Mars" });
    const night = (await facts(FOLD)).versions[0]!;
    expect(night.sect).toBe("night");
    expect(night.sectTeam).toMatchObject({ light: "Moon", beneficOfSect: "Venus", maleficOfSect: "Mars", maleficContrary: "Saturn" });
    expect(formatReadingFacts(await facts(FOLD))).toContain("night chart: sect light Moon; benefic of sect Venus; malefic of sect Mars; benefic contrary to sect Jupiter; malefic contrary to sect (the out-of-sect malefic) Saturn");
    const unknown = (await facts(UNKNOWN)).versions[0]!;
    expect(unknown.sectTeam).toBeNull();
    expect(formatReadingFacts(await facts(UNKNOWN))).toContain("for reference only because sect is unavailable");
  }, 60_000);

  it("calls Mercury a morning star when it is west of the Sun", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      for (const v of (await facts(input)).versions) {
        const lon = (p: string) => v.placements.find((x) => x.point === p)!.lon;
        const west = (((lon("Sun") - lon("Mercury")) % 360) + 360) % 360 < 180;
        expect(v.mercuryPhase).toBe(west ? "morning" : "evening");
      }
    }
  }, 120_000);

  // Written out here from the published tables, not taken from the engine:
  // domiciles Tetrabiblos I.17, exaltations I.19, Dorothean triplicities (Dorotheus I.1.3).
  const DOMICILES: Record<string, string[]> = { Sun: ["Leo"], Moon: ["Cancer"], Mercury: ["Gemini", "Virgo"], Venus: ["Taurus", "Libra"], Mars: ["Aries", "Scorpio"], Jupiter: ["Sagittarius", "Pisces"], Saturn: ["Capricorn", "Aquarius"] };
  const EXALTED: Record<string, string> = { Sun: "Aries", Moon: "Taurus", Mercury: "Virgo", Venus: "Pisces", Mars: "Capricorn", Jupiter: "Cancer", Saturn: "Libra" };
  const OPPOSITE: Record<string, string> = { Aries: "Libra", Taurus: "Scorpio", Gemini: "Sagittarius", Cancer: "Capricorn", Leo: "Aquarius", Virgo: "Pisces", Libra: "Aries", Scorpio: "Taurus", Sagittarius: "Gemini", Capricorn: "Cancer", Aquarius: "Leo", Pisces: "Virgo" };
  const ELEMENT: Record<string, string> = { Aries: "fire", Leo: "fire", Sagittarius: "fire", Taurus: "earth", Virgo: "earth", Capricorn: "earth", Gemini: "air", Libra: "air", Aquarius: "air", Cancer: "water", Scorpio: "water", Pisces: "water" };
  const TRIPLICITY: Record<string, { day: string; night: string }> = { fire: { day: "Sun", night: "Jupiter" }, earth: { day: "Venus", night: "Moon" }, air: { day: "Saturn", night: "Mercury" }, water: { day: "Venus", night: "Mars" } };

  it("gives domicile, exaltation, detriment, fall and triplicity by sect for each classical planet", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      for (const v of (await facts(input)).versions) {
        expect(v.dignities.map((d) => d.planet)).toEqual(v.timeKnown ? ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"] : ["Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn"]);
        for (const d of v.dignities) {
          expect(d.dignities.includes("domicile")).toBe(DOMICILES[d.planet]!.includes(d.sign));
          expect(d.dignities.includes("exaltation")).toBe(EXALTED[d.planet] === d.sign);
          expect(d.debilities.includes("detriment")).toBe(DOMICILES[d.planet]!.some((s) => OPPOSITE[s] === d.sign));
          expect(d.debilities.includes("fall")).toBe(OPPOSITE[EXALTED[d.planet]!] === d.sign);
          const lords = TRIPLICITY[ELEMENT[d.sign]!]!;
          if (v.sect) {
            expect(d.dignities.includes("triplicity")).toBe(lords[v.sect] === d.planet);
          } else {
            expect(d.dignities).not.toContain("triplicity");
            expect(d.triplicityIf).toEqual((["day", "night"] as const).filter((s) => lords[s] === d.planet));
          }
        }
      }
    }
  }, 120_000);
});

describe("chart ruler, angles and birthday", () => {
  // Traditional domicile lords, Aries to Pisces (Tetrabiblos I.17), written out here.
  const LORDS = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
  const SIGN_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

  it("names the domicile lord of the rising sign as chart ruler, with its placement, dignity and aspects", async () => {
    for (const input of [RESOLVED, GAP, FOLD]) {
      for (const v of (await facts(input)).versions) {
        const r = v.chartRuler!;
        expect(r.risingSign).toBe(v.ascendant!.sign);
        expect(r.planet).toBe(LORDS[SIGN_NAMES.indexOf(v.ascendant!.sign)]);
        expect(r.placement).toEqual(v.placements.find((p) => p.point === r.planet));
        expect(r.dignity).toEqual(v.dignities.find((d) => d.planet === r.planet));
        expect(r.aspects).toEqual(v.aspects.filter((a) => a.a === r.planet || a.b === r.planet));
      }
    }
    const text = formatReadingFacts(await facts(RESOLVED));
    expect(text).toMatch(/^\[R1\] Chart ruler: \w+ \(\w+ rising\)\. .* Condition \(\[D\d\]\): .* Sect role: /m);
    expect(text).toMatch(/^\[R2\] Chart ruler's aspects, in the ranking's order: /m);
  }, 120_000);

  it("gives no chart ruler, angle contacts or angular houses without a birth time", async () => {
    const f = await facts(UNKNOWN);
    expect(f.versions[0]!.chartRuler).toBeNull();
    expect(f.versions[0]!.angleContacts).toBeNull();
    const text = formatReadingFacts(f);
    expect(text).toContain("[R1] Chart ruler: unavailable");
    expect(text).not.toMatch(/^\[C\d+\]|^- \[C\d+\]|^\[H\d+\]/m);
  }, 60_000);

  it("places a planet on an angle only from a conjunction or opposition with the Ascendant or Midheaven", () => {
    const aspects = [
      { rank: 1, a: "Saturn", b: "Midheaven", type: "conjunction", orb: 0.5 },
      { rank: 2, a: "Moon", b: "Ascendant", type: "opposition", orb: 1 },
      { rank: 3, a: "Venus", b: "Ascendant", type: "square", orb: 1.5 },
      { rank: 4, a: "Sun", b: "Moon", type: "conjunction", orb: 2 }
    ];
    expect(angleContactsFrom(aspects).map((c) => `${c.point} on the ${c.on}`)).toEqual(["Saturn on the Midheaven", "Moon on the Descendant"]);
  });

  it("lists angle contacts consistent with the separation to each angle, or says none", async () => {
    for (const input of [RESOLVED, GAP, FOLD]) {
      for (const v of (await facts(input)).versions) {
        for (const c of v.angleContacts!) {
          const angleLon = c.angle === "Ascendant" ? v.ascendant!.lon : v.midheaven!.lon;
          const lon = v.placements.find((p) => p.point === c.point)!.lon;
          expect(Math.abs(sep(lon, angleLon) - (c.type === "conjunction" ? 0 : 180))).toBeCloseTo(c.orb, 6);
        }
        const text = formatReadingFacts(await facts(input));
        if (v.angleContacts!.length === 0) expect(text).toMatch(/\[(?:[AB]-)?C\d+\] none: no planet or node is on the Ascendant/);
      }
    }
  }, 120_000);

  it("gives the sect role of each classical planet from the team", () => {
    expect(sectRole("Saturn", SECT_TEAMS.day, "morning")).toBe("malefic of sect");
    expect(sectRole("Saturn", SECT_TEAMS.night, "morning")).toBe("malefic contrary to sect (the out-of-sect malefic)");
    expect(sectRole("Moon", SECT_TEAMS.night, "morning")).toBe("sect light of this night chart");
    expect(sectRole("Moon", SECT_TEAMS.day, "morning")).toBe("the night light, contrary to sect in this day chart");
    expect(sectRole("Mercury", SECT_TEAMS.night, "morning")).toMatch(/joins the day sect: contrary to sect/);
    expect(sectRole("Jupiter", null, "morning")).toMatch(/^unavailable/);
  });

  it("gives the next birthday on or after the window start, and the age reached", () => {
    expect(nextBirthday("2015-11-11", "2026-11-01", 90)).toEqual({ date: "2026-11-11", turns: 11, inWindow: true, leapDay: false });
    expect(nextBirthday("1968-11-01", "2026-11-01", 90)).toMatchObject({ date: "2026-11-01", turns: 58, inWindow: true });
    expect(nextBirthday("1990-06-15", "2026-11-01", 90)).toMatchObject({ date: "2027-06-15", turns: 37, inWindow: false });
    expect(nextBirthday("2000-02-29", "2026-11-01", 90)).toMatchObject({ date: "2027-03-01", turns: 27, leapDay: true });
    expect(nextBirthday("2027-01-05", "2026-11-01", 90)).toBeNull();
    expect(nextBirthday("2026-11-01", "2026-11-01", 90)).toBeNull();
  });

  it("dates the solar return on the day the Sun is back at its natal longitude, matching the transit line", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      const f = await facts(input);
      for (const v of f.versions) {
        const sr = v.solarReturn;
        if (!f.birthday) {
          expect(sr).toBeNull();
          continue;
        }
        const natalSun = v.placements.find((p) => p.point === "Sun")!.lon;
        // Within a day of the local date the Sun is within about 1 degree of its natal longitude.
        const noon = Date.parse(`${sr!.date}T12:00:00Z`);
        expect(sep(bodyLongitude("Sun", new Date(noon)), natalSun)).toBeLessThan(1.1);
        const inWindow = v.transits.find((t) => t.body === "Sun" && t.natal === "Sun" && t.aspect === "conjunction");
        if (sr!.inWindow) expect(inWindow?.exact).toEqual([sr!.date]);
        else expect(inWindow).toBeUndefined();
      }
    }
  }, 120_000);
});

describe("dispositors and transiting positions", () => {
  // The traditional domicile rulers (Tetrabiblos I.17), written out here rather than taken from the engine.
  const RULER = ["Mars", "Venus", "Mercury", "Moon", "Sun", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Saturn", "Jupiter"];
  const SIGN_NAMES = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
  const at = (point: string, signIndex: number, deg = 10) => ({ point, lon: signIndex * 30 + deg, sign: SIGN_NAMES[signIndex]! });

  it("follows domicile lords to a final dispositor in its own sign", () => {
    // Synthetic: Venus in Taurus disposes everything.
    const d = dispositorChains([at("Sun", 6), at("Moon", 1), at("Mercury", 6), at("Venus", 1), at("Mars", 2), at("Jupiter", 1), at("Saturn", 5), at("Neptune", 2)], true);
    expect(d.final).toBe("Venus");
    expect(d.chains.find((c) => c.point === "Mars")).toMatchObject({ lord: "Mercury", chain: ["Mars", "Mercury", "Venus"], end: { kind: "domicile", planet: "Venus" } });
    expect(d.chains.find((c) => c.point === "Neptune")!.chain).toEqual(["Neptune", "Mercury", "Venus"]);
    expect(d.mutual).toEqual([]);
  });

  it("reports a loop and a mutual reception, and no final dispositor", () => {
    // Synthetic: Mars in Gemini and Mercury in Aries receive each other.
    const d = dispositorChains([at("Sun", 0), at("Moon", 3), at("Mercury", 0), at("Venus", 2), at("Mars", 2), at("Jupiter", 0), at("Saturn", 0)], true);
    expect(d.final).toBeNull();
    expect(d.mutual).toEqual([["Mercury", "Mars"]]);
    expect(d.chains.find((c) => c.point === "Sun")!.end).toEqual({ kind: "loop", planets: ["Mercury", "Mars"] });
    expect(d.chains.find((c) => c.point === "Moon")!.end).toEqual({ kind: "domicile", planet: "Moon" });
  });

  it("gives every planet's lord from the rulers' table and stops at the Moon without a birth time", async () => {
    for (const input of [RESOLVED, UNKNOWN]) {
      const v = (await facts(input)).versions[0]!;
      for (const c of v.dispositors.chains) expect(c.lord).toBe(RULER[SIGN_NAMES.indexOf(c.sign)]);
      if (!v.timeKnown) {
        expect(v.dispositors.chains.some((c) => c.point === "Moon")).toBe(false);
        for (const c of v.dispositors.chains.filter((x) => x.chain.includes("Moon"))) expect(c.end).toEqual({ kind: "unknown", planet: "Moon" });
      }
    }
  }, 60_000);

  it("gives each transiting body's sign at its dates, and its whole sign house counted from the rising sign", async () => {
    for (const input of [RESOLVED, UNKNOWN]) {
      const v = (await facts(input)).versions[0]!;
      for (const t of v.transits) {
        expect(t.positions.length).toBeGreaterThan(0);
        for (const p of t.positions) {
          if (v.ascendant) expect(p.house).toBe(((SIGN_NAMES.indexOf(p.sign) - SIGN_NAMES.indexOf(v.ascendant.sign) + 12) % 12) + 1);
          else expect(p.house).toBeNull();
        }
        // At an exact hit the body sits on the aspect point: the natal longitude plus or minus the aspect angle.
        const natal = t.natal === "Ascendant" ? v.ascendant! : t.natal === "Midheaven" ? v.midheaven! : v.placements.find((x) => x.point === t.natal)!;
        const angle = { conjunction: 0, square: 90, trine: 120, opposition: 180 }[t.aspect]!;
        const targets = [natal.lon + angle, natal.lon - angle].map((x) => SIGN_NAMES[Math.floor((((x % 360) + 360) % 360) / 30)]);
        const hits = t.range ? t.positions.slice(1, 1 + t.exact.length) : t.positions;
        expect(hits.length).toBe(t.exact.length);
        for (const p of hits) expect(targets).toContain(p.sign);
      }
      const sheet = formatReadingFacts(await facts(input));
      for (const line of sheet.split("\n").filter((l) => /\[T\d+\] transiting/.test(l))) {
        expect(line).toMatch(v.ascendant ? /; transiting \w+ (?:on .*)?in \w+, whole sign house \d+/ : /; transiting \w+ in \w+$/);
      }
      for (const line of sheet.split("\n").filter((l) => /\[S\d+\] \w+ stations/.test(l))) {
        if (v.ascendant) expect(line).toMatch(/at \d+°\d+' \w+, whole sign house \d+/);
      }
    }
  }, 60_000);
});

describe("line IDs", () => {
  it("gives every fact line one ID, unique except the repeated tightest aspect", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      const lines = formatReadingFacts(await facts(input)).split("\n");
      const tagged = lines.filter((l) => !l.startsWith("Tightest aspect:")).map((l) => /\[((?:[AB]-)?[A-Z]\d+[a-z]?)\]/.exec(l)?.[1]).filter(Boolean);
      expect(new Set(tagged).size).toBe(tagged.length);
      for (const l of lines.filter((x) => /transiting \w+ \w+ natal|stationing \w+ \w+ natal|^\[(?:[AB]-)?A\d+\] \d+\./.test(x.trim()))) expect(l).toMatch(/\[(?:[AB]-)?[A-Z]\d+[a-z]?\]/);
      expect(lines.find((l) => l.startsWith("[N1] Age at the window start"))).toBeDefined();
    }
  }, 120_000);

  it("gives the same IDs for the same input", async () => {
    expect(formatReadingFacts(await buildReadingFacts(RESOLVED))).toBe(formatReadingFacts(await facts(RESOLVED)));
  }, 60_000);
});

describe("two-chart sheets", () => {
  it("labels every fact line of a fold with its chart, says which clock reading gives which, and compares the charts", async () => {
    const text = formatReadingFacts(await facts(FOLD));
    expect(text).toContain("=== Chart A: earlier occurrence (clock on UTC-04:00) ===");
    expect(text).toContain("=== Chart B: later occurrence (clock on UTC-05:00) ===");
    expect(text).toMatch(/^\[G1\] Chart A is the earlier occurrence of 01:30: 01:30 on a clock still on UTC-04:00, before the change\. Instant 2026-11-01T05:30Z/m);
    expect(text).toMatch(/^\[G2\] Chart B is the later occurrence of 01:30: 01:30 on a clock already on UTC-05:00, after the change\. Instant 2026-11-01T06:30Z/m);
    const [, a, b] = text.split(/^=== Chart [AB]: .*$/m).map((x) => x.split("=== Both charts compared")[0]!);
    for (const [part, letter] of [[a!, "A"], [b!, "B"]] as const) {
      const ids = [...part.matchAll(/^(?:- |  - )?\[([^\]]+)\]/gm)].map((m) => m[1]!);
      expect(ids.length).toBeGreaterThan(20);
      expect(ids.every((id) => id.startsWith(`${letter}-`))).toBe(true);
    }
    expect(text).toMatch(/^\[X1\] Rising sign and chart ruler: /m);
    expect(text).toMatch(/^\[X\d+\] Transits only in chart A: .*\. Only in chart B: /m);
    expect(text).toMatch(/^\[X\d+\] Station contacts in both charts with the same orb: /m);
  }, 60_000);

  it("puts each gap chart on the clock it reads the time on (IANA: New York sprang from UTC-5 to UTC-4)", async () => {
    const text = formatReadingFacts(await facts(GAP));
    expect(text).toMatch(/^\[G1\] Chart A is 02:30 read on UTC-04:00: 02:30 on a clock already on UTC-04:00, after the change\. Instant 2026-03-08T06:30Z; the zone's clocks showed 2026-03-08 01:30\./m);
    expect(text).toMatch(/^\[G2\] Chart B is 02:30 read on UTC-05:00: 02:30 on a clock still on UTC-05:00, before the change\. Instant 2026-03-08T07:30Z; the zone's clocks showed 2026-03-08 03:30\./m);
    expect(text).toContain("=== Chart A: candidate read on the offset after the change (UTC-04:00) ===");
  }, 60_000);

  it("keeps one-chart sheets' IDs without a chart letter", async () => {
    const text = formatReadingFacts(await facts(RESOLVED));
    expect(text).not.toMatch(/\[[AB]-/);
    expect(text).not.toMatch(/^\[[GX]\d/m);
  }, 60_000);
});

describe("out of sign and angle counts", () => {
  it("marks out-of-sign aspects and angle contacts, and gives the number of planets on an angle", async () => {
    const f = await facts(RESOLVED);
    const text = formatReadingFacts(f);
    const v = f.versions[0]!;
    const signs = new Map<string, string>([...v.placements.map((p) => [p.point, p.sign] as [string, string]), ["Ascendant", v.ascendant!.sign], ["Midheaven", v.midheaven!.sign]]);
    const apart: Record<string, number> = { conjunction: 0, sextile: 2, square: 3, trine: 4, opposition: 6 };
    v.aspects.forEach((a, i) => {
      const line = text.split("\n").find((l) => l.startsWith(`[A${i + 1}] ${a.rank}. `))!;
      if (apart[a.type] === undefined) return;
      const names = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
      const d = Math.abs(names.indexOf(signs.get(a.a)!) - names.indexOf(signs.get(a.b)!));
      expect(line.includes(", out of sign (")).toBe(Math.min(d, 12 - d) !== apart[a.type]);
    });
    const n = v.angleContacts!.length;
    expect(text).toContain(n === 0 ? "the engine's default orbs): none." : `the engine's default orbs): ${n} in all (`);
  }, 60_000);
});
