import { beforeAll, describe, expect, it, vi } from "vitest";
import { Body, GeoVector } from "astronomy-engine";

import { prepareStarSky } from "../node.mjs";
import {
  catalog, pairParanEvents, searchParans, PARAN_ANGLE_EVENTS, PARAN_CONVENTIONS
} from "../src/index.js";
import type {
  CatalogStar, ParanPairing, ParanRequest, SkyBody, SkyEvent, SkyEventKind,
  StarSkyEvents, StarSkySearch
} from "../src/index.js";
import { equatorRows, gastHours, onChartClock, skyEvents, toSpherical, turn } from "../src/engine.js";
import { createStarSkySearch } from "../src/sky.js";

const observer = { latitude: 0, longitude: 0 };
const centre = { limb: "centre", refraction: "none" } as const;
const from = "2000-03-20T00:00:00Z";
const to = "2000-03-21T00:00:00Z";
const t = Date.parse("2000-03-20T06:00:00Z");
const synthetic: CatalogStar = { ...catalog[0]!, id: "synthetic-star", raDeg: 0, decDeg: 0, properMotion: null };
let sky: StarSkySearch;
beforeAll(async () => { sky = await prepareStarSky(); });

function event(kind: SkyEventKind, at: number): SkyEvent {
  return { kind, at: new Date(at), altitude: 0, azimuth: 90 };
}

// Hand-authored event schedules are arithmetic inputs, never saved solver output.
// The internal factory attaches correctly scoped call records to these fixtures.
function schedules(stars: Record<string, readonly SkyEvent[]>, bodies: Partial<Record<SkyBody, readonly SkyEvent[]>>,
  refused?: { star?: string; body?: SkyBody }, window = { from, to }) {
  function result(body: SkyBody, events: readonly SkyEvent[], refuse: boolean) {
    const base = { body, observer: { ...observer, height: 0 }, from: new Date(window.from), to: new Date(window.to),
      conventions: { ...centre, refractionArcmin: 0 }, flags: [], samples: 0 };
    return refuse ? { ...base, status: "refused" as const, reason: "sample-budget" as const, events: [] as const } :
      { ...base, status: "complete" as const, events };
  }
  const search = createStarSkySearch({
    starEvents: (star) => result("Pluto", stars[star.id] ?? [], star.id === refused?.star),
    bodyEvents: (body) => result(body, bodies[body] ?? [], body === refused?.body)
  }, sky.compatibility);
  return {
    stars: Object.keys(stars).map((id) => search.starEvents({ ...synthetic, id }, observer, window.from, window.to, centre)),
    bodies: (Object.keys(bodies) as SkyBody[]).map((body) => search.bodyEvents(body, observer, window.from, window.to, centre))
  };
}
const pairing = (orbMs: number): ParanPairing => ({ observer, from, to, orbMs });

describe("pure paran event arithmetic", () => {
  it("includes the boundary, reports signed offsets and pairs different angular phases", () => {
    const input = schedules({ "synthetic-star": [event("rise", t), event("upper-transit", t + 1000)] },
      { Sun: [event("set", t + 500), event("lower-transit", t + 2000)] });
    const result = pairParanEvents(input.stars, input.bodies, pairing(500));
    expect(result.status).toBe("complete");
    expect(result.hits.map(({ starEvent, targetEvent, offsetMs, orbMs }) => ({ starEvent, targetEvent, offsetMs, orbMs })))
      .toEqual([
        { starEvent: "rise", targetEvent: "set", offsetMs: -500, orbMs: 500 },
        { starEvent: "upper-transit", targetEvent: "set", offsetMs: 500, orbMs: 500 }
      ]);
    for (const hit of result.hits) {
      expect(hit.kind).toBe("paran");
      expect(hit.starId).toBe("synthetic-star");
      expect(hit.targetId).toBe("Sun");
      expect(hit.targetKind).toBe("body");
      expect(hit.maximumOrbMs).toBe(500);
      expect(hit.provenance).toEqual({ starSearch: 0, bodySearch: 0 });
    }
    expect(pairParanEvents(input.stars, input.bodies, pairing(499.99999999999994)).hits).toEqual([]);
    expect(pairParanEvents(input.stars, input.bodies, pairing(0)).hits).toEqual([]);
    expect(result.conventions).toBe(PARAN_CONVENTIONS);
  });

  it("requires identical whole event milliseconds at zero orb, with no midnight or daily folding", () => {
    const input = schedules({ "synthetic-star": [event("rise", t), event("set", t + 1)] },
      { Sun: [event("upper-transit", t)] });
    expect(pairParanEvents(input.stars, input.bodies, pairing(0)).hits.map(({ starEvent, orbMs, offsetMs }) =>
      [starEvent, orbMs, offsetMs])).toEqual([["rise", 0, 0]]);
    const midnight = schedules({ "synthetic-star": [event("set", Date.parse(to) - 1)] },
      { Sun: [event("rise", Date.parse(from))] });
    expect(pairParanEvents(midnight.stars, midnight.bodies, pairing(1)).hits).toEqual([]);
  });

  it("maps every named angle to its corresponding event at an explicit reference instant", () => {
    const input = schedules({ "synthetic-star": Object.values(PARAN_ANGLE_EVENTS).map((kind) => event(kind, t)) }, {});
    const angles = (Object.keys(PARAN_ANGLE_EVENTS) as (keyof typeof PARAN_ANGLE_EVENTS)[]).map((angle) => ({ angle, at: t }));
    const result = pairParanEvents(input.stars, input.bodies, { ...pairing(0), angles });
    expect(result.hits.map(({ targetId, starEvent, targetEvent }) => [targetId, starEvent, targetEvent])).toEqual([
      ["Ascendant", "rise", "rise"], ["Descendant", "set", "set"], ["Imum Coeli", "lower-transit", "lower-transit"],
      ["Midheaven", "upper-transit", "upper-transit"]
    ]);
    for (const hit of result.hits) {
      expect(hit.targetKind).toBe("angle");
      expect(hit.targetAt).toBe(new Date(t).toISOString());
      expect(hit.provenance.bodySearch).toBeNull();
    }
    expect(pairParanEvents(input.stars, [], { ...pairing(1), angles: [
      { angle: "Ascendant", at: t + 1 }, { angle: "Ascendant", at: t + 2 }
    ] }).hits.map(({ offsetMs }) => offsetMs)).toEqual([-1]);
  });

  it("retains all eligible pairs and produces deterministic ordering and provenance indices", () => {
    const input = schedules({ z: [event("rise", t + 1)], A: [event("set", t), event("rise", t)] },
      { Sun: [event("rise", t)], Moon: [event("set", t)] });
    const result = pairParanEvents(input.stars, input.bodies, pairing(1));
    const reordered = pairParanEvents([...input.stars].reverse(), [...input.bodies].reverse(), pairing(1));
    expect(reordered.hits).toEqual(result.hits);
    expect(result.hits.map(({ starId, targetId, starEvent, orbMs }) => [starId, targetId, starEvent, orbMs])).toEqual([
      ["A", "Moon", "rise", 0], ["A", "Moon", "set", 0], ["A", "Sun", "rise", 0],
      ["A", "Sun", "set", 0], ["z", "Moon", "rise", 1], ["z", "Sun", "rise", 1]
    ]);
    for (const hit of result.hits) {
      expect(result.stars[hit.provenance.starSearch]!.starId).toBe(hit.starId);
      expect(result.bodies[hit.provenance.bodySearch!]!.sky.body).toBe(hit.targetId);
    }
    expect(result.stars[0]).toBe(input.stars[1]);
    expect(result.bodies[0]).toBe(input.bodies[1]);
  });

  it("keeps hits and reference anchors immutable without freezing caller Dates or arrays", () => {
    const nativeEvent = event("rise", t);
    const input = schedules({ "synthetic-star": [nativeEvent] }, { Sun: [event("set", t)] });
    const at = new Date(t);
    const angles = [{ angle: "Ascendant" as const, at }];
    const request = { ...pairing(0), angles };
    const result = pairParanEvents(input.stars, input.bodies, request);
    const encoded = JSON.stringify({ hits: result.hits, angles: result.angles });
    for (const value of [result, result.hits, result.hits[0], result.hits[0]!.provenance,
      result.stars, result.bodies, result.angles, result.angles[0]]) expect(Object.isFrozen(value)).toBe(true);
    for (const value of [input.stars, input.bodies, at, angles, request]) expect(Object.isFrozen(value)).toBe(false);
    at.setTime(0);
    nativeEvent.at.setTime(0);
    expect(JSON.stringify({ hits: result.hits, angles: result.angles })).toBe(encoded);
    expect(result.stars[0]!.provenance.response.events[0]!.at).toBe(new Date(t).toISOString());
    expect(() => pairParanEvents(input.stars, input.bodies, pairing(0))).toThrow(RangeError);
  });

  it.each(["star", "body"] as const)("refuses the whole answer when any %s search refused", (kind) => {
    const input = schedules({ a: [event("rise", t)], b: [event("rise", t)] },
      { Sun: [event("set", t)], Moon: [event("rise", t)] }, kind === "star" ? { star: "b" } : { body: "Moon" });
    const result = pairParanEvents(input.stars, input.bodies, { ...pairing(0), angles: [{ angle: "Ascendant", at: t }] });
    expect(result.status).toBe("refused");
    if (result.status !== "refused") throw new Error("Expected refusal");
    expect(result.reason).toBe("sample-budget");
    expect(result.hits).toEqual([]);
    expect(result.stars).toHaveLength(2);
    expect(result.bodies).toHaveLength(2);
    expect(result.angles).toHaveLength(1);
  });

  it("handles empty selections, empty complete windows and window-local horizon flags", () => {
    expect(pairParanEvents([], [], pairing(0))).toMatchObject({ status: "complete", hits: [], stars: [], bodies: [] });
    const input = schedules({ "synthetic-star": [] }, { Sun: [] });
    const flagged = { ...input.stars[0]!, flags: ["never-sets" as const] };
    const result = pairParanEvents([flagged], input.bodies, pairing(1000));
    expect(result.hits).toEqual([]);
    expect(result.stars[0]!.flags).toEqual(["never-sets"]);
  });

  it("admits the from endpoint and refuses to extend the search window by the orb", () => {
    const firstMs = Date.parse(from);
    const lastMs = Date.parse(to) - 1;
    const input = schedules({ "synthetic-star": [event("rise", firstMs), event("set", lastMs)] },
      { Sun: [event("rise", firstMs + 1), event("set", lastMs - 1)] });
    const result = pairParanEvents(input.stars, input.bodies, pairing(1));
    expect(result.hits.map(({ orbMs }) => orbMs)).toEqual([1, 1]);
    const outside = schedules({ "synthetic-star": [event("rise", Date.parse(to))] }, {});
    expect(() => pairParanEvents(outside.stars, [], pairing(1000))).toThrow(RangeError);
    expect(() => pairParanEvents(input.stars, input.bodies, {
      ...pairing(1000), angles: [{ angle: "Ascendant", at: Date.parse(to) }]
    })).toThrow(RangeError);
  });

  it("makes exact decisions on integer times beyond subtraction's safe-integer range", () => {
    // Two valid Date integers have an odd separation above 2^53. Ordinary
    // subtraction rounds it downward to 2^53; the lower bound must exclude it.
    const starMs = 8_000_000_000_000_000;
    const bodyMs = -1_007_199_254_740_993;
    expect(BigInt(starMs) - BigInt(bodyMs)).toBe(9_007_199_254_740_993n);
    expect(starMs - bodyMs).toBe(2 ** 53);
    const { stars, bodies } = schedules({ "synthetic-star": [event("rise", starMs)] }, { Sun: [event("rise", bodyMs)] },
      undefined, { from: new Date(bodyMs - 1).toISOString(), to: new Date(starMs + 1).toISOString() });
    const request = { observer, from: bodyMs - 1, to: starMs + 1, orbMs: 2 ** 53 };
    expect(pairParanEvents(stars, bodies, request).hits).toEqual([]);
    expect(pairParanEvents(stars, bodies, { ...request, orbMs: 2 ** 53 + 2 }).hits[0]!.orbMs).toBe(2 ** 53);
  });

  it("rejects mismatched windows, observers, duplicate subjects and invalid event claims", () => {
    const input = schedules({ "synthetic-star": [event("rise", t)] }, { Sun: [event("rise", t)] });
    const star = input.stars[0]!;
    expect(() => pairParanEvents([{ ...star, observer: { ...observer, longitude: 1, height: 0 } }], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([{ ...star, to: new Date(Date.parse(to) + 1) }], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([star, star], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([], [input.bodies[0]!, input.bodies[0]!], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([{ ...star, status: "complete", events: [event("rise", t), event("rise", t)] }], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([{ ...star, status: "complete", events: [event("rise", NaN)] }], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents(new Array(1), [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([{ ...star, status: "refused", reason: "sample-budget", events: star.events } as StarSkyEvents], [], pairing(0))).toThrow(RangeError);
    expect(() => pairParanEvents([{ ...star, starId: "changed-id" }], [], pairing(0))).toThrow(/identity/u);
    star.events[0]!.at.setTime(t + 1);
    expect(() => pairParanEvents([star], input.bodies, pairing(1))).toThrow(/captured call records/u);
  });
});

// At a chosen instant, an equatorial observer's geometric Sun rise has
// cos(H) = rho / projected-vector-length. Choose its longitude accordingly,
// then invert the engine frame to construct a star at H=0 and one at H=180.
// GEOMETRY.md derives this and distinguishes construction from accuracy.
function simultaneousGeometry() {
  return onChartClock(t, "utc", undefined, (time) => {
    const rows = equatorRows(time.tt, "true");
    const g = GeoVector(Body.Sun, time, true);
    const [x, y] = turn(rows, g.x, g.y, g.z);
    const rad = Math.PI / 180;
    const theta = Math.atan2(y, x) - Math.acos((6378.137 / 149597870.7) / Math.hypot(x, y));
    const longitude = ((theta / rad - gastHours(time) * 15 + 540) % 360 + 360) % 360 - 180;
    const stars = [0, 180].map((offset) => {
      const a = theta + offset * rad;
      const c = Math.cos(a), s = Math.sin(a);
      const direction = [rows[0] * c + rows[3] * s, rows[1] * c + rows[4] * s, rows[2] * c + rows[5] * s] as const;
      const position = toSpherical(direction);
      return { ...synthetic, id: `synthetic-transit-${offset}`, raDeg: position.lon, decDeg: position.lat };
    });
    return { observer: { latitude: 0, longitude }, stars };
  });
}

describe("prepared paran search integration", () => {
  it("finds a constructed star upper and lower transit simultaneously with native Sun rise", () => {
    const geometry = simultaneousGeometry();
    const request: ParanRequest = { ...geometry, from: t - 60_000, to: t + 60_000, orbMs: 2, bodies: ["Sun"],
      starOptions: centre, bodyOptions: centre, angles: [{ angle: "Midheaven", at: t }, { angle: "Imum Coeli", at: t }] };
    const result = searchParans(sky, request);
    expect(result.status).toBe("complete");
    expect(result.hits.map(({ starId, targetId, starEvent, targetEvent }) => [starId, targetId, starEvent, targetEvent]).sort()).toEqual([
      ["synthetic-transit-0", "Midheaven", "upper-transit", "upper-transit"],
      ["synthetic-transit-0", "Sun", "upper-transit", "rise"],
      ["synthetic-transit-180", "Imum Coeli", "lower-transit", "lower-transit"],
      ["synthetic-transit-180", "Sun", "lower-transit", "rise"]
    ].sort());
    for (const hit of result.hits) {
      expect(Math.abs(Date.parse(hit.starAt) - t)).toBeLessThanOrEqual(2);
      expect(Math.abs(Date.parse(hit.targetAt) - t)).toBeLessThanOrEqual(2);
      expect(hit.orbMs).toBeLessThanOrEqual(2);
      expect(result.stars[hit.provenance.starSearch]!.provenance.nativeReceipt).toBe(false);
    }
    expect(result.bodies[0]!.sky).toEqual(skyEvents("Sun", geometry.observer, request.from, request.to, centre));
    expect(result.bodies[0]!.provenance.stellarConventions).toBeNull();
  });

  it("searches each selected subject once, preserves native conventions and snapshots input", () => {
    const counted = { ...sky, starEvents: vi.fn(sky.starEvents), bodyEvents: vi.fn(sky.bodyEvents) };
    const inputStar = { ...synthetic };
    const date = new Date(from);
    const request: ParanRequest = { observer: { ...observer }, from: date, to, orbMs: 1000,
      stars: [inputStar, { ...synthetic, id: "other" }], bodies: ["Sun", "Pluto"] };
    const before = structuredClone(request);
    const result = searchParans(counted, request);
    expect(counted.starEvents).toHaveBeenCalledTimes(2);
    expect(counted.bodyEvents).toHaveBeenCalledTimes(2);
    expect(result.bodies.map(({ sky }) => sky.conventions.limb)).toEqual(["centre", "upper"]);
    expect(result.stars.every(({ conventions }) => conventions.limb === "centre")).toBe(true);
    expect(request).toEqual(before);
    expect(Object.isFrozen(request)).toBe(false);
    expect(Object.isFrozen(inputStar)).toBe(false);
    date.setTime(0);
    expect(result.from).toBe(new Date(from).toISOString());
  });

  it("refuses globally for an early or late native star budget failure, retaining completed body output", () => {
    const full = sky.starEvents(synthetic, observer, from, to, centre);
    for (const maxSamples of [1, full.samples - 1]) {
      const result = searchParans(sky, { ...pairing(86_400_000), stars: [synthetic], bodies: ["Sun"],
        starOptions: { ...centre, maxSamples }, bodyOptions: centre });
      expect(result.status).toBe("refused");
      expect(result.hits).toEqual([]);
      expect(result.stars[0]!.status).toBe("refused");
      expect(result.bodies[0]!.sky.status).toBe("complete");
      expect(result.stars[0]!.provenance.response.events).toEqual([]);
    }
    const bodyRefusal = searchParans(sky, { ...pairing(86_400_000), stars: [synthetic], bodies: ["Sun"],
      starOptions: centre, bodyOptions: { ...centre, maxSamples: 1 } });
    expect(bodyRefusal.status).toBe("refused");
    expect(bodyRefusal.hits).toEqual([]);
    expect(bodyRefusal.stars[0]!.status).toBe("complete");
    expect(bodyRefusal.bodies[0]!.sky.status).toBe("refused");
  });

  it("retains circumpolar transits and flags for angle contacts", () => {
    const result = searchParans(sky, { observer: { latitude: 60, longitude: 0 }, from, to, orbMs: 86_400_000,
      stars: [{ ...synthetic, decDeg: 70 }], bodies: [], starOptions: centre,
      angles: [{ angle: "Midheaven", at: t }, { angle: "Ascendant", at: t }] });
    expect(result.status).toBe("complete");
    expect(result.stars[0]!.flags).toEqual(["never-sets"]);
    expect(result.hits.map(({ targetId }) => targetId)).toEqual(["Midheaven"]);
  });

  it("defaults to the catalog and validates explicit empty selections", () => {
    const counted = { ...sky, starEvents: vi.fn(sky.starEvents), bodyEvents: vi.fn(sky.bodyEvents) };
    const refused = searchParans(counted, { ...pairing(0), bodies: [], starOptions: { maxSamples: 1 } });
    expect(counted.starEvents).toHaveBeenCalledTimes(catalog.length);
    expect(refused.stars.map(({ starId }) => starId)).toEqual(catalog.map(({ id }) => id).sort());
    expect(refused.status).toBe("refused");
    counted.starEvents.mockClear();
    expect(searchParans(counted, { ...pairing(0), stars: [], bodies: [] }).status).toBe("complete");
    expect(counted.starEvents).not.toHaveBeenCalled();
  });

  it("rejects every invalid selection and policy before any engine call", () => {
    const counted = { ...sky, starEvents: vi.fn(sky.starEvents), bodyEvents: vi.fn(sky.bodyEvents) };
    const request: ParanRequest = { ...pairing(0), stars: [synthetic], bodies: ["Sun"] };
    const invalid: unknown[] = [
      { ...request, orbMs: undefined }, { ...request, orbMs: null }, { ...request, orbMs: Infinity },
      { ...request, orbMs: -1 }, { ...request, orbMs: "1" }, { ...request, orbMs: NaN },
      { ...request, from: to }, { ...request, from: "2000-02-30" },
      { ...request, observer: { ...observer, height: 100001 } },
      { ...request, stars: [synthetic, synthetic] }, { ...request, stars: null }, { ...request, stars: new Array(1) },
      { ...request, stars: [{ ...synthetic, id: " untrimmed" }] },
      { ...request, stars: [{ ...synthetic, properMotion: undefined }] },
      { ...request, bodies: ["Sun", "Sun"] }, { ...request, bodies: ["North Node"] },
      { ...request, bodies: undefined }, { ...request, bodies: new Array(1) },
      { ...request, angles: [{ angle: "Vertex", at: t }] },
      { ...request, angles: [{ angle: "Ascendant", at: t }, { angle: "Ascendant", at: new Date(t) }] },
      { ...request, angles: [{ angle: "Ascendant", at: Date.parse(to) }] },
      { ...request, angles: new Array(1) }, { ...request, angles: null },
      { ...request, starOptions: { limb: "upper" } }, { ...request, bodyOptions: { limb: "bad" } },
      { ...request, bodies: ["Sun", "Pluto"], bodyOptions: { limb: "upper" } },
      { ...request, starOptions: { maxSamples: 0 } }, { ...request, bodyOptions: { refraction: "bad" } },
      { ...request, bodyOptions: { maxSamples: 0.5 } }, { ...request, starOptions: { timeScale: "tt" } },
      { ...request, unknown: true }
    ];
    for (const value of invalid) expect(() => searchParans(counted, value as ParanRequest)).toThrow(RangeError);
    const accessor = Object.defineProperty({ ...request }, "orbMs", { get() { throw new Error("must not run"); } });
    expect(() => searchParans(counted, accessor)).toThrow(/data properties/u);
    expect(counted.starEvents).not.toHaveBeenCalled();
    expect(counted.bodyEvents).not.toHaveBeenCalled();
  });
});
