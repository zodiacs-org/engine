import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { computeChartFacts, validateSyntheticChart } from "./chart-facts.mjs";
import { canonicalJson, freezeData, sha256 } from "./generator-data.mjs";
import { validateReading } from "./validate-reading.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const policyBytes = read("../rubrics/factual-v1.json");
const policy = freezeData(JSON.parse(policyBytes));
const meaningSchema = JSON.parse(read("../schema/meaning-entry.schema.json"));
const ajv = new Ajv2020({ strict: true });
ajv.addSchema(meaningSchema);
const validFactor = ajv.compile({ $ref: `${meaningSchema.$id}#/properties/factor` });
const kinds = Object.keys(policy.categories);
const implementation = freezeData({
  id: "deterministic-reading-scorer", version: "1.0.0",
  digest: sha256(JSON.stringify([
    "./score-reading.mjs", "./validate-reading.mjs", "./chart-facts.mjs",
    "./local-engine.mjs", "./generator-data.mjs", "../schema/reading.schema.json",
    "../schema/factual-claim.schema.json", "../schema/meaning-entry.schema.json",
    "../schema/synthetic-chart.schema.json", "../package-lock.json"
  ].map((path) => [path, read(path)])))
});

// Includes the trailing newline when a caller writes compact JSON to a file.
export const SCORING_REPORT_BYTES = 1_048_576;
const messages = {
  "invalid-options": "Invalid scoring options.",
  "unsupported-rubric": "Unsupported scoring rubric.",
  "invalid-case": "Invalid synthetic chart case.",
  "invalid-reading": "Invalid reading.",
  "case-mismatch": "Reading and synthetic case identities differ.",
  "reference-failed": "Local engine reference computation failed.",
  "reference-contract": "Local engine reference does not satisfy the scoring contract.",
  "output-limit": "Scoring report exceeds the output byte limit."
};

export class ScoringError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = "ScoringError";
    this.code = code;
  }
}
const refuse = (code) => { throw new ScoringError(code); };
function capture(value, code) {
  try { return canonicalJson(value); } catch { refuse(code); }
}

function canonicalFactor(factor) {
  const { factorFields, unorderedFields } = policy.categories[factor.kind];
  const normalized = { ...factor };
  const sorted = unorderedFields.map((field) => factor[field]).sort();
  unorderedFields.forEach((field, i) => { normalized[field] = sorted[i]; });
  return Object.fromEntries(factorFields.map((field) => [field, normalized[field]]));
}
const factorKey = (factor) => JSON.stringify(Object.values(canonicalFactor(factor)));
const pairKey = (a, b) => JSON.stringify([a, b].sort());
const equalSet = (a, b) => a.length === b.length && new Set(a).size === a.length &&
  new Set(b).size === b.length && a.every((value) => b.includes(value));

// This guards adapter contract drift, not imported data. Only this module's own
// computeChartFacts call can supply a reference; there is no fact-list input.
function checkReference(reference, syntheticCase) {
  const demand = (condition) => { if (!condition) refuse("reference-contract"); };
  const { contracts, conventions } = policy;
  demand(reference.schemaVersion === contracts.factsSchemaVersion &&
    reference.caseId === syntheticCase.id && reference.synthetic === true &&
    reference.provenance.adapter.id === contracts.factsAdapter.id &&
    reference.provenance.adapter.version === contracts.factsAdapter.version);
  demand(reference.conventions.natal.zodiac === conventions.zodiac &&
    reference.conventions.aspects.id === conventions.aspectPolicy &&
    reference.conventions.dignities.id === conventions.dignitySystem);
  const { bodies, aspects, houses, dignities } = reference.reference;
  const definitions = meaningSchema.$defs;
  demand(equalSet(bodies.map(({ body }) => body), definitions.body.enum));
  demand(equalSet(reference.conventions.aspects.bodies, definitions.aspectBody.enum));
  demand(equalSet(reference.availability.dignities.supportedBodies, definitions.classicalPlanet.enum));
  demand(equalSet(dignities.map(({ body }) => body), definitions.classicalPlanet.enum));
  demand(equalSet(reference.conventions.dignities.labels, definitions.dignity.properties.dignity.enum));
  demand(equalSet(reference.conventions.aspects.definitions.map(({ type }) => type),
    definitions.aspect.properties.aspect.enum));
  const expected = bodies.map(({ body, sign }) => ({ kind: "placement", body, sign }));
  const pairs = new Set();
  for (const { a, b, type } of aspects) {
    const pair = pairKey(a, b);
    demand(a !== b && !pairs.has(pair));
    pairs.add(pair);
    expected.push({ kind: "aspect", a, b, aspect: type, policy: conventions.aspectPolicy });
  }
  for (const { body, sign, labels } of dignities) {
    demand(sign === bodies.find((row) => row.body === body).sign);
    demand(equalSet(labels, [...new Set(labels)]));
    expected.push(...labels.map((dignity) => ({ kind: "dignity", body, sign, dignity, system: conventions.dignitySystem })));
  }
  const houseFactors = reference.facts.filter(({ kind }) => kind === "house");
  const availability = reference.availability.houses;
  if (houses === null) {
    demand(availability.status === "unavailable" && availability.actualSystem === null &&
      houseFactors.length === 0 && availability.reasons.length > 0);
  } else {
    demand(availability.status === "available" && availability.reasons.length === 0 &&
      availability.actualSystem === houses.system && houses.cusps.length === 12);
    demand(equalSet(houseFactors.map(({ body }) => body), bodies.map(({ body }) => body)));
    demand(houseFactors.every(({ houseSystem }) => houseSystem === houses.system));
    // The adapter owns houseOf; do not invent a second house algorithm here.
    expected.push(...houseFactors);
  }
  demand(reference.facts.every((factor) => validFactor(factor)) && expected.every((factor) => validFactor(factor)));
  demand(equalSet(reference.facts.map(factorKey), expected.map(factorKey)));
}

function eligibility(claim, declared, reference) {
  const reasons = new Set();
  if (policy.certainty[claim.certainty] === "unassessed") reasons.add(claim.certainty);
  if (policy.temporalScope[claim.temporalScope] === "unassessed") {
    reasons.add(claim.temporalScope === "unspecified" ? "unspecified-temporal-scope" : claim.temporalScope);
  }
  const values = {
    zodiac: reference.conventions.natal.zodiac,
    aspectPolicy: reference.conventions.aspects.id,
    dignitySystem: reference.conventions.dignities.id,
    houseSystem: reference.availability.houses.actualSystem
  };
  const factors = {
    zodiac: null, aspectPolicy: claim.factor.policy ?? null,
    dignitySystem: claim.factor.system ?? null, houseSystem: claim.factor.houseSystem ?? null
  };
  const conventions = policy.categories[claim.factor.kind].declaredConventions.map((field) => {
    const fieldReasons = new Set();
    const unspecified = declared[field] === "unspecified";
    if (unspecified) fieldReasons.add("unspecified-convention");
    if (values[field] !== null && ((!unspecified && declared[field] !== values[field]) ||
        (factors[field] !== null && factors[field] !== values[field]))) fieldReasons.add("convention-mismatch");
    if (!unspecified && factors[field] !== null && factors[field] !== declared[field]) {
      fieldReasons.add("factor-context-conflict");
    }
    for (const reason of fieldReasons) reasons.add(reason);
    return {
      field, declared: declared[field], factor: factors[field], reference: values[field],
      reasons: policy.unassessedReasons.filter((reason) => fieldReasons.has(reason))
    };
  });
  const availabilityReasons = claim.factor.kind === "house" ? [...reference.availability.houses.reasons] : [];
  if (claim.factor.kind === "house" && reference.availability.houses.status === "unavailable") {
    reasons.add("unavailable-houses");
  }
  return { assessed: reasons.size === 0, reasons: policy.unassessedReasons.filter((reason) => reasons.has(reason)),
    conventions, availabilityReasons };
}

function evidence(factor, reference, referenceFactorIndex) {
  const { bodies, aspects, dignities } = reference.reference;
  const bodyRow = (body) => `/reference/bodies/${bodies.findIndex((row) => row.body === body)}`;
  let domain;
  let rows;
  switch (factor.kind) {
    case "placement":
      domain = { kind: "placement", body: factor.body, zodiac: reference.conventions.natal.zodiac };
      rows = [bodyRow(factor.body)];
      break;
    case "aspect": {
      const pair = pairKey(factor.a, factor.b);
      const matchingPairRows = aspects.flatMap((row, index) => pairKey(row.a, row.b) === pair ? [index] : []);
      domain = { kind: "aspect", bodies: [factor.a, factor.b], policy: factor.policy, matchingPairRows };
      // Include the full array even when the pair has no row: absence was
      // checked against the complete policy result, not just the claimed type.
      rows = [bodyRow(factor.a), bodyRow(factor.b), "/conventions/aspects", "/reference/aspects",
        ...matchingPairRows.map((index) => `/reference/aspects/${index}`)];
      break;
    }
    case "house":
      domain = { kind: "house", body: factor.body, houseSystem: factor.houseSystem,
        membership: reference.conventions.houses };
      rows = [bodyRow(factor.body), "/reference/houses", "/availability/houses"];
      break;
    case "dignity": {
      const index = dignities.findIndex((row) => row.body === factor.body);
      domain = { kind: "dignity", body: factor.body, sign: dignities[index].sign, system: factor.system,
        labels: reference.conventions.dignities.labels };
      rows = [bodyRow(factor.body), `/reference/dignities/${index}`, "/availability/dignities", "/conventions/dignities"];
      break;
    }
  }
  if (referenceFactorIndex !== null) rows.push(`/facts/${referenceFactorIndex}`);
  return { membership: referenceFactorIndex === null ? "absent" : "present", referenceFactorIndex, domain, rows };
}

function conflictRules(a, b) {
  const x = a.factor;
  const y = b.factor;
  const bothAffirmed = a.polarity === "affirmed" && b.polarity === "affirmed";
  const sameBody = x.body !== undefined && x.body === y.body;
  const rules = new Set();
  if (a.factorKey === b.factorKey && a.polarity !== b.polarity) rules.add("same-factor-opposite-polarity");
  if (bothAffirmed && x.kind === y.kind) {
    if (x.kind === "placement" && sameBody && x.sign !== y.sign) rules.add("affirmed-exclusive-placement-signs");
    if (x.kind === "house" && sameBody && x.houseSystem === y.houseSystem && x.house !== y.house) {
      rules.add("affirmed-exclusive-house-numbers");
    }
    if (x.kind === "aspect" && x.a === y.a && x.b === y.b && x.policy === y.policy && x.aspect !== y.aspect) {
      rules.add("affirmed-exclusive-aspect-types");
    }
  }
  for (const [dignity, other] of [[a, b], [b, a]]) {
    if (!sameBody || dignity.factor.kind !== "dignity" || dignity.polarity !== "affirmed") continue;
    if ((["placement", "dignity"].includes(other.factor.kind) && other.polarity === "affirmed" &&
        dignity.factor.sign !== other.factor.sign) ||
        (other.factor.kind === "placement" && other.polarity === "negated" && dignity.factor.sign === other.factor.sign)) {
      rules.add("incompatible-placement-and-dignity-signs");
    }
  }
  return policy.contradictions.rules.filter((rule) => rules.has(rule));
}

const emptyCounts = () => Object.fromEntries(policy.counters.map((name) => [name, 0]));
function metrics(counts) {
  const sum = (names) => names.reduce((total, name) => total + counts[name], 0);
  return Object.fromEntries(Object.entries(policy.metrics).map(([name, formula]) => {
    const numerator = sum(formula.numerator);
    const denominator = sum(formula.denominator);
    return [name, { numerator, denominator, value: denominator === 0 ? null : numerator / denominator }];
  }));
}

/** Score one supplied extraction against a fresh, complete local engine result.
 * No extraction, external reference, model call or report file is implied.
 */
export async function scoreReading(caseValue, readingValue, options = {}) {
  const selection = JSON.parse(capture(options, "invalid-options"));
  if (!selection || Array.isArray(selection) || typeof selection !== "object" ||
      Object.keys(selection).some((key) => !["rubricId", "rubricVersion"].includes(key))) refuse("invalid-options");
  if ((Object.hasOwn(selection, "rubricId") && selection.rubricId !== policy.id) ||
      (Object.hasOwn(selection, "rubricVersion") && selection.rubricVersion !== policy.version)) refuse("unsupported-rubric");
  const caseJson = capture(caseValue, "invalid-case");
  const readingJson = capture(readingValue, "invalid-reading");
  const syntheticCase = JSON.parse(caseJson);
  const reading = JSON.parse(readingJson);
  if (!validateSyntheticChart(syntheticCase).valid) refuse("invalid-case");
  if (!validateReading(reading).valid) refuse("invalid-reading");
  if (reading.caseId !== syntheticCase.id) refuse("case-mismatch");
  let reference;
  try { reference = await computeChartFacts(syntheticCase); } catch { refuse("reference-failed"); }
  try { checkReference(reference, syntheticCase); } catch { refuse("reference-contract"); }
  const referenceJson = capture(reference, "reference-contract");
  const referenceIndex = new Map(reference.facts.map((factor, index) => [factorKey(factor), index]));
  const units = [];
  const byKey = new Map();
  const diagnostics = {
    occurrences: Object.fromEntries(policy.reporting.occurrenceCounts.map((status) => [status, 0])),
    resolvedByCategory: Object.fromEntries(kinds.map((kind) => [kind, { occurrences: 0, unique: 0, duplicates: 0 }])),
    uniqueResolved: 0, duplicateResolved: 0, unassigned: 0
  };
  const occurrences = reading.claims.map((claim, index) => {
    diagnostics.occurrences[claim.status]++;
    if (claim.status !== "resolved") {
      diagnostics.unassigned++;
      return { claimId: claim.id, index, category: "unassigned", unitId: null, duplicateOf: null };
    }
    const factor = canonicalFactor(claim.factor);
    const key = JSON.stringify(policy.identity.resolvedUnitFields.map((field) =>
      field === "factor" ? Object.values(factor) : claim[field]));
    const category = factor.kind;
    diagnostics.resolvedByCategory[category].occurrences++;
    let unit = byKey.get(key);
    const duplicateOf = unit?.id ?? null;
    if (unit) {
      unit.claimIds.push(claim.id);
      diagnostics.duplicateResolved++;
      diagnostics.resolvedByCategory[category].duplicates++;
    } else {
      const allowed = eligibility(claim, reading.conventions, reference);
      const normalizedKey = factorKey(factor);
      const evidenceResult = allowed.assessed ? evidence(factor, reference, referenceIndex.get(normalizedKey) ?? null) : null;
      unit = {
        id: claim.id, key, factorKey: normalizedKey, category, factor,
        polarity: claim.polarity, certainty: claim.certainty, temporalScope: claim.temporalScope,
        claimIds: [claim.id], eligibility: allowed,
        verdict: allowed.assessed ? policy.membershipVerdicts[claim.polarity][evidenceResult.membership] : "unassessed",
        evidence: evidenceResult, contradictionIds: [], coverage: null
      };
      units.push(unit);
      byKey.set(key, unit);
      diagnostics.uniqueResolved++;
      diagnostics.resolvedByCategory[category].unique++;
    }
    return { claimId: claim.id, index, category, unitId: unit.id, duplicateOf };
  });
  const contradictions = [];
  const assessed = units.filter((unit) => unit.eligibility.assessed);
  for (let i = 0; i < assessed.length; i++) {
    for (let j = i + 1; j < assessed.length; j++) {
      const a = assessed[i];
      const b = assessed[j];
      const rules = conflictRules(a, b);
      if (!rules.length) continue;
      const id = `contradiction-${contradictions.length + 1}`;
      contradictions.push({ id, unitIds: [a.id, b.id], rules });
      a.contradictionIds.push(id);
      b.contradictionIds.push(id);
    }
  }
  const categories = Object.fromEntries(kinds.map((kind) => [kind, { counts: emptyCounts() }]));
  for (const factor of reference.facts) categories[factor.kind].counts.referenceFactors++;
  const covered = new Set();
  for (const unit of units) {
    const counts = categories[unit.category].counts;
    counts[unit.verdict === "unassessed" ? "unassessedResolved" : unit.verdict]++;
    if (unit.contradictionIds.length) counts.contradicted++;
    const reason = unit.verdict === "unassessed" ? "unassessed" :
      unit.verdict === "incorrect" ? "incorrect" : unit.contradictionIds.length ? "contradicted" :
        unit.polarity === "negated" ? "negated" : "covered";
    unit.coverage = { credited: reason === "covered", reason };
    if (unit.coverage.credited && !covered.has(unit.factorKey)) {
      counts.coveredFactors++;
      covered.add(unit.factorKey);
    }
  }
  const counts = emptyCounts();
  for (const category of Object.values(categories)) {
    category.metrics = metrics(category.counts);
    for (const name of policy.counters) counts[name] += category.counts[name];
  }
  const result = {
    schemaVersion: "1.0.0", status: "completed",
    rubric: { id: policy.id, version: policy.version, digest: sha256(policyBytes) }, implementation,
    identity: { caseDigest: sha256(caseJson), readingDigest: sha256(readingJson), referenceDigest: sha256(referenceJson) },
    case: syntheticCase, reading, reference, units, occurrences, contradictions, categories,
    overall: { counts, metrics: metrics(counts) }, diagnostics,
    limits: { extractionCoverage: reading.extraction.coverage, interpretiveQuality: "not-scored", exhaustiveLogicalConsistency: false }
  };
  if (Buffer.byteLength(JSON.stringify(result), "utf8") + 1 > SCORING_REPORT_BYTES) refuse("output-limit");
  return freezeData(result);
}
