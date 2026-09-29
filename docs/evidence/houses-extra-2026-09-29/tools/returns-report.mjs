// Gate R's measured values: for each Horizons fixture, the engine's returns
// against Horizons's instants, and for the USNO fixture against the published
// equinoxes. Run from the repository root after `npm run build`:
//   node docs/evidence/houses-extra-2026-09-29/tools/returns-report.mjs > docs/evidence/houses-extra-2026-09-29/results/returns.json
import { readFileSync } from "node:fs";
import { natalChart } from "../../../../dist/index.js";
import { planetaryReturns } from "../../../../dist/timing.js";

const DAY = 86_400_000;
const { fixtures } = JSON.parse(readFileSync(new URL("../../../../src/timing/fixtures/planetary-returns-horizons.json", import.meta.url), "utf8"));
const TOLERANCE = { Sun: 6, Moon: 8 };
const seam = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;

const rows = fixtures.map((fixture) => {
  const natal = { utc: fixture.natal.utc, latitude: fixture.natal.latitude, longitude: fixture.natal.longitude };
  const result = planetaryReturns(natal, fixture.body, fixture.window.from, fixture.window.to);
  const chart = natalChart(natal);
  const returns = result.returns.map((row, index) => {
    const expected = fixture.crossings[index];
    const seconds = (row.at.getTime() - Date.parse(expected.at)) / 1000;
    return {
      retrograde: row.retrograde,
      directionAgrees: row.retrograde === expected.retrograde,
      differenceSeconds: Number(seconds.toFixed(1)),
      arcseconds: Number((Math.abs(seconds / 86400 * expected.speed) * 3600).toFixed(3))
    };
  });
  const tolerance = TOLERANCE[fixture.body] ?? 45;
  return {
    body: fixture.body,
    status: result.status,
    returns: result.returns.length,
    horizonsReturns: fixture.crossings.length,
    toleranceArcseconds: tolerance,
    pass: result.status === "complete" && returns.length === fixture.crossings.length &&
      returns.every((row) => row.directionAgrees && row.arcseconds <= tolerance),
    natalLongitudeMinusHorizonsArcseconds: Number(
      (seam(chart.bodies.find((body) => body.body === fixture.body).lon - fixture.natal.horizonsLongitude) * 3600).toFixed(3)
    ),
    samples: result.samples,
    detail: returns
  };
});

const usno = planetaryReturns({ utc: "2000-03-20T07:35:00Z", latitude: 8.5, longitude: -79.5 }, "Sun", "2000-06-01", "2004-06-01");
const equinoxes = ["2001-03-20T13:31:00Z", "2002-03-20T19:16:00Z", "2003-03-21T01:00:00Z", "2004-03-20T06:49:00Z"];
const usnoDifferences = usno.returns.map((row, index) => Number(((row.at.getTime() - Date.parse(equinoxes[index])) / 1000).toFixed(1)));
console.log(JSON.stringify({
  horizons: rows,
  usno: {
    status: usno.status,
    returns: usno.returns.length,
    differenceSeconds: usnoDifferences,
    toleranceSeconds: 210,
    pass: usno.status === "complete" && usno.returns.length === 4 && usnoDifferences.every((d) => Math.abs(d) <= 210)
  }
}, null, 1));
