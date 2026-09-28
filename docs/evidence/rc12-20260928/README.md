# rc.12 secondary progressions checkpoint

The standalone engine now exports `progressedInstant`, `progressedBodies`
and `PROGRESSION_DAYS_PER_YEAR`. This packages the site's existing elapsed-time
convention with the engine's validated DateInput boundary. It is a Phase 2
timing/package slice, not completion of Phase 2.

Base: merged engine `537ecaf4d5ebf8ffbf34dfd8b1d2082ab13ca0e2`.
The site remains on rc.10; this checkpoint includes a tested adapter handoff
for its next coherent adoption PR. No npm publication, merge or production
deployment is performed by these checks.

## Validated candidate

- Archive: `artifacts/zodiacs-engine-0.1.1-rc.12.tgz`
- SHA-256: `c4cf150fe8fb0b37f5769993c2e63275b2e5ef47b97d8a118aff3be00ebaf7f0`
- 73,398 compressed bytes; 245,844 unpacked bytes; 30 packaged files.
- All packaged files match the reviewed source/build. Two clean builds and
  packs produced identical bytes. Earlier archives remain unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Full unit suite | 2,612 passed in 28 files | full-tests.log |
| Typecheck, build, root exports, unchanged package-size gate | Pass | Authoring checks; build.log; package scripts |
| Fresh installed runtime and TypeScript consumer | Pass | packed-consumer.json |
| Exact rc.10 legacy comparison | 571 checks; 91 charts and receipt replays | compatibility.json |
| Independent rational time mapping | 201 cases; maximum difference 1 ms | progression-independent.json |
| Published date-mapping example | Within its separately documented roundoff allowance | sources.md; progression-independent.json |
| Proposed site adapter | 85 body cases, 1,020 rows and 321 additional mappings match exactly | site-adoption-parity.json |
| Separate source/API review | No blocking finding | Review below |
| Archive/source and repeat-pack binding | 30 files match; byte-identical second pack | validation.json; second-pack.json |

## Review and limits

Independent AI-assisted review checked DateInput normalization, signed
pre-birth mapping, nonmutation, clock behavior, unchanged literal JPL
constants, exports, consumer coverage and the documented exclusions. It found
no blocker. This is not formal human approval.

The new API retains the site's floating operation order and integer Date
clipping. An initial authoring test assumed exact one-day output at an epoch
boundary; it exposed the inherited 1 ms input/output clipping edge. The test
now states that behavior explicitly; the implementation was not changed to
hide it. The independent rational allowance was fixed at 1 ms.

The returned twelve rows include true lunar nodes. Speeds use ephemeris
degrees/day at the progressed instant, not a rate per day of life. The API
does not calculate progressed angles, houses, additional chart points or a
progression receipt. Reference coverage applies to the progressed instant.

The JPL component fixture uses the repository's existing ten literal
longitudes and unchanged 0.01-degree gate. The time oracle uses independent
exact rational arithmetic. Legacy and site-adapter comparisons use matched
operation order and the same pinned underlying ephemeris; they establish
finite compatibility, not independent physical accuracy. No physical
declination qualification, event-completeness claim or astrological
predictive-validity claim is added.

## Reproduction and handoff

Run the package's standard test, typecheck, build, export and package-content
scripts. Pack with `npm pack --ignore-scripts --pack-destination artifacts`,
then run `scripts/verify-packed-consumer.mjs` on that exact absolute archive
path. The independent checker accepts `--entry`, `--archive`, and `--output`;
the selected package metadata and dist files must match the archive. See
[sources.md](sources.md) and the checker for its declared premises.

The existing `scripts/verify-rc10-compatibility.mjs` compares the candidate
with an extracted rc.10 archive using identical installed pinned dependencies.
[site-adoption.md](site-adoption.md) documents the separately reproducible
adapter comparison, the proposed patch, and the required MCP, metadata,
documentation, receipt and production bundle gates for adoption. Source and
archive hashes are recorded in [validation.json](validation.json).
