// platform-probe-lib.mjs for an engine without Node's modules: the fixtures and
// the built package are bundled in, and the result is printed with the
// engine's own print. platform-probe-jsc.mjs bundles and runs it.
import calcRoundtrip from "../../../../src/fixtures/calc-roundtrip.json";
import returns from "../../../../src/techniques/fixtures/site-parity/returns.json";
import voidOfCourse from "../../../../src/techniques/fixtures/site-parity/void-of-course.json";
import * as calcEntry from "../../../../dist/calc.js";
import * as techniques from "../../../../dist/techniques.js";
import { bodyLongitude } from "../../../../dist/internal.js";
import { matchAspect } from "../../../../dist/index.js";
import { probe } from "./platform-probe-lib.mjs";

const result = probe({
  runtime: { engine: globalThis.__PROBE_ENGINE__ ?? "unknown" },
  packageApi: { ...calcEntry, techniques, bodyLongitude, matchAspect },
  fixtures: { calcRoundtrip, returns, voidOfCourse },
});
(typeof print === "function" ? print : console.log)(JSON.stringify(result, null, 1));
