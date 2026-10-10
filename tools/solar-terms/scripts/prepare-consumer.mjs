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
const importCheck=resolve(consumer,'import-check.mjs');
writeFileSync(importCheck,"import {createSolarTermScanner,SOLAR_TERMS} from '@zodiacs/solar-terms';\nif(typeof createSolarTermScanner!=='function'||SOLAR_TERMS.length!==24)throw Error('Installed exports differ');\n");
command(process.execPath,[importCheck],consumer);
const {createSolarTermScanner}=await import(pathToFileURL(modulePath).href);
const compiler=resolve(work,'compiler');mkdirSync(compiler);
writeFileSync(resolve(compiler,'package.json'),JSON.stringify({private:true}));
command('npm',['install','--ignore-scripts','--no-audit','--no-fund','--save-exact','typescript@5.8.3'],compiler);
const typed=`import {createSolarTermScanner,SOLAR_TERMS,type LongitudeEngine,type SolarTermResult} from '@zodiacs/solar-terms';
const provider: LongitudeEngine = {ENGINE_VERSION:'synthetic',EPHEMERIS:'independent linear control',
 searchLongitudeCrossings: (_body,_longitude,_from,_to,_options)=>({status:'complete',samples:1,crossings:[]})};
const structuredProvider={...provider,EPHEMERIS:Object.freeze({name:'synthetic linear oracle',version:'1'})};
const structuredScan=createSolarTermScanner(structuredProvider);
void structuredScan;
const scan=createSolarTermScanner(provider);
const result: SolarTermResult=scan(2026,{maxSamples:12000});
const certainty:'unvalidated'=result.accuracy.status;
const reference:null=result.accuracy.independentEventSeconds;
if(result.source.ephemerisIdentity.kind==='string'){const value:string=result.source.ephemerisIdentity.value;void value;}
else{const name:string=result.source.ephemerisIdentity.name;const version:string=result.source.ephemerisIdentity.version;void name;void version;}
if(result.status==='computed'){const when:string=result.terms[0].at;void when;}
else {const empty:[]=result.terms;void empty;}
// @ts-expect-error Structured ephemeris requires a version.
createSolarTermScanner({...provider,EPHEMERIS:{name:'oracle'}});
// @ts-expect-error Structured ephemeris version is a string.
createSolarTermScanner({...provider,EPHEMERIS:{name:'oracle',version:1}});
// @ts-expect-error The Sun provider body cannot silently change.
provider.searchLongitudeCrossings('Moon',0,new Date(),new Date(),{stepDays:2,maxSamples:100});
// @ts-expect-error Explicit provider required.
createSolarTermScanner({});
// @ts-expect-error Sample budget is numeric.
scan(2026,{maxSamples:'12000'});
// @ts-expect-error Unknown options refused at runtime and in the declaration.
scan(2026,{frame:'sidereal'});
// @ts-expect-error Calendar year is numeric.
scan('2026');
// @ts-expect-error Definitions cannot be mutated.
SOLAR_TERMS[0].longitude=999;
// @ts-expect-error Accuracy remains unvalidated in the public type.
const validated:'validated'=result.accuracy.status;
void certainty;void reference;void validated;
`;
writeFileSync(resolve(consumer,'consumer.mts'),typed);
const tsc=resolve(compiler,'node_modules/typescript/bin/tsc');
command(process.execPath,[tsc,'--noEmit','--strict','--target','ES2022','--module','NodeNext','--moduleResolution','NodeNext','--lib','ES2022','consumer.mts'],consumer);
const typeChecks={compiler:'5.8.3',lib:'ES2022 only; no DOM',strict:true,installedExports:true,negativeControls:9,structuredIdentityType:true};
const yearDate=year=>{const d=new Date(0);d.setUTCFullYear(year,0,1);d.setUTCHours(0,0,0,0);return d;};
const rows=[];
for(const year of [1,99,1850,2000,2026,2049,9998]){
 const from=yearDate(year).getTime(),span=yearDate(year+1).getTime()-from;
 const longitude=(_body,date)=>(280+(date.getTime()-from)*360/span)%360;
 const engine={ENGINE_VERSION:'carried-rc.2 crossing algorithm',EPHEMERIS:'independently exact linear Sun oracle; no ephemeris',
   searchLongitudeCrossings:(body,target,a,b,options)=>original.searchLongitudeCrossingsWith(longitude,body,target,a,b,options)};
 const structuredEngine={...engine,EPHEMERIS:Object.freeze({name:'independently exact linear Sun oracle; no ephemeris',version:'1'})};
 const result=createSolarTermScanner(structuredEngine)(year);
 const legacy=createSolarTermScanner(engine)(year);
 assert.deepEqual(result.terms,legacy.terms);
 assert.equal(result.source.ephemeris,'independently exact linear Sun oracle; no ephemeris@1');
 assert.equal(legacy.source.ephemeris,engine.EPHEMERIS);
 assert.equal(result.status,'computed');assert.equal(result.terms.length,24);
 assert.equal(result.accuracy.status,'unvalidated');assert.equal(result.completeness.status,'unproven');
 assert.ok(result.samples<=result.maxSamples);
 const errors=result.terms.map(term=>Math.abs(Date.parse(term.at)-Math.trunc(from+((term.longitude-280+360)%360)*span/360)));
 const maxErrorMs=Math.max(...errors);assert.ok(maxErrorMs<=12,'Independent linear crossing arithmetic exceeds its quantized bisection bound');
 const refused=createSolarTermScanner(structuredEngine)(year,{maxSamples:100});
 assert.equal(refused.status,'refused');assert.equal(refused.reason,'sample-budget');assert.deepEqual(refused.terms,[]);
 rows.push({year,terms:result.terms.length,samples:result.samples,maxErrorMs,budgetRefusesWhole:true});
}
const identityYear=2026,identityFrom=yearDate(identityYear).getTime(),identitySpan=yearDate(identityYear+1).getTime()-identityFrom;
const identityLongitude=(_body,date)=>(280+(date.getTime()-identityFrom)*360/identitySpan)%360;
const identityProvider={ENGINE_VERSION:'carried-rc.2 crossing algorithm',EPHEMERIS:{name:'a',version:'b@c'},
 searchLongitudeCrossings:(body,target,a,b,options)=>original.searchLongitudeCrossingsWith(identityLongitude,body,target,a,b,options)};
const encodedReceipts=[];
for(const [name,version] of [['a','b@c'],['a@b','c'],['a','b%40c'],['a%40b','c'],['a%','b@c'],['a','%b@c']]){
 const result=createSolarTermScanner({...identityProvider,EPHEMERIS:Object.freeze({name,version})})(identityYear);
 assert.equal(result.status,'computed');assert.equal(result.terms.length,24);
 encodedReceipts.push(result.source.ephemeris);
}
assert.equal(new Set(encodedReceipts).size,6);
for(const after of [{name:'a@b',version:'c'},'a@b%40c']){
 let calls=0;
 const provider={...identityProvider,EPHEMERIS:{name:'a',version:'b@c'},searchLongitudeCrossings(...args){
  calls++;const result=identityProvider.searchLongitudeCrossings(...args);provider.EPHEMERIS=after;return result;
 }};
 assert.throws(()=>createSolarTermScanner(provider)(identityYear),{name:'TypeError',message:'Longitude-source identity changed during the inventory'});
 assert.equal(calls,1);
}
const structuredReceipt=createSolarTermScanner(identityProvider)(identityYear);
const stringReceipt=createSolarTermScanner({...identityProvider,EPHEMERIS:'a@b%40c'})(identityYear);
assert.equal(structuredReceipt.source.ephemeris,stringReceipt.source.ephemeris);
assert.notDeepEqual(JSON.parse(JSON.stringify(structuredReceipt.source)),JSON.parse(JSON.stringify(stringReceipt.source)));
assert.deepEqual(structuredReceipt.source.ephemerisIdentity,{kind:'record',name:'a',version:'b@c'});
assert.deepEqual(stringReceipt.source.ephemerisIdentity,{kind:'string',value:'a@b%40c'});
const refusedReceipt=createSolarTermScanner(identityProvider)(identityYear,{maxSamples:100});
assert.equal(refusedReceipt.status,'refused');
assert.deepEqual(refusedReceipt.source.ephemerisIdentity,structuredReceipt.source.ephemerisIdentity);
const identityCollisionControls={distinctEncodedReceipts:encodedReceipts.length,delimiterMutationRefused:true,shapeMutationRefused:true,storedReceiptShapesDistinct:true,refusalRetainsIdentityShape:true};
const source=command('git',['rev-parse','HEAD'],root).trim();
const report={schema:'zodiacs.private-solar-term-consumer.v1',producer:{source,run:process.env.GITHUB_RUN_ID,node:process.version},
 pack:{bytes:readFileSync(tar).length,sha256:hash(readFileSync(tar)),files:packed[0].files.map(f=>f.path).sort()},
 carriedArchiveSha256:hash(readFileSync(archive)),linearControls:rows,typeChecks,ephemerisIdentityShapes:{string:true,structured:true,normalization:'escape % and @ within fields, then join with @',pairedInventories:rows.length,collisionControls:identityCollisionControls},
 accuracy:'unvalidated',completeness:'unproven',publication:'private; no registry publication',
 limitations:['Installed private pack and independent linear arithmetic only.','No actual solar ephemeris, independent astronomical comparison or full repository suite was run by this script.']};
writeFileSync(resolve(root,'solar-term-consumer-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('SOLAR_TERM_CONSUMER '+JSON.stringify(report));
