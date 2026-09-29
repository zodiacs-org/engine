/*
 * The synthetic corpus of the parity check between @zodiacs/engine/techniques
 * and the Zodiacs.org site code it was ported from
 * (docs/evidence/techniques-2026-09-29/). Every input is drawn from a seeded
 * generator: mulberry32, seeded by the 32-bit FNV-1a hash of
 * "techniques-2026-09-29:<corpus name>". Births are invented instants and
 * places. Nothing here reads the host's clock, time zone data or ephemeris,
 * so every host generates the same corpus.
 *
 * The site's outputs on this corpus are generated once by
 * docs/evidence/techniques-2026-09-29/site-parity.mjs and committed under
 * src/techniques/fixtures/; src/techniques/site-parity.test.ts compares the
 * package with them.
 */

import { createHash } from "node:crypto";

export const SEED_TEXT = "techniques-2026-09-29";

const DAY = 86_400_000;

/** 32-bit FNV-1a of a string's UTF-16 code units. */
export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** mulberry32: uniform doubles in [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stream(name) {
  const next = mulberry32(fnv1a(`${SEED_TEXT}:${name}`));
  const uniform = (low, high) => low + (high - low) * next();
  const integer = (low, high) => Math.floor(uniform(low, high + 1));
  const pick = (list) => list[integer(0, list.length - 1)];
  const shuffle = (list) => {
    const out = [...list];
    for (let index = out.length - 1; index > 0; index -= 1) {
      const other = integer(0, index);
      [out[index], out[other]] = [out[other], out[index]];
    }
    return out;
  };
  /** A whole millisecond in [low, high). */
  const instant = (low, high) => Math.floor(uniform(low, high));
  return { next, uniform, integer, pick, shuffle, instant };
}

const utc = (text) => Date.parse(text);

export const BODIES = Object.freeze([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"
]);
export const PATTERN_BODIES = Object.freeze(BODIES.slice(0, 10));
export const SIGNS = Object.freeze([
  "aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"
]);

/** The 40 zones of the Moon-sign corpora: extreme offsets, half and quarter hours, and changes at midnight. */
export const ZONES = Object.freeze([
  "UTC", "Etc/GMT+12", "Etc/GMT-14", "Pacific/Kiritimati", "Pacific/Pago_Pago", "Pacific/Apia", "Pacific/Auckland",
  "Pacific/Chatham", "Pacific/Honolulu", "America/Anchorage", "America/Los_Angeles", "America/Denver", "America/Chicago",
  "America/New_York", "America/Havana", "America/Santiago", "America/Asuncion", "America/Sao_Paulo", "America/St_Johns",
  "America/Caracas", "Atlantic/Azores", "Europe/London", "Europe/Dublin", "Europe/Paris", "Europe/Stockholm",
  "Europe/Moscow", "Africa/Cairo", "Africa/Casablanca", "Africa/Lagos", "Asia/Beirut", "Asia/Jerusalem", "Asia/Tehran",
  "Asia/Kolkata", "Asia/Kathmandu", "Asia/Shanghai", "Asia/Tokyo", "Asia/Manila", "Australia/Adelaide",
  "Australia/Lord_Howe", "America/Juneau"
]);

/**
 * Local dates on which the zone's offset changes at midnight (a skipped or
 * repeated 00:00, per tzdata 2025c), each taken with the day before and the
 * day after. Pacific/Apia skipped 2011-12-30 altogether.
 */
export const MIDNIGHT_CHANGES = Object.freeze([
  ["America/Santiago", "2022-09-11"], ["America/Havana", "2023-03-12"], ["Asia/Beirut", "2023-03-26"],
  ["America/Asuncion", "2023-10-01"], ["Africa/Cairo", "2023-04-28"], ["Asia/Tehran", "2021-03-22"],
  ["America/Sao_Paulo", "2018-11-04"], ["Pacific/Apia", "2011-12-30"], ["Asia/Beirut", "2023-10-29"],
  ["America/Havana", "2023-11-05"], ["America/Santiago", "2023-04-02"], ["Asia/Tehran", "2021-09-22"],
  ["America/Asuncion", "2023-03-26"], ["Africa/Cairo", "2023-10-27"]
]);

const isoDate = (milliseconds) => new Date(milliseconds).toISOString().slice(0, 10);
const shiftDate = (date, days) => isoDate(Date.parse(`${date}T00:00:00Z`) + days * DAY);

const Y1850 = utc("1850-01-01T00:00:00Z");
const Y2150 = utc("2150-01-01T00:00:00Z");
const Y1801 = utc("1801-01-01T00:00:00Z");
const Y2199 = utc("2199-01-01T00:00:00Z");
const LUNAR_AFTER_MIN = utc("1800-01-02T00:00:00.000Z");
const LUNAR_AFTER_MAX = utc("2199-11-21T23:59:59.999Z");

function place(random) {
  return { latitude: random.uniform(-66, 66), longitude: random.uniform(-180, 180) };
}

/** R-SI, R-SM, R-SC, R-LI, R-LC and R-E. Longitudes are the engine's at `birth`, computed by the caller. */
export function returnsCorpus() {
  const si = stream("R-SI");
  const sm = stream("R-SM");
  const sc = stream("R-SC");
  const li = stream("R-LI");
  const lc = stream("R-LC");
  const edge = stream("R-E");
  const houses = ["whole", "placidus"];
  return {
    RSI: Array.from({ length: 300 }, () => ({ birth: si.instant(Y1850, Y2150), near: si.instant(Y1801, Y2199) })),
    RSM: Array.from({ length: 300 }, () => ({ birth: sm.instant(Y1850, Y2150), at: sm.instant(Y1801, Y2199) })),
    RSC: Array.from({ length: 60 }, (_, index) => {
      const birth = sc.instant(Y1850, Y2150);
      const natal = place(sc);
      const cast = [null, "natal", place(sc)][index % 3];
      return {
        birth,
        ...natal,
        houseSystem: houses[index % 2],
        near: sc.instant(Y1801, Y2199),
        cast,
        selection: Math.floor(index / 2) % 2 === 0 ? "nearest" : "most-recent"
      };
    }),
    RLI: Array.from({ length: 300 }, () => ({
      birth: li.instant(Y1850, Y2150),
      after: li.instant(LUNAR_AFTER_MIN, LUNAR_AFTER_MAX + 1)
    })),
    RLC: Array.from({ length: 60 }, (_, index) => {
      const birth = lc.instant(Y1850, Y2150);
      const natal = place(lc);
      return {
        birth,
        ...natal,
        houseSystem: houses[index % 2],
        after: lc.instant(birth, LUNAR_AFTER_MAX + 1),
        cast: index % 2 === 0 ? "natal" : place(lc)
      };
    }),
    RE: [
      ...Array.from({ length: 10 }, (_, index) => ({
        fn: "solarReturnInstant",
        birth: edge.instant(Y1850, Y2150),
        date: index < 5
          ? edge.instant(utc("1799-06-15T00:00:00Z"), utc("1800-07-20T00:00:00Z"))
          : edge.instant(utc("2199-06-15T00:00:00Z"), utc("2200-07-20T00:00:00Z"))
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        fn: "mostRecentSolarReturnInstant",
        birth: edge.instant(Y1850, Y2150),
        date: index < 5
          ? edge.instant(utc("1800-01-01T00:00:00Z"), utc("1801-01-06T00:00:00Z"))
          : edge.instant(utc("2199-12-01T00:00:00Z"), utc("2200-12-31T00:00:00Z"))
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        fn: "lunarReturnInstant",
        birth: edge.instant(Y1850, Y2150),
        date: index < 5
          ? edge.instant(utc("1799-12-01T00:00:00Z"), LUNAR_AFTER_MIN)
          : edge.instant(LUNAR_AFTER_MAX + 1, utc("2200-01-31T00:00:00Z"))
      })),
      ...Array.from({ length: 10 }, (_, index) => ({
        fn: "lunarReturnChart",
        birth: edge.instant(Y1850, Y2150),
        ...place(edge),
        date: index < 5
          ? edge.instant(utc("1799-12-01T00:00:00Z"), LUNAR_AFTER_MIN)
          : edge.instant(LUNAR_AFTER_MAX + 1, utc("2200-01-31T00:00:00Z"))
      }))
    ]
  };
}

/** C-M: pairs of body lists; C-A is computed from the C-M results. */
export function compositeCorpus() {
  const random = stream("C-M");
  return Array.from({ length: 400 }, () => {
    const a = random.shuffle(BODIES).slice(0, random.integer(1, 12)).map((body) => ({ body, lon: random.uniform(0, 360) }));
    const b = random.shuffle(BODIES).slice(0, random.integer(1, 12)).map((body) => {
      const own = a.find((point) => point.body === body);
      const roll = random.next();
      if (own && roll < 0.1) return { body, lon: own.lon };
      if (own && roll < 0.2) return { body, lon: (own.lon + 180) % 360 };
      if (own && roll < 0.25) return { body, lon: (own.lon + 180 + (random.next() < 0.5 ? -1e-9 : 1e-9)) % 360 };
      return { body, lon: random.uniform(0, 360) };
    });
    return { a, b };
  });
}

/** V-W and V-S. */
export function voidCorpus() {
  const windows = stream("V-W");
  const status = stream("V-S");
  return {
    VW: Array.from({ length: 20 }, (_, index) => {
      const from = windows.instant(Y1801, Y2199);
      return { from, to: from + 10 * DAY, bodies: index < 10 ? "modern" : "traditional" };
    }),
    VS: Array.from({ length: 40 }, (_, index) => ({
      at: status.instant(Y1801, Y2199),
      bodies: index < 20 ? "modern" : "traditional"
    }))
  };
}

/**
 * P-D: 600 point sets with the aspect records the site's own tests build
 * (every pair that `matchAspect` admits), in a shuffled order with some
 * records reversed or repeated in reverse, and 30 malformed inputs.
 * `matchAspect(aBody, aLon, bBody, bLon)` returns `{ type, orb }` or null.
 */
export function patternCorpus(matchAspect) {
  const random = stream("P-D");
  const edgesOf = (points) =>
    points.flatMap((a, index) =>
      points.slice(index + 1).flatMap((b) => {
        const match = matchAspect(a.body, a.lon, b.body, b.lon);
        return match ? [{ a: a.body, b: b.body, type: match.type, orb: match.orb }] : [];
      })
    );
  const cases = [];
  for (let index = 0; index < 600; index += 1) {
    const count = random.integer(3, 10);
    const bodies = random.shuffle(PATTERN_BODIES).slice(0, count);
    const base = random.uniform(0, 360);
    const points = bodies.map((body) => ({
      body,
      lon: base + 30 * random.integer(0, 11) + random.uniform(-9, 9) * (random.next() < 0.3 ? 0 : 1)
    }));
    if (random.next() < 0.15) points.push({ body: random.pick(["North Node", "South Node", "ASC", "MC"]), lon: random.uniform(0, 360) });
    let edges = edgesOf(points);
    if (random.next() < 0.5) edges = random.shuffle(edges);
    edges = edges.map((edge, position) =>
      random.next() < 0.3 ? { a: edge.b, b: edge.a, type: edge.type, orb: edge.orb, sourceId: `record-${position}` } : edge
    );
    if (edges.length > 0 && random.next() < 0.2) {
      const first = edges[0];
      edges.push({ a: first.b, b: first.a, type: first.type, orb: first.orb, sourceId: "repeat" });
    }
    cases.push({ points, edges });
  }
  // Malformed inputs: the site answers each with `unavailable`.
  const good = [{ body: "Mercury", lon: 0 }, { body: "Venus", lon: 120 }, { body: "Mars", lon: 240 }];
  const goodEdges = edgesOf(good);
  const malformed = [
    { points: [...good, good[0]], edges: goodEdges },
    { points: [{ body: "Mercury", lon: Number.NaN }, good[1]], edges: [] },
    { points: [{ body: "Mercury", lon: Number.POSITIVE_INFINITY }, good[1]], edges: [] },
    { points: [{ body: "", lon: 10 }, good[1]], edges: [] },
    { points: [], edges: [] },
    { points: [{ body: "ASC", lon: 0 }, { body: "North Node", lon: 90 }], edges: [] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], orb: Number.NaN }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], orb: -1 }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], type: "quincunx" }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], type: "square" }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], b: "Sun" }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], b: goodEdges[0].a }] },
    { points: good, edges: [...goodEdges, { ...goodEdges[0], orb: goodEdges[0].orb + 1e-6 }] },
    { points: good, edges: [goodEdges[0], { ...goodEdges[0], orb: goodEdges[0].orb + 1e-12 }] }
  ];
  for (let index = malformed.length; index < 30; index += 1) {
    const points = random.shuffle(PATTERN_BODIES).slice(0, 4).map((body) => ({ body, lon: random.uniform(0, 360) }));
    const edges = edgesOf(points);
    const kind = index % 4;
    if (kind === 0) points.push({ ...points[0] });
    else if (kind === 1) edges.push({ a: points[0].body, b: points[1].body, type: "trine", orb: 99 });
    else if (kind === 2) edges.push({ a: "Chiron", b: points[1].body, type: "trine", orb: 0 });
    else edges.push({ a: points[0].body, b: "Sun", type: "opposition", orb: 0 });
    malformed.push({ points, edges });
  }
  return [...cases, ...malformed];
}

/** The first 32 hex digits of the SHA-256 of a value's JSON: how the larger outputs are compared. */
export function digest32(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

/** A composite result as the parity compares it: points, then aspects. */
export function compositeProjection(points, aspects) {
  return {
    points: points.map((point) => [point.body, point.lon]),
    aspects: aspects.map((aspect) => [aspect.a, aspect.b, aspect.type, aspect.orb])
  };
}

/** A pattern detection as the parity compares it, field by field in a fixed order. */
export function patternProjection(points, patterns) {
  return {
    points: points.map((point) => [point.body, point.lon]),
    patterns: patterns.map((pattern) => [
      pattern.id,
      pattern.kind,
      [...pattern.members],
      pattern.edges.map((edge) => [edge.a, edge.b, edge.type, edge.orb, edge.limit, edge.key, [...edge.sourceIds]]),
      pattern.oppositions.map((pair) => [...pair]),
      pattern.apex ?? null,
      pattern.triangle ? [...pattern.triangle] : null,
      pattern.axisVertex ?? null,
      pattern.opposedVertex ?? null
    ])
  };
}

/** Pattern containment as the parity compares it: the roots, then each pattern's included patterns, by id. */
export function containmentProjection(containment) {
  return {
    roots: containment.roots.map((pattern) => pattern.id),
    included: Object.entries(containment.included).map(([id, list]) => [id, list.map((pattern) => pattern.id)])
  };
}

/**
 * The parts of a return chart the parity compares, read from the site's chart
 * shape or the package's: the input, the bodies, angles, cusps, aspects,
 * flags and ΔT. Its JSON is hashed on both sides.
 */
export function chartProjection(chart) {
  const input = chart.input;
  return {
    utc: input.utc.getTime(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    houseSystem: input.houseSystem,
    timeKnown: input.timeKnown,
    bodies: chart.bodies.map((row) => [row.body, row.lon, row.lat, row.speed, row.retrograde]),
    angles: chart.angles && [chart.angles.asc, chart.angles.mc, chart.angles.dsc, chart.angles.ic],
    houses: chart.houses && [chart.houses.system, ...chart.houses.cusps],
    aspects: chart.aspects.map((row) => [row.a, row.b, row.type, row.orb, row.applying]),
    flags: [...chart.flags],
    deltaT: chart.deltaT ? chart.deltaT.seconds : null
  };
}

/** D-X: every body and every sign. */
export function dignityCorpus() {
  return BODIES.flatMap((planet) => SIGNS.map((sign) => ({ planet, sign })));
}

/** M-A, M-Z and M-P. */
export function moonSignCorpus() {
  const all = stream("M-A");
  const zoned = stream("M-Z");
  const early = stream("M-P");
  const day = (random, from, to) => isoDate(Date.parse(`${from}T00:00:00Z`) + random.integer(0, (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) * DAY);
  return {
    MA: Array.from({ length: 3000 }, () => day(all, "1800-01-02", "2199-12-30")),
    MZ: [
      ...Array.from({ length: 1500 }, () => ({ date: day(zoned, "1971-01-01", "2199-12-30"), timeZone: zoned.pick(ZONES) })),
      ...MIDNIGHT_CHANGES.flatMap(([timeZone, date]) => [-1, 0, 1].map((shift) => ({ date: shiftDate(date, shift), timeZone })))
    ],
    MP: Array.from({ length: 500 }, () => ({ date: day(early, "1800-01-02", "1969-12-31"), timeZone: early.pick(ZONES) }))
  };
}
