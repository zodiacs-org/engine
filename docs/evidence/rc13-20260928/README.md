# rc.13 exactness and hygiene checkpoint

Base: merged engine `df01d2d7f4239d243209164c96f1073eb2f0fa04` (rc.12, PR #8).
This candidate answers three independent reviews of rc.11 and rc.12. It is a
review candidate: no npm publication, merge, push or deployment is performed
by these checks, and site adoption remains a separate checkpoint.

## What changed

- **Configured aspects are exact on binary64 inputs.** rc.11 formed the
  signed separation by floating-point subtraction folded outside ±180°, so
  decimal inputs could be rounded into or out of an inclusive orb. rc.13
  carries every sum as an exact nonoverlapping expansion (`src/exact.ts`),
  folds into (−180°, 180°] by exactly 360°, and decides the orb test, the
  closest rule, motion and ordering on exact values, with no tolerance. The
  reported orb is the exact orb rounded once, half to even. The policy's
  conventions record `arithmetic: "exact-binary64;reported-orb-rounded-half-even"`.
  The legacy helper behind `chart.aspects` and the receipt is unchanged.
- **Declination parallels** use the same arithmetic on the declination doubles.
- **The Sun defines the out-of-bounds bound** and is never flagged; other rows
  keep the strict rule against astronomy-engine's true obliquity of date.
- **One body-label rule** (`src/body-label.ts`) for both analyses.
- **Ephemeris failures are `RangeError`s**: speed samples are range-checked,
  and any string astronomy-engine throws is wrapped with the string as `cause`.
- **Progression wording and sources** (rc.12 follow-ups m1 and m3): UTC
  milliseconds without leap seconds, the central-difference speed and its step,
  degrees per tropical year of life, pre-birth mapping is not a converse
  progression, pages 84–85 and the PDF's SHA-256, and the book's 4.73 s
  precision budget (`../rc12-20260928/sources.md`).
- **Tooling** (m4): the packed-consumer type check uses `"types": []`, refuses
  a temporary directory with `node_modules` above it, and removes its
  directory; the rc.12 site-adoption check counts mismatches and cleans up.
  CI (now Node 20, 22 and 24, on full history) runs
  `scripts/verify-archive-binding.mjs`: no carried archive may change or
  disappear in history, and the archive for the current version must be
  reproduced byte for byte by a rebuild of the checkout.
- **Archive identity**: `artifacts/README.md` lists every carried archive and
  marks the first rc.11 archive (00bdae79, `13d637db…`) superseded and never
  released.
- **Content boundary**: `homepage` is the repository README; the TypeDoc
  footer and links are neutral; the changelog names the separate
  `@zodiacs/sdk` package neutrally; the README counts thirteen house systems.

## Validated candidate

- Archive: `artifacts/zodiacs-engine-0.1.1-rc.13.tgz`
- SHA-256: `12db9dce0f2c7551924b41caa5609f57bf31dfb9051a72901b94cdae29d3b840`
- 79,092 compressed bytes; 261,645 unpacked bytes; 30 packaged files.
- Two clean builds and packs produced identical bytes, and the CI binding
  script rebuilt identical bytes on Node 20.20.2, 21.7.3, 22.22.2 and 24.21.0.
  Earlier archives are unchanged.

| Check | Result | Evidence |
| --- | --- | --- |
| Full unit suite | 2,652 passed in 32 files on Node 22.22.2; the same on 20.20.2 and 24.21.0 | full-tests.log |
| Typecheck, build, exports, package contents, pack dry run | Pass; 30 files, 261,645 bytes unpacked, under the unchanged 300,000-byte gate | typecheck.log, build.log, exports.log, package-contents.log |
| New tests on the rc.12 sources | 23 fail, as intended (see below) | pre-fix-failures.log |
| Exact rational oracle in the unit suite (BigInt rationals) | 50,600 decimal-grid cases (16,270 wrapped), 1,497 multi-body, 3,640 declination: 0 mismatches | src/aspect-exactness.test.ts |
| The same harness on a verbatim copy of the rc.11 arithmetic | 20,754, 437 and 176 mismatches: membership, motion, ordering and orb rounding, wrapped and unwrapped | src/aspect-exactness.test.ts |
| Exact rational oracle in Python `fractions`, on the packed archive | 53,168 cases in 7 families: 0 mismatches | exact-oracle.py, exact-oracle.json |
| The same Python oracle on the carried rc.11 archive | 13,163 mismatches, including 3 of the 8 review reproductions | exact-oracle-rc11-control.json |
| The rc.11 review's own oracle, unchanged, on the packed dist | 39,179 cases: 0 exact-decision differences (rc.11: 1,695), orbs within 0.5 ulp of exact, 0 ordering differences | review-oracle-rc13.json |
| Exact sums (`src/exact.ts`) | 20,000 random sums correctly rounded with the exact sign; 4 of 4 mutants caught | src/exact.test.ts, mutation-checks.log |
| Sun bound, every solstice 1800–2200 from the package's own crossing solver | Sun beyond the true obliquity at 400 of 800, by up to 1.3526″; flagged at 0 (rc.12: 400); 8,800 other rows follow the strict rule | sun-bound-rc13.json, sun-bound-rc12-control.json |
| Independent rational time mapping | 204 cases, maximum difference 1 ms; published example 3,684 ms from print, within 5,000 ms; the book's own arithmetic reproduced within 42.4 ms, against 50 | progression-independent.py, progression-independent.json |
| Fresh packed consumer with TypeScript 5.9.3 and `"types": []` | Pass; temporary directory removed | packed-consumer.json |
| Exact rc.10 legacy comparison | 571 of 571 checks; 91 charts and receipt replays; negative control passes | compatibility.json |
| Site adapter parity against frozen site `f2bd0dd4` | 85 body cases, 1,020 rows, 321 mappings; 0 counted mismatches | site-adoption-parity.json |
| Every carried archive rebuilt from its source commit | rc.7 to rc.12, both rc.11 archives included: all byte-identical | archive-rebuilds.log |
| Archive history check | 6 committed archive paths each hold one byte sequence, rc.11's recorded breach excepted; a simulated repack of rc.10 and a shallow clone both fail it | archive-binding.log; below |

### Regressions fail before the fix

`pre-fix-failures.log` runs the six new or changed test files against the rc.12
versions of `src/configured-aspects.ts`, `src/declination.ts` and
`src/ephemeris.ts`, every other file as in rc.13. 23 tests fail: the
review-reproduction, decimal-grid and multi-body oracle tests; the declination
boundary and grid tests; the wrapped default-boundary case; both Sun solstices
and the strict-rule test; the progression `RangeError` test; the five
string-wrapping tests; and the eight label tests. The configured-aspect label
tests fail there only on the unified message; the declination ones fail
because those labels were accepted. The other 98 tests in those files pass
there: the existing tests, the rc.11-copy checks (which do not use the
implementation), the label-acceptance and Error pass-through tests, and the
book-arithmetic regression, which pins behaviour rc.12 already had.

### Archive binding

`scripts/verify-archive-binding.mjs` enforces "a version string names one byte
sequence" in two ways. Its history check would have caught rc.11: be3585b
changed the source and the archive together, which a rebuild comparison alone
accepts. Checked locally: the script passes on this tree on Node 20.20.2,
21.7.3, 22.22.2 and 24.21.0 (`archive-binding.log`), and on a checkout of
the source commit, which has no rc.13 archive yet, it passes the history check
and reports the skip. It fails, naming both digests, when a throwaway commit
repacks rc.10, and it fails on a shallow clone, which is why CI now checks out
with `fetch-depth: 0`. The rebuild comparison was also
exercised against the unmodified rc.12 tree, where it passed on all four Node
versions, and against a modified tree, where it listed each differing file.

### The three configured-aspect reproductions

| Reproduction | Exact binary value | rc.11 | rc.13 |
| --- | --- | --- | --- |
| A 188.86, B 98.86, square at zero orb | separation 90 + 2⁻⁴⁶ | no match | no match |
| Jupiter 6.3, Sun 314, semisquare orb 7.3 | orb exactly the double 7.3 | rejected | match at orb 7.3 |
| Mars 7.6999999999999895, Saturn 359.7, default policy | separation 8 + 2⁻⁵⁰ | conjunction at orb 8 | no match |

Under the exact binary semantics asked for, rc.11's answer to the first case
was already correct: 00bdae79 matched it only because its 360° normalization
rounded 450 + 2⁻⁴⁶ to 450. rc.13 keeps it unmatched, and matches it for any
orb of at least 2⁻⁴⁶ (a test checks the boundary).

## What is not established

- The programme's physical 0.01″ declination target remains unmet. An
  independent review measured a median of 1.71″ and a maximum of 20.76″
  against Swiss Ephemeris `FLG_EQUATORIAL`. rc.13 changes decisions made on
  computed declinations, not their physical accuracy.
- Exactness is arithmetic on the supplied doubles. Decimal intent is not
  promised: 0.1 and 1.1 are not a parallel at orb 1.
- The legacy helper (`chart.aspects`, `transits`, `synastry`, receipts) keeps
  its floating-point arithmetic and can differ from the configured API at
  roundoff scale.
- The CI binding step has run locally with the same script and Node versions,
  not yet on GitHub Actions. Determinism on Node 24 was checked with 24.21.0.
- Far-date evaluation was probed at a few years only (±150,000, ±200,000,
  −250,000, −270,000, 250,000 and 270,000, and six hours inside each end of the
  Date range). This does not map astronomy-engine's failure boundary.
- The rc.11 review's oracle script is not in this repository; only its summary
  and SHA-256 are recorded (`review-oracle-rc13.json`).
- The review is AI-assisted, not human approval. No Swiss Ephemeris code, data
  or output was used by these checks or committed.

## Reproduction

From the source checkout, with Node 20 or later:

```sh
npm ci
npm run typecheck && npm test && npm run build
npm run exports:smoke && npm run package:contents && npm run pack:dry-run
npm run archive:binding
TMPDIR=/a/directory/without/node_modules/above/it \
  node scripts/verify-packed-consumer.mjs "$PWD/artifacts/zodiacs-engine-0.1.1-rc.13.tgz"
node scripts/verify-rc10-compatibility.mjs --candidate "$PWD/artifacts/zodiacs-engine-0.1.1-rc.13.tgz" \
  --baseline /abs/rc10/package/dist/index.js --output /abs/compatibility.json
python3 docs/evidence/rc13-20260928/exact-oracle.py --entry /abs/rc13/package/dist/index.js \
  --archive "$PWD/artifacts/zodiacs-engine-0.1.1-rc.13.tgz" --output /abs/exact-oracle.json
python3 docs/evidence/rc13-20260928/progression-independent.py --entry /abs/rc13/package/dist/index.js \
  --archive "$PWD/artifacts/zodiacs-engine-0.1.1-rc.13.tgz" --output /abs/progression.json
node docs/evidence/rc13-20260928/sun-bound.mjs /abs/rc13/package/dist/index.js
node docs/evidence/rc12-20260928/verify-site-adoption.mjs /abs/site-checkout \
  "$PWD/artifacts/zodiacs-engine-0.1.1-rc.13.tgz" /abs/site-adoption-parity.json 0.1.1-rc.13
```

`/abs/rc10` and `/abs/rc13` are the extracted archives with astronomy-engine
2.1.19 installed beside them. For the negative control, run
`exact-oracle.py` on the extracted rc.11 archive with `--expect-mismatches`.
`validation.json` records the source hashes, package identity and results.
