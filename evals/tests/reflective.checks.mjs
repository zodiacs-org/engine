import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { checkReflectiveLanguage, REFLECTIVE_LIMITS } from "../lib/check-reflective-language.mjs";
import { sha256 } from "../lib/generator-data.mjs";

const policyBytes = readFileSync(new URL("../rubrics/reflective-v1.json", import.meta.url), "utf8");
const policy = JSON.parse(policyBytes);

// Original, individually written MIT test prose. No external interpretation
// text, personal chart data or generated corpus is used. Negative fixtures in
// this file are explicitly rejected input, never suggested reading language.
const reflective = [
  "Consider what steady effort means to you.",
  "You may reflect on how you express curiosity.",
  "You might explore how you balance rest and initiative.",
  "Notice whether this symbolic prompt fits your experience.",
  "At the supplied instant, Sun is in taurus.",
  "The computed return is an instant; values retain their units.",
  "Free will and personal choice remain yours.",
  "A stockpile of observations and priceless memories can inform reflection.",
  "This prompt offers no certainty about events.",
  "YOUR VALUES are a subject for reflection.",
  "A sense of worth need not depend on a symbolic description."
];
const rejectedInput = [
  ["You will meet a new partner.", "future-assertion", "You will"],
  ["Your career will improve.", "future-assertion", "Your career will"],
  ["You'll receive an invitation.", "future-assertion", "You'll"],
  ["You’ll receive an invitation.", "future-assertion", "You’ll"],
  ["You're going to win a contest.", "future-assertion", "You're going to"],
  ["You’re going to win a contest.", "future-assertion", "You’re going to"],
  ["You won't recover.", "future-assertion", "You won't"],
  ["You will not meet the visitor.", "future-assertion", "You will"],
  ["Sun will enter aries.", "future-assertion", "Sun will"],
  ["They shall receive an invitation.", "future-assertion", "They shall"],
  ["You might soon win a contest.", "hedged-outcome", "You might soon win"],
  ["You may not meet the visitor.", "hedged-outcome", "You may not meet"],
  ["Your work may gain recognition.", "hedged-outcome", "Your work may gain"],
  ["Next month brings a new relationship.", "future-period-outcome", "Next month brings"],
  ["Tomorrow offers a promotion.", "future-period-outcome", "Tomorrow offers"],
  ["The coming weeks hold romance.", "future-period-outcome", "The coming weeks hold"],
  ["This placement guarantees success.", "promised-outcome", "guarantees success"],
  ["You are destined to succeed.", "promised-outcome", "destined to"],
  ["The chart predicts a promotion.", "promised-outcome", "predicts a promotion"],
  ["Money shapes this symbolic question.", "financial-language", "Money"],
  ["Consider prices.", "financial-language", "prices"],
  ["An investment deserves attention.", "financial-language", "investment"],
  ["Invest in the asset.", "financial-language", "Invest"],
  ["A stock price is mentioned.", "financial-language", "stock"],
  ["$50 is annotated here.", "financial-language", "$"]
];

test("reflective policy is original, versioned, bounded and separate from factual correctness", () => {
  assert.equal(policy.id, "chart-reading-reflective");
  assert.equal(policy.version, "1.0.0");
  assert.equal(policy.dimension, "reflective-not-predictive");
  assert.equal(policy.license.spdxId, "MIT");
  assert.match(policy.license.attribution, /original/);
  assert.deepEqual(REFLECTIVE_LIMITS, {
    textCodePoints: 32768, matches: 512, reportBytes: 1048576
  });
  const readingSchema = JSON.parse(readFileSync(
    new URL("../schema/reading.schema.json", import.meta.url), "utf8"
  ));
  assert.equal(REFLECTIVE_LIMITS.textCodePoints, readingSchema.properties.text.maxLength);
  assert.equal(policy.scoring.calibrated, false);
  assert.equal(policy.scoring.compositeWithFactualScore, false);
  assert.equal(policy.input.source, "entire-unchanged-reading-text");
  assert.equal(policy.input.claimsRequired, false);
  assert.equal(new Set(policy.rules.map(({ id }) => id)).size, policy.rules.length);
  for (const rule of policy.rules) {
    assert.equal(rule.penaltyPoints, 25);
    const pattern = new RegExp(rule.pattern, policy.matching.flags);
    assert.equal(pattern.test(""), false);
  }
  const report = checkReflectiveLanguage(reflective[0]);
  assert.equal(report.rubric.digest, sha256(policyBytes));
  assert.equal(report.implementation.id, "deterministic-reflective-language-checker");
  assert.equal(report.implementation.version, "1.0.0");
  assert.match(report.implementation.digest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.limitations, policy.limitations);
});

test("original reflective prompts and computed facts have no detected violations", () => {
  for (const text of reflective) {
    const report = checkReflectiveLanguage(text);
    assert.equal(report.status, "no-detected-violations");
    assert.equal(report.score.points, 100);
    assert.equal(report.score.rawPenaltyPoints, 0);
    assert.deepEqual(report.findings, []);
    assert.equal(report.counts.matches, 0);
  }
});

test("original rejected-input cases receive explicit penalties and exact trigger evidence", () => {
  for (const [text, ruleId, quote] of rejectedInput) {
    const report = checkReflectiveLanguage(text);
    assert.equal(report.status, "flagged");
    const finding = report.findings.find(({ ruleIds, span }) =>
      ruleIds.includes(ruleId) && span.quote === quote);
    assert.ok(finding, "expected rejected-input evidence for rule " + ruleId);
    assert.equal(finding.penaltyPoints, 25);
    assert.deepEqual(finding.span, {
      start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote
    });
    assert.ok(report.score.points < report.score.maximum);
  }
});

test("rejected-input checking ignores casing and allows soft wraps without changing evidence", () => {
  const text = "Consider a symbolic prompt.\r\nYOU\tWILL\nmeet a visitor.";
  const report = checkReflectiveLanguage(text);
  assert.equal(report.counts.matches, 1);
  assert.deepEqual(report.findings[0].span, {
    start: text.indexOf("YOU"), end: text.indexOf("WILL") + 4, quote: "YOU\tWILL"
  });
  assert.equal(report.score.points, 75);
});

test("rejected-input overlaps merge transitively and preserve all rules without multiplying penalties", () => {
  const text = "Next month promises your income will improve.";
  const report = checkReflectiveLanguage(text);
  assert.equal(report.counts.matches, 4);
  assert.equal(report.counts.findings, 1);
  assert.deepEqual(report.findings, [{
    id: "language-1",
    ruleIds: ["future-assertion", "future-period-outcome", "promised-outcome", "financial-language"],
    penaltyPoints: 25,
    span: { start: 0, end: text.indexOf(" improve"), quote: "Next month promises your income will" }
  }]);
  assert.deepEqual(report.score, {
    points: 75, maximum: 100, rawPenaltyPoints: 25, appliedPenaltyPoints: 25
  });
});

test("rejected-input repetition counts each location and caps points without discarding evidence", () => {
  const report = checkReflectiveLanguage("money money money money money");
  assert.equal(report.counts.matches, 5);
  assert.equal(report.counts.findings, 5);
  assert.equal(report.counts.byRule["financial-language"], 5);
  assert.deepEqual(report.score, {
    points: 0, maximum: 100, rawPenaltyPoints: 125, appliedPenaltyPoints: 100
  });
  assert.deepEqual(report.findings.map(({ span }) => span.start), [0, 6, 12, 18, 24]);
  const adjacent = checkReflectiveLanguage("$€");
  assert.equal(adjacent.counts.findings, 2);
  assert.equal(adjacent.score.points, 50);
});

test("rejected input is checked across the whole text with no quotation or negation exemptions", () => {
  const texts = [
    reflective[0] + "\n\nYou will meet a new partner.",
    'The phrase "you will meet" is a rejected example.',
    "It is not true that you will meet someone.",
    "No money discussion belongs here."
  ];
  for (const text of texts) {
    assert.equal(checkReflectiveLanguage(text).status, "flagged");
  }
  // Independent calls and intervening clean prose cannot reset prior evidence
  // or dilute an assessment's penalty by adding unrelated words.
  const before = checkReflectiveLanguage(texts[0]);
  checkReflectiveLanguage(reflective[0]);
  assert.deepEqual(checkReflectiveLanguage(texts[0]), before);
  assert.deepEqual(checkReflectiveLanguage(texts[0] + "\n" + reflective[1]).score, before.score);
});
