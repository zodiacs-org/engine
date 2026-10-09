import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const consumer=process.argv[2];
const wheel=await import(pathToFileURL(resolve(consumer,'node_modules/@zodiacs/wheel/index.mjs')));
const {natalChart}=await import(pathToFileURL(resolve(consumer,'node_modules/@zodiacs/engine/dist/index.js')));
const checks=[];
const check=(name,fn)=>{fn();checks.push(name);};
const chart=natalChart({utc:'2000-01-01T12:00:00Z',latitude:0,longitude:0,houseSystem:'whole'});
const model=wheel.fromNatalChart(chart);
check('actual carried-engine natal chart display fields are preserved',()=>{
 assert.equal(model.engineVersion,'1.0.0-rc.2');
 assert.deepEqual(model.bodies,chart.bodies.map(b=>({body:b.body,lon:b.lon,retrograde:b.retrograde})));
 assert.deepEqual(model.houses,chart.houses);assert.deepEqual(model.angles,chart.angles);
 assert.deepEqual(model.aspects,chart.aspects.map(a=>({a:a.a,b:a.b,type:a.type,orb:a.orb,applying:a.applying})));
});
check('full text includes every actual body, cusp, angle and aspect',()=>{
 const d=wheel.describeWheel(model);
 assert.equal(d.bodies.length,chart.bodies.length);assert.equal(d.houses.length,12);assert.equal(d.angles.length,4);assert.equal(d.aspects.length,chart.aspects.length);
 for(const row of [...d.bodies,...d.houses,...d.angles,...d.aspects]) assert.ok(d.summary.includes(row.description));
});
check('adapter and SVG omit original instant and coordinates',()=>{
 assert.ok(!('input' in model));const svg=wheel.renderWheelSvg(model,{idPrefix:'consumer'});
 assert.ok(!svg.includes('2000-01-01'));assert.ok(!JSON.stringify(model).includes('"latitude"'));
 assert.ok(!JSON.stringify(model).includes('"longitude"'));
});
const unknownChart=natalChart({utc:'2000-01-01T12:00:00Z',timeKnown:false});
const unknown=wheel.fromNatalChart(unknownChart);
check('actual untimed engine result displays no invented angles or houses',()=>{
 assert.equal(unknown.angles,null);assert.equal(unknown.houses,null);assert.ok(unknown.flags.includes('no-time'));
});
const svg=wheel.renderWheelSvg(model,{idPrefix:'repeat'});
check('standalone SVG is deterministic for the same model and prefix',()=>assert.equal(svg,wheel.renderWheelSvg(model,{idPrefix:'repeat'})));
const browserReports=[];
if(process.env.WHEEL_BROWSER==='1'){
 const {chromium,firefox,webkit}=await import(pathToFileURL(resolve(consumer,'node_modules/playwright-core/index.mjs')));
 const moduleBytes=await readFile(resolve(consumer,'node_modules/@zodiacs/wheel/index.mjs'));
 const axe=await readFile(resolve(consumer,'node_modules/axe-core/axe.min.js'),'utf8');
 const payload=JSON.stringify({model,unknown}).replaceAll('<','\\u003c');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wheel consumer review</title></head><body><main><h1>Wheel consumer review</h1><script type="module">import {createWheel} from "/index.mjs";const p='+payload+';document.querySelector("main").append(createWheel(p.model,{document,title:"Synthetic timed chart"}),createWheel(p.unknown,{document,title:"Synthetic untimed chart"}));window.reviewReady=true;</script></main></body></html>';
 const server=createServer((req,res)=>{
  if(req.url==='/'){res.setHeader('content-type','text/html');res.end(html);}
  else if(req.url==='/index.mjs'){res.setHeader('content-type','text/javascript');res.end(moduleBytes);}
  else{res.statusCode=404;res.end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 try{
 for(const [name,kind] of Object.entries({chromium,firefox,webkit})){
  const browser=await kind.launch({headless:true});
  try{
   for(const width of [360,1280]){
    const context=await browser.newContext({viewport:{width,height:900}});
    const page=await context.newPage(),errors=[],requests=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('request',r=>requests.push(r.url()));
    await page.goto(base);await page.waitForFunction(()=>window.reviewReady);
    await page.addScriptTag({content:axe});
    const initialRequests=requests.length;
    await context.setOffline(true);
    const local=[];
    const pass=(label)=>{local.push(label);checks.push(name+' '+width+': '+label);};
    assert.equal(await page.locator('figure').count(),2);pass('two detached wheels mount independently');
    assert.equal(await page.locator('figure').first().getByRole('button').count(),model.bodies.length);pass('every body has a named keyboard control');
    assert.equal(await page.locator('figure').first().locator('table').count(),model.aspects.length?3:2);pass('structured angles, houses and aspects remain visible');
    const first=page.locator('figure').first(),buttons=first.getByRole('button');
    await buttons.first().focus();await page.keyboard.press('ArrowRight');
    assert.equal(await buttons.nth(1).evaluate(b=>b===document.activeElement),true);
    assert.equal(await buttons.nth(1).getAttribute('aria-pressed'),'true');pass('arrow key selects and focuses the next body');
    await page.keyboard.press('End');
    assert.equal(await buttons.last().evaluate(b=>b===document.activeElement),true);pass('End reaches last body');
    await page.keyboard.press('ArrowRight');
    assert.equal(await buttons.first().evaluate(b=>b===document.activeElement),true);pass('arrow navigation wraps');
    await page.keyboard.press('Home');await page.keyboard.press('ArrowLeft');
    assert.equal(await buttons.last().evaluate(b=>b===document.activeElement),true);pass('Home and reverse wrap work');
    await page.keyboard.press('Enter');
    assert.equal(await first.getByRole('status').count(),1);
    assert.ok((await first.getByRole('status').textContent()).includes(model.bodies.at(-1).body));pass('native activation has a live text result');
    assert.equal(await first.locator('button[tabindex="0"]').count(),1);pass('one body control is in the Tab sequence');
    await page.keyboard.press('Tab');
    assert.equal(await buttons.last().evaluate(b=>b===document.activeElement),false);pass('Tab leaves the body controls without a trap');
    const last=page.locator('figure').last();
    assert.equal(await last.locator('table caption').filter({hasText:'House cusps'}).count(),0);
    assert.equal(await last.locator('svg text').filter({hasText:'ASC'}).count(),0);pass('untimed wheel has no angle or house decoration');
    assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return new Set(ids).size===ids.length;}),true);pass('mounted accessible-name and status IDs are unique');
    const a11y=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
    assert.deepEqual(a11y.violations.map(v=>({id:v.id,nodes:v.nodes.length})),[]);pass('automated WCAG A/AA checks report no violation');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);pass('mobile and desktop views do not overflow horizontally');
    await page.evaluate(async()=>{
      const {createWheel}=await import('/index.mjs');
      const data={zodiac:'tropical',bodies:[{body:'</desc><script>window.wheelXss=true</script>',lon:0,retrograde:false}],angles:null,houses:null,aspects:[],flags:[]};
      document.querySelector('main').append(createWheel(data,{document,title:'<img src=x onerror="window.wheelXss=true">'}));
    });
    assert.equal(await page.evaluate(()=>window.wheelXss),undefined);
    assert.equal(await page.locator('figure').last().locator('script,img').count(),0);pass('caller labels and title cannot create script or image elements');
    assert.equal(requests.length,initialRequests);assert.deepEqual(errors,[]);pass('all interactions work offline without further requests or page errors');
    browserReports.push({browser:name,version:browser.version(),viewport:width,checks:local.length,automatedAccessibility:{violations:0,tags:['wcag2a','wcag2aa','wcag21a','wcag21aa']},limitations:['Automated checks and keyboard tests do not substitute for human assistive-technology review.']});
    await context.close();
   }
  }finally{await browser.close();}
 }
 }finally{await new Promise(r=>server.close(r));}
}
const report={schema:'zodiacs.wheel-consumer.v1',producer:{source:process.env.GITHUB_SHA,head:process.env.PROGRAMME_HEAD,run:process.env.GITHUB_RUN_ID,node:process.version,platform:process.platform},engineVersion:chart.engineVersion,checks,checkCount:checks.length,browsers:browserReports,modelSha256:createHash('sha256').update(JSON.stringify(model)).digest('hex'),svgSha256:createHash('sha256').update(svg).digest('hex'),limitations:['Display and keyboard/shape checks, not independent astronomical accuracy.','Private package is not published or programme acceptance.']};
await writeFile(resolve(consumer,'wheel-consumer-report.json'),JSON.stringify(report,null,2)+'\n');
console.log('Wheel consumer checks passed: '+checks.length);
