import { describe, expect, it } from "vitest";
import { nakshatraOf } from "../../src/vedic/nakshatra.js";
import { declareSiderealLongitude } from "../../src/vedic/sidereal.js";
import {
  PANCHANG_AYANAMSAS, instantaneousPanchang, karanaOf, luminarySnapshot,
  tithiOf, yogaOf
} from "../src/index.js";

// Independent oracle: decode each nonnegative double as integer units of
// 2^-1074 degrees. No engine arithmetic or production classification is used.
const UNIT = 1n << 1074n;
const TURN = 360n * UNIT;
function units(value: number): bigint {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value);
  const bits = buffer.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  return exponent === 0 ? fraction : ((1n << 52n) + fraction) << BigInt(exponent - 1);
}
function indexOf(arc: bigint, numerator: bigint, denominator = 1n): number {
  const wrapped = ((arc % TURN) + TURN) % TURN;
  return Number((wrapped * denominator) / (numerator * UNIT));
}
function adjacent(value: number, direction: -1 | 1): number {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, value);
  buffer.setBigUint64(0, buffer.getBigUint64(0) + BigInt(direction));
  return buffer.getFloat64(0);
}
function sidereal(lon: number) {
  return declareSiderealLongitude(lon, { ayanamsa: "arithmetic-fixture" });
}

// Traditional sequence transcribed independently from CRC 1955 pp. 109-110,
// using the later-order footnote for the fixed karanas. See SOURCES.md.
const TITHIS = ["Pratipada", "Dvitiya", "Tritiya", "Chaturthi", "Panchami", "Shashthi",
  "Saptami", "Ashtami", "Navami", "Dashami", "Ekadashi", "Dvadashi", "Trayodashi", "Chaturdashi"];
const YOGAS = ["Vishkambha", "Priti", "Ayushman", "Saubhagya", "Shobhana", "Atiganda",
  "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi", "Dhruva", "Vyaghata", "Harshana",
  "Vajra", "Siddhi", "Vyatipata", "Variyan", "Parigha", "Shiva", "Siddha", "Sadhya",
  "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"];
const KARANA_ROWS = [
  ["Kimstughna", "Bava"], ["Balava", "Kaulava"], ["Taitila", "Gara"],
  ["Vanija", "Vishti"], ["Bava", "Balava"], ["Kaulava", "Taitila"], ["Gara", "Vanija"],
  ["Vishti", "Bava"], ["Balava", "Kaulava"], ["Taitila", "Gara"], ["Vanija", "Vishti"],
  ["Bava", "Balava"], ["Kaulava", "Taitila"], ["Gara", "Vanija"], ["Vishti", "Bava"],
  ["Balava", "Kaulava"], ["Taitila", "Gara"], ["Vanija", "Vishti"], ["Bava", "Balava"],
  ["Kaulava", "Taitila"], ["Gara", "Vanija"], ["Vishti", "Bava"], ["Balava", "Kaulava"],
  ["Taitila", "Gara"], ["Vanija", "Vishti"], ["Bava", "Balava"], ["Kaulava", "Taitila"],
  ["Gara", "Vanija"], ["Vishti", "Shakuni"], ["Chatushpada", "Naga"]
];

describe("independent instantaneous limb arithmetic (SOURCES.md)", () => {
  it("assigns all tithis, pakshas, names and fortnight ordinals", () => {
    for (let index = 0; index < 30; index++) {
      for (const offset of [0, 3, 9]) {
        const result = tithiOf(0, index * 12 + offset);
        expect(result).toEqual({ index,
          name: index === 14 ? "Purnima" : index === 29 ? "Amavasya" : TITHIS[index % 15],
          paksha: index < 15 ? "shukla" : "krishna", pakshaNumber: index % 15 + 1 });
        expect(Object.isFrozen(result)).toBe(true);
      }
    }
  });

  it("checks the entire half-tithi sequence including fixed karanas and its wrap", () => {
    const names = KARANA_ROWS.flat();
    for (let index = 0; index < 60; index++) {
      for (const offset of [0, 2, 5]) {
        const result = karanaOf(0, index * 6 + offset);
        expect(result).toEqual({ index, name: names[index],
          kind: [0, 57, 58, 59].includes(index) ? "fixed" : "moving",
          half: index % 2 === 0 ? 1 : 2 });
        expect(Object.isFrozen(result)).toBe(true);
      }
    }
    expect(karanaOf(Number.MIN_VALUE, 0).name).toBe("Naga");
    expect(karanaOf(0, 0).name).toBe("Kimstughna");
    expect(karanaOf(0, 6).name).toBe("Bava");
  });

  it("checks every tithi and karana boundary and both adjacent doubles", () => {
    for (let boundary = 6; boundary < 360; boundary += 6) {
      for (const moon of [adjacent(boundary, -1), boundary, adjacent(boundary, 1)]) {
        expect(tithiOf(0, moon).index).toBe(indexOf(units(moon), 12n));
        expect(karanaOf(0, moon).index).toBe(indexOf(units(moon), 6n));
      }
    }
    for (const moon of [0, Number.MIN_VALUE, adjacent(360, -1)]) {
      expect(tithiOf(0, moon).index).toBe(indexOf(units(moon), 12n));
      expect(karanaOf(0, moon).index).toBe(indexOf(units(moon), 6n));
    }
  });

  it("checks rational yoga boundaries without rounding them to nearby doubles", () => {
    for (let index = 1; index < 27; index++) {
      const boundary = index * 40 / 3;
      for (const sum of [adjacent(boundary, -1), boundary, adjacent(boundary, 1)]) {
        const result = yogaOf(sidereal(0), sidereal(sum));
        const expected = indexOf(units(sum), 40n, 3n);
        expect(result).toEqual({ index: expected, name: YOGAS[expected] });
        expect(Object.isFrozen(result)).toBe(true);
      }
    }
    // A sector midpoint in thirds of a degree avoids taking its boundary as
    // an expected binary value; integer division derives the expected index.
    for (let thirds = 20; thirds < 1080; thirds += 40) {
      const expected = Math.floor(thirds / 40);
      expect(yogaOf(sidereal(0), sidereal(thirds / 3)).name).toBe(YOGAS[expected]);
    }
  });

  it("wraps exact sums and differences, including cancellation across boundaries", () => {
    const pairs = [[0, 0], [359, 1], [180, 180], [359, 359], [12, Number.MIN_VALUE],
      [Number.MIN_VALUE, 12], [Number.MIN_VALUE, 0], [0.1, 39.9], [98.86, 188.86],
      [adjacent(360, -1), Number.MIN_VALUE], [Number.MIN_VALUE, adjacent(360, -1)]];
    for (const [sun, moon] of pairs as [number, number][]) {
      expect(tithiOf(sun, moon).index).toBe(indexOf(units(moon) - units(sun), 12n));
      expect(karanaOf(sun, moon).index).toBe(indexOf(units(moon) - units(sun), 6n));
      expect(yogaOf(sidereal(sun), sidereal(moon)).index).toBe(indexOf(units(sun) + units(moon), 40n, 3n));
    }
    expect(tithiOf(Number.MIN_VALUE, 12).index).toBe(0);
    expect(yogaOf(sidereal(0.1), sidereal(39.9)).index).toBe(2);
    // Integer degrees across both circles exercise many unwrapped arcs.
    for (let sun = 0; sun < 360; sun += 7) {
      for (let moon = 0; moon < 360; moon += 11) {
        expect(tithiOf(sun, moon).index).toBe(Math.floor(((moon - sun + 360) % 360) / 12));
        expect(karanaOf(sun, moon).index).toBe(Math.floor(((moon - sun + 360) % 360) / 6));
        expect(yogaOf(sidereal(sun), sidereal(moon)).index).toBe(Math.floor(((sun + moon) % 360) * 3 / 40));
      }
    }
  });

  it("reuses engine nakshatra/pada at every rational boundary", () => {
    for (let pada = 1; pada < 108; pada++) {
      const boundary = pada * 10 / 3;
      for (const moon of [adjacent(boundary, -1), boundary, adjacent(boundary, 1)]) {
        const expectedPada = indexOf(units(moon), 10n, 3n);
        const result = nakshatraOf(sidereal(moon));
        expect(result.index).toBe(Math.floor(expectedPada / 4));
        expect(result.pada).toBe(expectedPada % 4 + 1);
      }
    }
  });

  it.each([NaN, Infinity, -Infinity, -1, -Number.MIN_VALUE, 360, 720, null, "12", undefined])(
    "rejects noncanonical tropical longitude %s", (input) => {
      const invalid = input as number;
      for (const classify of [tithiOf, karanaOf]) {
        expect(() => classify(invalid, 0)).toThrow(RangeError);
        expect(() => classify(0, invalid)).toThrow(RangeError);
      }
    }
  );

  it("rejects unbranded sidereal inputs, mixed ayanamsas and mixed epochs", () => {
    const sun = sidereal(10);
    expect(() => yogaOf({ ...sun }, sidereal(20))).toThrow(RangeError);
    expect(() => yogaOf(sun, null as never)).toThrow(RangeError);
    expect(() => yogaOf(sun, declareSiderealLongitude(20, { ayanamsa: "other" }))).toThrow(RangeError);
    expect(() => yogaOf(sun, declareSiderealLongitude(20,
      { ayanamsa: "arithmetic-fixture", at: "2020-01-01" }))).toThrow(RangeError);
  });
});

describe("instantaneous API engine integration, not accuracy evidence", () => {
  it.each(PANCHANG_AYANAMSAS)("retains receipts, ayanamsa and engine nakshatra for %s", (ayanamsa) => {
    const at = "2020-01-01T00:00:00Z";
    const snapshot = luminarySnapshot(at, { ayanamsa });
    const result = instantaneousPanchang(at, { ayanamsa });
    if (snapshot.status !== "ok" || result.status !== "ok") throw new Error("Unexpected refusal");
    const { tithi, yoga, karana, ...retained } = result;
    expect(retained).toEqual(snapshot);
    expect(tithi.index).toBe(indexOf(units(result.moon.tropical.lon) - units(result.sun.tropical.lon), 12n));
    expect(karana.index).toBe(indexOf(units(result.moon.tropical.lon) - units(result.sun.tropical.lon), 6n));
    expect(yoga.index).toBe(indexOf(units(result.moon.sidereal.lon) + units(result.sun.sidereal.lon), 40n, 3n));
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).not.toHaveProperty("vara");
  });

  it("defaults to Lahiri, preserves refusals and delegates invalid input", () => {
    expect(instantaneousPanchang("2020-01-01")).toEqual(instantaneousPanchang("2020-01-01", { ayanamsa: "lahiri" }));
    const refused = instantaneousPanchang("1700-01-01", { ayanamsa: "raman" });
    expect(refused).toEqual(luminarySnapshot("1700-01-01", { ayanamsa: "raman" }));
    expect(refused).not.toHaveProperty("tithi");
    expect(() => instantaneousPanchang("2020-02-30")).toThrow(RangeError);
    expect(() => instantaneousPanchang("2020-01-01", { ayanamsa: "invalid" } as never)).toThrow(RangeError);
  });
});
