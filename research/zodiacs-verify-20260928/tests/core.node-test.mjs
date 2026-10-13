import test from 'node:test';
import strict from 'node:assert/strict';
import { canonicalize, digest, seal, verifySeal, instant, normalize, signOf, validateChartReceipt } from '../src/core.mjs';
import {receipt} from './fixtures.mjs';

test('canonical content identity is order-independent and sensitive to every JSON field',()=>{
  strict.equal(digest({b:2,a:1}),digest({a:1,b:2}));
  const poison = JSON.parse('{"__proto__":{"admin":true},"constructor":1}');
  strict.notEqual(digest(poison),digest({constructor:1}));
  strict.equal(Object.prototype.admin,undefined);
  strict.equal(canonicalize(Object.assign(Object.create(null),{a:1})), '{"a":1}');
  const r=seal(poison); strict.equal(verifySeal(r),true);
});
test('rejects JSON ambiguities and nonfinite values',()=>{
  const sparse=[]; sparse[1]=1;
  const cyclic={};cyclic.x=cyclic;
  for(const value of [undefined,NaN,Infinity,1n,new Date(),sparse,cyclic,{a:undefined},{get x(){throw Error('must not call')}}]) strict.throws(()=>canonicalize(value));
  strict.equal(verifySeal({id:'invalid',a:1}),false);
});
test('seal tampering and preexisting ids fail closed',()=>{
  const r=receipt(); strict.equal(verifySeal(r),true); r.facts[0].value=20;
  strict.equal(verifySeal(r),false); strict.throws(()=>validateChartReceipt(r));
  strict.throws(()=>seal({id:'anything'}));
});
test('strict resolved instants validate calendar, offsets and precision',()=>{
  strict.equal(instant('2000-02-29T07:00:00+07:00'),instant('2000-02-29T00:00:00Z'));
  for(const value of ['2001-02-29T00:00:00Z','2026-04-31T00:00:00Z','2000-01-01','2000-01-01T00:00:00','2000-01-01T24:00:00Z','2000-01-01T00:00:60Z','2000-01-01T00:00:00-00:00','2000-01-01T00:00:00+14:01','2000-01-01T00:00:00.0001Z']) strict.throws(()=>instant(value),value);
});
test('angular signs wrap and boundaries use lower inclusive convention',()=>{
  strict.equal(normalize(-1),359); strict.equal(signOf(0),'Aries'); strict.equal(signOf(30),'Taurus');strict.equal(signOf(360),'Aries');
  strict.equal(signOf(29.999999999999996),'Aries'); strict.equal(signOf(359.99999999999994),'Pisces');
  strict.equal(signOf(-Number.MIN_VALUE),'Pisces');
});
test('canonicalization never invokes an array instance method',()=>{
  const input=[1]; Object.defineProperty(input,'map',{value:()=>{throw Error('must not invoke');}});
  strict.throws(()=>canonicalize(input),/Nonstandard or decorated/);
  strict.throws(()=>canonicalize(new class extends Array {}(1)),/Nonstandard or decorated/);
});
test('receipt forbids duplicate semantics, inconsistent signs and fabricated reference angles',()=>{
  strict.throws(()=>receipt({facts:[{id:'a',kind:'sign',entity:'Sun',value:'Aries',scope:'instant'},{id:'b',kind:'sign',entity:'Sun',value:'Taurus',scope:'instant'}]}));
  strict.throws(()=>receipt({facts:[{id:'a',kind:'longitude',entity:'Sun',value:30,unit:'deg',scope:'instant'},{id:'b',kind:'sign',entity:'Sun',value:'Aries',scope:'instant'}]}));
  strict.throws(()=>receipt({context:{timeKnowledge:'reference'},facts:[{id:'a',kind:'sign',entity:'Ascendant',value:'Aries',scope:'instant'}]}));
  strict.throws(()=>receipt({context:{latitude:10,longitude:null}}));
  strict.throws(()=>receipt({longitude:360}));
});
