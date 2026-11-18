import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  BACKWARD_ZONES,
  HELD,
  HELD_ZONES,
  TZDB_SHA256,
  TZDB_VERSION,
  causes,
  firstDifferenceFrom,
  heldSource,
  lineEnds,
  loadRelease,
  parseTzdb,
  pinnedSources,
  withoutLinks,
  zoneNames
} from "./build-tz-shards.mjs";

const at = (iso) => Date.parse(iso) / 1000;

/*
 * Europe/Kyiv's line "3:00 Russia MSK/MSD 1990 Jul 1 2:00" ends during Moscow
 * summer time (+4) and the next line, "2:00 1:00 EEST", is +3: the clock goes
 * back. zic ends the line when the old clock reads 02:00, 1990-06-30T22:00Z,
 * and writes the transition there. The next line's clock reads 02:00 again an
 * hour later; rc.15's first cut, searching from the standard reading
 * (02:00 - 3:00 = 23:00Z), stopped there and labelled the change "dst".
 */
describe("zone line ends on the wall clock", () => {
  const lines = [
    ["3:00", "Russia", "MSK/MSD", "1990", "Jul", "1", "2:00"],
    ["2:00", "1:00", "EEST", "1991", "Sep", "29", "3:00"],
    ["2:00", "E-Eur", "EE%sT", "1996", "May", "13"],
    ["2:00", "EU", "EE%sT"]
  ];
  // The compiled clock around the change, as zic writes it: MSK, MSD from 1990-03-24T23:00Z, EEST from 22:00Z on 1990-06-30.
  const tzif = {
    t: [at("1990-03-24T23:00:00Z"), at("1990-06-30T22:00:00Z"), at("1991-09-29T00:00:00Z")],
    typeOf: [1, 2, 3],
    offsets: [10_800, 14_400, 10_800, 7_200],
    isdst: [0, 1, 1, 0],
    designations: ["MSK", "MSD", "EEST", "EET"]
  };

  it("end where the old line's clock reads the UNTIL, not where the next line's does", () => {
    const [first, second] = lineEnds(lines, tzif);
    expect(new Date(first * 1000).toISOString()).toBe("1990-06-30T22:00:00.000Z");
    // 1991 Sep 29 3:00 on EEST, +3.
    expect(new Date(second * 1000).toISOString()).toBe("1991-09-29T00:00:00.000Z");
  });

  it("make the change of standard offset a legal change", () => {
    // MSD from MSK is daylight saving; EEST from MSD a new standard offset; EET from EEST daylight saving again.
    expect(causes(tzif, lines)).toEqual(["d", "l", "d"]);
  });

  it("take the first instant at which the line's clock reads the UNTIL", () => {
    // A line on +1 standard, +2 in summer, ending at 2000 Oct 29 1:30 while still on +2: at
    // 23:30Z on the 28th. The next line, +0, reads 01:30 again two hours later.
    const summer = [
      ["1:00", "Rule", "X%sT", "2000", "Oct", "29", "1:30"],
      ["0:00", "-", "Y"]
    ];
    const clock = {
      t: [at("2000-03-26T01:00:00Z"), at("2000-10-28T23:30:00Z")],
      typeOf: [1, 2],
      offsets: [3_600, 7_200, 0],
      isdst: [0, 1, 0],
      designations: ["XST", "XDT", "Y"]
    };
    expect(new Date(lineEnds(summer, clock)[0] * 1000).toISOString()).toBe("2000-10-28T23:30:00.000Z");
    expect(causes(clock, summer)).toEqual(["d", "l"]);
  });
});

/*
 * Since tzdb 2026d `backward` holds four Zones (EST5EDT, CST6CDT, MST7MDT,
 * PST8PDT) and a Rule set for them, beside its Links. The pinned build used
 * to leave `backward` out (its Links collide with backzone's zones of the
 * same names), so on 2026f the generator stopped with "CST6CDT (CST6CDT) did
 * not compile". The pinned build now compiles `backward` without its Links.
 */
describe("the pinned build compiles backward's zones without its links", () => {
  // A cut of tzdata 2026f's backward, the Link abbreviations zic accepts included.
  const backward = [
    "# Zone\tNAME\t\tSTDOFF\tRULES\tFORMAT\t[UNTIL]",
    "Link\tEurope/Kyiv\t\tEurope/Uzhgorod",
    "L Africa/Abidjan Africa/Accra",
    "li America/Edmonton America/Yellowknife # a comment",
    "Rule\tUSback\t1918\t1919\t-\tMar\tlastSun\t2:00\t1:00\tD",
    "Rule\tUSback\t1918\t1919\t-\tOct\tlastSun\t2:00\t0\tS",
    "Zone\tEST5EDT\t\t -5:00\tUSback\tE%sT",
    "Zone\tPST8PDT\t\t -8:00\tUSback\tP%sT",
    "\t# Linked names in a comment stay: Link X Y"
  ].join("\n");

  it("drops every Link line and keeps the Rule and Zone lines as written", () => {
    const kept = withoutLinks(backward).split("\n");
    expect(kept).toEqual([backward.split("\n")[0], ...backward.split("\n").slice(4)]);
    const parsed = parseTzdb(kept.join("\n"));
    expect([...parsed.zones.keys()]).toEqual(["EST5EDT", "PST8PDT"]);
    expect(parsed.links.size).toBe(0);
  });

  it("compiles the main data without backward, backzone, and backward's zones", () => {
    const files = new Map([
      ["europe", "Zone Europe/Kyiv 2:02:04 - LMT 1880\n 2:00 - EET"],
      ["backzone", "Zone Africa/Accra -0:00:52 - LMT 1915 Nov 2\n 0:00 - GMT"],
      ["backward", backward]
    ]);
    const { files: sources, names } = pinnedSources(files);
    expect(names).toEqual([
      "africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera", "backzone", BACKWARD_ZONES
    ]);
    expect(names).not.toContain("backward");
    expect(sources.get(BACKWARD_ZONES)).toBe(withoutLinks(backward));
    // The original files are untouched.
    expect(files.has(BACKWARD_ZONES)).toBe(false);
  });

  it("still resolves backward's links itself, and its zones as zones", () => {
    const main = parseTzdb(["Zone Europe/Kyiv 2:02:04 - LMT 1880\n 2:00 - EET", backward].join("\n"));
    const backzone = parseTzdb("Zone Africa/Accra -0:00:52 - LMT 1915 Nov 2\n 0:00 - GMT");
    const { zoneOf } = zoneNames(main, backzone);
    expect(zoneOf("EST5EDT")).toBe("EST5EDT");
    expect(zoneOf("Europe/Uzhgorod")).toBe("Europe/Kyiv");
    // Backzone's zone before backward's link.
    expect(zoneOf("Africa/Accra")).toBe("Africa/Accra");
  });
});

describe("the pinned release", () => {
  const work = mkdtempSync(join(tmpdir(), "tz-shards-test-"));
  afterEach(() => {
    delete process.env.TZDATA_TARBALL;
  });

  it("is tzdata 2026f", () => {
    expect(TZDB_VERSION).toBe("2026f");
    expect(TZDB_SHA256).toBe("01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d");
  });

  it("refuses an archive whose digest is not the pinned one", async () => {
    const archive = join(work, "tzdata.tar.gz");
    writeFileSync(archive, gzipSync(Buffer.from("not tzdata")));
    process.env.TZDATA_TARBALL = archive;
    await expect(loadRelease(work)).rejects.toThrow(/has sha256 [0-9a-f]{64}, expected 01b4a91c/);
    rmSync(work, { recursive: true, force: true });
  });
});

/*
 * America/Yellowknife is held at tzdata 2025c by the owner's decision
 * (ZOD-282): 2026f's backzone comments its zone out with no NEWS entry or
 * other official announcement behind the change. The pinned build compiles
 * 2025c's backzone lines for it, from a committed file whose digest is pinned.
 */
describe("the zone held at tzdata 2025c", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const empty = { main: parseTzdb(""), backzone: parseTzdb("") };

  it("is America/Yellowknife, from tzdata 2025c's backzone lines, unchanged", () => {
    expect(HELD_ZONES.map(({ name, release }) => [name, release])).toEqual([["America/Yellowknife", "2025c"]]);
    const parsed = parseTzdb(heldSource(root, empty));
    expect([...parsed.zones.keys()]).toEqual(["America/Yellowknife"]);
    // tzdata 2025c backzone lines 930 to 932.
    expect(parsed.zones.get("America/Yellowknife")).toEqual([
      ["0", "-", "-00", "1935"],
      ["-7:00", "NT_YK", "M%sT", "1980"],
      ["-7:00", "Canada", "M%sT"]
    ]);
    expect(parsed.links.size).toBe(0);
  });

  it("stops when the release defines the held name as a zone of its own", () => {
    const release = { main: parseTzdb(""), backzone: parseTzdb("Zone America/Yellowknife -7:00 - MST") };
    expect(() => heldSource(root, release)).toThrow(/held zone America\/Yellowknife: tzdata 2026f defines it as a zone/);
  });

  it("stops when a held file's digest is not the pinned one", () => {
    const work = mkdtempSync(join(tmpdir(), "tz-held-test-"));
    try {
      writeFileSync(join(work, "held.zi"), "Zone America/Yellowknife 0 - -00 1936\n -7:00 - MST\n");
      const held = [{ ...HELD_ZONES[0], file: "held.zi" }];
      expect(() => heldSource(work, empty, held)).toThrow(/has sha256 [0-9a-f]{64}, expected 90aedc77/);
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });

  it("is compiled beside backzone in the pinned build", () => {
    const files = new Map([["backzone", ""], ["backward", ""], [HELD, "Zone America/Yellowknife 0 - -00 1935\n -7:00 - MST"]]);
    expect(pinnedSources(files).names).toEqual([
      "africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera", "backzone", HELD, BACKWARD_ZONES
    ]);
    expect(pinnedSources(new Map([["backzone", ""], ["backward", ""]])).names).not.toContain(HELD);
  });

  it("finds the first instant from 1970 at which two compiled zones' offsets differ", () => {
    const mst = { t: [], typeOf: [], offsets: [-25200], isdst: [0], designations: ["MST"] };
    const alberta = { t: [at("2026-11-01T08:00:00Z")], typeOf: [1], offsets: [-25200, -21600], isdst: [0, 0], designations: ["MST", "CST"] };
    expect(firstDifferenceFrom(mst, alberta)).toBe(at("2026-11-01T08:00:00Z"));
    expect(HELD_ZONES[0].firstDifferenceFromDefault).toBe(at("2026-11-01T08:00:00Z"));
    expect(firstDifferenceFrom(mst, mst)).toBeNull();
  });
});
