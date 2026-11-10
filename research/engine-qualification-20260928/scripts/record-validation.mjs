#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { assert, sha256 } from '../src/common.mjs';
import { identifyArtifact } from '../src/identity.mjs';
import { createPlan, freshDirectory, runPlan } from '../src/runner.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2), options={};
for(let i=0;i<args.length;i+=2) {
  assert(['--engine','--out'].includes(args[i])&&!Object.hasOwn(options,args[i])&&typeof args[i+1]==='string','Usage: record-validation.mjs --engine ABSOLUTE_DIST_INDEX --out NEW_DIRECTORY');
  options[args[i]]=args[i+1];
}
assert(options['--engine']&&options['--out'],'Both --engine and --out are required');
const entry=options['--engine'];
const out=await freshDirectory(options['--out'],[path.dirname(path.dirname(entry))]);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'zodiacs-qualification-validation-'));
const declaration=JSON.parse(await fs.readFile(path.join(root,'examples/rc10-declaration.json'),'utf8'));
const recorded={schemaVersion:1,generatedAt:new Date().toISOString(),runtime:process.version,
  scope:'Software controls and finite reference-residual diagnostics. No new astronomical accuracy or empirical astrology result is claimed.'};
async function evaluate(candidate,candidateDeclaration,output) {
  const plan=await createPlan({baselineEntry:entry,candidateEntry:candidate,candidateDeclaration});
  const encoded=Buffer.from(JSON.stringify(plan,null,2)+'\n');
  const result=await runPlan({planBytes:encoded,expectedSha256:sha256(encoded),output});
  return {plan,encoded,result};
}
try {
  const tests=(await fs.readdir(path.join(root,'tests'))).filter(n=>n.endsWith('.node-test.mjs')).sort().map(n=>'tests/'+n);
  const ran=spawnSync(process.execPath,['--test','--test-reporter=tap',...tests],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,ZODIACS_ENGINE_PATH:entry}});
  await fs.writeFile(path.join(out,'tests.tap'),(ran.stdout??'')+(ran.stderr??''),{flag:'wx'});
  assert(ran.status===0&&!ran.error,'Tests failed; inspect tests.tap');
  const count=name=>{const m=ran.stdout.match(new RegExp('^# '+name+' (\\d+)$','m'));assert(m,'Missing TAP count '+name);return Number(m[1]);};
  recorded.tests={total:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')};
  assert(recorded.tests.failed===0&&recorded.tests.skipped===0&&recorded.tests.total===recorded.tests.passed,'Validation requires all tests including real-engine cases with zero skips');
  const self=await evaluate(entry,declaration,path.join(out,'self-comparison'));
  const repeat=await evaluate(entry,declaration,path.join(temp,'self-repeat'));
  assert(self.result.exitCode===2&&self.result.report.gates.nonRegression.status==='pass'&&self.result.report.gates.behavioralContract.status==='pass','Self-comparison did not preserve expected contract');
  assert(self.result.report.evaluation.summary.candidate.targetExceedances===168,'Known rc.10 residual target result changed');
  assert(self.result.report.evaluation.numericalDigest===repeat.result.report.evaluation?.numericalDigest,'Numerical report is not repeatable');
  recorded.selfComparison={status:self.result.report.status,rows:210,referenceTargetExceedances:168,
    nonRegression:self.result.report.gates.nonRegression.status,behavioralContract:self.result.report.gates.behavioralContract.status,
    numericalDigest:self.result.report.evaluation.numericalDigest,repeatNumericalDigest:repeat.result.report.evaluation.numericalDigest,
    repeatable:true,planSha256:sha256(self.encoded),adapterQualified:false};
  const candidateRoot=path.join(temp,'degraded-package');
  await fs.cp(path.dirname(path.dirname(entry)),candidateRoot,{recursive:true});
  const candidate=path.join(candidateRoot,'dist/index.js');
  await fs.rename(candidate,path.join(candidateRoot,'dist/original-index.js'));
  await fs.writeFile(candidate,"export * from './original-index.js';\nimport {natalChart as original} from './original-index.js';\nexport function natalChart(input){const chart=original(input);return {...chart,bodies:chart.bodies.map(b=>b.body==='Sun'?{...b,lon:(b.lon+1)%360}:b)};}\n");
  const degradedDeclaration=structuredClone(declaration); degradedDeclaration.artifactDigest=(await identifyArtifact(candidate)).digest;
  degradedDeclaration.knownDifferences.push('DELIBERATE NEGATIVE CONTROL: one degree added to every Sun longitude; not an actual candidate build.');
  degradedDeclaration.review.notes='Synthetic adverse control built only to verify rejection of a numerical regression.';
  const degraded=await evaluate(candidate,degradedDeclaration,path.join(out,'negative-control'));
  assert(degraded.result.exitCode===2&&degraded.result.report.gates.nonRegression.status==='fail'&&degraded.result.report.gates.nonRegression.failedRows.length===21,'Deliberate regression was not caught');
  recorded.negativeControl={label:'Synthetic one-degree Sun perturbation, not an actual engine build',
    failedRegressionRows:21,exitCode:degraded.result.exitCode,adapterQualified:false,planSha256:sha256(degraded.encoded)};
  await fs.appendFile(candidate,'\n// Deliberate same-version mutation after plan creation.\n');
  const blocked=await runPlan({planBytes:degraded.encoded,expectedSha256:sha256(degraded.encoded),output:path.join(out,'post-plan-mutation')});
  assert(blocked.exitCode===1&&blocked.report.blocker.stage==='artifact-preflight'&&!blocked.report.execution,'Post-plan mutation did not block execution');
  recorded.postPlanMutation={blockedBeforeExecution:true,stage:blocked.report.blocker.stage,exitCode:1};
  recorded.adapterReviewRequired=true;recorded.adapterQualified=false;recorded.releaseAuthorized=false;
  await fs.writeFile(path.join(out,'VALIDATION.json'),JSON.stringify(recorded,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(recorded,null,2));
} finally { await fs.rm(temp,{recursive:true,force:true}); }
