import { describe, expect, it } from "vitest";
import { ageAt, buildReadingFacts, formatReadingFacts, degreeText, orbText, STATION_ORB, SLOW } from "./reading-facts.js";
import type { ReadingFacts, ReadingInput } from "./reading-facts.js";
import { bodyLongitude, longitudeSpeed } from "../../../src/ephemeris.js";

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

describe("line IDs", () => {
  it("gives every fact line one ID, unique except the repeated tightest aspect", async () => {
    for (const input of [RESOLVED, GAP, FOLD, UNKNOWN]) {
      const lines = formatReadingFacts(await facts(input)).split("\n");
      const tagged = lines.filter((l) => !l.startsWith("Tightest aspect:")).map((l) => /\[([A-Z]\d+[a-z]?)\]/.exec(l)?.[1]).filter(Boolean);
      expect(new Set(tagged).size).toBe(tagged.length);
      for (const l of lines.filter((x) => /transiting \w+ \w+ natal|stationing \w+ \w+ natal|^\[A\d+\] \d+\./.test(x.trim()))) expect(l).toMatch(/\[[A-Z]\d+[a-z]?\]/);
      expect(lines.find((l) => l.startsWith("[N1] Age at the window start"))).toBeDefined();
    }
  }, 120_000);

  it("gives the same IDs for the same input", async () => {
    expect(formatReadingFacts(await buildReadingFacts(RESOLVED))).toBe(formatReadingFacts(await facts(RESOLVED)));
  }, 60_000);
});
