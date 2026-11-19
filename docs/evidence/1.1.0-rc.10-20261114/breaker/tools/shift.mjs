// Breaker: is "up to 29 arcseconds" the largest shift of a default position against astronomy-engine?
// The pack's reduction bends light with no cut at the Sun's limb; look where a planet passes behind the Sun.
import * as root from '@zodiacs/engine';
const wrap = (d) => ((d % 360) + 540) % 360 - 180;
const lonLat = (body, ms, name) => { root.setDefaultEphemeris(name); const r = root.positions(new Date(ms)).find((x) => x.body === body); const sun = root.positions(new Date(ms)).find((x) => x.body === 'Sun'); return { lon: r.lon, lat: r.lat, sunLon: sun.lon, sunLat: sun.lat }; };
function scan(body, fromIso, toIso, stepMs) {
  let best = { d: 0 };
  for (let ms = Date.parse(fromIso); ms <= Date.parse(toIso); ms += stepMs) {
    const a = lonLat(body, ms, 'de440'), b = lonLat(body, ms, 'astronomy-engine');
    const d = Math.abs(wrap(a.lon - b.lon)) * 3600;
    const elong = Math.hypot(wrap(a.lon - a.sunLon), a.lat - a.sunLat);
    if (d > best.d) best = { d, at: new Date(ms).toISOString(), dLat: Math.abs(a.lat - b.lat) * 3600, fromSunCentreDeg: elong };
  }
  return best;
}
// Neptune behind the Sun, 1920-08-03/04 (the builder's own example), then refined.
let b = scan('Neptune', '1920-08-02T00:00:00Z', '1920-08-06T00:00:00Z', 60_000);
console.log('Neptune 1920-08-02..06, 1 min steps:', JSON.stringify(b));
const t = Date.parse(b.at);
b = scan('Neptune', new Date(t - 120_000).toISOString(), new Date(t + 120_000).toISOString(), 1000);
console.log('refined, 1 s steps:', JSON.stringify(b));
// The same instant on the noon-TT daily grid the sweep used would be about:
for (const iso of ['1920-08-03T12:00:00Z', '1920-08-04T12:00:00Z']) {
  const a = lonLat('Neptune', Date.parse(iso), 'de440'), c = lonLat('Neptune', Date.parse(iso), 'astronomy-engine');
  console.log(iso, 'shift', (Math.abs(wrap(a.lon - c.lon)) * 3600).toFixed(2), 'arcsec, from Sun centre', Math.hypot(wrap(a.lon - a.sunLon), a.lat - a.sunLat).toFixed(4), 'deg');
}
root.setDefaultEphemeris('de440');
