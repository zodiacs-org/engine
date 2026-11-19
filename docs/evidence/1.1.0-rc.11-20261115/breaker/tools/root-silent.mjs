// Breaker, item 2: the root's chartPoints(birth) and chartDeclinations(birth), which compute the chart
// themselves. Prints what each result holds, to compare the clean install with a damaged one, and at 1750/2230.
//   node root-silent.mjs
import { chartPoints, chartDeclinations, natalChart, defaultEphemeris, setDefaultEphemeris } from "@zodiacs/engine";
for (const utc of ["1991-06-21T14:45:00Z", "1750-06-21T14:45:00Z", "2230-06-21T14:45:00Z"]) {
  const birth = { utc, latitude: 40.4, longitude: -3.7 };
  const chart = natalChart(birth);
  const p = chartPoints(birth), d = chartDeclinations(birth);
  const text = JSON.stringify([p, d]);
  console.log(JSON.stringify({
    utc, packOpened: defaultEphemeris().de440.opened,
    natalChart: { ephemeris: chart.ephemeris.name, flags: chart.flags },
    chartPoints: { keys: Object.keys(p), fortune: p.points.find((x) => x.point === "Lot of Fortune")?.lon, spirit: p.points.find((x) => x.point === "Lot of Spirit")?.lon, eros: p.points.find((x) => /Eros/.test(x.point))?.lon },
    chartDeclinations: { keys: Object.keys(d), sun: d.rows.find((r) => r.body === "Sun"), moonDec: d.rows.find((r) => r.body === "Moon")?.declination, pluto: d.rows.find((r) => r.body === "Pluto")?.declination },
    saysAnything: /de440-unavailable|outside-de440-span|astronomy-engine|jpl-de440/.test(text)
  }));
}
