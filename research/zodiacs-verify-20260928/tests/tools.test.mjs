import test from 'node:test';
import assert from 'node:assert/strict';
import {createVerifySession} from '../src/tools.mjs';
import {createChartReceipt,digest,instant} from '../src/core.mjs';

// Analytic, deliberately synthetic model: these tests check tool trust and
// lifecycle boundaries, not astronomical accuracy or real chart placements.
const model={engine:'synthetic-test-only',engineVersion:'1',artifact:{digest:digest('synthetic'),scope:'test fixture only'},conventions:{zodiac:'synthetic',origin:'synthetic',frame:'synthetic',corrections:'none',timeScale:'synthetic',deltaT:{policy:'synthetic'}}};
const request={subjectId:'fixture',utc:'2000-01-01T00:00:00Z',timeKnowledge:'reference',houseSystem:'whole'};
function syntheticAdapter() {
  return {model,
    calculate(r){return createChartReceipt({schema:'zodiacs.verify.chart.v1',subjectId:r.subjectId,context:{utc:new Date(instant(r.utc)).toISOString(),latitude:r.latitude??null,longitude:r.longitude??null,timeKnowledge:r.timeKnowledge,requestedHouseSystem:r.houseSystem,effectiveHouseSystem:null},model,
      facts:[{id:'sign:Sun',kind:'sign',entity:'Sun',value:'Aries',scope:'instant'}],warnings:['synthetic-test-only']});},
    sample(){return {longitudes:{Sun:15,Moon:90},warnings:['synthetic-test-only']};},
  };
}
const rule={id:'operator-rule',tradition:'synthetic-test',source:{title:'Synthetic fixture',locator:'fixture:rule'},statement:'Test editorial statement',epistemicStatus:'editorial'};
const claim=receipt=>({id:'fact-1',kind:'fact',subjectId:'fixture',receiptId:receipt.id,factId:'sign:Sun',expected:'Aries',scope:'instant'});
const windowRequest={subjectId:'fixture',intervals:[{from:'2000-01-01T00:00:00Z',to:'2000-01-01T00:00:01Z'}],features:[{id:'sun-sign',kind:'sign',body:'Sun'}],birth:{timeKnowledge:'reference',houseSystem:'whole'},maxSamples:3,resolutionMs:1000};

test('tool definitions expose only four bounded input surfaces and are immutable',()=>{
  const session=createVerifySession(syntheticAdapter());
  assert.deepEqual(session.tools.map(t=>t.name),['calculate_chart','analyze_uncertainty','compare_charts','verify_claims']);
  for(const tool of session.tools)assert.equal(tool.inputSchema.additionalProperties,false);
  assert.deepEqual(Object.keys(session.tools[3].inputSchema.properties),['claims']);
  assert.throws(()=>{session.tools[0].inputSchema.additionalProperties=true;},TypeError);
  for(const size of [0,257,1.5,'2',null])assert.throws(()=>createVerifySession(syntheticAdapter(),{maxEvidenceEntries:size}));
  assert.throws(()=>createVerifySession(syntheticAdapter(),{rules:null}),/array/);
  assert.throws(()=>createVerifySession(syntheticAdapter(),{trustedReceiptIds:[]}));
});

test('generated facts are usable, returned snapshots are detached, and sessions stay isolated',async()=>{
  const session=createVerifySession(syntheticAdapter());
  const receipt=await session.execute('calculate_chart',request);
  receipt.facts[0].value='Pisces';
  const checked=await session.execute('verify_claims',{claims:[claim(receipt)]});
  assert.equal(checked.allSupported,true);
  const comparison=await session.execute('compare_charts',{leftReceiptId:receipt.id,rightReceiptId:receipt.id});
  assert.equal(comparison.verdict,'agreement-within-threshold');
  const other=createVerifySession(syntheticAdapter());
  assert.equal((await other.execute('verify_claims',{claims:[claim(receipt)]})).allSupported,false);
  await assert.rejects(other.execute('compare_charts',{leftReceiptId:receipt.id,rightReceiptId:receipt.id}),/not retained/);
  session.clear();
  assert.equal((await session.execute('verify_claims',{claims:[claim(receipt)]})).allSupported,false);
});

test('caller trust/evidence/rule injections and unknown request fields are refused',async()=>{
  const session=createVerifySession(syntheticAdapter());
  for(const key of ['rules','receipts','uncertaintyReports','trustedReceiptIds','trustedReportIds','trustedRuleIds','trustedBoundIds']){
    await assert.rejects(session.execute('verify_claims',{claims:[],[key]:[]}),/Unknown/);
  }
  for(const key of ['bounds','model','trustedBoundIds'])await assert.rejects(session.execute('analyze_uncertainty',{...windowRequest,[key]:{}}),/Unknown/);
  await assert.rejects(session.execute('analyze_uncertainty',{...windowRequest,birth:{...windowRequest.birth,utc:request.utc}}),/Unknown/);
  await assert.rejects(session.execute('calculate_chart',{...request,enginePath:'/tmp/foreign.js'}),/Unknown/);
  await assert.rejects(session.execute('unknown',{}),/Unknown Verify tool/);
});

test('operator registry is cloned and cannot be replaced by subsequent caller mutation',async()=>{
  const mutableRule=structuredClone(rule), rules=[mutableRule];
  const session=createVerifySession(syntheticAdapter(),{rules});
  mutableRule.id='injected-rule'; mutableRule.epistemicStatus='invalid'; rules.push({...rule,id:'injected-new-rule'});
  const receipt=await session.execute('calculate_chart',request);
  const interpretation={id:'interpretation',kind:'interpretation',subjectId:'fixture',ruleId:'operator-rule',basedOn:['fact-1'],text:'Synthetic text, not claimed scientifically true.'};
  const allowed=await session.execute('verify_claims',{claims:[claim(receipt),interpretation]});
  assert.equal(allowed.allSupported,true);
  assert.ok(allowed.results[1].reasons.some(r=>r.includes('provenance')));
  for(const id of ['injected-rule','injected-new-rule'])assert.equal((await session.execute('verify_claims',{claims:[claim(receipt),{...interpretation,ruleId:id}]})).allSupported,false);
  assert.throws(()=>createVerifySession(syntheticAdapter(),{rules:[rule,rule]}),/Duplicate/);
  assert.throws(()=>createVerifySession(syntheticAdapter(),{rules:[{...rule,unreviewed:true}]}),/Unknown/);
});

test('uncertainty binds observer/pin, supplies no bounds, and cannot support sampled stability',async()=>{
  const session=createVerifySession(syntheticAdapter());
  const result=await session.execute('analyze_uncertainty',{...windowRequest,birth:{...windowRequest.birth,latitude:40,longitude:-74,deltaT:69}});
  assert.deepEqual(result.model.observer,{latitude:40,longitude:-74,timeKnowledge:'reference',houseSystem:'whole'});
  assert.deepEqual(result.model.conventions.deltaT,{model:'pinned',seconds:69});
  assert.deepEqual(result.boundAssumptions,[]);
  assert.equal(result.results[0].status,'unresolved');
  const checked=await session.execute('verify_claims',{claims:[{id:'interval',kind:'interval',subjectId:'fixture',reportId:result.id,featureId:'sun-sign',expected:'Aries',scope:'interval'}]});
  assert.equal(checked.allSupported,false);
});

test('one FIFO limit applies jointly to chart receipts and uncertainty reports',async()=>{
  const session=createVerifySession(syntheticAdapter(),{maxEvidenceEntries:2});
  const first=await session.execute('calculate_chart',request);
  const report=await session.execute('analyze_uncertainty',windowRequest);
  await session.execute('calculate_chart',request); // Same ID does not refresh FIFO age.
  const second=await session.execute('calculate_chart',{...request,utc:'2000-01-02T00:00:00Z'});
  await assert.rejects(session.execute('compare_charts',{leftReceiptId:first.id,rightReceiptId:second.id}),/not retained/);
  assert.equal((await session.execute('verify_claims',{claims:[claim(second)]})).allSupported,true);
  const check=await session.execute('verify_claims',{claims:[{id:'interval',kind:'interval',subjectId:'fixture',reportId:report.id,featureId:'sun-sign',expected:'Aries',scope:'interval'}]});
  assert.equal(check.results[0].status,'unresolved');
  assert.ok(check.results[0].reasons.some(r=>/stability/.test(r)));
});

test('clear prevents in-flight work from repopulating private evidence',async()=>{
  const original=syntheticAdapter(); let release;
  const deferred={...original,calculate:r=>new Promise(resolve=>{release=()=>resolve(original.calculate(r));})};
  const session=createVerifySession(deferred);
  const pending=session.execute('calculate_chart',request);
  session.clear(); release();
  await assert.rejects(pending,/cleared while operation/);
  const receipt=original.calculate(request);
  assert.equal((await session.execute('verify_claims',{claims:[claim(receipt)]})).allSupported,false);
});
