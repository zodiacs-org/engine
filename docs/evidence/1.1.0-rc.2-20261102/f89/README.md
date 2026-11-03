# F-89 in 1.1.0-rc.2

The nine wording corrections of zodiacs.org's finding F-89 (the F-89 part of
the programme's unit P1.14), made as `PREREGISTRATION.md` fixes them: its
recommended edits, item 1 under OQ9's default (c), item 2 in its variant A.
OQ9 is unanswered, and pyswisseph, which (a) needs, is not approved (OQ6).

- `PREREGISTRATION.md`: the rule, committed before any code of the cut.
- `tools/f89_edits.py`: the 29 edits as exact pairs of the text on engine
  main a253973 and the new text, the 23 that the preregistration applies
  (`apply`), and the scan of E1 and E2 (`package`), committed before E1 and
  E2 run. It is the draft's tool with the scan's method unchanged; item 1's
  edit and E2 phrase are those of OQ9 (c), and edit 2a names this folder's
  `blind-band.json` (the cut plan's correction K27).
- `blind-band.mjs` and its output `blind-band.json`: E3 (b), item 2's
  figures (below).

## The blind band of a plain 5-day scan (item 2)

    npm run build
    node docs/evidence/1.1.0-rc.2-20261102/f89/blind-band.mjs

It is a port of zodiacs.org's
`docs/platform/evidence/claims-engine-references-20261012/tools/blind-band.mjs`
(site main 9a67f761) to this repository's build. On the engine's own
longitudes it finds the 12 Saturn and 11 Jupiter stations from 2019 to 2024,
takes f″ at each by a central difference over ±1 day, and scans 40 days
around each at 100 phases of the 5-day grid for a target a given depth short
of the station. Run on the build of the unit's first commit, `48e4e76`
(Node 22.22.2, macOS on arm64), and run again there with the same bytes
(SHA-256 `0c4c6b0fc248dd3b5f6661f705ac41611d5d4895b45caa213493342c196c8886`):

- the largest band |f″|h²/8 is 0.00554984° for Saturn and 0.0109673° for
  Jupiter, which rounded up to two significant figures are the 0.0056° and
  0.011° that README.md and `dist/crossings.d.ts` state;
- at those depths no phase misses both crossings, at any station (the check);
- at 0.9 times each station's own band, 5 phases of 100 miss both, at every
  station (the control, which must find a miss);
- each station's time, f″ and band are those of the site's record on engine
  1.0.0, `blind-band.json` beside that tool, in all 23 rows.

The figures describe a fixed-step scan of the engine's own motion, not the
sky. The run is repeated at the source commit, where it must give the same
bytes.

## The bounds generator (item 5)

`docs/evidence/calc-api/tools/bounds.py` gained `MEAN_POINTS_BASIS`, the
basis of the mean node's, the mean south node's and Black Moon Lilith's
bounds, which were compared with their definitions evaluated on ERFA's
fundamental arguments, not with JPL Horizons
(`docs/evidence/calc-api/PREREGISTRATION.md`). `src/calc-bounds.ts` was
written again from the same summary:

    CALC_API_RESULTS=docs/evidence/calc-api/rc16 python3 -I docs/evidence/calc-api/tools/bounds.py
    CALC_API_RESULTS=docs/evidence/calc-api/rc16 python3 -I docs/evidence/calc-api/tools/bounds.py --check

No value changed: the file differs from a253973's by the new constant and its
comment only. The calc-api record's other files are not rewritten. After
review 1 (the preregistration's amendment of 2026-11-03) the generator also
writes `MEAN_POINTS_SPEED_BASIS`, the basis of the three points' speed bounds,
because their speeds were compared in the true ecliptic of date only; again
no value changed.

## Where each check is

| check | item | where |
| --- | --- | --- |
| E1, E2 | all | `tools/f89_edits.py package`, on an unpacked package |
| E3 (a) | 2 | `src/crossings.test.ts`, "a plain scan's blind band, f″h²/8" (the test's name; its `curvature` is the size of f″) |
| E3 (b) | 2 | `blind-band.mjs` and its output `blind-band.json` |
| E4 | 3 | `src/geo/flags.test.ts`, "names no tzdb version where ..." |
| E5 | 4 | `scripts/verify-package-contents.mjs`, the Gregorian adoption table |
| E6 | 5 | `src/calc-bounds.test.ts`, "name ERFA, not Horizons, ..." |
| E7 | 7 | `src/houses-extra.test.ts`, "puts Munkasey's co-ascendant west ..." |
| E8 | 9 | `src/receipt-time-basis.test.ts`, "is refused without the ephemeris ..." |
| E10 | 1 | `src/points.test.ts`, "the README's figures for the Vertex and the East Point" |

E10 reads the README and `conformance/results/summary.json`, and requires each
figure to be the unrounded maximum there rounded up to three decimals (the
amendment of 2026-11-03, after review 1 found 0.013″, the Vertex's
0.013370956″ rounded to the nearest), so it holds the README to rc.2's figures
once the cut's commit X regenerates the results. E9 and E11
belong to OQ9's options (a) and (b) and are not run. The formal runs of E1,
E2 and E3 (b), at the source commit, record their outputs here.
