import test from 'node:test';
import strict from 'node:assert/strict';
import { compareCharts } from '../src/compare.mjs';
import { receipt, MODEL } from './fixtures.mjs';

test('wrap-aware comparison handles the zero-degree seam',()=>{
  const r=compareCharts(receipt({longitude:359.999}),receipt({longitude:0.001}),{longitudeToleranceArcsec:8});
  strict.ok(Math.abs(r.facts[0].deltaArcsec-7.2)<1e-8);
  strict.equal(r.verdict,'agreement-within-threshold');
});
test('convention or time mismatch prevents accuracy attribution',()=>{
  const r=compareCharts(receipt(),receipt({model:{...MODEL,conventions:{...MODEL.conventions,zodiac:'sidereal'}}}));
  strict.equal(r.comparable,false);strict.equal(r.verdict,'different-assumptions');
  const time=compareCharts(receipt(),receipt({context:{utc:'2000-01-01T13:00:00.000Z'}}));
  strict.equal(time.inputDifferences[0].field,'context.utc');
});
test('provider differences alone preserve matched calculation settings',()=>{
  const r=compareCharts(receipt(),receipt({model:{...MODEL,engineVersion:'2'},longitude:16}));
  strict.equal(r.comparable,true);strict.equal(r.verdict,'disagreement-or-incomplete');
  strict.equal(r.providerDifferences[0].field,'model.engineVersion');
});
test('missing facts and same-id different semantics never count as agreement',()=>{
  strict.equal(compareCharts(receipt(),receipt({facts:[]})).facts[0].status,'missing');
  const other=receipt({facts:[{id:'longitude:Sun',kind:'longitude',entity:'Moon',value:15,unit:'deg',scope:'instant'}]});
  strict.equal(compareCharts(receipt(),other).facts[0].status,'semantic-conflict');
  strict.equal(compareCharts(receipt({facts:[]}),receipt({facts:[]})).verdict,'disagreement-or-incomplete');
});
test('invalid threshold, tampered receipt and different subjects fail closed',()=>{
  for(const tolerance of [NaN,Infinity,-1,'1',648001]) strict.throws(()=>compareCharts(receipt(),receipt(),{longitudeToleranceArcsec:tolerance}));
  strict.throws(()=>compareCharts(receipt(),receipt({subjectId:'different-person'})));
  const tampered=receipt();tampered.subjectId='forged';strict.throws(()=>compareCharts(tampered,receipt()));
});
