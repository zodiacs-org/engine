import { describe, expect, it } from "vitest";

import {
  KP_SUBS,
  NAKSHATRAS,
  SIGN_LORDS,
  VARGAS,
  VIMSHOTTARI_LORDS,
  VIMSHOTTARI_YEARS,
  declareSiderealLongitude,
  kpLordsOf,
  nakshatraOf,
  vargaOf
} from "../vedic.js";
import type { VargaName } from "../vedic.js";
import { ticksOf } from "./grid.js";

const at = (lon: number) => declareSiderealLongitude(lon, { ayanamsa: "test" });
/** Sign index and degrees within it, as the texts write positions. */
const pos = (sign: number, degrees: number, minutes = 0) => at(sign * 30 + degrees + minutes / 60);

/** floor(x × 7560) by exact integer arithmetic on the double's binary value. */
function exactTicks(x: number): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const mantissa = (bits & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
  const shift = BigInt((exponent || 1) - 1075); // x = mantissa × 2^shift
  const scaled = mantissa * 7560n;
  return Number(shift >= 0n ? scaled << shift : scaled >> -shift);
}

describe("the exact tick grid", () => {
  it("floors lon × 7560 exactly, including doubles an ulp either side of a boundary", () => {
    let seed = 20260928;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const values: number[] = [0, Number.MIN_VALUE, 1e-300, 359.99999999999994];
    for (let t = 0; t < 2_721_600; t += 49) {
      const x = t / 7560;
      values.push(x, x - x * Number.EPSILON, x + x * Number.EPSILON);
    }
    for (let i = 0; i < 20_000; i += 1) values.push(random() * 360);
    const wrong = values.filter((x) => x >= 0 && x < 360 && ticksOf(x) !== exactTicks(x));
    expect(values.length).toBeGreaterThan(180_000);
    expect(wrong).toEqual([]);
  });
});

describe("nakshatras (BPHS 46.12–15)", () => {
  it("name the 27 in order with their Vimshottari lords, from Ketu at Ashwini", () => {
    // BPHS 46.15 table: the three constellations of each lord.
    const table: Record<string, string[]> = {
      Sun: ["Krittika", "Uttara Phalguni", "Uttara Ashadha"], Moon: ["Rohini", "Hasta", "Shravana"],
      Mars: ["Mrigashira", "Chitra", "Dhanishta"], Rahu: ["Ardra", "Swati", "Shatabhisha"],
      Jupiter: ["Punarvasu", "Vishakha", "Purva Bhadrapada"], Saturn: ["Pushya", "Anuradha", "Uttara Bhadrapada"],
      Mercury: ["Ashlesha", "Jyeshtha", "Revati"], Ketu: ["Magha", "Mula", "Ashwini"],
      Venus: ["Purva Phalguni", "Purva Ashadha", "Bharani"]
    };
    expect(NAKSHATRAS).toHaveLength(27);
    NAKSHATRAS.forEach((name, index) => {
      const found = nakshatraOf(at(index * (40 / 3) + 1));
      expect(found.name).toBe(name);
      expect(table[found.lord]).toContain(name);
    });
    expect(Object.values(VIMSHOTTARI_YEARS).reduce((a, b) => a + b, 0)).toBe(120);
    expect(VIMSHOTTARI_YEARS).toEqual({ Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17, Ketu: 7, Venus: 20 });
  });

  it("puts the Moon at Sagittarius 13° in Mula, pada 4 (BPHS 46, notes to v. 16)", () => {
    const moon = nakshatraOf(pos(8, 13));
    expect([moon.name, moon.pada, moon.lord]).toEqual(["Mula", 4, "Ketu"]);
    expect(moon.elapsed).toBeCloseTo(13 / (40 / 3), 12);
  });

  it("starts each nakshatra and pada at the boundary itself", () => {
    expect(nakshatraOf(at(0))).toMatchObject({ index: 0, pada: 1, elapsed: 0 });
    expect(nakshatraOf(at(10 / 3)).pada).toBe(2);
    expect(nakshatraOf(at(359.99999999999994))).toMatchObject({ name: "Revati", pada: 4 });
    expect(nakshatraOf(at(359.99999999999994)).elapsed).toBeLessThan(1);
  });
});

describe("KP subs", () => {
  it("are 249 contiguous subs in Vimshottari proportions, cut where signs change", () => {
    expect(KP_SUBS).toHaveLength(249);
    let edge = 0;
    for (const sub of KP_SUBS) {
      expect(sub.start).toBeCloseTo(edge, 12);
      edge = sub.end;
      expect(sub.signLord).toBe(SIGN_LORDS[Math.floor(sub.start / 30)]);
    }
    expect(edge).toBe(360);
    // Krittika's Rahu sub is cut at 30°, Punarvasu's Moon sub at 90°; Mrigashira's
    // Saturn and Mercury subs meet exactly at 60°.
    expect(KP_SUBS.slice(21, 23).map((s) => [s.number, s.sign, s.star, s.subLord, s.start, s.end]))
      .toEqual([[22, "aries", "Krittika", "Rahu", 29 + 2 / 9, 30], [23, "taurus", "Krittika", "Rahu", 30, 31 + 2 / 9]]);
    expect(KP_SUBS.filter((s) => s.start % 30 === 0 && s.start > 0)).toHaveLength(11);
    expect(KP_SUBS.find((s) => s.start === 60)).toMatchObject({ star: "Mrigashira", subLord: "Mercury" });
  });

  it("start each star with its own lord and each sub with its own lord", () => {
    const first = kpLordsOf(at(0));
    expect([first.sub.number, first.starLord, first.subLord, first.subSubLord]).toEqual([1, "Ketu", "Ketu", "Ketu"]);
    // Ashwini's Venus sub runs from 7 × 40/3 / 120 ° = 0°46′40″; its first sub-sub is Venus's.
    const venus = kpLordsOf(at((7 * 40) / 3 / 120 + 1e-9));
    expect([venus.sub.number, venus.subLord, venus.subSubLord]).toEqual([2, "Venus", "Venus"]);
    // The next sub-sub (Sun) starts 20 × 20 / 120 of 40/3 / 120 ° later.
    const sun = kpLordsOf(at((7 * 40) / 3 / 120 + (20 * 20 * 40) / 3 / 14_400 + 1e-9));
    expect(sun.subSubLord).toBe("Sun");
    expect(VIMSHOTTARI_LORDS[0]).toBe("Ketu");
  });

  it("gives Aries 29°30′ to the numbered sub 22 and Taurus 0°30′ to 23, both Rahu subs of Krittika", () => {
    expect(kpLordsOf(pos(0, 29, 30)).sub.number).toBe(22);
    expect(kpLordsOf(pos(1, 0, 30)).sub.number).toBe(23);
    expect(kpLordsOf(pos(1, 0, 30))).toMatchObject({ sign: "taurus", signLord: "Venus", starLord: "Sun", subLord: "Rahu" });
  });
});

describe("vargas (BPHS ch. 6)", () => {
  const sign = (lon: ReturnType<typeof at>, name: VargaName) => vargaOf(lon, name).sign;

  it("reproduce the worked examples of Narasimha Rao (2000) §6.2", () => {
    const gemini = (d: number) => pos(2, d);
    const scorpio = (d: number) => pos(7, d);
    expect([3, 19, 21].map((d) => sign(gemini(d), "D3"))).toEqual(["gemini", "libra", "aquarius"]);
    expect([3, 14, 23].map((d) => sign(pos(1, d), "D4"))).toEqual(["taurus", "leo", "aquarius"]);
    expect([sign(gemini(10), "D7"), sign(pos(5, 19), "D7")]).toEqual(["leo", "cancer"]);
    expect([sign(gemini(11), "D9"), sign(scorpio(19), "D9")]).toEqual(["capricorn", "sagittarius"]);
    expect([sign(gemini(10), "D10"), sign(scorpio(19), "D10")]).toEqual(["virgo", "capricorn"]);
    expect([sign(gemini(11), "D12"), sign(scorpio(19), "D12")]).toEqual(["libra", "gemini"]);
    expect([sign(gemini(11), "D16"), sign(scorpio(19), "D16")]).toEqual(["taurus", "gemini"]);
    expect([sign(gemini(11), "D20"), sign(scorpio(19), "D20")]).toEqual(["pisces", "sagittarius"]);
    expect([sign(gemini(11), "D24"), sign(scorpio(19), "D24")]).toEqual(["aries", "libra"]);
    // Example 23 prints Leo for Gemini 11°, but its own rule gives Cancer: 11° is the 10th
    // part, airy signs count from Libra, and the 10th sign from Libra is Cancer.
    expect([sign(gemini(11), "D27"), sign(scorpio(19), "D27")]).toEqual(["cancer", "gemini"]);
    expect([sign(gemini(11), "D40"), sign(scorpio(19), "D40")]).toEqual(["gemini", "scorpio"]);
    expect([sign(gemini(11), "D45"), sign(scorpio(19), "D45")]).toEqual(["aries", "sagittarius"]);
    expect(sign(at(222 + 58 / 60), "D60")).toBe("sagittarius");
  });

  it("reproduce BPHS's own examples", () => {
    // 6.9 notes: the chathurthamsas of Aries are Aries, Cancer, Libra, Capricorn.
    expect([1, 8, 16, 23].map((d) => sign(pos(0, d), "D4"))).toEqual(["aries", "cancer", "libra", "capricorn"]);
    // 6.10–11 notes: Taurus's saptamsas start from Scorpio.
    expect(sign(pos(1, 1), "D7")).toBe("scorpio");
    // 6.12 notes: navamsas of Taurus from Capricorn, of Gemini from Libra.
    expect([sign(pos(1, 1), "D9"), sign(pos(2, 1), "D9")]).toEqual(["capricorn", "libra"]);
    // 6.33 notes: Venus at Capricorn 13°25′ is in Pisces in the shashtiamsa.
    expect(sign(pos(9, 13, 25), "D60")).toBe("pisces");
  });

  it("give the trimsamsa's unequal parts in both directions", () => {
    expect([2, 7, 15, 20, 27].map((d) => sign(pos(0, d), "D30"))).toEqual(["aries", "aquarius", "sagittarius", "gemini", "libra"]);
    expect([2, 7, 15, 22, 27].map((d) => sign(pos(1, d), "D30"))).toEqual(["taurus", "virgo", "pisces", "capricorn", "scorpio"]);
    expect(vargaOf(pos(1, 12), "D30")).toMatchObject({ part: 3, sign: "pisces" });
  });

  it("give Parashari and cyclic horas and drekkanas", () => {
    expect([sign(pos(0, 1), "D2"), sign(pos(0, 16), "D2"), sign(pos(1, 1), "D2"), sign(pos(1, 16), "D2")])
      .toEqual(["leo", "cancer", "cancer", "leo"]);
    // 24 horas and 36 drekkanas counted on from Aries (BPHS 6.6, 6.7).
    expect([pos(0, 16), pos(1, 1), pos(1, 16), pos(11, 16)].map((p) => vargaOf(p, "D2", "cyclic").sign))
      .toEqual(["taurus", "gemini", "cancer", "pisces"]);
    expect([pos(0, 25), pos(1, 1), pos(11, 25)].map((p) => vargaOf(p, "D3", "cyclic").sign))
      .toEqual(["gemini", "cancer", "pisces"]);
  });

  it("list sixteen vargas and refuse unknown names and unimplemented variants", () => {
    expect(VARGAS.map((v) => v.name)).toEqual(["D1", "D2", "D3", "D4", "D7", "D9", "D10", "D12", "D16", "D20", "D24", "D27", "D30", "D40", "D45", "D60"]);
    expect(VARGAS.find((v) => v.name === "D3")?.notImplemented).toEqual(["jagannatha", "somanatha"]);
    expect(Object.isFrozen(VARGAS) && VARGAS.every(Object.isFrozen)).toBe(true);
    expect(() => vargaOf(at(1), "D8" as VargaName)).toThrow(RangeError);
    expect(() => vargaOf(at(1), "D3", "jagannatha" as "cyclic")).toThrow(/not implemented/);
    expect(() => vargaOf(at(1), "D9", "cyclic")).toThrow(/not implemented/);
    expect(() => vargaOf(at(1), "D9", "other" as "cyclic")).toThrow(/Unknown varga scheme/);
  });
});

describe("frame safety", () => {
  it("refuses bare numbers and look-alike objects where a sidereal longitude is required", () => {
    const fake = { frame: "sidereal", lon: 10, ayanamsa: "x", trueAyanamsa: null, tropical: null, utc: null };
    for (const f of [nakshatraOf, kpLordsOf, (v: never) => vargaOf(v, "D9")]) {
      expect(() => f(10 as never)).toThrow(RangeError);
      expect(() => f(fake as never)).toThrow(RangeError);
    }
  });

  it("validates declarations and keeps an in-range longitude bit for bit", () => {
    expect(at(13.333333333333334).lon).toBe(13.333333333333334);
    expect(at(-1e-9).lon).toBe(360 - 1e-9);
    expect(at(360).lon).toBe(0);
    expect(Object.isFrozen(at(1))).toBe(true);
    expect(() => declareSiderealLongitude(Number.NaN, { ayanamsa: "x" })).toThrow(RangeError);
    // A misspelt `at` is refused, not left out: a dasha would only fail later, for want of an instant.
    expect(() => declareSiderealLongitude(12.3, { ayanamsa: "x", time: "2000-01-01T00:00:00Z" } as never)).toThrow(/unknown option: time/);
    expect(declareSiderealLongitude(12.3, { ayanamsa: "x", at: undefined }).utc).toBeNull();
    expect(() => declareSiderealLongitude(1, { ayanamsa: " x" })).toThrow(RangeError);
    expect(() => declareSiderealLongitude(1, { ayanamsa: "x", at: "not a date" })).toThrow(RangeError);
    expect(declareSiderealLongitude(1, { ayanamsa: "x", at: "2000-01-01" }).utc).toBe("2000-01-01T00:00:00.000Z");
  });
});
