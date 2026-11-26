// A CommonJS TypeScript file that requires the package; the instant is synthetic.
import engine = require("@zodiacs/engine");
import pack = require("@zodiacs/engine/de440/pack");
pack.useDe440();
const chart: engine.Chart = engine.natalChart({ utc: "2000-01-01T12:00:00Z", timeKnown: false });
console.log(chart.ephemeris?.name);
