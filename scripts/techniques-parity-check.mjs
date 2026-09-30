/*
 * The comparison of @zodiacs/engine/techniques with the site's outputs on the
 * parity corpus (scripts/techniques-parity-corpus.mjs). The unit test
 * (src/techniques/site-parity.test.ts) runs it on the sources and requires no
 * disagreement where the site and the package are meant to agree; the
 * evidence script (docs/evidence/techniques-2026-09-29/parity-report.mjs) runs
 * it on the build and records every count.
 *
 * `api` holds the package functions, and `expected` the parsed JSON files of
 * src/techniques/fixtures/site-parity/.
 */
import {
  chartProjection,
  compositeCorpus,
  compositeProjection,
  containmentProjection,
  digest32,
  dignityCorpus,
  moonSignCorpus,
  patternCorpus,
  patternProjection,
  returnsCorpus,
  voidCorpus
} from "./techniques-parity-corpus.mjs";

const SIGNS = ["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"];
const LETTERS = "abcdefghijkl";
const letters = (signs) => signs.map((sign) => LETTERS[SIGNS.indexOf(sign)]).join("");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function attempt(run) {
  try {
    return { value: run() };
  } catch (error) {
    return { error: error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error) };
  }
}

/** One corpus's tally: cases, agreements, and the disagreeing cases with both sides. */
function tally(name, expected, actual) {
  const disagreements = [];
  expected.forEach((want, index) => {
    const got = actual[index];
    if (!same(want, got)) disagreements.push({ index, site: want, package: got });
  });
  return { corpus: name, cases: expected.length, agree: expected.length - disagreements.length, disagreements };
}

/** The largest |difference| in ms among disagreeing instants, where both sides are instants. */
export function largestMsDifference(result) {
  const differences = result.disagreements
    .filter((row) => typeof row.site === "number" && typeof row.package === "number")
    .map((row) => Math.abs(row.site - row.package));
  return differences.length ? Math.max(...differences) : 0;
}

export function checkReturns(api, expected) {
  const corpus = returnsCorpus();
  const sunAt = (ms) => api.bodyLongitude("Sun", new Date(ms));
  const moonAt = (ms) => api.bodyLongitude("Moon", new Date(ms));
  const instant = (run) => {
    const result = attempt(run);
    return "error" in result ? { error: result.error } : result.value.getTime();
  };
  const chart = (run) => {
    const result = attempt(run);
    if ("error" in result) return { error: result.error };
    const projection = chartProjection(result.value.chart);
    return [projection.utc, digest32(projection)];
  };
  const natalOf = (row) => ({ utc: new Date(row.birth), latitude: row.latitude, longitude: row.longitude, houseSystem: row.houseSystem });
  const locationOf = (row) => (row.cast === "natal" ? undefined : row.cast);
  return [
    tally("R-SI", expected.RSI, corpus.RSI.map((row) => instant(() => api.solarReturnInstant(sunAt(row.birth), new Date(row.near))))),
    tally("R-SM", expected.RSM, corpus.RSM.map((row) => instant(() => api.mostRecentSolarReturnInstant(sunAt(row.birth), new Date(row.at))))),
    tally(
      "R-SC",
      expected.RSC,
      corpus.RSC.map((row) =>
        chart(() => api.solarReturn(natalOf(row), new Date(row.near), { location: locationOf(row), selection: row.selection }))
      )
    ),
    tally("R-LI", expected.RLI, corpus.RLI.map((row) => instant(() => api.lunarReturnInstant(moonAt(row.birth), new Date(row.after))))),
    tally("R-LC", expected.RLC, corpus.RLC.map((row) => chart(() => api.lunarReturn(natalOf(row), new Date(row.after), { location: locationOf(row) })))),
    tally(
      "R-E",
      expected.RE,
      corpus.RE.map((row) => {
        if (row.fn === "solarReturnInstant") return instant(() => api.solarReturnInstant(sunAt(row.birth), new Date(row.date)));
        if (row.fn === "mostRecentSolarReturnInstant") return instant(() => api.mostRecentSolarReturnInstant(sunAt(row.birth), new Date(row.date)));
        if (row.fn === "lunarReturnInstant") return instant(() => api.lunarReturnInstant(moonAt(row.birth), new Date(row.date)));
        return chart(() =>
          api.lunarReturn({ utc: new Date(row.birth), latitude: row.latitude, longitude: row.longitude, houseSystem: "placidus" }, new Date(row.date))
        );
      })
    )
  ];
}

export function checkComposite(api, expected) {
  const actual = compositeCorpus().map(({ a, b }) => {
    const points = api.compositeMidpoints(a, b);
    const aspects = api.compositeAspects(points);
    return [points.length, aspects.length, digest32(compositeProjection(points, aspects))];
  });
  return [tally("C-M+C-A", expected.cases, actual)];
}

export function checkVoidOfCourse(api, expected) {
  const corpus = voidCorpus();
  const record = (window) =>
    window && [
      window.from.getTime(),
      window.to.getTime(),
      window.lastAspect && [window.lastAspect.at.getTime(), window.lastAspect.body, window.lastAspect.aspect, window.lastAspect.moonLon],
      SIGNS.indexOf(window.sign),
      SIGNS.indexOf(window.nextSign)
    ];
  return [
    tally("V-W", expected.VW, corpus.VW.map((row) => api.voidOfCourseWindows(new Date(row.from), new Date(row.to), { bodies: row.bodies }).map(record))),
    tally(
      "V-S",
      expected.VS,
      corpus.VS.map((row) => {
        const status = api.voidOfCourseAt(new Date(row.at), { bodies: row.bodies });
        return [status.isVoid, record(status.current), record(status.next)];
      })
    )
  ];
}

export function checkPatterns(api, expected) {
  const match = (aBody, aLon, bBody, bLon) => {
    const found = api.matchAspect(aBody, aLon, bBody, bLon);
    return found ? { type: found.definition.type, orb: found.orb } : null;
  };
  const actual = patternCorpus(match).map(({ points, edges }) => {
    const result = attempt(() => api.aspectPatterns(points, edges));
    if ("error" in result) return { unavailable: result.error.replace(/^RangeError: /u, "") };
    return [
      result.value.patterns.length,
      digest32(patternProjection(result.value.points, result.value.patterns)),
      digest32(containmentProjection(api.patternContainment(result.value.patterns)))
    ];
  });
  return [tally("P-D+P-C", expected.cases, actual)];
}

export function checkDignities(api, expected) {
  const actual = dignityCorpus().map(({ planet, sign }) => [
    api.dignityFor(planet, sign),
    [...api.dignitiesFor(planet, sign)],
    api.hasClassicalDignities(planet)
  ]);
  return [tally("D-X", expected.cases, actual)];
}

/**
 * The Moon-sign corpora. M-A compares `moonSignCandidates(date).sign`. M-Z
 * compares the signs over the site's own endpoints on any host, and, when
 * `compareMidnights` is set (a host with the site's tzdata), the package's
 * endpoints and signs. M-P always compares the full result; call
 * `prepare(date, zone)` first for the zone histories before 1970.
 */
export async function checkMoonSigns(api, expected, { compareMidnights, prepare }) {
  const corpus = moonSignCorpus();
  const MA = corpus.MA.map((date) => {
    const result = attempt(() => api.moonSignCandidates(date).sign);
    return "error" in result ? "!" : result.value === null ? "-" : LETTERS[SIGNS.indexOf(result.value)];
  });
  const overSiteEnds = corpus.MZ.map((row, index) => {
    const want = expected.MZ[index];
    if (!Array.isArray(want)) return want;
    const noon = Date.parse(`${row.date}T12:00:00Z`);
    const result = attempt(() => letters(api.moonSignsBetween(new Date(noon + want[0]), new Date(noon + want[1]))));
    return "error" in result ? { error: result.error } : [want[0], want[1], result.value];
  });
  const full = async (rows) => {
    const out = [];
    for (const row of rows) {
      if (prepare) await prepare(row.date, row.timeZone);
      const result = attempt(() => api.moonSignCandidates(row.date, { timeZone: row.timeZone }));
      if ("error" in result) {
        out.push({ error: result.error });
        continue;
      }
      const noon = Date.parse(`${row.date}T12:00:00Z`);
      out.push([result.value.from.getTime() - noon, result.value.to.getTime() - noon, letters(result.value.signs)]);
    }
    return out;
  };
  const results = [
    tally("M-A", [...expected.MA], MA),
    tally("M-Z (signs over the site's endpoints)", expected.MZ, overSiteEnds)
  ];
  if (compareMidnights) results.push(tally("M-Z", expected.MZ, await full(corpus.MZ)));
  results.push(tally("M-P", expected.MP, await full(corpus.MP)));
  return results;
}
