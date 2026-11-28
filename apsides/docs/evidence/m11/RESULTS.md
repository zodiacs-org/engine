# M11 local checks

Overall status: **FAIL**.

Runtime: Node 22.22.2, linux, x64.

Reproduce from `apsides/` with `npm run check -- --write-evidence`.
Every gate runs even if an earlier gate fails. A nonzero overall status
remains a failure, including the independent acceptance failures in
[VALIDATION.md](../../../VALIDATION.md). Full test output is not copied here.

| Command | Exit status | Signal | Launch error | Verdict |
| --- | ---: | --- | --- | --- |
| `npm run typecheck` | 0 | none | false | PASS |
| `npm run test` | 1 | none | false | FAIL |
| `npm run validate:references -- --check-evidence` | 1 | none | false | FAIL |
| `npm run check:isolation` | 0 | none | false | PASS |

| Input | SHA-256 |
| --- | --- |
| `package.json` | `330ded9dec8f937d919e3d5c87db6c77f014ec88198b99f3c3d8d3549df28f76` |
| `package-lock.json` | `f5b0d4bf2af8c58fafc1072fb1aa7bb51a08b05e4c7148833b3428efcf58eefe` |
| `scripts/check-local.mjs` | `a81b9bdb0c6cf164926d6445b10e0183e9e2a1ebc67de3b7a8f0e67515a99e0a` |
| `scripts/check-isolation.mjs` | `ccdae2d11d037373183be8f58634ad47f208f5b15e728ed736884d2225231dc5` |
| `../artifacts/zodiacs-engine-1.0.0.tgz` | `c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6` |

The isolation gate checks npm file selection in the checkout and runs
the repository package-contents gate in an ignored copy using carried
build output. It does not rebuild the engine or check archive history.
The validation gate reproduces the M10 measured report using its frozen
reference corpus; its search source and numerical limits are unchanged.
