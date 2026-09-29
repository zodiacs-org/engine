# rc.11 continuation results

**Current candidate:** the merge review's decimal zero-orb repair, fresh gates
and current archive binding are recorded in
[decimal-orb-repair/README.md](decimal-orb-repair/README.md). The report below
and sibling JSON/review files describe the **original candidate**, not that
repair. Their original `13d637db…` archive remains recoverable from
[immutable commit 00bdae79](https://github.com/zodiacs-org/engine/blob/00bdae79a9256c2bba4294ed07af79e323c6cd66/artifacts/zodiacs-engine-0.1.1-rc.11.tgz).

Scratch paths in six files here were neutralized on 2026-09-28; nothing else in those files changed.

2026-09-28. Review candidate; not an npm publication, merge or deployment.
The immutable starting point is engine
`f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`, the merged rc.10 release.
The implementation continues Phase 2 A3 of the site's version 2 engine brief.

## Delivered

Explicit configurable longitude aspects, including named minor angles,
per-aspect and per-body limits, motion-specific limits, body selection and
immutable policy snapshots. Chart declinations include full-vector right
ascension/declination, parallel/contraparallel aspects, true-obliquity
out-of-bounds flags and evaluated clock metadata. Existing natal aspects,
transits, synastry and receipt conventions retain their prior behavior.

The new analyses are separate outputs. Neither is authenticated or covered by
the existing natal receipt. No provider or physical reduction was changed.

## Checks

| Check | Result | Evidence |
| --- | --- | --- |
| Baseline unit tests | 2,526 passed / 25 files | Recorded before edits in PLAN.md |
| Candidate unit tests | 2,586 passed / 27 files | validation.json; src/*test.ts |
| Typecheck, build, exports, package size | PASS | validation.json; existing npm scripts |
| Independent Python arithmetic | 2,395 passed | independent-final.json and independent-summary.md |
| Exact legacy comparison under matched call order | 571 passed; 91 chart cases; 91 rc.10 receipt replays | compatibility.json and compatibility-review.md |
| Fresh packed consumer, including TypeScript declarations | PASS | packed-consumer.json; scripts/verify-packed-consumer.mjs |
| Separate API review | No blocking finding | declination-api-review.md |
| Second clean build and pack | Byte-identical | validation.json |

The compatibility harness preserves its initial failed report and documents
two corrections: matching both workers' call order, and recording the exact
geographic pole's actual chart-acceptance/receipt-refusal behavior. It did
not introduce a numerical tolerance. Both packages exhibit the same tiny
call-history differences at two reference-edge dates; these are recorded as
diagnostics, not hidden or represented as new regressions. A changed-longitude
negative control is detected.

The arithmetic checker uses Python vector calculations and synthetic aspect
fixtures, with Node only invoking the package. It verifies the executed
JavaScript against the packed archive, before and after invocation. Its
2,395 cases comprise 388 rotations, 1,500 configured-aspect cases and 507
declination cases. This checks finite arithmetic, not the sky model.

## Packed candidate

- File: `artifacts/zodiacs-engine-0.1.1-rc.11.tgz`
- SHA-256: `13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e`
- 70,676 bytes compressed; 239,037 bytes unpacked; 30 files.
- Local runtime: Node 24.19.0; TypeScript 5.9.3.
- The existing 300,000-byte package gate passed unchanged.

The frozen rc.10 directory used for comparison was checked byte-for-byte
against all 30 files of the repository's rc.10 archive, SHA-256
`a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`.
The harness runs baseline and candidate in separate processes with identical
copies of the pinned runtime dependency. See its reproduction instructions
in `scripts/verify-rc10-compatibility.mjs` and the review record.

## Remaining gates and handoff

- This is a Phase 2 feature slice. It does not complete Phase 2 or establish
  a Swiss Ephemeris replacement. The brief's 0.01-arcsecond physical
  declination target remains unqualified by these tests.
- The published site continuation adopts **rc.10**, preserving the pending
  site PR #588 budget fix. It does not silently adopt this newer candidate.
  Engine PR #5's historical full Swiss record for its new points was not in
  the published handoff; the site continuation names that evidence gap.
- House positions with latitude, cusp speeds, remaining timing techniques,
  sidereal/Vedic work and the rest of Phase 2 still need their own checks.
  Osculating Lilith remains deferred to a suitable lunar provider.
- Version 2 schedules the DE440 precision provider in Phase 4. Its existing
  reduction, enclosure, licensing and distribution gates are not changed by
  this release. No new physical accuracy, superiority, completeness, or
  astrological predictive-validity claim is made here.
- First npm publication remains an operator action under the programme's
  publication decision. This work provides a reviewable source and package.
