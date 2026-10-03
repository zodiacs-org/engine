import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_AUDIT=path.resolve(HERE,'../../accuracy-audit-20260928');
const CONTRACT_FILE=path.resolve(HERE,'../data/reference-contract.json');
export const REFERENCE_CONTRACT_SHA256='3ac98b0de7cc74005720a30555e7348612f7ec4c78c63fc5b5aa7257f723e4f8';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const check=(condition,message)=>{if(!condition)throw new Error('Reference validation: '+message);};
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const epoch=utc=>{const t=Date.parse(utc);check(Number.isSafeInteger(t)&&new Date(t).toISOString()===utc,'invalid canonical epoch');return t;};
const ttJD=(utc,deltaT)=>2440587.5+(epoch(utc)/1000+deltaT)/86400;
const sameTT=(actual,expected,tolerance)=>finite(actual)&&Math.abs(actual-expected)*86400000<=tolerance;

/** Column-vector projection, independent of every target engine API. */
export function projectReferenceVector(position,matrix,tolerance=1e-12){
  check(Array.isArray(position)&&position.length===3&&position.every(finite),'position needs three finite values');
  check(Array.isArray(matrix)&&matrix.length===3&&matrix.every(r=>Array.isArray(r)&&r.length===3&&r.every(finite)),'matrix must be finite3x3');
  check(finite(tolerance)&&tolerance>0&&tolerance<=1e-10,'invalid matrix tolerance');
  for(let i=0;i<3;i++)for(let j=0;j<3;j++){
    const dot=matrix[i].reduce((s,x,k)=>s+x*matrix[j][k],0);
    check(Math.abs(dot-(i===j?1:0))<=tolerance,'matrix is not orthogonal');
  }
  const [a,b,c]=matrix;
  const det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
  check(Math.abs(det-1)<=tolerance,'matrix must be a proper rotation');
  const inputNorm=Math.hypot(...position);check(finite(inputNorm)&&inputNorm>0,'position has zero or invalid length');
  const v=matrix.map(row=>row.reduce((s,x,k)=>s+x*position[k],0));
  const radius=Math.hypot(...v);check(finite(radius)&&radius>0,'projected vector is invalid');
  check(Math.abs(radius-inputNorm)<=Math.max(1e-15,inputNorm*tolerance*4),'rotation changed vector length');
  const xy=Math.hypot(v[0],v[1]);check(xy>0,'longitude undefined at exact ecliptic pole');
  let lon=Math.atan2(v[1],v[0])*180/Math.PI;
  if(lon<0)lon=Math.min(lon+360,359.99999999999994);
  if(Object.is(lon,-0))lon=0;
  const lat=Math.atan2(v[2],xy)*180/Math.PI;
  check(finite(lon)&&lon>=0&&lon<360&&finite(lat)&&lat>=-90&&lat<=90,'invalid projected longitude/latitude');
  return {lon,lat};
}

function csv(line){
  const out=[];let value='',quoted=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){out.push(value.trim());value='';}else value+=c;
  }
  check(!quoted,'unterminated CSV field');out.push(value.trim());return out;
}
function field(header,label){
  const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const matches=[...header.matchAll(new RegExp('^'+escaped+'\\s*:\\s*(.+)$','gm'))];
  check(matches.length===1,'missing or repeated '+label+' header');return matches[0][1].trim();
}
function rawTable(bytes,spec,cases,contract){
  const data=JSON.parse(bytes);check(!data.error&&typeof data.result==='string','raw provider response failed');
  const parts=data.result.split('$$SOE');check(parts.length===2,'expected one start marker');
  const tail=parts[1].split('$$EOE');check(tail.length===2,'expected one end marker');
  const header=parts[0],target=field(header,'Target body name');
  check(new RegExp('\\('+spec.command+'\\)').test(target),'unexpected target ID');
  check(/Earth\s*\(399\)/.test(field(header,'Center body name')),'wrong geocentric origin');
  check(field(header,'Center-site name')==='BODY CENTER','wrong observation center');
  check(field(header,'Calendar mode')==='Gregorian','wrong calendar');
  check(field(header,'Reference frame')==='ICRF'&&field(header,'Output units')==='AU-D','wrong frame or units');
  const correction=field(header,'Output type').toUpperCase();
  check(spec.correction==='NONE'?correction.includes('GEOMETRIC'):correction.includes('LT+S'),'wrong apparent correction');
  const columnLines=header.split(/\r?\n/).filter(s=>s.includes('JDTT')&&s.includes(','));
  check(columnLines.length===1,'raw vectors must explicitly use JDTT');
  const names=csv(columnLines[0]),required=['JDTT','X','Y','Z','VX','VY','VZ','LT','RG','RR'];
  check(required.every(n=>names.filter(v=>v===n).length===1),'missing or duplicate vector column');
  const lines=tail[0].split(/\r?\n/).filter(s=>s.trim());check(lines.length===contract.epochCount,'wrong raw epoch count');
  const rows=lines.map((line,i)=>{
    const cells=csv(line);check(cells.length===names.length,'raw column count mismatch');
    const v=Object.fromEntries(required.map(n=>[n,Number(cells[names.indexOf(n)])]));
    check(required.every(n=>cells[names.indexOf(n)]!==''&&finite(v[n])),'nonfinite/empty raw vector value');
    check(sameTT(v.JDTT,ttJD(cases.instants[i],contract.deltaTSeconds),contract.epochToleranceMilliseconds),'incorrect raw TT epoch');
    const position=[v.X,v.Y,v.Z],radius=Math.hypot(...position);
    check(v.RG>0&&v.LT>0&&Math.abs(radius-v.RG)<=Math.max(1e-12,v.RG*1e-12),'raw vector/range inconsistency');
    return {position,velocity:[v.VX,v.VY,v.VZ],tt:v.JDTT,range:v.RG,lightTime:v.LT,rangeRate:v.RR};
  });
  return {rows,target,signature:data.signature};
}

/** Load authenticated, already-known regression references. Offline and read-only. */
export async function loadReferences({auditRoot=DEFAULT_AUDIT}={}){
  const contractBytes=await readFile(CONTRACT_FILE);
  check(hash(contractBytes)===REFERENCE_CONTRACT_SHA256,'committed reference contract hash mismatch');
  const contract=JSON.parse(contractBytes),files=new Map();
  for(const [relative,expected] of Object.entries(contract.inputFiles)){
    check(!path.isAbsolute(relative)&&!relative.split('/').includes('..'),'unsafe committed input path');
    const bytes=await readFile(path.resolve(auditRoot,relative));
    check(hash(bytes)===expected,'input hash mismatch: '+relative);files.set(relative,bytes);
  }
  const json=relative=>JSON.parse(files.get(relative));
  const cases=json('reference/cases.json'),protocol=json('reference/protocol.json');
  const vectors=json('reference/snapshot/vectors.json'),rotations=json('rotation/rotation-matrices.json');
  const freeze=json('rotation/freeze.json'),controls=json('rotation/controls.json');
  check(cases.deltaTSeconds===69&&protocol.clock.deltaTSeconds===69&&contract.deltaTSeconds===69,'changed clock pin');
  check(Array.isArray(cases.instants)&&cases.instants.length===21&&new Set(cases.instants).size===21,'missing/duplicate epoch');
  cases.instants.forEach(epoch);
  check(protocol.casesSha256===contract.inputFiles['reference/cases.json']&&vectors.casesSha256===protocol.casesSha256&&rotations.casesSha256===protocol.casesSha256,'cases provenance mismatch');
  check(vectors.protocolSha256===contract.inputFiles['reference/protocol.json'],'vector protocol provenance mismatch');
  check(equal(cases.bodies,protocol.primaryBodies)&&cases.bodies.length===10,'target definitions disagree');
  for(let i=0;i<10;i++)for(const key of ['body','command','referenceTarget'])check(cases.bodies[i][key]===contract.bodyTargets[i][key],'committed target ID changed');
  check(freeze.files['rotation-matrices.json']===contract.inputFiles['rotation/rotation-matrices.json']&&freeze.files['controls.json']===contract.inputFiles['rotation/controls.json'],'rotation freeze mismatch');
  check(controls.passed===true&&controls.tests_run===10,'rotation numerical controls did not pass');
  check(equal(rotations.versions,{pyerfa:'2.0.1.5',erfa:'2.0.1',sofa_heritage:'20231011'}),'unqualified orientation model');
  check(Array.isArray(rotations.rows)&&rotations.rows.length===21&&new Set(rotations.rows.map(r=>r.utc)).size===21,'missing/duplicate rotation epoch');
  const rotationMap=new Map(rotations.rows.map(r=>[r.utc,r]));
  for(const utc of cases.instants){
    const r=rotationMap.get(utc);check(r&&r.deltaTSeconds===69,'missing rotation or incorrect clock');
    check(Array.isArray(r.ttJdParts)&&r.ttJdParts.length===2&&r.ttJdParts.every(finite),'invalid two-part TT');
    check(sameTT(r.ttJd,ttJD(utc,69),1)&&sameTT(r.ttJdParts[0]+r.ttJdParts[1],ttJD(utc,69),1),'rotation epoch mismatch');
    check(Date.parse(r.ttIso)===epoch(utc)+69000,'rotation ISO clock mismatch');
    check(r.matrices&&Object.hasOwn(r.matrices,contract.matrixKey),'missing selected matrix');
    for(const m of Object.values(r.matrices))projectReferenceVector([1,1,1],m,contract.matrixOrthogonalityTolerance);
  }
  check(Array.isArray(vectors.rows)&&vectors.rows.length===contract.expectedManifestRows&&new Set(vectors.rows.map(r=>r.id)).size===vectors.rows.length,'missing or duplicate vector rows');
  const primary=vectors.rows.filter(r=>r.group==='primary');check(primary.length===420&&vectors.primaryRowCount===420,'primary vector count mismatch');
  const primaryKeys=new Set();
  for(const r of primary){
    const body=contract.bodyTargets.find(b=>b.body===r.body);
    check(body&&r.command===body.command&&r.referenceTarget===body.referenceTarget&&['NONE','LT+S'].includes(r.correction),'wrong vector target/correction');
    check(Number.isInteger(r.epochIndex)&&r.epochIndex>=0&&r.epochIndex<21,'invalid vector epoch index');
    const key=JSON.stringify([r.body,r.correction,r.epochIndex]);check(!primaryKeys.has(key),'duplicate primary vector');primaryKeys.add(key);
    check(r.syntheticUt1===cases.instants[r.epochIndex]&&r.deltaTSeconds===69&&sameTT(r.ttJulianDay,ttJD(r.syntheticUt1,69),1),'vector epoch/clock mismatch');
  }
  check(Array.isArray(vectors.sources)&&new Set(vectors.sources.map(s=>s.id)).size===vectors.sources.length,'duplicate source receipt');
  const rows=[],sources=[];
  for(const spec of contract.bodyTargets){
    const rawPath=`reference/snapshot/raw/${spec.tableId}.json`,receiptPath=`reference/snapshot/raw/${spec.tableId}.receipt.json`;
    const receipt=json(receiptPath),raw=rawTable(files.get(rawPath),spec,cases,contract);
    check(receipt.requestId===spec.tableId&&receipt.method==='GET'&&receipt.httpStatus===200&&receipt.transportError===null,'failed/mismatched acquisition receipt');
    check(receipt.rawSha256===contract.inputFiles[rawPath]&&receipt.rawFile===`raw/${spec.tableId}.json`,'raw acquisition provenance mismatch');
    for(const [k,v] of Object.entries(protocol.baseParameters))check(receipt.parameters[k]===v,'wrong acquisition parameter: '+k);
    check(receipt.parameters.COMMAND===spec.command&&receipt.parameters.VEC_CORR===spec.correction,'wrong requested target/correction');
    const requested=receipt.parameters.TLIST.replace(/^'|'$/g,'').split(',').map(Number);
    check(requested.length===21&&requested.every((jd,i)=>sameTT(jd,ttJD(cases.instants[i],69),1)),'request epoch list mismatch');
    const url=new URL(receipt.url);check(url.origin==='https://ssd.jpl.nasa.gov'&&url.pathname==='/api/horizons.api','unexpected acquisition endpoint');
    check([...url.searchParams].length===Object.keys(receipt.parameters).length&&Object.entries(receipt.parameters).every(([k,v])=>url.searchParams.getAll(k).length===1&&url.searchParams.get(k)===v),'request URL/parameters disagree');
    const source=vectors.sources.find(s=>s.id===spec.tableId);check(source&&source.rawSha256===receipt.rawSha256&&source.rows===21&&source.timeColumn==='JDTT','manifest source provenance mismatch');
    for(let i=0;i<21;i++){
      const matches=primary.filter(r=>r.tableId===spec.tableId&&r.epochIndex===i);check(matches.length===1,'missing/duplicate selected vector');
      const r=matches[0],v=raw.rows[i];
      check(r.id===`${spec.tableId}-${i}`&&r.body===spec.body&&r.correction===spec.correction,'wrong selected vector identity');
      check(equal(r.positionAu,v.position)&&equal(r.velocityAuPerDay,v.velocity)&&r.ttJulianDay===v.tt&&r.rangeAu===v.range&&r.lightTimeDays===v.lightTime&&r.rangeRateAuPerDay===v.rangeRate,'derived vectors do not reproduce raw response');
      check(r.rawSha256===receipt.rawSha256&&r.rawFile===receipt.rawFile,'selected vector raw provenance mismatch');
      const projected=projectReferenceVector(v.position,rotationMap.get(r.syntheticUt1).matrices[contract.matrixKey],contract.matrixOrthogonalityTolerance);
      rows.push({id:`${spec.body}-${i}`,body:spec.body,utc:r.syntheticUt1,deltaT:69,...projected,referenceTarget:spec.referenceTarget,correction:spec.correction});
    }
    sources.push({tableId:spec.tableId,command:spec.command,correction:spec.correction,targetHeader:raw.target,
      rawSha256:receipt.rawSha256,receiptSha256:contract.inputFiles[receiptPath],requestStartedAtUtc:receipt.requestStartedAtUtc,retrievedAtUtc:receipt.retrievedAtUtc,apiSignature:raw.signature});
  }
  check(rows.length===210&&new Set(rows.map(r=>r.id)).size===210,'normalized row count/identity mismatch');
  const payload={rows,provenance:{datasetRole:contract.datasetRole,referenceContractSha256:REFERENCE_CONTRACT_SHA256,
    sourceArtifact:'research/accuracy-audit-20260928',inputFiles:{...contract.inputFiles},sources,rotationModel:rotations.versions,
    normalization:'Raw JPL CSV reconstructed and cross-checked against frozen vector manifest, then independently rotated; no target values used.',
    frozenBeforeNewCandidateEvaluation:true},conventions:contract.conventions,limitations:contract.limitations};
  return {...payload,digest:'sha256:'+hash(JSON.stringify(payload))};
}
