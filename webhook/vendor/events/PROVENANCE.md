# Pinned event search source

These modules come from `events/src/` in `zodiacs-org/engine` at commit
`7d6fb88d03b3896ee1e5496ed99961015d291d3c`, inspected through local git objects.
The source repository licenses this code under the MIT License, copyright
2026 Zodiacs.org. The repository's [LICENSE](../../../LICENSE) supplies its
notice and terms. These modules are outside the engine's npm package.

`manifest.json` records each original file's SHA-256 and the SHA-256 of its
local copy. The synchronization script permits two transformations, each
reversible and recorded in that manifest:

- Literal relative imports of the parent `src/calc.js` change to reach that
  source from this folder.
- `search.ts` adds an optional fourth `executeQuery` argument,
  `executionContext?: EvaluationContext`. Its validated window and shared
  evaluation context take precedence over the executor's new window and
  context. The exact signature, window and context replacements are recorded
  as literal before/after text. Parser validation, clock agreement checks,
  query dispatch and result selection remain unchanged.

The extra argument is a trusted integration seam for the webhook adapter.
The adapter supplies a bounded context after intersecting the query and
subscription windows and adding the samples needed for boundary ownership.
That context owns the evaluation budget and cancellation signal. It also
lets receipt capture charge the same budget. Without it, executor behavior
is unchanged. This seam does not extend the user DSL or permit unvalidated
programmatic ASTs. The upstream executor only accepts day-aligned explicit
query ranges; the service needs arbitrary millisecond scan slices under its
fixed sampling grid. Reusing its dispatch with an explicit context avoids
duplicating those search implementations.

HTTP code, generated output, reference fixtures and upstream tests are
excluded. The parser, executor and void-of-course dependencies are included
so the executor's imports remain complete; inclusion does not imply that
the webhook service accepts every query kind.

From `webhook/`, run `node scripts/sync-events-vendor.mjs --check` to verify
the local bytes and reconstruct the original digests without git or network
access. Run the same script with `--sync` to reproduce this snapshot from the
pinned git objects. Synchronization does not fetch a branch, run git writes,
or update the pin. Updating the pin and manifest requires a reviewed source
change. The checks establish byte consistency with the recorded manifest;
they do not authenticate the repository or establish astronomical accuracy.

The parent engine remains a relative source dependency of this checkout.
The event source pin therefore identifies search logic, while calculation
receipts identify the engine and its conventions used for each result.
