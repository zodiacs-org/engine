#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),opts={};
for(let i=0;i<args.length;i++){
 if(args[i]==='--expect-baseline'){opts.baseline=true;continue;}
 if(!['--engine','--tarball','--out','--python','--source-ref'].includes(args[i])||!args[i+1])throw new Error('Usage: node run-all.mjs --engine PATH [--tarball PATH] [--out FRESH_DIR] [--expect-baseline] [--source-ref CLAIMED_SHA] [--python python3]');
 opts[args[i]]=args[++i];
}
if(!opts['--engine'])throw new Error('--engine is required');
if(opts['--source-ref']&&!/^[a-f0-9]{40}$/i.test(opts['--source-ref']))throw new Error('--source-ref must be a full 40-character commit SHA');
if(opts['--source-ref'])opts['--source-ref']=opts['--source-ref'].toLowerCase();
const enginePath=fs.realpathSync(opts['--engine']),out=path.resolve(opts['--out']??path.join(root,'run-output'));
if(fs.existsSync(out)&&fs.readdirSync(out).length)throw new Error('Choose a fresh --out directory; old reports are never mixed with a new run');
fs.mkdirSync(out,{recursive:true});
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function locatePackage(start){let dir=path.dirname(start);while(dir!==path.dirname(dir)){if(fs.existsSync(path.join(dir,'package.json')))return dir;dir=path.dirname(dir);}throw new Error('Package metadata not found');}
function filesIn(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const rel=prefix+e.name;if(e.name==='node_modules'||e.name==='.git')return [];if(e.isSymbolicLink())throw new Error('Unexpected symlink in recorded distribution');return e.isDirectory()?filesIn(path.join(dir,e.name),rel+'/'):[rel];});}
const pkgRoot=locatePackage(enginePath),pkg=JSON.parse(fs.readFileSync(path.join(pkgRoot,'package.json')));
const baseline=JSON.parse(fs.readFileSync(path.join(root,'baseline-identity.json')));
const distributionFiles={};for(const f of filesIn(path.join(pkgRoot,'dist'))){distributionFiles['dist/'+f]=hash(fs.readFileSync(path.join(pkgRoot,'dist',f)));}
distributionFiles['package.json']=hash(fs.readFileSync(path.join(pkgRoot,'package.json')));
const deps=[];const seen=new Set();
function collectDeps(base,declared){
 const require=createRequire(path.join(base,'package.json'));
 for(const [name,wanted]of Object.entries(declared??{})){
  const entry=require.resolve(name),dir=locatePackage(entry);if(seen.has(dir))continue;seen.add(dir);
  const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json'))),fileDigests={};
  for(const f of filesIn(dir))fileDigests[f]=hash(fs.readFileSync(path.join(dir,f)));
  deps.push({name,declared:wanted,installedVersion:meta.version,files:fileDigests});collectDeps(dir,meta.dependencies);
 }
}
collectDeps(pkgRoot,pkg.dependencies);
const matchesFrozenDistribution=Object.keys(distributionFiles).length===Object.keys(baseline.artifactFiles).length&&Object.entries(baseline.artifactFiles).every(([f,h])=>distributionFiles[f]===h);
const tarballSha256=opts['--tarball']?hash(fs.readFileSync(opts['--tarball'])):null;
const baselineDependencyMatch=deps.length===1&&deps[0].name===baseline.dependency.name&&deps[0].installedVersion===baseline.dependency.version&&Object.keys(deps[0].files).length===Object.keys(baseline.dependency.files).length&&Object.entries(baseline.dependency.files).every(([f,h])=>deps[0].files[f]===h);
const identity={generatedAt:new Date().toISOString(),runtime:process.version,platform:process.platform,arch:process.arch,entryModuleSha256:hash(fs.readFileSync(enginePath)),packageName:pkg.name,packageVersion:pkg.version,tarballSha256,matchesFrozenDistribution,baselineDependencyMatch,distributionFiles,dependencies:deps,provenance:'Source commit is established only for matching recorded candidate distribution; future candidate ancestry needs its own trusted artifact record.'};
fs.writeFileSync(path.join(out,'target-identity.json'),JSON.stringify(identity,null,2)+'\n');
if(opts.baseline&&(!matchesFrozenDistribution||!baselineDependencyMatch||(opts['--tarball']&&tarballSha256!==baseline.artifactSha256)))throw new Error('Target does not match frozen baseline');
const node=process.execPath,python=opts['--python']??'python3';
const assertedSourceCommit=matchesFrozenDistribution&&baselineDependencyMatch?baseline.sourceCommit:(opts['--source-ref']??null);
const uncertaintyRequest=JSON.parse(fs.readFileSync(path.join(root,'uncertainty/examples/utc-window.json')));
uncertaintyRequest.model.engineCommit=assertedSourceCommit;
const uncertaintyRequestPath=path.join(out,'uncertainty-request.json');
fs.writeFileSync(uncertaintyRequestPath,JSON.stringify(uncertaintyRequest,null,2)+'\n');
const reproArgs=['reproductions/run-reproductions.mjs','--engine',enginePath,'--output',path.join(out,'reproductions.json')];
if(opts['--tarball'])reproArgs.push('--tarball',path.resolve(opts['--tarball']));
if(matchesFrozenDistribution&&baselineDependencyMatch)reproArgs.push('--source-ref',baseline.sourceCommit);
else if(opts['--source-ref'])reproArgs.push('--source-ref',opts['--source-ref']);
const eventArgs=['events/compare-events.mjs','--engine',enginePath,'--output',path.join(out,'events.json')];
if(opts['--tarball'])eventArgs.push('--tarball',path.resolve(opts['--tarball']));
const jobs=[
 ['reference-integrity-controls',node,['--test','toolkit/test-reference-check.mjs'],root],
 ['position-comparisons',node,['toolkit/run-positions.mjs','--engine',enginePath,'--out',path.join(out,'positions.json')],root],
 ['geometry-comparisons',node,['geometry/run.mjs','--engine',enginePath,'--out',path.join(out,'geometry.json')],root],
 ['event-integrity-controls',python,['events/check-integrity.py','--output',path.join(out,'event-integrity.json')],root],
 ['event-comparisons',node,eventArgs,root],
 ['focused-reproductions',node,reproArgs,root],
 ['uncertainty-contract',node,['uncertainty/tests/verify.mjs','--output',path.join(out,'uncertainty-contract.json')],root],
 ['uncertainty-preview',node,['uncertainty/src/preview.mjs','--engine',enginePath,'--request',uncertaintyRequestPath,'--output',path.join(out,'uncertainty-preview.json')],root],
 ['historical-data',python,['validate.py'],path.join(root,'historical-time')],
 ['historical-controls',python,['-m','unittest','-v','test_validate.py'],path.join(root,'historical-time')]
];
const results=[];
for(const [name,command,params,cwd]of jobs){
 const start=Date.now();const result=spawnSync(command,params,{cwd,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 fs.writeFileSync(path.join(out,name+'.log'),(result.stdout??'')+(result.stderr??'')+(result.error?String(result.error):''));
 results.push({name,status:result.status===0&&!result.error?'passed':'failed',exitCode:result.status,durationMs:Date.now()-start,error:result.error?.message??null});
 console.log(name+': '+results.at(-1).status);
}
const summary={schemaVersion:1,generatedAt:new Date().toISOString(),engineVersion:pkg.version,matchesFrozenDistribution,scope:'Research diagnostics and contract tests, separate from production release gates. A passed runner may retain explicitly classified API concerns.',tasks:results,failedTasks:results.filter(r=>r.status!=='passed').length};
fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
process.exitCode=summary.failedTasks?1:0;
