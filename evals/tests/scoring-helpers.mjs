import assert from "node:assert/strict";

// Invented inputs and original inline prose. Numerical references are computed
// in memory by the local adapter; these checks do not establish sky accuracy.
export const categories = ["placement", "aspect", "house", "dignity"];

export function syntheticCase(settings = {}) {
  return {
    schemaVersion: "1.0.0", id: "scorer-synthetic-example", synthetic: true,
    birth: { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12, ...settings }
  };
}

export function resolved(factor, overrides = {}) {
  return {
    status: "resolved", factor: structuredClone(factor), polarity: "affirmed",
    certainty: "unqualified", temporalScope: "reference-instant", ...overrides
  };
}

export function unresolved(status, quote = "This original assertion remains unresolved.") {
  return { status, quote, reason: `Original inline ${status} example; no supported factor inferred.` };
}

function factorQuote(claim) {
  const { factor, polarity, certainty, temporalScope } = claim;
  let proposition;
  if (factor.kind === "placement") proposition = `${factor.body} is in ${factor.sign}`;
  if (factor.kind === "aspect") proposition = `${factor.a} forms ${factor.aspect} with ${factor.b}`;
  if (factor.kind === "house") proposition = `${factor.body} occupies house ${factor.house} under ${factor.houseSystem}`;
  if (factor.kind === "dignity") proposition = `${factor.body} is in ${factor.sign} with ${factor.dignity}`;
  const denial = polarity === "negated" ? "It is not the case that " : "";
  const hedge = certainty === "hedged" ? "Perhaps " : certainty === "conditional" ? "If this input is correct, " : "";
  const scope = temporalScope === "reference-instant" ? "At the supplied instant, " :
    temporalScope === "whole-day" ? "Throughout the day, " : "";
  return `${scope}${hedge}${denial}${proposition}.`;
}

export function readingFor(input, specs = [], conventions = {}) {
  let text = "";
  const claims = specs.map((spec, index) => {
    const { quote = spec.status === "resolved" ? factorQuote(spec) : "Unresolved assertion.", ...fields } = spec;
    const start = text.length;
    text += quote;
    const end = text.length;
    text += "\n";
    return {
      schemaVersion: "1.0.0", id: `claim-${index + 1}`, ...structuredClone(fields),
      span: { start, end, quote }
    };
  });
  return {
    schemaVersion: "1.0.0", id: "scorer-inline-reading", caseId: input.id,
    synthetic: true, language: "en", text, offsetUnit: "utf16-code-unit",
    conventions: {
      zodiac: "tropical", houseSystem: "whole", aspectPolicy: "natal-major-defaults",
      dignitySystem: "classical-sign", ...conventions
    },
    provenance: {
      kind: "authored", authors: ["Evals test contributors"],
      note: "Original AI-assisted inline test reading for an invented chart; no external source text."
    },
    extraction: { method: "manual", producer: "test-author", version: "test-v1", coverage: "unverified" },
    claims,
    license: { spdxId: "MIT", attribution: "Evals test contributors" }
  };
}

export function byKind(reference, kind) {
  return reference.facts.filter((factor) => factor.kind === kind);
}

export function assertMetric(metric, numerator, denominator) {
  assert.deepEqual(metric, { numerator, denominator, value: denominator ? numerator / denominator : null });
}

export function assertTotals(totals, expected) {
  assert.deepEqual(totals.counts, expected);
  const { correct, incorrect, unassessedResolved, contradicted, referenceFactors, coveredFactors } = expected;
  assert.deepEqual(Object.keys(totals.metrics).sort(),
    ["contradictionRate", "correctness", "coverage", "resolvedAssessmentRate"]);
  assertMetric(totals.metrics.correctness, correct, correct + incorrect);
  assertMetric(totals.metrics.coverage, coveredFactors, referenceFactors);
  assertMetric(totals.metrics.contradictionRate, contradicted, correct + incorrect);
  assertMetric(totals.metrics.resolvedAssessmentRate, correct + incorrect, correct + incorrect + unassessedResolved);
}

export function expectedCounts(reference, kind, overrides = {}) {
  return {
    correct: 0, incorrect: 0, unassessedResolved: 0, contradicted: 0,
    referenceFactors: kind ? byKind(reference, kind).length : reference.facts.length,
    coveredFactors: 0, ...overrides
  };
}

export function resolveEvidencePointer(reference, pointer) {
  assert.equal(typeof pointer, "string");
  assert.ok(pointer.startsWith("/"), pointer);
  let current = reference;
  for (const escaped of pointer.slice(1).split("/")) {
    const part = escaped.replaceAll("~1", "/").replaceAll("~0", "~");
    assert.ok(current !== null && Object.hasOwn(current, part), `missing evidence row ${pointer}`);
    current = current[part];
  }
  return current;
}
