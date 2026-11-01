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
comment only. The calc-api record's other files are not rewritten.

## Where each check is

| check | item | where |
| --- | --- | --- |
| E1, E2 | all | `tools/f89_edits.py package`, on an unpacked package |
| E3 (a) | 2 | `src/crossings.test.ts`, "a plain scan's blind band, f″h²/8" |
| E4 | 3 | `src/geo/flags.test.ts`, "names no tzdb version where ..." |
| E5 | 4 | `scripts/verify-package-contents.mjs`, the Gregorian adoption table |
| E6 | 5 | `src/calc-bounds.test.ts`, "name ERFA, not Horizons, ..." |
| E7 | 7 | `src/houses-extra.test.ts`, "puts Munkasey's co-ascendant west ..." |
| E8 | 9 | `src/receipt-time-basis.test.ts`, "is refused without the ephemeris ..." |
| E10 | 1 | `src/points.test.ts`, "the README's figures for the Vertex and the East Point" |

E10 reads the README and `conformance/RESULTS.md`, so it holds the README to
rc.2's figures once the cut's commit X regenerates the results. E9 and E11
belong to OQ9's options (a) and (b) and are not run. The formal runs of E1,
E2 and E3 (b), at the source commit, record their outputs here.
