import test from 'node:test';
import assert from 'node:assert/strict';
import {createChartReceipt, digest, seal} from '../src/core.mjs';
import {analyzeUncertainty} from '../src/uncertainty.mjs';
import {verifyClaims} from '../src/claims.mjs';

// All astronomical values here are analytic synthetic fixtures, not sky references.
const MODEL = {
  engine: 'analytic-synthetic-test-fixture', engineVersion: 'test-1',
  artifact: {digest: digest({synthetic: true}), scope: 'synthetic fixture; no engine artifact'},
  conventions: {zodiac: 'synthetic tropical', origin: 'synthetic geocentric', frame: 'synthetic ecliptic',
    corrections: 'none; analytic fixture', timeScale: 'UTC civil fixture', deltaT: 'not applicable'},
};
function receipt({subjectId = 'subject-a', timeKnowledge = 'exact', facts} = {}) {
  return createChartReceipt({schema: 'zodiacs.verify.chart.v1', subjectId,
    context: {utc: '2026-01-01T00:00:00.000Z', latitude: 0, longitude: 0, timeKnowledge,
      requestedHouseSystem: 'whole-sign', effectiveHouseSystem: timeKnowledge === 'exact' ? 'whole-sign' : null},
    model: MODEL, facts: facts ?? [{id: 'sun-sign', kind: 'sign', entity: 'Sun', value: 'Aries', scope: 'instant'}], warnings: []});
}
const factClaim = (r, overrides = {}) => ({id: 'fact-a', kind: 'fact', subjectId: r.subjectId,
  receiptId: r.id, factId: 'sun-sign', expected: 'Aries', scope: 'instant', ...overrides});
const RULE = {id: 'editorial-rule-a', tradition: 'Explicitly synthetic editorial fixture',
  source: {title: 'Synthetic test rule', locator: 'claims.node-test.mjs: RULE'},
  statement: 'Use this rule only to test provenance and dependency wiring.', epistemicStatus: 'editorial'};
const interp = (overrides = {}) => ({id: 'interpretation-a', kind: 'interpretation', subjectId: 'subject-a',
  ruleId: RULE.id, basedOn: ['fact-a'], text: 'An arbitrary interpretation; semantic truth is not tested.', ...overrides});
const reseal = obj => { const {id, ...payload} = structuredClone(obj); return seal(payload); };
const result = (out, id) => out.results.find(r => r.claimId === id);
function goodFactInput() {
  const r = receipt();
  return {receipts: [r], claims: [factClaim(r)], trustedReceiptIds: [r.id]};
}
async function report({bounded = true, variable = false, subjectId = 'subject-a'} = {}) {
  const from = '2026-01-01T00:00:00.000Z';
  const to = '2026-01-01T00:01:00.000Z';
  return analyzeUncertainty({subjectId, model: MODEL, intervals: [{from, to}],
    features: [{id: 'sun-stability', kind: 'sign', body: 'Sun'}],
    sample: async ms => ({longitudes: {Sun: variable ? 29 + 2 * (ms - Date.parse(from)) / 60000 : 15}, warnings: []}),
    ...(bounded ? {bounds: {assumptions: [{id: 'synthetic-bound-sun', body: 'Sun',
      source: {title: 'Analytic synthetic function', locator: 'claims.node-test.mjs: constant 15 degrees'},
      modelDigest: digest(MODEL), domain: {from, to}, maxAbsRateDegPerDay: 0, absoluteErrorDeg: 0}]}} : {}),
    maxSamples: 64, resolutionMs: 1000});
}
const intervalClaim = (r, overrides = {}) => ({id: 'interval-a', kind: 'interval', subjectId: r.subjectId,
  reportId: r.id, featureId: 'sun-stability', expected: 'Aries', scope: 'interval', ...overrides});
async function goodIntervalInput() {
  const r = await report();
  return {uncertaintyReports: [r], claims: [intervalClaim(r)], trustedReportIds: [r.id], trustedBoundIds: ['synthetic-bound-sun']};
}

test('matching typed instant fact requires explicit trusted receipt', () => {
  const input = goodFactInput();
  assert.equal(verifyClaims(input).allSupported, true);
  assert.equal(verifyClaims({...input, trustedReceiptIds: []}).results[0].status, 'rejected');
});

test('receipt seal is integrity only: modified payload and wrong subject cannot support', () => {
  const input = goodFactInput();
  const altered = structuredClone(input.receipts[0]);
  altered.facts[0].value = 'Taurus';
  assert.equal(verifyClaims({...input, receipts: [altered]}).results[0].status, 'rejected');
  const out = verifyClaims({...input, claims: [factClaim(input.receipts[0], {subjectId: 'subject-b'})]});
  assert.equal(out.results[0].status, 'rejected');
  assert.match(out.results[0].reasons.join(' '), /subject/);
});

test('numeric equality is typed and exact without implicit tolerance', () => {
  const r = receipt({facts: [{id: 'sun-longitude', kind: 'longitude', entity: 'Sun', value: 15, unit: 'deg', scope: 'instant'}]});
  for (const expected of ['15', 15.00000000001, true, null]) {
    const out = verifyClaims({receipts: [r], trustedReceiptIds: [r.id],
      claims: [factClaim(r, {factId: 'sun-longitude', expected})]});
    assert.equal(out.results[0].status, 'rejected');
  }
});

test('missing evidence is unresolved only when its ID was explicitly trusted', () => {
  const r = receipt();
  const input = {claims: [factClaim(r)], trustedReceiptIds: [r.id]};
  assert.equal(verifyClaims(input).results[0].status, 'unresolved');
  assert.equal(verifyClaims({...input, trustedReceiptIds: []}).results[0].status, 'rejected');
});

test('reference-time receipt cannot support angle, angular-aspect or house claims', () => {
  const candidates = [
    {id: 'test', kind: 'sign', entity: 'Ascendant', value: 'Aries', scope: 'instant'},
    {id: 'test', kind: 'longitude', entity: 'Midheaven', value: 15, unit: 'deg', scope: 'instant'},
    {id: 'test', kind: 'aspect', entity: 'Sun|Ascendant|angle=0|orb=10', value: true, scope: 'instant'},
    {id: 'test', kind: 'house', entity: 'Sun', value: 1, scope: 'instant'},
  ];
  for (const fact of candidates) {
    // A correctly sealed document may still be inappropriate for this scope.
    const exact = receipt({facts: [fact]});
    const payload = structuredClone(exact);
    payload.context.timeKnowledge = 'reference';
    payload.context.effectiveHouseSystem = null;
    const r = reseal(payload);
    const out = verifyClaims({receipts: [r], trustedReceiptIds: [r.id],
      claims: [factClaim(r, {factId: fact.id, expected: fact.value})]});
    assert.equal(out.results[0].status, 'rejected');
  }
});

test('reference-time receipt can describe a planetary instant without promoting it to natal certainty', () => {
  const r = receipt({timeKnowledge: 'reference'});
  assert.equal(verifyClaims({receipts: [r], trustedReceiptIds: [r.id], claims: [factClaim(r)]}).allSupported, true);
});

test('reference-time support uses an explicit vocabulary and aspect grammar, not guessed entity semantics', () => {
  for (const entity of ['RisingSign', 'ascendantNatal', 'Sun Ascendant', 'CustomPoint', 'sun']) {
    const r = receipt({timeKnowledge: 'reference', facts: [{id: 'custom', kind: 'sign', entity, value: 'Aries', scope: 'instant'}]});
    const out = verifyClaims({receipts: [r], trustedReceiptIds: [r.id], claims: [factClaim(r, {factId: 'custom'})]});
    assert.equal(out.results[0].status, 'rejected');
    assert.match(out.results[0].reasons.join(' '), /unrecognized entity semantics/);
  }
  for (const [entity, status] of [
    ['Sun|Moon|angle=90|orb=2', 'supported'],
    ['Sun|Ascendant|angle=90|orb=2', 'rejected'],
    ['Sun|Moon|angle=90|orb=2|hidden=Ascendant', 'rejected'],
    ['Sun|Sun|angle=90|orb=2', 'rejected'],
    ['Sun|Moon|angle=Infinity|orb=2', 'rejected'],
    ['Sun|Moon|angle=190|orb=2', 'rejected'],
    ['Sun|Moon', 'rejected'],
  ]) {
    const r = receipt({timeKnowledge: 'reference', facts: [{id: 'aspect', kind: 'aspect', entity, value: true, scope: 'instant'}]});
    assert.equal(verifyClaims({receipts: [r], trustedReceiptIds: [r.id],
      claims: [factClaim(r, {factId: 'aspect', expected: true})]}).results[0].status, status);
  }
});

test('scope substitution and unknown kinds are rejected', () => {
  const input = goodFactInput();
  for (const overrides of [{scope: 'interval'}, {kind: 'scientific-truth'}, {scope: 'natal-life'}]) {
    assert.equal(verifyClaims({...input, claims: [{...input.claims[0], ...overrides}]}).results[0].status, 'rejected');
  }
});

test('duplicate evidence, claim, rule and trust IDs reject the whole ambiguous input', () => {
  const input = goodFactInput();
  const variants = [
    {...input, receipts: [...input.receipts, ...input.receipts]},
    {...input, claims: [...input.claims, ...input.claims]},
    {...input, rules: [RULE, structuredClone(RULE)]},
    {...input, trustedReceiptIds: [...input.trustedReceiptIds, ...input.trustedReceiptIds]},
    {...input, trustedBoundIds: ['x', 'x']},
  ];
  for (const variant of variants) assert.throws(() => verifyClaims(variant), /Duplicate/);
});

test('duplicate fact IDs, even in resealed evidence, fail receipt validation', () => {
  const input = goodFactInput();
  const bad = structuredClone(input.receipts[0]);
  bad.facts.push(structuredClone(bad.facts[0]));
  const r = reseal(bad);
  const out = verifyClaims({receipts: [r], claims: [factClaim(r)], trustedReceiptIds: [r.id]});
  assert.equal(out.allSupported, false);
  assert.equal(out.results[0].status, 'rejected');
});

test('bounded interval needs independently explicit report trust AND every bound trust', async () => {
  const input = await goodIntervalInput();
  assert.equal(verifyClaims(input).allSupported, true);
  assert.equal(verifyClaims({...input, trustedReportIds: []}).results[0].status, 'rejected');
  assert.equal(verifyClaims({...input, trustedBoundIds: []}).results[0].status, 'rejected');
  assert.equal(verifyClaims({...input, trustedBoundIds: ['unrelated-bound']}).results[0].status, 'rejected');
});

test('an aspect interval requires trust in both contributing body bounds', async () => {
  const from = '2026-01-01T00:00:00.000Z', to = '2026-01-01T00:01:00.000Z';
  const assumptions = ['Sun', 'Moon'].map(body => ({id: `analytic-${body}`, body,
    source: {title: 'Constant synthetic position', locator: `claims.node-test.mjs: ${body}`},
    modelDigest: digest(MODEL), domain: {from, to}, maxAbsRateDegPerDay: 0, absoluteErrorDeg: 0}));
  const r = await analyzeUncertainty({subjectId: 'subject-a', model: MODEL,
    intervals: [{from, to}], features: [{id: 'square', kind: 'aspect', a: 'Sun', b: 'Moon', angle: 90, orb: 2}],
    sample: async () => ({longitudes: {Sun: 15, Moon: 105}, warnings: []}), bounds: {assumptions}, maxSamples: 64});
  const input = {uncertaintyReports: [r], trustedReportIds: [r.id],
    claims: [intervalClaim(r, {featureId: 'square', expected: true})]};
  assert.equal(verifyClaims({...input, trustedBoundIds: ['analytic-Sun', 'analytic-Moon']}).allSupported, true);
  assert.equal(verifyClaims({...input, trustedBoundIds: ['analytic-Sun']}).results[0].status, 'rejected');
});

test('same samples never establish interval stability; variable witnesses reject one stable value', async () => {
  for (const variable of [false, true]) {
    const r = await report({bounded: false, variable});
    const out = verifyClaims({uncertaintyReports: [r], trustedReportIds: [r.id], claims: [intervalClaim(r)]});
    assert.equal(out.allSupported, false);
    assert.equal(out.results[0].status, variable ? 'rejected' : 'unresolved');
  }
});

test('malformed resealed report cannot promote sampled evidence into stable bounded evidence', async () => {
  const original = await report({bounded: false});
  const forged = structuredClone(original);
  forged.results[0].status = 'stable';
  forged.results[0].coverage = 'bounded';
  const r = reseal(forged);
  const out = verifyClaims({uncertaintyReports: [r], trustedReportIds: [r.id],
    trustedBoundIds: ['invented'], claims: [intervalClaim(r)]});
  assert.equal(out.results[0].status, 'rejected');
  assert.match(out.results[0].reasons.join(' '), /Malformed uncertainty report/);
});

test('interval subject, expected value, absent feature and scope must match', async () => {
  const input = await goodIntervalInput();
  for (const overrides of [{subjectId: 'someone-else'}, {expected: 'Taurus'}, {featureId: 'absent'}, {scope: 'instant'}]) {
    assert.equal(verifyClaims({...input, claims: [intervalClaim(input.uncertaintyReports[0], overrides)]}).results[0].status, 'rejected');
  }
});

test('report IDs cannot collide or duplicate', async () => {
  const input = await goodIntervalInput();
  assert.throws(() => verifyClaims({...input, uncertaintyReports: [...input.uncertaintyReports, ...input.uncertaintyReports]}), /Duplicate/);
});

test('one bound ID cannot carry different semantics across reports, while exact reuse is allowed', async () => {
  const input = await goodIntervalInput();
  const reused = structuredClone(input.uncertaintyReports[0]);
  reused.subjectId = 'subject-b';
  assert.equal(verifyClaims({...input, uncertaintyReports: [...input.uncertaintyReports, reseal(reused)]}).allSupported, true);
  reused.boundAssumptions[0].source.title = 'A different asserted source';
  assert.throws(() => verifyClaims({...input, uncertaintyReports: [...input.uncertaintyReports, reseal(reused)]}), /conflicting semantics/);
});

test('interpretation support means provenance/dependencies only, including unrelated prose', () => {
  const input = goodFactInput();
  const out = verifyClaims({...input, rules: [RULE], trustedRuleIds: [RULE.id],
    claims: [interp({text: 'This prose is intentionally unrelated to the rule; no semantic entailment is claimed.'}), ...input.claims]});
  assert.equal(out.allSupported, true);
  assert.equal(out.results[0].claimId, 'interpretation-a'); // Output remains input order.
  assert.match(out.results[0].reasons.join(' '), /does not establish.*semantic entailment/);
  assert.match(out.limitations.join(' '), /ONLY/);
});

test('interpretation requires explicit rule trust and complete source provenance', () => {
  const input = goodFactInput();
  const setup = {...input, rules: [RULE], claims: [...input.claims, interp()]};
  assert.equal(result(verifyClaims(setup), 'interpretation-a').status, 'rejected');
  const incomplete = {...RULE, source: {title: RULE.source.title, locator: ''}};
  assert.equal(result(verifyClaims({...setup, rules: [incomplete], trustedRuleIds: [RULE.id]}), 'interpretation-a').status, 'rejected');
});

test('cross-subject or missing prerequisites cannot support an interpretation', () => {
  const input = goodFactInput();
  for (const overrides of [{subjectId: 'subject-b'}, {basedOn: ['missing']}, {basedOn: []}, {basedOn: ['fact-a', 'fact-a']}]) {
    const out = verifyClaims({...input, rules: [RULE], trustedRuleIds: [RULE.id], claims: [...input.claims, interp(overrides)]});
    assert.equal(result(out, 'interpretation-a').status, 'rejected');
  }
});

test('dependency cycles and all downstream dependents are rejected independently of array order', () => {
  const input = goodFactInput();
  const claims = [interp({id: 'downstream', basedOn: ['cycle-b']}),
    interp({id: 'cycle-a', basedOn: ['cycle-b']}), interp({id: 'cycle-b', basedOn: ['cycle-a']}),
    interp({id: 'self', basedOn: ['self']}), ...input.claims];
  const out = verifyClaims({...input, rules: [RULE], trustedRuleIds: [RULE.id], claims});
  assert.equal(result(out, 'fact-a').status, 'supported');
  for (const id of ['downstream', 'cycle-a', 'cycle-b', 'self']) {
    assert.equal(result(out, id).status, 'rejected');
    assert.match(result(out, id).reasons.join(' '), /cycle/);
  }
});

test('rejected versus unresolved prerequisites propagate without becoming interpretation support', () => {
  const r = receipt();
  const setup = {claims: [factClaim(r), interp()], rules: [RULE], trustedRuleIds: [RULE.id]};
  assert.equal(result(verifyClaims(setup), 'interpretation-a').status, 'rejected');
  assert.equal(result(verifyClaims({...setup, trustedReceiptIds: [r.id]}), 'interpretation-a').status, 'unresolved');
});

test('unused malformed supplied evidence cannot yield blanket allSupported', () => {
  const input = goodFactInput();
  const malformed = {id: 'malformed-report', schema: 'wrong'};
  const out = verifyClaims({...input, uncertaintyReports: [malformed]});
  assert.equal(out.results[0].status, 'supported');
  assert.equal(out.allSupported, false);
  assert.match(out.limitations.join(' '), /failed validation/);
});

test('empty, malformed and typo-bearing input cannot silently approve', () => {
  assert.equal(verifyClaims().allSupported, false);
  for (const bad of [null, [], {claims: null}, {claim: []}, {claims: [{kind: 'fact'}]}, {claims: [undefined]}]) {
    assert.throws(() => verifyClaims(bad));
  }
});

test('prototype-looking opaque IDs do not resolve inherited properties', () => {
  const input = goodFactInput();
  const out = verifyClaims({...input, claims: [{...input.claims[0], id: '__proto__'},
    interp({basedOn: ['constructor']})], rules: [RULE], trustedRuleIds: [RULE.id]});
  assert.equal(result(out, '__proto__').status, 'supported');
  assert.equal(result(out, 'interpretation-a').status, 'rejected');
});

test('long acyclic dependency chains are evaluated iteratively', () => {
  const input = goodFactInput();
  const chain = Array.from({length: 2500}, (_, i) => interp({id: `step-${i}`, basedOn: [i ? `step-${i-1}` : 'fact-a']}));
  const out = verifyClaims({...input, rules: [RULE], trustedRuleIds: [RULE.id], claims: [...chain.reverse(), ...input.claims]});
  assert.equal(out.allSupported, true);
  assert.equal(result(out, 'step-2499').status, 'supported');
});
