const SIGNS = Object.freeze(['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']);
const ASPECTS = new Set(['conjunction','sextile','square','trine','opposition']);
const NS = 'http://www.w3.org/2000/svg';
const escapeXml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function text(value, name, max = 100) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f\ufffe\uffff\ud800-\udfff]/u.test(value)) throw new TypeError('Invalid ' + name);
  return value;
}
function longitude(value) {
  if (!Number.isFinite(value) || value < 0 || value >= 360) throw new TypeError('Invalid longitude');
  return value;
}
function degreeLabel(lon) {
  const sign = Math.floor(lon / 30);
  // Do not round a point across a sign boundary.
  const within = Math.floor((lon - sign * 30) * 1e6) / 1e6;
  return within.toFixed(6) + ' degrees ' + SIGNS[sign];
}
/** Copies the display fields only. It never reads or retains chart input time/place. */
export function fromNatalChart(chart) {
  if (!chart || !Array.isArray(chart.bodies)) throw new TypeError('Expected a natal chart');
  return validateWheelData({
    zodiac: 'tropical',
    engineVersion: chart.engineVersion,
    bodies: chart.bodies.map(b => ({body: b.body, lon: b.lon, retrograde: b.retrograde})),
    angles: chart.angles,
    houses: chart.houses,
    aspects: chart.aspects,
    flags: chart.flags,
  });
}
/** Validation establishes display shape, not scientific accuracy or receipt authenticity. */
export function validateWheelData(data) {
  if (!data || typeof data !== 'object') throw new TypeError('Expected wheel data');
  let zodiac;
  if (data.zodiac === 'tropical') zodiac = 'tropical';
  else if (data.zodiac && typeof data.zodiac === 'object' && Object.keys(data.zodiac).length === 1 && 'sidereal' in data.zodiac) zodiac = {sidereal: text(data.zodiac.sidereal,'ayanamsa',64)};
  else throw new TypeError('Explicit zodiac required');
  if (!Array.isArray(data.bodies) || data.bodies.length < 1 || data.bodies.length > 64) throw new TypeError('Invalid bodies');
  const bodies = data.bodies.map(b => {
    if (!b || typeof b.retrograde !== 'boolean') throw new TypeError('Invalid body');
    return {body:text(b.body,'body'),lon:longitude(b.lon),retrograde:b.retrograde};
  });
  const names = new Set(bodies.map(b => b.body));
  if (names.size !== bodies.length) throw new TypeError('Duplicate bodies');
  let angles = null, houses = null;
  if (data.angles != null) {
    angles = Object.fromEntries(['asc','mc','dsc','ic'].map(k => [k,longitude(data.angles[k])]));
  }
  if (data.houses != null) {
    if (!angles || !Array.isArray(data.houses.cusps) || data.houses.cusps.length !== 12) throw new TypeError('Invalid houses');
    houses = {system:text(data.houses.system,'house system',64),cusps:data.houses.cusps.map(longitude)};
  }
  const aspectsInput = data.aspects ?? [];
  if (!Array.isArray(aspectsInput) || aspectsInput.length > 1000) throw new TypeError('Invalid aspects');
  const aspects = aspectsInput.map(a => {
    if (!a || !names.has(a.a) || !names.has(a.b) || a.a === a.b || !ASPECTS.has(a.type) || !Number.isFinite(a.orb) || a.orb < 0 || a.orb > 180 || typeof a.applying !== 'boolean') throw new TypeError('Invalid aspect');
    return {a:a.a,b:a.b,type:a.type,orb:a.orb,applying:a.applying};
  });
  const flagsInput = data.flags ?? [];
  if (!Array.isArray(flagsInput) || flagsInput.length > 64) throw new TypeError('Invalid flags');
  const flags = [...new Set(flagsInput.map(f => text(f,'flag',64)))];
  if (flags.includes('no-time') && (angles || houses)) throw new TypeError('Untimed chart cannot display angles or houses');
  const engineVersion = data.engineVersion == null ? null : text(data.engineVersion,'engine version',64);
  return {zodiac,bodies,angles,houses,aspects,flags,engineVersion};
}
export function describeWheel(data) {
  const model = validateWheelData(data);
  const zodiac = model.zodiac === 'tropical' ? 'Tropical zodiac' : 'Sidereal zodiac, ' + model.zodiac.sidereal;
  const bodies = model.bodies.map(b => ({...b,description:b.body + ': ' + degreeLabel(b.lon) + (b.retrograde ? ', retrograde' : ', direct')}));
  const houses = model.houses ? model.houses.cusps.map((lon,i) => ({house:i+1,lon,description:'House ' + (i+1) + ': ' + degreeLabel(lon)})) : [];
  const aspects = model.aspects.map(a => ({...a,description:a.a + ' ' + a.type + ' ' + a.b + ', orb ' + a.orb.toFixed(6) + ' degrees, ' + (a.applying ? 'applying' : 'not applying')}));
  const angles = model.angles ? Object.entries(model.angles).map(([name,lon]) => ({name,lon,description:name.toUpperCase() + ': ' + degreeLabel(lon)})) : [];
  const summary = [zodiac + '.', ...(model.engineVersion ? ['Engine ' + model.engineVersion + '.'] : []), model.houses ? 'House system: ' + model.houses.system + '.' : 'No houses.', model.angles ? 'Ascendant is at the left of the wheel.' : 'No angles; Aries zero is at the left of the wheel.', ...bodies.map(b=>b.description + '.'), ...angles.map(a=>a.description + '.'), ...houses.map(h=>h.description + '.'), ...aspects.map(a=>a.description + '.'), ...model.flags.map(f=>'Flag: ' + f + '.')].join(' ');
  return {model,zodiac,bodies,houses,angles,aspects,summary};
}
function point(lon,r,origin) {
  const a = (180 + (lon-origin)) * Math.PI/180;
  return {x:300 + r*Math.cos(a),y:300-r*Math.sin(a)};
}
const attrs = p => 'x="' + p.x.toFixed(6) + '" y="' + p.y.toFixed(6) + '"';
const line = (a,b,extra='') => '<line x1="'+a.x.toFixed(6)+'" y1="'+a.y.toFixed(6)+'" x2="'+b.x.toFixed(6)+'" y2="'+b.y.toFixed(6)+'" '+extra+'/>';
/** A standalone SVG with a title and complete text description; supply a unique prefix per document. */
export function renderWheelSvg(data, {idPrefix, title = 'Chart wheel'} = {}) {
  text(title,'title',160);
  if (typeof idPrefix !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(idPrefix)) throw new TypeError('Unique safe idPrefix required');
  const d = describeWheel(data), origin = d.model.angles?.asc ?? 0;
  const out = ['<svg xmlns="'+NS+'" viewBox="0 0 600 600" role="img" aria-labelledby="'+idPrefix+'-title '+idPrefix+'-desc" style="display:block;width:100%;max-width:40rem;height:auto;color:inherit">',
    '<title id="'+idPrefix+'-title">'+escapeXml(title)+'</title><desc id="'+idPrefix+'-desc">'+escapeXml(d.summary)+'</desc>',
    '<g aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1">',
    '<circle cx="300" cy="300" r="264"/><circle cx="300" cy="300" r="222"/>'];
  for (let i=0;i<12;i++) out.push(line(point(i*30,222,origin),point(i*30,264,origin)));
  for (const lon of d.model.houses?.cusps ?? []) out.push(line(point(lon,72,origin),point(lon,222,origin),'stroke-dasharray="4 3"'));
  const byName = new Map(d.model.bodies.map(b=>[b.body,b.lon]));
  for (const a of d.model.aspects) out.push(line(point(byName.get(a.a),160,origin),point(byName.get(a.b),160,origin),'stroke-opacity=".35"'));
  out.push('</g><g aria-hidden="true" fill="currentColor" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14">');
  for(let i=0;i<12;i++) out.push('<text '+attrs(point(i*30+15,244,origin))+' dominant-baseline="middle">'+SIGNS[i]+'</text>');
  for (const [i,h] of d.houses.entries()) {
    const next=d.model.houses.cusps[(i+1)%d.houses.length];
    const span=(next-h.lon+360)%360;
    const middle=(h.lon+span/2)%360;
    out.push('<text '+attrs(point(middle,120,origin))+' dominant-baseline="middle">'+h.house+'</text>');
  }
  d.model.bodies.forEach((b,i)=>{
    const p=point(b.lon,190+(i%4)*7,origin);
    out.push('<circle data-body-index="'+i+'" cx="'+p.x.toFixed(6)+'" cy="'+p.y.toFixed(6)+'" r="5" fill="currentColor" stroke="currentColor" stroke-width="1"/>');
  });
  if (d.model.angles) out.push('<text x="40" y="294">ASC</text>');
  out.push('</g></svg>');
  return out.join('');
}
