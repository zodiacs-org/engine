import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createSolarTermScanner,SOLAR_TERMS} from './index.mjs';
function linearEngine(year){
 const start=new Date(0);start.setUTCFullYear(year,0,1);start.setUTCHours(0,0,0,0);
 const end=new Date(start);end.setUTCFullYear(year+1);
 const from=start.getTime(),span=end-start;
 return {ENGINE_VERSION:'independent-test-source',EPHEMERIS:'exact linear angular oracle',
  searchLongitudeCrossings(body,longitude,a,b,options){
   assert.equal(body,'Sun');assert.equal(a.getTime(),from);assert.equal(b.getTime(),from+span);
   assert.equal(options.stepDays,2);assert.ok(Number.isInteger(options.maxSamples)&&options.maxSamples>0);
   return {status:'complete',samples:3,crossings:[{at:new Date(from+((longitude-280+360)%360)*span/360),retrograde:false}]};
  }};
}
test('calendar-year inventory retains independently defined angles and UTC instants',()=>{
 for(const year of [1,99,1850,2000,2026,2049,9998]){
  const engine=linearEngine(year),result=createSolarTermScanner(engine)(year);
  assert.equal(result.status,'computed');assert.equal(result.terms.length,360/15);
  assert.deepEqual(result.terms.map(t=>t.longitude).sort((a,b)=>a-b),Array.from({length:360/15},(_,i)=>i*15));
  assert.equal(result.samples,3*(360/15));assert.equal(result.maxSamples,12000);assert.equal(result.accuracy.status,'unvalidated');assert.equal(result.completeness.status,'unproven');
  for(const term of result.terms)assert.equal(term.at,engine.searchLongitudeCrossings('Sun',term.longitude,new Date(result.window.from),new Date(result.window.to),{stepDays:2,maxSamples:1000}).crossings[0].at.toISOString());
  assert.ok(result.terms.every((t,i)=>i===0||Date.parse(t.at)>Date.parse(result.terms[i-1].at)));
 }
});
test('catalog distinguishes the alternating jie and zhongqi longitudes',()=>{
 assert.equal(SOLAR_TERMS.find(t=>t.pinyin==='Lichun').longitude,315);
 assert.equal(SOLAR_TERMS.find(t=>t.pinyin==='Dongzhi').longitude,270);
 for(const term of SOLAR_TERMS)assert.equal(term.kind,term.longitude%30===15?'jie':'zhongqi');
 assert.ok(Object.isFrozen(SOLAR_TERMS)&&SOLAR_TERMS.every(Object.isFrozen));
});
test('one aggregate budget refuses atomically after earlier completed searches',()=>{
 const base=linearEngine(2026);let calls=0;
 const engine={...base,searchLongitudeCrossings(...args){calls++;return base.searchLongitudeCrossings(...args);}};
 const result=createSolarTermScanner(engine)(2026,{maxSamples:6});
 assert.equal(calls,2);assert.equal(result.status,'refused');assert.equal(result.reason,'sample-budget');assert.equal(result.samples,6);assert.deepEqual(result.terms,[]);
});
test('a source refusal discards every earlier term',()=>{
 const base=linearEngine(2026);let calls=0;
 const engine={...base,searchLongitudeCrossings(...args){calls++;return calls===4?{status:'refused',reason:'sample-budget',samples:2,crossings:[]}:base.searchLongitudeCrossings(...args);}};
 const result=createSolarTermScanner(engine)(2026);assert.equal(result.status,'refused');assert.equal(result.samples,11);assert.deepEqual(result.terms,[]);
});
test('missing and duplicate crossings refuse the whole inventory',()=>{
 for(const crossings of [[],[{at:new Date('2026-03-01T00:00:00Z'),retrograde:false},{at:new Date('2026-03-02T00:00:00Z'),retrograde:false}]]){
  const engine={...linearEngine(2026),searchLongitudeCrossings:()=>({status:'complete',samples:1,crossings})};
  const result=createSolarTermScanner(engine)(2026);assert.equal(result.reason,'unexpected-solar-crossing-count');assert.deepEqual(result.terms,[]);
 }
 const engine={...linearEngine(2026),searchLongitudeCrossings:()=>({status:'complete',samples:1,crossings:[{at:new Date('2026-06-01T00:00:00Z'),retrograde:false}]})};
 assert.equal(createSolarTermScanner(engine)(2026).reason,'non-distinct-solar-crossings');
});
test('year and plain option validation happen before any source call',()=>{
 let calls=0,accessors=0;const engine={...linearEngine(2026),searchLongitudeCrossings(){calls++;throw Error('Source must not run');}};
 const scan=createSolarTermScanner(engine);
 for(const year of [0,-1,9999,2026.1,NaN,Infinity,'2026'])assert.throws(()=>scan(year),RangeError);
 const accessor=Object.defineProperty({},'maxSamples',{enumerable:true,get(){accessors++;return 10;}});
 for(const options of [null,[],new Date(),{maxSamples:null},{maxSamples:0},{maxSamples:Infinity},{maxSamples:1000001},{unknown:1},{[Symbol('unsupported')]:1},accessor])assert.throws(()=>scan(2026,options),RangeError);
 assert.equal(calls,0);assert.equal(accessors,0);
});
test('malformed provider accounting and coordinates are refused as protocol errors',()=>{
 const base=linearEngine(2026);
 const invalid=[
  {status:'complete',samples:-1,crossings:[]},
  {status:'complete',samples:12001,crossings:[]},
  {status:'refused',reason:'other',samples:1,crossings:[]},
  {status:'refused',reason:'sample-budget',samples:1,crossings:[{}]},
  {status:'other',samples:1,crossings:[]},
  {status:'complete',samples:1,crossings:[{at:new Date(NaN),retrograde:false}]},
  {status:'complete',samples:1,crossings:[{at:new Date('2026-03-01T00:00:00Z'),retrograde:true}]},
  {status:'complete',samples:1,crossings:[{at:new Date('2026-01-01T00:00:00Z'),retrograde:false}]},
  {status:'complete',samples:1,crossings:[{at:new Date('2027-01-01T00:00:00.001Z'),retrograde:false}]},
 ];
 for(const result of invalid)assert.throws(()=>createSolarTermScanner({...base,searchLongitudeCrossings:()=>result})(2026),TypeError);
});
test('one source cannot mutate the calendar window used by later searches',()=>{
 const base=linearEngine(2026);const engine={...base,searchLongitudeCrossings(...args){
  const result=base.searchLongitudeCrossings(...args);args[2].setUTCFullYear(1900);args[3].setUTCFullYear(1900);return result;
 }};
 assert.equal(createSolarTermScanner(engine)(2026).status,'computed');
});
test('empty source identities fail before invoking a provider and are rechecked for every inventory',()=>{
 const base=linearEngine(2026);let calls=0;
 const engine={...base,searchLongitudeCrossings(...args){calls++;return base.searchLongitudeCrossings(...args);}};
 for(const field of ['ENGINE_VERSION','EPHEMERIS']){
  for(const value of ['', ' ', '\t\n', '\u00a0', null, undefined, 42]){
   assert.throws(()=>createSolarTermScanner({...engine,[field]:value}),TypeError);
  }
  const scan=createSolarTermScanner(engine),original=engine[field];
  engine[field]=' ';
  assert.throws(()=>scan(2026),TypeError);
  assert.equal(calls,0);
  engine[field]=original;
 }
 const result=createSolarTermScanner(engine)(2026);
 assert.equal(result.status,'computed');assert.equal(calls,24);
 assert.deepEqual(result.source,{engine:base.ENGINE_VERSION,ephemeris:base.EPHEMERIS});
});

test('frozen name/version ephemeris records normalize to an immutable receipt string',()=>{
 const base=linearEngine(2026);
 const ephemeris=Object.freeze({name:'independent linear Sun oracle',version:'1'});
 const result=createSolarTermScanner({...base,EPHEMERIS:ephemeris})(2026);
 assert.equal(result.status,'computed');
 assert.deepEqual(result.source,{engine:base.ENGINE_VERSION,ephemeris:'independent linear Sun oracle@1'});
 assert.equal(typeof result.source.ephemeris,'string');
 assert.ok(Object.isFrozen(ephemeris));
});
test('malformed structured identities and later mutations are refused before source calls',()=>{
 const base=linearEngine(2026);let calls=0,accessors=0;
 const engine={...base,searchLongitudeCrossings(...args){calls++;return base.searchLongitudeCrossings(...args);}};
 const accessor=Object.defineProperty({version:'1'},'name',{enumerable:true,get(){accessors++;return 'oracle';}});
 const malformed=[[],{},new Date(),{name:'oracle'},{version:'1'},{name:'',version:'1'},{name:'oracle',version:' '},{name:42,version:'1'},{name:'oracle',version:42},{name:'oracle',version:'1',extra:true},accessor,Object.create({name:'oracle',version:'1'})];
 for(const EPHEMERIS of malformed)assert.throws(()=>createSolarTermScanner({...engine,EPHEMERIS}),TypeError);
 assert.equal(calls,0);assert.equal(accessors,0);
 const identity={name:'independent linear Sun oracle',version:'1'};
 engine.EPHEMERIS=identity;
 const scan=createSolarTermScanner(engine);
 identity.version=' ';
 assert.throws(()=>scan(2026),TypeError);
 assert.equal(calls,0);
 identity.version='2';
 const result=scan(2026);
 assert.equal(result.source.ephemeris,'independent linear Sun oracle@2');
 identity.version='3';
 assert.equal(result.source.ephemeris,'independent linear Sun oracle@2');
});
