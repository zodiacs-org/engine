# Local verification and evidence

Run the calendar checks from `calendar/` with its locked dependencies:

```sh
npm run typecheck
npm test
npm run check:fixture
npm run check:isolation
```

The tests use Vitest and the independently implemented `ical.js` parser.
Their `.calendar-test.ts` suffix keeps them outside the parent engine's
default test selection. Golden fixtures are small, synthetic regression
records, with unchanged upstream engine output as their reference. They
are not independent astronomical accuracy evidence. Parser round trips
check the wire representation and receipt preservation.

## Long-range streaming evidence

[long-range.json](evidence/long-range.json) records a run of
[streaming-evidence.mjs](../scripts/streaming-evidence.mjs) on Node 22.22.2,
using the source identities and calendar source digest in that output.
Reproduce it with that exact runtime:

```sh
npm run check:evidence
```

The declared synthetic schedule covers `(2020-01-01T00:00:00.000Z,
2030-01-01T00:00:00.000Z]`, with Sun ingresses and Mercury stations sampled
at a six-hour step. The shared budget is 1,000,000 adapter evaluations and
the window buffer cap is eight records. These settings and the measured
results are enforced by
[long-range.calendar-test.ts](../test/long-range.calendar-test.ts), using
[the measurement helper](../test/support/long-range.ts) through the actual
schedule adapters and streaming serializer.

| UTC window duration | Completed windows | Adapter evaluations | Emitted and parsed events | Wire bytes | Largest wire chunk, bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| 7 days | 522 | 75,733 | 183 | 715,754 | 3,986 |
| 31 days | 118 | 75,733 | 183 | 715,754 | 3,986 |

Both runs found 120 Sun ingresses and 63 Mercury stations. Their ordered
record hashes and complete wire hashes are identical. The helper hashes
records and wire chunks incrementally, retains only the current and previous
event, and parses each VEVENT with `ical.js` as it is emitted. It never
collects the complete schedule or feed. Successful runs enforce the configured
per-window buffer cap. This demonstrates bounded iteration over this span
with these selections and settings. It measures neither total heap usage
nor latency and does not establish a physical completeness or accuracy bound.
Other event selections, steps and padding policies may require more work.
The engine's retained time-basis receipts describe its UTC/model treatment,
including dates beyond its observed Earth-rotation table.

Evidence generation writes only the compact report when explicitly invoked
with `node scripts/streaming-evidence.mjs --write`. Default and `--check`
compare against the committed report. No long-range feed or data array is
committed or saved. Changes to source identities, records or measured counts
require review before regenerating evidence. Similarly,
`node scripts/mixed-fixture.mjs --write` regenerates the small mixed golden;
default and `--check` verify it without replacing it.

## Source and package isolation

[verify-isolation.mjs](../scripts/verify-isolation.mjs), also exercised by
[isolation.calendar-test.ts](../test/isolation.calendar-test.ts), checks:

- Session changes stay under `calendar/`, including new files.
- Authored files are regular files below the required size limit, generated
  folders remain untracked, and documentation contains no em dash characters.
- The pinned events cache still matches its git objects and the unchanged
  parent engine sources/package metadata.
- TypeScript's resolved parent source inputs exclude this project. Parent
  source imports and reference directives do not reach calendar sources.
- An actual `npm pack --dry-run --ignore-scripts --json` in the parent selects
  no calendar file. The command creates no archive and skips parent prepack.

The script places npm's cache under the ignored calendar cache. It performs
no git writes, parent build, source change, archive packing or release action.
These source and selection checks do not replace the parent's compiled
import-graph, size, archive-binding or release gates. Parent `dist/` is absent
in this worktree, so `npm run package:contents` cannot pass without a build.
This session leaves that output untouched under the project's hard rule;
the parent workflows remain the authority for full engine checks.

Code and documentation here are MIT. Engine data retains the terms and
attribution in [LICENSING.md](../../LICENSING.md) and [NOTICE](../../NOTICE).
