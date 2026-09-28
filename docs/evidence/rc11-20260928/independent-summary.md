# Independent arithmetic review

The final packed candidate, installed in a clean consumer, passed 2,395 deterministic synthetic cases: 388 full-vector rotations, 1,500 configurable-aspect cases, and 507 declination cases. See [independent-final.json](independent-final.json) and [independent-plan.md](independent-plan.md) for the measured results and premises/tolerances fixed before comparison. The earlier [preliminary report](independent-preliminary.json) is preserved separately.

Tested archive: `zodiacs-engine-0.1.1-rc.11.tgz`, SHA-256 `13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e`. Every tested JavaScript file matched the archive, and the inventory remained unchanged during invocation. The current repository `dist` also matched the archive; no TypeScript source file had a modification timestamp newer than `dist/index.js`. That timestamp observation is not source-ancestry authentication.

The checker uses Python standard-library vector arithmetic and high-precision decimal arithmetic, not the TypeScript implementation's tests or expected values. For rotation it constructs an ecliptic unit vector and applies Rodrigues' rotation about the x-axis. For aspect motion it compares independently folded orbs after a small positive displacement, with the declared stationary threshold applied first. A thin Node bridge only invokes public exports.

## Findings

- No numerical mismatch was found in either run. Maximum Euclidean discrepancy between expected and reconstructed equatorial unit vectors was approximately `1.1331e-15`, below the fixed `5e-13` transformation gate. Maximum tested declination discrepancy was approximately `7.1054e-15` degrees.
- The risky 0/180-degree circular folds behaved correctly under both directions of relative motion. Exact nonstationary aspects separated; threshold equality, a zero threshold, and equal speeds followed the declared rules.
- Body caps tightened both pair members' allowances. Isolated cases verified luminary replacement, different motion allowances, inclusive boundaries, zero caps, pair reversal, and overlapping-definition tie order. The initial cap-combination family could mask luminary replacement; this was corrected before the final artifact check by adding isolated cases. There was no failing candidate result or tolerance change.
- Rotation included nonzero latitude, RA degree units and quadrants, longitude wraps, ecliptic and equatorial poles, near poles, and obliquity endpoints. Null RA followed the documented numerical-pole threshold.
- Parallel/contraparallel cases covered sign reversal, zero, poles, inclusive limits, the parallel tie rule, and node inclusion. The declination API has no per-body cap option; such caps were tested only for configurable longitude aspects.

## Reproduction

From the repository root, with Python 3 and Node available:

```sh
python docs/evidence/rc11-20260928/independent-check.py --entry /absolute/path/to/dist/index.js --archive /absolute/path/to/zodiacs-engine-0.1.1-rc.11.tgz --output /absolute/path/to/new-report.json
```

[independent-check.py](independent-check.py) constructs deterministic fixtures; [independent-bridge.mjs](independent-bridge.mjs) calls the selected build. The report records the fixture digest, script digests, selected entry, engine version, thresholds, failures, and every JavaScript file hash in the entry's directory before and after invocation. A changed build inventory fails the run. The optional `--archive` argument additionally records the tarball hash and requires all archived `dist/*.js` files to match the invoked directory. These hashes identify and compare tested bytes; they do not authenticate source ancestry or the archive publisher.

## Limits

These finite arithmetic checks establish neither absolute astronomical precision nor Swiss Ephemeris agreement. The physical provider, true-obliquity model, time conversion, chart wrapper, and natal-receipt coverage are outside this check. Input trust and interpretation validity are also outside it. RA is ill-conditioned near a pole, so vector discrepancy is the principal rotation metric. Out-of-bounds checks skip nonzero-latitude cases whose expected value is within `1e-10` degrees of the threshold; latitude-zero geometric limits are checked explicitly. This is not a global completeness proof.
