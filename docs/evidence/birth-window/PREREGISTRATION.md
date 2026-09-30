# Birth-time windows: preregistration of the 1,000-window check

Programme unit B2.a. Its gate, from the acceptance ledger: "switch instants
agree with dense 1 s sampling on 1,000 random windows, zero missed". This file
fixes, before the run, what is run, how it is compared and what counts as a
pass. It is committed before any result exists; the results are committed
after it, unchanged in method.

## What is tested

`birthWindow` from `@zodiacs/engine/window`, as built from commit
`670db8a6adcb9940a212ba1dbcc28c33d7f8aa3e` (`npm ci`, `npm run build`),
under Node.js 22.

## Windows

`generate.mjs` draws the windows with mulberry32, seed **20260928**, 1,000
windows, seven draws per window in a fixed order. `windows.json` is its
output, committed with this file, SHA-256
`238071ceea6c19a32eb11db28ff128f11532939f050d0a96ac0df5d33c533d17`. The seed
was not used during development, which used seeds 1 to 3; only the list's
marginal counts below were looked at before this commit.

- **Length**: log-uniform from 60 s to 86,400 s, rounded to whole seconds
  (L = round(60 · 1440^u)). In this list: 230 windows of 5 minutes or less,
  95 of 12 hours or more, the longest 83,450 s; 12,258,372 seconds in all.
- **Start**: uniform over 1800-01-01T00:00Z to 2200-01-01T00:00Z − L, to the
  millisecond, so every window lies inside the engine's reference span.
- **Latitude**: 35 % uniform in [−60°, 60°]; 30 % with |φ| uniform in
  [60°, 66°]; 20 % in [66°, 67°], across the polar circle (66.532° to 66.589°
  over the span); 15 % in [67°, 90°]; hemisphere at random; rounded to 1e-6°.
  In this list 349, 326, 179 and 146 windows.
- **Longitude**: uniform in [−180°, 180°), rounded to 1e-6°.
- **House system**: uniform over the thirteen systems (68 to 95 windows each).

The inputs are synthetic; no one's birth data is used.

## The independent path

`checker.mjs` evaluates the engine's public root entry point only:
`natalChart`, `houseOf` and `signForLongitude`. It imports nothing from
`@zodiacs/engine/window` and shares no code with its search. For a window
[start, end) its sample instants are start, every whole second after it
inside the window, and end − 1 ms if that is not already one. At each it takes
72 components from `natalChart({ utc, latitude, longitude, houseSystem })`:

- the sign of each of the twelve bodies;
- the signs of the ascendant and the midheaven;
- the house of each of the twelve bodies, `houseOf(lon, chart.houses.cusps)`;
- for each of the 45 pairs of the ten physical bodies, the aspect type in
  `chart.aspects`, or none;
- `chart.houses.system`, the house system actually used.

astronomy-engine reuses its last nutation for any instant within 86.4 ms.
natalChart's own calls are always further apart than that; the checker
evaluates natalChart a day away before the first instant of each batch and
before any instant within 100 ms of the previous one, so that every value is
what a lone natalChart call computes.

## Matching rule

`compare.mjs`, applied to every window. A **step** is the interval between
consecutive sample instants, (t[k−1], t[k]]. A **sampled transition** is a
component whose value differs between t[k−1] and t[k].

- A switch **matches** a sampled transition when the search reports a change
  of the same component at an instant in the same step.
- A sampled transition with no reported change of its component in its step
  is **missed**.
- A reported change in a step where the sampled values of its component are
  equal is **extra**, unless the reported changes of that component in the
  step return to the value they started from (a sub-second excursion, which
  one-second sampling cannot see) and each of them is confirmed by natalChart
  at its own two milliseconds: the component has the reported `from` value at
  `at` − 1 ms and the `to` value at `at`. An unconfirmed excursion is extra,
  and so is a change reported at or before the first sample or after the
  last. A net change in a step that differs from the sampled one shows as a
  cell disagreement, below.
- **Cell agreement**: the cell containing each sample instant must hold
  natalChart's value of every component there. Each disagreement is counted.
- If the search throws, the window fails and all its sampled transitions count
  as missed.

Reported as well, outside the pass rule:

- **Millisecond check**: for every switch, natalChart at `at` − 1 ms and at
  `at` differs in exactly the listed components, from and to as listed.
- The number of windows whose result carries the `bound-exceeded` flag. The
  flag does not excuse a miss.
- The search's and the checker's run times per window.

## Pass rule

**PASS** if, over all 1,000 windows, there are zero missed transitions, zero
extra changes and zero cell disagreements, and the search returns for every
window. Anything else is **FAIL**, reported with its details.

## Procedure

1. At commit `670db8a6`: `npm ci`, `npm run build`.
2. `node docs/evidence/birth-window/generate.mjs --out FILE`, and check that
   FILE is byte-identical to the committed `windows.json`.
3. `node docs/evidence/birth-window/run.mjs --workers 3`, which writes
   `results.jsonl` (one line per window) and `summary.json` beside this file.
4. Commit both, with `RESULTS.md` summarising the counts and the timings.

No window is dropped or rerun on its own. If the run is interrupted it is run
again in full. A fix after a FAIL needs a new preregistration with a new seed;
this one stays on record.
