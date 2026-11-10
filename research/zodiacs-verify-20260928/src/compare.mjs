import { assert, plain, finite, canonicalize, angularDistance, validateChartReceipt } from './core.mjs';

const equal = (a,b) => canonicalize(a) === canonicalize(b);
function differences(a,b, prefix = '') {
  const result = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const hasA = Object.hasOwn(a,key), hasB = Object.hasOwn(b,key);
    if (hasA && hasB && equal(a[key], b[key])) continue;
    result.push({field:prefix+key, left:hasA ? a[key] : null, right:hasB ? b[key] : null, missing:!hasA ? 'left' : !hasB ? 'right' : null});
  }
  return result;
}
export function compareCharts(left, right, options = {}) {
  plain(options, 'comparison options');
  assert(Object.keys(options).every(k=>k === 'longitudeToleranceArcsec'), 'unknown comparison option');
  const { longitudeToleranceArcsec = 1 } = options;
  validateChartReceipt(left); validateChartReceipt(right);
  finite(longitudeToleranceArcsec, 'longitudeToleranceArcsec');
  assert(longitudeToleranceArcsec >= 0 && longitudeToleranceArcsec <= 648000, 'longitude tolerance must be 0..648000 arcseconds');
  assert(left.subjectId === right.subjectId, 'Different subjects cannot be compared as competing charts');
  const inputDifferences = differences(left.context, right.context, 'context.');
  const conventionDifferences = differences(left.model.conventions, right.model.conventions, 'conventions.');
  const { conventions:lc, ...lp } = left.model, { conventions:rc, ...rp } = right.model;
  const providerDifferences = differences(lp,rp,'model.');
  const comparable = inputDifferences.length === 0 && conventionDifferences.length === 0;
  const lmap = new Map(left.facts.map(f=>[f.id,f])), rmap = new Map(right.facts.map(f=>[f.id,f]));
  const results = [];
  for (const id of [...new Set([...lmap.keys(), ...rmap.keys()])].sort()) {
    const l = lmap.get(id), r = rmap.get(id);
    if (!l || !r) { results.push({factId:id,status:'missing',missing:!l?'left':'right'}); continue; }
    const {value:lv,...ls} = l, {value:rv,...rs} = r;
    if (!equal(ls,rs)) { results.push({factId:id,status:'semantic-conflict',differences:differences(ls,rs)}); continue; }
    if (l.kind === 'longitude') {
      const deltaArcsec = angularDistance(lv,rv) * 3600;
      results.push({factId:id,kind:l.kind,left:lv,right:rv,deltaArcsec,status:deltaArcsec<=longitudeToleranceArcsec?'within-tolerance':'different'});
    } else results.push({factId:id,kind:l.kind,left:lv,right:rv,status:equal(lv,rv)?'equal':'different'});
  }
  const counts = {};
  for (const f of results) counts[f.status] = (counts[f.status] ?? 0) + 1;
  const allSharedFactsAgree = results.length > 0 && results.every(f=>['equal','within-tolerance'].includes(f.status));
  const hasWarnings = left.warnings.length > 0 || right.warnings.length > 0;
  return {
    schema:'zodiacs.verify.comparison.v1', leftReceiptId:left.id, rightReceiptId:right.id,
    subjectId:left.subjectId, comparable, longitudeToleranceArcsec,
    verdict:!comparable?'different-assumptions':allSharedFactsAgree?'agreement-within-threshold':'disagreement-or-incomplete',
    inputDifferences,conventionDifferences,providerDifferences,counts,facts:results,
    warnings:{left:left.warnings,right:right.warnings},
    explanation:!comparable
      ? 'Input or convention differences prevent attributing numerical differences to accuracy. No conversion has been performed.'
      : allSharedFactsAgree
        ? 'Supplied facts agree under the declared settings and requested threshold. Agreement does not establish accuracy.'
        : 'Matched declared settings expose differing, missing or incompatible facts. Independent reference data is required to decide which result is correct.',
    limitations:[
      'Receipt seals verify content integrity, not provider authenticity or astronomical truth.',
      'Declared conventions are compared, not independently verified or converted.',
      'Fact IDs must follow a shared mapping; missing IDs are never treated as agreement.',
      'This comparison is finite and does not establish engine-wide accuracy or equivalence.',
      ...(hasWarnings?['One or both providers returned warnings; inspect them before using results.']:[])
    ]
  };
}
