import { describe, expect, it } from "vitest";
import { serializeNatalEnvelope } from "../../src/receipt.js";
import { castChart } from "../src/engine.js";
import { DIAL_CIRCLES, findPlanetaryPictures } from "../src/index.js";
import type { DialCircle, LongitudePoint, PlanetaryPictureOptions } from "../src/index.js";

// Invented points only. Expected values come from integer sums and exact binary
// fractions in these comments, never from an earlier run of this project.
const fixture = [
  { body: "A", lon: 350 }, { body: "B", lon: 30 },
  { body: "C", lon: 25 }, { body: "D", lon: 355 }
];

describe("sensitive-point arithmetic", () => {
  it.each(DIAL_CIRCLES)("retains all canonical A+B-C formulas on the %s dial", (circle) => {
    // AB sums to 380, AC to 375, AD to 705, BC to 55, BD to 385,
    // and CD to 380. Subtract each unused label, then remove whole 360 turns.
    const expected = [
      ["A", "B", "C", 355], ["A", "B", "D", 25],
      ["A", "C", "B", 345], ["A", "C", "D", 20],
      ["A", "D", "B", 315], ["A", "D", "C", 320],
      ["B", "C", "A", 65], ["B", "C", "D", 60],
      ["B", "D", "A", 35], ["B", "D", "C", 0],
      ["C", "D", "A", 30], ["C", "D", "B", 350]
    ] as const;
    const result = findPlanetaryPictures(fixture, circle, { contactOrb: 0 });
    expect(result.repeatedMembers).toBe("distinct");
    expect(result.arithmetic).toBe("binary64;inclusive;no-epsilon");
    expect(result.sensitivePoints).toEqual(expected.map(([a, b, c, sourceLon]) => ({
      a, b, c, sourceLon, lon: sourceLon % circle, sector: Math.floor(sourceLon / circle)
    })));
    // Only AB=CD: 380=380. AC versus BD differs by 10; AD versus BC
    // differs by 650, whose smallest supported-dial distance is 2.5.
    expect(result.pictures).toEqual([{
      left: ["A", "B"], right: ["C", "D"], sensitivePoint: result.sensitivePoints[0],
      target: result.dial.points[3], orb: 0
    }]);
    expect(result.pictures[0]!.sensitivePoint).toBe(result.sensitivePoints[0]);
    expect(result.pictures[0]!.target).toBe(result.dial.points[3]);
  });

  it("normalizes supplied sources before addition and keeps distinct formulas at the same coordinate", () => {
    // -10 -> 350, 750 -> 30, -335 -> 25, 715 -> 355, the same sources.
    const normalized = [-10, 750, -335, 715].map((lon, i) => ({ body: fixture[i]!.body, lon }));
    expect(findPlanetaryPictures(normalized)).toEqual(findPlanetaryPictures(fixture));
    // All zero sources yield three distinct sum-minus formulas, not one point.
    expect(findPlanetaryPictures([
      { body: "A", lon: 0 }, { body: "B", lon: 0 }, { body: "C", lon: 0 }
    ]).sensitivePoints).toEqual([
      { a: "A", b: "B", c: "C", sourceLon: 0, lon: 0, sector: 0 },
      { a: "A", b: "C", c: "B", sourceLon: 0, lon: 0, sector: 0 },
      { a: "B", b: "C", c: "A", sourceLon: 0, lon: 0, sector: 0 }
    ]);
    // MAX_VALUE=(2^53-1)*2^971 -> 128 modulo 360. All sources are
    // normalized before adding, so 128+128-128=128 without overflow.
    expect(findPlanetaryPictures(["A", "B", "C"].map((body) => ({ body, lon: Number.MAX_VALUE })))
      .sensitivePoints.every(({ sourceLon }) => sourceLon === 128)).toBe(true);
  });

  it("lists sensitive points without requiring an external target", () => {
    expect(findPlanetaryPictures(fixture.slice(0, 3)).pictures).toEqual([]);
    expect(findPlanetaryPictures(fixture.slice(0, 3)).sensitivePoints).toHaveLength(3);
    for (const points of [fixture.slice(0, 1), fixture.slice(0, 2)]) {
      expect(findPlanetaryPictures(points).sensitivePoints).toEqual([]);
      expect(findPlanetaryPictures(points).pictures).toEqual([]);
    }
  });
});

describe("picture dial contacts", () => {
  it.each(DIAL_CIRCLES)("includes seam, zero, default and half-circle boundaries on %s", (circle) => {
    // A+B-C=0+0.25-0.5=-0.25 -> 359.75, or circle-0.25 on the dial.
    const members = [{ body: "A", lon: 0 }, { body: "B", lon: 0.25 }, { body: "C", lon: 0.5 }];
    const match = (d: number, contactOrb?: number) => findPlanetaryPictures(
      [...members, { body: "D", lon: d }], circle, contactOrb === undefined ? {} : { contactOrb }
    ).pictures.find(({ left, right }) => left[0] === "A" && left[1] === "B" && right[0] === "C");
    expect(match(circle - 0.25, 0)?.orb).toBe(0);
    // Projected target 0.25 is half a degree across the seam from -0.25.
    expect(match(circle + 0.25, 0.5)?.orb).toBe(0.5);
    expect(match(circle + 0.25, 0.5 - 2 ** -20)).toBeUndefined();
    expect(match(circle + 0.25 + 2 ** -20, 0.5)).toBeUndefined();
    expect(match(circle + 0.25 - 2 ** -20, 0.5)?.orb).toBe(0.5 - 2 ** -20);
    // Target 0.75 is exactly one degree from -0.25: the unscaled default.
    expect(match(circle + 0.75)?.orb).toBe(1);
    expect(match(circle + 0.75 + 2 ** -20)).toBeUndefined();
    expect(match(circle / 2 - 0.25, circle / 2)?.orb).toBe(circle / 2);
    expect(match(circle / 2 - 0.25, circle / 2 - 2 ** -20)).toBeUndefined();
  });

  it("keeps circle-dependent pair-sum relations distinct", () => {
    // AB-CD=0+10-20-35=-45. AB-CD=0+10-20-12.5=-22.5.
    const relation = (d: number) => DIAL_CIRCLES.map((circle) => findPlanetaryPictures([
      { body: "A", lon: 0 }, { body: "B", lon: 10 }, { body: "C", lon: 20 }, { body: "D", lon: d }
    ], circle, { contactOrb: 0 }).pictures.some(({ left }) => left[0] === "A" && left[1] === "B"));
    expect(relation(35)).toEqual([false, true, true]);
    expect(relation(12.5)).toEqual([false, false, true]);
  });

  it("deduplicates equivalent target orientations and sorts ties by structured labels", () => {
    // All four points coincide on a 90 dial. Four choose two, divided by
    // side exchange, yields the three disjoint pair partitions below.
    const points = ["A", "B", "C", "D"].map((body, i) => ({ body, lon: i * 90 }));
    const result = findPlanetaryPictures(points, 90, { contactOrb: 0 });
    expect(result.pictures.map(({ left, right, orb }) => ({ left, right, orb }))).toEqual([
      { left: ["A", "B"], right: ["C", "D"], orb: 0 },
      { left: ["A", "C"], right: ["B", "D"], orb: 0 },
      { left: ["A", "D"], right: ["B", "C"], orb: 0 }
    ]);
    const reversed = findPlanetaryPictures([...points].reverse(), 90, { contactOrb: 0 });
    expect(reversed.sensitivePoints).toEqual(result.sensitivePoints);
    expect(reversed.pictures).toEqual(result.pictures);
    expect(reversed.dial.points.map(({ body }) => body)).toEqual(["D", "C", "B", "A"]);
    // Adding the same exact 89.75 to each longitude adds 89.75 to each
    // A+B-C point and target, leaving every pair relation unchanged.
    expect(findPlanetaryPictures(points.map((point) => ({ ...point, lon: point.lon + 89.75 })), 90,
      { contactOrb: 0 }).pictures.map(({ left, right, orb }) => ({ left, right, orb })))
      .toEqual(result.pictures.map(({ left, right, orb }) => ({ left, right, orb })));
  });

  it("orders unequal orbs ahead of lexical ties", () => {
    // AB-CD=-92 -> 2; AC-BD=-32 -> 32; AD-BC=12 -> 12 on 90.
    const result = findPlanetaryPictures([
      { body: "A", lon: 0 }, { body: "B", lon: 10 }, { body: "C", lon: 40 }, { body: "D", lon: 62 }
    ], 90, { contactOrb: 45 });
    expect(result.pictures.map(({ left, orb }) => ({ left, orb }))).toEqual([
      { left: ["A", "B"], orb: 2 }, { left: ["A", "D"], orb: 12 }, { left: ["A", "C"], orb: 32 }
    ]);
  });
});

describe("repeated picture members", () => {
  it("defaults to four distinct labels and permits three-label doubles explicitly", () => {
    // A+B=0+20=2*10=C+C. This is excluded by the default distinct rule.
    const points = [{ body: "A", lon: 0 }, { body: "B", lon: 20 }, { body: "C", lon: 10 }];
    expect(findPlanetaryPictures(points, 90, { contactOrb: 0 }).pictures).toEqual([]);
    const result = findPlanetaryPictures(points, 90, { repeatedMembers: "doubled", contactOrb: 0 });
    expect(result.pictures).toMatchObject([{
      left: ["A", "B"], right: ["C", "C"], sensitivePoint: { a: "A", b: "B", c: "C", sourceLon: 10 },
      target: { body: "C", sourceLon: 10 }, orb: 0
    }]);
    // 2*A=2*10=B+C=0+20, with the doubled side canonical on the left.
    expect(findPlanetaryPictures([
      { body: "A", lon: 10 }, { body: "B", lon: 0 }, { body: "C", lon: 20 }
    ], 90, { repeatedMembers: "doubled", contactOrb: 0 }).pictures)
      .toMatchObject([{ left: ["A", "A"], right: ["B", "C"], sensitivePoint: { sourceLon: 20 }, orb: 0 }]);
  });

  it("permits both sides doubled and never cancels shared labels", () => {
    // 2*A-2*B=-90, an exact 90-dial relation despite A and B being 45 apart.
    const result = findPlanetaryPictures([{ body: "A", lon: 0 }, { body: "B", lon: 45 }], 90,
      { repeatedMembers: "doubled", contactOrb: 0 });
    expect(result.sensitivePoints).toEqual([
      { a: "A", b: "A", c: "B", sourceLon: 315, lon: 45, sector: 3 },
      { a: "B", b: "B", c: "A", sourceLon: 90, lon: 0, sector: 1 }
    ]);
    expect(result.pictures).toMatchObject([{ left: ["A", "A"], right: ["B", "B"], orb: 0 }]);
    const one = findPlanetaryPictures([{ body: "A", lon: 0 }], 90, { repeatedMembers: "doubled" });
    expect(one.sensitivePoints).toEqual([]);
    expect(one.pictures).toEqual([]);
    const all = findPlanetaryPictures(fixture, 90, { repeatedMembers: "doubled", contactOrb: 45 });
    expect(all.sensitivePoints.every(({ a, b, c }) => c !== a && c !== b)).toBe(true);
    expect(all.pictures.every(({ left, right }) => right.every((label) => !left.includes(label)))).toBe(true);
    expect(new Set(all.pictures.map(({ left, right }) => JSON.stringify([left, right]))).size)
      .toBe(all.pictures.length);
  });
});

describe("picture contracts and validation", () => {
  it("uses structured identity for arbitrary labels and normalizes negative zero", () => {
    const result = findPlanetaryPictures(["A", "A+B", "B+C", "C"].map((body) => ({ body, lon: -0 })),
      90, { contactOrb: -0 });
    expect(result.pictures.map(({ left, right }) => [left, right])).toEqual([
      [["A", "A+B"], ["B+C", "C"]], [["A", "B+C"], ["A+B", "C"]], [["A", "C"], ["A+B", "B+C"]]
    ]);
    expect(result.sensitivePoints.every(({ sourceLon, lon }) => !Object.is(sourceLon, -0) && !Object.is(lon, -0)))
      .toBe(true);
    expect(Object.is(result.dial.contactOrb, -0)).toBe(false);
    expect(findPlanetaryPictures(["a", "A", "B", "b"].map((body) => ({ body, lon: 0 })))
      .pictures[0]!.left).toEqual(["A", "B"]);
  });

  it("freezes snapshots without copying speed, latitude or aspect claims", () => {
    const input = fixture.map((point) => ({ ...point, speed: null, lat: 12 }));
    const options: { contactOrb: number; repeatedMembers: "distinct" | "doubled" } = {
      contactOrb: 0, repeatedMembers: "distinct"
    };
    const result = findPlanetaryPictures(input, 90, options);
    input[0]!.lon = 0;
    options.contactOrb = 45;
    options.repeatedMembers = "doubled";
    expect(result.dial.points[0]!.sourceLon).toBe(350);
    expect(result.dial.contactOrb).toBe(0);
    expect(result.repeatedMembers).toBe("distinct");
    expect(Object.hasOwn(result.sensitivePoints[0]!, "speed")).toBe(false);
    expect(Object.hasOwn(result.sensitivePoints[0]!, "lat")).toBe(false);
    for (const object of [result, result.dial, result.dial.points, ...result.dial.points,
      result.sensitivePoints, ...result.sensitivePoints, result.pictures, ...result.pictures,
      ...result.pictures.flatMap(({ left, right }) => [left, right])]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
  });

  it("preserves a cast source receipt separately from picture analysis", () => {
    // Invented birth. This tests integration and receipt scope, not accuracy.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 },
      { includeAngles: true, includeChartPoints: true });
    const before = serializeNatalEnvelope(source.envelope);
    const result = { source, pictures: findPlanetaryPictures(source.points, 22.5) };
    expect(result.source).toBe(source);
    expect(serializeNatalEnvelope(result.source.envelope)).toBe(before);
    expect(result.pictures.dial.points.map(({ body }) => body)).toEqual(source.points.map(({ body }) => body));
    expect(Object.hasOwn(result.pictures, "receipt")).toBe(false);
    expect(Object.hasOwn(result.pictures, "envelope")).toBe(false);
  });

  it.each([null, [], "options", { repeatedMembers: null }, { repeatedMembers: true },
    { repeatedMembers: "all" }, { extra: 1 }, { contactOrb: null }, { contactOrb: "1" },
    { contactOrb: -1 }, { contactOrb: Infinity }, { contactOrb: NaN }, { [Symbol("option")]: 1 }])
  ("rejects invalid or unsupported options %s", (options) => {
    expect(() => findPlanetaryPictures(fixture, 90, options as PlanetaryPictureOptions)).toThrow(RangeError);
  });

  it.each(DIAL_CIRCLES)("rejects an orb above half the %s circle", (circle) => {
    expect(() => findPlanetaryPictures(fixture, circle, { contactOrb: circle / 2 + 2 ** -20 })).toThrow(RangeError);
  });

  it.each([0, 22, 360, NaN, Infinity, null, "90"])("rejects unsupported circle %s", (circle) => {
    expect(() => findPlanetaryPictures(fixture, circle as DialCircle)).toThrow(RangeError);
  });

  it("reuses longitude-point validation including sparse arrays and duplicate names", () => {
    for (const input of [[], null, {}, new Array(1), [null], [{ body: " A", lon: 0 }],
      [{ body: "A", lon: NaN }], [{ body: "A", lon: 0 }, { body: "A", lon: 90 }]]) {
      expect(() => findPlanetaryPictures(input as readonly LongitudePoint[])).toThrow(RangeError);
    }
  });
});
