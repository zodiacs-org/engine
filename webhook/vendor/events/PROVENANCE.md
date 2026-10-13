# Pinned event search source

These modules come from `events/src/` in `zodiacs-org/engine` at commit
`7d6fb88d03b3896ee1e5496ed99961015d291d3c`, inspected through local git objects.
The source repository licenses this code under the MIT License, copyright
2026 Zodiacs.org. The repository's [LICENSE](../../../LICENSE) supplies its
notice and terms. These modules are outside the engine's npm package.

`manifest.json` records each original file's SHA-256 and the SHA-256 of its
local copy. The only transformation changes literal relative imports of the
parent `src/calc.js` to reach that source from this folder. The copied search
logic is unchanged. HTTP code, generated output, reference fixtures and
upstream tests are excluded.

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
