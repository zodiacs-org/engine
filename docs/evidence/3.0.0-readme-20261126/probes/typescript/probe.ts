// An import in a CommonJS package ("type": "commonjs"), which TypeScript emits as require(); the instant is synthetic.
import { natalChart } from "@zodiacs/engine";
import { useDe440 } from "@zodiacs/engine/de440/pack";
useDe440();
console.log(natalChart({ utc: "2000-01-01T12:00:00Z", timeKnown: false }).ephemeris?.name);
