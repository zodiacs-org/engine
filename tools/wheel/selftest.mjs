import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fromNatalChart,validateWheelData,describeWheel,renderWheelSvg} from './index.mjs';
import {createWheel} from './dom.mjs';
const here=fileURLToPath(new URL('.',import.meta.url));
const sample = () => ({zodiac:'tropical',bodies:[{body:'Sun',lon:0,retrograde:false},{body:'Moon',lon:90,retrograde:false},{body:'Mars',lon:359.9999999,retrograde:true}],angles:{asc:0,mc:270,dsc:180,ic:90},houses:{system:'whole',cusps:Array.from({length:12},(_,i)=>i*30)},aspects:[{a:'Sun',b:'Moon',type:'square',orb:0,applying:false}],flags:[],engineVersion:'synthetic'});
// Synthetic values in the shapes @zodiacs/engine 3.0.0 gives: natalChart(), minorBodyPositions() and chartPoints().points.
// Nine of them lie within 4.25 degrees of each other.
const NATAL=[['Sun',10.25,false],['Moon',133.5,false],['Mercury',11.75,false],['Venus',12.5,false],['Mars',250.125,false],['Jupiter',75.5,false],['Saturn',40.75,false],['Uranus',310.25,true],['Neptune',303.875,true],['Pluto',251.625,true],['North Node',95.25,true],['South Node',275.25,true]];
const engineChart = () => ({
 input:{utc:'SYNTHETIC-PRIVATE-INSTANT',latitude:1.5,longitude:2.5,houseSystem:'placidus'},
 bodies:NATAL.map(([body,lon,retrograde])=>({body,lon,lat:0,speed:retrograde?-0.05:0.5,retrograde,sign:'aries',degree:lon%30,ephemeris:'astronomy-engine'})),
 angles:{asc:100,mc:10,dsc:280,ic:190},
 houses:{system:'placidus',cusps:[100,130,160,190,220,250,280,310,340,10,40,70]},
 aspects:[{a:'Sun',b:'Mercury',type:'conjunction',orb:1.5,applying:true},{a:'Sun',b:'Moon',type:'trine',orb:3.25,applying:false}],
 flags:[],deltaT:{seconds:63.875,band:'synthetic',source:'synthetic'},timeScale:{name:'synthetic'},engineVersion:'3.0.0',ephemeris:{name:'astronomy-engine',version:'synthetic'},
});
const minorBodies = () => [['Chiron',9.625,false],['Ceres',13.125,false],['Pallas',8.875,true],['Juno',200.5,false],['Vesta',11,false]].map(([body,lon,retrograde])=>({body,lon,lat:1.25,dist:2.5,speed:retrograde?-0.125:0.25,retrograde,sign:'aries',degree:lon%30,ephemeris:{name:'astronomy-engine',version:'synthetic',body:{name:'jpl-horizons',solution:'SYNTHETIC-SOLUTION',sha256:'0'.repeat(64)}},flags:[]}));
const chartPointRows = () => [
 {point:'Mean Node',lon:96.125,lat:0,speed:-0.0625,sign:'cancer',degree:6.125},
 {point:'Mean South Node',lon:276.125,lat:0,speed:-0.0625,sign:'capricorn',degree:6.125},
 {point:'Black Moon Lilith',lon:10.875,lat:2.125,speed:0.125,sign:'aries',degree:10.875},
 {point:'Vertex',lon:220.5,lat:0,speed:null,sign:'scorpio',degree:10.5},
 {point:'True Black Moon Lilith',lon:11.375,lat:-1.5,speed:-2.5,sign:'aries',degree:11.375,ephemeris:'astronomy-engine'},
];
const fullModel = () => fromNatalChart(engineChart(),{extraBodies:minorBodies(),points:chartPointRows()});
const LABELS={Sun:'Su',Moon:'Mo',Mercury:'Me',Venus:'Ve',Mars:'Ma',Jupiter:'Ju',Saturn:'Sa',Uranus:'Ur',Neptune:'Ne',Pluto:'Pl','North Node':'NN','South Node':'SN',Chiron:'Ch',Ceres:'Ce',Pallas:'Pa',Juno:'Jn',Vesta:'Vs','Mean Node':'MN','Mean South Node':'MS','Black Moon Lilith':'BL',Vertex:'Vx','True Black Moon Lilith':'TL'};
const decode = s => s.replace(/&(lt|gt|quot|apos|amp);/g,(_,e)=>({lt:'<',gt:'>',quot:'"',apos:"'",amp:'&'}[e]));
const num='(-?[0-9.]+)';
const markersOf = svg => [...svg.matchAll(new RegExp('<circle data-body-index="(\\d+)" cx="'+num+'" cy="'+num+'"','g'))].map(m=>({i:+m[1],x:+m[2],y:+m[3]}));
const labelsOf = svg => [...svg.matchAll(new RegExp('<text data-label-index="(\\d+)" x="'+num+'" y="'+num+'"[^>]*>([^<]*)</text>','g'))].map(m=>({i:+m[1],x:+m[2],y:+m[3],text:decode(m[4])}));
const ticksOf = svg => [...svg.matchAll(new RegExp('<line x1="'+num+'" y1="'+num+'" x2="'+num+'" y2="'+num+'" data-tick-index="(\\d+)"/>','g'))].map(m=>({x:+m[1],y:+m[2],i:+m[5]}));
// The longitude a wheel point shows: the ascendant (or Aries zero) at the left, counterclockwise.
const shownLon = (p,origin) => ((Math.atan2(300-p.y,p.x-300)*180/Math.PI-180+origin)%360+360)%360;
const apart = (a,b) => { const d=Math.abs(a-b)%360; return Math.min(d,360-d); };
// A selected marker reaches 9.5 units from its centre (radius 8, stroke 3). A label's box is taken as 0.85 em a character
// by 1 em at its 11-unit font, wider than the capitals of the labels the wheel uses.
const SELECTED_REACH=9.5;
function assertApart(svg,{labels=true}={}){
 const markers=markersOf(svg),boxes=labelsOf(svg).map(l=>({...l,w:Array.from(l.text).length*0.85*11,h:11}));
 for(let a=0;a<markers.length;a++)for(let b=a+1;b<markers.length;b++)assert.ok(Math.hypot(markers[a].x-markers[b].x,markers[a].y-markers[b].y)>=2*SELECTED_REACH,'markers '+a+' and '+b+' overlap');
 if(!labels)return;
 for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++)assert.ok(Math.abs(boxes[a].x-boxes[b].x)>=(boxes[a].w+boxes[b].w)/2||Math.abs(boxes[a].y-boxes[b].y)>=(boxes[a].h+boxes[b].h)/2,'labels '+a+' and '+b+' overlap');
 for(const box of boxes)for(const m of markers){
  const dx=Math.max(Math.abs(m.x-box.x)-box.w/2,0),dy=Math.max(Math.abs(m.y-box.y)-box.h/2,0);
  assert.ok(Math.hypot(dx,dy)>=SELECTED_REACH,'label '+box.i+' overlaps marker '+m.i);
 }
}
// Markers keep the cyclic order of their longitudes: stepping through the bodies by longitude goes round once.
function assertOrder(svg,model){
 const origin=model.angles?.asc??0,markers=markersOf(svg);
 const order=model.bodies.map((_,i)=>i).sort((a,b)=>model.bodies[a].lon-model.bodies[b].lon||a-b);
 const turns=order.reduce((sum,i,k)=>{const next=order[(k+1)%order.length];return sum+((shownLon(markers[next],origin)-shownLon(markers[i],origin))%360+360)%360;},0);
 assert.ok(Math.abs(turns-360)<1e-6,'markers leave the order of their longitudes');
}
const ELEMENTS=new Set(['svg','title','desc','g','circle','line','text']);
const BARE_AMPERSAND=/&(?!(?:amp|lt|gt|quot|apos);)/;
// XML well-formedness for the markup the renderer writes: one root, matched tags, quoted unique attributes,
// escaped text and values, unique ids, and only the elements the renderer draws.
function assertWellFormed(svg){
 const tag=/<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[A-Za-z_:][A-Za-z0-9_:.-]*="[^"<]*")*)\s*(\/?)>/y;
 const stack=[],ids=[];let roots=0,i=0;
 while(i<svg.length){
  if(svg[i]!=='<'){
   const next=svg.indexOf('<',i),end=next<0?svg.length:next,chunk=svg.slice(i,end);
   assert.ok(stack.length>0,'text outside the root element');
   assert.ok(!BARE_AMPERSAND.test(chunk)&&!chunk.includes('>'),'unescaped text '+chunk.slice(0,40));
   i=end;continue;
  }
  tag.lastIndex=i;const m=tag.exec(svg);
  assert.ok(m,'malformed markup at '+svg.slice(i,i+40));
  const [,closing,name,attributes,empty]=m;
  assert.ok(ELEMENTS.has(name),'unexpected element '+name);
  const pairs=[...attributes.matchAll(/([A-Za-z_:][A-Za-z0-9_:.-]*)="([^"]*)"/g)];
  assert.equal(new Set(pairs.map(p=>p[1])).size,pairs.length,'repeated attribute');
  for(const [,key,value] of pairs){assert.ok(!BARE_AMPERSAND.test(value)&&!value.includes('>'),'unescaped attribute');assert.ok(!/^on/i.test(key),'event handler attribute');if(key==='id')ids.push(value);}
  if(closing){assert.ok(!empty&&pairs.length===0,'malformed closing tag');assert.equal(stack.pop(),name,'mismatched closing tag');}
  else{if(stack.length===0)roots+=1;if(!empty)stack.push(name);}
  i=tag.lastIndex;
 }
 assert.equal(stack.length,0,'unclosed element');assert.equal(roots,1,'one root element');
 assert.equal(new Set(ids).size,ids.length,'repeated id');
 assert.match(svg,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
 for(const id of svg.match(/aria-labelledby="([^"]*)"/)[1].split(' '))assert.ok(ids.includes(id),'aria-labelledby names a missing id');
}
// The npm CLI of the running Node: npm beside node is a link to it on Linux and macOS installs.
function npmCli(){
 const bin=dirname(process.execPath),linked=existsSync(resolve(bin,'npm'))?realpathSync(resolve(bin,'npm')):null;
 const candidates=[process.env.npm_execpath,linked,resolve(bin,'node_modules/npm/bin/npm-cli.js'),resolve(bin,'../lib/node_modules/npm/bin/npm-cli.js')];
 const found=candidates.find(path=>path&&/npm-cli\.js$/.test(path)&&existsSync(path));
 assert.ok(found,'Node installation does not expose its npm CLI');
 return found;
}
test('cardinal points use known independent wheel geometry and supplied ascendant',()=>{
 const svg=renderWheelSvg(sample(),{idPrefix:'geometry'});
 // Isolated: the Moon's marker at radius 202 straight down, its label at radius 180 above it.
 assert.match(svg,/data-body-index="1" cx="300\.000000" cy="502\.000000"/);
 assert.match(svg,/data-label-index="1" x="300\.000000" y="480\.000000"[^>]*>Mo</);
 // Sun and Mars, 0.0000001 degrees apart at Aries zero (left), keep exact ticks and spread 3.75 degrees either side.
 assert.match(svg,/<line x1="78\.000000" y1="300\.000000" x2="86\.000000" y2="300\.000000" data-tick-index="0"\/>/);
 const [sun,,mars]=markersOf(svg),c=Math.cos(3.75*Math.PI/180),s=Math.sin(3.75*Math.PI/180);
 assert.ok(Math.abs(sun.x-(300-202*c))<1e-5&&Math.abs(sun.y-(300+202*s))<1e-5);
 assert.ok(Math.abs(mars.x-(300-202*c))<1e-5&&Math.abs(mars.y-(300-202*s))<1e-5);
 assert.match(svg,/<text x="184.088901" y="331.058285" dominant-baseline="middle">1<\/text>/);
 const wrapped=sample();wrapped.houses.cusps=[350,10,40,70,100,130,160,190,220,250,280,310];
 assert.match(renderWheelSvg(wrapped,{idPrefix:'wrapped'}),/<text x="180.000000" y="300.000000" dominant-baseline="middle">1<\/text>/);
 const shifted=sample();shifted.angles.asc=90;
 assert.match(renderWheelSvg(shifted,{idPrefix:'shifted'}),/data-body-index="1" cx="98.000000" cy="300.000000"/);
});
test('every supplied position, house, angle, aspect and flag has a text counterpart',()=>{
 const m=sample();m.flags=['polar-fallback'];const d=describeWheel(m);
 assert.equal(d.bodies.length,3);assert.equal(d.houses.length,12);assert.equal(d.angles.length,4);assert.equal(d.aspects.length,1);
 assert.equal(d.bodies[2].description,'Mars (Ma): 29.999999 degrees Pisces, retrograde');
 assert.match(d.summary,/Engine synthetic\./);assert.match(renderWheelSvg(m,{idPrefix:'version'}),/Engine synthetic\./);
 const noVersion=sample();delete noVersion.engineVersion;assert.ok(!describeWheel(noVersion).summary.includes('Engine '));
 assert.match(d.summary,/polar-fallback/);assert.match(d.summary,/orb 0\.000000 degrees, not applying/);
});
test('untimed model has no invented houses or angles',()=>{
 const m=sample();m.angles=null;m.houses=null;m.flags=['no-time'];
 const d=describeWheel(m);assert.equal(d.angles.length,0);assert.equal(d.houses.length,0);assert.match(d.summary,/No angles/);
 assert.ok(!renderWheelSvg(m,{idPrefix:'untimed'}).includes('>ASC<'));
 m.angles=sample().angles;assert.throws(()=>validateWheelData(m));
});
test('explicit sidereal label and supplied longitudes are preserved',()=>{
 const m=sample();m.zodiac={sidereal:'caller-definition'};const d=describeWheel(m);
 assert.match(d.zodiac,/Sidereal.*caller-definition/);assert.equal(d.bodies[1].lon,90);
});
test('model validation rejects malformed, duplicate, unbounded and contradictory data',()=>{
 const bad=[
 m=>{m.zodiac=undefined;},m=>{m.bodies[0].lon=NaN;},m=>{m.bodies[0].lon=360;},m=>{m.bodies[0].lon=-1;},
 m=>{m.bodies[0].retrograde='yes';},m=>{delete m.bodies[0].retrograde;},m=>{m.bodies[1].body='Sun';},m=>{m.bodies=[];},
 m=>{m.bodies=Array(65).fill(m.bodies[0]);},m=>{m.houses.cusps.pop();},m=>{m.angles.asc=Infinity;},
 m=>{m.aspects[0].a='missing';},m=>{m.aspects[0].orb=-1;},m=>{m.aspects[0].type='invented';},
 m=>{m.aspects=Array(1001).fill(m.aspects[0]);},m=>{m.flags=Array(65).fill('flag');},
 m=>{m.bodies[0].body='\ud800';},m=>{m.bodies[0].body='\ufffe';},m=>{m.bodies[0].body='bad\u0000label';},
 m=>{m.bodies=Array(1);},m=>{m.houses.cusps=Array(12);},m=>{m.aspects=Array(1);},m=>{m.flags=Array(1);},
 ];
 for(const mutate of bad){const m=sample();mutate(m);assert.throws(()=>validateWheelData(m));}
 const m=sample();m.bodies[0].retrograde=null;assert.equal(validateWheelData(m).bodies[0].retrograde,null);
});
test('SVG text is escaped and unsafe or missing id prefixes are refused',()=>{
 const m=sample();m.bodies[0].body='</desc><script>alert(1)</script>';m.aspects=[];m.engineVersion='<version&label>';
 const svg=renderWheelSvg(m,{idPrefix:'escaped',title:'<img onerror="bad"> &'});
 assert.match(svg,/Engine &lt;version&amp;label&gt;\./);assert.ok(!svg.includes('<script>'));assert.match(svg,/&lt;script&gt;/);assert.match(svg,/role="img"/);assert.match(svg,/aria-labelledby="escaped-title escaped-desc"/);
 assertWellFormed(svg);
 for(const idPrefix of [undefined,'x" onload="bad','1bad','a'.repeat(65)]) assert.throws(()=>renderWheelSvg(m,{idPrefix}));
});
test('natal adapter copies display data and omits time and coordinates',()=>{
 const m=sample(),chart={...m,input:{utc:'SYNTHETIC-PRIVATE',latitude:1,longitude:2}};
 const d=fromNatalChart(chart);
 assert.ok(!JSON.stringify(d).includes('SYNTHETIC-PRIVATE'));assert.ok(!('input' in d));
 chart.bodies[0].lon=5;chart.angles.asc=5;chart.houses.cusps[0]=5;
 assert.equal(d.bodies[0].lon,0);assert.equal(d.angles.asc,0);assert.equal(d.houses.cusps[0],0);
});
test('Node import and standalone SVG need no document or network, and the source reads neither',()=>{
 assert.throws(()=>createWheel(sample()),/DOM document/);
 const original=globalThis.fetch;globalThis.fetch=()=>{throw Error('unexpected network');};
 try{assert.ok(renderWheelSvg(sample(),{idPrefix:'offline'}).startsWith('<svg'));}finally{globalThis.fetch=original;}
 const forbidden=/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|navigator|localStorage|sessionStorage|indexedDB|location|window|globalThis|require)\b|\bimport\s*\(/;
 for(const file of ['index.mjs','dom.mjs']){
  const source=readFileSync(resolve(here,file),'utf8');
  assert.ok(!forbidden.test(source),file+' reads a network, storage or URL interface');
  assert.deepEqual([...source.matchAll(/^import\b[^;]*from\s*'([^']+)'/gm)].map(m=>m[1]),file==='dom.mjs'?['./index.mjs']:[],file+' imports another module');
 }
});
test('engine 3.0.0 chart with minor bodies and points: 22 objects, labels, motion and flags',()=>{
 const chart=engineChart();
 // One argument, or empty extras, gives the chart alone, as before 1.0.0.
 const alone=fromNatalChart(chart);
 assert.deepEqual(alone.bodies,NATAL.map(([body,lon,retrograde])=>({body,lon,retrograde})));
 for(const extras of [undefined,null,{},{extraBodies:[],points:[]}])assert.deepEqual(fromNatalChart(chart,extras),alone);
 const model=fullModel();
 assert.equal(model.bodies.length,22);assert.equal(model.engineVersion,'3.0.0');
 assert.deepEqual(model.bodies.map(b=>b.body),[...NATAL.map(([body])=>body),'Chiron','Ceres','Pallas','Juno','Vesta','Mean Node','Mean South Node','Black Moon Lilith','Vertex','True Black Moon Lilith']);
 assert.deepEqual(model.aspects,chart.aspects);assert.deepEqual(model.houses,chart.houses);assert.deepEqual(model.angles,chart.angles);
 const json=JSON.stringify(model);
 for(const hidden of ['SYNTHETIC-PRIVATE-INSTANT','latitude','SYNTHETIC-SOLUTION','jpl-horizons','"dist"','"speed"','"point"'])assert.ok(!json.includes(hidden),hidden+' was copied');
 const d=describeWheel(model);
 assert.deepEqual(Object.fromEntries(d.bodies.map(b=>[b.body,b.label])),LABELS);
 const by=Object.fromEntries(d.bodies.map(b=>[b.body,b.description]));
 assert.equal(by['True Black Moon Lilith'],'True Black Moon Lilith (TL): 11.375000 degrees Aries, retrograde');
 assert.equal(by['Black Moon Lilith'],'Black Moon Lilith (BL): 10.875000 degrees Aries, direct');
 assert.equal(by['Mean Node'],'Mean Node (MN): 6.125000 degrees Cancer, retrograde');
 assert.equal(by.Vertex,'Vertex (Vx): 10.500000 degrees Scorpio');
 assert.equal(by.Pallas,'Pallas (Pa): 8.875000 degrees Aries, retrograde');
 assert.equal(by.Chiron,'Chiron (Ch): 9.625000 degrees Aries, direct');
 for(const b of d.bodies)assert.ok(d.summary.includes(b.description+'.'));
 // An ephemeris fallback on an extra body or point stays visible, once.
 const minor=minorBodies();minor[3].flags=['de440-unavailable'];minor[4].flags=['de440-unavailable'];
 const points=chartPointRows();points[4].fallback='outside-de440-span';
 const flagged=fromNatalChart({...chart,flags:['delta-t-extrapolated']},{extraBodies:minor,points});
 assert.deepEqual(flagged.flags,['delta-t-extrapolated','de440-unavailable','outside-de440-span']);
 assert.match(describeWheel(flagged).summary,/Flag: de440-unavailable\. Flag: outside-de440-span\./);
 // Malformed extras are refused, never dropped.
 const refused=[{extraBodies:{}},{points:'Vertex'},{extraBodies:[null]},{points:[{point:'Vertex',lon:1,speed:'fast'}]},{points:[{point:'Vertex',lon:400,speed:null}]},{extraBodies:[{body:'Sun',lon:1,retrograde:false}]},{extraBodies:[{body:'Chiron',lon:1,retrograde:'no'}]},{extraBodies:[{body:'Chiron',lon:1,retrograde:false,flags:'x'}]},5];
 for(const extras of refused)assert.throws(()=>fromNatalChart(chart,extras),TypeError);
});
test('crowded markers and labels stay apart, in order, with ticks at the exact longitudes',()=>{
 const model=fullModel(),svg=renderWheelSvg(model,{idPrefix:'full'});
 assert.equal(markersOf(svg).length,22);assert.equal(labelsOf(svg).length,22);assert.equal(ticksOf(svg).length,22);
 assert.deepEqual(labelsOf(svg).map(l=>l.text),model.bodies.map(b=>LABELS[b.body]));
 assertApart(svg);assertOrder(svg,model);
 for(const tick of ticksOf(svg))assert.ok(apart(shownLon(tick,100),model.bodies[tick.i].lon)<1e-4,'tick '+tick.i+' is not at its longitude');
 // A marker with room stays at its longitude; a crowded one moves and gets a leader line.
 const markers=markersOf(svg),moved=model.bodies.filter((b,i)=>apart(shownLon(markers[i],100),b.lon)>0.5).length;
 assert.equal(apart(shownLon(markers[model.bodies.findIndex(b=>b.body==='Juno')],100),200.5)<1e-5,true);
 assert.ok(moved>=9);assert.equal((svg.match(/stroke-opacity="\.6"/g)??[]).length,moved);
 const same=(n,name)=>({zodiac:'tropical',bodies:Array.from({length:n},(_,i)=>({body:name(i),lon:123.25,retrograde:false}))});
 const letters=i=>'ABC'[Math.floor(i/26)]+'abcdefghijklmnopqrstuvwxyz'[i%26];
 // 22 and 48 objects at one longitude still keep markers and labels apart; 64 (the most) keep markers apart.
 for(const [n,labels] of [[22,true],[48,true],[64,false]]){
  const crowd=same(n,letters),out=renderWheelSvg(crowd,{idPrefix:'crowd'+n});
  assertApart(out,{labels});assertOrder(out,crowd);assertWellFormed(out);
 }
});
test('SVG is well-formed XML with caller text escaped in every field',()=>{
 const chart=engineChart();chart.bodies[0].body='</desc><script>alert(1)</script>';chart.aspects=[];chart.houses.system='<svg onload="bad()">';
 chart.flags=['<flag>&amp;'];chart.engineVersion='<v&>';
 const minor=minorBodies();minor[0].body='<b';minor[1].body='"quoted\' & <i>';
 const points=chartPointRows();points[3].point='Vertex&<x>';
 const model=fromNatalChart(chart,{extraBodies:minor,points});
 const svg=renderWheelSvg(model,{idPrefix:'hostile',title:'<img src=x onerror="bad()"> &'});
 assertWellFormed(svg);
 for(const raw of ['<script','<img','<b','<i>','<x>','<flag>','<svg onload','<v&>'])assert.ok(!svg.includes(raw),raw+' left unescaped');
 assert.equal(labelsOf(svg)[0].text,'</');assert.equal(labelsOf(svg)[12].text,'<b');assert.equal(labelsOf(svg)[13].text,'"q');
 for(const data of [sample(),fullModel(),{...sample(),angles:null,houses:null,flags:['no-time']},{...sample(),zodiac:{sidereal:'Lahiri & <caller>'}}])assertWellFormed(renderWheelSvg(data,{idPrefix:'wellformed'}));
});
test('require() and import() load both entries through the package exports',async()=>{
 const require=createRequire(import.meta.url);
 const root=require('@zodiacs/wheel'),dom=require('@zodiacs/wheel/dom');
 assert.equal(root.renderWheelSvg,renderWheelSvg);assert.equal(root.fromNatalChart,fromNatalChart);assert.equal(root.describeWheel,describeWheel);assert.equal(root.validateWheelData,validateWheelData);
 assert.equal(dom.createWheel,createWheel);assert.equal(root.createWheel,undefined);
 assert.equal((await import('@zodiacs/wheel')).renderWheelSvg,renderWheelSvg);assert.equal((await import('@zodiacs/wheel/dom')).createWheel,createWheel);
 assert.ok(require('@zodiacs/wheel').renderWheelSvg(fullModel(),{idPrefix:'required'}).startsWith('<svg'));
});
test('npm pack --dry-run lists exactly the files of a public, dependency-free package',()=>{
 const manifest=JSON.parse(readFileSync(resolve(here,'package.json'),'utf8'));
 assert.equal(manifest.name,'@zodiacs/wheel');assert.equal(manifest.version,'1.0.0');assert.equal(manifest.private,undefined);
 assert.deepEqual(manifest.publishConfig,{access:'public'});assert.equal(manifest.license,'MIT');assert.equal(manifest.type,'module');
 for(const field of ['dependencies','optionalDependencies','bundleDependencies','bundledDependencies','scripts','bin'])assert.equal(manifest[field],undefined,field);
 assert.deepEqual(manifest.peerDependencies,{'@zodiacs/engine':'^3.0.0'});assert.deepEqual(manifest.peerDependenciesMeta,{'@zodiacs/engine':{optional:true}});
 assert.deepEqual(manifest.exports,{'.':{types:'./index.d.mts',default:'./index.mjs'},'./dom':{types:'./dom.d.mts',default:'./dom.mjs'}});
 assert.deepEqual(manifest.engines,{node:'^20.19.0 || >=22.12.0'});
 assert.deepEqual(manifest.repository,{type:'git',url:'git+https://github.com/zodiacs-org/engine.git',directory:'tools/wheel'});
 const r=spawnSync(process.execPath,[npmCli(),'pack','--dry-run','--json','--ignore-scripts'],{cwd:here,encoding:'utf8',timeout:120000});
 assert.equal(r.status,0,r.stderr);
 const [info]=JSON.parse(r.stdout);
 assert.equal(info.name,'@zodiacs/wheel');assert.equal(info.version,'1.0.0');assert.deepEqual(info.bundled,[]);
 assert.deepEqual(info.files.map(f=>f.path).sort(),['LICENSE','README.md','dom.d.mts','dom.mjs','index.d.mts','index.mjs','package.json']);
});
