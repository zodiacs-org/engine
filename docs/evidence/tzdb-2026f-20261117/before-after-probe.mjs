const geo = await import(process.argv[2]);
const cases = [
  ["1885-06-01","12:00","Europe/Uzhgorod",{longitude:22.3}],
  ["1885-06-01","12:00","Europe/Uzhgorod",undefined],
  ["1879-12-31","23:50","Europe/Zaporozhye",{longitude:35.17}],
  ["1900-06-01","12:00","America/Yellowknife",{longitude:-114.37}],
  ["1900-06-01","12:00","America/Yellowknife",undefined],
  ["1930-06-01","12:00","America/Yellowknife",undefined],
  ["1947-06-01","12:00","America/Yellowknife",undefined],
  ["1943-06-01","12:00","EST5EDT",undefined],
  ["1945-08-20","12:00","CST6CDT",undefined],
  ["1925-09-27","12:00","Europe/Dublin",undefined],
  ["1965-03-31","12:00","America/Sao_Paulo",undefined],
];
for (const [d,t,z,o] of cases) { await geo.prepareLocalTime(d, z); const r = geo.resolveLocalToUtc(d,t,z,o); console.log(z, d, t, o?JSON.stringify(o):"", r.utc.toISOString(), r.offsetMinutes, JSON.stringify(r.flags), r.zone.source, r.zone.dataForm, r.zone.abbreviation); }
