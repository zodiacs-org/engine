import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {runPreview,sampleDomain} from '../src/preview.mjs';

const seed=JSON.parse(await readFile(new URL('../examples/utc-window.json',import.meta.url),'utf8'));
const catalog=JSON.parse(await readFile(new URL('../fixtures/acceptance.json',import.meta.url),'utf8'));
const epoch=Date.parse('2000-01-01T00:00:00.000Z');
const at=s=>new Date(epoch+s*1000).toISOString();
const interval=(id,start,end,includeEnd=true)=>({id,start:at(start),end:at(end),includeStart:true,includeEnd});
const signs=['aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces'];
const norm=x=>((x%360)+360)%360;
const sign=x=>signs[Math.floor(norm(x)/30)];
function request(){const r=structuredClone(seed);r.time.intervals=[interval('window',0,10)];r.model.houseSystems=['whole'];r.features=[{id:'sun','kind':'body-sign',body:'Sun'}];r.budget.maxEvaluations=100;return r;}
function engine(fn,options={}){
 return {ENGINE_VERSION:'synthetic-analytic-test',EPHEMERIS:{name:'synthetic-exact-fixture',version:'1'},signForLongitude:lon=>({slug:sign(lon)}),separation:(a,b)=>Math.min(norm(a-b),norm(b-a)),houseOf:(lon,cusps)=>Math.floor(norm(lon-cusps[0])/30)+1,
 natalChart(input){const t=(Date.parse(input.utc)-epoch)/1000;if(options.onInput)options.onInput(input);if(options.failAt===t)throw new Error('fixture failure');const lon=norm(fn(t));return {input:{...input,utc:new Date(input.utc)},deltaT:{seconds:input.deltaT??64,model:input.deltaT===undefined?'synthetic-model':'pinned'},bodies:[{body:'Sun',lon,sign:sign(lon)},{body:'Moon',lon:norm(options.moon?options.moon(t):100),sign:sign(options.moon?options.moon(t):100)}],angles:input.latitude===undefined?null:{asc:lon,mc:norm(lon+90),dsc:norm(lon+180),ic:norm(lon+270)},houses:input.latitude===undefined?null:{system:options.actualSystem??input.houseSystem,cusps:Array.from({length:12},(_,i)=>30*i)},flags:options.actualSystem?['polar-fallback']:[]};}};
}
const results=[];
function test(id,fn){fn();results.push({id,status:'passed'});}
function run(r,e){const o=runPreview(r,e);assert.equal(o.coverage.complete,false);for(const f of o.findings){assert.notEqual(f.status,'certified-constant');assert.equal(f.certificate,null);assert.equal(f.probabilities,null);}return o;}
test('SIGN-01',()=>{const o=run(request(),engine(t=>10+t/100));assert.equal(o.findings[0].status,'observed-constant');assert.deepEqual(o.findings[0].values,['aries']);});
test('SIGN-02',()=>{const o=run(request(),engine(t=>29+t/5));assert.deepEqual(o.findings[0].values,['aries','taurus']);assert.equal(o.findings[0].witnesses[1].at,at(5));});
test('SIGN-03',()=>{assert.deepEqual(run(request(),engine(t=>359+t/5)).findings[0].values,['pisces','aries']);});
test('END-01',()=>{const r=request();r.time.intervals[0].includeEnd=false;const o=run(r,engine(t=>29+t/10));assert.deepEqual(o.findings[0].values,['aries']);assert.equal(sampleDomain(r).instants.at(-1),epoch+9999);});
test('END-02',()=>{assert.deepEqual(run(request(),engine(t=>29+t/10)).findings[0].values,['aries','taurus']);});
test('MISS-01',()=>{const fn=t=>29+2*Math.exp(-(((t-5.5)/0.05)**2));assert.equal(sign(fn(5.5)),'taurus');assert.deepEqual(run(request(),engine(fn)).findings[0].values,['aries']);});
test('TAN-01',()=>{const fn=t=>30-(t-5.5)**2/100;assert.equal(sign(fn(5.5)),'taurus');assert.deepEqual(run(request(),engine(fn)).findings[0].values,['aries']);});
test('ABSENT-01',()=>{const r=request();r.location={kind:'absent'};r.features.push({id:'asc',kind:'angle-sign',angle:'asc'});const o=run(r,engine(()=>10));assert.equal(o.findings[0].status,'observed-constant');assert.equal(o.findings[1].status,'unavailable');});
test('FALLBACK-01',()=>{const r=request();r.model.houseSystems=['placidus'];r.features=[{id:'house',kind:'body-house',body:'Sun'}];const f=run(r,engine(()=>10,{actualSystem:'whole'})).findings[0];assert.equal(f.status,'unavailable');assert.match(f.issues[0].reason,/substituted whole/);});
test('UNION-01',()=>{const r=request();r.time.intervals=[interval('a',0,10),interval('b',5,15)];assert.equal(run(r,engine(()=>10)).coverage.sampleCount,16);});
test('BUDGET-01',()=>{const r=request();r.budget.maxEvaluations=5;let n=0;assert.throws(()=>runPreview(r,engine(()=>10,{onInput:()=>n++})),/budget/);assert.equal(n,0);});
test('DELTA-01',()=>{const r=request();r.model.deltaT={kind:'pinned',seconds:80};let n=0;run(r,engine(()=>10,{onInput:x=>{assert.equal(x.deltaT,80);n++;}}));assert.equal(n,11);});
test('ASPECT-01',()=>{const r=request();r.features=[{id:'aspect',kind:'aspect-present',a:'Sun',b:'Moon',angleDegrees:60,orbDegrees:2}];const f=run(r,engine(()=>0,{moon:t=>54+t})).findings[0];assert.deepEqual(f.values,[false,true]);assert.equal(f.witnesses[1].at,at(4));});
test('FAIL-01',()=>{const o=run(request(),engine(()=>10,{failAt:5}));assert.equal(o.coverage.finiteDomainEvaluated,false);assert.equal(o.findings[0].issues.length,1);assert.equal(o.findings[0].issues[0].at,at(5));});
// Contract validation failures are semantic tests, not additional sky reference vectors.
test('REJECT-INVALID-DOMAIN',()=>{const r=request();r.time.intervals[0].start='2000-02-30T00:00:00.000Z';assert.throws(()=>runPreview(r,engine(()=>10)),/calendar/);});
test('REJECT-CERTIFIED',()=>{const r=request();r.mode='certified';assert.throws(()=>runPreview(r,engine(()=>10)),/finite-preview/);});
test('REJECT-LOCAL',()=>{const r=request();r.time={kind:'local-wall-window'};assert.throws(()=>runPreview(r,engine(()=>10)),/Resolve local clocks/);});
test('REJECT-PRIOR',()=>{const r=request();r.prior={kind:'uniform-utc-union'};assert.throws(()=>runPreview(r,engine(()=>10)),/Priors/);});
test('REJECT-BOX',()=>{const r=request();r.location={kind:'box'};assert.throws(()=>runPreview(r,engine(()=>10)),/Coordinate boxes/);});
test('REJECT-UNKNOWN-MODEL',()=>{const r=request();r.model.zodiac='sidereal';assert.throws(()=>runPreview(r,engine(()=>10)),/unknown field/);});
test('REJECT-IGNORED-DELTA-T',()=>{const r=request();r.model.deltaT={kind:'pinned',seconds:69};const e=engine(()=>10),original=e.natalChart;e.natalChart=i=>original({...i,deltaT:80});const o=run(r,e);assert.equal(o.coverage.finiteDomainEvaluated,false);assert.equal(o.findings[0].status,'unresolved');assert.match(o.findings[0].issues[0].reason,/ΔT pin/);});
test('REJECT-NAN-HOUSE',()=>{const r=request();r.features=[{id:'house',kind:'body-house',body:'Sun'}];const e=engine(()=>10);e.houseOf=()=>NaN;const o=run(r,e);assert.equal(o.findings[0].status,'unresolved');assert.deepEqual(o.findings[0].values,[]);assert.equal(o.coverage.finiteDomainEvaluated,false);});
test('REJECT-BAD-SIGN',()=>{const e=engine(()=>10);e.signForLongitude=()=>({slug:'invented'});const o=run(request(),e);assert.equal(o.findings[0].status,'unresolved');assert.equal(o.coverage.finiteDomainEvaluated,false);});
test('REJECT-BAD-ANGLE',()=>{const r=request();r.features=[{id:'asc',kind:'angle-sign',angle:'asc'}];const e=engine(()=>10),original=e.natalChart;e.natalChart=i=>({...original(i),angles:{asc:360}});const o=run(r,e);assert.equal(o.findings[0].status,'unresolved');assert.equal(o.coverage.finiteDomainEvaluated,false);});
test('ALLOW-UNKNOWN-COMMIT',()=>{const r=request();r.model.engineCommit=null;const o=run(r,engine(()=>10));assert.equal(o.provenance.assertedEngineCommit,null);assert.match(o.warnings[1],/ancestry is unknown/);});
const exercised=new Set(results.map(x=>x.id));
for(const c of catalog.cases.filter(c=>c.scope==='executable-preview'))assert(exercised.has(c.id),`Missing executable acceptance case ${c.id}`);
const report={purpose:'Contract verification on independent synthetic analytic functions; not astronomical accuracy or certification.',checks:results,executableChecksPassed:results.length,specifiedFutureCases:catalog.cases.filter(c=>c.scope!=='executable-preview').map(c=>({id:c.id,status:'specified-not-implemented',scope:c.scope}))};
const args=process.argv.slice(2);
assert(args.length===0 || (args.length===2 && args[0]==='--output'),'Usage: node tests/verify.mjs [--output results.json]');
if(args.length)await writeFile(args[1],JSON.stringify(report,null,2)+'\n');
process.stdout.write(`${results.length} synthetic/validation checks passed; ${report.specifiedFutureCases.length} future acceptance cases specified, not claimed executed.\n`);
