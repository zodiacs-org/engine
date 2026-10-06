// How far rc.17's `ayanamsa()` (`@zodiacs/engine/vedic`) moved from rc.16's.
// rc.17 computes a linear ayanamsa as its value at J2000.0, less whole turns,
// plus its rate times TT days since J2000.0, where rc.16 counted from its
// epoch; the change is the rounding that removes. Compares every built-in
// ayanamsa, and callers' linear ayanamsas at the limits `userAyanamsa`
// accepts (epochs at both ends of a Date's range, at the start of the Kali
// Yuga, at 1900, J2000.0 and the ends of 1800 to 2200; values from -359.9 to
// 359.9; rates of ±50.29 and ±3,600″ a year), at 116 instants from 1800 to
// 2199, mean and true, the difference taken to the nearest whole turn. Prints
// the largest change for each built-in and for each caller's epoch.
//
//   node linear-change.mjs <rc.16 package directory> <rc.17 package or checkout directory>
const [a, b] = process.argv.slice(2);
if (!a || !b) throw new Error("usage: node linear-change.mjs <rc.16 package directory> <rc.17 package or checkout directory>");
const { pathToFileURL } = await import("node:url");
const { join } = await import("node:path");
const [before, after] = await Promise.all([a, b].map((dir) => import(pathToFileURL(join(dir, "dist/vedic.js")).href)));

const UNIX_JD = 2_440_587.5;
const EPOCHS = [UNIX_JD - 1e8 + 1, UNIX_JD + 1e8 - 1, 588_465.5, 2_415_020, 2_451_545, 2_378_496.5, 2_524_592.5];
const VALUES = [-359.9, -180, 0, 23.85, 180, 359.9];
const RATES = [-3600, -50.29, 50.29, 3600];
const INSTANTS = [];
for (let year = 1800; year < 2200; year += 7) INSTANTS.push(`${year}-03-17T13:05:00Z`, `${year}-09-30T01:17:00Z`);

const turn = (x, y) => {
  const d = Math.abs(x - y) % 360;
  return Math.min(d, 360 - d);
};
const change = (definitions) => {
  let largest = 0;
  for (const at of INSTANTS) {
    const [x, y] = [before.ayanamsa(definitions[0], at), after.ayanamsa(definitions[1], at)];
    largest = Math.max(largest, turn(x.mean, y.mean), turn(x.true, y.true));
  }
  return largest;
};
const show = (d) => (d === 0 ? "0 (identical)" : `${d.toExponential(2)}°`);

console.log(`# ${INSTANTS.length} instants, mean and true`);
for (const name of Object.keys(after.AYANAMSAS)) console.log(`${name}: ${show(change([name, name]))}`);
let all = 0;
for (const jd of EPOCHS) {
  let largest = 0;
  for (const value of VALUES) {
    for (const rate of RATES) {
      const input = { epoch: { julianDateTT: jd }, value, rate };
      largest = Math.max(largest, change([before.userAyanamsa(input), after.userAyanamsa(input)]));
    }
  }
  all = Math.max(all, largest);
  console.log(`a caller's linear ayanamsa from JD ${jd} (TT), ${VALUES.length * RATES.length} definitions: ${show(largest)}`);
}
console.log(`callers' linear ayanamsas, largest: ${show(all)}`);
