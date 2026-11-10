import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { executeEngine, DEFAULT_PROBES, DEFAULT_LIMITS } from '../src/execute.mjs';

const UTC = '2000-01-01T12:00:00.000Z';
const sample = (id='sun',body='Sun',utc=UTC) => ({id,body,utc,deltaT:69});
const fixturePrelude = `
export const ENGINE_VERSION = 'synthetic-fixture';
export const EPHEMERIS = {name:'synthetic',version:'1'};
export const ASPECTS = [{type:'conjunction',angle:0,orb:8}];
export function houseOf() { return 1; }
const bodies = ['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
function chart(input) {
  const pin = input.deltaT ?? 64;
  return {
    input:{...input,utc:new Date(input.utc)},
    deltaT:{model:input.deltaT === undefined ? 'synthetic-model' : 'pinned',seconds:pin},
    bodies:bodies.map((body,i)=>({body,lon:10+i+pin/1e4,lat:i/10})),
    angles:null,houses:null,flags:['no-time']
  };
}
`;
async function fixture(t, code) {
  const directory = await mkdtemp(join(tmpdir(),'zodiacs-execution-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const entry = join(directory,'candidate.mjs');
  await writeFile(entry,fixturePrelude+code);
  return entry;
}
const run = (entry, options={}) => executeEngine({entry,cases:[sample()],probes:[],...options});

test('public API metadata and deduplicated chart timings are returned without a parent import', async t => {
  const entry = await fixture(t,`globalThis.__qualificationCandidateTouchedParent = true; export function natalChart(input){ return chart(input); }`);
  const result = await run(entry,{cases:[sample(),sample('moon','Moon')]});
  assert.equal(result.status,'completed'); assert.equal(result.rows.length,2);
  assert.ok(result.rows.every(r=>r.status==='ok')); assert.equal(result.timing.chartMs.count,1);
  assert.deepEqual(result.rows.map(({id,body,utc,deltaT})=>({id,body,utc,deltaT})),[sample(),sample('moon','Moon')]);
  assert.ok(result.timing.startupMs>=0); assert.ok(result.timing.chartMs.p95>=0);
  assert.equal(result.api.engineVersion,'synthetic-fixture');
  assert.deepEqual(result.api.ephemeris,{name:'synthetic',version:'1'});
  assert.deepEqual(result.api.aspectPolicy,[{type:'conjunction',angle:0,orb:8}]);
  assert.ok(result.api.functionExportNames.includes('natalChart'));
  assert.equal(globalThis.__qualificationCandidateTouchedParent,undefined);
});

test('successful rows survive other chart and per-body failures with the complete denominator', async t => {
  const entry = await fixture(t,`export function natalChart(input){
    if(input.utc.startsWith('2001')) throw new Error('fixture chart failure');
    const result=chart(input); if(input.utc.startsWith('2002')) result.bodies[0].lat=91; return result;
  }`);
  const cases=[sample(),sample('moon','Moon'),sample('year-2001','Sun','2001-01-01T12:00:00.000Z'),sample('year-2002-sun','Sun','2002-01-01T12:00:00.000Z'),sample('year-2002-moon','Moon','2002-01-01T12:00:00.000Z')];
  const result=await run(entry,{cases});
  assert.equal(result.status,'completed'); assert.equal(result.timing.chartMs.count,3);
  assert.deepEqual(result.rows.map(r=>r.id),cases.map(r=>r.id));
  assert.deepEqual(result.rows.map(r=>r.status),['ok','ok','error','error','ok']);
  assert.match(result.rows[2].error,/fixture chart failure/); assert.match(result.rows[3].error,/coordinates/);
});

test('missing and duplicate body rows are errors, never silently omitted', async t => {
  for (const code of ["result.bodies=[]", "result.bodies.push({...result.bodies[0]})"]) {
    const entry=await fixture(t,`export function natalChart(input){const result=chart(input);${code};return result;}`);
    const result=await run(entry);
    assert.equal(result.status,'completed'); assert.equal(result.rows[0].status,'error');
    assert.match(result.rows[0].error,/exactly one Sun/);
  }
});

test('ignored pin, changed instant, and mutated call input cannot pass clock validation', async t => {
  const changes=[
    "result.deltaT={model:'synthetic-model',seconds:64}",
    "result.input.utc=new Date('2001-01-01T12:00:00Z')",
    "input.deltaT=64;result.deltaT.seconds=64",
    "result.input.utc=input.utc"
  ];
  for(const change of changes){
    const entry=await fixture(t,`export function natalChart(input){const result=chart(input);${change};return result;}`);
    const result=await run(entry);
    assert.equal(result.rows[0].status,'error');
  }
});

test('infinite candidate import is terminated by wall timeout', async t => {
  const entry=await fixture(t,'while(true){}');
  const result=await run(entry,{limits:{timeoutMs:150}});
  assert.equal(result.status,'timeout'); assert.equal(result.rows[0].status,'error');
  assert.match(result.error,/wall-time/);
});

test('crash and malformed stdout fail closed', async t => {
  for(const code of ['process.exit(23);','process.stdout.write("not JSON\\n"); export function natalChart(input){return chart(input);}']){
    const entry=await fixture(t,code); const result=await run(entry);
    assert.equal(result.status,'failed'); assert.equal(result.rows[0].status,'error');
  }
});

test('a crash after the first chart preserves earlier results but fills every missing row', async t => {
  const entry=await fixture(t,`let calls=0;export function natalChart(input){if(++calls===2)process.exit(21);return chart(input);}`);
  const result=await run(entry,{cases:[sample(),sample('later','Sun','2001-01-01T12:00:00.000Z')]});
  assert.equal(result.status,'failed'); assert.deepEqual(result.rows.map(r=>r.status),['ok','error']);
  assert.equal(result.timing.chartMs.count,1);
});

test('aggregate output cap and stderr cap terminate noisy candidates', async t => {
  for(const stream of ['stdout','stderr']){
    const entry=await fixture(t,`process.${stream}.write('x'.repeat(100000)); export function natalChart(input){return chart(input);}`);
    const result=await run(entry,{limits:{maxOutputBytes:2048,maxStderrBytes:1024}});
    assert.equal(result.status,'failed'); assert.match(result.error,/byte limit/);
  }
});

test('child environment strips Node injection and unrelated parent secrets', async t => {
  const entry=await fixture(t,`export function natalChart(input){
    if(process.env.NODE_OPTIONS||process.env.NODE_PATH||process.env.QUALIFICATION_FIXTURE_SECRET)throw new Error('inherited unsafe env');return chart(input);
  }`);
  const keys=['NODE_OPTIONS','NODE_PATH','QUALIFICATION_FIXTURE_SECRET'];
  const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{
    process.env.NODE_OPTIONS='--import=/definitely-not-a-real-module.mjs'; process.env.NODE_PATH='/not-real'; process.env.QUALIFICATION_FIXTURE_SECRET='private';
    const result=await run(entry); assert.equal(result.status,'completed'); assert.equal(result.rows[0].status,'ok');
  } finally {for(const k of keys)if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k];}
});

test('geometry-ignoring pins fail the clock probe despite plausible metadata', async t => {
  const entry=await fixture(t,`export function natalChart(input){const result=chart(input);result.bodies.forEach(b=>b.lon=10);return result;}`);
  const p=DEFAULT_PROBES.find(p=>p.kind==='clock');
  const result=await run(entry,{probes:[p]});
  assert.equal(result.rows[0].status,'ok'); assert.equal(result.probes[0].passed,false);
  assert.equal(result.probes[0].details.checks.pinChangesComputedGeometry,false);
});

test('finite clock, unknown-time and repeat probes accept a consistent synthetic API', async t => {
  const entry=await fixture(t,`export function natalChart(input){return chart(input);}`);
  const probes=DEFAULT_PROBES.filter(p=>['clock','repeat','unknown-time'].includes(p.kind));
  const result=await run(entry,{probes});
  assert.equal(result.status,'completed'); assert.ok(result.probes.every(p=>p.passed));
  assert.equal(result.timing.chartMs.count,1,'Probe calls are excluded from chart timing sample count');
});

test('JSON-cloned probes with reordered object keys preserve the frozen definitions', async t => {
  const entry=await fixture(t,`export function natalChart(input){return chart(input);}`);
  const reorder=value=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,reorder(value[key])])):value;
  const original=DEFAULT_PROBES.find(p=>p.kind==='clock');
  const probe=JSON.parse(JSON.stringify(reorder(original)));
  assert.notEqual(JSON.stringify(probe),JSON.stringify(original));
  const result=await run(entry,{probes:[probe]});
  assert.equal(result.status,'completed'); assert.equal(result.probes[0].passed,true);
  probe.alternatePin=3601;
  await assert.rejects(run(entry,{probes:[probe]}),/frozen default/);
});

test('malformed API metadata fails protocol and retains missing result errors', async t => {
  const entry=await fixture(t,`ASPECTS.push({value:NaN});export function natalChart(input){return chart(input);}`);
  const result=await run(entry); assert.equal(result.status,'failed'); assert.equal(result.rows[0].status,'error');
});

test('limits, case IDs and probe definitions are validated before candidate execution', async () => {
  const entry='/does-not-exist.mjs';
  for(const limits of [{timeoutMs:0},{timeoutMs:Infinity},{memoryMb:3},{maxInputBytes:1},{unrecognized:1}]) await assert.rejects(run(entry,{limits}),TypeError);
  await assert.rejects(run(entry,{cases:[sample(),sample()]}),/duplicate case/);
  await assert.rejects(run(entry,{probes:[{id:'invented',kind:'reject',input:{}}]}),/frozen default/);
  assert.ok(Object.isFrozen(DEFAULT_PROBES)); assert.ok(Object.isFrozen(DEFAULT_PROBES[0].input)); assert.ok(Object.isFrozen(DEFAULT_LIMITS));
});
