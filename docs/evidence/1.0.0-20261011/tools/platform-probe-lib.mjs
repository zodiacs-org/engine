// How the built package's results depend on the platform that runs them. It
// runs, on dist/ as packed, the three checks that pin exact values made on
// x86-64: every number of the calc round trip (src/fixtures/calc-roundtrip.json)
// against the committed one, and the returns and void-of-course windows of the
// site-parity check (scripts/techniques-parity-check.mjs) against the site's
// committed outputs. It prints one JSON object: the runtime, and each
// difference with its size.
//
// platform-probe.mjs runs it in Node; platform-probe-jsc.mjs bundles
// platform-probe-entry.mjs and runs it in JavaScriptCore.
import { checkReturns, checkVoidOfCourse } from "../../../../scripts/techniques-parity-check.mjs";

/** Units in the last place of a double, at its magnitude. */
const ulp = (x) => (x === 0 ? Number.MIN_VALUE : 2 ** (Math.floor(Math.log2(Math.abs(x))) - 52));

export function probe({ runtime, packageApi, fixtures }) {
  const { calc, chart, events, houses, techniques, bodyLongitude, matchAspect } = packageApi;
  const run = { calc, chart, events, houses };
  const roundTrip = [];
  const walk = (actual, expected, path) => {
    if (typeof expected === "number" && typeof actual === "number") {
      if (!Object.is(actual, expected)) {
        const abs = Math.abs(actual - expected);
        roundTrip.push({ path, committed: expected, here: actual, abs, ulps: abs / ulp(expected), overPin: abs > 1e-12 });
      }
    } else if (expected && typeof expected === "object" && actual && typeof actual === "object") {
      for (const key of Object.keys(expected)) walk(actual[key], expected[key], `${path}.${key}`);
    }
  };
  let threw = 0;
  fixtures.calcRoundtrip.cases.forEach((entry, index) => {
    try { walk(JSON.parse(JSON.stringify(run[entry.function](entry.request))), entry.result, `case ${index} (${entry.function})`); }
    catch { threw += 1; }
  });

  const api = { ...techniques, bodyLongitude, matchAspect };
  const returns = checkReturns(api, fixtures.returns).map((result) => ({
    corpus: result.corpus,
    cases: result.cases,
    disagreements: result.disagreements.length,
    chartsWithSameInstant: result.disagreements.filter((row) => Array.isArray(row.site) && Array.isArray(row.package) && row.site[0] === row.package[0]).length,
  }));
  const voidOfCourse = checkVoidOfCourse(api, fixtures.voidOfCourse).map((result) => {
    const numbers = [];
    for (const row of result.disagreements) {
      const pair = (site, pkg, path) => {
        if (typeof site === "number" && typeof pkg === "number") { if (!Object.is(site, pkg)) numbers.push({ path, site, package: pkg, abs: Math.abs(site - pkg), ulps: Math.abs(site - pkg) / ulp(site) }); }
        else if (Array.isArray(site) && Array.isArray(pkg)) site.forEach((value, index) => pair(value, pkg[index], `${path}[${index}]`));
      };
      pair(row.site, row.package, `case ${row.index}`);
    }
    return { corpus: result.corpus, cases: result.cases, disagreements: result.disagreements.length, numbers };
  });
  return {
    runtime,
    roundTrip: { cases: fixtures.calcRoundtrip.cases.length, threw, numbersDiffering: roundTrip.length, overPin: roundTrip.filter((row) => row.overPin).length, largest: roundTrip.reduce((max, row) => Math.max(max, row.abs), 0), differences: roundTrip },
    returns,
    voidOfCourse,
  };
}
