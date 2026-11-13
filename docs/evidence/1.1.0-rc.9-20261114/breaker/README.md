# A second session's review of the draft 1.1.0-rc.9 (fix round)

Written 2026-11-14 (ICT) by a session that did not build the candidate and
did not make the first review. It checks one claim: after `npm install` of
the carried tarball, a plain `natalChart()` is within the suite's limits of
JPL Horizons at all 240 L1 vectors, with nothing opened, supplied or set.
Reviewed head: `a812067`. Nothing of the builder's was edited; this folder is
the only addition.

The claim holds. No blocker was found. The three blockers of the first
review are fixed. What is left is for the owner to decide, and is listed at
the end.

## The 240 L1 cases on the installed package

`fix-breaker-l1.sh` and `fix-breaker-l1.mjs`, written apart from the
builder's tools. `npm install <tarball>` into a new empty directory outside
the checkout, Node 22.22.2, no `ZODIACS*` variable, `NODE_OPTIONS` and
`NODE_PATH` unset, the network unshared while the cases ran, one new process
for each way of asking. Log: `fix-breaker-l1.log`; each case:
`fix-breaker-l1-<mode>.tsv`; summaries: `fix-breaker-l1-<mode>.json`.

- Tarball `artifacts/zodiacs-engine-1.1.0-rc.9.tgz`, SHA-256
  `f1801f0a35ef643a89c73ecd280e1e41142ae36e12c3690433536f9c3368396a`,
  2,703,974 bytes.
- Vectors `conformance/vectors/L1-positions.json`, SHA-256
  `853486bd33ddf2c136581803aec7df4b069c00f63678861537b2c0b86127366c`, the
  same file as on `main`. Expected values are JPL Horizons'. Each vector's
  limit is 1″ in longitude (on the circle) and 1″ in latitude. Their
  instants run from JD 2397195.69 to JD 2505964.81 (TT), all inside the pack.

| how it was asked | within the limits | largest difference | `chart.ephemeris` |
| --- | ---: | --- | --- |
| plain `natalChart()`, the first call of the process (`plain`) | 240 of 240 | 0.0126″ longitude (L1-POS-0002), 0.0010″ latitude (L1-POS-0222), both the Moon | `jpl-de440` on all 240 |
| plain `natalChart()` on the default UTC path (`plain-utc`) | 240 of 240 | 0.2934″ longitude, 0.0267″ latitude (L1-POS-0122, the Moon) | `jpl-de440` on all 240 |
| root `positions()` on the same UTC instants (`positions`) | 240 of 240 | the same | not reported by `positions()` |
| caller-opened: `withEphemeris(await openShippedDe440Pack(), ...)` | 240 of 240 | as `plain`, the same values | `jpl-de440` |
| caller-opened: `withEphemeris(shippedDe440Source(), ...)` | 240 of 240 | as `plain`, the same values | `jpl-de440` |
| after `setDefaultEphemeris("astronomy-engine")` (`fallback`) | 48 of 240 | 18.7745″ longitude (Neptune), 19.0281″ latitude (Saturn) | absent |
| `atob` deleted before the import (`no-atob`) | 48 of 240 | the same as `fallback` | absent |

Notes on the table:

- The `plain` row is the claim. The builder's 0.0127″ and 0.0011″ are the
  same two differences rounded up (0.012647″ and 0.001011″).
- `plain-utc` asks for the UTC instant that the engine's own ΔT puts at the
  vector's TT, rounded to a millisecond. It shows that the default clock
  path takes the same source. Its larger Moon difference is that rounding
  (the Moon moves about 0.55″ a second), not the ephemeris, and it is not an
  independent check of ΔT.
- The caller-opened path of the withdrawn rc.8 still exists and still gives
  240 of 240. It is no longer needed.
- On Node 20.19.0 and 24.21.0 the `plain` case file is byte for byte the one
  of Node 22.22.2 (`fix-breaker-l1-other-nodes.log`).

Attempts to break the claim, all of which failed:

- **The default is still astronomy-engine.** No: all 240 charts name
  `jpl-de440` and the pack's SHA-256, and `defaultEphemeris()` asked after
  the run reports `de440`, opened.
- **240 of 240 needs `withEphemeris` or a variable.** No. The plain run is
  the first thing its process does. No file of the installed `dist/`
  mentions `process.env`, `ZODIACS_`, `fetch(`, `XMLHttpRequest`, `node:fs`,
  `node:http` or `require(`, and the runs had no network.
- **The pack is not in the tarball.** It is. Python, with no code of the
  package, decodes the longest base64 literal of the installed `dist/`
  (`chunk-2ABJESXV.js`, 3,319,552 characters) to 2,489,664 bytes with
  SHA-256 `51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7`,
  the sealed pack's. One file of `dist/` holds it.

## When the pack cannot be used

`fix-breaker-fallback.sh`, `fix-breaker-fallback.mjs`,
`fix-breaker-probes.mjs`; log `fix-breaker-fallback.log`.

- **A damaged pack is never read.** With one base64 character of the
  installed pack text changed, the digest check refuses it
  (`De440Error: the pack's SHA-256 is not the one expected`), a plain call
  computes on astronomy-engine and does not throw, the chart has no
  `ephemeris` property, its receipt names `astronomy-engine` 2.1.19, and
  `defaultEphemeris().de440` reports `opened: false` with that reason.
- **No `atob`:** the same, with `ReferenceError: atob is not defined` as the
  reason.
- **Outside the pack's years:** a chart at 1700-06-01 or 2300-06-01 comes
  from astronomy-engine, with no `ephemeris` property and a receipt that
  names astronomy-engine. Day by day at the ends, the chart names
  `jpl-de440` from 1790-01-02T00:00 TT to 2209-12-31T00:00 TT and
  astronomy-engine at 1790-01-01T12:00 and 2209-12-31T12:00 and beyond. No
  call threw, and every speed was finite.
- So no position from a damaged or missing pack is returned, and no chart or
  receipt names an ephemeris it did not come from. What the fallback returns
  is 1.1.0-rc.7's position (48 of 240 at 1″ on these vectors).
- **What does not say so.** The sign of the fallback is the absence of a
  property. No flag is added to `chart.flags` (`["no-time"]` either way),
  and `positions()`, which returns bare rows, says nothing about its source.
  A caller that does not read `chart.ephemeris` or call `defaultEphemeris()`
  is not told. See the owner's decisions below.
- **The switch at the ends is a step.** Between one second before and one
  second after 1790-01-02T00:00 TT the longitude changes by -0.42″ (the
  Sun), -5.0″ (the true node), -9.2″ (the Moon) and -22.6″ (Pluto), where
  two seconds of motion is at most about 1.1″ (the Moon). A search across an
  end reads both ephemerides, as `docs/de440.md` says.
- **First call.** In the logged run the first `natalChart()` took 64.5 ms
  (it opens and hashes the pack) and the second 1.5 ms. One observation on
  one machine, not a benchmark.

## `calc()` beside the root

`fix-breaker-calc.mjs`, log `fix-breaker-calc.log`. On the installed
package, a default `calc()` and the root's `positions()` at the same instant
differ in longitude by at most 15.44″ (Neptune, 1851), 10.99″ (Uranus,
2000), 11.25″ (Neptune, 2024) and 29.19″ (Pluto, 2199-12-31), four
synthetic instants. `calc()`'s receipts name astronomy-engine. The last is
inside the 30″ that `calc()` quotes for Pluto, by 0.81″. After
`setDefaultEphemeris("astronomy-engine")` the two are equal to the bit
again. The builder states this as not done.

## Gates (rerun on the head `a812067`, Node 22.22.2)

`fix-breaker-gates.sh` inside `fix-breaker-ns.sh`; log
`fix-breaker-gates.log`. After a new `npm ci`, all 21 commands exit 0 and
leave no tracked file modified:

- typecheck; the suite (4,224 passed, 3 skipped, none failed); build;
  exports smoke; API check; package contents; pack dry run; the pack
  generator check.
- Archive binding: the carried tarball is byte-identical to a rebuild of the
  head. `--rebuild-all`: each of the 24 recorded archives (20 carried, 4
  superseded) rebuilds to its bytes.
- Conformance: 459 pass, 0 fail, 41 unsupported on the default (L1 240 of
  240); 267, 192, 41 with `--ephemeris astronomy-engine`; both match their
  committed results. Report check, the two atlas commands.
- **Offline CLI consumer** (the first review's blocker 3): both steps exit
  0. `prepare-consumer.mjs`: 29 checks passed, conformance 267 pass, 192
  fail, 41 unsupported, against the astronomy-engine results file.
- Packed consumer on the carried tarball: exit 0.

Not run here: Node 22.7.0 (not on this machine); the suite on Node 20.19.0
and 24.21.0 (the builder's logs were not rerun; only the L1 run was);
GitHub's checks, which were queued when read once and were not waited for.

## The older tests on the default source

The builder's log `../results/suite-default-source.log` has 99 failures in
21 files when the suite is not set to astronomy-engine. Their names and the
messages of one failure of each kind were read. Each kind read is one of:
a value pinned to astronomy-engine; a test that replaces astronomy-engine
and expects it to be called; or the root compared with a module that still
computes on astronomy-engine (`calc`, `birthWindow`, the vedic functions,
the time entry's frame). None read shows a defect in the default source.
Not every one of the 99 was read. One is worth the owner's eye as an
example of the last kind: `birthWindow` puts Neptune in house 10 at an
instant where a plain `natalChart()` now puts it in house 11.

## The first review's blockers

1. A plain call not on DE440: fixed (the table above), but for `calc()` and
   the other functions the builder lists.
2. `main` moved: `main` (`6825eb3`, 1.1.0-rc.7) is merged into the branch,
   GitHub reports the pull request `MERGEABLE`, and the candidate is cut
   again as 1.1.0-rc.9. No rc.8 archive or receipt is in the head's tree.
   The rc.8 archive's bytes remain in three commits of the branch's history
   (`7dec96f`, `3de6a27`, `0738bc9`), so a merge carries them into the
   history of `main`.
3. Offline CLI consumer on Node 22.22.2: passes.

## For the owner to decide

1. **Is the absence of `chart.ephemeris` a loud enough sign of the
   fallback?** Nothing wrong is labelled as DE440, but nothing is flagged
   either. A flag in `chart.flags` when the default is `de440` and the pack
   did not open would make it visible without a second call. It would change
   packed files, so it belongs to a next candidate.
2. **`docs/calc.md` (lines 24 to 25, 119, 270) and `docs/vedic.md` (line
   127) still say that a default `calc()` equals `positions()` and
   `siderealChart()` to the bit.** Inside the pack's years that is no longer
   so. `docs/` is not packed, so these can be corrected without a new
   candidate.
3. **`calc()`, `birthWindow` and the sky and vedic functions on
   astronomy-engine** while the root is on DE440: two public answers for one
   instant, up to 29.19″ apart in the four instants tried.
4. **The archive check was changed** to admit the withdrawal of rc.8
   (`scripts/verify-archive-binding.mjs`). The exception is narrow: one
   SHA-256, three named commits, the version barred for ever, the archive
   barred from the head. A branch cut new from `main` with only the rc.9
   commits would need no exception and would keep rc.8's bytes out of
   `main`'s history; that was outside the fix round's "same branch, no
   force-push".
5. **Size**, the caps and the budgets (documented in the README, the
   CHANGELOG and `docs/de440.md`; the figures match the two tarballs:
   2,703,974 against 335,403 bytes packed, 4,502,147 against 1,152,017
   unpacked, 98 against 94 files), **licensing**, and whether a change of
   every default position belongs in 1.1.0: unchanged from the builder's
   list.
6. The default source's speeds, true node and searches have no independent
   accuracy evidence of their own in this candidate; the 240 vectors test
   longitude and latitude of the Sun, the Moon and the planets.
