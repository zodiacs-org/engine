import { mkdtemp, readFile, writeFile, mkdir, access, rm, readdir, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(root,'../..');
const manifest=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
// The engine the consumer installs: the carried archive of the first version the peer range admits, checked
// against artifacts/archives.json. WHEEL_ENGINE_ARCHIVE names another packed engine, such as one packed from a
// checkout before its version is bumped; npm leaves out an engine outside the peer range, so that one is installed
// with --legacy-peer-deps, and the report says whether its version is in the range.
const ENGINE_VERSION='3.0.0';
const stage=await mkdtemp(resolve(tmpdir(),'zodiacs-wheel-review-'));
const packed=resolve(stage,'packed'),consumer=resolve(stage,'consumer'),bare=resolve(stage,'wheel-only');
await mkdir(packed);await mkdir(consumer);await mkdir(bare);
let npmCli;
const bin=dirname(process.execPath);
for(const path of [resolve(bin,'npm'),resolve(bin,'node_modules/npm/bin/npm-cli.js'),resolve(bin,'../lib/node_modules/npm/bin/npm-cli.js')]){
 try{await access(path);const real=await realpath(path);if(real.endsWith('npm-cli.js')){npmCli=real;break;}}catch{}
}
if(!npmCli)throw Error('Node installation does not expose its npm CLI');
function node(args,cwd=repo,capture=false){
 const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',stdio:capture?'pipe':'inherit',timeout:900000,maxBuffer:16*1024*1024});
 if(r.error||r.status!==0)throw Error('Wheel consumer command failed');
 return r.stdout;
}
try{
 const selftestLog=node(['--test','--test-reporter=tap',resolve(root,'selftest.mjs')],repo,true);
 process.stdout.write(selftestLog);
 const testCount=Number(selftestLog.match(/^# tests (\d+)$/m)?.[1]);
 assert.equal(testCount,15,'Source selftest count changed');
 assert.equal(Number(selftestLog.match(/^# pass (\d+)$/m)?.[1]),testCount,'Source selftests did not all pass');
 const info=JSON.parse(node([npmCli,'pack','--ignore-scripts','--json','--pack-destination',packed],root,true));
 assert.equal(info.length,1);
 assert.deepEqual(info[0].files.map(f=>f.path).sort(),['LICENSE','README.md','dom.d.mts','dom.mjs','index.d.mts','index.mjs','package.json']);
 const archive=resolve(packed,info[0].filename);
 let engineArchive,carried=null;
 if(process.env.WHEEL_ENGINE_ARCHIVE)engineArchive=resolve(process.env.WHEEL_ENGINE_ARCHIVE);
 else{
  carried=JSON.parse(await readFile(resolve(repo,'artifacts/archives.json'),'utf8')).archives.find(a=>a.version===ENGINE_VERSION);
  if(!carried)throw Error('artifacts/archives.json carries no @zodiacs/engine '+ENGINE_VERSION+' archive; set WHEEL_ENGINE_ARCHIVE to a packed engine');
  engineArchive=resolve(repo,'artifacts',carried.file);
 }
 const engineBytes=await readFile(engineArchive),engineSha256=createHash('sha256').update(engineBytes).digest('hex');
 if(carried){assert.equal(engineBytes.length,carried.bytes);assert.equal(engineSha256,carried.sha256);}
 // The wheel alone: no runtime dependency is installed, and require() and import() load both entries.
 await writeFile(resolve(bare,'package.json'),JSON.stringify({name:'wheel-only-consumer',private:true})+'\n');
 node([npmCli,'install','--ignore-scripts','--no-audit','--no-fund','--save-exact',archive],bare);
 const lock=JSON.parse(await readFile(resolve(bare,'package-lock.json'),'utf8'));
 assert.deepEqual(Object.keys(lock.packages).filter(Boolean),['node_modules/@zodiacs/wheel']);
 assert.deepEqual((await readdir(resolve(bare,'node_modules'))).filter(n=>!n.startsWith('.')),['@zodiacs']);
 await writeFile(resolve(bare,'require-smoke.cjs'),[
 'const assert=require("node:assert/strict");',
 'const wheel=require("@zodiacs/wheel"),dom=require("@zodiacs/wheel/dom");',
 'assert.deepEqual(Object.keys(wheel).filter(k=>k!=="__esModule").sort(),["describeWheel","fromNatalChart","renderWheelSvg","validateWheelData"]);',
 'assert.equal(typeof dom.createWheel,"function");',
 'assert.ok(wheel.renderWheelSvg({zodiac:"tropical",bodies:[{body:"Sun",lon:0,retrograde:false},{body:"Vertex",lon:90,retrograde:null}]},{idPrefix:"required"}).startsWith("<svg"));',
 'assert.throws(()=>dom.createWheel({zodiac:"tropical",bodies:[{body:"Sun",lon:0,retrograde:false}]}),/DOM document/);',
 ].join('\n')+'\n');
 node([resolve(bare,'require-smoke.cjs')],bare);
 await writeFile(resolve(bare,'import-smoke.mjs'),[
 'import assert from "node:assert/strict";',
 'import {renderWheelSvg} from "@zodiacs/wheel";',
 'import {createWheel} from "@zodiacs/wheel/dom";',
 'import {createRequire} from "node:module";',
 'const require=createRequire(import.meta.url);',
 'assert.equal(require("@zodiacs/wheel").renderWheelSvg,renderWheelSvg);assert.equal(require("@zodiacs/wheel/dom").createWheel,createWheel);',
 ].join('\n')+'\n');
 node([resolve(bare,'import-smoke.mjs')],bare);
 await writeFile(resolve(consumer,'package.json'),JSON.stringify({name:'wheel-clean-consumer',private:true,type:'module'})+'\n');
 const deps=[archive,engineArchive,'typescript@5.9.3'];
 if(process.env.WHEEL_BROWSER==='1')deps.push('playwright-core@1.61.1','axe-core@4.10.2');
 node([npmCli,'install','--ignore-scripts','--no-audit','--no-fund','--save-exact',...(carried?[]:['--legacy-peer-deps']),...deps],consumer);
 const engineVersion=JSON.parse(await readFile(resolve(consumer,'node_modules/@zodiacs/engine/package.json'),'utf8')).version;
 const peerRangeSatisfied=/^3\.\d+\.\d+$/.test(engineVersion);
 if(carried)assert.ok(peerRangeSatisfied,'the carried engine is outside the peer range');
 else if(!peerRangeSatisfied)console.log('WHEEL_ENGINE_ARCHIVE holds @zodiacs/engine '+engineVersion+', outside the peer range '+manifest.peerDependencies['@zodiacs/engine']+'; installed with --legacy-peer-deps');
 await writeFile(resolve(consumer,'typecheck.ts'),[
 'import {natalChart,chartPoints} from "@zodiacs/engine";',
 'import {minorBodyPositions} from "@zodiacs/engine/minor-bodies";',
 'import {fromNatalChart,describeWheel,renderWheelSvg,type WheelData,type NatalChartExtras} from "@zodiacs/wheel";',
 'import {createWheel} from "@zodiacs/wheel/dom";',
 'const chart=natalChart({utc:"2000-01-01T12:00:00Z",latitude:0,longitude:0});',
 'const model:WheelData=fromNatalChart(chart);',
 'const extras:NatalChartExtras={extraBodies:minorBodyPositions("2000-01-01T12:00:00Z"),points:chartPoints(chart).points};',
 'const full:WheelData=fromNatalChart(chart,extras);',
 'const svg:string=renderWheelSvg(full,{idPrefix:"example"});',
 'const figure:HTMLElement=createWheel(full,{document});',
 'describeWheel(model).summary satisfies string;',
 'describeWheel(full).bodies[0].label satisfies string;',
 '// @ts-expect-error an explicit document is required',
 'createWheel(model,{});',
 '// @ts-expect-error safe SVG identifiers are required',
 'renderWheelSvg(model,{});',
 '// @ts-expect-error a zodiac is required',
 'const absent:WheelData={bodies:[]};',
 '// @ts-expect-error retrograde is a boolean or null',
 'const wrong:WheelData={zodiac:"tropical",bodies:[{body:"Sun",lon:0,retrograde:"yes"}]};',
 '// @ts-expect-error a point needs its longitude',
 'fromNatalChart(chart,{points:[{point:"Vertex",speed:null}]});',
 ].join('\n')+'\n');
 node([resolve(consumer,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--lib','ES2022,DOM','typecheck.ts'],consumer);
 await writeFile(resolve(consumer,'server-typecheck.ts'),[
 'import {describeWheel,validateWheelData,renderWheelSvg,type WheelData} from "@zodiacs/wheel";',
 'const data:WheelData={zodiac:"tropical",bodies:[{body:"Sun",lon:0,retrograde:false},{body:"Vertex",lon:90,retrograde:null}],engineVersion:"synthetic"};',
 'const svg:string=renderWheelSvg(validateWheelData(data),{idPrefix:"server"});',
 'describeWheel(data).summary satisfies string;',
 '// @ts-expect-error the DOM factory has a separate browser entry point',
 'import {createWheel} from "@zodiacs/wheel";',
 '// @ts-expect-error missing SVG identifier is refused',
 'renderWheelSvg(data,{});',
 ].join('\n')+'\n');
 node([resolve(consumer,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--lib','ES2022','server-typecheck.ts'],consumer);
 if(process.env.WHEEL_BROWSER==='1')node([resolve(consumer,'node_modules/playwright-core/cli.js'),'install','--with-deps','chromium','firefox','webkit'],consumer);
 node([resolve(root,'scripts/verify-consumer.mjs'),consumer]);
 const report=JSON.parse(await readFile(resolve(consumer,'wheel-consumer-report.json'),'utf8'));
 const bytes=await readFile(archive);
 report.package={name:manifest.name,version:manifest.version,private:manifest.private===true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:info[0].files.map(({path,size,mode})=>({path,size,mode}))};
 report.engineArchive={version:engineVersion,carried:carried!==null,peerRangeSatisfied,bytes:engineBytes.length,sha256:engineSha256};
 report.wheelOnlyConsumer={installed:['@zodiacs/wheel'],requireSmoke:true,importSmoke:true};
 report.sourceSelftestsPassed=testCount;report.strictInstalledTypecheck=true;report.strictInstalledTypechecks={serverLibs:['ES2022'],browserLibs:['ES2022','DOM']};
 const content=JSON.stringify(report,null,2)+'\n';
 await writeFile(resolve(repo,'wheel-consumer-report.json'),content);
 console.log('PROGRAMME_FILE_FINAL '+JSON.stringify({path:'docs/evidence/accessible-wheel-20261009/producer-'+process.env.GITHUB_RUN_ID+'/node'+process.versions.node.split('.')[0]+'.json',size:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),base64:Buffer.from(content).toString('base64')}));
}finally{await rm(stage,{recursive:true,force:true});}
