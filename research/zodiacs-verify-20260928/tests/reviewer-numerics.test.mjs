import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalize,digest,seal,verifySeal,normalize,signOf,SIGNS,createChartReceipt} from '../src/core.mjs';
import {compareCharts} from '../src/compare.mjs';
import {analyzeUncertainty,validateUncertaintyReport} from '../src/uncertainty.mjs';
import {verifyClaims} from '../src/claims.mjs';

// All oracle functions below are analytic synthetic examples, not astronomy.
const BASE=Date.parse('2000-01-01T00:00:00.000Z');
const utc=s=>new Date(BASE+s*1000).toISOString();
const model={engine:'independent-review-synthetic',engineVersion:'1',artifact:{digest:'sha256:'+'0'.repeat(64),scope:'analytic test fixture'},conventions:{zodiac:'tropical',origin:'synthetic',frame:'synthetic',corrections:'none',timeScale:'test milliseconds',deltaT:'not applicable'}};
const feature={id:'sign',kind:'sign',body:'Sun'};
const bound=(body='Sun',rate=0,error=0)=>({id:`reviewer-bound-${body}`,body,source:{title:'Synthetic analytic review fixture',locator:'tests/reviewer-numerics.test.mjs'},modelDigest:digest(model),domain:{from:utc(0),to:utc(100)},maxAbsRateDegPerDay:rate,absoluteErrorDeg:error});
function request(fn=()=>10, overrides={}) {
  return {subjectId:'reviewer-subject',model,intervals:[{from:utc(0),to:utc(10)}],features:[feature],
    sample:async ms=>({longitudes:{Sun:fn((ms-BASE)/1000),Moon:0},warnings:[]}),
    maxSamples:3,resolutionMs:1000,...overrides};
}
function reseal(report,mutate) { const copy=structuredClone(report);delete copy.id;mutate(copy);return seal(copy); }
function receipt({longitude=10,entity='Sun',extraFacts=[],context={},provider={},facts}={}) {
  return createChartReceipt({schema:'zodiacs.verify.chart.v1',subjectId:'reviewer-subject',
    context:{utc:utc(0),latitude:0,longitude:0,timeKnowledge:'exact',requestedHouseSystem:'whole',effectiveHouseSystem:'whole',...context},
    model:{...model,...provider},facts:facts??[{id:'position',kind:'longitude',entity,value:longitude,unit:'deg',scope:'instant'},...extraFacts],warnings:[]});
}
function claimFor(report) {
  return {id:'interval-claim',kind:'interval',subjectId:'reviewer-subject',reportId:report.id,featureId:'sign',expected:'Aries',scope:'interval'};
}
function previous(value) {
  const b=new DataView(new ArrayBuffer(8));b.setFloat64(0,value);b.setBigUint64(0,b.getBigUint64(0)-1n);return b.getFloat64(0);
}

test('independent: every sign cusp retains the preceding representable longitude',()=>{
  for(let cusp=30;cusp<=360;cusp+=30){
    const before=previous(cusp);assert.equal(normalize(before),before);assert.equal(signOf(before),SIGNS[cusp/30-1]);
    assert.equal(signOf(cusp),SIGNS[(cusp/30)%12]);
  }
  assert.equal(signOf(-Number.MIN_VALUE),'Pisces');
});
test('independent: array methods are never executed while canonicalizing',()=>{
  let invoked=false;const a=[1];Object.defineProperty(a,'map',{value:()=>{invoked=true;return ['"substitution"'];}});
  assert.throws(()=>canonicalize(a));assert.equal(invoked,false);
  class SubstitutingArray extends Array { map(){invoked=true;return ['"substitution"'];} }
  assert.throws(()=>canonicalize(new SubstitutingArray(1,2)));assert.equal(invoked,false);
});
test('independent: poison-key content survives the seal without mutating prototypes',()=>{
  const input=JSON.parse('{"__proto__":{"reviewerPolluted":true},"constructor":"x","prototype":3}');
  const sealed=seal(input);assert(verifySeal(sealed));assert(Object.hasOwn(sealed,'__proto__'));
  assert.equal(Object.prototype.reviewerPolluted,undefined);assert.notEqual(digest(input),digest({constructor:'x',prototype:3}));
});
test('independent: comparison preserves wrap, missing facts and fact-ID semantics',()=>{
  const close=compareCharts(receipt({longitude:359.999}),receipt({longitude:0.001}),{longitudeToleranceArcsec:8});
  assert.equal(close.facts[0].status,'within-tolerance');assert(Math.abs(close.facts[0].deltaArcsec-7.2)<1e-7);
  const changedEntity=compareCharts(receipt(),receipt({entity:'Moon'}));assert.equal(changedEntity.facts[0].status,'semantic-conflict');
  const missing=compareCharts(receipt(),receipt({facts:[]}));assert.equal(missing.facts[0].status,'missing');assert.equal(missing.verdict,'disagreement-or-incomplete');
});
test('independent: invalid tolerance fails and model changes remain different assumptions',()=>{
  for(const value of [-1,NaN,Infinity,'1'])assert.throws(()=>compareCharts(receipt(),receipt(),{longitudeToleranceArcsec:value}));
  const other=receipt({provider:{conventions:{...model.conventions,frame:'other'}}});
  const out=compareCharts(receipt(),other);assert.equal(out.comparable,false);assert.equal(out.verdict,'different-assumptions');
});
test('independent: a narrow hidden sign excursion is never declared stable',async()=>{
  // Triangle reaches30.5 at2.25s; every one of the three requested samples is29.5.
  const fn=t=>29.5+Math.max(0,1-Math.abs(t-2.25)/0.1);
  assert.equal(signOf(fn(2.25)),'Taurus');
  const r=await analyzeUncertainty(request(fn,{bounds:{assumptions:[bound('Sun',864000)]}}));
  assert.deepEqual(r.results[0].values,['Aries']);assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('independent: unsampled sign tangency retains an unresolved region',async()=>{
  const fn=t=>30-(t-2.25)**2/100;
  const r=await analyzeUncertainty(request(fn,{bounds:{assumptions:[bound('Sun',13392)]}}));
  assert.deepEqual(r.results[0].values,['Aries']);assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('independent: an exact unsampled aspect contact is not excluded by false samples',async()=>{
  const f={id:'contact',kind:'aspect',a:'Sun',b:'Moon',angle:0,orb:0};
  const r=await analyzeUncertainty(request(t=>(t-2.25)**2,{features:[f],bounds:{assumptions:[bound('Sun',1339200),bound('Moon')]}}));
  assert.deepEqual(r.results[0].values,[false]);assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('independent: nextfloat cusp with positive evaluation error cannot certify a sign',async()=>{
  const r=await analyzeUncertainty(request(()=>previous(30),{bounds:{assumptions:[bound('Sun',0,1e-12)]}}));
  assert.deepEqual(r.results[0].values,['Aries']);assert.equal(r.results[0].status,'unresolved');
});
test('independent: very large rates and overflowing enclosures fail closed',async()=>{
  for(const rate of [360000,Number.MAX_VALUE]){
    const r=await analyzeUncertainty(request(()=>10,{bounds:{assumptions:[bound('Sun',rate)]},resolutionMs:10000}));
    assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
  }
});
test('independent: nonadjacent error-bound contradiction cannot support stable coverage',async()=>{
  // L=0 implies one fixed true longitude. Observations10 and13 with error1
  // have disjoint allowed sets, even though adjacent observations differ1.5.
  const r=await analyzeUncertainty(request(t=>10+0.3*t,{bounds:{assumptions:[bound('Sun',0,1)]}}));
  assert.notEqual(r.results[0].status,'stable');assert.equal(r.complete,false);
  assert(r.boundViolations.length>0,'Endpoint inconsistency must be recorded.');
  assert.throws(()=>validateUncertaintyReport(reseal(r,x=>{x.boundViolations=[];})),/contradiction|consistency/i);
  const claim=verifyClaims({uncertaintyReports:[r],claims:[claimFor(r)],trustedReportIds:[r.id],trustedBoundIds:['reviewer-bound-Sun']});
  assert.equal(claim.allSupported,false);assert.notEqual(claim.results[0].status,'supported');
});
test('independent: reference bound domains and model identity are enforced',async()=>{
  for(const mutate of [b=>b.domain.from=utc(1),b=>b.domain.to=utc(9),b=>b.modelDigest=digest({other:true}),b=>b.absoluteErrorDeg=-1]){
    const b=bound();mutate(b);await assert.rejects(analyzeUncertainty(request(()=>10,{bounds:{assumptions:[b]}})));
  }
});
test('independent: failures share one call budget and preserve both disjoint components',async()=>{
  let calls=0;const r=await analyzeUncertainty(request(()=>10,{intervals:[{from:utc(0),to:utc(1)},{from:utc(50),to:utc(51)}],maxSamples:2,
    features:[feature,{id:'moon',kind:'sign',body:'Moon'}],sample:async()=>{calls++;throw Error('synthetic failure');}}));
  assert.equal(calls,2);assert.equal(r.budget.callsUsed,2);assert.equal(r.intervals.length,2);
  for(const result of r.results){assert.equal(result.status,'unresolved');assert.equal(result.unresolvedRanges.length,2);}
});
test('independent: missing bodies never become bounded through another body bound',async()=>{
  const r=await analyzeUncertainty(request(()=>10,{features:[{id:'mars',kind:'sign',body:'Mars'}],bounds:{assumptions:[bound('Mars')]}}));
  assert.equal(r.results[0].status,'unresolved');assert.deepEqual(r.results[0].values,[]);assert.equal(r.complete,false);
});
test('independent: resealed status and deleted domain evidence are rejected',async()=>{
  const sampled=await analyzeUncertainty(request());
  assert.throws(()=>validateUncertaintyReport(reseal(sampled,r=>{r.complete=true;r.results[0].status='stable';r.results[0].coverage='bounded';})));
  const stable=await analyzeUncertainty(request(()=>10,{bounds:{assumptions:[bound()]},intervals:[{from:utc(0),to:utc(1)},{from:utc(50),to:utc(51)}],maxSamples:6}));
  assert.equal(stable.results[0].status,'stable');
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.results[0].cells.pop())));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.results[0].cells[0].value='Taurus')));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.boundAssumptions[0].absoluteErrorDeg=180)));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>{r.samples[0].utc=utc(25);})),/sample/i);
});
test('independent: claim checker requires both report and bound trust',async()=>{
  const report=await analyzeUncertainty(request(()=>10,{bounds:{assumptions:[bound()]}}));
  const base={uncertaintyReports:[report],claims:[claimFor(report)]};
  assert.equal(verifyClaims({...base,trustedBoundIds:['reviewer-bound-Sun']}).allSupported,false);
  assert.equal(verifyClaims({...base,trustedReportIds:[report.id]}).allSupported,false);
  assert.equal(verifyClaims({...base,trustedReportIds:[report.id],trustedBoundIds:['reviewer-bound-Sun']}).allSupported,true);
});
test('independent: trusting a resealed false stable report does not bypass evidence validation',async()=>{
  const sampled=await analyzeUncertainty(request());
  const forged=reseal(sampled,r=>{r.complete=true;r.results[0].status='stable';r.results[0].coverage='bounded';});
  const result=verifyClaims({uncertaintyReports:[forged],claims:[claimFor(forged)],trustedReportIds:[forged.id],trustedBoundIds:['reviewer-bound-Sun']});
  assert.equal(result.allSupported,false);assert.equal(result.results[0].status,'rejected');
});
