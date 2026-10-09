import { mkdtemp, readFile, writeFile, mkdir, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../',import.meta.url));
const repo=resolve(root,'../..');
const stage=await mkdtemp(resolve(tmpdir(),'zodiacs-wheel-review-'));
const packed=resolve(stage,'packed'),consumer=resolve(stage,'consumer');
await mkdir(packed);await mkdir(consumer);
let npmCli;
for(const path of [resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),resolve(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')]){
 try{await access(path);npmCli=path;break;}catch{}
}
if(!npmCli)throw Error('Node installation does not expose its npm CLI');
function node(args,cwd=repo,capture=false){
 const r=spawnSync(process.execPath,args,{cwd,encoding:'utf8',stdio:capture?'pipe':'inherit',timeout:900000,maxBuffer:16*1024*1024});
 if(r.error||r.status!==0)throw Error('Wheel consumer command failed');
 return r.stdout;
}
try{
 const selftestLog=node(['--test',resolve(root,'selftest.mjs')],repo,true);
 process.stdout.write(selftestLog);
 const testCount=Number(selftestLog.match(/^# tests (\d+)$/m)?.[1]);
 assert.equal(testCount,8,'Source selftest count changed');
 const info=JSON.parse(node([npmCli,'pack','--ignore-scripts','--json','--pack-destination',packed],root,true));
 assert.equal(info.length,1);
 assert.deepEqual(info[0].files.map(f=>f.path).sort(),['LICENSE','README.md','index.d.ts','index.mjs','package.json']);
 const archive=resolve(packed,info[0].filename),engineArchive=resolve(repo,'artifacts/zodiacs-engine-1.0.0-rc.2.tgz');
 const engineBytes=await readFile(engineArchive);
 assert.equal(engineBytes.length,287011);assert.equal(createHash('sha256').update(engineBytes).digest('hex'),'4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002');
 await writeFile(resolve(consumer,'package.json'),JSON.stringify({name:'wheel-clean-consumer',private:true,type:'module'})+'\n');
 const deps=[archive,engineArchive,'typescript@5.9.3'];
 if(process.env.WHEEL_BROWSER==='1')deps.push('playwright-core@1.61.1','axe-core@4.10.2');
 node([npmCli,'install','--ignore-scripts','--no-audit','--no-fund','--save-exact',...deps],consumer);
 await writeFile(resolve(consumer,'typecheck.ts'),[
 'import {natalChart} from "@zodiacs/engine";',
 'import {fromNatalChart,createWheel,describeWheel,renderWheelSvg,type WheelData} from "@zodiacs/wheel";',
 'const model:WheelData=fromNatalChart(natalChart({utc:"2000-01-01T12:00:00Z",latitude:0,longitude:0}));',
 'const svg:string=renderWheelSvg(model,{idPrefix:"example"});',
 'const figure:HTMLElement=createWheel(model,{document});',
 'describeWheel(model).summary satisfies string;',
 '// @ts-expect-error an explicit document is required',
 'createWheel(model,{});',
 '// @ts-expect-error safe SVG identifiers are required',
 'renderWheelSvg(model,{});',
 '// @ts-expect-error a zodiac is required',
 'const absent:WheelData={bodies:[]};',
 '// @ts-expect-error retrograde is boolean',
 'const wrong:WheelData={zodiac:"tropical",bodies:[{body:"Sun",lon:0,retrograde:"yes"}]};',
 ].join('\n')+'\n');
 node([resolve(consumer,'node_modules/typescript/bin/tsc'),'--noEmit','--strict','--module','NodeNext','--moduleResolution','NodeNext','--target','ES2022','--lib','ES2022,DOM','typecheck.ts'],consumer);
 if(process.env.WHEEL_BROWSER==='1')node([resolve(consumer,'node_modules/playwright-core/cli.js'),'install','--with-deps','chromium','firefox','webkit'],consumer);
 node([resolve(root,'scripts/verify-consumer.mjs'),consumer]);
 const report=JSON.parse(await readFile(resolve(consumer,'wheel-consumer-report.json'),'utf8'));
 const bytes=await readFile(archive);
 report.package={name:'@zodiacs/wheel',version:'0.0.0',private:true,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),files:info[0].files.map(({path,size,mode})=>({path,size,mode}))};
 report.engineArchive={version:'1.0.0-rc.2',bytes:engineBytes.length,sha256:createHash('sha256').update(engineBytes).digest('hex')};
 report.sourceSelftestsPassed=testCount;report.strictInstalledTypecheck=true;
 const content=JSON.stringify(report,null,2)+'\n';
 await writeFile(resolve(repo,'wheel-consumer-report.json'),content);
 console.log('PROGRAMME_FILE_FINAL '+JSON.stringify({path:'docs/evidence/accessible-wheel-20261009/producer-'+process.env.GITHUB_RUN_ID+'/node'+process.versions.node.split('.')[0]+'.json',size:Buffer.byteLength(content),sha256:createHash('sha256').update(content).digest('hex'),base64:Buffer.from(content).toString('base64')}));
}finally{await rm(stage,{recursive:true,force:true});}
