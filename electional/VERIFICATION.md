# Verification and remaining uncertainty

The current session's test evidence is
[m14-tests.json](docs/evidence/m14-tests.json), produced by
[scripts/record-m14-tests.mjs](scripts/record-m14-tests.mjs). It records the
runtime, passed and skipped tests, mandatory test groups, offline reference
checks, executed examples and input digests. Prior milestone records describe
their historical builds; the current facts-only contract is in
[CONDITIONS.md](CONDITIONS.md).

| Evidence | Independent basis | What it establishes |
| --- | --- | --- |
| Interval, composition and streaming fixtures | Hand-enumerated half-open integer sets and separately enumerated membership. | The checked set operations, per-rule states, chronological partitions, unknown coverage and seam ownership. |
| [Long-range fixture](test/fixtures/long-range.json) and [tests](test/long-range.electional-check.ts) | A hand-derived recurring set over the declared synthetic leap year, independent of any sky calculation. | Partition invariance for the tested daily, weekly, monthly and non-day-aligned chunk widths; exact suffix ownership on budget exhaustion/cancellation; constant receipt counts for a continuous condition. |
| [Built examples](docs/evidence/m14-examples.json) | Selecting every possible hour ruler implies the full set wherever the native solar-day source establishes hours. | Library/CLI monthly coverage, factual chronology, native receipt transport and complete terminal ownership under inherited source assumptions. This is a set identity, not astronomical accuracy. |
| [USNO hour reference test](test/hour-references.electional-check.ts) | Committed published rise/set minutes and hand-derived hour arithmetic. | The selected date, place and clock comparison documented in [HOURS.md](HOURS.md). This native comparison runs without events. |
| [Astronomical references](references/README.md) | Stored JPL Horizons series, independently reduced boundaries, and selected published NASA eclipse catalog rows. | Offline provenance, digests and reduction consistency always run. Native comparisons require the optional existing events build; skipped comparisons establish no agreement with the ephemeris. |
| CLI/HTTP transport tests and executable checks | The hand-derived composition fixture, local sockets and explicit process/worker lifecycle assertions. | Validation, receipt transport, factual defaults, bounded work/output, cancellation, deadlines, signals and backpressure for the declared cases. |
| Consumer graph checks | Actual esbuild input graphs of library, CLI, HTTP worker and executable examples. | No consumer entry imports the internal/pro numeric module. Default frames also have no score, contribution or rank fields. |
| [Isolation check](scripts/check-isolation.mjs) | npm's actual dry-run selection with lifecycle scripts disabled, and parent Vitest discovery without execution. | The workbench is excluded from the engine package and parent test collection; carryable local files satisfy the owner byte and Markdown punctuation rules. |

Reproduce from `electional/` using its declared Node runtime:

```sh
npm run typecheck
npm test -- --reporter=dot --reporter=json --outputFile=generated/m14-vitest.json
npm run build
node scripts/check-examples-esm.mjs
node scripts/check-cli-esm.mjs
node scripts/check-http-esm.mjs
npm run check:isolation > generated/m14-isolation.txt
node scripts/record-m14-tests.mjs
```

The recorder checks stored reference digests and reductions offline and writes
only gitignored `generated/` records. It hashes the current source, examples,
tests, documentation and references. Review those records before carrying
them into `docs/evidence/`; no raw sky output becomes an expected astronomical
value. Reference acquisition remains an explicit separate action through the
existing scripts; it is unnecessary for this verification run.

The optional events worktree remains read-only. Its absence is an explicit
capability refusal in search results and a skipped native comparison in the
test record. This session does not establish native agreement for those
skipped comparisons. It does not replace them with engine-derived golden
values or a second event solver.

Search completeness inherits each delegate's scan assumptions, finite steps,
numerical brackets and coverage. A completed source scan is not a proof that
every physical event was found. Stream chunks can retain different uncertain
neighborhoods at a seam. More lookahead or a smaller scan step cannot turn
an unverified calculation into independent accuracy evidence. The independent
astronomical references establish only their declared finite cases and spans,
with the clock/frame differences and acceptance thresholds in their guides.

House checks retain requested versus actual systems and polar fallbacks.
Rise/set and planetary hours can remain unresolved when no complete source
solar day is available. Eclipse checks use the explicit spherical model;
they do not establish local visibility or a detailed eclipse contact model.
Synastry uses only the declared synthetic natal chart and explicit aspect
policy. None of these calculations establishes predictive validity.

Native receipts record the source evaluation clocks and conventions. They
do not authenticate imported claims or certify every instant inside a window.
The iterator bounds declared work, chunk duration and serialized output; its
tests do not measure a strict heap limit, throughput or a wall-clock bound
inside synchronous source calls. The HTTP host can terminate its dedicated
worker, while library and CLI cancellation waits for a native checkpoint.

The internal/pro numeric module remains separate and requires explicit
`enabled: true`. Its arithmetic tests establish only sums and bounds of
user-declared preference weights. It preserves chronological facts, makes no
prediction and must never be enabled on the ChatGPT app or zodiacs.org.

Parent engine builds, package size budgets, archive binding and release gates
are outside this workbench verification record. The isolation check creates
no archive and invokes no parent build hook. This milestone changes only
`electional/`; it neither changes nor releases the engine package.
