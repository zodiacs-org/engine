import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createChartReceipt, digest, compareCharts, analyzeUncertainty, verifyClaims } from '../src/index.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const out = path.join(root,'reports','synthetic-demo');
await mkdir(out,{recursive:true});
const model={engine:'synthetic-linear-demonstration',engineVersion:'1',
  artifact:{digest:digest('demo-constant-sun-linear-moon-v1'),scope:'analytic demonstration, not astronomical data'},
  conventions:{zodiac:'tropical',origin:'synthetic',frame:'synthetic-longitude',corrections:'none',timeScale:'UTC-like synthetic time',deltaT:'not applicable'}};
const subjectId='synthetic-demo-person';
const intervals=[{from:'2000-01-01T12:00:00Z',to:'2000-01-01T12:10:00Z'}];
const start=Date.parse(intervals[0].from);
const chart=createChartReceipt({schema:'zodiacs.verify.chart.v1',subjectId,
  context:{utc:new Date(start).toISOString(),latitude:null,longitude:null,timeKnowledge:'exact',requestedHouseSystem:'whole',effectiveHouseSystem:null},model,
  facts:[{id:'longitude:Sun',kind:'longitude',entity:'Sun',value:15,unit:'deg',scope:'instant'},{id:'sign:Sun',kind:'sign',entity:'Sun',value:'Aries',scope:'instant'}],warnings:['SYNTHETIC: These placements are invented analytic fixtures, not a real chart.']});
const {id:discard,...payload}=chart;
const changed=createChartReceipt({...payload,facts:payload.facts.map(f=>f.kind==='longitude'?{...f,value:15.01}:f)});
const comparison=compareCharts(chart,changed,{longitudeToleranceArcsec:1});
const assumptions=[['Sun',0],['Moon',29]].map(([body,rate])=>({id:'synthetic-bound:'+body,body,source:{title:'Synthetic demo function',locator:'examples/demo.mjs'},
  modelDigest:digest(model),domain:intervals[0],maxAbsRateDegPerDay:rate,absoluteErrorDeg:1e-10}));
const uncertainty=await analyzeUncertainty({subjectId,model,intervals,
  features:[{id:'sun-sign',kind:'sign',body:'Sun'},{id:'moon-sign',kind:'sign',body:'Moon'}],
  sample:async ms=>({longitudes:{Sun:15,Moon:29.9+(ms-start)/600000*0.2},warnings:['SYNTHETIC analytic fixture']}),
  bounds:{assumptions},maxSamples:129,resolutionMs:1000});
const rules=JSON.parse(await readFile(path.join(root,'examples','rules.json'),'utf8'));
const input={receipts:[chart],uncertaintyReports:[uncertainty],rules,
  trustedReceiptIds:[chart.id],trustedReportIds:[uncertainty.id],trustedBoundIds:assumptions.map(x=>x.id),trustedRuleIds:rules.map(x=>x.id),
  claims:[
    {id:'correct-sun',kind:'fact',subjectId,receiptId:chart.id,factId:'sign:Sun',expected:'Aries',scope:'instant'},
    {id:'invented-sun',kind:'fact',subjectId,receiptId:chart.id,factId:'sign:Sun',expected:'Taurus',scope:'instant'},
    {id:'stable-sun',kind:'interval',subjectId,reportId:uncertainty.id,featureId:'sun-sign',expected:'Aries',scope:'interval'},
    {id:'overconfident-moon',kind:'interval',subjectId,reportId:uncertainty.id,featureId:'moon-sign',expected:'Aries',scope:'interval'},
    {id:'reflection',kind:'interpretation',subjectId,ruleId:'editorial:reflection:v1',basedOn:['correct-sun'],text:'An optional reflection prompt can accompany the supported placement.'}
  ]};
const claims=verifyClaims(input);
const artifacts={'chart.json':chart,'comparison.json':comparison,'uncertainty.json':uncertainty,'claims-input.json':input,'claims-result.json':claims};
for(const [name,value] of Object.entries(artifacts))await writeFile(path.join(out,name),JSON.stringify(value,null,2)+'\n');
const summary={label:'Synthetic demonstration; not real astronomical results',
  comparison:{verdict:comparison.verdict,longitudeDeltaArcsec:comparison.facts.find(f=>f.kind==='longitude').deltaArcsec},
  uncertainty:uncertainty.results.map(r=>({featureId:r.featureId,status:r.status,coverage:r.coverage,values:r.values})),
  claims:claims.results.map(r=>({claimId:r.claimId,status:r.status})),
  expectedNegativeControls:true,limitations:claims.limitations};
await writeFile(path.join(out,'summary.json'),JSON.stringify(summary,null,2)+'\n');
process.stdout.write(JSON.stringify(summary,null,2)+'\n');
