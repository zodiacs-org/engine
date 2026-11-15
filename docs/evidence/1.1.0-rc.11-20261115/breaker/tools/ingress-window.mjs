// Breaker, item 7: birthWindow's Sun sign switch on 2026-11-22, default path and after choosing astronomy-engine;
// and item 3: Neptune behind the Sun at 1920-08-03T23:48:31Z on the pack and on astronomy-engine.
import { birthWindow } from "@zodiacs/engine/window";
import { positions, setDefaultEphemeris } from "@zodiacs/engine";
const show = () => {
  const w = birthWindow({ start: "2026-11-22T07:00:00Z", end: "2026-11-22T08:00:00Z", latitude: 0, longitude: 0 });
  const s = w.switches.filter((x) => JSON.stringify(x).includes("Sun"));
  console.log(w.ephemeris.name, JSON.stringify(w.flags), JSON.stringify(s).slice(0, 600));
};
const at = new Date("1920-08-03T23:48:31Z");
const nep = () => positions(at).find((b) => b.body === "Neptune"), sun = () => positions(at).find((b) => b.body === "Sun");
show(); const a = nep(), sa = sun();
setDefaultEphemeris("astronomy-engine");
show(); const b = nep();
const sep = Math.hypot((a.lon - sa.lon) * Math.cos(a.lat * Math.PI / 180), a.lat - sa.lat);
console.log(JSON.stringify({ at: at.toISOString(), pack: { lon: a.lon, lat: a.lat, ephemeris: a.ephemeris }, astronomyEngine: { lon: b.lon, lat: b.lat, ephemeris: b.ephemeris }, lonDifferenceArcsec: (a.lon - b.lon) * 3600, latDifferenceArcsec: (a.lat - b.lat) * 3600, apparentSeparationFromTheSunDeg: sep }));
