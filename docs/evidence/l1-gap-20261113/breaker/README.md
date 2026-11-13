# Second-session rerun of the L1 gap work (ZOD-206), 13 November 2026

A separate session reran the 240 L1 position vectors and the repository's
checks on this branch at `6b1f950`, without reusing `../tools/score.mjs`, and
tried to break the claims in `../README.md`. Node 22.22.2, Linux x86-64.

## What was rerun, and what it gave

| check | result | where |
| --- | --- | --- |
| engine, default source, suite tolerance (1″ in longitude and in latitude) | 48 of 240 | `breaker-score.log`, `breaker-harness.log` |
| engine on the DE440 pack, suite tolerance | 240 of 240 | same |
| 30″ in longitude alone, default source and DE440 | 240 of 240 and 240 of 240 | `breaker-score.log` |
| 30″ as a whole angle, default source and DE440 | 240 of 240 and 240 of 240 | same |
| receipt bound, whole angle, default source (bound read from each `calc()` result) | 237 of 240 | same |
| receipt bound, longitude alone, default source | 239 of 240 | same |
| Swiss Ephemeris 2.10.03 as an instrument, verdicts only | 240 of 240 | `breaker-harness.log` |
| the engine job's commands, the archive rebuild, the conformance and atlas commands | every command exits 0; 4,174 tests passed, 3 skipped | `breaker-gates.log` |
| tier B on the kernel | 3 of 3 | `breaker-harness.log` |

Largest differences from the vectors, unrounded figures in
`breaker-summary.json`: default source 18.7745″ in longitude (L1-POS-0209,
Neptune), 19.0281″ in latitude and 19.0384″ as an angle (L1-POS-0237,
Saturn); DE440 0.012647″ in longitude (L1-POS-0002, the Moon in 1851) and
0.001011″ in latitude (L1-POS-0222, the Moon in 2125).

The first session's per-case table (`../results/cases.json`) and this one
(`breaker-cases.tsv`) give the same verdict in every cell that both hold, and
no figure differs by more than 0.00031″. That remainder is the default
source read at the exact Julian date here and at the nearest millisecond
there (0.00027″ at most between the two routes).

## How the routes differ from the first session's

- Default source: `calc()` of `@zodiacs/engine/calc` on the exact TT Julian
  date, with the bound taken from the result's `bounds.position`, not parsed
  from `src/calc-bounds.ts`.
- Separation from unit vectors (cross and dot products).
- The pack was compiled again from the kernel in this session (51 s); both
  digests are the ones `docs/de440.md` names. The harness run on that pack
  writes a file byte-identical to `conformance/results/zodiacs-engine-de440.json`.
- The branch's adapter without the two variables writes a file
  byte-identical to the one `origin/main`'s adapter writes, on all 500
  vectors, and to `conformance/results/zodiacs-engine.json`.
- A wrong digest is refused (`digest-mismatch`). Every DE440 answer names
  `jpl-de440` and the pack's digest in its `meta`, and every one of the 240
  DE440 places differs from the default source's by at least 0.12″, so no
  body was silently answered by the default source.

## Checks on the two cautions from ZOD-97

- **30″ is a longitude bound.** Longitude and the whole angle are separate
  columns here as well. On these 240 cases the distinction changes no
  verdict at 30″ (the largest angle is 19.04″). It does change one at the
  receipt bound: 239 of 240 in longitude alone, 237 of 240 as an angle, and
  the receipt bound is a whole-angle figure.
- **Future instants.** Seven instants (70 cases) fall after 2026-09-22. All
  ten raw Horizons files in `conformance/sources/horizons-24/` are on TT
  (header and column name), and the engine is called on TT. A fixed ΔT 300 s
  away from the engine's own moves no default-source place by more than
  0.000001″, so ΔT does not enter. On DE440 the 70 future cases are within
  0.0094″ in longitude and the 170 others within 0.0127″: no step at the
  fetch date.
- The vectors are not Horizons's raw columns: the arbiter carries them into
  the IAU 2006/2000A frame. Raw minus vector is at most 0.3852″ in longitude
  (L1-POS-0010) and 0.0470″ in latitude (L1-POS-0002), so the DE440 run would
  also pass at 1″ against the raw columns.

## Findings

1. **The installed engine is where it started.** 48 of 240 at the suite's
   1″, before and after. The 240 of 240 exists only when a caller supplies a
   pack compiled from their own kernel. The first session says so plainly;
   this session agrees with its numbers and not with scoring that as a plain
   pass of "all 240 within the published limits".
2. **On the default source, 3 of 240 are over the receipt bound the package
   publishes for them** (L1-POS-0117 Saturn 18.236″ against 18, L1-POS-0164
   Venus 13.015″ against 11, L1-POS-0237 Saturn 19.038″ against 18).
   Confirmed with the bound read from `calc()`'s own result.
3. **With the bounds drafted on `admin/engine-1.1.0-rc.7` (draft PR 95, read
   with `git show`, nothing checked out), the default source is within the
   receipt bound in 240 of 240**, smallest margin the Sun's 1.73″ against
   3.4″ (`breaker-rc7-bounds.log`). `admin/zod-65-engine-phase-1-replace-receipt-error-limits` (draft PR 92) itself
   does not change `src/calc-bounds.ts`; draft PR 95 does. The first
   session's report does not mention PR 95, which also regenerates
   `conformance/RESULTS.md`, `results/summary.json` and
   `results/zodiacs-engine.json`.
4. **No published limit exists for the DE440 source as a receipt.** `calc()`
   refuses inside `withEphemeris` (240 of 240 here), so a DE440 chart carries
   no bound. The limit that applies to that run is the suite's 1″.
5. **The pull request text links the Linear issue by its long URL, whose slug
   holds a model name.** The house rules keep model names out of pull
   requests. The short form `https://linear.app/zodiacs-org/issue/ZOD-206`
   avoids it. Not edited by this session.
6. **Test counts differ by Node version, not by a failure.** 4,174 passed and
   3 skipped on Node 22.22.2; the first session's 4,173 and 4 were on
   22.23.3, where one test in `src/geo/zone-history.test.ts` that needs the
   host's tz data to be 2025c does not run.
7. Not this branch's doing, and not in CI: `run.mjs --check
   conformance/results/pyswisseph.json` reports the three vector files as
   changed since that file was written (it names them by an older path). The
   240 L1 verdicts are the same.

## Files

- `breaker-score.mjs`, `breaker-score.log`, `breaker-cases.tsv`,
  `breaker-summary.json`: the 240 cases.
- `breaker-harness.log`: the harness reruns, the digests, the refusal, the
  Swiss Ephemeris verdict counts, tier B.
- `breaker-gates.sh`, `breaker-gates.log`: the existing checks. As in the
  first session, they ran inside a mount namespace that hides this machine's
  root-owned `/node_modules`, which the archive-binding check refuses to
  have above `TMPDIR`.
- `breaker-rc7-bounds.mjs`, `breaker-rc7-bounds.log`: finding 3.

No kernel, pack or Swiss Ephemeris value is committed.
