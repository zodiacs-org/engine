import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { digest, freezeRecord, loadLocalEngine } from "./local-engine.mjs";

const meaningSchema = readFileSync(new URL("../schema/meaning-entry.schema.json", import.meta.url), "utf8");
const caseSchema = readFileSync(new URL("../schema/synthetic-chart.schema.json", import.meta.url), "utf8");
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(JSON.parse(meaningSchema));
const checkCase = ajv.compile(JSON.parse(caseSchema));
const adapterDigest = digest(JSON.stringify([
  readFileSync(new URL(import.meta.url), "utf8"),
  readFileSync(new URL("./local-engine.mjs", import.meta.url), "utf8"),
  meaningSchema, caseSchema
]));

/** Structural validation; natalChart additionally checks dates and ephemeris range. */
export function validateSyntheticChart(value) {
  const valid = checkCase(value);
  return {
    valid,
    errors: valid ? [] : checkCase.errors.map(({ instancePath, keyword, message }) => ({
      path: instancePath || "/", keyword, message
    }))
  };
}

/** Engine-relative facts only, with no inference about the validity of interpretations. */
export async function computeChartFacts(value) {
  const report = validateSyntheticChart(value);
  if (!report.valid) {
    const error = new TypeError("Invalid synthetic chart case.");
    error.errors = report.errors;
    throw error;
  }
  // Capture the caller's JSON before awaiting the loader.
  const input = structuredClone(value);
  const { api, provenance, aspectBodies } = await loadLocalEngine();
  const chart = api.natalChart(input.birth);
  const actualSystem = chart.houses?.system ?? null;
  const reasons = [];
  if (!chart.input.timeKnown) reasons.push("unknown-time");
  if (chart.input.latitude === undefined) reasons.push("missing-coordinates");
  const dignities = chart.bodies.filter(({ body }) => api.CLASSICAL_PLANETS.includes(body))
    .map(({ body, sign }) => ({ body, sign, labels: [...api.dignitiesFor(body, sign)] }));
  const facts = chart.bodies.map(({ body, sign }) => ({ kind: "placement", body, sign }));
  facts.push(...chart.aspects.map(({ a, b, type }) => ({
    kind: "aspect", a, b, aspect: type, policy: "natal-major-defaults"
  })));
  if (chart.houses) {
    facts.push(...chart.bodies.map(({ body, lon }) => ({
      kind: "house", body, house: api.houseOf(lon, chart.houses.cusps), houseSystem: actualSystem
    })));
  }
  for (const { body, sign, labels } of dignities) {
    facts.push(...labels.map((dignity) => ({ kind: "dignity", body, sign, dignity, system: "classical-sign" })));
  }
  return freezeRecord({
    schemaVersion: "1.0.0",
    caseId: input.id,
    synthetic: true,
    input: {
      ...chart.input, utc: chart.input.utc.toISOString(), timeScale: chart.timeScale.input
    },
    provenance: {
      ...structuredClone(provenance),
      adapter: { id: "local-engine-facts", version: "1.0.0", digest: adapterDigest }
    },
    conventions: {
      natal: { ...api.NATAL_RECEIPT_CONVENTION_SETS[0] },
      aspects: {
        id: "natal-major-defaults", bodies: [...aspectBodies],
        definitions: api.ASPECTS.map((row) => ({ ...row })),
        arithmetic: "engine-natal-floating-point",
        stationaryRelativeSpeedDegreesPerDay: api.STATIONARY_RELATIVE_SPEED
      },
      houses: "houseOf-ecliptic-longitude-between-cusps",
      dignities: { id: "classical-sign", labels: ["domicile", "exaltation", "detriment", "fall"] }
    },
    availability: {
      temporalScope: chart.input.timeKnown ? "known-instant" : "reference-instant",
      houses: {
        status: chart.houses ? "available" : "unavailable", reasons,
        requestedSystem: chart.input.houseSystem, actualSystem,
        fallback: chart.flags.includes("polar-fallback")
      },
      dignities: {
        supportedBodies: [...api.CLASSICAL_PLANETS],
        unsupportedBodies: chart.bodies.filter(({ body }) => !api.CLASSICAL_PLANETS.includes(body)).map(({ body }) => body)
      }
    },
    time: { sourceInstant: input.birth.utc, timeScale: chart.timeScale, deltaT: chart.deltaT },
    coverage: {
      referenceSpan: { ...api.REFERENCE_SPAN },
      outsideReferenceSpan: chart.flags.includes("outside-reference-span")
    },
    flags: [...chart.flags],
    reference: {
      bodies: chart.bodies, aspects: chart.aspects,
      houses: chart.houses, angles: chart.angles, dignities
    },
    facts
  });
}
