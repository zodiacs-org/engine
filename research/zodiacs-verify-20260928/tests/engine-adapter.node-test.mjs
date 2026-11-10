import test from 'node:test';
import assert from 'node:assert/strict';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadZodiacsAdapter } from '../src/engine-adapter.mjs';
import { validateChartReceipt, verifySeal } from '../src/core.mjs';

// These are adapter diagnostics against the frozen rc.10 installation, never
// independent astronomical reference tests. Set ZODIACS_ENGINE_PATH after
// bootstrapping a relocated installation. Core qualification-refusal controls
// run without any real-engine installation.
const enginePath = process.env.ZODIACS_ENGINE_PATH ?? fileURLToPath(new URL('../../../../parallel-runtime/package/dist/index.js', import.meta.url));
const present = await access(enginePath).then(() => true, () => false);
const real = { skip: present ? false : 'Set ZODIACS_ENGINE_PATH to a qualified rc.10 dist/index.js to run real-engine diagnostics.' };
let pendingAdapter;
function adapter() { return pendingAdapter ??= loadZodiacsAdapter(enginePath); }
const reference = {subjectId:'diagnostic-case',utc:'2000-01-01T12:00:00Z',timeKnowledge:'reference',houseSystem:'whole',deltaT:69};
const exact = {...reference,timeKnowledge:'exact',latitude:40.7,longitude:-74};
const fact = (receipt, id) => receipt.facts.find(item => item.id === id);

test('adapter refuses relative paths and unqualified versions before import', async () => {
  await assert.rejects(loadZodiacsAdapter('dist/index.js'), /absolute local path/);
  const dir=await mkdtemp(path.join(os.tmpdir(),'zodiacs-unqualified-'));
  try {
    await mkdir(path.join(dir,'dist'));
    await writeFile(path.join(dir,'package.json'),JSON.stringify({name:'@zodiacs/engine',version:'0.1.2'}));
    await writeFile(path.join(dir,'dist/index.js'),'throw new Error("SHOULD_NOT_IMPORT");');
    await assert.rejects(loadZodiacsAdapter(path.join(dir,'dist/index.js')), /unqualified engine version/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('qualified runtime yields sealed, reproducible reference-time facts and explicit semantics', real, async () => {
  const a=await adapter();
  const receipt=a.calculate(reference);
  assert.equal(validateChartReceipt(receipt),receipt);
  assert.equal(verifySeal(receipt),true);
  assert.equal(a.calculate(reference).id,receipt.id);
  assert.equal(receipt.context.utc,'2000-01-01T12:00:00.000Z');
  assert.equal(receipt.context.effectiveHouseSystem,null);
  assert.equal(receipt.model.engineVersion,'0.1.1-rc.10');
  assert.match(receipt.model.artifact.digest,/^sha256:[a-f0-9]{64}$/);
  assert.match(receipt.model.artifact.scope,/every file of the resolved astronomy-engine/);
  assert.match(receipt.model.conventions.corrections,/Moon:no-light-time-or-aberration/);
  assert.equal(receipt.model.conventions.deltaT.seconds,69);
  assert.equal(receipt.model.conventions.deltaT.model,'pinned');
  assert.equal(receipt.facts.filter(f=>f.kind==='longitude').length,12);
  assert.equal(receipt.facts.filter(f=>f.kind==='sign').length,12);
  assert.equal(receipt.facts.filter(f=>f.kind==='aspect').length,225);
  assert.equal(receipt.facts.some(f=>f.kind==='house'||f.entity==='Ascendant'||f.entity==='Midheaven'),false);
  assert.ok(receipt.warnings.includes('reference-instant-not-known-birth-time'));
});

test('exact profile preserves requested houses, location, and angular facts', real, async () => {
  const a=await adapter();
  const receipt=a.calculate(exact);
  assert.equal(receipt.context.effectiveHouseSystem,'whole');
  assert.equal(receipt.context.latitude,40.7);
  assert.equal(receipt.context.longitude,-74);
  assert.equal(receipt.facts.filter(f=>f.kind==='house').length,12);
  assert.ok(fact(receipt,'longitude:Ascendant'));
  assert.ok(fact(receipt,'longitude:Midheaven'));
  const unlocated=a.calculate({...reference,timeKnowledge:'exact'});
  assert.equal(unlocated.context.effectiveHouseSystem,null);
  assert.equal(unlocated.facts.some(f=>f.kind==='house'||f.entity==='Ascendant'),false);
  const locatedReference=a.calculate({...reference,latitude:40.7,longitude:-74});
  assert.equal(locatedReference.facts.some(f=>f.kind==='house'||f.entity==='Ascendant'),false);
});

test('adapter refuses implicit polar fallback but permits an explicit whole-sign policy', real, async () => {
  const a=await adapter();
  assert.throws(()=>a.calculate({...exact,latitude:80,houseSystem:'placidus'}),/fallback|effective house system/i);
  const explicit=a.calculate({...exact,latitude:80,houseSystem:'whole'});
  assert.equal(explicit.context.effectiveHouseSystem,'whole');
});

test('sample honors requested clock and time/location profile without manufacturing bounds', real, async () => {
  const a=await adapter();
  const ms=Date.parse(reference.utc);
  const snapshot=a.sample(ms,reference);
  const receipt=a.calculate(reference);
  assert.equal(snapshot.longitudes.Sun,fact(receipt,'longitude:Sun').value);
  assert.equal(snapshot.longitudes.Moon,fact(receipt,'longitude:Moon').value);
  assert.equal(Object.hasOwn(snapshot.longitudes,'Ascendant'),false);
  assert.equal(Object.hasOwn(snapshot,'bounds'),false);
  const withAngles=a.sample(ms,exact);
  assert.equal(withAngles.longitudes.Ascendant,fact(a.calculate(exact),'longitude:Ascendant').value);
  const changedClock=a.sample(ms,{...reference,deltaT:3600});
  assert.notEqual(changedClock.longitudes.Moon,snapshot.longitudes.Moon);
  assert.equal(a.sample(ms,reference).longitudes.Moon,snapshot.longitudes.Moon);
  const {utc,...windowRequest}=reference;
  assert.deepEqual(a.sample(ms,windowRequest),snapshot);
  assert.throws(()=>a.sample(ms+0.5,reference),/integral/);
});

test('aspect facts expose pair, angle and effective orb with true and false values', real, async () => {
  const a=await adapter();
  const receipt=a.calculate(reference);
  const conjunction=fact(receipt,'aspect:Sun:Moon:conjunction');
  assert.equal(conjunction.entity,'Sun|Moon|angle=0|orb=10');
  const other=fact(receipt,'aspect:Mars:Jupiter:sextile');
  assert.equal(other.entity,'Mars|Jupiter|angle=60|orb=4');
  assert.equal(receipt.facts.some(f=>f.kind==='aspect'&&f.value===true),true);
  assert.equal(receipt.facts.some(f=>f.kind==='aspect'&&f.value===false),true);
  assert.equal(receipt.facts.some(f=>f.kind==='aspect'&&/Node|Ascendant|Midheaven/.test(f.entity)),false);
  assert.equal(receipt.facts.some(f=>Object.hasOwn(f,'applying')),false);
});

test('strict input refuses missing zones, invalid dates and silently ignored settings', real, async () => {
  const a=await adapter();
  for (const utc of ['2000-01-01','2000-01-01T12:00:00','2001-02-29T12:00:00Z','2016-12-31T23:59:60Z']) {
    assert.throws(()=>a.calculate({...reference,utc}));
  }
  for (const changed of [{timeKnowledge:'unknown'},{houseSystem:'sidereal'},{latitude:10},{deltaT:NaN},{zodiac:'sidereal'}]) {
    assert.throws(()=>a.calculate({...reference,...changed}));
  }
  const accessor={...reference};
  Object.defineProperty(accessor,'deltaT',{enumerable:true,get(){throw new Error('GETTER_EXECUTED');}});
  assert.throws(()=>a.calculate(accessor),/data properties/);
  const offset=a.calculate({...reference,utc:'2000-01-01T07:00:00-05:00'});
  assert.equal(offset.id,a.calculate(reference).id);
});

test('receipt and static model cannot share mutable provenance state', real, async () => {
  const a=await adapter();
  assert.equal(Object.isFrozen(a.model),true);
  assert.equal(Object.isFrozen(a.model.conventions),true);
  const receipt=a.calculate(reference);
  receipt.model.conventions.deltaT.seconds=900;
  assert.equal(verifySeal(receipt),false);
  assert.equal(a.calculate(reference).model.conventions.deltaT.seconds,69);
});

test('changes to distribution JS or resolved dependency refuse qualification before import', real, async () => {
  const dir=await mkdtemp(path.join(os.tmpdir(),'zodiacs-tamper-'));
  const sourceRoot=path.dirname(path.dirname(enginePath));
  try {
    // Copy only to a temporary diagnostic installation; original bytes untouched.
    await cp(sourceRoot,dir,{recursive:true});
    const copiedEntry=path.join(dir,'dist/index.js');
    const bytes=await readFile(copiedEntry);
    await writeFile(copiedEntry,'throw new Error("SHOULD_NOT_IMPORT");');
    await assert.rejects(loadZodiacsAdapter(copiedEntry),/engine hash mismatch/);
    await writeFile(copiedEntry,bytes);
    const dependency=path.join(dir,'node_modules/astronomy-engine/esm/astronomy.js');
    const dependencyBytes=await readFile(dependency);
    await writeFile(dependency,'throw new Error("SHOULD_NOT_IMPORT");');
    await assert.rejects(loadZodiacsAdapter(copiedEntry),/dependency hash mismatch/);
    await writeFile(dependency,dependencyBytes);
    await writeFile(path.join(dir,'unexpected.mjs'),'export default 1;');
    await assert.rejects(loadZodiacsAdapter(copiedEntry),/file inventory is not qualified/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
