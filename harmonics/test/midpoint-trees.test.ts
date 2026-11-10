import { afterEach, describe, expect, it, vi } from "vitest";
import * as enginePoints from "../../src/points.js";
import { serializeNatalEnvelope } from "../../src/receipt.js";
import { castChart } from "../src/engine.js";
import { DIAL_CIRCLES, midpointTrees } from "../src/index.js";
import type { DialCircle, DialOptions, LongitudePoint } from "../src/index.js";

// All coordinates are invented. Expectations below follow shorter-arc halving
// and whole-turn subtraction using integers or exact binary fractions.
const fixture = [{ body: "A", lon: 350 }, { body: "B", lon: 30 }, { body: "C", lon: 10 }];

afterEach(() => vi.restoreAllMocks());

describe("midpoint source geometry", () => {
  it.each(DIAL_CIRCLES)("retains both endpoints and lists contacts on the %s dial", (circle) => {
    // A -> B crosses zero by 40 degrees: half is 20, yielding 370 -> 10.
    // A -> C crosses zero by 20: half is 10, yielding 360 -> 0.
    // B -> C goes back 20: half is -10, yielding 20. Opposites add 180.
    const expected = [
      { members: ["A", "B"], endpoints: [10, 190] },
      { members: ["A", "C"], endpoints: [0, 180] },
      { members: ["B", "C"], endpoints: [20, 200] }
    ];
    const result = midpointTrees(fixture, circle, { contactOrb: 0 });
    expect(result.arithmetic).toBe("binary64;inclusive;no-epsilon");
    expect(result.midpoints).toEqual(expected.map(({ members, endpoints }) => ({
      members, antipodal: false, axes: endpoints.map((sourceLon, i) => ({
        kind: i === 0 ? "near" : "opposite", sourceLon,
        lon: sourceLon % circle, sector: Math.floor(sourceLon / circle)
      }))
    })));
    // C equals both AB endpoints on each supported dial. A is 30 degrees
    // from BC on 90, 15 on 45, 7.5 on 22.5; B is equally far from AC.
    expect(result.trees).toEqual([
      { center: result.dial.points[0], contacts: [] },
      { center: result.dial.points[1], contacts: [] },
      { center: result.dial.points[2], contacts: [{
        midpoint: result.midpoints[0], orb: 0,
        axes: result.midpoints[0]!.axes.map((axis) => ({ axis, orb: 0 }))
      }] }
    ]);
    expect(result.trees[2]!.center).toBe(result.dial.points[2]);
    expect(result.trees[2]!.contacts[0]!.midpoint).toBe(result.midpoints[0]);
    expect(result.trees[2]!.contacts[0]!.axes[0]!.axis).toBe(result.midpoints[0]!.axes[0]);
  });

  it("takes midpoints before folding and does not confuse pair sums with midpoint contacts", () => {
    // The zodiac midpoint of 0 and 90 is 45, opposite 225. Both project
    // to 45 on 90, although both source members project to zero.
    const result = midpointTrees([
      { body: "A", lon: 0 }, { body: "B", lon: 90 }, { body: "C", lon: 45 }
    ], 90, { contactOrb: 0 });
    expect(result.midpoints[0]!.axes).toEqual([
      { kind: "near", sourceLon: 45, lon: 45, sector: 0 },
      { kind: "opposite", sourceLon: 225, lon: 45, sector: 2 }
    ]);
    expect(result.trees[2]!.contacts).toMatchObject([{ midpoint: { members: ["A", "B"] }, orb: 0 }]);
    // A+B-2*C=90 at C=0 is a pair-sum relation modulo 90, but AB's
    // endpoints are both 45 dial degrees away, so no zero-orb tree contact.
    expect(midpointTrees([
      { body: "A", lon: 0 }, { body: "B", lon: 90 }, { body: "C", lon: 0 }
    ], 90, { contactOrb: 0 }).trees[2]!.contacts).toEqual([]);
  });

  it("fixes exact-antipode ties by canonical label order and reports nearby untied arcs", () => {
    const points = [{ body: "B", lon: 90 }, { body: "A", lon: 270 }, { body: "C", lon: 0 }];
    const result = midpointTrees(points, 90, { contactOrb: 0 });
    // A first: 270+90=360 -> 0. Reversing the engine arguments would
    // choose 90+90=180. Keeping both endpoints preserves the full axis.
    expect(result.midpoints[0]).toMatchObject({ members: ["A", "B"], antipodal: true,
      axes: [{ kind: "near", sourceLon: 0 }, { kind: "opposite", sourceLon: 180 }] });
    expect(midpointTrees([...points].reverse(), 90, { contactOrb: 0 }).midpoints).toEqual(result.midpoints);
    expect(result.trees[2]!.contacts[0]!.axes).toHaveLength(2);
    const nearTie = (b: number) => midpointTrees([{ body: "A", lon: 270 }, { body: "B", lon: b }])
      .midpoints[0]!;
    // Below 90, the forward arc from 270 is just under 180; above 90,
    // the backward arc is shorter. Halving the perturbation gives 2^-21.
    expect(nearTie(90 - 2 ** -20)).toMatchObject({ antipodal: false,
      axes: [{ sourceLon: 360 - 2 ** -21 }, { sourceLon: 180 - 2 ** -21 }] });
    expect(nearTie(90 + 2 ** -20)).toMatchObject({ antipodal: false,
      axes: [{ sourceLon: 180 + 2 ** -21 }, { sourceLon: 2 ** -21 }] });
  });

  it("delegates each canonical pair to the engine helper once with full normalized sources", () => {
    const spy = vi.spyOn(enginePoints, "midpoint");
    const result = midpointTrees([
      { body: "C", lon: 730 }, { body: "B", lon: -330 }, { body: "A", lon: -10 }
    ]);
    expect(spy.mock.calls).toEqual([[350, 30], [350, 10], [30, 10]]);
    // The multi-turn sources normalize to the fixture's 350, 30 and 10.
    expect(result.midpoints).toEqual(midpointTrees(fixture).midpoints);
    expect(result.trees).toEqual(midpointTrees(fixture).trees);
  });
});

describe("midpoint dial contacts", () => {
  it.each(DIAL_CIRCLES)("includes seam, zero, default and half-circle boundaries on %s", (circle) => {
    // 359.5 -> 0 is a forward half degree. Its midpoint is 359.75,
    // opposite 179.75, both projecting to circle-0.25 on these dials.
    const contact = (center: number, contactOrb?: number) => midpointTrees([
      { body: "A", lon: 359.5 }, { body: "B", lon: 0 }, { body: "C", lon: center }
    ], circle, contactOrb === undefined ? {} : { contactOrb }).trees[2]!.contacts[0];
    expect(contact(circle - 0.25, 0)?.orb).toBe(0);
    expect(contact(0.25, 0.5)?.orb).toBe(0.5);
    expect(contact(0.25, 0.5)?.axes.map(({ orb }) => orb)).toEqual([0.5, 0.5]);
    expect(contact(0.25, 0.5 - 2 ** -20)).toBeUndefined();
    expect(contact(0.25 + 2 ** -20, 0.5)).toBeUndefined();
    expect(contact(0.25 - 2 ** -20, 0.5)?.orb).toBe(0.5 - 2 ** -20);
    expect(contact(0.75)?.orb).toBe(1);
    expect(contact(0.75 + 2 ** -20)).toBeUndefined();
    expect(contact(circle / 2 - 0.25, circle / 2)?.orb).toBe(circle / 2);
    expect(contact(circle / 2 - 0.25, circle / 2 - 2 ** -20)).toBeUndefined();
  });

  it("keeps circle-dependent midpoint contacts distinct", () => {
    const matchingCircles = (b: number) => DIAL_CIRCLES.map((circle) => midpointTrees([
      { body: "A", lon: 0 }, { body: "B", lon: b }, { body: "C", lon: 0 }
    ], circle, { contactOrb: 0 }).trees[2]!.contacts.length > 0);
    // Midpoints at 45 and 22.5 only coincide with C where the dial divides them.
    expect(matchingCircles(90)).toEqual([false, true, true]);
    expect(matchingCircles(45)).toEqual([false, false, true]);
  });

  it("checks both rounded endpoints independently and uses the smaller contacting orb", () => {
    // A=0, B=2^-43: adding B to 360 is exact (two ulps there), so
    // the engine midpoint is 2^-44. Its opposite starts at 180+2^-44,
    // but normalization adds 360: 540+2^-44 is halfway between doubles
    // (ulp 2^-43), rounding to even 540, then reducing to exactly 180.
    // Thus the two dial coordinates are 2^-44 and 0, not identical.
    const analyze = (center: number, contactOrb: number) => midpointTrees([
      { body: "A", lon: 0 }, { body: "B", lon: 2 ** -43 }, { body: "C", lon: center }
    ], 90, { contactOrb });
    const result = analyze(0, 0);
    expect(result.midpoints[0]!.axes).toMatchObject([
      { kind: "near", sourceLon: 2 ** -44, lon: 2 ** -44 },
      { kind: "opposite", sourceLon: 180, lon: 0 }
    ]);
    expect(result.trees[2]!.contacts[0]).toMatchObject({ orb: 0,
      axes: [{ axis: { kind: "opposite" }, orb: 0 }] });
    expect(analyze(2 ** -44, 0).trees[2]!.contacts[0]).toMatchObject({ orb: 0,
      axes: [{ axis: { kind: "near" }, orb: 0 }] });
    expect(analyze(0, 2 ** -44).trees[2]!.contacts[0]).toMatchObject({ orb: 0,
      axes: [{ axis: { kind: "near" }, orb: 2 ** -44 }, { axis: { kind: "opposite" }, orb: 0 }] });
  });

  it("deduplicates reversed pairs and collapsed endpoints while preserving different formulas", () => {
    const points = ["D", "B", "C", "A"].map((body) => ({ body, lon: 0 }));
    const result = midpointTrees(points, 90, { contactOrb: 0 });
    // Four distinct labels give six unordered pairs. For each center the
    // other three labels give three pairs, each with two coincident endpoints.
    expect(result.midpoints.map(({ members }) => members)).toEqual([
      ["A", "B"], ["A", "C"], ["A", "D"], ["B", "C"], ["B", "D"], ["C", "D"]
    ]);
    expect(result.trees.map(({ center, contacts }) => ({
      center: center.body, pairs: contacts.map(({ midpoint }) => midpoint.members)
    }))).toEqual([
      { center: "A", pairs: [["B", "C"], ["B", "D"], ["C", "D"]] },
      { center: "B", pairs: [["A", "C"], ["A", "D"], ["C", "D"]] },
      { center: "C", pairs: [["A", "B"], ["A", "D"], ["B", "D"]] },
      { center: "D", pairs: [["A", "B"], ["A", "C"], ["B", "C"]] }
    ]);
    expect(result.trees.every(({ contacts }) => contacts.every(({ axes }) => axes.length === 2))).toBe(true);
    const reversed = midpointTrees([...points].reverse(), 90, { contactOrb: 0 });
    expect(reversed.midpoints).toEqual(result.midpoints);
    expect(reversed.trees).toEqual(result.trees);
    expect(result.dial.points.map(({ body }) => body)).toEqual(["D", "B", "C", "A"]);
  });

  it("sorts contacts by increasing orb before pair labels and preserves exact rotations", () => {
    const points = [
      { body: "Z", lon: 0 }, { body: "A", lon: 0 }, { body: "B", lon: 20 }, { body: "C", lon: 2 }
    ];
    const listing = (rows: readonly LongitudePoint[]) => midpointTrees(rows, 90, { contactOrb: 45 })
      .trees.find(({ center }) => center.body === "Z")!.contacts
      .map(({ midpoint, orb }) => ({ members: midpoint.members, orb }));
    // AC halves 2 -> 1; AB halves 20 -> 10; BC halves the arc 20 -> 2 at 11.
    const expected = [
      { members: ["A", "C"], orb: 1 }, { members: ["A", "B"], orb: 10 },
      { members: ["B", "C"], orb: 11 }
    ];
    expect(listing(points)).toEqual(expected);
    // Adding 359.75 rotates every endpoint and center across the seam by
    // the same exact amount, so all these binary-fraction distances persist.
    expect(listing(points.map((point) => ({ ...point, lon: point.lon + 359.75 })))).toEqual(expected);
  });
});

describe("midpoint tree contracts", () => {
  it("keeps pair labels structured and preserves empty trees for small selections", () => {
    const result = midpointTrees(["A/B", "C", "A", "B/C"].map((body) => ({ body, lon: -0 })), 90,
      { contactOrb: -0 });
    // [A,B/C] and [A/B,C] would both be rendered A/B/C by naive joining.
    expect(result.midpoints.map(({ members }) => members)).toEqual([
      ["A", "A/B"], ["A", "B/C"], ["A", "C"], ["A/B", "B/C"], ["A/B", "C"], ["B/C", "C"]
    ]);
    expect(result.midpoints.every(({ axes }) => axes.every(({ sourceLon, lon }) =>
      !Object.is(sourceLon, -0) && !Object.is(lon, -0)))).toBe(true);
    expect(Object.is(result.dial.contactOrb, -0)).toBe(false);
    expect(midpointTrees([{ body: "A", lon: 0 }])).toMatchObject({
      midpoints: [], trees: [{ center: { body: "A" }, contacts: [] }]
    });
    expect(midpointTrees(fixture.slice(0, 2)).midpoints).toHaveLength(1);
    expect(midpointTrees(fixture.slice(0, 2)).trees.every(({ contacts }) => contacts.length === 0)).toBe(true);
  });

  it("freezes independent snapshots without copying motion or latitude claims", () => {
    const input = fixture.map((point) => ({ ...point, speed: null, lat: 12 }));
    const options = { contactOrb: 0 };
    const result = midpointTrees(input, 90, options);
    input[0]!.lon = 0;
    options.contactOrb = 45;
    expect(result.dial.points[0]!.sourceLon).toBe(350);
    expect(result.dial.contactOrb).toBe(0);
    expect(result.midpoints[0]!.axes[0].sourceLon).toBe(10);
    expect(Object.keys(result.midpoints[0]!.axes[0]).sort()).toEqual(["kind", "lon", "sector", "sourceLon"]);
    for (const object of [result, result.dial, result.dial.points, ...result.dial.points,
      result.dial.contacts, result.midpoints, ...result.midpoints,
      ...result.midpoints.flatMap(({ members, axes }) => [members, axes, ...axes]),
      result.trees, ...result.trees, ...result.trees.flatMap(({ contacts }) => [contacts, ...contacts]),
      ...result.trees.flatMap(({ contacts }) => contacts.flatMap(({ axes }) => [axes, ...axes]))]) {
      expect(Object.isFrozen(object)).toBe(true);
    }
  });

  it("preserves a cast source receipt alongside the midpoint analysis", () => {
    // Invented birth. This verifies delegation and receipt scope, not accuracy.
    const source = castChart({ utc: "2002-04-06T03:00:00Z", latitude: 12, longitude: 24 },
      { includeAngles: true, includeChartPoints: true });
    const before = serializeNatalEnvelope(source.envelope);
    const result = { source, midpoints: midpointTrees(source.points, 22.5) };
    expect(result.source).toBe(source);
    expect(serializeNatalEnvelope(result.source.envelope)).toBe(before);
    expect(result.midpoints.dial.points.map(({ body }) => body)).toEqual(source.points.map(({ body }) => body));
    expect(Object.hasOwn(result.midpoints, "receipt")).toBe(false);
    expect(Object.hasOwn(result.midpoints, "envelope")).toBe(false);
  });

  it.each([null, [], "options", { extra: 1 }, { repeatedMembers: "doubled" },
    { contactOrb: null }, { contactOrb: "1" }, { contactOrb: -1 }, { contactOrb: NaN },
    { contactOrb: Infinity }, { [Symbol("option")]: 1 }])("rejects invalid options %s", (options) => {
    expect(() => midpointTrees(fixture, 90, options as DialOptions)).toThrow(RangeError);
  });

  it.each(DIAL_CIRCLES)("rejects an orb above half the %s circle", (circle) => {
    expect(() => midpointTrees(fixture, circle, { contactOrb: circle / 2 + 2 ** -20 })).toThrow(RangeError);
  });

  it.each([0, 22, 360, NaN, Infinity, null, "90"])("rejects unsupported circle %s", (circle) => {
    expect(() => midpointTrees(fixture, circle as DialCircle)).toThrow(RangeError);
  });

  it("reuses point validation before calling the midpoint helper", () => {
    const spy = vi.spyOn(enginePoints, "midpoint");
    for (const input of [[], null, {}, new Array(1), [null], [{ body: " A", lon: 0 }],
      [{ body: "A", lon: Infinity }], [{ body: "A", lon: 0 }, { body: "A", lon: 90 }]]) {
      expect(() => midpointTrees(input as readonly LongitudePoint[])).toThrow(RangeError);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
