# M12 review checks

Overall local status: **FAIL**. Independent acceptance remains failing;
the implementation review does not override it.

Runtime: Node 22.22.2, linux, x64.

Reproduce from `apsides/` with `npm run check`. This is a review snapshot
of `scripts/check-local.mjs` output and its generated
`.generated/checks/report.json`. Every gate ran despite earlier failures.
The raw console log for this run was retained locally at
`.generated/m12-check.log`; generated files remain ignored.

| Command | Exit status | Signal | Launch error | Verdict |
| --- | ---: | --- | --- | --- |
| `npm run typecheck` | 0 | none | false | PASS |
| `npm run test` | 1 | none | false | FAIL |
| `npm run validate:references -- --check-evidence` | 1 | none | false | FAIL |
| `npm run check:isolation` | 0 | none | false | PASS |

The full Vitest run's summary was:

```text
Test Files  2 failed | 21 passed (23)
     Tests  9 failed | 791 passed (800)
```

The new `test/robustness.vitest.ts` and `test/cli-acceptance.vitest.ts`
each passed all 9 tests, both individually and in the full run. They
exercise mathematical curves, synthetic launcher behavior and existing
development inputs, not additional independent astronomical cases.

The failing files remain `test/planetary-reference.vitest.ts` and
`test/validation-evidence.vitest.ts`. They retain development Pluto distance
failures, held-out Mercury total-speed failures, the held-out Neptune timing
failure, and held-out Pluto search-completion and distance failures.
Assertions requiring Pluto event measurements fail when its search refuses;
missing measurements do not become passing checks. The cases, TT windows,
original limits and measurements are in [VALIDATION.md](../../../VALIDATION.md)
and the [M10 report](../m10/RESULTS.md).

The measured-report freshness assertion passed. The independent validation
command reproduced the committed report and then exited unsuccessfully
for the original acceptance failures. No source/reference integrity,
numerical-contract, CLI, example or orchestration test failed in this run.

| Input | SHA-256 |
| --- | --- |
| `package.json` | `330ded9dec8f937d919e3d5c87db6c77f014ec88198b99f3c3d8d3549df28f76` |
| `package-lock.json` | `f5b0d4bf2af8c58fafc1072fb1aa7bb51a08b05e4c7148833b3428efcf58eefe` |
| `scripts/check-local.mjs` | `a81b9bdb0c6cf164926d6445b10e0183e9e2a1ebc67de3b7a8f0e67515a99e0a` |
| `scripts/check-isolation.mjs` | `ccdae2d11d037373183be8f58634ad47f208f5b15e728ed736884d2225231dc5` |
| `../artifacts/zodiacs-engine-1.0.0.tgz` | `c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6` |

CLI help was corrected to name the Mercury, Neptune and Pluto validation
failures. `npm run validate:references -- --write-evidence` regenerated the
M10 report before these checks. Its only changed line is the implementation
source digest, now
`0214c2866f25529c4e7b7fc5b3a63e2b6046dc89a020cd4baf8d3d112141e4ce`.
All measured values, failures, source fixtures, budgets and numerical search
code remain unchanged. The regeneration command also exited unsuccessfully
for independent acceptance.

The isolation gate checks authored file limits and documentation, the
checkout's npm file selection, and the repository package-contents gate
in an ignored temporary copy using carried build output. It passed without
modifying the root package or building its `dist/`. It does not establish
a source rebuild, archive-history binding or all repository CI jobs.
[REVIEW.md](../../../REVIEW.md) records the reviewed contracts and remaining
scientific limitations.
