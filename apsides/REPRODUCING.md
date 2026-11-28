# Reproducing apsides computations and checks

Run these commands from `apsides/` in this checkout. Use Node 22.22.2 to
match the recorded [M10 measurements](docs/evidence/m10/RESULTS.md) and
[M12 review checks](docs/evidence/m12/RESULTS.md). The executable selected by `node`
and the one npm finds on `PATH` should agree.

```sh
node --version
npm --version
npm ci --ignore-scripts --cache=.cache/npm
npm run build
```

The local lock pins tools and the relative dependency on the carried engine
archive. Installation downloads public npm dependencies unless they are
cached; it requires no credentials or root installation. The build emits
the local library and CLI in ignored `.generated/cli/`. It does not write
the repository's `dist/`. Source changes require another local build;
the launcher does not build automatically. This project has no publish step.

## Run and retain a result

The runnable library example selects Moon, Mercury and Earth over the
January 2000 TT development window and supplies an explicit lunar orb:

```sh
node examples/library.mjs > .generated/example.json
node examples/replay-motion.mjs < .generated/example.json
```

The equivalent combined CLI request, and the individual commands, are:

```sh
node bin/apsides.mjs lunar --from-jd-tt 2451544.5 --to-jd-tt 2451575.5
node bin/apsides.mjs planetary --body Earth --from-jd-tt 2451544.5 --to-jd-tt 2451575.5
node bin/apsides.mjs window --bodies Moon,Mercury,Earth --from-jd-tt 2451544.5 --to-jd-tt 2451575.5 --syzygy-orb-degrees 5 --max-evaluations 10000 > .generated/window.json
node examples/replay-motion.mjs < .generated/window.json
```

These inputs are synthetic usage examples within existing development
coverage. `test/examples.vitest.ts` checks the runnable example against
the library, and `test/cli.vitest.ts` checks the command adapter. They are
not new astronomical reference cases. The full commands and code preserve
the caller's window, selected bodies, orb and budget. Retain those inputs
alongside JSON if reproducing a different request. Keep generated results
under `.generated/`, where git ignores them.

Inspect both the process exit status and JSON `status`. Search refusals
contain no partial event list. Successful completion states only that the
numerical search completed on its grid; it does not override the failing
independent acceptance checks. [README.md](README.md) lists CLI statuses.

Preserve full-precision `instant.jdTt`, `target`, `refinement`, `motion`,
`diagnostics` and receipts when saving or transporting a result. Use an
event's returned TT JD for an exact partition boundary, with `(from,to]`
ownership. A formatted civil date is not an interchangeable boundary.
Endpoint time pins do not change the internal TT samples' time basis.

## Replay and provenance

Each motion probe includes a `receipt.request`. Pass that request unchanged
to the installed engine's `calc` API to recompute the probe. The replay
example compares motion measurements and their receipts on the current
installation. It does not rerun extremum discovery, validate phase
annotations, authenticate imported JSON or install a historical engine.
The complete search is reproduced by rerunning the saved request and
preserving its numerical policies, rather than by replaying an isolated
sample. See [DESIGN.md](DESIGN.md) for center and time conventions.

Keep the repository revision, `apsides/package-lock.json`, runtime version,
operating system and architecture with any reproducibility record. The
local-check report records the runtime plus SHA-256 identities of the
local manifest, lock, check scripts and carried engine archive. The M10
report additionally binds the search source, validation scripts and
reference manifests. A receipt's engine version alone is insufficient to
establish byte-identical code or floating-point behavior on another runtime.

## Run all local gates

```sh
npm run check
```

The runner executes each gate sequentially and continues after failures:

| Gate | What it checks |
| --- | --- |
| `npm run typecheck` | Local TypeScript contracts, including tests |
| `npm test` | Numerical, integration, CLI, example, fixture-integrity and independent acceptance assertions |
| `npm run validate:references -- --check-evidence` | Offline measured report reproduction and original acceptance limits |
| `npm run check:isolation` | Authored-file limits, npm selection and the repository package-contents gate using the carried build |

The overall exit status stays unsuccessful if any gate fails or cannot
launch. Failures are not whitelisted. The known Mercury, Neptune and Pluto
failures remain ordinary assertions in the full suite; [VALIDATION.md](VALIDATION.md)
states their windows and limitations. `test/local-checks.vitest.ts` enforces
that failure does not suppress later gates or become success.

Raw check metadata is written to `.generated/checks/report.json`. To update
the compact M11 evidence after reviewing a run, use:

```sh
npm run check -- --write-evidence
```

That command still exits unsuccessfully while any gate fails. It writes
`docs/evidence/m11/RESULTS.md` with the exact command statuses and input
digests. It does not rewrite the M10 measurements or any frozen reference.
The M12 check record is a review snapshot of the ordinary `npm run check`
output and its generated report; the command above specifically targets M11.

The isolation script uses `npm pack --dry-run --ignore-scripts` to inspect
the real checkout's file selection without making an archive or running
prepack. It then extracts the digest-checked carried archive into an ignored
temporary copy, overlays the current root metadata, and runs the root
`npm run package:contents` there. It cleans up that temporary copy. Passing
this check establishes package selection and budgets with carried output;
it does not establish a source rebuild, archive-history binding, or that
all repository CI jobs have run. The harness owns repository git operations.

## Verify frozen independent evidence offline

After installation, the ordinary tests and validation runner need no
network. Their compact fixtures are already committed:

```sh
npm test -- test/references.vitest.ts test/horizons-io.vitest.ts
npm run validate:references -- --check-evidence
```

The validation command rebuilds only the local ignored output and writes
full signed measurements to `.generated/validation/report.json`. It checks
both development and consumed held-out cases and the separate physical-center
spot comparisons. Independent failures keep the command unsuccessful even
when the committed report matches. Changing a numerical allowance is not
a way to regenerate passing evidence; future tuning needs a new registration
and fresh held-out cases.

Reference collection is separate from engine validation. Exact regeneration
of a compact fixture needs the original `.cache/horizons-v1/` raw responses;
a fresh clone can verify the compact bytes but cannot reconstruct absent
raw responses from their digests. With that cache, for example:

```sh
node scripts/collect-references.mjs --case dev-moon-2000 --offline --freeze
node scripts/collect-references.mjs --case held-moon-2024 --held-out --offline --freeze
node scripts/collect-references.mjs --physical-centers --held-out --offline --freeze
node scripts/collect-references.mjs --manifest
node scripts/collect-references.mjs --manifest --held-out
```

The freeze option creates a missing fixture or verifies identical bytes;
it refuses to replace a different existing identity. A missing cache fails
offline collection without making a request. Live collection is opt-in,
sequential and described in [references/PREREGISTRATION.md](references/PREREGISTRATION.md).
Later service output may differ. Do not substitute it under a frozen identity.
[SOURCES.md](SOURCES.md) retains target/center conventions and provenance;
[LICENSING.md](LICENSING.md) records the scope of attribution and licensing.
