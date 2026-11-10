import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha256=b=>crypto.createHash('sha256').update(b).digest('hex');
export const circularDifference=(a,b)=>((a-b+540)%360)-180;
const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function parseTT(label){
 const m=label.trim().match(/^(\d{4})-([A-Z][a-z]{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d+)$/);
 if(!m||!months.includes(m[2]))throw new Error('Malformed reference epoch');
 return Date.UTC(+m[1],months.indexOf(m[2]),+m[3],+m[4],+m[5],+m[6],Number(('0.'+m[7]))*1000);
}
function validateRawHeader(header,spec){
 const lines=header.split('\n');
 const field=(label)=>{
  const matches=lines.filter(line=>line.trimStart().startsWith(label));
  if(matches.length!==1)throw new Error('Missing or duplicate raw reference header: '+label);
  return matches[0].trim();
 };
 const target=field('Target body name:').match(/^Target body name:\s+.+?\s*\((\d+)\)(?:\s|$)/);
 if(!target||target[1]!==spec.command)throw new Error('Raw reference target differs from requested body');
 if(!/^Center body name:\s+Earth\s*\(399\)(?:\s|$)/.test(field('Center body name:'))||
    field('Center-site name:')!=='Center-site name: GEOCENTRIC')throw new Error('Raw reference origin is not Earth geocenter');
 const calendar=lines.filter(line=>/^\s*Calendar mode\s*:/.test(line));
 if(calendar.length!==1||!/^\s*Calendar mode\s*:\s*Gregorian\s*$/.test(calendar[0]))throw new Error('Raw reference calendar differs from Gregorian');
 const columns=lines.filter(line=>line.includes('ObsEcLon')).map(line=>line.split(',').map(s=>s.trim()));
 const expected=['Date__(TT)__HR:MN:SC.fff','','','ObsEcLon','ObsEcLat',''];
 if(columns.length!==1||columns[0].length!==expected.length||columns[0].some((v,i)=>v!==expected[i]))throw new Error('Unexpected raw reference TT/longitude/latitude columns');
}
export function validateReferences(casesBytes,refs,readRaw){
 const cases=JSON.parse(casesBytes);
 if(sha256(casesBytes)!==refs.casesSha256)throw new Error('Case policy changed after reference acquisition');
 const count=cases.bodies.length*cases.instants.length;
 if(refs.rows?.length!==count||refs.responses?.length!==cases.bodies.length)throw new Error('Incomplete reference coverage');
 const rawByBody=new Map();
 for(const response of refs.responses){
  const spec=cases.bodies.find(b=>b.body===response.body);
  if(!spec||rawByBody.has(response.body))throw new Error('Unknown or duplicate reference response');
  const raw=readRaw(response.file);
  if(sha256(raw)!==response.sha256)throw new Error('Raw reference integrity failure');
  if(response.parameters?.COMMAND!==spec.command||response.parameters?.TIME_TYPE!=='TT'||response.parameters?.QUANTITIES!=='31'||response.parameters?.CENTER!=='500@399'||response.parameters?.CAL_TYPE!=='GREGORIAN')throw new Error('Unexpected reference convention');
  const data=JSON.parse(raw);
  if(data.error||!data.result?.includes('$$SOE')||!data.result?.includes('$$EOE'))throw new Error('Missing reference table');
  validateRawHeader(data.result.split('$$SOE')[0],spec);
  const rows=data.result.split('$$SOE')[1].split('$$EOE')[0].trim().split('\n').map(line=>line.split(',').map(s=>s.trim()));
  if(rows.length!==cases.instants.length)throw new Error('Incomplete raw reference coverage');
  rawByBody.set(response.body,{response,rows});
 }
 const seen=new Set();
 for(const r of refs.rows){
  const spec=cases.bodies.find(b=>b.body===r.body);const i=cases.instants.indexOf(r.utc);
  if(!spec||i<0||seen.has(r.body+'/'+r.utc))throw new Error('Unexpected or duplicated reference row');
  seen.add(r.body+'/'+r.utc);
  const source=rawByBody.get(r.body),raw=source.rows[i];
  if(r.deltaT!==cases.deltaTSeconds||r.command!==spec.command||r.referenceTarget!==spec.referenceTarget||r.rawFile!==source.response.file||r.rawSha256!==source.response.sha256)throw new Error('Reference row provenance mismatch');
  if(Math.abs(parseTT(raw[0])-(Date.parse(r.utc)+cases.deltaTSeconds*1000))>(cases.referenceEpochToleranceMilliseconds??0))throw new Error('Reference epoch mismatch');
  if(!Number.isFinite(r.lon)||!Number.isFinite(r.lat)||r.lon!==Number(raw[3])||r.lat!==Number(raw[4]))throw new Error('Processed reference differs from original response');
 }
 return true;
}
