# Independent engine verification and research handoff

Completed parallel work for `zodiacs-org/engine`, frozen at `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa` (`0.1.1-rc.10`). Everything is contained in this research directory. No production source, dependency manifest, release gate, site integration, or published archive is changed.

## What is ready

| Deliverable | Recorded result | What it establishes |
|---|---|---|
| JPL planetary reference toolkit | 210/210 pass the predeclared 60 arcsecond diagnostic; 168/210 exceed the aspirational 1 arcsecond target | Reproducible finite differences across 10 bodies and 21 epochs, 1801–2198; coordinate and target conventions differ |
| Independent ERFA angle geometry | 1,300/1,300 gated comparisons pass across 685 inputs; 70 additional polar ASC comparisons are exploratory | Bounded Ascendant/Midheaven checks under a specified synthetic clock and latitude-specific thresholds |
| JPL event references | 2/2 pass the predeclared 10 second diagnostic; residuals −2.9615 and −3.8001 seconds | Two October 2026 lunations only; no universal two-second accuracy or search-completeness claim |
| Executable API reproductions | Five controls pass; two observations documented | Saturn return custom-clock contract gap; Moon illumination approximation difference |
| Uncertainty specification and finite preview | 25 contract checks; 24 acceptance scenarios; real preview evaluates 3,602 charts | Executable sampled prototype plus explicit future requirements for normalization and certification |
| Historical civil-time seed | Five bounded legal rules, eight transition fixtures, 13 tests | Source-backed legal-rule arithmetic with explicit limits on geographic and historical applicability |

See [HANDOFF-OPUS.md](HANDOFF-OPUS.md) for the next build, [REVIEW.md](REVIEW.md) for independent review, and [results/rc10/summary.json](results/rc10/summary.json) for the complete recorded run. Individual reports retain thresholds, conventions, hashes, and limitations. Passing the runner does not mean every documented observation is resolved.

## Run the frozen baseline

Requires Node.js and npm, plus Python 3.12 or newer for the safe archive bootstrap. Recorded runtime: Node 24.19.0, Python 3.12. No Python packages are required for the normal offline diagnostics. Installing the pinned Astronomy Engine runtime dependency requires npm network access once.

From this directory in a checkout of the engine repository:

```sh
python3 bootstrap.py --tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz --runtime .runtime
node run-all.mjs --engine .runtime/package/dist/index.js --tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz --out run-output/baseline-001 --expect-baseline
```

For a standalone copy, supply an absolute archive path, or omit `--tarball` from the bootstrap to download the commit-pinned archive. The bootstrap refuses nonempty runtime directories and checks the archive SHA-256 before extraction. The runner requires a fresh or empty output directory, records distribution and dependency file hashes, and writes reports there. It runs offline against the committed reference responses; it does not modify the engine or the recorded baseline reports.

The complete runner executes ten tasks: position-reference integrity controls, positions, geometry, event-reference integrity controls, events, focused reproductions, uncertainty contract, uncertainty preview, historical data, and historical controls. A failed task makes the process exit nonzero. No production CI integration is installed.

## Compare tomorrow's candidate

Build that candidate through its existing workflow, then use a fresh output directory:

```sh
node run-all.mjs --engine /absolute/path/to/candidate/dist/index.js --out run-output/candidate-001
```

Optionally pass `--tarball PATH` to record its archive hash and `--source-ref FULL_40_CHARACTER_SHA` to supply its claimed ancestry. Do not use `--expect-baseline` for a changed candidate. Matching version labels alone never establish baseline identity. Unknown candidate ancestry is recorded as `null` in the uncertainty request. A supplied source ref is a caller assertion, not a verified correspondence between source and build.

## Research boundaries

- The numerical suite uses independent JPL and ERFA references. The Moon illumination reproduction explicitly uses the same underlying Astronomy Engine dependency and is an approximation comparison, not independent truth.
- Astronomy and astrological validity are separate questions. These artifacts evaluate numerical behavior and software contracts; they do not validate astrological predictive claims or establish a new discovery.
- The uncertainty preview evaluates finite samples. `complete: false` and `observed-constant` must not be presented as proof of invariance or as probabilities. Historical normalization and interval certification remain specified future work.
- Historical source clauses support bounded legal rules. They do not prove that a specific city, hospital, or person observed a particular clock. Early GMT labels are not physical UTC.
- No Swiss Ephemeris code or generated Swiss fixtures are included. This is a foundation for evaluating an alternative, not a compatibility certification. See [NOTICE.md](NOTICE.md).

Reference refreshes are deliberate development operations, separate from the offline runner. See [toolkit/README.md](toolkit/README.md), [geometry/README.md](geometry/README.md), and [events/README.md](events/README.md). Do not adjust thresholds after looking at a candidate just to make it pass.
