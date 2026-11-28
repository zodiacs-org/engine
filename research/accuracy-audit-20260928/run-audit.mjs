#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateReferences} from './baseline/reference-check.mjs';
import {spherical,fromSpherical,angleArcsec,longitudeDeltaArcsec,rotate,components} from './math.mjs';
import {assessInputTimeSensitivity,SENSITIVITY_POLICY} from './product-impact/sensitivity.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const options={};
for(let i=2;i<process.argv.length;i++){
  const key=process.argv[i];
  if(!['--engine','--out','--python'].includes(key)||!process.argv[i+1])throw new Error('Usage: node run-audit.mjs --engine PATH --out FRESH_DIR [--python python3]');
  options[key]=process.argv[++i];
}
if(!options['--engine']||!options['--out'])throw new Error('--engine and --out are required');
const enginePath=fs.realpathSync(options['--engine']),out=path.resolve(options['--out']);
if(fs.existsSync(out)&&(!fs.statSync(out).isDirectory()||fs.readdirSync(out).length))throw new Error('Output directory must be fresh or empty');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
const write=(name,value)=>fs.writeFileSync(path.join(out,name),JSON.stringify(value,null,2)+'\n');
function packageRoot(entry){let dir=path.dirname(entry);while(dir!==path.dirname(dir)){if(fs.existsSync(path.join(dir,'package.json')))return dir;dir=path.dirname(dir)}throw new Error('Package metadata not found');}
function fileMap(dir,prefix=''){
  const result={};
  for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    if(['node_modules','.git'].includes(entry.name))continue;
    const rel=prefix+entry.name,full=path.join(dir,entry.name);
    if(entry.isSymbolicLink())throw new Error('Unexpected target symlink');
    if(entry.isDirectory())Object.assign(result,fileMap(full,rel+'/'));else result[rel]=sha(fs.readFileSync(full));
  }
  return result;
}
const sameMap=(a,b)=>Object.keys(a).length===Object.keys(b).length&&Object.entries(a).every(([k,v])=>b[k]===v);
const baseline=read('baseline/identity.json'),pkgDir=packageRoot(enginePath),require=createRequire(enginePath);
const distribution={...fileMap(path.join(pkgDir,'dist'),'dist/'),'package.json':sha(fs.readFileSync(path.join(pkgDir,'package.json')))};
const dependencyPath=require.resolve('astronomy-engine'),dependencyDir=packageRoot(dependencyPath),dependencyFiles=fileMap(dependencyDir);
const identity={sourceCommit:baseline.sourceCommit,engineVersion:baseline.engineVersion??JSON.parse(fs.readFileSync(path.join(pkgDir,'package.json'))).version,
  entrySha256:sha(fs.readFileSync(enginePath)),runtime:process.version,distributionMatches:sameMap(distribution,baseline.artifactFiles),dependencyMatches:sameMap(dependencyFiles,baseline.dependency.files),distribution,dependencyFiles};
write('target-identity.json',identity);
if(!identity.distributionMatches||!identity.dependencyMatches)throw new Error('This source-convention study requires the exact frozen baseline bytes; adapt and review the provider contract before using another candidate');

const tasks=[];
function command(name,executable,args){
  const r=spawnSync(executable,args,{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
  fs.writeFileSync(path.join(out,name+'.log'),(r.stdout??'')+(r.stderr??'')+(r.error?String(r.error):''));
  tasks.push({name,passed:r.status===0&&!r.error,exitCode:r.status});
  if(r.status!==0||r.error)throw new Error(name+' failed; see its log');
}
command('math-controls',process.execPath,['--test','test-math.mjs']);
command('product-impact-controls',process.execPath,['product-impact/test-sensitivity.mjs','--output',path.join(out,'product-impact-controls.json')]);
command('vector-reference-controls',options['--python']??'python3',['reference/check-reference.py','--output',path.join(out,'vector-reference-controls.json')]);
command('raw-vector-replay',options['--python']??'python3',['reference/acquire-vectors.py','--mode','replay','--manifest-output',path.join(out,'vectors-replayed.json')]);

const casesBytes=fs.readFileSync(path.join(root,'baseline/cases.json')),cases=JSON.parse(casesBytes);
const oldRefs=read('baseline/references/positions.json');
validateReferences(casesBytes,oldRefs,name=>fs.readFileSync(path.join(root,'baseline/references',name)));
const savedVectors=read('reference/snapshot/vectors.json'),vectors=JSON.parse(fs.readFileSync(path.join(out,'vectors-replayed.json')));
if(vectors.protocolSha256!=='a337cc4616b14434d57ff2954ea177f328a0db3f3dc2a59b0ea84104eb7d9dda')throw new Error('Frozen vector acquisition protocol changed');
if(JSON.stringify(vectors.rows)!==JSON.stringify(savedVectors.rows))throw new Error('Processed vectors differ from raw reconstruction');
if(vectors.primaryRowCount!==420||vectors.casesSha256!==sha(casesBytes))throw new Error('Wrong vector comparison domain');
const rotations=read('rotation/rotation-matrices.json'),rotationFreeze=read('rotation/freeze.json');
for(const [file,expected] of Object.entries(rotationFreeze.files))if(sha(fs.readFileSync(path.join(root,'rotation',file)))!==expected)throw new Error('Frozen rotation artifact changed: '+file);
if(rotations.casesSha256!==sha(casesBytes)||rotations.rows.length!==cases.instants.length)throw new Error('Wrong rotation domain');
for(const row of rotations.rows){
  if(!cases.instants.includes(row.utc))throw new Error('Unexpected rotation epoch');
  for(const matrix of Object.values(row.matrices)){
    rotate(matrix,[1,0,0]);
    for(let i=0;i<3;i++)for(let j=0;j<3;j++)if(Math.abs(matrix[i].reduce((sum,x,k)=>sum+x*matrix[j][k],0)-(i===j?1:0))>1e-12)throw new Error('Nonorthogonal reference rotation');
    const m=matrix,det=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
    if(Math.abs(det-1)>1e-12)throw new Error('Reference rotation has wrong handedness');
  }
}

const engine=await import(pathToFileURL(enginePath).href),astro=await import(pathToFileURL(path.join(dependencyDir,'esm/astronomy.js')).href);
const chartCache=new Map();
function chartAt(utc){
  if(!chartCache.has(utc)){
    const chart=engine.natalChart({utc,deltaT:69,timeKnown:false});
    if(chart.deltaT?.model!=='pinned'||chart.deltaT?.seconds!==69)throw new Error('Target ignored pinned clock');
    for(const {body} of cases.bodies){const matches=chart.bodies.filter(p=>p.body===body);if(matches.length!==1||!Number.isFinite(matches[0].lon)||!Number.isFinite(matches[0].lat)||matches[0].lon<0||matches[0].lon>=360||Math.abs(matches[0].lat)>90)throw new Error('Malformed target chart');}
    chartCache.set(utc,chart);
  }
  return chartCache.get(utc);
}
const xyz=v=>[v.x,v.y,v.z];
const subtract=(a,b)=>a.map((x,i)=>x-b[i]);
const findVector=(body,index,correction,group='primary')=>{
  const rows=vectors.rows.filter(r=>r.body===body&&r.epochIndex===index&&r.correction===correction&&r.group===group);
  if(rows.length!==1)throw new Error('Missing or duplicate vector '+body+'/'+index+'/'+correction+'/'+group);return rows[0];
};
const rows=[];
for(const [index,utc] of cases.instants.entries()){
  const rotationRows=rotations.rows.filter(r=>r.utc===utc);
  if(rotationRows.length!==1)throw new Error('Duplicate rotation epoch');
  const matrices=rotationRows[0].matrices;
  const expectedJd=2440587.5+(Date.parse(utc)/1000+69)/86400;
  if(Math.abs(rotationRows[0].ttJd-expectedJd)*86400>.001)throw new Error('Rotation epoch mismatch');
  const chart=chartAt(utc),before60=chartAt(new Date(Date.parse(utc)-60000).toISOString()),after60=chartAt(new Date(Date.parse(utc)+60000).toISOString()),before300=chartAt(new Date(Date.parse(utc)-300000).toISOString()),after300=chartAt(new Date(Date.parse(utc)+300000).toISOString());
  astro.SetDeltaTFunction(()=>69);
  const time=astro.MakeTime(new Date(utc)),earth=xyz(astro.HelioVector(astro.Body.Earth,time)),targetRotation=astro.Rotation_EQJ_ECT(time);
  const directDeltaTSeconds=(time.tt-time.ut)*86400;
  if(Math.abs(directDeltaTSeconds-69)>0.00001)throw new Error('Direct provider clock differs from the declared pin');
  for(const {body} of cases.bodies){
    const publicBody=chart.bodies.find(p=>p.body===body),target={longitude:publicBody.lon,latitude:publicBody.lat};
    const chosenCorrection=body==='Moon'?'NONE':'LT+S';
    const selected=findVector(body,index,chosenCorrection),geometric=findVector(body,index,'NONE'),corrected=findVector(body,index,'LT+S');
    const independentVector=rotate(matrices.trueOfDateICRS,selected.positionAu),independent=spherical(independentVector);
    const sharedVector=xyz(astro.RotateVector(targetRotation,new astro.Vector(...selected.positionAu,time))),shared=spherical(sharedVector);
    const providerGeometric=body==='Moon'?xyz(astro.GeoMoon(time)):subtract(xyz(astro.HelioVector(astro.Body[body],time)),earth);
    const providerSelected=body==='Moon'?xyz(astro.GeoMoon(time)):xyz(astro.GeoVector(astro.Body[body],time,true));
    const providerProjected=xyz(astro.RotateVector(targetRotation,new astro.Vector(...providerSelected,time)));
    const original=oldRefs.rows.find(r=>r.body===body&&r.utc===utc);if(!original)throw new Error('Original comparison row missing');
    const budget=components(target,shared,independent,{longitude:original.lon,latitude:original.lat});
    const longitudeDifferenceArcsec=longitudeDeltaArcsec(target.longitude,independent.longitude),latitudeDifferenceArcsec=(target.latitude-independent.latitude)*3600;
    const rate=seconds=>{
      const low=(seconds===60?before60:before300).bodies.find(p=>p.body===body).lon,high=(seconds===60?after60:after300).bodies.find(p=>p.body===body).lon;
      return longitudeDeltaArcsec(high,low)/(seconds*2);
    };
    rows.push({body,utc,epochIndex:index,referenceTarget:selected.referenceTarget,selectedCorrection:chosenCorrection,
      directProviderClock:{utDaysFromJ2000:time.ut,ttDaysFromJ2000:time.tt,deltaTSeconds:directDeltaTSeconds},
      target,independentReference:independent,sharedFrameReference:shared,
      longitudeDifferenceArcsec,latitudeDifferenceArcsec,
      independentFrameSeparationArcsec:angleArcsec(fromSpherical(target.longitude,target.latitude),independentVector),
      sameTargetFrameSeparationArcsec:angleArcsec(fromSpherical(target.longitude,target.latitude),sharedVector),
      providerGeometricSeparationArcsec:angleArcsec(providerGeometric,geometric.positionAu),
      providerSelectedSeparationArcsec:angleArcsec(providerSelected,selected.positionAu),
      publicProviderReductionSeparationArcsec:angleArcsec(fromSpherical(target.longitude,target.latitude),providerProjected),
      rotationChoiceSeparationArcsec:angleArcsec(sharedVector,independentVector),
      frameBiasSensitivityArcsec:angleArcsec(independentVector,rotate(matrices.trueOfDateMeanJ2000,selected.positionAu)),
      meanVsTrueEclipticSensitivityArcsec:angleArcsec(independentVector,rotate(matrices.meanOfDateICRS,selected.positionAu)),
      fixedVsDateEclipticSensitivityArcsec:angleArcsec(independentVector,rotate(matrices.fixedJ2000ICRS,selected.positionAu)),
      jplCorrectionSensitivityArcsec:angleArcsec(geometric.positionAu,corrected.positionAu),
      signedCoordinateBudget:budget,
      observedTropicalSignAgreement:Math.floor(target.longitude/30)===Math.floor(independent.longitude/30),
      inputTimeSensitivity:assessInputTimeSensitivity({body,utc,longitudeDifferenceArcsec,longitudeRateArcsecPerSecond60s:rate(60),longitudeRateArcsecPerSecond300s:rate(300),conventionStatus:SENSITIVITY_POLICY.conventionStatus})
    });
  }
}
const stats=values=>{const x=[...values].sort((a,b)=>a-b);if(!x.length||!x.every(Number.isFinite))throw new Error('Invalid statistics input');const m=Math.floor(x.length/2);return {minimum:x[0],median:x.length%2?x[m]:(x[m-1]+x[m])/2,maximum:x.at(-1)};};
const keys=['independentFrameSeparationArcsec','sameTargetFrameSeparationArcsec','providerGeometricSeparationArcsec','providerSelectedSeparationArcsec','publicProviderReductionSeparationArcsec','rotationChoiceSeparationArcsec','frameBiasSensitivityArcsec','meanVsTrueEclipticSensitivityArcsec','fixedVsDateEclipticSensitivityArcsec','jplCorrectionSensitivityArcsec'];
const groups=cases.bodies.map(({body})=>{const group=rows.filter(r=>r.body===body);return {body,cases:group.length,exceedOneArcsecondInLongitudeOrLatitude:group.filter(r=>Math.max(Math.abs(r.longitudeDifferenceArcsec),Math.abs(r.latitudeDifferenceArcsec))>1).length,metrics:Object.fromEntries(keys.map(key=>[key,stats(group.map(r=>r[key]))]))};});
const centers=vectors.rows.filter(r=>r.group==='optional-body-center').map(center=>{const primary=findVector(center.body,center.epochIndex,'LT+S');return {body:center.body,utc:center.syntheticUt1,bodyCenterId:center.command,systemBarycenterId:primary.command,angularSeparationArcsec:angleArcsec(center.positionAu,primary.positionAu),sourceIds:[center.id,primary.id]};});
const summary={rows:rows.length,exceedOneArcsecondInLongitudeOrLatitude:rows.filter(r=>Math.max(Math.abs(r.longitudeDifferenceArcsec),Math.abs(r.latitudeDifferenceArcsec))>1).length,observedSignDisagreements:rows.filter(r=>!r.observedTropicalSignAgreement).length,inputTimeEstimates:rows.filter(r=>r.inputTimeSensitivity.status==='sampled-linearization').length,inputTimeRefusals:rows.filter(r=>r.inputTimeSensitivity.status!=='sampled-linearization').length,inputTimeExtrapolations:rows.filter(r=>r.inputTimeSensitivity.extrapolatesBeyondDerivativeSamples===true).length,metrics:Object.fromEntries(keys.map(key=>[key,stats(rows.map(r=>r[key]))]))};
const report={schemaVersion:1,generatedAt:new Date().toISOString(),scope:'Convention-aligned follow-up diagnostics with explicitly remaining correction/frame/center differences; finite observations, no certified physical error bounds.',identity,
  referenceDigests:{cases:sha(casesBytes),oldQ31:sha(fs.readFileSync(path.join(root,'baseline/references/positions.json'))),vectors:sha(fs.readFileSync(path.join(root,'reference/snapshot/vectors.json'))),rotationMatrices:sha(fs.readFileSync(path.join(root,'rotation/rotation-matrices.json')))},
  clock:vectors.clock,protocol:'AUDIT-PROTOCOL.md',coordinateBudget:'Signed per-coordinate identity; angular separations and group statistics are non-additive. No causal percentage attribution.',
  limitations:['EQJ/FK5 J2000 and ICRF remain distinct axes; mean-J2000 variant is a sensitivity diagnostic.','Engine apparent-position correction retards both Earth and target, unlike JPL standard LT+S.','Reference centers are explicit; the approximate provider coefficients do not establish a physical-center guarantee.','Moon selected reference is geometric; original Q31 was apparent.','Input-time estimates use finite derivatives, never event-time error or birth-time uncertainty.','The existing 21 dates are not a blind holdout.'],
  summary,groups,bodyCenterControls:centers,optionalReferenceFailures:vectors.optionalFailures,rows};
write('report.json',report);
tasks.push({name:'accuracy-attribution',passed:true,rows:rows.length});
write('summary.json',{schemaVersion:1,generatedAt:new Date().toISOString(),tasks,failedTasks:0,rows:rows.length,exceedOneArcsecond:summary.exceedOneArcsecondInLongitudeOrLatitude,accuracyGate:'None; successful execution means integrity/controls passed, not astronomical precision certified.'});
console.log(JSON.stringify(summary,null,2));
