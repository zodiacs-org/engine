// What the review fixes of rc15-fix-time change in computed results: the first
// cut of rc.15 (d90a00a, built) against this build, each in its own process,
// on synthetic instants and places. Statistics only. (d90a00a is a local
// commit that was never pushed; README.md, *The published history*.)
//
// 1. TT input inside each of the 27 leap seconds (1972-07-01 to 2017-01-01)
//    at 0, 250, 500 and 999 ms into it, which the first cut read one second
//    early on UT1: the change in ΔT and in the angles.
// 2. UTC input in 1972, now on IERS EOP 20 C04 where the first cut took UT1 -
//    UTC as 0: charts every 1 d 7 h 13 min at four places.
// 3. Speeds within 86.4 s of each leap second, of 1972-01-01, of the UT1
//    table's last day and of the ΔT model's hand-over at 1941.0, which the
//    first cut divided by 0.002 day however much TT lay between the samples.
// 4. UT1 and TT input at the table's edges, which the first cut labelled
//    "fallback".
// 5. Everything else: 20,000 charts from 1850 to 2150 on each scale, with and
//    without a pinned ΔT, avoiding the windows above; they must not change,
//    except `timeScale.leapSeconds.listed` from 2026-06-28 to 2027-06-28 (the
//    new list) and the UT1 table's digest.
// 6. UT1 input from 2 s before the end of each leap second's day on UTC to
//    0.5 s after, every 250 ms, which spans the leap second itself. From 1974
//    the first cut took TT from UT1 - TAI there too, but reported a UT1 - UTC
//    that did not add up; the leap seconds of 1972-07-01 and 1973-01-01 fall
//    in 1972's C04 span (7), where the first cut read UT1 as UTC.
// 7. TT and UT1 input in 1972, at the instants of 2 (TT 42 s later).
//
// 6 and 7 are listed after the sample of 5, so that it stays as it was.
//
//   node time-basis-fixes.mjs <first-cut package directory> <this package directory> [out.json]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DAY = 86_400_000;
const PLACES = [[0, 0], [40.7128, -74.006], [-33.87, 151.21], [60.17, 24.94]];
const LEAPS = [
  "1972-07-01", "1973-01-01", "1974-01-01", "1975-01-01", "1976-01-01", "1977-01-01", "1978-01-01", "1979-01-01",
  "1980-01-01", "1981-07-01", "1982-07-01", "1983-07-01", "1985-07-01", "1988-01-01", "1990-01-01", "1991-01-01",
  "1992-07-01", "1993-07-01", "1994-07-01", "1996-01-01", "1997-07-01", "1999-01-01", "2006-01-01", "2009-01-01",
  "2012-07-01", "2015-07-01", "2017-01-01"
].map((date, index) => ({ at: Date.parse(`${date}T00:00:00Z`), before: 10 + index }));
const STEPS = [
  ...LEAPS.map(({ at }) => at),
  Date.parse("1972-01-01T00:00:00Z"),
  Date.parse("2027-10-02T00:00:00Z"),
  Date.parse("1940-12-31T18:00:00Z")
];

function cases() {
  const list = [];
  for (const { at, before } of LEAPS) {
    for (const ms of [0, 250, 500, 999]) {
      const tt = at + before * 1000 + ms + 32_184;
      list.push({ group: "leap-tt", utc: tt, timeScale: "tt", key: `${at}+${ms}` });
    }
  }
  for (let ms = Date.UTC(1972, 0, 1), index = 0; ms < Date.UTC(1973, 0, 2); ms += DAY + (7 * 60 + 13) * 60_000, index += 1) {
    list.push({ group: "1972", utc: ms, place: PLACES[index % 4] });
  }
  for (const at of STEPS) {
    for (const offset of [-86_000, -43_200, -1_000, 0, 1_000, 43_200, 86_000]) list.push({ group: "speeds", utc: at + offset });
  }
  // Either side of the join of C04 and finals2000A.all, at 60.17 N 24.94 E.
  for (const utc of [Date.parse("1973-01-01T23:59:59.999Z"), Date.parse("1973-01-02T00:00:00.000Z")]) list.push({ group: "join", utc, place: PLACES[3] });
  for (const [iso, timeScale] of [
    ["1973-01-02T00:00:00.000Z", "ut1"], ["1973-01-02T00:00:00.500Z", "ut1"], ["2027-10-01T23:59:59.900Z", "ut1"],
    ["2027-10-02T00:00:00.000Z", "ut1"], ["2027-10-02T00:01:09.250Z", "tt"], ["1973-01-02T00:00:43.500Z", "tt"]
  ]) list.push({ group: "edges", utc: Date.parse(iso), timeScale });
  let seed = 20260929;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const near = (ms) => STEPS.some((at) => Math.abs(ms - at) < 2 * DAY) || (ms >= Date.UTC(1971, 11, 30) && ms < Date.UTC(1973, 0, 4));
  while (list.filter((row) => row.group === "other").length < 20_000) {
    const ms = Math.floor(Date.UTC(1850, 0, 1) + random() * (Date.UTC(2150, 0, 1) - Date.UTC(1850, 0, 1)));
    if (near(ms)) continue;
    const timeScale = ["utc", "ut1", "tt"][Math.floor(random() * 3)];
    const pin = random() < 0.2 ? 60 + Math.round(random() * 200) / 10 : undefined;
    list.push({ group: "other", utc: ms, timeScale, pin, place: PLACES[list.length % 4] });
  }
  for (const { at } of LEAPS) {
    for (let offset = -2000; offset <= 500; offset += 250) list.push({ group: "leap-ut1", utc: at + offset, timeScale: "ut1" });
  }
  for (let ms = Date.UTC(1972, 0, 1), index = 0; ms < Date.UTC(1973, 0, 2); ms += DAY + (7 * 60 + 13) * 60_000, index += 1) {
    list.push({ group: "1972-tt", utc: ms + 42_000, timeScale: "tt", place: PLACES[index % 4] });
    list.push({ group: "1972-ut1", utc: ms, timeScale: "ut1", place: PLACES[index % 4] });
  }
  return list;
}

if (process.argv[2] === "--worker") {
  const engine = await import(pathToFileURL(join(process.argv[3], "dist/index.js")).href);
  const rows = cases().map(({ utc, timeScale, pin, place }) => {
    const [latitude, longitude] = place ?? [59.91, 10.75];
    const chart = engine.natalChart({
      utc: new Date(utc),
      latitude,
      longitude,
      houseSystem: "placidus",
      ...(timeScale ? { timeScale } : {}),
      ...(pin === undefined ? {} : { deltaT: pin })
    });
    return {
      bodies: chart.bodies.map((body) => [body.lon, body.lat, body.speed]),
      angles: [chart.angles.asc, chart.angles.mc],
      cusps: chart.houses.cusps,
      deltaT: chart.deltaT,
      timeScale: chart.timeScale
    };
  });
  process.stdout.write(JSON.stringify({ version: engine.ENGINE_VERSION, rows }));
} else {
  const [before, after, out] = process.argv.slice(2);
  const run = (root) => JSON.parse(execFileSync(process.execPath, [fileURLToPath(import.meta.url), "--worker", root], { encoding: "utf8", maxBuffer: 1 << 30 }));
  const a = run(before).rows;
  const b = run(after).rows;
  const list = cases();
  const circle = (x, y) => Math.abs(((((y - x) % 360) + 540) % 360) - 180) * 3600;
  // Four significant digits, rounded away from zero: a largest change or a band stays a bound.
  const directed = (value, toward) => {
    if (value === 0 || !Number.isFinite(value)) return value;
    const scale = 10 ** (3 - Math.floor(Math.log10(Math.abs(value))));
    return Number((toward(Number((value * scale).toPrecision(12))) / scale).toPrecision(4));
  };
  const precise = (value) => directed(value, (x) => Math.sign(x) * Math.ceil(Math.abs(x)));
  const indices = (group) => list.map((row, index) => (row.group === group ? index : -1)).filter((index) => index >= 0);
  const NAMES = ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"];
  /** Largest change of each angle and body over some cases, arcseconds. */
  const changes = (group) => {
    const max = { mc: 0, "asc and cusps": 0 };
    for (const i of Array.isArray(group) ? group : indices(group)) {
      max.mc = Math.max(max.mc, circle(a[i].angles[1], b[i].angles[1]));
      max["asc and cusps"] = Math.max(max["asc and cusps"], circle(a[i].angles[0], b[i].angles[0]), ...a[i].cusps.map((cusp, k) => circle(cusp, b[i].cusps[k])));
      a[i].bodies.forEach((row, k) => (max[NAMES[k]] = Math.max(max[NAMES[k]] ?? 0, circle(row[0], b[i].bodies[k][0]))));
    }
    return Object.fromEntries(Object.entries(max).map(([key, value]) => [key, precise(value)]));
  };
  // A range's ends rounded outward, so that it holds every value.
  const range = (values) => [directed(Math.min(...values), Math.floor), directed(Math.max(...values), Math.ceil)];
  const report = { firstCut: "d90a00a", cases: list.length };
  // The ΔT model's step where its spline hands over to its knots, y = 1941.0 (1940-12-31T18:00 UT1), unchanged.
  const { deltaTAt } = await import(pathToFileURL(join(after, "dist/deltat.js")).href);
  const handOver = (1941 - 2000) * 365.25;
  report.modelStepAt1941Seconds = precise(deltaTAt(handOver).seconds - deltaTAt(handOver - 1e-9).seconds);

  // 1. TT input inside a leap second: this build reads UT1 as TAI + (UT1 - TAI)
  //    (and agrees with UT1 input of the same instant to the millisecond; the
  //    unit tests); the first cut read it a second early.
  const leap = indices("leap-tt");
  // 2016-12-31T23:59:60.500 UTC, the reviewers' instant: TT 2017-01-01T00:01:08.684.
  const example = leap.find((i) => list[i].utc === Date.parse("2017-01-01T00:01:08.684Z"));
  report.leapSecondTtInput = {
    instants: leap.length,
    deltaTFirstCutMinusNowSeconds: range(leap.map((i) => a[i].deltaT.seconds - b[i].deltaT.seconds)),
    example: { tt: "2017-01-01T00:01:08.684Z", deltaTFirstCut: Number(a[example].deltaT.seconds.toFixed(4)), deltaTNow: Number(b[example].deltaT.seconds.toFixed(4)) },
    maxChangeArcsec: changes("leap-tt")
  };

  // 2. 1972 on UTC.
  const y1972 = indices("1972");
  report.utcInput1972 = {
    charts: y1972.length,
    ut1MinusUtcSeconds: range(y1972.map((i) => b[i].timeScale.ut1MinusUtc.seconds)),
    firstCutSource: [...new Set(y1972.map((i) => a[i].timeScale.ut1MinusUtc.source))],
    source: [...new Set(y1972.map((i) => b[i].timeScale.ut1MinusUtc.source))],
    deltaTChangeSeconds: range(y1972.map((i) => b[i].deltaT.seconds - a[i].deltaT.seconds)),
    maxChangeArcsec: changes("1972")
  };

  // 3. Speeds where a step lies between the samples: the first cut's speed over
  //    this build's, for the Sun to Pluto, by the kind of step.
  const speeds = indices("speeds");
  const ratios = (filter) => {
    const values = speeds.filter((i) => filter(list[i].utc)).flatMap((i) => a[i].bodies.slice(0, 10).map((row, k) => row[2] / b[i].bodies[k][2]));
    return [Number(Math.min(...values).toPrecision(7)), Number(Math.max(...values).toPrecision(7))];
  };
  const near = (iso) => (ms) => Math.abs(ms - Date.parse(iso)) < DAY;
  report.speedsAcrossSteps = {
    instants: speeds.length,
    firstCutOverNowRatio: {
      "a leap second": ratios((ms) => LEAPS.some(({ at }) => Math.abs(ms - at) < DAY)),
      "1972-01-01": ratios(near("1972-01-01T00:00:00Z")),
      "2027-10-02": ratios(near("2027-10-02T00:00:00Z")),
      "1941.0": ratios(near("1940-12-31T18:00:00Z"))
    },
    // The positions move only where UT1 does (1972-01-01, now on C04): the true node's noise.
    maxChangeArcsec: changes("speeds")
  };

  // The midheaven's jump across the join in one millisecond.
  const [x, y] = indices("join");
  report.joinOf1973 = {
    place: PLACES[3],
    midheavenJumpArcsec: { firstCut: precise(circle(a[x].angles[1], a[y].angles[1])), now: precise(circle(b[x].angles[1], b[y].angles[1])) }
  };

  // 4. The table's edges on UT1 and TT input.
  report.tableEdges = indices("edges").map((i) => ({
    input: `${new Date(list[i].utc).toISOString()} ${list[i].timeScale}`,
    firstCut: `${a[i].deltaT.segment}, sigma ${precise(a[i].deltaT.sigma)} s`,
    now: `${b[i].deltaT.segment}, sigma ${precise(b[i].deltaT.sigma)} s`,
    deltaTChangeSeconds: precise(b[i].deltaT.seconds - a[i].deltaT.seconds)
  }));

  // 5. Everything else must be unchanged.
  const other = indices("other");
  const strip = (row) => JSON.stringify({ ...row, deltaT: { ...row.deltaT, tableDigest: null }, timeScale: { ...row.timeScale, leapSeconds: row.timeScale.leapSeconds && { ...row.timeScale.leapSeconds, listed: null } } });
  report.elsewhere = {
    charts: other.length,
    pinned: other.filter((i) => list[i].pin !== undefined).length,
    changed: other.filter((i) => strip(a[i]) !== strip(b[i])).length,
    listedChanged: other.filter((i) => JSON.stringify(a[i].timeScale.leapSeconds) !== JSON.stringify(b[i].timeScale.leapSeconds)).length,
    listedChangedFrom: other.filter((i) => JSON.stringify(a[i].timeScale.leapSeconds) !== JSON.stringify(b[i].timeScale.leapSeconds)).map((i) => new Date(list[i].utc).toISOString()).sort().slice(0, 1)[0] ?? null
  };
  // 6. UT1 input around leap seconds: ΔT, angles and positions, and whether
  //    32.184 s + (TAI - UTC) - (UT1 - UTC) is the ΔT reported.
  const residual = (row) =>
    row.timeScale.leapSeconds && row.timeScale.ut1MinusUtc
      ? Math.abs(32.184 + row.timeScale.leapSeconds.taiMinusUtc - row.timeScale.ut1MinusUtc.seconds - row.deltaT.seconds)
      : 0;
  const c04Year = (i) => list[i].utc < Date.UTC(1973, 0, 2);
  const ut1Around = (rows) => ({
    instants: rows.length,
    deltaTChangeSeconds: range(rows.map((i) => b[i].deltaT.seconds - a[i].deltaT.seconds)),
    ut1MinusUtcChanged: rows.filter((i) => a[i].timeScale.ut1MinusUtc?.seconds !== b[i].timeScale.ut1MinusUtc?.seconds).length,
    largestIdentityResidualSeconds: {
      firstCut: precise(Math.max(...rows.map((i) => residual(a[i])))),
      now: precise(Math.max(...rows.map((i) => residual(b[i]))))
    },
    maxChangeArcsec: changes(rows)
  });
  report.leapSecondUt1Input = {
    from1974: ut1Around(indices("leap-ut1").filter((i) => !c04Year(i))),
    inThe1972C04Span: ut1Around(indices("leap-ut1").filter(c04Year))
  };

  // 7. TT and UT1 input in 1972.
  for (const [key, group] of [["ttInput1972", "1972-tt"], ["ut1Input1972", "1972-ut1"]]) {
    const rows = indices(group);
    report[key] = {
      charts: rows.length,
      deltaTChangeSeconds: range(rows.map((i) => b[i].deltaT.seconds - a[i].deltaT.seconds)),
      maxChangeArcsec: changes(group)
    };
  }
  const text = `${JSON.stringify(report, null, 1)}\n`;
  if (out) writeFileSync(out, text);
  process.stdout.write(text);
}
