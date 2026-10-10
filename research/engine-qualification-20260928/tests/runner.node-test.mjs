import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createPlan, runPlan } from '../src/runner.mjs';
import { identifyArtifact } from '../src/identity.mjs';
import { validateDeclaration, declarationTemplate } from '../src/declaration.mjs';
import { loadReferences } from '../src/references.mjs';
import { sha256 } from '../src/common.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const entry = process.env.ZODIACS_ENGINE_PATH;
const real = {skip:!entry && 'Set ZODIACS_ENGINE_PATH to run the frozen-engine integration controls'};
const declaration = () => fs.readFile(path.join(root,'examples/rc10-declaration.json'),'utf8').then(JSON.parse);
async function temp(t) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'zodiacs-qualification-')); t.after(()=>fs.rm(dir,{recursive:true,force:true})); return dir; }
const bytes = plan => Buffer.from(JSON.stringify(plan,null,2)+'\n');
async function candidateCopy(dir) {
  const target=path.join(dir,'package'); await fs.cp(path.dirname(path.dirname(entry)),target,{recursive:true});
  return path.join(target,'dist/index.js');
}

test('runner: declaration templates cannot become approval by omission', async () => {
  const refs=await loadReferences(), artifact={digest:'a'.repeat(64)};
  assert.throws(()=>validateDeclaration(declarationTemplate(artifact,refs),artifact,refs),/nonempty/);
  const declared=await declaration(); declared.artifactDigest=artifact.digest;
  assert.equal(validateDeclaration(declared,artifact,refs),declared);
  declared.implementation.moonCorrection='apparent';
  assert.throws(()=>validateDeclaration(declared,artifact,refs),/moonCorrection/);
});

test('runner: real frozen self-comparison remains unqualified and fails the one-arcsecond target', real, async t => {
  const dir=await temp(t), plan=await createPlan({baselineEntry:entry,candidateEntry:entry,candidateDeclaration:await declaration()});
  const encoded=bytes(plan), result=await runPlan({planBytes:encoded,expectedSha256:sha256(encoded),output:path.join(dir,'run')});
  assert.equal(result.exitCode,2);
  assert.equal(result.report.gates.integrity.status,'pass');
  assert.equal(result.report.gates.apiCompatibility.status,'pass');
  assert.equal(result.report.gates.behavioralContract.status,'pass');
  assert.equal(result.report.gates.nonRegression.status,'pass');
  assert.equal(result.report.gates.referenceResidualTarget.status,'fail');
  assert.equal(result.report.evaluation.summary.candidate.expectedRows,210);
  assert.equal(result.report.evaluation.summary.candidate.targetExceedances,168);
  assert.equal(result.report.adapterQualified,false);
  assert.equal(result.report.execution.candidate.probes.length,12);
  const manifest=JSON.parse(await fs.readFile(path.join(dir,'run/run-manifest.json')));
  for(const [file,hash]of Object.entries(manifest.files)) assert.equal(sha256(await fs.readFile(path.join(dir,'run',file))),hash);
  await assert.rejects(runPlan({planBytes:encoded,expectedSha256:sha256(encoded),output:path.join(dir,'run')}),/EEXIST/);
});

test('runner: wrong plan digest blocks before any target executes', real, async t => {
  const dir=await temp(t), plan=await createPlan({baselineEntry:entry,candidateEntry:entry,candidateDeclaration:await declaration()});
  const result=await runPlan({planBytes:bytes(plan),expectedSha256:'0'.repeat(64),output:path.join(dir,'blocked')});
  assert.equal(result.exitCode,1); assert.equal(result.report.status,'blocked');
  assert.equal(result.report.blocker.stage,'plan-integrity'); assert.equal(result.report.execution,undefined);
});

test('runner: same-version bytes changed after plan creation are blocked before execution', real, async t => {
  const dir=await temp(t), candidate=await candidateCopy(dir), artifact=await identifyArtifact(candidate), declared=await declaration();
  declared.artifactDigest=artifact.digest;
  const plan=await createPlan({baselineEntry:entry,candidateEntry:candidate,candidateDeclaration:declared});
  await fs.appendFile(candidate,'\n// deliberate post-plan mutation\n');
  const encoded=bytes(plan), result=await runPlan({planBytes:encoded,expectedSha256:sha256(encoded),output:path.join(dir,'blocked')});
  assert.equal(result.exitCode,1); assert.equal(result.report.blocker.stage,'artifact-preflight');
  assert.match(result.report.blocker.message,/Candidate installation changed/); assert.equal(result.report.execution,undefined);
});

test('runner: a deliberately shifted trusted candidate fails per-case nonregression', real, async t => {
  const dir=await temp(t), candidate=await candidateCopy(dir), original=path.join(path.dirname(candidate),'original-index.js');
  await fs.rename(candidate,original);
  await fs.writeFile(candidate,"export * from './original-index.js';\nimport { natalChart as original } from './original-index.js';\nexport function natalChart(input) { const chart=original(input); return {...chart,bodies:chart.bodies.map(b=>b.body==='Sun'?{...b,lon:(b.lon+1)%360}:b)}; }\n");
  const artifact=await identifyArtifact(candidate), declared=await declaration(); declared.artifactDigest=artifact.digest;
  declared.knownDifferences.push('Deliberate synthetic negative control: one degree added to Sun longitude.');
  const plan=await createPlan({baselineEntry:entry,candidateEntry:candidate,candidateDeclaration:declared}), encoded=bytes(plan);
  const result=await runPlan({planBytes:encoded,expectedSha256:sha256(encoded),output:path.join(dir,'run')});
  assert.equal(result.exitCode,2); assert.equal(result.report.gates.integrity.status,'pass');
  assert.equal(result.report.gates.nonRegression.status,'fail');
  assert.equal(result.report.gates.nonRegression.failedRows.length,21);
  assert.equal(result.report.gates.referenceResidualTarget.status,'fail');
  assert.equal(result.report.adapterQualified,false);
});

test('runner: CLI inspect and plan commands do not invoke a candidate module', real, async t => {
  const dir=await temp(t), candidate=await candidateCopy(dir), marker=path.join(dir,'executed.txt');
  await fs.appendFile(candidate,`\nimport {writeFileSync as mark} from 'node:fs'; mark(${JSON.stringify(marker)},'executed');\n`);
  const call=args=>spawnSync(process.execPath,[path.join(root,'src/cli.mjs'),...args],{encoding:'utf8',timeout:10000});
  const inspected=call(['inspect','--engine',candidate,'--out',path.join(dir,'inspect')]); assert.equal(inspected.status,0,inspected.stderr);
  await assert.rejects(fs.stat(marker),/ENOENT/);
  const artifact=JSON.parse(await fs.readFile(path.join(dir,'inspect/artifact.json'))), declared=await declaration(); declared.artifactDigest=artifact.digest;
  await fs.writeFile(path.join(dir,'declared.json'),JSON.stringify(declared));
  const planned=call(['plan','--baseline',entry,'--candidate',candidate,'--declaration',path.join(dir,'declared.json'),'--out',path.join(dir,'plan')]); assert.equal(planned.status,0,planned.stderr);
  await assert.rejects(fs.stat(marker),/ENOENT/);
  const malformed=call(['inspect','--engine',candidate,'--engine',candidate,'--out',path.join(dir,'bad')]); assert.equal(malformed.status,1);
  await assert.rejects(fs.stat(path.join(dir,'bad')),/ENOENT/);
});
