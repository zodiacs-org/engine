import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const readSchema = (name) => JSON.parse(readFileSync(
  new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8"
));
const readingSchema = readSchema("reading");
const claimSchema = readSchema("factual-claim");
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(readSchema("meaning-entry"));
ajv.addSchema(claimSchema);
const checkReading = ajv.compile(readingSchema);
const checkClaim = ajv.getSchema(claimSchema.$id);
const maxTextLength = readingSchema.properties.text.maxLength;
const maxClaims = readingSchema.properties.claims.maxItems;

const issue = (path, keyword, message) => ({ path, keyword, message });
const report = (errors) => ({ valid: errors.length === 0, errors });
const schemaErrors = (check) => check.errors.map(({ instancePath, keyword, message }) =>
  issue(instancePath || "/", keyword, message));

function textErrors(text) {
  if (typeof text !== "string") return [issue("/text", "type", "must be string")];
  // JSON Schema counts Unicode code points. Stop at the limit without allocating
  // an array proportional to untrusted text; UTF-16 offsets are checked below.
  let count = 0;
  for (const character of text) {
    count += 1;
    if (count > maxTextLength) {
      return [issue("/text", "maxLength", `must NOT have more than ${maxTextLength} characters`)];
    }
  }
  if (!text.isWellFormed()) {
    return [issue("/text", "wellFormedText", "must not contain unpaired UTF-16 surrogates")];
  }
  return [];
}

function splitsSurrogate(text, offset) {
  const before = text.charCodeAt(offset - 1);
  const after = text.charCodeAt(offset);
  return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

// Called only after structural validation and text validation. Keep every
// record, even if its factor duplicates or contradicts another assertion.
function claimErrors(claim, text) {
  const errors = [];
  const { start, end, quote } = claim.span;
  if (end <= start) {
    errors.push(issue("/span", "spanOrder", "end must be greater than start"));
  }
  if (start >= text.length || end > text.length) {
    errors.push(issue("/span", "spanBounds", "span must lie within the reading text"));
  }
  if (splitsSurrogate(text, start) || splitsSurrogate(text, end)) {
    errors.push(issue("/span", "spanBoundary", "span must not split a UTF-16 surrogate pair"));
  }
  if (text.slice(start, end) !== quote) {
    errors.push(issue("/span/quote", "quoteMismatch", "quote must equal the exact reading text slice"));
  }
  if (claim.status === "resolved" && claim.factor.kind === "aspect" && claim.factor.a === claim.factor.b) {
    errors.push(issue("/factor", "distinctBodies", "aspect bodies must differ"));
  }
  return errors;
}

/** Validate a parsed JSON claim and its exact quote against the supplied text. */
export function validateClaim(claim, text) {
  const errors = textErrors(text);
  if (!checkClaim(claim)) return report([...errors, ...schemaErrors(checkClaim)]);
  if (errors.length) return report(errors);
  return report(claimErrors(claim, text));
}

/**
 * Validate parsed JSON without mutation, defaults, coercion or reference fetches.
 * This is not scoring or an extraction audit. Resolved means a supported factor
 * was supplied, not that the assertion is true or faithfully quotes its meaning.
 */
export function validateReading(reading) {
  // Refuse excess work before Ajv's allErrors traversal visits every claim.
  if (Array.isArray(reading?.claims) && reading.claims.length > maxClaims) {
    return report([issue("/claims", "maxItems", `must NOT have more than ${maxClaims} items`)]);
  }
  if (typeof reading?.text === "string") {
    const errors = textErrors(reading.text);
    if (errors.length) return report(errors);
  }
  if (!checkReading(reading)) return report(schemaErrors(checkReading));

  const errors = [];
  const ids = new Set();
  reading.claims.forEach((claim, index) => {
    const prefix = `/claims/${index}`;
    if (ids.has(claim.id)) {
      errors.push(issue(`${prefix}/id`, "uniqueClaimId", "claim id must be unique within the reading"));
    }
    ids.add(claim.id);
    for (const error of claimErrors(claim, reading.text)) {
      errors.push({ ...error, path: `${prefix}${error.path}` });
    }
  });
  if (reading.extraction.method === "none" && reading.claims.length) {
    errors.push(issue("/extraction/method", "extractionMethod", "method none requires an empty claim list"));
  }
  return report(errors);
}
