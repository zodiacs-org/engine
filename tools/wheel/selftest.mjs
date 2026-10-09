import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createWheel,fromNatalChart,validateWheelData,describeWheel,renderWheelSvg} from './index.mjs';
const sample = () => ({zodiac:'tropical',bodies:[{body:'Sun',lon:0,retrograde:false},{body:'Moon',lon:90,retrograde:false},{body:'Mars',lon:359.9999999,retrograde:true}],angles:{asc:0,mc:270,dsc:180,ic:90},houses:{system:'whole',cusps:Array.from({length:12},(_,i)=>i*30)},aspects:[{a:'Sun',b:'Moon',type:'square',orb:0,applying:false}],flags:[],engineVersion:'synthetic'});
test('cardinal points use known independent wheel geometry and supplied ascendant',()=>{
 const svg=renderWheelSvg(sample(),{idPrefix:'geometry'});
 assert.match(svg,/data-body-index="0" cx="110.000000" cy="300.000000"/);
 assert.match(svg,/data-body-index="1" cx="300.000000" cy="497.000000"/);
 const shifted=sample();shifted.angles.asc=90;
 assert.match(renderWheelSvg(shifted,{idPrefix:'shifted'}),/data-body-index="1" cx="103.000000" cy="300.000000"/);
});
test('every supplied position, house, angle, aspect and flag has a text counterpart',()=>{
 const m=sample();m.flags=['polar-fallback'];const d=describeWheel(m);
 assert.equal(d.bodies.length,3);assert.equal(d.houses.length,12);assert.equal(d.angles.length,4);assert.equal(d.aspects.length,1);
 assert.match(d.bodies[2].description,/29\.999999 degrees Pisces, retrograde/);
 assert.match(d.summary,/Engine synthetic\./);assert.match(renderWheelSvg(m,{idPrefix:'version'}),/Engine synthetic\./);
 const noVersion=sample();delete noVersion.engineVersion;assert.ok(!describeWheel(noVersion).summary.includes('Engine '));
 assert.match(d.summary,/polar-fallback/);assert.match(d.summary,/orb 0\.000000 degrees, not applying/);
});
test('untimed model has no invented houses or angles',()=>{
 const m=sample();m.angles=null;m.houses=null;m.flags=['no-time'];
 const d=describeWheel(m);assert.equal(d.angles.length,0);assert.equal(d.houses.length,0);assert.match(d.summary,/No angles/);
 m.angles=sample().angles;assert.throws(()=>validateWheelData(m));
});
test('explicit sidereal label and supplied longitudes are preserved',()=>{
 const m=sample();m.zodiac={sidereal:'caller-definition'};const d=describeWheel(m);
 assert.match(d.zodiac,/Sidereal.*caller-definition/);assert.equal(d.bodies[1].lon,90);
});
test('model validation rejects malformed, duplicate, unbounded and contradictory data',()=>{
 const bad=[
 m=>{m.zodiac=undefined;},m=>{m.bodies[0].lon=NaN;},m=>{m.bodies[0].lon=360;},m=>{m.bodies[0].lon=-1;},
 m=>{m.bodies[0].retrograde='yes';},m=>{m.bodies[1].body='Sun';},m=>{m.bodies=[];},
 m=>{m.bodies=Array(65).fill(m.bodies[0]);},m=>{m.houses.cusps.pop();},m=>{m.angles.asc=Infinity;},
 m=>{m.aspects[0].a='missing';},m=>{m.aspects[0].orb=-1;},m=>{m.aspects[0].type='invented';},
 m=>{m.aspects=Array(1001).fill(m.aspects[0]);},m=>{m.flags=Array(65).fill('flag');},
 m=>{m.bodies[0].body='\ud800';},m=>{m.bodies[0].body='\ufffe';},m=>{m.bodies[0].body='bad\u0000label';},
 ];
 for(const mutate of bad){const m=sample();mutate(m);assert.throws(()=>validateWheelData(m));}
});
test('SVG text is escaped and unsafe or missing id prefixes are refused',()=>{
 const m=sample();m.bodies[0].body='</desc><script>alert(1)</script>';m.aspects=[];m.engineVersion='<version&label>';
 const svg=renderWheelSvg(m,{idPrefix:'escaped',title:'<img onerror="bad"> &'});
 assert.match(svg,/Engine &lt;version&amp;label&gt;\./);assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);assert.match(svg,/role="img"/);assert.match(svg,/aria-labelledby="escaped-title escaped-desc"/);
 for(const idPrefix of [undefined,'x" onload="bad','1bad','a'.repeat(65)]) assert.throws(()=>renderWheelSvg(m,{idPrefix}));
});
test('natal adapter copies display data and omits time and coordinates',()=>{
 const m=sample(),chart={...m,input:{utc:'SYNTHETIC-PRIVATE',latitude:1,longitude:2}};
 const d=fromNatalChart(chart);
 assert.ok(!JSON.stringify(d).includes('SYNTHETIC-PRIVATE'));assert.ok(!('input' in d));
 chart.bodies[0].lon=5;chart.angles.asc=5;chart.houses.cusps[0]=5;
 assert.equal(d.bodies[0].lon,0);assert.equal(d.angles.asc,0);assert.equal(d.houses.cusps[0],0);
});
test('Node import and standalone SVG need no document or network',()=>{
 assert.throws(()=>createWheel(sample()),/DOM document/);
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('unexpected network');};
 try{assert.ok(renderWheelSvg(sample(),{idPrefix:'offline'}).startsWith('<svg'));}finally{globalThis.fetch=original;}
});
