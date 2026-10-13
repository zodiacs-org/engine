/** Explicit evidence/provenance checking. This module makes no NLP truth claims. */
import {canonicalize, validateChartReceipt} from './core.mjs';
import {validateUncertaintyReport} from './uncertainty.mjs';

const TOP_KEYS = new Set(['receipts', 'uncertaintyReports', 'claims', 'rules',
  'trustedReceiptIds', 'trustedReportIds', 'trustedBoundIds', 'trustedRuleIds']);
const LIMITATIONS = [
  'Supported fact and interval claims are conditional on explicitly trusted evidence and its documented model; seals establish integrity, not authenticity or astronomical correctness.',
  'Supported interval conclusions are conditional on every explicitly trusted bound assumption; this checker does not independently establish the bounds.',
  'Supported interpretations establish reviewed rule provenance and supported same-subject dependencies ONLY. They do not establish scientific truth, predictive validity or semantic entailment of the free text.',
  'This checker does not read prose for hidden factual claims, infer tolerances, resolve birth records, or infer trust from an identifier or source title.',
];
const claimKeys = {
  fact: ['id', 'kind', 'subjectId', 'receiptId', 'factId', 'expected', 'scope'],
  interval: ['id', 'kind', 'subjectId', 'reportId', 'featureId', 'expected', 'scope'],
  interpretation: ['id', 'kind', 'subjectId', 'ruleId', 'basedOn', 'text'],
};
const referenceBodies = new Set(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter',
  'Saturn', 'Uranus', 'Neptune', 'Pluto', 'North Node', 'South Node']);
const own = (obj, key) => Object.hasOwn(obj, key);
const plain = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && (Object.getPrototypeOf(obj) === Object.prototype || Object.getPrototypeOf(obj) === null);
const string = x => typeof x === 'string' && x.trim().length > 0;
const require = (ok, message) => { if (!ok) throw new TypeError(message); };
const shortError = error => String(error?.message ?? error).slice(0, 300);

function exactKeys(obj, keys, label) {
  require(plain(obj), `${label} must be a plain object`);
  const allowed = new Set(keys);
  require(keys.every(key => own(obj, key)), `${label} is missing a required field`);
  require(Object.keys(obj).every(key => allowed.has(key)), `${label} has an unknown field`);
}
function indexById(items, label) {
  const index = new Map();
  for (const item of items) {
    require(plain(item) && string(item.id), `${label} entries require a nonempty string id`);
    require(!index.has(item.id), `Duplicate ${label} id: ${item.id}`);
    index.set(item.id, item);
  }
  return index;
}
function trustedIds(items, label) {
  const set = new Set();
  for (const item of items) {
    require(string(item), `${label} entries must be nonempty strings`);
    require(!set.has(item), `Duplicate ${label} id: ${item}`);
    set.add(item);
  }
  return set;
}
function validateRule(rule) {
  exactKeys(rule, ['id', 'tradition', 'source', 'statement', 'epistemicStatus'], 'Rule');
  require(['id', 'tradition', 'statement'].every(key => string(rule[key])), 'Rule text fields must be nonempty strings');
  exactKeys(rule.source, ['title', 'locator'], 'Rule source');
  require(string(rule.source.title) && string(rule.source.locator), 'Rule source needs a title and locator');
  require(['traditional', 'editorial', 'hypothesis'].includes(rule.epistemicStatus), 'Unknown rule epistemicStatus');
}
function validateClaim(claim) {
  require(own(claimKeys, claim.kind), 'Unknown claim kind');
  exactKeys(claim, claimKeys[claim.kind], `${claim.kind} claim`);
  require(string(claim.id) && string(claim.subjectId), 'Claim requires nonempty id and subjectId');
  if (claim.kind === 'fact') {
    require(string(claim.receiptId) && string(claim.factId), 'Fact claim requires receiptId and factId');
    require(claim.scope === 'instant', 'Fact claim scope must be instant');
  } else if (claim.kind === 'interval') {
    require(string(claim.reportId) && string(claim.featureId), 'Interval claim requires reportId and featureId');
    require(claim.scope === 'interval', 'Interval claim scope must be interval');
  } else {
    require(string(claim.ruleId) && string(claim.text), 'Interpretation requires ruleId and text');
    require(Array.isArray(claim.basedOn) && claim.basedOn.length > 0
      && claim.basedOn.every(string), 'Interpretation requires nonempty explicit basedOn claim IDs');
    require(new Set(claim.basedOn).size === claim.basedOn.length, 'Duplicate interpretation prerequisite ID');
  }
}
function inspect(index, validator) {
  const errors = new Map();
  for (const [id, value] of index) {
    try { validator(value); } catch (error) { errors.set(id, shortError(error)); }
  }
  return errors;
}
function supportedReferenceFact(fact) {
  // Fail closed to the adapter's explicit non-angular vocabulary. Arbitrary
  // entity prose could conceal an angular claim; no NLP inference is attempted.
  if (fact.kind === 'longitude' || fact.kind === 'sign') return referenceBodies.has(fact.entity);
  if (fact.kind !== 'aspect') return false;
  const parts = fact.entity.split('|');
  if (parts.length !== 4 || !referenceBodies.has(parts[0]) || !referenceBodies.has(parts[1])
    || parts[0] === parts[1]) return false;
  const angle = /^angle=((?:0|[1-9]\d*)(?:\.\d+)?)$/.exec(parts[2]);
  const orb = /^orb=((?:0|[1-9]\d*)(?:\.\d+)?)$/.exec(parts[3]);
  return angle !== null && orb !== null && Number(angle[1]) <= 180 && Number(orb[1]) <= 180;
}
const rejected = (id, ...reasons) => ({claimId: id, status: 'rejected', reasons});
const unresolved = (id, ...reasons) => ({claimId: id, status: 'unresolved', reasons});
const supported = (id, ...reasons) => ({claimId: id, status: 'supported', reasons});
const equal = (a, b) => canonicalize(a) === canonicalize(b);

/**
 * Throws on malformed envelope, missing item IDs and duplicate collection/trust IDs.
 * Malformed referenced evidence produces a rejected claim. Any malformed supplied
 * evidence or rule also blocks allSupported, including when it was not referenced.
 * Interpretation support describes provenance/dependencies, never text truth.
 */
export function verifyClaims(options = {}) {
  require(plain(options), 'verifyClaims input must be a plain object');
  require(Object.keys(options).every(key => TOP_KEYS.has(key)), 'Unknown verifyClaims input field');
  canonicalize(options); // Reject non-JSON values and exotic objects before processing.
  const arrays = {};
  for (const key of TOP_KEYS) {
    arrays[key] = own(options, key) ? options[key] : [];
    require(Array.isArray(arrays[key]), `${key} must be an array`);
  }
  const receipts = indexById(arrays.receipts, 'receipt');
  const reports = indexById(arrays.uncertaintyReports, 'uncertainty report');
  const rules = indexById(arrays.rules, 'rule');
  const claims = indexById(arrays.claims, 'claim');
  const trustReceipt = trustedIds(arrays.trustedReceiptIds, 'trusted receipt');
  const trustReport = trustedIds(arrays.trustedReportIds, 'trusted report');
  const trustBound = trustedIds(arrays.trustedBoundIds, 'trusted bound');
  const trustRule = trustedIds(arrays.trustedRuleIds, 'trusted rule');
  const badReceipts = inspect(receipts, validateChartReceipt);
  const badReports = inspect(reports, validateUncertaintyReport);
  const badRules = inspect(rules, validateRule);
  const badClaims = inspect(claims, validateClaim);
  const boundSemantics = new Map();
  for (const report of reports.values()) {
    if (badReports.has(report.id)) continue;
    for (const bound of report.boundAssumptions) {
      const semantics = canonicalize(bound);
      require(!boundSemantics.has(bound.id) || boundSemantics.get(bound.id) === semantics,
        `Bound assumption id has conflicting semantics across reports: ${bound.id}`);
      boundSemantics.set(bound.id, semantics);
    }
  }
  const resultById = new Map();
  const pendingCount = new Map();
  const dependents = new Map([...claims.keys()].map(id => [id, []]));
  // Kahn's algorithm avoids recursion depth limits and detects cycles/dependents.
  for (const [id, claim] of claims) {
    const deps = claim.kind === 'interpretation' && Array.isArray(claim.basedOn)
      ? [...new Set(claim.basedOn.filter(dep => typeof dep === 'string' && claims.has(dep)))] : [];
    pendingCount.set(id, deps.length);
    for (const dep of deps) dependents.get(dep).push(id);
  }
  function factCheck(claim) {
    if (!trustReceipt.has(claim.receiptId)) return rejected(claim.id, 'Receipt is not explicitly trusted.');
    const receipt = receipts.get(claim.receiptId);
    if (!receipt) return unresolved(claim.id, 'Trusted receipt is unavailable.');
    if (badReceipts.has(receipt.id)) return rejected(claim.id, `Malformed chart receipt: ${badReceipts.get(receipt.id)}`);
    if (receipt.subjectId !== claim.subjectId) return rejected(claim.id, 'Receipt subject does not match claim subject.');
    const fact = receipt.facts.find(f => f.id === claim.factId);
    if (!fact) return rejected(claim.id, 'Fact ID is absent from the receipt.');
    if (fact.scope !== 'instant') return rejected(claim.id, 'Receipt fact scope does not match instant claim.');
    if (receipt.context.timeKnowledge === 'reference' && !supportedReferenceFact(fact)) {
      return rejected(claim.id, 'Reference-time receipt cannot support rising, angle, house or unrecognized entity semantics.');
    }
    if (!equal(fact.value, claim.expected)) return rejected(claim.id, 'Expected value does not exactly match the typed receipt fact; no tolerance was inferred.');
    return supported(claim.id, 'Exact same-subject instant fact matches a valid, explicitly trusted receipt.');
  }
  function intervalCheck(claim) {
    if (!trustReport.has(claim.reportId)) return rejected(claim.id, 'Uncertainty report is not explicitly trusted.');
    const report = reports.get(claim.reportId);
    if (!report) return unresolved(claim.id, 'Trusted uncertainty report is unavailable.');
    if (badReports.has(report.id)) return rejected(claim.id, `Malformed uncertainty report: ${badReports.get(report.id)}`);
    if (report.subjectId !== claim.subjectId) return rejected(claim.id, 'Report subject does not match claim subject.');
    const result = report.results.find(r => r.featureId === claim.featureId);
    if (!result) return rejected(claim.id, 'Feature ID is absent from the report results.');
    if (result.status === 'variable') return rejected(claim.id, 'Witnesses differ, so this feature cannot support one stable interval value.');
    if (result.status !== 'stable') return unresolved(claim.id, 'Report does not establish interval stability.');
    if (result.coverage !== 'bounded' || report.assurance !== 'conditional-on-supplied-bounds') {
      return rejected(claim.id, 'Only stability with bounded full-interval coverage can support an interval claim.');
    }
    if (!Array.isArray(result.boundIds) || result.boundIds.length === 0
      || new Set(result.boundIds).size !== result.boundIds.length) {
      return rejected(claim.id, 'Bounded result must identify distinct bound assumptions.');
    }
    const assumptions = new Map((report.boundAssumptions ?? []).map(bound => [bound.id, bound]));
    if (!result.boundIds.every(id => assumptions.has(id) && trustBound.has(id))) {
      return rejected(claim.id, 'Every contributing bound assumption must be declared and explicitly trusted.');
    }
    if (!Array.isArray(result.values) || result.values.length !== 1 || !equal(result.values[0], claim.expected)) {
      return rejected(claim.id, 'Expected value does not exactly match the bounded stable interval value.');
    }
    return supported(claim.id, 'Same-subject interval result is stable under the explicitly trusted report and all contributing bound assumptions.');
  }
  function interpretationCheck(claim) {
    if (!trustRule.has(claim.ruleId)) return rejected(claim.id, 'Interpretation rule is not explicitly trusted.');
    const rule = rules.get(claim.ruleId);
    if (!rule) return unresolved(claim.id, 'Trusted interpretation rule is unavailable.');
    if (badRules.has(rule.id)) return rejected(claim.id, `Malformed interpretation rule: ${badRules.get(rule.id)}`);
    for (const depId of claim.basedOn) {
      const dep = claims.get(depId);
      if (!dep) return rejected(claim.id, `Missing prerequisite claim: ${depId}`);
      if (dep.subjectId !== claim.subjectId) return rejected(claim.id, 'Interpretation prerequisites must have the same subject.');
    }
    const prereqs = claim.basedOn.map(id => resultById.get(id));
    if (prereqs.some(result => !result || result.status === 'rejected')) {
      return rejected(claim.id, 'At least one prerequisite claim is rejected.');
    }
    if (prereqs.some(result => result.status !== 'supported')) return unresolved(claim.id, 'At least one prerequisite claim is unresolved.');
    return supported(claim.id,
      `Rule provenance (${rule.epistemicStatus}) and explicit same-subject dependencies are supported.`,
      'Support does not establish the scientific truth, predictive validity or semantic entailment of this interpretation text.');
  }
  const queue = [...claims.keys()].filter(id => pendingCount.get(id) === 0);
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor];
    const claim = claims.get(id);
    const result = badClaims.has(id) ? rejected(id, `Malformed claim: ${badClaims.get(id)}`)
      : claim.kind === 'fact' ? factCheck(claim)
        : claim.kind === 'interval' ? intervalCheck(claim) : interpretationCheck(claim);
    resultById.set(id, result);
    for (const dependent of dependents.get(id)) {
      pendingCount.set(dependent, pendingCount.get(dependent) - 1);
      if (pendingCount.get(dependent) === 0) queue.push(dependent);
    }
  }
  for (const id of claims.keys()) {
    if (!resultById.has(id)) resultById.set(id, rejected(id, 'Dependency cycle, or dependency on a cycle, prevents support.'));
  }
  const results = [...claims.keys()].map(id => resultById.get(id));
  const limitations = [...LIMITATIONS];
  const malformedEvidenceCount = badReceipts.size + badReports.size + badRules.size;
  if (malformedEvidenceCount) limitations.push(`${malformedEvidenceCount} supplied evidence/rule item(s) failed validation; allSupported is false even when those items were not referenced.`);
  if (results.length === 0) limitations.push('No claims were supplied; no support conclusion is available.');
  return {schema: 'zodiacs.verify.claim-check.v1',
    allSupported: results.length > 0 && malformedEvidenceCount === 0 && results.every(result => result.status === 'supported'),
    results, limitations};
}
