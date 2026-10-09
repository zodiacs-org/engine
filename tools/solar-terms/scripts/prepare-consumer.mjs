import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=resolve(new URL('../../../',import.meta.url).pathname);
const work=mkdtempSync(resolve(tmpdir(),'zodiacs-solar-consumer-'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const command=(file,args,cwd)=>execFileSync(file,args,{cwd,encoding:'utf8',shell:false,timeout:60000,maxBuffer:2*1024*1024});
const archive=resolve(root,'artifacts/zodiacs-engine-1.0.0-rc.2.tgz');
assert.equal(hash(readFileSync(archive)),'4cd834b2dca085cd5732ecad6edbd82b61d7625d9a0647900c160a0747810002');
const packed=JSON.parse(command('npm',['pack','--ignore-scripts','--json','--pack-destination',work],resolve(root,'tools/solar-terms')));
assert.equal(packed.length,1);
assert.deepEqual(packed[0].files.map(f=>f.path).sort(),['LICENSE','README.md','index.d.mts','index.mjs','package.json'].sort());
const tar=resolve(work,packed[0].filename),consumer=resolve(work,'consumer');
mkdirSync(consumer);
writeFileSync(resolve(consumer,'package.json'),JSON.stringify({name:'private-solar-consumer',version:'0.0.0',private:true,type:'module'}));
command('npm',['install','--offline','--ignore-scripts','--no-audit','--no-fund',tar],consumer);
const oracle=resolve(work,'original-crossings');mkdirSync(oracle);
command('tar',['--extract','--gzip','--file',archive,'--directory',oracle,'package/dist/crossings.js','package/dist/chunk-TSS2SZWQ.js'],work);
const original=await import(pathToFileURL(resolve(oracle,'package/dist/crossings.js')).href);
const modulePath=resolve(consumer,'node_modules/@zodiacs/solar-terms/index.mjs');
const pkg=JSON.parse(readFileSync(resolve(consumer,'node_modules/@zodiacs/solar-terms/package.json'),'utf8'));
assert.equal(pkg.private,true);assert.equal(pkg.version,'0.0.0');
const {createSolarTermScanner}=await import(pathToFileURL(modulePath).href);
const yearDate=year=>{const d=new Date(0);d.setUTCFullYear(year,0,1);d.setUTCHours(0,0,0,0);return d;};
const rows=[];
for(const year of [1,99,1850,2000,2026,2049,9998]){
 const from=yearDate(year).getTime(),span=yearDate(year+1).getTime()-from;
 const longitude=(_body,date)=>(280+(date.getTime()-from)*360/span)%360;
 const engine={ENGINE_VERSION:'carried-rc.2 crossing algorithm',EPHEMERIS:'independently exact linear Sun oracle; no ephemeris',
   searchLongitudeCrossings:(body,target,a,b,options)=>original.searchLongitudeCrossingsWith(longitude,body,target,a,b,options)};
 const result=createSolarTermScanner(engine)(year);
 assert.equal(result.status,'computed');assert.equal(result.terms.length,24);
 assert.equal(result.accuracy.status,'unvalidated');assert.equal(result.completeness.status,'unproven');
 assert.ok(result.samples<=result.maxSamples);
 const errors=result.terms.map(term=>Math.abs(Date.parse(term.at)-Math.trunc(from+((term.longitude-280+360)%360)*span/360)));
 const maxErrorMs=Math.max(...errors);assert.ok(maxErrorMs<=12,'Independent linear crossing arithmetic exceeds its quantized bisection bound');
 const refused=createSolarTermScanner(engine)(year,{maxSamples:100});
 assert.equal(refused.status,'refused');assert.equal(refused.reason,'sample-budget');assert.deepEqual(refused.terms,[]);
 rows.push({year,terms:result.terms.length,samples:result.samples,maxErrorMs,budgetRefusesWhole:true});
}
const source=command('git',['rev-parse','HEAD'],root).trim();
const report={schema:'zodiacs.private-solar-term-consumer.v1',producer:{source,run:process.env.GITHUB_RUN_ID,node:process.version},
 pack:{bytes:readFileSync(tar).length,sha256:hash(readFileSync(tar)),files:packed[0].files.map(f=>f.path).sort()},
 carriedArchiveSha256:hash(readFileSync(archive)),linearControls:rows,
 accuracy:'unvalidated',completeness:'unproven',publication:'private; no registry publication',
 limitations:['Installed private pack and independent linear arithmetic only.','No actual solar ephemeris, independent astronomical comparison, TypeScript compiler or full repository suite was run by this script.']};
writeFileSync(resolve(root,'solar-term-consumer-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('SOLAR_TERM_CONSUMER '+JSON.stringify(report));
