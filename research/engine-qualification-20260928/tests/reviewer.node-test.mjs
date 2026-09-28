import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {canonical,digest} from '../src/common.mjs';
import {identifyArtifact} from '../src/identity.mjs';
import {evaluateComparison} from '../src/evaluate.mjs';
import {loadProtocol} from '../src/protocol.mjs';
import {freshDirectory} from '../src/runner.mjs';

const protocol=await loadProtocol();
const bodies=['Sun','Moon','Mercury','Venus','Mars','Jupiter','Saturn','Uranus','Neptune','Pluto'];
const syntheticReferences=bodies.flatMap((body,b)=>Array.from({length:21},(_,i)=>({
  id:`${body}-${i}`,body,utc:new Date(Date.UTC(2000,0,1+i)).toISOString(),deltaT:69,
  lon:15+b*30+i/100,lat:b/10,
})));
const syntheticProbes=[{id:'synthetic-probe'}];
function execution(offsetArcsec=0){
  return {status:'completed',
    rows:syntheticReferences.map(r=>({...r,status:'ok',lon:r.lon+offsetArcsec/3600})),
    probes:[{id:'synthetic-probe',passed:true}],
    api:{engineVersion:'synthetic-v1',exportNames:[...protocol.requiredExports],functionExportNames:['natalChart','houseOf'],aspectPolicy:[{type:'conjunction',angle:0,orb:8,luminaryOrb:10}]},
    timing:{chartMs:{count:21,median:1,p95:2,max:3}},
  };
}
function evaluationInput(){
  return {references:structuredClone(syntheticReferences),baselineExecution:execution(),candidateExecution:execution(),
    baselineArtifact:{version:'synthetic-v1',digest:digest({fixture:'baseline'}),installedBytes:1024},
    candidateArtifact:{version:'synthetic-v1',digest:digest({fixture:'candidate'}),installedBytes:1024},
    protocol:structuredClone(protocol),probes:structuredClone(syntheticProbes)};
}

// Independent adversarial controls. Synthetic package fixtures are never
// imported and make no claims about astronomical correctness.
async function temporary(action){
  const dir=await mkdtemp(path.join(os.tmpdir(),'zodiacs-qualification-review-'));
  try{return await action(dir);}finally{await rm(dir,{recursive:true,force:true});}
}
async function put(root,file,value){
  const target=path.join(root,file);await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,typeof value==='string'?value:JSON.stringify(value));
}
async function packageFixture(root,extra={}){
  await put(root,'package.json',{name:'@zodiacs/engine',version:'synthetic-review',type:'module',main:'dist/index.js',...extra});
  await put(root,'dist/index.js','throw new Error("IDENTIFICATION_MUST_NOT_EXECUTE_THIS");\n');
  return path.join(root,'dist/index.js');
}
async function dependency(root,relative,name,version,dependencies={}){
  await put(root,`${relative}/package.json`,{name,version,main:'index.js',dependencies});
  await put(root,`${relative}/index.js`,'throw new Error("DEPENDENCY_MUST_NOT_EXECUTE");\n');
}

test('reviewer: canonical digests reject sparse/decorated arrays and never invoke accessors',()=>{
  const sparse=new Array(1),decorated=[1];decorated.extra=2;
  let invoked=false;
  const accessor={};Object.defineProperty(accessor,'value',{enumerable:true,get(){invoked=true;return 1;}});
  for(const bad of [sparse,decorated,accessor])assert.throws(()=>canonical(bad));
  assert.equal(invoked,false);
  assert.equal(digest({b:2,a:1}),digest({a:1,b:2}));
});

test('reviewer: whole-installation identity is relocatable and does not execute package code',async()=>temporary(async dir=>{
  const first=path.join(dir,'first'),second=path.join(dir,'second');
  for(const root of [first,second]){
    await packageFixture(root,{dependencies:{helper:'1'}});
    await dependency(root,'node_modules/helper','helper','1');
    await put(root,'data/coefficients.bin','SYNTHETIC DATA');
  }
  const a=await identifyArtifact(path.join(first,'dist/index.js'));
  const b=await identifyArtifact(path.join(second,'dist/index.js'));
  assert.equal(a.digest,b.digest);
  assert.ok(a.files['data/coefficients.bin']);
  assert.equal(a.installedBytes,Object.values(a.files).reduce((n,f)=>n+f.bytes,0));
  assert.equal(a.fileCount,Object.keys(a.files).length);
  assert.ok(a.scope.includes('not authenticated'));
}));

test('reviewer: transitive dependency resolution follows each package and records shadowed versions',async()=>temporary(async dir=>{
  const root=path.join(dir,'package'),entry=await packageFixture(root,{dependencies:{helper:'1',shared:'1'}});
  await dependency(root,'node_modules/helper','helper','1',{shared:'2'});
  await dependency(root,'node_modules/shared','shared','1');
  await dependency(root,'node_modules/helper/node_modules/shared','shared','2');
  const identity=await identifyArtifact(entry);
  const packages=new Map(identity.dependencies.map(p=>[p.path,p]));
  assert.equal(packages.get('.').runtimeDependencies.shared.path,'node_modules/shared');
  assert.equal(packages.get('node_modules/helper').runtimeDependencies.shared.path,'node_modules/helper/node_modules/shared');
  assert.equal(packages.get('node_modules/shared').version,'1');
  assert.equal(packages.get('node_modules/helper/node_modules/shared').version,'2');
  assert.equal(identity.dependencies.length,4);
}));

test('reviewer: changing dependency data changes identity even when all version labels stay fixed',async()=>temporary(async dir=>{
  const entry=await packageFixture(dir,{dependencies:{helper:'1'}});
  await dependency(dir,'node_modules/helper','helper','1');
  await put(dir,'node_modules/helper/data.bin','ORIGINAL DATA');
  const before=await identifyArtifact(entry);
  await put(dir,'node_modules/helper/data.bin','REPLACED DATA');
  const after=await identifyArtifact(entry);
  assert.equal(before.version,after.version);
  assert.notEqual(before.digest,after.digest);
  assert.notEqual(before.files['node_modules/helper/data.bin'].sha256,after.files['node_modules/helper/data.bin'].sha256);
}));

test('reviewer: missing runtime, optional and peer dependencies fail closed',async()=>temporary(async dir=>{
  for(const field of ['dependencies','optionalDependencies','peerDependencies']){
    const entry=await packageFixture(path.join(dir,field),{[field]:{'reviewer-missing-package-8a3d6b':'1'}});
    await assert.rejects(identifyArtifact(entry),/Unresolved declared runtime dependency/);
  }
}));

test('reviewer: dependency resolution outside the standalone tree is refused',async()=>temporary(async dir=>{
  const entry=await packageFixture(path.join(dir,'package'),{dependencies:{helper:'1'}});
  await dependency(dir,'node_modules/helper','helper','1');
  await assert.rejects(identifyArtifact(entry),/outside standalone installation/);
}));

test('reviewer: internal symlinks are refused even when linked content is unchanged',async()=>temporary(async dir=>{
  const entry=await packageFixture(dir);
  await put(dir,'data/original.dat','SYNTHETIC');
  await symlink(path.join(dir,'data/original.dat'),path.join(dir,'data/linked.dat'));
  await assert.rejects(identifyArtifact(entry),/Symlinks are unsupported/);
}));

test('reviewer: output isolation resolves forbidden-root aliases before creating a directory',async()=>temporary(async dir=>{
  const root=path.join(dir,'package'),alias=path.join(dir,'alias');
  await packageFixture(root);
  await symlink(root,alias);
  await assert.rejects(freshDirectory(path.join(root,'new-output'),[alias]),/outside|symlink|alias/i);
}));

test('reviewer: passing every synthetic gate still cannot qualify an adapter or authorize release',()=>{
  const report=evaluateComparison(evaluationInput());
  assert.equal(report.checksPassed,true);
  assert.equal(report.adapterReviewRequired,true);
  assert.equal(report.adapterQualified,false);
  assert.equal(report.releaseAuthorized,false);
});

test('reviewer: preserving an export name does not conceal a removed required function',()=>{
  const input=evaluationInput();
  input.candidateExecution.api.functionExportNames=['natalChart'];
  const report=evaluateComparison(input);
  assert.equal(report.gates.apiCompatibility.status,'fail');
  assert.equal(report.checksPassed,false);
});

test('reviewer: identical inaccurate candidates pass nonregression but fail the absolute residual target',()=>{
  const input=evaluationInput();input.baselineExecution=execution(5);input.candidateExecution=execution(5);
  const report=evaluateComparison(input);
  assert.equal(report.gates.nonRegression.status,'pass');
  assert.equal(report.gates.referenceResidualTarget.status,'fail');
  assert.equal(report.gates.referenceResidualTarget.failedRows.length,210);
  assert.equal(report.checksPassed,false);
});

test('reviewer: broad improvement cannot hide a single per-case regression',()=>{
  const input=evaluationInput();input.baselineExecution=execution(5);
  input.candidateExecution.rows[0].lon=syntheticReferences[0].lon+5.2/3600;
  const report=evaluateComparison(input);
  assert.ok(report.summary.candidate.statistics.median<report.summary.baseline.statistics.median);
  assert.equal(report.gates.nonRegression.status,'fail');
  assert.deepEqual(report.gates.nonRegression.failedRows,['Sun-0']);
});

test('reviewer: omitted, duplicate, unknown, failed or nonfinite candidate rows never shrink the acceptance denominator',()=>{
  const changes=[
    e=>e.rows.pop(),e=>e.rows.push(structuredClone(e.rows[0])),
    e=>{e.rows[0].id='unrequested-case';},e=>{e.rows[0].status='error';},
    e=>{e.rows[0].lon=NaN;},e=>{e.rows[0].lat=null;},
    e=>{e.status='timeout';},
  ];
  for(const change of changes){
    const input=evaluationInput();change(input.candidateExecution);
    const report=evaluateComparison(input);
    assert.equal(report.checksPassed,false);
    assert.equal(report.gates.candidateExecution.status,'fail');
    assert.equal(report.gates.candidateExecution.expectedRows,210);
    assert.equal(report.gates.referenceResidualTarget.status,'not-evaluated');
    assert.equal(report.gates.nonRegression.status,'not-evaluated');
    assert.equal(report.rows.length,210);
  }
});

test('reviewer: baseline failure prevents a relative claim even when candidate target residuals are zero',()=>{
  const input=evaluationInput();input.baselineExecution.status='timeout';
  const report=evaluateComparison(input);
  assert.equal(report.gates.baselineExecution.status,'fail');
  assert.equal(report.gates.nonRegression.status,'not-evaluated');
  assert.equal(report.gates.referenceResidualTarget.status,'pass');
  assert.equal(report.checksPassed,false);
});

test('reviewer: observation metadata cannot be substituted beneath a valid case ID',()=>{
  for(const [key,value] of [['body','Moon'],['utc','2000-01-02T00:00:00.000Z'],['deltaT',70]]){
    const input=evaluationInput();input.candidateExecution.rows[0][key]=value;
    const report=evaluateComparison(input);
    assert.equal(report.gates.candidateExecution.status,'fail',key);
    assert.equal(report.checksPassed,false,key);
  }
});

test('reviewer: incomplete timing cannot establish the runtime budget',()=>{
  const input=evaluationInput();input.candidateExecution.timing.chartMs.count=1;
  const report=evaluateComparison(input);
  assert.notEqual(report.gates.nodeRuntimeBudget.status,'pass');
  assert.equal(report.checksPassed,false);
});

test('reviewer: numerical identity excludes timing variation and row arrival order',()=>{
  const input=evaluationInput(),first=evaluateComparison(input);
  input.candidateExecution.rows.reverse();
  input.candidateExecution.timing.chartMs={count:21,median:150,p95:200,max:250};
  const second=evaluateComparison(input);
  assert.equal(first.numericalDigest,second.numericalDigest);
  assert.equal(first.gates.nodeRuntimeBudget.status,'pass');
  assert.equal(second.gates.nodeRuntimeBudget.status,'fail');
});

test('reviewer: a relaxed post-evaluation threshold is refused rather than silently accepted',()=>{
  const input=evaluationInput();input.protocol.thresholds.referenceCoordinateTargetArcsec=60;
  assert.throws(()=>evaluateComparison(input),/Unreviewed qualification protocol/);
});
