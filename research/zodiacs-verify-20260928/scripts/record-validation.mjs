import { spawnSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCli } from '../src/cli.mjs';
import { verifyClaims } from '../src/claims.mjs';
import { loadZodiacsAdapter } from '../src/engine-adapter.mjs';
import { createVerifySession } from '../src/tools.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const engine=process.argv[2];
if(!engine||!path.isAbsolute(engine))throw new Error('Provide absolute frozen engine dist/index.js path.');
const tests=spawnSync(process.execPath,['--test','--test-reporter=tap',...[
  'core','compare','claims','cli','engine-adapter','uncertainty','reviewer-numerics','reviewer-trust','tools'
].map(name=>'tests/'+name+'.test.mjs')],{cwd:root,env:{...process.env,ZODIACS_ENGINE_PATH:engine},encoding:'utf8',maxBuffer:32*1024*1024});
await writeFile(path.join(root,'reports','validation.tap'),tests.stdout+(tests.stderr||''));
if(tests.status!==0)throw new Error('Tests failed; inspect reports/validation.tap.');
const match=label=>Number(new RegExp('^# '+label+' (\\d+)$','m').exec(tests.stdout)?.[1]??NaN);
if(match('skipped')!==0)throw new Error('Final validation must not skip engine integration tests.');
const demo=spawnSync(process.execPath,['examples/demo.mjs'],{cwd:root,encoding:'utf8'});
if(demo.status!==0)throw new Error(demo.stderr||'Demo failed');
await writeFile(path.join(root,'reports','demo-output.json'),demo.stdout);
const chart=JSON.parse((await runCli(['calculate',path.join(root,'examples','chart-request.json'),'--engine',engine])).text);
const window=JSON.parse((await runCli(['uncertainty',path.join(root,'examples','window-request.json'),'--engine',engine])).text);
await writeFile(path.join(root,'reports','engine-chart.json'),JSON.stringify(chart,null,2)+'\n');
await writeFile(path.join(root,'reports','engine-window.json'),JSON.stringify(window,null,2)+'\n');
const sign=chart.facts.find(f=>f.id==='sign:Sun');
const claimInput={receipts:[chart],trustedReceiptIds:[chart.id],uncertaintyReports:[window],trustedReportIds:[window.id],claims:[
  {id:'computed-sun',kind:'fact',subjectId:chart.subjectId,receiptId:chart.id,factId:sign.id,expected:sign.value,scope:'instant'},
  {id:'unsupported-entire-window',kind:'interval',subjectId:window.subjectId,reportId:window.id,featureId:'sun-sign',expected:sign.value,scope:'interval'}
]};
const claims=verifyClaims(claimInput);
if(claims.results[0].status!=='supported'||claims.results[1].status!=='unresolved')throw new Error('Real engine workflow did not preserve uncertainty.');
await writeFile(path.join(root,'reports','engine-claims-input.json'),JSON.stringify(claimInput,null,2)+'\n');
await writeFile(path.join(root,'reports','engine-claims-result.json'),JSON.stringify(claims,null,2)+'\n');
const session=createVerifySession(await loadZodiacsAdapter(engine));
const sessionChart=await session.execute('calculate_chart',JSON.parse(await readFile(path.join(root,'examples','chart-request.json'),'utf8')));
const sessionClaims=await session.execute('verify_claims',{claims:[{...claimInput.claims[0],receiptId:sessionChart.id}]});
if(!sessionClaims.allSupported)throw new Error('Tool session did not support its own validated chart fact.');
session.clear();
const afterClear=await session.execute('verify_claims',{claims:[{...claimInput.claims[0],receiptId:sessionChart.id}]});
if(afterClear.allSupported)throw new Error('Cleared tool session retained trusted evidence.');
const summary={generatedAt:new Date().toISOString(),node:process.version,tests:{total:match('tests'),passed:match('pass'),failed:match('fail'),skipped:match('skipped')},
  frozenEngineVersion:chart.model.engineVersion,artifact:chart.model.artifact,
  toolSession:{computedFactSupported:sessionClaims.allSupported,clearedEvidenceRefused:!afterClear.allSupported},
  realEngine:{chartReceiptId:chart.id,factCount:chart.facts.length,uncertaintyReportId:window.id,sampleCalls:window.budget.callsUsed,complete:window.complete,
    features:window.results.map(r=>({featureId:r.featureId,status:r.status,coverage:r.coverage,values:r.values})),claims:claims.results.map(r=>({claimId:r.claimId,status:r.status}))},
  syntheticDemo:JSON.parse(await readFile(path.join(root,'reports','synthetic-demo','summary.json'),'utf8')),
  limits:['Local research preview; this validation runner performs no repository publication, release or deployment.','No changes to engine or earlier research packages.','Finite software checks do not certify astronomical accuracy or scientific validity.']};
await writeFile(path.join(root,'reports','VALIDATION.json'),JSON.stringify(summary,null,2)+'\n');
process.stdout.write(JSON.stringify({tests:summary.tests,realEngine:summary.realEngine},null,2)+'\n');
