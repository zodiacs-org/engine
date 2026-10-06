# A caller's ayanamsa from an epoch outside 1800 to 2200: evidence (2026-10-06)

In 0.1.1-rc.17 the calc entry refused a caller's ayanamsa carried by
precession (`{ epoch, value, model? }`, the counterpart of Swiss Ephemeris's
`SE_SIDM_USER`) from an epoch outside 1800 to 2200 (`out-of-range`), at every
instant, though `@zodiacs/engine/vedic` computes it from any epoch a `Date`
holds and flags it. The site's programme recorded this as finding F-80, and
on 2026-10-06 the owner decided that calc computes such an ayanamsa from an
epoch anywhere in `EPHEMERIS_SPAN`, 0001-04-30T12:00 to 3998-09-03T12:00 TT,
the years astronomy-engine tabulates, and refuses it beyond. From 1.0.0-rc.1
it does:

- an epoch whose TT is in `EPHEMERIS_SPAN`, the ends included, is computed;
  outside 1800 to 2200 the ayanamsa's bound is one of two new bands (below);
- an epoch beyond is refused with a new reason, `epoch-out-of-range`, whose
  `epochSpan` is the root's `EPHEMERIS_SPAN`;
- instants are as before: calc computes only those whose UT1 and TT are in
  `CALC_SPAN`, 1800-01-01 to 2200-01-01, and a linear ayanamsa from any epoch.

`docs/calc.md`, *The sidereal zodiac*, *Bounds* and *Refusals*, is the
reference.

## The comparison

Each comparison is the engine's mean ayanamsa, as calc subtracts it, against
ERFA's construction of the same definition at the same binary instant, and
the same for its rate over the two instants 0.001 day of TT either side, the
step of calc's speeds.

- `tools/engine_epochs.mjs` runs `calc()` on the build for the Sun in the
  sidereal zodiac with a caller's ayanamsa on each precession model (the
  engine's IAU 2006, Newcomb's and IAU 1976's), seven values from −359.9° to
  359.9°, and 205 epochs: every 7,300 days (about 20 years) across
  `EPHEMERIS_SPAN`, both its ends, J2000.0, and 1800-01-01 and 2200-01-01
  and a millionth of a day short of each, where the band changes; at 17 TT
  instants across `CALC_SPAN`, about every 25 years and 0.002 day inside its
  ends, and 0.001 day either side of each. For each it writes the Julian date
  asked for, the TT Julian date calc's receipt says it used, and the mean.
  Its 73,185 rows (10,142,706 bytes, SHA-256
  `f3b3950dc1aa2ebb387ea902f63d07361883ca095b874ce05bc35229b06ac0cb`) are
  not committed: they rebuild in about 20 seconds, byte for byte the same.
- `tools/epoch_reference.py` builds ERFA's side with pyerfa 2.0.1.5, from
  the Vedic evidence's reference construction
  (`../vedic-2026-09-28/tools/reference_values.py`, `equinox_longitude`:
  ERFA's bp06 for IAU 2006, prec76 and obl80 for IAU 1976, Kinoshita's table
  for Newcomb), combined as that tool's `epoch_ayanamsa` combines it, in
  rational arithmetic, so that the combination adds no rounding to ERFA's. It
  writes `results/epochs.json`: the comparisons and the largest differences
  for each model, with epochs inside 1800 to 2200 and outside, and the rows
  that hold them. No Swiss Ephemeris code or value is used.
- `tools/epoch_reference.py --fixture` writes
  `src/fixtures/ayanamsa-epochs.json`, 17 rows: each model's largest
  differences outside the span and the corners of `EPHEMERIS_SPAN`'s epochs
  and the span's instants, each with the Julian date asked for and the TT
  instants calc used. `src/calc-sidereal.test.ts` repeats the comparison on
  them on every run, checks that calc uses the same instants again, holds
  calc to the bounds, and holds each bound to be its band's largest
  difference rounded up to two significant figures, the rule of the calc
  entry's other measured bounds.

| model, epoch | comparisons | largest, ayanamsa | where | largest, rate | bound |
| --- | ---: | ---: | --- | ---: | --- |
| the engine's, 1800 to 2200 | 2,737 | 4.51 × 10⁻⁷″ | −180° from 2060, at 1800 | 9.9 × 10⁻⁸″ a day | 4.6 × 10⁻⁷″; 1.6 × 10⁻⁷″ a day (as before) |
| Newcomb's or IAU 1976's, 1800 to 2200 | 5,474 | 4.29 × 10⁻⁷″ | −359.9° from 2199, at 1800 | 9.9 × 10⁻⁸″ a day | the same |
| the engine's, outside | 21,658 | 0.003674″ | from `EPHEMERIS_SPAN`'s first epoch, at 1800 | 1.22 × 10⁻⁷″ a day | 0.0037″; 1.3 × 10⁻⁷″ a day |
| Newcomb's or IAU 1976's, outside | 43,316 | 1.706 × 10⁻⁵″ | from its last epoch, at 1800 | 1.16 × 10⁻⁷″ a day | 1.8 × 10⁻⁵″; 1.2 × 10⁻⁷″ a day |

Inside 1800 to 2200 the differences stay within the bound rc.17 measured for
every epoch and linear definition. Outside, the engine's IAU 2006 precession
and ERFA's part the further the epoch is from J2000.0; on Newcomb's or IAU
1976's precession the zodiac is held where that model puts it at J2000.0, so
the engine's own precession enters twice, from the epoch to J2000.0 and from
the epoch to the instant, and most of its difference from ERFA's cancels. The
rates' differences stay at the rounding of the two programs, about two units
in the last place of the mean over the 0.002 day.

## Why calc stops at `EPHEMERIS_SPAN`

`tools/far_epochs.mjs` takes the Vedic entry's `ayanamsa()`, which computes
an epoch definition from any epoch a `Date` holds, from ten epochs beyond and
at the edges of `EPHEMERIS_SPAN`, at three instants from 1800 to 2199
(`results/far-engine.json`), and `epoch_reference.py --far` compares them
with ERFA's (`results/far-epochs.json`). On the engine's precession the
difference is 0.0051″ from an epoch a century before `EPHEMERIS_SPAN`, 0.35″
from JD 1,000,000, 10.6″ from JD 0.5 and 499,323″, 139°, from the first day a
`Date` holds. Nothing else the engine computes reaches beyond
`EPHEMERIS_SPAN`, and this is where the owner's decision puts the limit.

## Reproducing

From the engine's root, after `npm run build`, with pyerfa 2.0.1.5:

```sh
node docs/evidence/calc-epochs-2026-10-06/tools/engine_epochs.mjs > /tmp/engine.json
python3 docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py /tmp/engine.json > docs/evidence/calc-epochs-2026-10-06/results/epochs.json
python3 docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py /tmp/engine.json --fixture src/fixtures/ayanamsa-epochs.json
node docs/evidence/calc-epochs-2026-10-06/tools/far_epochs.mjs > docs/evidence/calc-epochs-2026-10-06/results/far-engine.json
python3 docs/evidence/calc-epochs-2026-10-06/tools/epoch_reference.py docs/evidence/calc-epochs-2026-10-06/results/far-engine.json --far > docs/evidence/calc-epochs-2026-10-06/results/far-epochs.json
```

The round-trip fixture (`src/fixtures/calc-roundtrip.json`) is rebuilt with
`scripts/build-calc-roundtrip.mjs`: its case 29, a caller's ayanamsa from an
epoch in 763, refused `out-of-range` in rc.17, is now computed, with the
ayanamsa's bound 0.0037″; a new case 37, from JD 1,000,000.5, is refused
`epoch-out-of-range`. Every other case is unchanged.
