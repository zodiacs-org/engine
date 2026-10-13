import { readFileSync } from "node:fs";
import { canonicalJson, freezeData, sha256 } from "./generator-data.mjs";
import { validateReading } from "./validate-reading.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const definitions = JSON.parse(read("../schema/meaning-entry.schema.json")).$defs;
const readingSchema = JSON.parse(read("../schema/reading.schema.json"));
const claimSchema = JSON.parse(read("../schema/factual-claim.schema.json"));
const implementation = freezeData({
  id: "conservative-prose-extractor", version: "1.0.0",
  digest: sha256(JSON.stringify([
    "./extract-reading-claims.mjs", "./validate-reading.mjs", "./generator-data.mjs",
    "../schema/reading.schema.json", "../schema/factual-claim.schema.json",
    "../schema/meaning-entry.schema.json", "../package-lock.json"
  ].map((path) => [path, read(path)])))
});

export const EXTRACTION_REPORT_BYTES = 1_048_576;
export const EXTRACTION_LIMITS = freezeData({
  maxClaims: readingSchema.properties.claims.maxItems,
  maxQuoteCodePoints: claimSchema.$defs.span.properties.quote.maxLength,
  reportBytes: EXTRACTION_REPORT_BYTES,
  language: "en", grammar: "whole-sentence-templates-v1",
  segmentation: "blank-line-paragraphs;period-followed-by-whitespace-or-end",
  unresolvedParagraphContext: "withhold-all-resolved-claims-in-paragraph",
  unresolvedDocumentContext: "withhold-all-on-quotation-code-or-unresolved-scope-cues",
  temporalScope: "explicit-prefix-or-unspecified",
  conventionSource: "explicit-clause-or-reading-metadata;never-engine-facts",
  discourseUnderstanding: false, recallMeasured: false,
  characterAccountingIsRecall: false, factualCorrectnessChecked: false
});

const messages = {
  "invalid-reading": "Invalid reading for prose extraction.",
  "already-extracted": "Prose extraction requires method none and an empty claim list.",
  "extraction-limit": "Prose extraction exceeds the claim or quote limit.",
  "output-limit": "Prose extraction exceeds the output byte limit.",
  "extraction-contract": "Prose extraction did not satisfy the reading contract."
};
export class ExtractionError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = "ExtractionError";
    this.code = code;
  }
}
const refuse = (code) => { throw new ExtractionError(code); };
const reasons = {
  "unrecognized-sentence": "The complete sentence does not match the supported factual grammar; no factor was inferred.",
  "non-declarative-context": "Question, quotation, code or exclamation context is outside this extractor's declarative grammar.",
  "ambiguous-sentence": "The sentence contains unresolved qualification, alternatives or scope; no factor was inferred.",
  "unresolved-paragraph-context": "Other wording in this paragraph has unresolved scope; the recognizable sentence was withheld.",
  "unresolved-document-context": "Unresolved wording elsewhere in the reading may qualify these assertions; the recognizable sentence was withheld.",
  "complex-negation": "Multiple or locally qualified negations are outside the supported whole-factor grammar.",
  "aspect-policy": "The aspect needs an explicit supported policy in its clause or in the reading metadata.",
  "house-system": "The house needs an explicit supported system in its clause or in the reading metadata.",
  "dignity-system": "The dignity needs an explicit supported system in its clause or in the reading metadata.",
  "self-aspect": "An aspect requires distinct bodies; no replacement body was inferred."
};
const unresolved = (reason, status = "ambiguous") => ({ fields: { status, reason: reasons[reason] }, reason });

// These templates recognize only the local schema vocabulary. They do not
// derive any missing planet, sign or other chart fact from a computed chart.
const body = `(?:the )?(${definitions.body.enum.join("|")})`;
const aspectBody = `(?:the )?(${definitions.aspectBody.enum.join("|")})`;
const classical = `(?:the )?(${definitions.classicalPlanet.enum.join("|")})`;
const sign = `(${definitions.sign.enum.join("|")})`;
const aspect = `(${definitions.aspect.properties.aspect.enum.join("|")})`;
const dignity = `(${definitions.dignity.properties.dignity.enum.join("|")})`;
const under = "(?: under ([a-z-]+))?";
const pattern = (source) => new RegExp(`^${source}$`, "i");
const placementPattern = pattern(`${body} (is|is not|isn't) in ${sign}`);
const housePattern = pattern(`${body} (is in|is not in|isn't in|occupies|does not occupy) house ([1-9]|1[0-2])${under}`);
const aspectPattern = pattern(`${aspectBody} (forms|does not form) (?:an? )?${aspect} with ${aspectBody}${under}`);
const dignityPattern = pattern(`${classical} is in ${sign} with ${dignity}${under}`);
const canonicalBody = (value) => definitions.body.enum.find((name) => name.toLowerCase() === value.toLowerCase());

function parseSentence(quote, conventions) {
  let sentence = quote.trim().replace(/\s+/gu, " ");
  if (sentence.endsWith(".")) sentence = sentence.slice(0, -1);
  let temporalScope = "unspecified";
  let certainty = "unqualified";
  let polarity = "affirmed";
  const scope = /^(At the (?:supplied|reference) instant,|Throughout the day,) /i.exec(sentence);
  if (scope) {
    temporalScope = scope[1].toLowerCase().startsWith("throughout") ? "whole-day" : "reference-instant";
    sentence = sentence.slice(scope[0].length);
  }
  const qualification = /^(Perhaps |If this input is correct, )/i.exec(sentence);
  if (qualification) {
    certainty = qualification[1].toLowerCase().startsWith("perhaps") ? "hedged" : "conditional";
    sentence = sentence.slice(qualification[0].length);
  }
  const denial = /^It is not the case that /i.exec(sentence);
  if (denial) {
    polarity = "negated";
    sentence = sentence.slice(denial[0].length);
  }
  const resolved = (factor, localDenial = false) => {
    if (localDenial && denial) return unresolved("complex-negation");
    return { fields: { status: "resolved", factor,
      polarity: localDenial ? "negated" : polarity, certainty, temporalScope }, reason: null };
  };
  let match = dignityPattern.exec(sentence);
  if (match) {
    const [, namedBody, namedSign, label, explicitSystem] = match;
    const system = explicitSystem?.toLowerCase() ?? conventions.dignitySystem;
    if (system !== "classical-sign") return unresolved("dignity-system");
    return resolved({ kind: "dignity", body: canonicalBody(namedBody), sign: namedSign.toLowerCase(),
      dignity: label.toLowerCase(), system });
  }
  match = housePattern.exec(sentence);
  if (match) {
    const [, namedBody, verb, number, explicitSystem] = match;
    const houseSystem = explicitSystem?.toLowerCase() ?? conventions.houseSystem;
    if (!definitions.house.properties.houseSystem.enum.includes(houseSystem)) return unresolved("house-system");
    return resolved({ kind: "house", body: canonicalBody(namedBody), house: Number(number), houseSystem },
      /not|isn't/i.test(verb));
  }
  match = aspectPattern.exec(sentence);
  if (match) {
    const [, a, verb, namedAspect, b, explicitPolicy] = match;
    if (a.toLowerCase() === b.toLowerCase()) return unresolved("self-aspect", "unsupported");
    const policy = explicitPolicy?.toLowerCase() ?? conventions.aspectPolicy;
    if (policy !== "natal-major-defaults") return unresolved("aspect-policy");
    return resolved({ kind: "aspect", a: canonicalBody(a), b: canonicalBody(b),
      aspect: namedAspect.toLowerCase(), policy }, /not/i.test(verb));
  }
  match = placementPattern.exec(sentence);
  if (match) {
    const [, namedBody, verb, namedSign] = match;
    return resolved({ kind: "placement", body: canonicalBody(namedBody), sign: namedSign.toLowerCase() },
      /not|isn't/i.test(verb));
  }
  if (/\b(?:if|perhaps|maybe|might|may|or|neither|nor|not|isn't)\b/i.test(sentence)) {
    return unresolved("ambiguous-sentence");
  }
  return unresolved("unrecognized-sentence", "unsupported");
}

function trimmedSpan(text, start, end) {
  const raw = text.slice(start, end);
  const quote = raw.trim();
  if (!quote) return null;
  const leading = raw.length - raw.trimStart().length;
  return { start: start + leading, end: start + leading + quote.length, quote };
}

function paragraphs(text) {
  const result = [];
  let start = 0;
  // A single newline is a soft wrap, never a scope reset.
  for (const match of text.matchAll(/\r?\n[ \t]*\r?\n(?:[ \t]*\r?\n)*/g)) {
    const span = trimmedSpan(text, start, match.index);
    if (span) result.push(span);
    start = match.index + match[0].length;
  }
  const span = trimmedSpan(text, start, text.length);
  if (span) result.push(span);
  return result;
}

function sentences(text, paragraph) {
  const result = [];
  let start = paragraph.start;
  for (const match of paragraph.quote.matchAll(/\.(?=\s|$)/gu)) {
    const end = paragraph.start + match.index + 1;
    const span = trimmedSpan(text, start, end);
    if (span) result.push(span);
    start = end;
  }
  const last = trimmedSpan(text, start, paragraph.end);
  if (last) result.push(last);
  return result;
}

/** Extract a bounded, explicitly unannotated reading without consulting facts.
 * No file, model, network, engine computation or caller mutation is involved.
 */
export function extractReadingClaims(readingValue) {
  let inputJson;
  try { inputJson = canonicalJson(readingValue); } catch { refuse("invalid-reading"); }
  const reading = JSON.parse(inputJson);
  if (!validateReading(reading).valid) refuse("invalid-reading");
  if (reading.extraction.method !== "none" || reading.claims.length) refuse("already-extracted");
  const blocks = paragraphs(reading.text);
  const claims = [];
  const reasonCounts = {};
  const diagnostics = { paragraphs: blocks.length, segments: 0,
    resolved: 0, ambiguous: 0, unsupported: 0, abstained: 0,
    utf16CodeUnits: reading.text.length, quotedCodeUnits: 0, unquotedCodeUnits: 0 };
  // A fenced/quoted reading can carry scope across blank lines. This grammar
  // deliberately withholds every paragraph in that case, including fence-free
  // lines between delimiters; it does not try to interpret embedded examples.
  // Apostrophes within words are not quote delimiters: keep isn't supported.
  const quotedDocument = /["\u201c\u201d`<>]|~~~|(?<![a-z])['\u2018\u2019]|['\u2018\u2019](?![a-z])/i.test(reading.text);
  const prepared = [];
  let segmentCount = 0;
  for (const block of blocks) {
    const spans = sentences(reading.text, block);
    segmentCount += spans.length;
    if (segmentCount > EXTRACTION_LIMITS.maxClaims) refuse("extraction-limit");
    const guarded = quotedDocument || /[?!]/u.test(block.quote);
    const parsed = spans.map((span) => {
      if ([...span.quote].length > EXTRACTION_LIMITS.maxQuoteCodePoints) refuse("extraction-limit");
      return guarded ? unresolved("non-declarative-context") : parseSentence(span.quote, reading.conventions);
    });
    prepared.push({ block, spans, parsed, uncertain: parsed.some(({ fields }) => fields.status !== "resolved") });
  }
  // Obvious hypothetical/example/refutation cues can scope text across blank
  // lines. Withhold rather than guessing their extent. This deliberately broad
  // lexical guard still does not implement general discourse understanding.
  const unresolvedScope = prepared.some(({ block, uncertain }) => uncertain &&
    (/\b(?:if|unless|suppose|assuming|hypothetical|example|examples|quote|quoted|fictional|previous|preceding|following|above|below|false|incorrect|untrue|not|never|neither|nor)\b/i.test(block.quote) ||
      block.quote.endsWith(":")));
  for (const { spans, parsed, uncertain } of prepared) {
    for (let index = 0; index < spans.length; index++) {
      let item = parsed[index];
      if (item.fields.status === "resolved") {
        if (unresolvedScope) item = unresolved("unresolved-document-context");
        else if (uncertain) item = unresolved("unresolved-paragraph-context");
      }
      const span = spans[index];
      claims.push({ schemaVersion: "1.0.0", id: `extracted-${claims.length + 1}`, span, ...item.fields });
      diagnostics[item.fields.status]++;
      diagnostics.quotedCodeUnits += span.end - span.start;
      if (item.reason) reasonCounts[item.reason] = (reasonCounts[item.reason] ?? 0) + 1;
    }
  }
  reading.claims = claims;
  reading.extraction = { method: "parser", producer: implementation.id, version: "prose-v1", coverage: "unverified" };
  diagnostics.segments = claims.length;
  diagnostics.unquotedCodeUnits = diagnostics.utf16CodeUnits - diagnostics.quotedCodeUnits;
  if (!validateReading(reading).valid) refuse("extraction-contract");
  const extraction = { ...implementation, coverage: "unverified", inputDigest: sha256(inputJson),
    readingDigest: sha256(canonicalJson(reading)), limits: EXTRACTION_LIMITS, diagnostics, reasons: reasonCounts };
  const result = { reading, extraction };
  try { canonicalJson(result, EXTRACTION_REPORT_BYTES - 1); } catch { refuse("output-limit"); }
  return freezeData(result);
}
