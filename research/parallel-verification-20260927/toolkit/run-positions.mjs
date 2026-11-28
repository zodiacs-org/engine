#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateReferences,circularDifference} from './reference-check.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2); const arg=(n,d)=>args.includes(n)?args[args.indexOf(n)+1]:d;
const target=arg('--engine');if(!target)throw new Error('--engine /absolute/path/dist/index.js required');
const out=arg('--out',path.join(here,'results.json'));
const casesBytes=fs.readFileSync(path.join(here,'cases.json'));const cases=JSON.parse(casesBytes);
const refPath=arg('--references',path.join(here,'references','positions.json'));const refs=JSON.parse(fs.readFileSync(refPath));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
validateReferences(casesBytes,refs,file=>fs.readFileSync(path.join(path.dirname(refPath),file)));
const engine=await import(pathToFileURL(path.resolve(target)).href);
const circular=circularDifference;
const cache=new Map();
const rows=refs.rows.map(r=>{
 const key=r.utc+'/'+r.deltaT;
 if(!cache.has(key)){
  const chart=engine.natalChart({utc:r.utc,deltaT:r.deltaT});
  if(chart.deltaT?.model!=='pinned'||chart.deltaT?.seconds!==r.deltaT)throw new Error('Target did not honor pinned time convention');
  cache.set(key,chart);
 }
 const chart=cache.get(key),actual=chart.bodies.find(b=>b.body===r.body);
 if(!actual || chart.bodies.filter(b=>b.body===r.body).length!==1 || !Number.isFinite(actual.lon)||!Number.isFinite(actual.lat)||actual.lon<0||actual.lon>=360||Math.abs(actual.lat)>90)throw new Error('Invalid target output: '+r.id);
 const longitudeResidualArcsec=circular(actual.lon,r.lon)*3600;
 const latitudeResidualArcsec=(actual.lat-r.lat)*3600;
 return {id:r.id,body:r.body,utc:r.utc,referenceTarget:r.referenceTarget,longitudeResidualArcsec,latitudeResidualArcsec,diagnosticPass:Math.max(Math.abs(longitudeResidualArcsec),Math.abs(latitudeResidualArcsec))<=cases.positionDiagnosticToleranceArcsec,aspirationalPass:Math.max(Math.abs(longitudeResidualArcsec),Math.abs(latitudeResidualArcsec))<=cases.aspirationalToleranceArcsec};
});
const sorted=v=>[...v].sort((a,b)=>a-b),percentile=(v,p)=>sorted(v)[Math.ceil(p*v.length)-1];
const groups=cases.bodies.map(({body})=>{const rs=rows.filter(r=>r.body===body);const lon=rs.map(r=>Math.abs(r.longitudeResidualArcsec)),lat=rs.map(r=>Math.abs(r.latitudeResidualArcsec));return {body,cases:rs.length,maxLongitudeResidualArcsec:Math.max(...lon),p95LongitudeResidualArcsec:percentile(lon,.95),maxLatitudeResidualArcsec:Math.max(...lat),diagnosticFailures:rs.filter(r=>!r.diagnosticPass).length,aspirationalFailures:rs.filter(r=>!r.aspirationalPass).length};});
const report={schemaVersion:1,generatedAt:new Date().toISOString(),engineVersion:engine.ENGINE_VERSION,ephemeris:engine.EPHEMERIS,runtime:process.version,casesSha256:refs.casesSha256,referenceSha256:hash(fs.readFileSync(refPath)),diagnosticToleranceArcsec:cases.positionDiagnosticToleranceArcsec,aspirationalToleranceArcsec:cases.aspirationalToleranceArcsec,scope:'Finite differences from JPL quantity31 under explicitly different conventions; not absolute accuracy or a certified bound.',knownDifferences:cases.knownDifferences,summary:{cases:rows.length,diagnosticFailures:rows.filter(r=>!r.diagnosticPass).length,aspirationalFailures:rows.filter(r=>!r.aspirationalPass).length},groups,rows};
fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));process.exitCode=report.summary.diagnosticFailures?1:0;
