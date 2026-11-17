// Engine output before and after, for the README's "Changes an offset comparison cannot see":
// a regression record, not accuracy evidence. Synthetic wall times.
//   node before-after-probe.mjs PATH/TO/dist/geo.js
const geo = await import(process.argv[2]);
const cases = [
  ["1885-06-01", "12:00", "Europe/Uzhgorod", { longitude: 22.3 }],
  ["1885-06-01", "12:00", "Europe/Uzhgorod", undefined],
  ["1879-12-31", "23:50", "Europe/Zaporozhye", { longitude: 35.17 }],
  ["1885-06-01", "12:00", "Europe/Zaporozhye", undefined],
  ["1900-06-01", "12:00", "America/Yellowknife", { longitude: -114.37 }],
  ["1900-06-01", "12:00", "America/Yellowknife", undefined],
  ["1930-06-01", "12:00", "America/Yellowknife", undefined],
  ["1947-06-01", "12:00", "America/Yellowknife", undefined],
  ["1943-06-01", "12:00", "EST5EDT", undefined],
  ["1945-08-20", "20:00", "EST5EDT", undefined],
  ["1945-08-20", "20:00", "CST6CDT", undefined],
  ["1945-08-20", "20:00", "MST7MDT", undefined],
  ["1945-08-20", "20:00", "PST8PDT", undefined],
  ["1925-09-27", "12:00", "Europe/Dublin", undefined],
  ["1965-03-31", "12:00", "America/Sao_Paulo", undefined],
  ["2026-09-20", "01:30", "Africa/Casablanca", undefined],
  ["2026-09-20", "01:30", "Africa/El_Aaiun", undefined]
];
console.log(`host tz ${process.versions.tz}`);
for (const [date, time, zone, options] of cases) {
  await geo.prepareLocalTime(date, zone);
  const r = geo.resolveLocalToUtc(date, time, zone, options);
  console.log(
    zone, date, time, options ? JSON.stringify(options) : "", r.utc.toISOString(), r.offsetMinutes, JSON.stringify(r.flags),
    r.zone.source, r.zone.dataForm, r.zone.abbreviation, JSON.stringify(r.transition)
  );
}
