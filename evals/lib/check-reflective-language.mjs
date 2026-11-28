import { readFileSync } from "node:fs";
import { canonicalJson, freezeData, sha256 } from "./generator-data.mjs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const policyBytes = read("../rubrics/reflective-v1.json");
const policy = freezeData(JSON.parse(policyBytes));
const implementation = freezeData({
  id: "deterministic-reflective-language-checker", version: "1.0.0",
  digest: sha256(JSON.stringify([
    "./check-reflective-language.mjs", "./generator-data.mjs"
  ].map((path) => [path, read(path)])))
});

export const REFLECTIVE_LIMITS = policy.limits;
const messages = {
  "invalid-options": "Invalid reflective-language options.",
  "unsupported-rubric": "Unsupported reflective-language rubric.",
  "invalid-text": "Expected well-formed reading text.",
  "input-limit": "Reflective-language text exceeds the input limit.",
  "match-limit": "Reflective-language text exceeds the match limit.",
  "output-limit": "Reflective-language assessment exceeds the output byte limit."
};

export class ReflectiveLanguageError extends Error {
  constructor(code) {
    super(messages[code]);
    this.name = "ReflectiveLanguageError";
    this.code = code;
  }
}
const refuse = (code) => { throw new ReflectiveLanguageError(code); };

function checkOptions(options) {
  let selection;
  try { selection = JSON.parse(canonicalJson(options)); } catch { refuse("invalid-options"); }
  if (!selection || typeof selection !== "object" || Array.isArray(selection) ||
      Object.keys(selection).some((key) => !["rubricId", "rubricVersion"].includes(key))) {
    refuse("invalid-options");
  }
  if ((Object.hasOwn(selection, "rubricId") && selection.rubricId !== policy.id) ||
      (Object.hasOwn(selection, "rubricVersion") && selection.rubricVersion !== policy.version)) {
    refuse("unsupported-rubric");
  }
}

// Text is never normalized or rewritten: regex indices address the original
// UTF-16 string. Unicode word guards keep matches out of larger word tokens.
function rawMatches(text) {
  const matches = [];
  const byRule = Object.fromEntries(policy.rules.map(({ id }) => [id, 0]));
  policy.rules.forEach((rule, ruleIndex) => {
    // A fresh regex per invocation prevents lastIndex leaking across calls.
    const expression = new RegExp(rule.pattern, policy.matching.flags);
    for (const match of text.matchAll(expression)) {
      if (matches.length === REFLECTIVE_LIMITS.matches) refuse("match-limit");
      matches.push({ start: match.index, end: match.index + match[0].length, ruleIndex });
      byRule[rule.id]++;
    }
  });
  matches.sort((a, b) => a.start - b.start || a.end - b.end || a.ruleIndex - b.ruleIndex);
  return { matches, byRule };
}

function mergeMatches(matches, text) {
  const groups = [];
  for (const match of matches) {
    const previous = groups.at(-1);
    if (previous && match.start < previous.end) {
      previous.end = Math.max(previous.end, match.end);
      previous.ruleIndices.add(match.ruleIndex);
    } else {
      groups.push({ start: match.start, end: match.end, ruleIndices: new Set([match.ruleIndex]) });
    }
  }
  return groups.map(({ start, end, ruleIndices }, index) => {
    const rules = policy.rules.filter((_, ruleIndex) => ruleIndices.has(ruleIndex));
    return {
      id: "language-" + (index + 1), ruleIds: rules.map(({ id }) => id),
      penaltyPoints: Math.max(...rules.map(({ penaltyPoints }) => penaltyPoints)),
      span: { start, end, quote: text.slice(start, end) }
    };
  });
}

/** Assess unchanged text independently of claims or chart facts.
 * No engine, backend, network request, file output or caller mutation occurs.
 * Evidence quotes are rejected-input diagnostics, not interpretation examples.
 */
export function checkReflectiveLanguage(text, options = {}) {
  checkOptions(options);
  if (typeof text !== "string") refuse("invalid-text");
  // Every code point needs at most two UTF-16 units. Refuse huge strings
  // before counting, and never allocate an array proportional to caller input.
  if (text.length > REFLECTIVE_LIMITS.textCodePoints * 2) refuse("input-limit");
  if (!text.isWellFormed()) refuse("invalid-text");
  let codePoints = 0;
  for (const character of text) {
    codePoints++;
    if (codePoints > REFLECTIVE_LIMITS.textCodePoints) refuse("input-limit");
  }
  const { matches, byRule } = rawMatches(text);
  const findings = mergeMatches(matches, text);
  const rawPenaltyPoints = findings.reduce((sum, finding) => sum + finding.penaltyPoints, 0);
  const maximum = policy.scoring.maximum;
  const appliedPenaltyPoints = Math.min(maximum, rawPenaltyPoints);
  const empty = text.trim().length === 0;
  const result = {
    schemaVersion: "1.0.0", dimension: policy.dimension,
    status: empty ? "unassessed" : findings.length ? "flagged" : "no-detected-violations",
    rubric: { id: policy.id, version: policy.version, digest: sha256(policyBytes) },
    implementation,
    input: { textDigest: sha256(text), utf16CodeUnits: text.length, codePoints },
    offsetUnit: policy.input.offsetUnit,
    counts: { matches: matches.length, findings: findings.length, byRule },
    score: { points: empty ? null : maximum - appliedPenaltyPoints,
      maximum, rawPenaltyPoints, appliedPenaltyPoints },
    findings, limits: REFLECTIVE_LIMITS, limitations: policy.limitations
  };
  // Reserve the trailing newline for callers writing compact report JSON.
  try { canonicalJson(result, REFLECTIVE_LIMITS.reportBytes - 1); } catch { refuse("output-limit"); }
  return freezeData(result);
}
