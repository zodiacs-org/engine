import { describe, expect, it, vi } from "vitest";
import { findStarContacts, STAR_CONTACT_CONVENTIONS } from "../src/index.js";
import type { ContactOrbs, ContactStarPosition, ContactTarget } from "../src/index.js";

function star(starId = "synthetic-star", lonDeg: number | null = 0, decDeg = 0): ContactStarPosition {
  return { starId, lonDeg, decDeg };
}
function target(targetId = "Synthetic body", lonDeg: number | null = 0, decDeg: number | null = 0,
  targetKind: ContactTarget["targetKind"] = "body"): ContactTarget {
  return { targetId, targetKind, lonDeg, decDeg };
}
const both: ContactOrbs = { conjunctionDeg: 1, parallelDeg: 1 };
const longitudeOnly: ContactOrbs = { conjunctionDeg: 1, parallelDeg: null };
const declinationOnly: ContactOrbs = { conjunctionDeg: null, parallelDeg: 1 };

describe("hand-derived ecliptic conjunction geometry", () => {
  it("includes the short arc crossing the equinox and reports explicit units and identities", () => {
    // A half degree on each side of the equinox makes a one degree arc.
    const expected = [{ starId: "synthetic-star", targetId: "Synthetic body", targetKind: "body",
      kind: "conjunction", orbDeg: 1, maximumOrbDeg: 1 }];
    expect(findStarContacts([star(undefined, 359.5)], [target(undefined, 0.5)], longitudeOnly).hits).toEqual(expected);
    expect(findStarContacts([star(undefined, 0.5)], [target(undefined, 359.5)], longitudeOnly).hits).toEqual(expected);
  });

  it("uses longitude alone, without treating a conjunction as sky coincidence", () => {
    // Same projected longitude is an exact conjunction even at different dec.
    const found = findStarContacts([star(undefined, 90, 30)], [target(undefined, 90, -30)],
      { conjunctionDeg: 0, parallelDeg: 0 });
    expect(found.hits.map(({ kind, orbDeg }) => [kind, orbDeg])).toEqual([["conjunction", 0]]);
  });

  it.each([0, 180, 359.5])("includes equal longitudes %s at zero orb", (lon) => {
    expect(findStarContacts([star(undefined, lon)], [target(undefined, lon)],
      { conjunctionDeg: 0, parallelDeg: null }).hits[0]?.orbDeg).toBe(0);
  });

  it("treats half a circle as the maximum shortest arc", () => {
    expect(findStarContacts([star()], [target(undefined, 180)], longitudeOnly).hits).toEqual([]);
    expect(findStarContacts([star()], [target(undefined, 180)],
      { conjunctionDeg: 180, parallelDeg: null }).hits[0]?.orbDeg).toBe(180);
    expect(findStarContacts([star()], [target(undefined, 180)],
      { conjunctionDeg: 180 - 2 ** -45, parallelDeg: null }).hits).toEqual([]);
    expect(findStarContacts([star(undefined, 270)], [target(undefined, 0)],
      { conjunctionDeg: 90, parallelDeg: null }).hits[0]?.orbDeg).toBe(90);
  });

  it("does not widen an inclusive limit or lose the tiny part of a wraparound arc", () => {
    // Exact binary values: 1 + 2^-52 is outside one degree.
    expect(findStarContacts([star()], [target(undefined, 1 + 2 ** -52)], longitudeOnly).hits).toEqual([]);
    expect(findStarContacts([star()], [target(undefined, 1 - 2 ** -53)], longitudeOnly).hits).toHaveLength(1);
    // These binary64 values are exactly 8 + 2^-50 degrees apart, although
    // ordinary rounded circular subtraction can report 8. See GEOMETRY.md.
    expect(findStarContacts([star(undefined, 359.7)], [target(undefined, 7.6999999999999895)],
      { conjunctionDeg: 8, parallelDeg: null }).hits).toEqual([]);
    // Across zero: a subnormal plus one degree is strictly greater than one.
    expect(findStarContacts([star(undefined, Number.MIN_VALUE)], [target(undefined, 359)], longitudeOnly).hits).toEqual([]);
  });
});

describe("hand-derived parallels on the true equator", () => {
  it.each([30, -30, 0, 90, -90])("matches equal signed declinations %s independently of longitude", (dec) => {
    const hits = findStarContacts([star(undefined, 0, dec)], [target(undefined, 180, dec)],
      { conjunctionDeg: 0, parallelDeg: 0 }).hits;
    expect(hits.map(({ kind, orbDeg }) => [kind, orbDeg])).toEqual([["parallel", 0]]);
  });

  it("does not silently turn opposite declinations into contraparallels", () => {
    expect(findStarContacts([star(undefined, 0, 30)], [target(undefined, 0, -30)], declinationOnly).hits).toEqual([]);
    expect(findStarContacts([star(undefined, 0, 30)], [target(undefined, 0, -30)],
      { conjunctionDeg: null, parallelDeg: 60 }).hits[0]?.orbDeg).toBe(60);
    expect(findStarContacts([star(undefined, 0, 90)], [target(undefined, 0, -90)],
      { conjunctionDeg: null, parallelDeg: 180 }).hits[0]?.orbDeg).toBe(180);
  });

  it.each([1, -1])("includes the boundary in hemisphere sign %s", (sign) => {
    const hits = findStarContacts([star(undefined, 90, sign * 30)],
      [target(undefined, 270, sign * 31)], declinationOnly).hits;
    expect(hits[0]?.orbDeg).toBe(1);
    expect(hits[0]?.kind).toBe("parallel");
  });

  it("compares the exact doubles even when subtraction rounds to the boundary", () => {
    // 1.1 - 0.1 is exactly 1 + 3*2^-55, despite rounded subtraction being 1.
    expect(findStarContacts([star(undefined, 0, 1.1)], [target(undefined, 0, 0.1)], declinationOnly).hits).toEqual([]);
    // 13.3 and 12.3 share their binary fraction, giving exactly one degree.
    expect(findStarContacts([star(undefined, 0, 13.3)], [target(undefined, 0, 12.3)], declinationOnly).hits[0]?.orbDeg).toBe(1);
    // Smallest representable negative dec: 1 - (-2^-1074) exceeds one.
    expect(findStarContacts([star(undefined, 0, 1)], [target(undefined, 0, -Number.MIN_VALUE)], declinationOnly).hits).toEqual([]);
  });
});

describe("unavailable coordinates and explicit contact selection", () => {
  it("keeps a pole's parallel while skipping its undefined longitude", () => {
    expect(findStarContacts([star(undefined, null, 30)], [target(undefined, 0, 30)], both).hits
      .map(({ kind }) => kind)).toEqual(["parallel"]);
    expect(findStarContacts([star(undefined, 0, 30)], [target("Synthetic angle", null, 30, "angle")], both).hits
      .map(({ kind, targetKind }) => [kind, targetKind])).toEqual([["parallel", "angle"]]);
  });

  it("skips only the unavailable target coordinate", () => {
    expect(findStarContacts([star()], [target(undefined, 0, null)], both).hits.map(({ kind }) => kind)).toEqual(["conjunction"]);
    expect(findStarContacts([star()], [target(undefined, null, null)], both).hits).toEqual([]);
  });

  it("allows each kind to be disabled without confusing zero orb with disable", () => {
    expect(findStarContacts([star()], [target()], { conjunctionDeg: null, parallelDeg: null }).hits).toEqual([]);
    expect(findStarContacts([star()], [target()], { conjunctionDeg: 0, parallelDeg: 0 }).hits
      .map(({ kind }) => kind)).toEqual(["conjunction", "parallel"]);
    expect(findStarContacts([star()], [target()], declinationOnly).hits.map(({ kind }) => kind)).toEqual(["parallel"]);
    expect(findStarContacts([star()], [target()], longitudeOnly).hits.map(({ kind }) => kind)).toEqual(["conjunction"]);
    expect(findStarContacts([], [target()], both).hits).toEqual([]);
    expect(findStarContacts([star()], [], both).hits).toEqual([]);
  });
});

describe("stable structured results and purity", () => {
  it("matches both one-degree contacts in the README's invented angle example", () => {
    const result = findStarContacts([star("synthetic-star", 359.5, 30)],
      [target("Synthetic angle", 0.5, 31, "angle")], both);
    expect(result.hits).toEqual([
      { starId: "synthetic-star", targetId: "Synthetic angle", targetKind: "angle", kind: "conjunction", orbDeg: 1, maximumOrbDeg: 1 },
      { starId: "synthetic-star", targetId: "Synthetic angle", targetKind: "angle", kind: "parallel", orbDeg: 1, maximumOrbDeg: 1 }
    ]);
  });

  it("orders by exact orb before ids even when the reported orbs coincide", () => {
    // 1 - 2^-1074 is closer than 1; both round to the binary64 value 1.
    const result = findStarContacts([star("a", 0, 0), star("z", 0, Number.MIN_VALUE)],
      [target(undefined, 0, 1)], declinationOnly);
    expect(result.hits.map(({ starId, orbDeg }) => [starId, orbDeg])).toEqual([["z", 1], ["a", 1]]);
  });

  it("resolves exact ties by ids, target kind and contact kind independent of input order", () => {
    const stars = [star("z"), star("a")];
    const targets = [target("z"), target("a"), target("a", 0, 0, "angle")];
    const result = findStarContacts(stars, targets, both);
    expect(findStarContacts([...stars].reverse(), [...targets].reverse(), both)).toEqual(result);
    expect(result.hits.map(({ starId, targetKind, targetId, kind }) => [starId, targetKind, targetId, kind])).toEqual([
      ["a", "angle", "a", "conjunction"], ["a", "angle", "a", "parallel"],
      ["a", "body", "a", "conjunction"], ["a", "body", "a", "parallel"],
      ["a", "body", "z", "conjunction"], ["a", "body", "z", "parallel"],
      ["z", "angle", "a", "conjunction"], ["z", "angle", "a", "parallel"],
      ["z", "body", "a", "conjunction"], ["z", "body", "a", "parallel"],
      ["z", "body", "z", "conjunction"], ["z", "body", "z", "parallel"]
    ]);
  });

  it("uses UTF-16 comparison rather than the runtime's locale collation", () => {
    const rows = [star("é"), star("a"), star("Z"), star("A")];
    expect(findStarContacts(rows, [target()], longitudeOnly).hits.map(({ starId }) => starId)).toEqual(["A", "Z", "a", "é"]);
  });

  it("freezes output snapshots and leaves caller inputs mutable and unchanged", () => {
    const stars = [star()];
    const targets = [target()];
    const orbs = { ...both };
    const before = structuredClone({ stars, targets, orbs });
    const result = findStarContacts(stars, targets, orbs);
    expect({ stars, targets, orbs }).toEqual(before);
    expect(Object.isFrozen(stars[0])).toBe(false);
    expect(result.conventions).toBe(STAR_CONTACT_CONVENTIONS);
    for (const value of [result, result.hits, ...result.hits, result.orbs, result.conventions]) expect(Object.isFrozen(value)).toBe(true);
    orbs.conjunctionDeg = 5;
    stars.length = 0;
    targets.length = 0;
    expect(result.orbs).toEqual(both);
    expect(result.hits).toHaveLength(2);
    expect(result.conventions.receiptScope).toBe("pure-coordinate-matching;no-chart-or-sky-call");
  });

  it("normalizes negative zero in reported orbs and policy", () => {
    const result = findStarContacts([star(undefined, -0, -0)], [target(undefined, 0, 0)],
      { conjunctionDeg: -0, parallelDeg: -0 });
    expect(result.orbs).toEqual({ conjunctionDeg: 0, parallelDeg: 0 });
    for (const hit of result.hits) {
      expect(Object.is(hit.orbDeg, 0)).toBe(true);
      expect(Object.is(hit.maximumOrbDeg, 0)).toBe(true);
    }
  });
});

describe("validation before matching", () => {
  it.each([null, undefined, [], {}, { conjunctionDeg: 1 }, { conjunctionDeg: 1, parallelDeg: 1, orb: 1 },
    { conjunctionDeg: NaN, parallelDeg: 1 }, { conjunctionDeg: 1, parallelDeg: Infinity },
    { conjunctionDeg: -1, parallelDeg: 1 }, { conjunctionDeg: 1, parallelDeg: 181 },
    { conjunctionDeg: "1", parallelDeg: 1 }, { conjunctionDeg: 1, parallelDeg: undefined }
  ])("refuses missing, invalid or unit-ambiguous orb policy %j", (orbs) => {
    expect(() => findStarContacts([], [], orbs as unknown as ContactOrbs)).toThrow(RangeError);
  });

  it("refuses accessor or hidden orb fields without executing them", () => {
    const getter = vi.fn(() => 1);
    expect(() => findStarContacts([], [], { get conjunctionDeg() { return getter(); }, parallelDeg: 1 })).toThrow(RangeError);
    expect(getter).not.toHaveBeenCalled();
    const hidden = Object.defineProperty({ parallelDeg: 1 }, "conjunctionDeg", { value: 1 });
    expect(() => findStarContacts([], [], hidden as ContactOrbs)).toThrow(RangeError);
  });

  it.each([-1, 360, Infinity, NaN, undefined, "0"])("refuses invalid longitude %j on either input", (lon) => {
    expect(() => findStarContacts([{ ...star(), lonDeg: lon } as ContactStarPosition], [], both)).toThrow(RangeError);
    expect(() => findStarContacts([], [{ ...target(), lonDeg: lon } as ContactTarget], both)).toThrow(RangeError);
  });

  it.each([-91, 91, Infinity, NaN, undefined, "0"])("refuses invalid declination %j on either input", (dec) => {
    expect(() => findStarContacts([{ ...star(), decDeg: dec } as ContactStarPosition], [], both)).toThrow(RangeError);
    expect(() => findStarContacts([], [{ ...target(), decDeg: dec } as ContactTarget], both)).toThrow(RangeError);
  });

  it("rejects unavailable star declination and malformed or sparse arrays even when disabled", () => {
    const disabled = { conjunctionDeg: null, parallelDeg: null };
    for (const rows of [null, {}, [null], [undefined], Array(1), [[]]]) {
      expect(() => findStarContacts(rows as ContactStarPosition[], [], disabled)).toThrow(RangeError);
      expect(() => findStarContacts([], rows as ContactTarget[], disabled)).toThrow(RangeError);
    }
    expect(() => findStarContacts([{ ...star(), decDeg: null } as unknown as ContactStarPosition], [], disabled)).toThrow(RangeError);
    expect(() => findStarContacts([], [{ ...target(), targetKind: "point" } as unknown as ContactTarget], both)).toThrow(RangeError);
  });

  it.each(["", " padded", "newline\n", "\u0000", "x".repeat(81)])("refuses ambiguous identifiers %j", (id) => {
    expect(() => findStarContacts([star(id)], [], both)).toThrow(RangeError);
    expect(() => findStarContacts([], [target(id)], both)).toThrow(RangeError);
  });

  it("refuses duplicate star ids and duplicate targets within a kind", () => {
    expect(() => findStarContacts([star(), star()], [], both)).toThrow(RangeError);
    expect(() => findStarContacts([], [target(), target()], both)).toThrow(RangeError);
    expect(findStarContacts([star("same")], [target("same"), target("same", 0, 0, "angle")], longitudeOnly).hits).toHaveLength(2);
  });
});

// Independent rational oracle: decode each IEEE 754 value as an integer
// multiple of 2^-1074. Unlike the implementation's expansion arithmetic,
// all subsequent operations here are integer subtraction and comparison.
function integerUnits(value: number): bigint {
  const bytes = new DataView(new ArrayBuffer(8));
  bytes.setFloat64(0, value);
  const bits = bytes.getBigUint64(0);
  const sign = bits >> 63n ? -1n : 1n;
  const exponent = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  return sign * (exponent === 0 ? fraction : ((1n << 52n) + fraction) * (1n << BigInt(exponent - 1)));
}
const magnitude = (n: bigint): bigint => n < 0n ? -n : n;

describe("independent integer decisions on the supplied binary64 angles", () => {
  it("confirms the exact rational representations used in the documented derivation", () => {
    for (const [value, numerator, exponent] of [
      [1.1, 2476979795053773n, 51], [0.1, 3602879701896397n, 55],
      [359.7, 6327909320176435n, 44], [7.6999999999999895, 8669429282688193n, 50]
    ] as const) expect(integerUnits(value)).toBe(numerator << BigInt(1074 - exponent));
    expect(integerUnits(1.1) - integerUnits(0.1) - integerUnits(1)).toBe(3n << 1019n);
    expect(integerUnits(13.3) - integerUnits(12.3)).toBe(integerUnits(1));
    expect(integerUnits(360) - integerUnits(359.7) + integerUnits(7.6999999999999895) - integerUnits(8)).toBe(1n << 1024n);
  });

  it("matches exact circular and signed-declination eligibility across representative boundaries", () => {
    const longitudes = [0, Number.MIN_VALUE, 0.1, 0.5, 1, 1 + 2 ** -52, 7.6999999999999895,
      90, 180, 180 + 2 ** -45, 270, 359, 359.5, 359.7, 360 - 2 ** -44];
    const declinations = [-90, -30, -1.1, -0.1, -Number.MIN_VALUE, 0, Number.MIN_VALUE, 0.1, 1.1, 12.3, 13.3, 30, 90];
    for (const [angles, kind] of [[longitudes, "conjunction"], [declinations, "parallel"]] as const) {
      for (const a of angles) for (const b of angles) for (const maximum of [0, 1, 8, 90, 180]) {
        let exactOrb = magnitude(integerUnits(a) - integerUnits(b));
        if (kind === "conjunction" && exactOrb > integerUnits(180)) exactOrb = integerUnits(360) - exactOrb;
        const result = kind === "conjunction"
          ? findStarContacts([star(undefined, a)], [target(undefined, b)], { conjunctionDeg: maximum, parallelDeg: null })
          : findStarContacts([star(undefined, 0, a)], [target(undefined, 0, b)], { conjunctionDeg: null, parallelDeg: maximum });
        expect(result.hits.length, `${kind}: ${a}, ${b}, limit ${maximum}`).toBe(exactOrb <= integerUnits(maximum) ? 1 : 0);
        for (const hit of result.hits) {
          expect(hit.orbDeg).toBeGreaterThanOrEqual(0);
          expect(hit.orbDeg).toBeLessThanOrEqual(maximum);
        }
      }
    }
  });
});
