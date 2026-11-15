import * as root from '@zodiacs/engine';
import { calc, chart } from '@zodiacs/engine/calc';
import { birthWindow } from '@zodiacs/engine/window';
for (const ms of [Date.UTC(1800, 0, 2), Date.UTC(2199, 11, 30), Date.UTC(1800, 0, 1), Date.UTC(2199, 11, 31, 23, 59)]) {
  const c = calc({ body: 'Sun', time: new Date(ms) });
  const a = chart({ time: new Date(ms), place: { latitude: 10, longitude: 20 } });
  console.log(new Date(ms).toISOString(), 'calc', c.status, c.reason ?? '', '| chart', a.status, a.reason ?? '', '| natalChart', root.natalChart({ utc: new Date(ms), timeKnown: false }).ephemeris.name);
}
const w = birthWindow({ start: new Date(Date.UTC(1990, 3, 15, 8)), end: new Date(Date.UTC(1990, 3, 15, 10)), latitude: 10, longitude: 20 });
console.log('cells', w.cells.length, JSON.stringify(w.cells[0].features).slice(0, 400));
let same = 0, n = 0;
for (const cell of w.cells) {
  const t = Math.floor((cell.start.getTime() + cell.end.getTime()) / 2);
  const natal = root.natalChart({ utc: new Date(t), latitude: 10, longitude: 20 });
  n += 1;
  const asc = root.signForLongitude(natal.angles.asc).slug, mc = root.signForLongitude(natal.angles.mc).slug;
  if (JSON.stringify(cell.features.ascendant).includes(asc) && JSON.stringify(cell.features.midheaven).includes(mc)) same += 1;
}
console.log('ascendant and midheaven sign of each cell at its midpoint equal natalChart:', same, 'of', n);
