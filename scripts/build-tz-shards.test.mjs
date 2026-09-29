import { describe, expect, it } from "vitest";

import { causes, lineEnds } from "./build-tz-shards.mjs";

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
