import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { computeChartFacts } from "../lib/chart-facts.mjs";

const readJson = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), "utf8"));
const rubric = readJson("../rubrics/factual-v1.json");
const schemas = {
  meaningEntry: readJson("../schema/meaning-entry.schema.json"),
  claim: readJson("../schema/factual-claim.schema.json"),
  reading: readJson("../schema/reading.schema.json"),
  syntheticChart: readJson("../schema/synthetic-chart.schema.json")
};
const sorted = (values) => [...values].sort();

// Contract projections only. These helpers do not extract assertions, determine
// eligibility, compare claims to chart facts or detect contradictions. M8 owns
// the scorer. Manual tallies below specify the policy's arithmetic independently.
function factorTuple(factor) {
  const { factorFields, unorderedFields } = rubric.categories[factor.kind];
  const normalized = { ...factor };
  const values = unorderedFields.map((field) => factor[field]).sort();
  unorderedFields.forEach((field, index) => { normalized[field] = values[index]; });
  return factorFields.map((field) => normalized[field]);
}

function unitTuple(claim) {
  return rubric.identity.resolvedUnitFields.map((field) =>
    field === "factor" ? factorTuple(claim.factor) : claim[field]);
}

function manualTally([correct, incorrect, unassessedResolved, contradicted, coveredFactors, referenceFactors]) {
  return { correct, incorrect, unassessedResolved, contradicted, coveredFactors, referenceFactors };
}

function manualMetrics(counts) {
  const sum = (names) => names.reduce((total, name) => total + counts[name], 0);
  return Object.fromEntries(Object.entries(rubric.metrics).map(([name, formula]) => {
    const denominator = sum(formula.denominator);
    return [name, denominator === 0 ? rubric.reporting.zeroDenominator : sum(formula.numerator) / denominator];
  }));
}

const synthetic = (settings = {}) => ({
  schemaVersion: "1.0.0", id: "rubric-synthetic-contract", synthetic: true,
  birth: { utc: "2003-05-17T08:13:00Z", latitude: 35, longitude: 12, ...settings }
});

test("rubric declares its version, local schema contracts and licensed policy scope", () => {
  assert.equal(rubric.id, "chart-reading-factual");
  assert.equal(rubric.version, "1.0.0");
  assert.equal(rubric.license.spdxId, "MIT");
  assert.match(rubric.license.attribution, /\S/);
  for (const [name, schema] of Object.entries(schemas)) {
    assert.equal(rubric.contracts[name], schema.$id);
  }
  assert.deepEqual(rubric.contracts.factsAdapter, { id: "local-engine-facts", version: "1.0.0" });
  assert.equal(rubric.contracts.factsSchemaVersion, "1.0.0");
  assert.deepEqual(rubric.reference, {
    source: "computeChartFacts",
    comparison: "exact-categorical-factor-membership",
    negativeEvidence: "absence-only-within-complete-supported-domain",
    coverageUniverse: "all-available-positive-reference-factors",
    unavailableHouses: "exclude-from-reference-universe",
    houseSystem: "actual-computed-system",
    outsideReferenceSpan: "retain-flag-and-score-engine-consistency",
    invalidInput: "refuse-without-scores",
    caseMismatch: "refuse-without-scores"
  });
});

test("rubric accounts for every schema factor field and claim vocabulary value", () => {
  const factorSchemas = schemas.meaningEntry.properties.factor.oneOf.map(({ $ref }) => {
    const name = $ref.split("/").at(-1);
    return schemas.meaningEntry.$defs[name];
  });
  assert.deepEqual(sorted(Object.keys(rubric.categories)), sorted(factorSchemas.map((schema) => schema.properties.kind.const)));
  for (const schema of factorSchemas) {
    const kind = schema.properties.kind.const;
    const category = rubric.categories[kind];
    assert.deepEqual(sorted(category.factorFields), sorted(schema.required));
    assert.deepEqual(sorted(category.factorFields), sorted(Object.keys(schema.properties)));
    assert.equal(new Set(category.factorFields).size, category.factorFields.length);
    assert.equal(new Set(category.declaredConventions).size, category.declaredConventions.length);
    for (const name of category.declaredConventions) {
      assert.ok(schemas.reading.$defs.conventions.required.includes(name), `${kind}: ${name}`);
    }
    assert.deepEqual(category.unorderedFields, kind === "aspect" ? ["a", "b"] : []);
    assert.ok(category.unorderedFields.every((name) => category.factorFields.includes(name)));
  }
  for (const [policyField, schemaField] of [
    ["claimStatus", "status"], ["certainty", "certainty"], ["temporalScope", "temporalScope"]
  ]) {
    assert.deepEqual(sorted(Object.keys(rubric[policyField])), sorted(schemas.claim.properties[schemaField].enum));
  }
  assert.deepEqual(sorted(Object.keys(rubric.membershipVerdicts)), sorted(schemas.claim.properties.polarity.enum));
  assert.deepEqual(sorted(rubric.reporting.occurrenceCounts), sorted(schemas.claim.properties.status.enum));
});

test("rubric preserves the current adapter conventions and complete supported domains", async () => {
  const facts = await computeChartFacts(synthetic());
  assert.equal(facts.schemaVersion, rubric.contracts.factsSchemaVersion);
  assert.equal(facts.provenance.adapter.id, rubric.contracts.factsAdapter.id);
  assert.equal(facts.provenance.adapter.version, rubric.contracts.factsAdapter.version);
  assert.equal(facts.conventions.natal.zodiac, rubric.conventions.zodiac);
  assert.equal(facts.conventions.aspects.id, rubric.conventions.aspectPolicy);
  assert.equal(facts.conventions.dignities.id, rubric.conventions.dignitySystem);
  const definitions = schemas.meaningEntry.$defs;
  assert.deepEqual(sorted(facts.reference.bodies.map(({ body }) => body)), sorted(definitions.body.enum));
  assert.deepEqual(sorted(facts.conventions.aspects.bodies), sorted(definitions.aspectBody.enum));
  assert.deepEqual(sorted(facts.availability.dignities.supportedBodies), sorted(definitions.classicalPlanet.enum));
  assert.deepEqual(sorted(facts.conventions.dignities.labels), sorted(definitions.dignity.properties.dignity.enum));
  assert.deepEqual(sorted(facts.conventions.aspects.definitions.map(({ type }) => type)), sorted(definitions.aspect.properties.aspect.enum));
  for (const category of Object.values(rubric.categories)) {
    assert.ok(Object.hasOwn(facts.reference, category.referenceRows));
  }
  for (const factor of facts.facts) {
    assert.deepEqual(sorted(Object.keys(factor)), sorted(rubric.categories[factor.kind].factorFields));
  }
  // Check the synthetic reference's single-aspect-per-pair contract without
  // imposing conditions on policy orb intervals or reproducing aspect matching.
  const aspects = facts.facts.filter(({ kind }) => kind === "aspect");
  const pairs = aspects.map(({ a, b }) => JSON.stringify([a, b].sort()));
  assert.equal(new Set(pairs).size, aspects.length);
  assert.ok(aspects.every(({ policy }) => policy === rubric.conventions.aspectPolicy));
});

test("rubric reference availability matches unknown time and actual polar fallback", async () => {
  const unknown = await computeChartFacts(synthetic({ timeKnown: false }));
  assert.equal(unknown.availability.temporalScope, "reference-instant");
  assert.equal(unknown.availability.houses.status, "unavailable");
  assert.equal(unknown.facts.some(({ kind }) => kind === "house"), false);
  assert.ok(unknown.facts.some(({ kind }) => kind === "placement"));
  assert.ok(unknown.facts.some(({ kind }) => kind === "aspect"));
  assert.ok(rubric.unassessedReasons.includes("unavailable-houses"));
  assert.equal(rubric.temporalScope[unknown.availability.temporalScope], "eligible");

  const polar = await computeChartFacts(synthetic({ latitude: 78, houseSystem: "placidus" }));
  assert.equal(polar.availability.houses.requestedSystem, "placidus");
  assert.equal(polar.availability.houses.actualSystem, "whole");
  assert.equal(polar.availability.houses.fallback, true);
  assert.ok(polar.facts.filter(({ kind }) => kind === "house").every(({ houseSystem }) => houseSystem === "whole"));
  assert.equal(rubric.reference.houseSystem, "actual-computed-system");
});

test("rubric truth table handles full-factor negation without scoring excluded assertions", () => {
  assert.deepEqual(rubric.membershipVerdicts, {
    affirmed: { present: "correct", absent: "incorrect" },
    negated: { present: "incorrect", absent: "correct" }
  });
  assert.deepEqual(rubric.claimStatus, {
    resolved: "check-eligibility", ambiguous: "unresolved-occurrence",
    unsupported: "unresolved-occurrence", abstained: "abstention-occurrence",
    interpretive: "outside-factual-scoring"
  });
  assert.deepEqual(rubric.certainty, { unqualified: "eligible", hedged: "unassessed", conditional: "unassessed" });
  assert.deepEqual(rubric.temporalScope, {
    "reference-instant": "eligible", "whole-day": "unassessed", unspecified: "unassessed"
  });
  assert.equal(rubric.conventions.unspecified, "unassessed");
  assert.equal(rubric.conventions.mismatch, "unassessed");
  assert.equal(rubric.conventions.factorContextConflict, "unassessed");
  assert.equal(rubric.conventions.inferMissingContext, false);
  assert.deepEqual(sorted(rubric.unassessedReasons), sorted([
    "hedged", "conditional", "whole-day", "unspecified-temporal-scope",
    "unspecified-convention", "convention-mismatch", "factor-context-conflict", "unavailable-houses"
  ]));
  assert.deepEqual(Object.fromEntries(Object.entries(rubric.categories).map(([kind, value]) => [kind, value.declaredConventions])), {
    placement: ["zodiac"], aspect: ["zodiac", "aspectPolicy"],
    house: ["zodiac", "houseSystem"], dignity: ["zodiac", "dignitySystem"]
  });
});

test("rubric identity projections canonicalize only the declared equivalent factors and occurrences", () => {
  assert.equal(rubric.identity.factor, "ordered-field-tuple-with-sorted-aspect-bodies");
  assert.deepEqual(rubric.identity.resolvedUnitFields, ["factor", "polarity", "certainty", "temporalScope"]);
  assert.deepEqual(rubric.identity.occurrenceFieldsExcluded, ["id", "span"]);
  assert.equal(rubric.identity.retainAllClaimIds, true);
  assert.equal(rubric.identity.unresolvedDeduplication, "none");
  assert.equal(rubric.identity.crossReadingDeduplication, "none");
  const factor = { kind: "aspect", a: "Sun", b: "Moon", aspect: "trine", policy: "natal-major-defaults" };
  const claim = { factor, polarity: "affirmed", certainty: "unqualified", temporalScope: "reference-instant", id: "first" };
  const before = structuredClone(claim);
  const reversed = { ...claim, id: "second", span: { start: 5, end: 10 }, factor: { ...factor, a: factor.b, b: factor.a } };
  assert.deepEqual(unitTuple(claim), unitTuple(reversed));
  assert.deepEqual(factorTuple(factor), factorTuple(Object.fromEntries(Object.entries(factor).reverse())));
  for (const [field, replacement] of [["polarity", "negated"], ["certainty", "hedged"], ["temporalScope", "whole-day"]]) {
    assert.notDeepEqual(unitTuple(claim), unitTuple({ ...claim, [field]: replacement }));
  }
  assert.notDeepEqual(factorTuple(factor), factorTuple({ ...factor, aspect: "square" }));
  const house = { kind: "house", body: "Moon", house: 1, houseSystem: "whole" };
  assert.notDeepEqual(factorTuple(house), factorTuple({ ...house, houseSystem: "placidus" }));
  assert.notDeepEqual(factorTuple(house), factorTuple({ ...house, house: 2 }));
  const dignity = { kind: "dignity", body: "Mercury", sign: "virgo", dignity: "domicile", system: "classical-sign" };
  assert.notDeepEqual(factorTuple(dignity), factorTuple({ ...dignity, dignity: "exaltation" }));
  assert.notDeepEqual(factorTuple(dignity), factorTuple({ ...dignity, sign: "gemini" }));
  assert.deepEqual(claim, before);
});

test("rubric contradiction and coverage policies retain verdicts without rewarding repetition or abstention", () => {
  assert.deepEqual(rubric.contradictions, {
    participants: "assessed-unique-resolved-units",
    rules: [
      "same-factor-opposite-polarity", "affirmed-exclusive-placement-signs",
      "affirmed-exclusive-house-numbers", "affirmed-exclusive-aspect-types",
      "incompatible-placement-and-dignity-signs"
    ],
    edges: "one-unordered-unit-pair-with-all-applicable-rule-ids",
    verdicts: "retain-membership-verdicts",
    coverage: "withhold-from-any-participating-unit",
    dignityLabels: "not-mutually-exclusive",
    exhaustiveLogicalConsistency: false
  });
  assert.deepEqual(rubric.coverage, {
    credit: "distinct-correct-affirmed-reference-factors-without-contradiction",
    negatedCredit: false, impliedFactorCredit: false, abstentionCredit: false,
    interpretiveCredit: false, shrinkUniverseToReading: false
  });
});

test("rubric metric formulas expose exactly their counts and denominators", () => {
  assert.deepEqual(sorted(rubric.counters), sorted([
    "correct", "incorrect", "unassessedResolved", "contradicted", "referenceFactors", "coveredFactors"
  ]));
  assert.equal(new Set(rubric.counters).size, rubric.counters.length);
  assert.deepEqual(rubric.metrics, {
    correctness: { numerator: ["correct"], denominator: ["correct", "incorrect"] },
    coverage: { numerator: ["coveredFactors"], denominator: ["referenceFactors"] },
    contradictionRate: { numerator: ["contradicted"], denominator: ["correct", "incorrect"] },
    resolvedAssessmentRate: {
      numerator: ["correct", "incorrect"], denominator: ["correct", "incorrect", "unassessedResolved"]
    }
  });
  for (const formula of Object.values(rubric.metrics)) {
    for (const fields of [formula.numerator, formula.denominator]) {
      assert.equal(new Set(fields).size, fields.length);
      assert.ok(fields.every((field) => rubric.counters.includes(field)));
    }
  }
  assert.equal(rubric.reporting.zeroDenominator, null);
  assert.equal(rubric.reporting.rounding, "none");
  assert.equal(rubric.reporting.overallAggregation, "sum-category-counts-before-dividing");
  assert.equal(rubric.reporting.unresolvedCategory, "unassigned");
  assert.equal(rubric.reporting.extractionCoverage, schemas.reading.properties.extraction.properties.coverage.const);
  assert.equal(rubric.reporting.interpretiveQuality, "not-scored");
  assert.equal(rubric.reporting.compositeScore, null);
  assert.equal(rubric.reporting.passThreshold, null);
});

test("rubric worked examples use explicit counts and null empty denominators", () => {
  // Hypothetical totals only, not observed engine outputs or scorer verdicts.
  // Columns: correct, incorrect, unassessedResolved, contradicted,
  // coveredFactors, referenceFactors. Each duplicate has already been grouped.
  const examples = [
    ["empty", [0, 0, 0, 0, 0, 4], [null, 0, null, null]],
    ["correct assertion repeated", [1, 0, 0, 0, 1, 4], [1, 1 / 4, 0, 1]],
    ["correct negation only", [1, 0, 0, 0, 0, 4], [1, 0, 0, 1]],
    ["exact opposition", [1, 1, 0, 2, 0, 4], [1 / 2, 0, 1, 1]],
    ["wholly hedged", [0, 0, 1, 0, 0, 4], [null, 0, null, 0]],
    ["wrong plus right", [1, 1, 0, 0, 1, 4], [1 / 2, 1 / 4, 0, 1]],
    ["empty category", [0, 0, 0, 0, 0, 0], [null, null, null, null]]
  ];
  for (const [name, counts, expected] of examples) {
    const [correctness, coverage, contradictionRate, resolvedAssessmentRate] = expected;
    assert.deepEqual(manualMetrics(manualTally(counts)), {
      correctness, coverage, contradictionRate, resolvedAssessmentRate
    }, name);
  }
});

test("rubric micro aggregation divides summed counts and never averages category ratios", () => {
  const categories = [manualTally([1, 0, 0, 0, 1, 1]), manualTally([1, 3, 5, 2, 1, 9])];
  const totals = Object.fromEntries(rubric.counters.map((name) =>
    [name, categories.reduce((sum, category) => sum + category[name], 0)]));
  const actual = manualMetrics(totals);
  assert.deepEqual(actual, {
    correctness: 2 / 5, coverage: 2 / 10, contradictionRate: 2 / 5, resolvedAssessmentRate: 5 / 10
  });
  const individual = categories.map(manualMetrics);
  for (const name of Object.keys(rubric.metrics)) {
    const average = individual.reduce((sum, scores) => sum + scores[name], 0) / individual.length;
    assert.notEqual(actual[name], average, name);
  }
  const thirds = manualMetrics(manualTally([1, 2, 0, 0, 1, 3]));
  assert.equal(thirds.correctness, 1 / 3);
  assert.equal(thirds.coverage, 1 / 3);
  assert.notEqual(thirds.correctness, 0.33);
});
