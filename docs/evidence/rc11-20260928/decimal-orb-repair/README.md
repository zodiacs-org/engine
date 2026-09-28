# Decimal zero-orb review repair

This is the current unpublished rc.11 candidate's bounded review repair of
engine commit `00bdae79a9256c2bba4294ed07af79e323c6cd66`. It is not npm
publication, deployment, a claim of human review, or completion of Phase 2/A3.

## Defect and correction

An exact custom angle of 0.1 degrees at zero orb returned no match: adding
360 during normalization changed a direct difference of `0.1` to
`0.10000000000002274`. The same avoidable error affected 360/7 and 179.9
degrees, small separations, and some inclusive orb boundaries.

Validated longitudes already lie in [0,360). The configured API now
subtracts them directly and folds only outside [-180,180]. Matching and
motion use this same signed separation. No epsilon, tolerance widening,
or changes to the historical aspect helper were introduced.

Regression fixtures check decimal exact angles at zero orb in both row
orders, equal and unequal speeds, immediately outside values, inclusive
decimal boundaries, tiny nonzero separation, and wrap/motion consistency.
The default square boundary includes 97 degrees and rejects
97.00000000000001 degrees without rounding the latter into eligibility.
Existing corner fixtures continue to check exact 0 and 180 degrees.

This does not promise decimal arithmetic for arbitrary binary floating-point
inputs: for example, the wrapped subtraction `360 - 359.9` still evaluates
to `0.10000000000002274`. The fix removes unnecessary cancellation.

## Compatibility scope

Historical natal, transit, synastry and receipt calculations are unchanged.
The separate configured API can differ from the historical helper in
last-bit orb values, or matches/motion at floating-point boundaries. For
example, at J2000 the default Moon–Saturn opposition orb is
`2.9277646085640185` instead of `2.9277646085640754` degrees.

The retained default-policy corpus compares identities, aspect types,
applying flags and order exactly with the historical helper. Configured
orbs are checked against direct bounded geometry using exact assertions,
not a widened numeric tolerance. Exact compatibility of the existing APIs
is checked separately against the immutable rc.10 package.

## Fresh checks

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused aspect/declination tests | 67 passed | focused.log |
| Full candidate tests | 2,593 passed in 27 files | full-tests.log |
| Typecheck, build, exports, package contents | Pass | corresponding logs |
| Independent arithmetic harness, unchanged | 2,395 passed | independent.json |
| Exact rc.10 comparison | 571 passed; 91 chart cases and receipt replays | compatibility.json |
| Clean packed consumer and TypeScript declarations | Pass | packed-consumer.json |
| Second clean build/pack and source/archive binding | Byte-identical | validation.json |

The independent arithmetic harness retains its previously defined
tolerances; it has not been modified for this repair. Those checks are
distinct from the new exact zero-orb regressions. Same-provider and
synthetic vector checks cannot establish the programme's 0.01 arcsecond
physical declination target, which remains open. Current natal receipts
still exclude the new configured-aspect and declination analyses.

Archive: `artifacts/zodiacs-engine-0.1.1-rc.11.tgz`, SHA-256
`d88e0ff8db91e1183789763ad32feb2dac61716e35ad7676a943f7a1ad377862`.
Size: 70,989 bytes compressed, 240,055 bytes unpacked, 30 files.
Runtime: Node 24.19.0; TypeScript 5.9.3. The existing 300,000-byte package
gate passed unchanged. All 30 rc.10 archive files were compared with the
extracted baseline before the compatibility run; the rc.10 archive SHA-256
remains `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`.

## Reproduction

From the source checkout, run the following. `$BASELINE` must point to the
extracted rc.10 package's `dist/index.js`; install its exact pinned
astronomy-engine 2.1.19 dependency before running the compatibility script.
`$CANDIDATE` is the absolute path of the packed rc.11 archive.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npx vitest run src/configured-aspects.test.ts src/declination.test.ts
npm test
npm run typecheck
npm run build
npm run exports:smoke
npm run package:contents
npm pack --ignore-scripts --json --pack-destination artifacts
node scripts/verify-packed-consumer.mjs "$CANDIDATE"
node scripts/verify-rc10-compatibility.mjs --candidate "$CANDIDATE" --baseline "$BASELINE" --output /absolute/path/compatibility.json
python docs/evidence/rc11-20260928/independent-check.py --entry /absolute/path/dist/index.js --archive "$CANDIDATE" --output /absolute/path/independent.json
git diff --check
```

A separate second `npm run build` and `npm pack --ignore-scripts` were
compared byte-for-byte with the current archive. `validation.json` records
the current source hashes and bindings; sibling reports above this
directory remain historical evidence for the original candidate, whose
archive is available at
[immutable commit 00bdae79](https://github.com/zodiacs-org/engine/blob/00bdae79a9256c2bba4294ed07af79e323c6cd66/artifacts/zodiacs-engine-0.1.1-rc.11.tgz).
