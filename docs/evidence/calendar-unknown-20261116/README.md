# A skipped calendar date with no country (ZOD-97, T3), 2026-11-16

The rerun of ZOD-97 on 1.1.0 (`../edge-cases-1.1.0-20261116/`) found T3
failing on the calendar switch: a Gregorian date inside the days a country's
change of calendar skipped is accepted; with the country given it gets a
`calendarNote` ("noted"), with no country there is no signal at all
("silent": 1582-10-10 for Rome, 1752-09-08 for London). This folder reruns
the calendar-switch cases on the branch that flags such a date
`"calendar-unknown"` when no country is given.

The pass mark is the one the first run applied
(`../edge-cases-20261111/README.md`, T3, "Calendar switch"; cases in
`../edge-cases-20261111/EDGE-CASES.md`, T4): ZOD-97's "fail: it accepts a
date that never existed as a normal civil date", and the valid neighbours
resolve to the right instant. The arbiter is
calendar arithmetic written in the tool (the Julian day number) and tzdb
2025c's local mean time for each zone, not the engine's output.

Synthetic dates and places only.

## What was run, on what

- Engine: the branch `admin/zod-97-calendar-switch-no-country`, from `main`
  at `c0edf2a` (1.1.0), built with `npm ci && npm run build`, Node 22.23.4.
- `tools/calendar-switch.mjs`: the first run's tool with one change: a date
  that never existed there and carries `"calendar-unknown"` is "flagged", and
  a date that did exist and carries it fails. The first run's cases, arbiter
  and every other verdict are kept; the review round of 2026-11-16 added
  T3-o to T3-q (below), with New York's offset from tzdb 2025c's
  `northamerica` file (local mean time −4:56:02 to 1883, EST −5:00 on
  1918-02-05). The second review round added T3-r, with the local mean time
  of Amsterdam (0:19:32), Zurich (0:34:08), Warsaw (1:24:00) and Brussels
  (0:17:30) from tzdb 2025c's `europe` file.
- `../edge-cases-1.1.0-20261116/tools/local-time-rule.mjs`, unchanged, for
  the rest of T3 (Samoa 2011-12-30 and Kwajalein 1993-08-21) and T1 and T2,
  to show the flag moved none of them. Host time zone data: tzdb 2026e.

## Results

`results/calendar-switch.json`:

| cases | 1.1.0 | this branch |
| --- | --- | --- |
| the valid days either side of each switch (Rome, London), and the three chart-flag cases | pass, 7 | pass, 7 |
| skipped dates with the country given (Rome 1582-10-05, -10, -14; London 1752-09-08 as Julian and as Gregorian) | noted, 5 | noted, 5 (unchanged: no flag where the country is given) |
| skipped dates with no country (Rome 1582-10-10, London 1752-09-08) | silent, 2 | flagged, 2: `"calendar-unknown"` on the resolution and on the chart |
| T3-o: dates that existed where written, no country (Gregorian 1752-09-08 in `Europe/Rome`, 1918-02-05 in `America/New_York`) | not run | pass, 2: no flag, no note |
| T3-p: Gregorian 1752-09-08 in `America/New_York`, no country | not run | flagged, 1 |
| T3-q: Gregorian 1752-09-08 in `Europe/London` with `US`, `IE` or `ZZ`, countries the table does not date | not run | flagged, 3 (the branch's first version let any country silence the check) |
| T3-r: dates a region inside a tabled capital's zone skipped by its row's note, no country (Gregorian 1701-01-05 in `Europe/Amsterdam`, 1584-01-14 in `Europe/Zurich` and `Europe/Warsaw`, 1582-12-16 in `Europe/Brussels`) | not run | flagged, 4 (the second version narrowed these zones to their row's own changeover and let them through) |

Every instant still matches the arithmetic; the flag changes no instant.
Totals: pass 9, noted 5, flagged 10, no fail.

T3-p is flagged on purpose. The reviewer listed Gregorian 1752-09-08 in
`America/New_York` among dates that existed; the table's own source says
otherwise for New York City: Great Britain took the Gregorian calendar on
1752-09-14 after 1752-09-02 (tzdb 2025c, file `calendars`), and the British
colonies in America changed with it, so Gregorian 1752-09-03 to 1752-09-13
were never written there. Other places in the zone's area followed Spain or
France and did write them. The zone names no tabled country, so the flag,
"not known", is the honest answer; with `country: "GB"` the resolution
carries the "old-style" note instead.

T3-r is flagged because a capital's zone covers more than its row. The
notes of four rows date changeovers in regions of the capital's present zone
whose skipped days fall in another row's and not in the row's own:
Friesland and Groningen on 1701-01-12 (the Netherlands; Zurich's change),
the Catholic cantons on 1584-01-22 (Switzerland) and Silesia on 1584-01-23
(Poland; both inside Austria's and Bohemia's), and Brabant on 1582-12-25 by
Grotefend (Belgium; inside France's). Those four zones take every
changeover. The other rows' notes date no such changeover
(`src/geo/calendar-unknown.test.ts` checks this from the notes), so their
capitals keep their own row alone.

Not covered: Greece's change of 1923. None of the table's three sources
(tzdb 2025c's `calendars` and Grotefend's 1891 and 1898 works) dates it, so
Greece has no row, and Gregorian 1923-02-20 in `Europe/Athens` is neither
flagged nor noted, with or without `country: "GR"`
(`src/geo/calendar-unknown.test.ts` pins this). Adding the row needs a
primary source quoted in `src/fixtures/gregorian-adoption.json`, as every
other row has.

`results/local-time-rule.json`: pass, 23 of 23, as on 1.1.0.

So the two silent cases, the ones that failed T3 with no signal, now carry a
flag. The five noted cases are as before: their signal is the `calendarNote`
on the resolution, not a flag on the chart, and whether that note passes is
the reading the first run's `README.md` leaves to the reviewer (T3,
"Calendar switch").

## Rerunning

```sh
npm ci && npm run build
E=docs/evidence/calendar-unknown-20261116
node $E/tools/calendar-switch.mjs $E/results/calendar-switch.json
node docs/evidence/edge-cases-1.1.0-20261116/tools/local-time-rule.mjs $E/results/local-time-rule.json
```

Nothing was merged, tagged, released or published.
