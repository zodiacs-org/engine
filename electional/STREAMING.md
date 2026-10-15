# Streaming electional windows

`streamElectional(ruleSet, dependencies, options)` is an async iterator over
UTC chunks. It uses the same validated rule set and read-only evaluators as
`searchElectional`. The next chunk runs only when the consumer asks for another
frame. Returning from the iterator stops further work. Each pull gives timers
and sockets an opportunity to deliver cancellation before native work begins.

Frames are facts by default. A `chunk` frame contains the full rule audits,
known eligibility and exclusion sets, unresolved coverage, receipts, and
chronological window fragments. Each fragment gives every rule's state and
condition convention. It carries no score or rank. Failed and unresolved
required conditions remain explicit fragments; `eligible`, `excluded` and
`unresolvedRequired` describe the separate required-check intersection.
All fragments are ordered chronologically. Scoring controls are rejected.
The separate internal/pro module in [SCORING.md](SCORING.md) never participates
in streaming or consumer transports.

## Controls and work ownership

All work and chunk limits are explicit positive integers. `stepMs`,
`lookaheadMs`, `maxEvaluations`, `maxSkySamples`, optional `signal` and optional
`eclipse` settings retain their meanings from the bounded search. Additional
controls are:

| Control | Meaning |
| --- | --- |
| `chunkMs` | Maximum duration of each requested UTC chunk in milliseconds. The final chunk clips to the range end. |
| `maxChunks` | Maximum number of emitted chunks. Exhaustion leaves the suffix unattempted. |
| `maxChunkEvaluations` | Native request allowance for a chunk, capped by the remaining search-wide allowance. |
| `maxChunkSkySamples` | Sky sample allowance for a chunk, capped by the remaining search-wide allowance. |
| `maxFrameBytes` | Inclusive UTF-8 JSON byte limit for a chunk frame, with repeated receipts included. |

Native requests and sky samples accumulate across chunks, including failed
calls, padding, lookahead, repeated solar-day calculations and repeated natal
calculations. Allowances never restart for a new chunk. Exact exhaustion on
the final completed chunk is allowed. A required source refusal or any resource
refusal stops the stream; a missing or unresolved preference may continue with
unknown states. A too-small chunk allowance refuses rather than retrying with
fresh work. Choose durations suited to the source APIs and rule mix.

A chunk whose serialized frame exceeds `maxFrameBytes` is discarded. The
terminal summary reports its consumed work and leaves that chunk inside the
unemitted domain. Its receipts are not emitted. Adjust the controls and rerun
if that audit is needed. Large receipt arrays can cause this refusal even when
the number of window fragments is small. Terminal summaries have a fixed
metadata shape and are outside the chunk-frame byte allowance.

This bounds requested chunk duration, native requests, native sky samples and
emitted chunk size. It is not a wall-clock deadline or a strict heap limit:
native APIs can perform hidden work inside a request, and a result and its
serialization must exist before the byte limit can be checked. Synchronous
native calls cannot be interrupted mid-call. The iterator retains the current
chunk and a seam signature, without accumulating prior chunks or receipts.
Consumers that collect all frames take ownership of that additional memory.

## Lookahead, seams and continuation

Each requested chunk owns `[startMs, endMs)`. Events retain the existing
adapter's conversion from native `(start, end]` ownership. The stream introduces
no event solver, shifted event instant or clock conversion. Evaluators continue
to perform their own padding: Moon state scans include their boundary step,
Moon-not-void scans include the declared lookahead beyond each chunk end,
planetary hours retain their solar-day ownership, and eclipse/station avoidance
scans include their day margins. Padding and lookahead can extend beyond the
entire requested range; those calculations must also lie inside native
coverage. The chunk's audit preserves their source windows and clocks.

A fragment starting at a chunk seam reuses the preceding fragment's `windowId`
only when the two fragments touch, all declared rule states match, and their
unresolved diagnostics have the same meaning. The fragment then has
`continuedFromPrevious: true`. Different states and diagnostic details end that identity. Receipt equality
alone does not establish continuation. IDs are allocated in chronological
order within a stream and have no identity across separate searches.

Continuation identifies one logical constant-state window without building an
unbounded combined receipt array. Keep each fragment's native receipts and
local diagnostics when consuming a logical window. A receipt from a different
fragment does not cover that fragment's calculations. The scope remains
`source-evaluation-provenance;not-every-instant-in-window`.

Numerical brackets from separate source scans can differ. Each chunk retains
its own unknown neighborhood; the stream never intersects those neighborhoods
to manufacture greater precision. Insufficient Moon-not-void lookahead leaves
an unknown tail, not a passing window. A seam marker connects already known
adjacent states; it does not prove event completeness between samples.

## Terminal status and consumption

Every fully consumed iterator ends with an `end` frame. It gives the requested
window, cumulative native work, emitted chunk count, status and reason, and
`remaining`, the unemitted suffix or null. It holds no global receipt array;
receipts belong to emitted chunks. `complete` means all chunks resolved every
rule under their documented source scan assumptions. `unresolved` preserves
any unknown source coverage or optional refusal, even when later chunks are
complete. `refused` means a required source or resource stopped the operation.
The reason `chunk-refused` refers to the refusal records in the last chunk.

Earlier fragments are a provisional prefix until this terminal status arrives.
A refusal does not turn that prefix into a completed long-range search. A
cancelled operation can have a null remaining suffix when cancellation arrived
after the final chunk but before completion. If an unexpected source error
throws, or the consumer returns early, no terminal success is emitted.

For example, supply a validated synthetic configuration and explicit controls
from the application:

```js
import { loadSearchDependencies, streamElectional } from './build/index.js';

const dependencies = await loadSearchDependencies();
for await (const frame of streamElectional(ruleSet, dependencies, controls)) {
  if (frame.type === 'chunk') {
    for (const fragment of frame.fragments) {
      consume(fragment.windowId, fragment.continuedFromPrevious, fragment);
    }
  } else {
    finish(frame.status, frame.remaining, frame.reason);
  }
}
```

The built ESM smoke in [scripts/check-stream-esm.mjs](scripts/check-stream-esm.mjs)
executes the exported iterator with missing capabilities and verifies its
refused terminal status. It does not acquire astronomical references.

## Evidence

The [stream fixture](test/fixtures/stream-windows.json) derives fragment
ownership and continuation from the independent integer sets in the
[composition fixture](test/fixtures/composition-windows.json).
[test/stream.electional-check.ts](test/stream.electional-check.ts) checks those
sets across every chunk width on its declared domain, source audit transport,
shared and per-chunk limits, exact output boundaries, pull ownership and
cancellation. These are set and control-flow references, not ephemerides.

[test/stream-native.electional-check.ts](test/stream-native.electional-check.ts)
uses the existing events solver with independently specified linear Moon
motion and a polynomial station. It checks known integer membership against
the equations, preserves uncertain ingress brackets at seams, and exercises
void lookahead and avoidance margins outside a chunk. Native tests run only
when the read-only sibling events build is present. This project never builds
or modifies that sibling. The existing independent astronomical references
remain in [references/README.md](references/README.md); no engine-produced
reference instants have been added.

The full suite record is [docs/evidence/m11-tests.json](docs/evidence/m11-tests.json),
generated by [scripts/record-m11-tests.mjs](scripts/record-m11-tests.mjs). Its
scope is the checked integer domains, declared controls and receipt transport,
with no astronomical accuracy, exhaustive completeness, heap, throughput or
predictive claim.
