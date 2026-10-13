import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeUncertainty,validateUncertaintyReport} from '../src/uncertainty.mjs';
import {digest,seal} from '../src/core.mjs';

const BASE=Date.parse('2000-01-01T00:00:00.000Z'),utc=t=>new Date(BASE+t*1000).toISOString();
const model={provider:'synthetic-analytic-oracle',version:'1'};
const sign={id:'sun-sign',kind:'sign',body:'Sun'};
function bound(body='Sun',rate=0,error=0){return {id:`analytic-${body}`,body,source:{title:'Synthetic analytic bound, not an astronomical reference',locator:'tests/uncertainty.node-test.mjs'},modelDigest:digest(model),domain:{from:utc(0),to:utc(100)},maxAbsRateDegPerDay:rate,absoluteErrorDeg:error};}
function input(fn=()=>10,overrides={}){return {subjectId:'synthetic-local-subject',model,intervals:[{from:utc(0),to:utc(10)}],features:[sign],sample:async ms=>({longitudes:{Sun:fn((ms-BASE)/1000),Moon:100},warnings:[]}),maxSamples:100,resolutionMs:1000,...overrides};}
function reseal(report,mutate){const copy=structuredClone(report);delete copy.id;mutate(copy);return seal(copy);}

test('identical samples never imply stability without external bounds',async()=>{
  const r=await analyzeUncertainty(input());assert.equal(r.results[0].status,'unresolved');assert.equal(r.results[0].coverage,'sampled');assert.equal(r.complete,false);assert.deepEqual(r.results[0].values,['Aries']);
});
test('external conservative bounds can establish full conditional sign coverage',async()=>{
  const r=await analyzeUncertainty(input(t=>10+t/100,{bounds:{assumptions:[bound('Sun',864,0.001)]}}));assert.equal(r.results[0].status,'stable');assert.equal(r.complete,true);assert.deepEqual(r.results[0].boundIds,['analytic-Sun']);assert.equal(r.assurance,'conditional-on-supplied-bounds');assert.equal(validateUncertaintyReport(r),r);
});
test('circular wrap yields observed variation and unresolved crossing region',async()=>{
  const r=await analyzeUncertainty(input(t=>(359+t/5)%360,{bounds:{assumptions:[bound('Sun',17280,0)]}}));assert.equal(r.results[0].status,'variable');assert.deepEqual(new Set(r.results[0].values),new Set(['Pisces','Aries']));assert.equal(r.complete,false);assert(r.results[0].unresolvedRanges.length>0);
});
test('an exact closed endpoint crossing is not dropped',async()=>{
  const r=await analyzeUncertainty(input(t=>29+t/10,{bounds:{assumptions:[bound('Sun',8640,0)]}}));assert.equal(r.results[0].status,'variable');assert(r.results[0].witnesses.some(w=>w.utc===utc(10)&&w.value==='Taurus'));
});
test('tangency at an unsampled point remains unresolved despite identical sampled signs',async()=>{
  const r=await analyzeUncertainty(input(t=>30-(t-5.5)**2/100,{bounds:{assumptions:[bound('Sun',9504,0)]},maxSamples:3}));assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);assert.deepEqual(r.results[0].values,['Aries']);
});
test('huge rate radii never wrap modulo360 into false stability',async()=>{
  const r=await analyzeUncertainty(input(()=>10,{bounds:{assumptions:[bound('Sun',360000,0)]},resolutionMs:10000}));assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('aspect membership uses inclusive orb and rejects uncertified exact boundary',async()=>{
  const f={id:'sextile',kind:'aspect',a:'Sun',b:'Moon',angle:60,orb:2};
  const common={features:[f],bounds:{assumptions:[bound('Sun'),bound('Moon')]}};
  const stable=await analyzeUncertainty(input(()=>40,common));assert.equal(stable.results[0].status,'stable');assert.deepEqual(stable.results[0].values,[true]);
  const touching=await analyzeUncertainty(input(()=>38,common));assert.deepEqual(touching.results[0].values,[true]);assert.equal(touching.results[0].status,'unresolved');
});
test('position error allowance spanning a cusp prevents stability',async()=>{
  const r=await analyzeUncertainty(input(()=>29.999,{bounds:{assumptions:[bound('Sun',0,0.01)]}}));assert.equal(r.results[0].status,'unresolved');
});
test('zero-duration input can be conditionally stable with exact supplied value bound',async()=>{
  const r=await analyzeUncertainty(input(()=>30,{intervals:[{from:utc(0),to:utc(0)}],bounds:{assumptions:[bound()]}}));assert.equal(r.results[0].status,'stable');assert.equal(r.budget.callsUsed,1);assert.deepEqual(r.results[0].values,['Taurus']);
});
test('disjoint intervals preserve gap and exact coverage under budget exhaustion',async()=>{
  let calls=0;const r=await analyzeUncertainty(input(()=>10,{intervals:[{from:utc(0),to:utc(1)},{from:utc(50),to:utc(51)}],maxSamples:1,sample:async()=>{calls++;return {longitudes:{Sun:10},warnings:[]};}}));assert.equal(calls,1);assert.equal(r.budget.callsUsed,1);assert.equal(r.complete,false);assert.equal(r.results[0].unresolvedRanges.length,2);assert.equal(validateUncertaintyReport(r),r);
});
test('callbacks are shared across features and failures consume call budget',async()=>{
  let calls=0;const r=await analyzeUncertainty(input(()=>10,{features:[sign,{id:'moon',kind:'sign',body:'Moon'}],maxSamples:2,sample:async()=>{calls++;throw new Error('analytic failure');}}));assert.equal(calls,2);assert.equal(r.samples.length,2);assert(r.results.every(x=>x.status==='unresolved'));
});
test('contradicted external bounds invalidate previously bounded cells',async()=>{
  const r=await analyzeUncertainty(input(t=>10+t,{bounds:{assumptions:[bound('Sun',0,0)]}}));assert(r.boundViolations.length>0);assert.equal(r.complete,false);assert.equal(r.results[0].status,'unresolved');assert(r.results[0].cells.every(c=>c.classification==='unresolved'));
});
test('nonadjacent contradiction is caught when adjacent samples fit nonzero error allowances',async()=>{
  const r=await analyzeUncertainty(input(t=>10+0.3*t,{bounds:{assumptions:[bound('Sun',0,1)]},maxSamples:3}));
  assert.equal(r.boundViolations.length,1);assert.equal(r.boundViolations[0].from,utc(0));assert.equal(r.boundViolations[0].to,utc(10));assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('bounded pair-check budget cannot silently promote unchecked assumptions to stability',async()=>{
  const b=bound();b.domain.to=utc(1000);
  const r=await analyzeUncertainty(input(()=>10,{intervals:[{from:utc(0),to:utc(500)}],features:[sign,{id:'moon',kind:'sign',body:'Moon'}],bounds:{assumptions:[b]},maxSamples:600,resolutionMs:1000}));
  assert.equal(r.boundConsistency.comparisons,100000);assert.deepEqual(r.boundConsistency.uncheckedBoundIds,['analytic-Sun']);assert.equal(r.results[0].status,'unresolved');assert.equal(r.complete,false);
});
test('bound domains, model bindings and finite nonnegative parameters are enforced',async()=>{
  for(const mutation of [b=>b.domain.to=utc(1),b=>b.modelDigest='sha256:wrong',b=>b.maxAbsRateDegPerDay=-1,b=>b.maxAbsRateDegPerDay=Infinity,b=>b.absoluteErrorDeg=NaN]){
    const b=bound();mutation(b);await assert.rejects(analyzeUncertainty(input(()=>10,{bounds:{assumptions:[b]}})));
  }
});
test('missing one aspect body bound cannot produce a bounded result',async()=>{
  const r=await analyzeUncertainty(input(()=>40,{features:[{id:'aspect',kind:'aspect',a:'Sun',b:'Moon',angle:60,orb:2}],bounds:{assumptions:[bound('Sun')]}}));assert.equal(r.results[0].status,'unresolved');assert.equal(r.results[0].coverage,'sampled');
});
test('validator rejects resealed false stability, deleted coverage and incorrect bound references',async()=>{
  const sampled=await analyzeUncertainty(input());assert.throws(()=>validateUncertaintyReport(reseal(sampled,r=>{r.results[0].status='stable';r.results[0].coverage='bounded';r.complete=true;})));
  const stable=await analyzeUncertainty(input(()=>10,{bounds:{assumptions:[bound()]},intervals:[{from:utc(0),to:utc(1)},{from:utc(50),to:utc(51)}]}));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.results[0].cells.pop())));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.results[0].boundIds=[])));
  assert.throws(()=>validateUncertaintyReport(reseal(stable,r=>r.boundAssumptions[0].absoluteErrorDeg=90)));
});
test('seven-day span and input call-budget limits fail closed',async()=>{
  await assert.rejects(analyzeUncertainty(input(()=>10,{intervals:[{from:utc(0),to:utc(8*86400)}]})));
  await assert.rejects(analyzeUncertainty(input(()=>10,{maxSamples:0})));
  await assert.rejects(analyzeUncertainty(input(()=>10,{zodiac:'sidereal'})));
});
