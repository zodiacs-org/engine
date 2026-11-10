import {
  LUNAR_RETURN_HORIZON_DAYS, LUNAR_RETURN_STEP_DAYS,
  SOLAR_RETURN_LOOKBACK_DAYS, SOLAR_RETURN_STEP_DAYS, SOLAR_RETURN_WINDOW_DAYS
} from "../../src/techniques.js";

export interface RouteDocumentation {
  operationId: string;
  summary: string;
  description: string;
  dataSchema: string;
  receipts: readonly { scope: string; kind: "natal" | "houses" }[];
  examples?: Record<string, { summary: string; value: unknown }>;
  readiness?: boolean;
  rawDocument?: boolean;
}

declare module "fastify" {
  interface FastifyContextConfig {
    openapi?: RouteDocumentation;
  }
}

// Invented instants and places, unrelated to any person's birth. Request
// examples are checked through both schema validation and the actual routes.
const birth = { utc: "2001-02-03T04:05:06.789Z", latitude: 23.45, longitude: -67.89 };
const at = "2024-06-07T08:09:10+02:00";
const examples = (value: unknown) => ({ synthetic: { summary: "Synthetic request", value } });
const natalReceipt = (scope: string) => ({ scope, kind: "natal" as const });
const chartScope = "Natal envelopes cover only their named charts. Scope is a server JSON pointer; the engine envelopes are unchanged, unsigned records of conventions and coverage.";

export const routeDocs = {
  health: {
    operationId: "getHealth", summary: "Check HTTP liveness", dataSchema: "HealthData", receipts: [],
    description: "Public and unmetered. Reports that the HTTP handler is running; no calculation receipt is produced. Query parameters are ignored."
  },
  ready: {
    operationId: "getReadiness", summary: "Check engine readiness", dataSchema: "ReadinessData", receipts: [], readiness: true,
    description: "Public and unmetered. Startup verifies a synthetic chart and its receipt before accepting traffic. Returns not_ready when unavailable. Query parameters are ignored."
  },
  openapi: {
    operationId: "getOpenApi", summary: "Discover this API", dataSchema: "OpenApiDocument", receipts: [], rawDocument: true,
    description: "Public and unmetered. Returns the generated OpenAPI document itself, without the response envelope. Query parameters and request bodies are refused. Contains configured limits and engine identity, never keys or request-specific information."
  },
  natal: {
    operationId: "createNatalChart", summary: "Calculate a natal chart", dataSchema: "Chart",
    receipts: [natalReceipt("/data")], examples: examples(birth),
    description: `Calls natalChart directly and retains the complete engine chart. Resolve local wall times before submitting. Unknown time retains the supplied reference instant. Calendar validity, ephemeris coverage and consistent flags are checked by the engine after schema validation. ${chartScope}`
  },
  transits: {
    operationId: "createTransits", summary: "Calculate a transit snapshot", dataSchema: "TransitData",
    receipts: [natalReceipt("/data/natal"), natalReceipt("/data/sky")], examples: examples({ natal: birth, at }),
    description: `Calls transits directly. The added location-free sky chart uses the default UTC time basis, independent of natal timeScale and deltaT. Transit aspects are outside the chart receipts. ${chartScope}`
  },
  synastry: {
    operationId: "createSynastry", summary: "Compare natal charts", dataSchema: "SynastryData",
    receipts: [natalReceipt("/data/a"), natalReceipt("/data/b")],
    examples: examples({ a: birth, b: { utc: "2003-07-08T09:10:11Z", timeKnown: false } }),
    description: `Calls synastry directly with independently computed charts and preserves input ordering. Cross-chart aspects, top selection, counts and balance summaries are outside the chart receipts. ${chartScope}`
  },
  solar: {
    operationId: "createSolarReturn", summary: "Calculate a solar return", dataSchema: "SolarReturnData",
    receipts: [natalReceipt("/data/natal"), natalReceipt("/data/chart")],
    examples: examples({ natal: birth, at, selection: "most-recent", location: null }),
    description: `Calls solarReturn directly. nearest searches ${SOLAR_RETURN_WINDOW_DAYS} days either side of at, with ties selecting the earlier return; most-recent searches ${SOLAR_RETURN_LOOKBACK_DAYS} days before at, selecting at or before it. The coarse step is ${SOLAR_RETURN_STEP_DAYS} day. No configurable window or event search is offered. Bounds limit search extent, not synchronous elapsed runtime. The return uses default UTC time basis, not natal clock overrides. Search, selection, natalLongitude and technique flags are outside the chart receipts. ${chartScope}`
  },
  lunar: {
    operationId: "createLunarReturn", summary: "Calculate the next lunar return", dataSchema: "LunarReturnData",
    receipts: [natalReceipt("/data/natal"), natalReceipt("/data/chart")],
    examples: examples({ natal: birth, after: at, location: null }),
    description: `Calls lunarReturn directly over (after, after + ${LUNAR_RETURN_HORIZON_DAYS} days] with a ${LUNAR_RETURN_STEP_DAYS} day coarse step. Requires a known birth time without dst-gap/dst-fold assertions; after cannot precede birth. No configurable window or event search is offered. Bounds limit search extent, not synchronous elapsed runtime. The return uses default UTC time basis, not natal clock overrides. Search, natalLongitude and technique flags are outside the chart receipts. ${chartScope}`
  },
  moon: {
    operationId: "createMoonPhase", summary: "Calculate moon phase", dataSchema: "MoonPhaseData",
    receipts: [natalReceipt("/data/sky")], examples: examples({ at }),
    description: `Calls moonPhase directly and adds a location-free sky chart on the same default UTC time basis. Angle, illumination, name and waxing flag are outside the sky chart receipt. Read the sky chart flags for reference coverage. ${chartScope}`
  },
  houses: {
    operationId: "createHouses", summary: "Calculate tropical house cusps", dataSchema: "HousesData",
    receipts: [{ scope: "/data", kind: "houses" }],
    examples: {
      ...examples({ time: { iso: "2004-02-29T08:30:00+02:00", deltaT: 70 }, place: { latitude: 48.25, longitude: -3.75 }, houseSystem: "placidus" }),
      julian: { summary: "Synthetic Julian date on TT with polar fallback", value: { time: { jd: 2451545, scale: "tt", deltaT: 64 }, place: { latitude: 78.25, longitude: 15.5 }, houseSystem: "placidus", zodiac: "tropical" } }
    },
    description: "Calls houses from the public calc entry and retains its complete result and bounds. Both UT1 and TT must lie within CALC_SPAN, upper endpoint excluded. Pins may move either basis out of range. Exact poles and unsupported inputs return invalid_request. The scoped native calc receipt is identical to data.receipt; submit its request to this route to replay. It is not a natal envelope or signed attestation."
  }
} satisfies Record<string, RouteDocumentation>;
