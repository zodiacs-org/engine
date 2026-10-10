import test from 'node:test';
import assert from 'node:assert/strict';
import {sha256,validateReferences,circularDifference} from './reference-check.mjs';
function example(){
 const casesBytes=Buffer.from(JSON.stringify({deltaTSeconds:69,bodies:[{body:'Sun',command:'10',referenceTarget:'body-center'}],instants:['2026-01-01T00:00:00.000Z']}));
 const raw=Buffer.from(JSON.stringify({result:'Target body name: Sun (10) {source: synthetic-control}\nCenter body name: Earth (399)\nCenter-site name: GEOCENTRIC\nCalendar mode   : Gregorian\n Date__(TT)__HR:MN:SC.fff, , , ObsEcLon, ObsEcLat,\n$$SOE\n2026-Jan-01 00:01:09.000, , , 280.12, 0.02,\n$$EOE'}));
 const h=sha256(raw);
 const refs={casesSha256:sha256(casesBytes),responses:[{body:'Sun',file:'sun.json',sha256:h,parameters:{COMMAND:'10',TIME_TYPE:'TT',QUANTITIES:'31',CENTER:'500@399',CAL_TYPE:'GREGORIAN'}}],rows:[{body:'Sun',utc:'2026-01-01T00:00:00.000Z',deltaT:69,command:'10',referenceTarget:'body-center',rawFile:'sun.json',rawSha256:h,lon:280.12,lat:.02}]};
 return {casesBytes,raw,refs};
}
function alteredRaw(e,from,to){
 const raw=Buffer.from(e.raw.toString().replace(from,to));
 assert.notDeepEqual(raw,e.raw,'Negative control must change its fixture');
 e.refs.responses[0].sha256=sha256(raw);e.refs.rows[0].rawSha256=sha256(raw);
 return raw;
}
test('complete fixture is linked to raw independent response',()=>{const e=example();assert.equal(validateReferences(e.casesBytes,e.refs,()=>e.raw),true);});
test('missing case cannot produce empty pass',()=>{const e=example();e.refs.rows=[];assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>e.raw),/coverage/);});
test('modified processed expectation cannot pass raw integrity',()=>{const e=example();e.refs.rows[0].lon+=1;assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>e.raw),/Processed reference/);});
test('wrong time scale is refused',()=>{const e=example();e.refs.responses[0].parameters.TIME_TYPE='UT';assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>e.raw),/convention/);});
test('modified raw response is refused',()=>{const e=example();assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>Buffer.from('{}')),/integrity/);});
test('moved epoch is refused even with internally updated raw digest',()=>{const e=example();const raw=Buffer.from(e.raw.toString().replace('00:01:09','00:01:10'));e.refs.responses[0].sha256=sha256(raw);e.refs.rows[0].rawSha256=sha256(raw);assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/epoch/);});
test('changed case policy is refused',()=>{const e=example();assert.throws(()=>validateReferences(Buffer.from('{}'),e.refs,()=>e.raw),/policy/);});
test('longitude seam comparison is circular',()=>{assert.ok(Math.abs(circularDifference(.001,359.999)-.002)<1e-10);assert.ok(Math.abs(circularDifference(359.999,.001)+.002)<1e-10);});
test('raw response body overrides claimed request metadata',()=>{const e=example();const raw=alteredRaw(e,'Sun (10)','Moon (301)');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/target differs/);});
test('raw response must be centered on Earth',()=>{const e=example();const raw=alteredRaw(e,'Earth (399)','Sun (10)');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/origin/);});
test('an Earth surface observation is not a geocentric reference',()=>{const e=example();const raw=alteredRaw(e,'GEOCENTRIC','Greenwich Observatory');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/origin/);});
test('raw TT header is checked independently of claimed request scale',()=>{const e=example();const raw=alteredRaw(e,'Date__(TT)__','Date__(UT)__');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/columns/);});
test('raw calendar header is checked independently of request metadata',()=>{const e=example();const raw=alteredRaw(e,'Gregorian','Julian');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/calendar/);});
test('swapped reference coordinate columns are rejected',()=>{const e=example();const raw=alteredRaw(e,'ObsEcLon, ObsEcLat','ObsEcLat, ObsEcLon');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/columns/);});
test('a missing source-header field is rejected',()=>{const e=example();const raw=alteredRaw(e,'Target body name:','Missing target:');assert.throws(()=>validateReferences(e.casesBytes,e.refs,()=>raw),/raw reference header/);});
