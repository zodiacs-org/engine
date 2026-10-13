import { assert, digest, instant, seal, verifySeal, SIGNS } from './core.mjs';

const DAY_MS = 86_400_000;
const LIMITS = Object.freeze({ maxSpanMs:7*DAY_MS, maxIntervals:32, maxFeatures:64, maxSamples:100_000, maxBoundComparisons:100_000 });
const finite = x => typeof x === 'number' && Number.isFinite(x);
const iso = ms => new Date(ms).toISOString();
const text = x => typeof x === 'string' && x.length > 0;
const same = (a,b) => digest(a) === digest(b);
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && Object.getPrototypeOf(x) === Object.prototype;
const float = new DataView(new ArrayBuffer(8));
function up(x) {
  if (Number.isNaN(x) || x === Infinity) return x;
  if (x === 0) return Number.MIN_VALUE;
  float.setFloat64(0,x); let bits=float.getBigUint64(0); bits += x>0 ? 1n : -1n; float.setBigUint64(0,bits); return float.getFloat64(0);
}
const down = x => -up(-x);
const addUp = (a,b) => a===0 ? b : b===0 ? a : up(a+b);
function growth(bound, distanceMs) {
  if (distanceMs===0 || bound.maxAbsRateDegPerDay===0) return bound.absoluteErrorDeg;
  return addUp(bound.absoluteErrorDeg,up(up(bound.maxAbsRateDegPerDay/DAY_MS)*distanceMs));
}
function separationRange(a,b) {
  const difference=Math.abs(a-b);
  const lo=Math.max(0,down(difference)), hi=Math.min(360,up(difference));
  const low=Math.max(0,Math.min(lo,down(360-hi)));
  const high=hi<=180 ? hi : lo>=180 ? up(360-lo) : 180;
  return [low,Math.min(180,high)];
}
function valueAt(feature,longitudes) {
  const need=feature.kind==='sign'?[feature.body]:[feature.a,feature.b];
  if (!need.every(body=>finite(longitudes[body]) && longitudes[body]>=0 && longitudes[body]<360)) return undefined;
  if (feature.kind==='sign') return SIGNS[Math.floor(longitudes[feature.body]/30)];
  const difference=Math.abs(longitudes[feature.a]-longitudes[feature.b]);
  return Math.abs(Math.min(difference,360-difference)-feature.angle)<=feature.orb;
}
function union(intervals) {
  const sorted=intervals.map(i=>({from:typeof i.from==='number'?i.from:instant(i.from),to:typeof i.to==='number'?i.to:instant(i.to)})).sort((a,b)=>a.from-b.from||a.to-b.to);
  const out=[];
  for(const i of sorted){assert(i.from<=i.to,'Intervals must be nonempty and ordered.');const last=out.at(-1);if(last && i.from<=last.to)last.to=Math.max(last.to,i.to);else out.push({...i});}
  return out;
}
const encoded = intervals => intervals.map(i=>({from:iso(i.from),to:iso(i.to)}));
const inDomain = (ms, intervals) => intervals.some(i=>ms>=i.from&&ms<=i.to);
function checkFeatures(features) {
  assert(Array.isArray(features)&&features.length>0&&features.length<=LIMITS.maxFeatures,'features must contain 1..64 entries.');
  assert(new Set(features.map(f=>f.id)).size===features.length,'Feature IDs must be unique.');
  for(const f of features){
    assert(plain(f)&&text(f.id),'Feature must have a nonempty ID.');
    if(f.kind==='sign')assert(text(f.body),'Sign feature body required.');
    else assert(f.kind==='aspect'&&text(f.a)&&text(f.b)&&f.a!==f.b&&finite(f.angle)&&f.angle>=0&&f.angle<=180&&finite(f.orb)&&f.orb>=0&&f.orb<=180,'Invalid aspect feature.');
    const allowed=f.kind==='sign'?['id','kind','body']:['id','kind','a','b','angle','orb'];
    assert(Object.keys(f).every(k=>allowed.includes(k)),'Unknown feature field.');
  }
}
function checkBounds(assumptions,model,intervals) {
  assert(Array.isArray(assumptions)&&assumptions.length<=128,'bounds.assumptions must be an array of at most 128 entries.');
  const ids=new Set(),bodies=new Set(),modelDigest=digest(model);
  for(const b of assumptions){
    assert(plain(b)&&text(b.id)&&text(b.body)&&!ids.has(b.id)&&!bodies.has(b.body),'Bound IDs and bodies must be unique.');ids.add(b.id);bodies.add(b.body);
    assert(plain(b.source)&&text(b.source.title)&&text(b.source.locator),'Every bound requires a source title and locator.');
    assert(b.modelDigest===modelDigest,'Bound modelDigest must match the supplied model.');
    assert(plain(b.domain)&&typeof b.domain.from==='string'&&typeof b.domain.to==='string','Bound domain required.');
    assert(instant(b.domain.from)<=intervals[0].from&&instant(b.domain.to)>=intervals.at(-1).to,'Every bound must cover the complete requested domain hull.');
    assert(finite(b.maxAbsRateDegPerDay)&&b.maxAbsRateDegPerDay>=0&&finite(b.absoluteErrorDeg)&&b.absoluteErrorDeg>=0,'Bound rates and evaluation errors must be finite and nonnegative.');
    assert(Object.keys(b).every(k=>['id','body','source','modelDigest','domain','maxAbsRateDegPerDay','absoluteErrorDeg'].includes(k)),'Unknown bound field.');
  }
  return assumptions.map(b=>({...b,source:{...b.source},domain:{from:iso(instant(b.domain.from)),to:iso(instant(b.domain.to))}}));
}
const bodyBounds = assumptions => new Map(assumptions.map(b=>[b.body,b]));
function neededBounds(feature,byBody){return (feature.kind==='sign'?[feature.body]:[feature.a,feature.b]).map(body=>byBody.get(body));}
function classify(feature,cell,sample,byBody) {
  if(!sample || sample.status!=='ok')return {classification:'unresolved',value:null,reason:sample?.status==='error'?'sample-error':'sample-budget',boundIds:[]};
  const observed=valueAt(feature,sample.longitudes);
  if(observed===undefined)return {classification:'unresolved',value:null,reason:'missing-body',boundIds:[]};
  const bounds=neededBounds(feature,byBody),boundIds=bounds.filter(Boolean).map(b=>b.id).sort();
  if(bounds.some(b=>!b))return {classification:'unresolved',value:null,reason:'missing-conservative-bound',boundIds};
  const distance=Math.max(Math.abs(cell.from-instant(sample.utc)),Math.abs(cell.to-instant(sample.utc)));
  const radius=bounds.map(b=>growth(b,distance)).reduce(addUp,0);
  if(!Number.isFinite(radius))return {classification:'unresolved',value:null,reason:'enclosure-overflow',boundIds};
  if(feature.kind==='sign'){
    const longitude=sample.longitudes[feature.body],index=Math.floor(longitude/30);
    const left=down(longitude-index*30),right=down((index+1)*30-longitude);
    if(radius===0 || (radius<left&&radius<right))return {classification:'bounded',value:observed,reason:null,boundIds};
  }else{
    const [sepLo,sepHi]=separationRange(sample.longitudes[feature.a],sample.longitudes[feature.b]);
    const lo=down(sepLo-feature.angle),hi=up(sepHi-feature.angle);
    const absoluteLo=lo<=0&&hi>=0?0:Math.min(Math.abs(lo),Math.abs(hi));
    const absoluteHi=Math.max(Math.abs(lo),Math.abs(hi));
    const residualLo=down(down(absoluteLo-feature.orb)-radius);
    const residualHi=up(up(absoluteHi-feature.orb)+radius);
    if(residualHi<=0)return {classification:'bounded',value:true,reason:null,boundIds};
    if(residualLo>0)return {classification:'bounded',value:false,reason:null,boundIds};
  }
  return {classification:'unresolved',value:null,reason:'boundary-not-excluded',boundIds};
}
function violations(samples,assumptions) {
  const out=[],uncheckedBoundIds=[];let comparisons=0;
  for(const bound of assumptions){
    const points=samples.filter(s=>s.status==='ok'&&finite(s.longitudes[bound.body])).map(s=>({...s,ms:instant(s.utc)})).sort((a,b)=>a.ms-b.ms);
    // Adjacent checks alone are insufficient when position errors are nonzero:
    // the same allowance cannot be accumulated independently at each sample.
    pairs: for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
      if(comparisons>=LIMITS.maxBoundComparisons){uncheckedBoundIds.push(bound.id);break pairs;}
      comparisons++;
      const a=points[i],b=points[j],allowed=addUp(growth(bound,b.ms-a.ms),bound.absoluteErrorDeg);
      // Circular distance cannot exceed180°. Later times only increase this allowance.
      if(allowed>=180)break;
      const observedLower=separationRange(a.longitudes[bound.body],b.longitudes[bound.body])[0];
      if(observedLower>allowed){out.push({boundId:bound.id,from:a.utc,to:b.utc,observedDistanceLowerDeg:observedLower,allowedDistanceUpperDeg:allowed});break pairs;}
    }
  }
  return {violations:out,consistency:{comparisons,maxComparisons:LIMITS.maxBoundComparisons,uncheckedBoundIds}};
}

/**
 * Conditional Lipschitz classifier. Engine samples never supply conservative bounds.
 * bounds={assumptions:[{id,body,source:{title,locator},modelDigest:digest(model),
 * domain:{from,to},maxAbsRateDegPerDay,absoluteErrorDeg}]}.
 * Bounds are caller assertions; their truth is NOT independently checked.
 */
export async function analyzeUncertainty(options) {
  assert(plain(options)&&Object.keys(options).every(k=>['subjectId','model','intervals','features','sample','bounds','maxSamples','resolutionMs'].includes(k)),'Unknown uncertainty option.');
  const {subjectId,model,intervals,features,sample,bounds,maxSamples=1024,resolutionMs=60_000}=options;
  assert(text(subjectId),'subjectId required.');assert(plain(model),'model must be a plain JSON object.');digest(model);
  assert(Array.isArray(intervals)&&intervals.length>0&&intervals.length<=LIMITS.maxIntervals,'intervals must contain 1..32 closed UTC intervals.');
  for(const i of intervals)assert(plain(i)&&typeof i.from==='string'&&typeof i.to==='string'&&Object.keys(i).every(k=>['from','to'].includes(k)),'Intervals require explicit from/to UTC strings only.');
  const domain=union(intervals);assert(domain.at(-1).to-domain[0].from<=LIMITS.maxSpanMs,'Requested interval hull exceeds the seven-day limit.');
  checkFeatures(features);assert(typeof sample==='function','sample callback required.');
  assert(Number.isSafeInteger(maxSamples)&&maxSamples>=1&&maxSamples<=LIMITS.maxSamples,'maxSamples must be an integer in 1..100000.');
  assert(Number.isSafeInteger(resolutionMs)&&resolutionMs>=1&&resolutionMs<=LIMITS.maxSpanMs,'resolutionMs must be a positive integer within seven days.');
  if(bounds!==undefined)assert(plain(bounds)&&Object.keys(bounds).length===1&&Object.hasOwn(bounds,'assumptions'),'bounds must contain only assumptions.');
  const assumptions=checkBounds(bounds?.assumptions??[],model,domain),byBody=bodyBounds(assumptions),cache=new Map();
  const evaluate=async ms=>{
    if(cache.has(ms))return cache.get(ms);
    if(cache.size>=maxSamples)return null;
    // Reserve before await: every attempted callback, including failures, consumes budget.
    cache.set(ms,{utc:iso(ms),status:'error',message:'Evaluation incomplete.'});
    try{
      const result=await sample(ms);
      assert(plain(result)&&plain(result.longitudes)&&Array.isArray(result.warnings)&&result.warnings.every(x=>typeof x==='string'),'sample must return longitudes and string warnings.');
      for(const [body,longitude] of Object.entries(result.longitudes))assert(text(body)&&finite(longitude)&&longitude>=0&&longitude<360,'Sample longitudes must be finite in [0,360).');
      cache.set(ms,{utc:iso(ms),status:'ok',longitudes:{...result.longitudes},warnings:[...result.warnings]});
    }catch(error){cache.set(ms,{utc:iso(ms),status:'error',message:String(error?.message??error)});}
    return cache.get(ms);
  };
  const pending=[...domain].reverse(),leaves=[];
  while(pending.length){
    const cell=pending.pop();
    await evaluate(cell.from);if(cell.to!==cell.from)await evaluate(cell.to);
    const midpoint=cell.from+Math.floor((cell.to-cell.from)/2);
    let anchor=await evaluate(midpoint);
    if(!anchor)anchor=cache.get(cell.from)??cache.get(cell.to)??null;
    const classifications=features.map(f=>classify(f,cell,anchor,byBody));
    const needsRefining=classifications.some(c=>c.classification!=='bounded');
    if(needsRefining&&cell.to-cell.from>resolutionMs&&midpoint>cell.from&&midpoint<cell.to&&cache.size<maxSamples){
      pending.push({from:midpoint,to:cell.to},{from:cell.from,to:midpoint});
    }else{
      leaves.push({...cell,anchorUtc:anchor?.utc??null,classifications:classifications.map(c=>c.classification==='bounded'?c:{...c,reason:cache.size>=maxSamples?'sample-budget':c.reason})});
    }
  }
  const samples=[...cache.values()].sort((a,b)=>instant(a.utc)-instant(b.utc));
  const consistencyCheck=violations(samples,assumptions),boundViolations=consistencyCheck.violations,boundConsistency=consistencyCheck.consistency;
  const violated=new Set(boundViolations.map(v=>v.boundId)),unchecked=new Set(boundConsistency.uncheckedBoundIds);
  const results=features.map((feature,index)=>{
    const observed=new Map();
    for(const s of samples){if(s.status!=='ok')continue;const value=valueAt(feature,s.longitudes);if(value!==undefined&&!observed.has(JSON.stringify(value)))observed.set(JSON.stringify(value),{utc:s.utc,value});}
    const cells=leaves.map(cell=>{
      let c=cell.classifications[index];
      if(c.boundIds.some(id=>violated.has(id)))c={...c,classification:'unresolved',value:null,reason:'supplied-bound-contradicted'};
      else if(c.boundIds.some(id=>unchecked.has(id)))c={...c,classification:'unresolved',value:null,reason:'bound-consistency-budget'};
      return {from:iso(cell.from),to:iso(cell.to),anchorUtc:cell.anchorUtc,...c};
    });
    const allBounded=cells.every(c=>c.classification==='bounded');
    const values=[...observed.values()].map(w=>w.value),witnesses=[...observed.values()];
    const boundedValues=[...new Set(cells.filter(c=>c.classification==='bounded').map(c=>c.value))];
    const stable=allBounded&&boundedValues.length===1&&values.length===1&&values[0]===boundedValues[0];
    return {featureId:feature.id,status:stable?'stable':values.length>1?'variable':'unresolved',values,coverage:allBounded?'bounded':'sampled',boundIds:[...new Set(cells.flatMap(c=>c.boundIds))].sort(),witnesses,cells,unresolvedRanges:encoded(union(cells.filter(c=>c.classification==='unresolved')))};
  });
  const report=seal({schema:'zodiacs.verify.uncertainty.v1',subjectId,model,intervals:encoded(domain),features:features.map(f=>({...f})),boundAssumptions:assumptions,
    assurance:assumptions.length?'conditional-on-supplied-bounds':'sampled-only',results,complete:results.every(r=>r.coverage==='bounded'),samples,boundViolations,boundConsistency,
    budget:{maxSamples,callsUsed:cache.size,resolutionMs,exhausted:cache.size>=maxSamples},limits:{...LIMITS,domain:'continuous model time over closed UTC intervals; sampling callback uses integer epoch milliseconds'},
    warnings:['Bounds are externally asserted and not independently verified. Stable means full conditional coverage under all referenced bounds.','Finite pairwise consistency is necessary, not proof that a supplied bound holds between samples. Incomplete consistency checks force dependent results unresolved.','Variable means different sampled values were observed; it does not enumerate all possible values or locate every transition.','No probabilities, physical ephemeris accuracy, astrological interpretation or event-time completeness are established.']});
  return validateUncertaintyReport(report);
}

export function validateUncertaintyReport(report) {
  assert(plain(report)&&report.schema==='zodiacs.verify.uncertainty.v1'&&verifySeal(report),'Invalid uncertainty report schema or seal.');
  assert(text(report.subjectId)&&plain(report.model),'Invalid subject/model.');
  assert(Array.isArray(report.intervals)&&report.intervals.length>0&&report.intervals.length<=LIMITS.maxIntervals,'Invalid intervals.');
  const domain=union(report.intervals);assert(same(encoded(domain),report.intervals)&&domain.at(-1).to-domain[0].from<=LIMITS.maxSpanMs,'Report intervals must be canonical and within span limit.');
  checkFeatures(report.features);const assumptions=checkBounds(report.boundAssumptions,report.model,domain),byBody=bodyBounds(assumptions);
  assert(same(assumptions,report.boundAssumptions),'Bound assumptions must be canonical.');
  assert(report.assurance===(assumptions.length?'conditional-on-supplied-bounds':'sampled-only'),'Assurance does not match supplied bounds.');
  assert(plain(report.budget)&&Number.isSafeInteger(report.budget.maxSamples)&&report.budget.maxSamples>=1&&report.budget.maxSamples<=LIMITS.maxSamples&&Number.isSafeInteger(report.budget.resolutionMs)&&report.budget.resolutionMs>=1&&report.budget.resolutionMs<=LIMITS.maxSpanMs,'Invalid call budget.');
  assert(Array.isArray(report.samples)&&report.samples.length<=report.budget.maxSamples&&report.budget.callsUsed===report.samples.length&&report.budget.exhausted===(report.samples.length>=report.budget.maxSamples),'Call accounting inconsistent.');
  const cache=new Map();
  for(const s of report.samples){
    const t=instant(s.utc);assert(iso(t)===s.utc&&inDomain(t,domain)&&!cache.has(s.utc),'Invalid/duplicate sample instant.');
    assert(s.status==='ok'||s.status==='error','Unknown sample status.');
    if(s.status==='ok'){assert(plain(s.longitudes)&&Array.isArray(s.warnings)&&s.warnings.every(x=>typeof x==='string'),'Malformed sample.');for(const v of Object.values(s.longitudes))assert(finite(v)&&v>=0&&v<360,'Invalid sampled longitude.');}
    else assert(typeof s.message==='string','Sample failure message required.');
    cache.set(s.utc,s);
  }
  const consistencyCheck=violations(report.samples,assumptions),actualViolations=consistencyCheck.violations,violated=new Set(actualViolations.map(v=>v.boundId)),unchecked=new Set(consistencyCheck.consistency.uncheckedBoundIds);
  assert(same(actualViolations,report.boundViolations),'Bound contradiction ledger is inconsistent.');
  assert(same(consistencyCheck.consistency,report.boundConsistency),'Bound consistency accounting is inconsistent.');
  assert(Array.isArray(report.results)&&report.results.length===report.features.length&&new Set(report.results.map(r=>r.featureId)).size===report.features.length,'Feature results incomplete or duplicated.');
  for(const result of report.results){
    const feature=report.features.find(f=>f.id===result.featureId);assert(feature,'Unknown result feature.');
    assert(Array.isArray(result.cells)&&result.cells.length>0,'Every result must account for the whole domain.');
    for(const cell of result.cells){
      const from=instant(cell.from),to=instant(cell.to);assert(from<=to&&domain.some(i=>from>=i.from&&to<=i.to),'Cell lies outside one allowed domain component.');
      assert(cell.classification==='bounded'||cell.classification==='unresolved','Unknown cell classification.');
      assert(Array.isArray(cell.boundIds)&&new Set(cell.boundIds).size===cell.boundIds.length&&cell.boundIds.every(id=>assumptions.some(b=>b.id===id)),'Invalid cell bound reference.');
      if(cell.anchorUtc!==null)assert(cache.has(cell.anchorUtc),'Cell anchor sample missing.');
      if(cell.classification==='bounded'){
        assert(!cell.boundIds.some(id=>violated.has(id)),'A contradicted bound cannot establish stability.');
        assert(!cell.boundIds.some(id=>unchecked.has(id)),'An incompletely checked bound cannot establish stability.');
        const recomputed=classify(feature,{from,to},cache.get(cell.anchorUtc),byBody);
        assert(recomputed.classification==='bounded'&&same(recomputed.boundIds,cell.boundIds)&&recomputed.value===cell.value&&cell.reason===null,'Bounded cell evidence does not establish its value.');
      }else assert(cell.value===null&&text(cell.reason),'Unresolved cell needs explicit reason and no claimed value.');
    }
    assert(same(encoded(union(result.cells)),report.intervals),'Cell coverage contains gaps or missing components.');
    const observed=new Map();for(const s of report.samples){if(s.status!=='ok')continue;const value=valueAt(feature,s.longitudes);if(value!==undefined&&!observed.has(JSON.stringify(value)))observed.set(JSON.stringify(value),{utc:s.utc,value});}
    const witnesses=[...observed.values()],values=witnesses.map(w=>w.value);
    assert(same(result.values,values)&&same(result.witnesses,witnesses),'Observed witnesses/values inconsistent.');
    const allBounded=result.cells.every(c=>c.classification==='bounded'),boundedValues=[...new Set(result.cells.filter(c=>c.classification==='bounded').map(c=>c.value))];
    const stable=allBounded&&boundedValues.length===1&&values.length===1&&values[0]===boundedValues[0];
    assert(result.coverage===(allBounded?'bounded':'sampled')&&result.status===(stable?'stable':values.length>1?'variable':'unresolved'),'Status exceeds available evidence.');
    assert(same(result.boundIds,[...new Set(result.cells.flatMap(c=>c.boundIds))].sort()),'Result bound references incomplete.');
    assert(same(result.unresolvedRanges,encoded(union(result.cells.filter(c=>c.classification==='unresolved')))),'Unresolved ranges omitted or inconsistent.');
    if(stable)assert(result.boundIds.length>0,'Stable requires explicit external bound assumptions.');
  }
  assert(report.complete===report.results.every(r=>r.coverage==='bounded'),'Overall completeness exceeds interval coverage.');
  assert(Array.isArray(report.warnings)&&report.warnings.every(x=>typeof x==='string'),'Warnings must be strings.');
  return report;
}
