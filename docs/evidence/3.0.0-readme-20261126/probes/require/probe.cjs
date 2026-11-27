// A CommonJS consumer of the installed package: require() of the root, the
// pack's entry and the calc entry, then the same root through import().
// Run from a folder whose node_modules holds @zodiacs/engine (package.json and
// dist/) and astronomy-engine; the instant is synthetic.
const root = require("@zodiacs/engine");
const pack = require("@zodiacs/engine/de440/pack");
const calc = require("@zodiacs/engine/calc");
const before = root.natalChart({ utc: "2000-01-01T12:00:00Z", timeKnown: false }).ephemeris.name;
const source = pack.useDe440();
const after = root.natalChart({ utc: "2000-01-01T12:00:00Z", timeKnown: false }).ephemeris.name;
const viaCalc = calc.calc({ body: "Sun", time: "2000-01-01T12:00:00Z" }).receipt.engine.ephemeris.name;
import("@zodiacs/engine").then((ns) => {
  console.log(JSON.stringify({ node: process.version, before, after, viaCalc, sameNamespace: ns === root, sameFunction: ns.natalChart === root.natalChart, source: source.ephemeris.name }));
});
