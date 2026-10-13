import { HOUSE_SYSTEMS } from "../../src/index.js";
import { CALC_RECEIPT_SCHEMA } from "../../src/calc.js";
import { NATAL_ENVELOPE_SCHEMA, NATAL_RECEIPT_SCHEMA } from "../../src/receipt.js";

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Schema): Schema => ({ type: "array", items });
const nullable = (schema: Schema): Schema => ({ anyOf: [schema, { type: "null" }] });
const object = (properties: Record<string, Schema>, required = Object.keys(properties)): Schema => ({
  type: "object", additionalProperties: false, required, properties
});
const text: Schema = { type: "string" };
const number: Schema = { type: "number" };
const boolean: Schema = { type: "boolean" };
const count: Schema = { type: "integer", minimum: 0 };
const names = (values: readonly string[]): Schema => ({ type: "string", enum: [...values] });
const houseSystem = names(HOUSE_SYSTEMS);
const scale = names(["utc", "ut1", "tt"]);
const flags = array(names(["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback", "outside-reference-span"]));
const aspectType = names(["conjunction", "sextile", "square", "trine", "opposition"]);
const bodyName = names([
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn",
  "Uranus", "Neptune", "Pluto", "North Node", "South Node"
]);
const longitude: Schema = {
  type: "number", minimum: 0, exclusiveMaximum: 360,
  description: "Longitude in degrees, normalized to [0, 360)."
};
const instant: Schema = {
  type: "string",
  pattern: "^(?:[0-9]{4}|[+-][0-9]{6})-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
  description: "Engine Date serialized as an ISO string with milliseconds. The accompanying time scale determines how a chart input instant is read."
};
const place = object({
  latitude: { type: "number", minimum: -90, maximum: 90, description: "Degrees north." },
  longitude: { type: "number", minimum: -180, maximum: 180, description: "Degrees east." }
});
const cusps: Schema = {
  ...array(longitude), minItems: 12, maxItems: 12,
  description: "Cusp longitudes in degrees, beginning with the first house."
};
const stringMap: Schema = { type: "object", additionalProperties: text };
const returnProperties: Record<string, Schema> = {
  natalLongitude: longitude,
  instant: { ...instant, description: "Return instant, UTC on the engine's time basis." },
  chart: ref("Chart"),
  location: nullable(place),
  flags: array(names(["outside-reference-span"])),
  natal: ref("Chart")
};
const normalizedCalcTime: Schema = {
  description: "Engine-recorded input time, preserving ISO spelling or a Julian date with its scale and an optional delta T pin.",
  anyOf: [
    object({ iso: text, deltaT: number }, ["iso"]),
    object({ jd: number, scale, deltaT: number }, ["jd", "scale"])
  ]
};

// Documentation schemas only. Fastify does not use these as serializers, so
// the engine's complete response and receipt are never filtered or rewritten.
export const responseSchemas: Record<string, Schema> = {
  EngineIdentity: object({
    name: { type: "string", const: "@zodiacs/engine" },
    version: { type: "string", description: "Version of the engine running this calculation." },
    ephemeris: object({ name: { type: "string", const: "astronomy-engine" }, version: text })
  }),
  BodyPosition: object({
    body: bodyName,
    lon: { ...longitude, description: "Tropical ecliptic longitude of date, in degrees." },
    lat: { type: "number", minimum: -90, maximum: 90, description: "Ecliptic latitude in degrees, north positive." },
    speed: { type: "number", description: "Longitude speed in degrees per day; negative means retrograde." },
    retrograde: boolean,
    sign: names(["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]),
    degree: { type: "number", minimum: 0, exclusiveMaximum: 30, description: "Longitude within the sign, in degrees." }
  }),
  Angles: {
    ...object({ asc: longitude, mc: longitude, dsc: longitude, ic: longitude }),
    description: "Ascendant, midheaven, descendant and lower meridian longitudes, in degrees."
  },
  Houses: object({ system: houseSystem, cusps }),
  Aspect: object({
    a: bodyName, b: bodyName, type: aspectType,
    orb: { type: "number", minimum: 0, description: "Deviation from the exact aspect, in degrees." },
    applying: { type: "boolean", description: "True when the orb is strictly decreasing; exact, separating and stationary aspects are false." }
  }),
  InterAspect: object({
    a: { type: "string", description: "First-chart body; moving sky body for transits." },
    aLon: longitude,
    b: { type: "string", description: "Second-chart body; natal body for transits." },
    bLon: longitude,
    type: aspectType,
    orb: { type: "number", minimum: 0, description: "Deviation from the exact aspect, in degrees." }
  }),
  DeltaT: object({
    seconds: { type: "number", description: "TT minus UT1, in seconds." },
    sigma: nullable({ type: "number", minimum: 0, description: "Reported uncertainty band in seconds; null for a caller pin." }),
    model: names(["zodiacs-deltat/1", "iers-utc/1", "pinned"]),
    table: nullable(text),
    tableDigest: nullable(text),
    segment: names(["long-term", "reconstructed", "observed", "predicted", "extrapolated", "pinned", "fallback"])
  }),
  TimeScale: object({
    input: scale,
    basis: names(["iers", "delta-t", "pinned"]),
    ut1MinusUtc: nullable(object({
      seconds: { type: "number", description: "UT1 minus UTC, in seconds." },
      sigma: { type: "number", minimum: 0, description: "Uncertainty band in seconds." },
      source: names(["observed", "predicted", "fallback"])
    })),
    leapSeconds: nullable(object({
      taiMinusUtc: { type: "number", description: "TAI minus UTC, in seconds." },
      listed: { type: "boolean", description: "False after the leap-second list expires and its last value is carried." }
    }))
  }),
  ChartInput: object({
    utc: instant,
    timeScale: names(["ut1", "tt"]),
    deltaT: { type: "number", description: "Caller-pinned TT minus UT1, in seconds; absent when unpinned." },
    latitude: (place.properties as Record<string, Schema>).latitude!,
    longitude: (place.properties as Record<string, Schema>).longitude!,
    houseSystem,
    timeKnown: boolean,
    flags
  }, ["utc", "houseSystem", "timeKnown"]),
  Chart: {
    ...object({
      input: ref("ChartInput"), bodies: array(ref("BodyPosition")),
      angles: nullable(ref("Angles")), houses: nullable(ref("Houses")),
      aspects: array(ref("Aspect")), flags, deltaT: ref("DeltaT"),
      timeScale: ref("TimeScale"), engineVersion: text
    }),
    description: "Complete engine chart. Angles and houses are null for unknown time or absent coordinates. A receipt covers this chart only."
  },
  TransitData: {
    ...object({
      natal: ref("Chart"), at: instant, positions: array(ref("BodyPosition")),
      aspects: array(ref("InterAspect")), sky: ref("Chart")
    }),
    description: "Direct engine transit result with a supporting location-free sky chart. Natal receipts cover the natal and sky charts, not the moving-to-natal aspects."
  },
  SynastryData: {
    ...object({
      a: ref("Chart"), b: ref("Chart"),
      aspects: array(ref("InterAspect")), top: array(ref("InterAspect")),
      counts: object({ conjunction: count, sextile: count, square: count, trine: count, opposition: count }),
      easeful: { ...count, description: "Number of trine and sextile aspects." },
      charged: { ...count, description: "Number of square and opposition aspects." },
      elements: object({
        a: object({ fire: count, earth: count, air: count, water: count }),
        b: object({ fire: count, earth: count, air: count, water: count })
      }),
      modalities: object({
        a: object({ cardinal: count, fixed: count, mutable: count }),
        b: object({ cardinal: count, fixed: count, mutable: count })
      })
    }),
    description: "Direct engine synastry result. Receipts cover charts a and b only; the pair aspects and summaries are outside their scope."
  },
  SolarReturnData: {
    ...object({ body: { type: "string", const: "Sun" }, ...returnProperties, selection: names(["nearest", "most-recent"]) }),
    description: "Engine solar return with its contributing natal chart. Receipts cover the two charts, not the return search, selection or technique flags."
  },
  LunarReturnData: {
    ...object({ body: { type: "string", const: "Moon" }, ...returnProperties }),
    description: "Engine lunar return strictly after the requested instant, with its contributing natal chart. Receipts cover the two charts, not the search or technique flags."
  },
  MoonPhaseData: {
    ...object({
      at: instant,
      angle: { ...longitude, description: "Moon minus Sun elongation, in degrees; zero is new and 180 is full." },
      illumination: { type: "number", minimum: 0, maximum: 1, description: "Illuminated fraction." },
      name: names(["New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous", "Full Moon", "Waning Gibbous", "Last Quarter", "Waning Crescent"]),
      waxing: boolean,
      sky: ref("Chart")
    }),
    description: "Direct engine phase result with a supporting sky chart. The natal receipt covers only sky, not phase angle, illumination, name or waxing."
  },
  CalcInstant: object({
    utc: instant,
    jdUt1: { type: "number", description: "Julian date on UT1." },
    jdTt: { type: "number", description: "Julian date on TT." },
    deltaT: ref("DeltaT"), timeScale: ref("TimeScale")
  }),
  CalcBound: {
    ...object({
      value: nullable({ type: "number", minimum: 0 }),
      unit: names(["arcsec", "arcsec/day", "relative", "s"]),
      label: names(["measured", "estimated"]), basis: text
    }),
    description: "Engine-reported bound and its basis. Measured values are sample maxima, not proven limits; null means unmeasured."
  },
  HousesData: object({
    status: { type: "string", const: "ok" },
    requested: houseSystem,
    system: { ...houseSystem, description: "Actual system, which can be whole sign after a polar fallback." },
    cusps, angles: ref("Angles"), vertex: longitude, eastPoint: longitude,
    armc: { ...longitude, description: "Right ascension of the midheaven, in degrees." },
    obliquity: { type: "number", description: "True obliquity used, in degrees." },
    flags,
    ayanamsa: { type: "null", description: "Null because this HTTP route accepts the tropical zodiac only." },
    bounds: object({ angles: ref("CalcBound"), cusps: ref("CalcBound") }),
    receipt: ref("HousesCalcReceipt")
  }),
  HousesCalcReceipt: {
    ...object({
      schema: { type: "string", const: CALC_RECEIPT_SCHEMA },
      request: object({ time: normalizedCalcTime, place, houseSystem, zodiac: { type: "string", const: "tropical" } }),
      instants: array(ref("CalcInstant")),
      conventions: array(text), engine: ref("EngineIdentity")
    }),
    description: "Unmodified engine calculation receipt for houses. Its normalized request can be passed to the engine's public houses function."
  },
  NatalReceipt: {
    ...object({
      schema: { type: "string", const: NATAL_RECEIPT_SCHEMA },
      instant,
      timeScale: scale,
      sourceInstant: nullable(text),
      timeKnown: boolean,
      reference: names(["supplied-instant", "utc-noon", "local-noon"]),
      localResolution: nullable({ type: "object", additionalProperties: true }),
      coordinates: nullable(place),
      houses: object({
        requested: houseSystem, actual: nullable(houseSystem),
        absenceReason: nullable(names(["unknown-time", "missing-location"]))
      }),
      inputFlags: flags, resultFlags: flags, engine: ref("EngineIdentity"),
      provenance: nullable({ type: "object", additionalProperties: true }),
      conventions: stringMap, coverage: stringMap
    }),
    additionalProperties: true,
    description: "Current engine natal receipt. Local-resolution and provenance records are left open here; use the engine receipt codec for full semantic validation. Claims are not authenticated."
  },
  NatalRecordedResult: object({
    bodies: array(ref("BodyPosition")), angles: nullable(ref("Angles")), houses: nullable(ref("Houses")),
    aspects: array(ref("Aspect")), deltaT: ref("DeltaT"), timeScale: ref("TimeScale")
  }),
  NatalEnvelope: {
    ...object({
      schema: { type: "string", const: NATAL_ENVELOPE_SCHEMA },
      requiredFeatures: array(text), receipt: ref("NatalReceipt"), result: ref("NatalRecordedResult"),
      extensions: { type: "object", additionalProperties: true }
    }, ["schema", "requiredFeatures", "receipt", "result"]),
    description: "Unmodified natal envelope from the current engine. It records the chart named by the enclosing scope pointer, not derived transit, synastry, return-search or Moon-phase analyses. This schema documents transport shape; parseNatalEnvelope provides full codec validation."
  }
};
