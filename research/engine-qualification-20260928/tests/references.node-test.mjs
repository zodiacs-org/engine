import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink,unlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadReferences,projectReferenceVector,REFERENCE_CONTRACT_SHA256} from '../src/references.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const AUDIT=path.resolve(HERE,'../../accuracy-audit-20260928');
const CONTRACT_PATH=path.resolve(HERE,'../data/reference-contract.json');
const contract=JSON.parse(await readFile(CONTRACT_PATH));
const I=[[1,0,0],[0,1,0],[0,0,1]];

// Temporary fixtures symlink unchanged authenticated inputs; only the one
// deliberately corrupted input is copied. No sibling artifact is edited.
async function modifiedInput(relative,mutate,run){
  const root=await mkdtemp(path.join(tmpdir(),'zodiacs-reference-review-'));
  try{
    for(const name of Object.keys(contract.inputFiles)){
      const destination=path.join(root,name);await mkdir(path.dirname(destination),{recursive:true});
      await symlink(path.join(AUDIT,name),destination);
    }
    if(relative){
      const file=path.join(root,relative);await unlink(file);
      if(mutate)await writeFile(file,mutate(await readFile(path.join(AUDIT,relative),'utf8')));
    }
    await run(root);
  }finally{await rm(root,{recursive:true,force:true});}
}

test('reference contract is byte-pinned and explicitly identifies known regression data',async()=>{
  const bytes=await readFile(CONTRACT_PATH);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),REFERENCE_CONTRACT_SHA256);
  assert.equal(contract.datasetRole,'known-regression-data-not-a-blind-holdout');
  assert.equal(Object.keys(contract.inputFiles).length,26);
});
test('210 normalized rows retain the committed epochs, correction choices and centers',async()=>{
  const actual=await loadReferences();
  assert.equal(actual.rows.length,210);assert.equal(new Set(actual.rows.map(x=>x.id)).size,210);
  const cases=JSON.parse(await readFile(path.join(AUDIT,'reference/cases.json')));
  for(const body of contract.bodyTargets){
    const rows=actual.rows.filter(x=>x.body===body.body);assert.equal(rows.length,21);
    assert.deepEqual(rows.map(x=>x.utc),cases.instants);
    for(const row of rows){
      assert.equal(row.deltaT,69);assert.equal(row.correction,body.body==='Moon'?'NONE':'LT+S');
      assert.equal(row.referenceTarget,body.referenceTarget);
      assert(Number.isFinite(row.lon)&&row.lon>=0&&row.lon<360);
      assert(Number.isFinite(row.lat)&&row.lat>=-90&&row.lat<=90);
    }
  }
  assert.equal(actual.provenance.datasetRole,'known-regression-data-not-a-blind-holdout');
  assert(actual.limitations.some(x=>x.includes('barycenter')));
  assert(actual.limitations.some(x=>x.includes('not identical')));
  assert.equal(actual.digest,(await loadReferences()).digest);
});
test('reference loader works with relocated authenticated inputs without changing identity',async()=>{
  const original=await loadReferences();
  await modifiedInput(null,null,async auditRoot=>assert.equal((await loadReferences({auditRoot})).digest,original.digest));
});
test('missing raw response is rejected instead of reusing derived coordinates alone',async()=>{
  await modifiedInput('reference/snapshot/raw/moon-none.json',null,
    auditRoot=>assert.rejects(loadReferences({auditRoot}),/ENOENT/));
});
test('raw response, receipt correction and target changes are caught by authenticated bytes',async()=>{
  for(const [file,mutate] of [
    ['reference/snapshot/raw/sun-lts.json',text=>text+' '],
    ['reference/snapshot/raw/sun-lts.receipt.json',text=>{const x=JSON.parse(text);x.parameters.VEC_CORR='NONE';return JSON.stringify(x);}],
    ['reference/snapshot/raw/moon-none.json',text=>text.replace('Moon (301)','Moon (999)')],
  ])await modifiedInput(file,mutate,auditRoot=>assert.rejects(loadReferences({auditRoot}),/input hash mismatch/));
});
test('missing, duplicated or epoch-shifted derived vectors cannot silently alter the test set',async()=>{
  for(const mutate of [x=>x.rows.pop(),x=>x.rows.push(x.rows[0]),x=>{x.rows[0].syntheticUt1='2000-01-01T00:00:00.000Z';}]){
    await modifiedInput('reference/snapshot/vectors.json',text=>{const x=JSON.parse(text);mutate(x);return JSON.stringify(x);},
      auditRoot=>assert.rejects(loadReferences({auditRoot}),/input hash mismatch/));
  }
});
test('matrix replacement and altered epoch selection are rejected before normalization',async()=>{
  for(const [file,mutate] of [
    ['rotation/rotation-matrices.json',x=>{x.rows[0].matrices.trueOfDateICRS[0][0]=null;}],
    ['reference/cases.json',x=>{x.instants=x.instants.slice(1);}],
  ])await modifiedInput(file,text=>{const x=JSON.parse(text);mutate(x);return JSON.stringify(x);},
    auditRoot=>assert.rejects(loadReferences({auditRoot}),/input hash mismatch/));
});
test('analytic vector quadrants preserve circular longitude and signed latitude',()=>{
  for(const [v,lon] of [[[1,0,0],0],[[0,1,0],90],[[-1,0,0],180],[[0,-1,0],270]]){
    assert.deepEqual(projectReferenceVector(v,I),{lon,lat:0});
  }
  const below=projectReferenceVector([1,-1e-12,0],I),above=projectReferenceVector([1,1e-12,0],I);
  assert(below.lon<360&&below.lon>359.999999);assert(above.lon>0&&above.lon<0.000001);
  assert(Math.abs(projectReferenceVector([1,0,1],I).lat-45)<1e-12);
  assert(Math.abs(projectReferenceVector([1,0,-1],I).lat+45)<1e-12);
});
test('malformed matrices, reflections, nonfinite and zero vectors fail numerical validation',()=>{
  for(const m of [[[1,0],[0,1]],[[2,0,0],[0,1,0],[0,0,1]],[[1,0,0],[0,1,0],[0,0,-1]],[[NaN,0,0],[0,1,0],[0,0,1]]])
    assert.throws(()=>projectReferenceVector([1,0,0],m));
  for(const v of [[0,0,0],[Infinity,0,0],[1,2],[0,0,1]])assert.throws(()=>projectReferenceVector(v,I));
});
