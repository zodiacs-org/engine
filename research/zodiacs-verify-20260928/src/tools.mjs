import {assert, canonicalize, instant, nonempty, plain, validateChartReceipt} from './core.mjs';
import {analyzeUncertainty, validateUncertaintyReport} from './uncertainty.mjs';
import {compareCharts} from './compare.mjs';
import {verifyClaims} from './claims.mjs';

const copy = value => JSON.parse(canonicalize(value));
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function fields(value, allowed, required, label) {
  plain(value,label);
  assert(Object.keys(value).every(key=>allowed.includes(key)), 'Unknown '+label+' field');
  assert(required.every(key=>Object.hasOwn(value,key)), 'Missing '+label+' field');
}
const string = {type:'string',minLength:1};
const utc = {...string,format:'date-time',description:'Resolved ISO datetime including seconds and an explicit UTC offset.'};
const settings = {
  timeKnowledge:{enum:['exact','reference']}, houseSystem:string,
  latitude:{type:'number',minimum:-90,maximum:90}, longitude:{type:'number',minimum:-180,maximum:180},
  deltaT:{type:'number',minimum:-1e10,maximum:1e10},
};
const object = (properties,required) => ({type:'object',properties,required,additionalProperties:false});
const feature = {oneOf:[
  object({id:string,kind:{const:'sign'},body:string},['id','kind','body']),
  object({id:string,kind:{const:'aspect'},a:string,b:string,angle:{type:'number',minimum:0,maximum:180},orb:{type:'number',minimum:0,maximum:180}},['id','kind','a','b','angle','orb']),
]};
const claim = {oneOf:[
  object({id:string,kind:{const:'fact'},subjectId:string,receiptId:string,factId:string,expected:{},scope:{const:'instant'}},['id','kind','subjectId','receiptId','factId','expected','scope']),
  object({id:string,kind:{const:'interval'},subjectId:string,reportId:string,featureId:string,expected:{},scope:{const:'interval'}},['id','kind','subjectId','reportId','featureId','expected','scope']),
  object({id:string,kind:{const:'interpretation'},subjectId:string,ruleId:string,basedOn:{type:'array',items:string,minItems:1,uniqueItems:true},text:string},['id','kind','subjectId','ruleId','basedOn','text']),
]};
const definitions = freeze([
  {name:'calculate_chart',description:'Calculate an instant chart with the operator-configured adapter and retain its sealed model output in this private session. A seal is not proof of astronomical correctness.',inputSchema:object({subjectId:string,utc,...settings},['subjectId','utc','timeKnowledge','houseSystem'])},
  {name:'analyze_uncertainty',description:'Sample up to seven days of resolved input intervals. No caller bounds or models are accepted; sampled agreement cannot establish interval stability.',inputSchema:object({
    subjectId:string,intervals:{type:'array',minItems:1,maxItems:32,items:object({from:utc,to:utc},['from','to'])},
    features:{type:'array',minItems:1,maxItems:64,items:feature},
    birth:object(settings,['timeKnowledge','houseSystem']),maxSamples:{type:'integer',minimum:1,maximum:100000},resolutionMs:{type:'integer',minimum:1,maximum:604800000},
  },['subjectId','intervals','features','birth'])},
  {name:'compare_charts',description:'Compare two chart receipts retained by this session. Differences do not establish which model is correct.',inputSchema:object({leftReceiptId:string,rightReceiptId:string,options:object({longitudeToleranceArcsec:{type:'number',minimum:0,maximum:648000}},[])},['leftReceiptId','rightReceiptId'])},
  {name:'verify_claims',description:'Check structured claims against retained session evidence and the immutable operator rule registry. Callers cannot add trust or evidence. Interpretation support checks provenance/dependencies, not text truth.',inputSchema:object({claims:{type:'array',items:claim}},['claims'])},
]);

function ruleRegistry(rules) {
  const snapshot=copy(rules);
  assert(Array.isArray(snapshot),'rules must be an array');
  const ids=new Set();
  for (const rule of snapshot) {
    fields(rule,['id','tradition','source','statement','epistemicStatus'],['id','tradition','source','statement','epistemicStatus'],'operator rule');
    for (const key of ['id','tradition','statement']) nonempty(rule[key],'rule.'+key);
    assert(!ids.has(rule.id),'Duplicate operator rule ID'); ids.add(rule.id);
    fields(rule.source,['title','locator'],['title','locator'],'rule source');
    nonempty(rule.source.title,'rule source title'); nonempty(rule.source.locator,'rule source locator');
    assert(['traditional','editorial','hypothesis'].includes(rule.epistemicStatus),'Invalid rule epistemicStatus');
  }
  return freeze(snapshot);
}

/**
 * A protocol-neutral local binding, not an MCP server or authentication boundary.
 * The operator supplies the trusted adapter and reviewed rule registry. Requests
 * can reference opaque evidence IDs but cannot confer trust on them. Evidence is
 * private in-memory FIFO state; returned values are detached JSON snapshots.
 */
export function createVerifySession(adapter, options={}) {
  assert(adapter && typeof adapter.calculate==='function' && typeof adapter.sample==='function','Adapter calculate/sample required');
  const optionSnapshot=copy(options);
  fields(optionSnapshot,['rules','maxEvidenceEntries'],[],'session option');
  const registry=ruleRegistry(Object.hasOwn(optionSnapshot,'rules')?optionSnapshot.rules:[]);
  const maxEntries=Object.hasOwn(optionSnapshot,'maxEvidenceEntries')?optionSnapshot.maxEvidenceEntries:64;
  assert(Number.isInteger(maxEntries)&&maxEntries>=1&&maxEntries<=256,'maxEvidenceEntries must be an integer in 1..256');
  const model=freeze(copy(adapter.model));
  const calculate=adapter.calculate.bind(adapter), sample=adapter.sample.bind(adapter);
  const evidence=new Map();
  let generation=0;
  function keep(value,type,started) {
    assert(generation===started,'Session cleared while operation was running');
    const snapshot=freeze(copy(value));
    if(type==='receipt')validateChartReceipt(snapshot);else validateUncertaintyReport(snapshot);
    const existing=evidence.get(snapshot.id);
    if(existing)assert(existing.type===type&&canonicalize(existing.value)===canonicalize(snapshot),'Evidence ID collision');
    else {
      evidence.set(snapshot.id,{type,value:snapshot});
      if(evidence.size>maxEntries)evidence.delete(evidence.keys().next().value);
    }
    return copy(snapshot);
  }
  function receipt(id) {
    nonempty(id,'receipt ID');
    const found=evidence.get(id);
    assert(found?.type==='receipt','Chart receipt is not retained in this session');
    return found.value;
  }
  async function execute(name,args) {
    assert(typeof name==='string' && definitions.some(tool=>tool.name===name),'Unknown Verify tool');
    const request=copy(args); // Snapshot before any await; reject getters/exotic JSON.
    const started=generation;
    if(name==='calculate_chart') {
      fields(request,['subjectId','utc',...Object.keys(settings)],['subjectId','utc','timeKnowledge','houseSystem'],'calculation request');
      return keep(await calculate(request),'receipt',started);
    }
    if(name==='analyze_uncertainty') {
      fields(request,['subjectId','intervals','features','birth','maxSamples','resolutionMs'],['subjectId','intervals','features','birth'],'uncertainty request');
      fields(request.birth,Object.keys(settings),['timeKnowledge','houseSystem'],'birth');
      assert(Array.isArray(request.intervals)&&request.intervals.length>0,'intervals required');
      const birth={...request.birth,subjectId:request.subjectId};
      // Same preflight/model binding as the CLI. The preflight chart is not
      // retained: only the requested uncertainty report consumes cache space.
      await calculate({...birth,utc:new Date(instant(request.intervals[0].from)).toISOString()});
      assert(generation===started,'Session cleared while operation was running');
      const boundModel={...model,conventions:{...model.conventions,
        ...(Object.hasOwn(birth,'deltaT')?{deltaT:{model:'pinned',seconds:birth.deltaT}}:{})},
        observer:{latitude:birth.latitude??null,longitude:birth.longitude??null,timeKnowledge:birth.timeKnowledge,houseSystem:birth.houseSystem}};
      const report=await analyzeUncertainty({subjectId:request.subjectId,model:boundModel,intervals:request.intervals,features:request.features,
        ...(Object.hasOwn(request,'maxSamples')?{maxSamples:request.maxSamples}:{}),
        ...(Object.hasOwn(request,'resolutionMs')?{resolutionMs:request.resolutionMs}:{}),
        sample:ms=>{assert(generation===started,'Session cleared while operation was running');return sample(ms,birth);}});
      return keep(report,'report',started);
    }
    if(name==='compare_charts') {
      fields(request,['leftReceiptId','rightReceiptId','options'],['leftReceiptId','rightReceiptId'],'comparison request');
      return copy(compareCharts(receipt(request.leftReceiptId),receipt(request.rightReceiptId),request.options));
    }
    fields(request,['claims'],['claims'],'claim request');
    const retained=[...evidence.values()];
    const receipts=retained.filter(item=>item.type==='receipt').map(item=>item.value);
    const reports=retained.filter(item=>item.type==='report').map(item=>item.value);
    return copy(verifyClaims({receipts,uncertaintyReports:reports,claims:request.claims,rules:registry,
      trustedReceiptIds:receipts.map(item=>item.id),trustedReportIds:reports.map(item=>item.id),
      trustedBoundIds:[],trustedRuleIds:registry.map(item=>item.id)}));
  }
  function clear() { generation++; evidence.clear(); }
  return Object.freeze({tools:definitions,execute,clear});
}
