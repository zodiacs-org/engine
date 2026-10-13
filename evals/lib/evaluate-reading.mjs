import { readFileSync } from "node:fs";
import { computeChartFacts, validateSyntheticChart } from "./chart-facts.mjs";
import { extractReadingClaims } from "./extract-reading-claims.mjs";
import { canonicalJson, freezeData, sha256 } from "./generator-data.mjs";
import { SCORING_REPORT_BYTES, ScoringError, scoreReading } from "./score-reading.mjs";
import { validateReading } from "./validate-reading.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const rubric = JSON.parse(read("../rubrics/factual-v1.json"));
const implementation = freezeData({
  id: "offline-reading-evaluation", version: "1.0.0",
  digest: sha256(JSON.stringify([
    "./evaluate-reading.mjs", "./extract-reading-claims.mjs", "./generator-data.mjs", "./validate-reading.mjs",
    "../schema/reading.schema.json", "../schema/factual-claim.schema.json",
    "../schema/meaning-entry.schema.json"
  ].map((path) => [path, read(path)])))
});

export const EVALUATION_REPORT_BYTES = SCORING_REPORT_BYTES;
const messages = {
  "invalid-options": "Invalid evaluation options.",
  "unsupported-rubric": "Unsupported evaluation rubric.",
  "invalid-case": "Invalid synthetic evaluation case.",
  "invalid-reading": "Invalid supplied reading.",
  "case-mismatch": "Reading and synthetic case identities differ.",
  "reference-failed": "Local engine reference computation failed.",
  "reference-contract": "Local engine reference does not satisfy the evaluation contract.",
  "mock-failed": "Offline mock reading construction failed.",
  "extraction-failed": "Supplied reading claim extraction failed.",
  "scoring-failed": "Reading scoring failed.",
  "output-limit": "Evaluation report exceeds its output limits."
};

export class EvaluationError extends Error {
  constructor(code) {
    const safeCode = Object.hasOwn(messages, code) ? code : "scoring-failed";
    super(messages[safeCode]);
    this.name = "EvaluationError";
    this.code = safeCode;
  }
}
const refuse = (code) => { throw new EvaluationError(code); };
function capture(value, code) {
  try { return JSON.parse(canonicalJson(value)); } catch { refuse(code); }
}

function optionsFor(value) {
  // Inspect ordinary data slots without invoking getters. Host proxies remain
  // trusted same-process code, as in the other eval library entry points.
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) refuse("invalid-options");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== "string" ||
      !["reading", "extract", "rubricId", "rubricVersion"].includes(key) ||
      !Object.hasOwn(descriptors[key], "value") || !descriptors[key].enumerable)) refuse("invalid-options");
  const extract = Object.hasOwn(descriptors, "extract") ? descriptors.extract.value : false;
  if (typeof extract !== "boolean" || (extract && !Object.hasOwn(descriptors, "reading"))) refuse("invalid-options");
  const scoring = capture(Object.fromEntries(["rubricId", "rubricVersion"]
    .filter((key) => Object.hasOwn(descriptors, key)).map((key) => [key, descriptors[key].value])), "invalid-options");
  if ((Object.hasOwn(scoring, "rubricId") && scoring.rubricId !== rubric.id) ||
      (Object.hasOwn(scoring, "rubricVersion") && scoring.rubricVersion !== rubric.version)) refuse("unsupported-rubric");
  return { scoring, extract, supplied: Object.hasOwn(descriptors, "reading"),
    reading: Object.hasOwn(descriptors, "reading") ? capture(descriptors.reading.value, "invalid-reading") : null };
}

function factorSentence(factor) {
  const at = "At the supplied reference instant, ";
  switch (factor.kind) {
    case "placement": return `${at}${factor.body} is in ${factor.sign} in the tropical zodiac.`;
    case "aspect": return `${at}${factor.a} forms ${factor.aspect} with ${factor.b} under ${factor.policy}.`;
    case "house": return `${at}${factor.body} occupies house ${factor.house} under ${factor.houseSystem}.`;
    case "dignity": return `${at}${factor.body} is in ${factor.sign} with ${factor.dignity} under ${factor.system}.`;
    default: refuse("mock-failed");
  }
}

// Private renderer: the reference is always obtained locally by evaluateReading.
// This is an engine-derived workflow fixture, not an interpretation model or
// general prose extractor. The scorer still recomputes its own full reference.
function mockFor(syntheticCase, reference) {
  const referenceDigest = sha256(canonicalJson(reference));
  const inputDigest = sha256(canonicalJson({
    templateVersion: "mock-reading-v1", caseDigest: sha256(canonicalJson(syntheticCase)), referenceDigest
  }));
  let text = "Offline mock reading derived from the local engine for workflow checks.\n";
  const claims = [];
  function add(quote, fields) {
    const start = text.length;
    text += quote;
    claims.push({ schemaVersion: "1.0.0", id: `mock-claim-${claims.length + 1}`,
      ...fields, span: { start, end: text.length, quote } });
    text += "\n";
  }
  for (const factor of reference.facts) {
    add(factorSentence(factor), { status: "resolved", factor: structuredClone(factor),
      polarity: "affirmed", certainty: "unqualified", temporalScope: "reference-instant" });
  }
  if (reference.availability.houses.status === "unavailable") {
    add("House placements are unavailable for this input; this mock makes no house assertion.", {
      status: "abstained", reason: `Local reference: ${reference.availability.houses.reasons.join(", ")}.`
    });
  }
  const reading = {
    schemaVersion: "1.0.0", id: `mock-reading-${inputDigest.slice(7, 39)}`, caseId: syntheticCase.id,
    synthetic: true, language: "en", text, offsetUnit: "utf16-code-unit",
    conventions: { zodiac: reference.conventions.natal.zodiac,
      houseSystem: reference.availability.houses.actualSystem ?? "unspecified",
      aspectPolicy: reference.conventions.aspects.id, dignitySystem: reference.conventions.dignities.id },
    provenance: { kind: "generated", backend: "mock-reading", model: "offline-fact-renderer-v1",
      promptVersion: "mock-reading-v1", inputDigest, reviewStatus: "unreviewed" },
    extraction: { method: "parser", producer: "mock-reading-renderer", version: "mock-reading-v1", coverage: "unverified" },
    claims, license: { spdxId: "MIT", attribution: "Original evals mock reading template, composed with OpenAI Codex." }
  };
  if (!validateReading(reading).valid) refuse("mock-failed");
  return { reading, metadata: { id: "engine-fact-reading-mock", version: "1.0.0", inputDigest, referenceDigest } };
}

/** Evaluate one invented chart with a supplied reading or an offline fixture.
 * Supplied unannotated prose can opt into conservative claim extraction.
 * This API writes nothing and selects no model/provider from the environment.
 */
export async function evaluateReading(caseValue, options = {}) {
  const selection = optionsFor(options);
  const syntheticCase = capture(caseValue, "invalid-case");
  if (!validateSyntheticChart(syntheticCase).valid) refuse("invalid-case");
  let reading = selection.reading;
  let mock = null;
  let extraction = null;
  if (selection.supplied) {
    if (!validateReading(reading).valid) refuse("invalid-reading");
    if (reading.caseId !== syntheticCase.id) refuse("case-mismatch");
    if (selection.extract) {
      try { ({ reading, extraction } = extractReadingClaims(reading)); } catch { refuse("extraction-failed"); }
    }
  } else {
    let reference;
    try { reference = await computeChartFacts(syntheticCase); } catch { refuse("reference-failed"); }
    try {
      ({ reading, metadata: mock } = mockFor(syntheticCase, reference));
    } catch { refuse("mock-failed"); }
  }
  let score;
  try { score = await scoreReading(syntheticCase, reading, selection.scoring); } catch (error) {
    refuse(error instanceof ScoringError ? error.code : "scoring-failed");
  }
  if (mock && mock.referenceDigest !== score.identity.referenceDigest) refuse("reference-contract");
  const result = {
    schemaVersion: "1.0.0", status: "completed",
    workflow: { ...implementation, mode: selection.supplied ? "supplied" : "mock", mock, extraction }, score
  };
  // The final envelope, not just the nested score, must fit a canonical report
  // file with its trailing newline. Do not silently drop evidence to make it fit.
  try { canonicalJson(result, EVALUATION_REPORT_BYTES - 1); } catch { refuse("output-limit"); }
  return freezeData(result);
}
