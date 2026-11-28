# Historical rc.10 preparation baseline review

The original handoff recorded a whole-installation digest but did not supply
its root `package-lock.json`. The documented bootstrap installed Astronomy
Engine outside the extracted package, which standalone qualification correctly
refused. Installing inside the package with `npm install` also produced a
different lockfile. Neither layout reproduced the original inventory.

This fix explicitly replaces that unavailable lockfile with the lockfile from
the archive's pinned repository commit
`f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`. The exact bytes are supplied here
as `package-lock.json`; their SHA-256 is
`0ab582863d9a06943350114d7ce9b8e65698d1bd8f73dc9f9465bb069e6218f9`.
The primary source is the [commit-pinned lockfile](https://raw.githubusercontent.com/zodiacs-org/engine/f5f33892a95cd0d6cd4a11a80e66f802b11bccfa/package-lock.json).
The historical archive remains untouched.

The original digest was
`4691195c5e4b192c45638378270514bc99ce3f2a168d82d5cd3c472b9aeef599`.
The preparation baseline digest is
`8108b3d05d2a29b89eda9ddb499e4c5600b48f188ed1e076270f1edbe30cdfee`.
Only the root lockfile differs: 89,083 bytes instead of 89,081. All other
39 inventoried files, including archive metadata, engine distribution,
Astronomy Engine and `node_modules/.package-lock.json`, match the original
file hashes and sizes exactly. Declared dependency resolution is identical.
This is a preparation identity replacement, not a new engine build or an
accuracy claim about current main.

The code review for this fix compared those inventories file by file.
`scripts/check-preparation.mjs` enforces that the replacement changes only the
root lockfile, checks both inventory digests, and checks every file and
dependency resolution in a fresh installation. Its output is retained in
`review.json`. It imports no engine code. The bootstrap checks the supplied
lock's hash, uses `npm ci --omit=dev --ignore-scripts --no-audit --no-fund`
inside the extracted package, then runs that inventory check. Development
dependencies described in the full source lock are not installed.

The qualification baseline constant and rc.10 example declaration now bind
to this explicitly documented identity. Full before/after inventory checks,
standalone dependency containment, symlink rejection, reference integrity,
plan binding, mutation refusals and numerical thresholds remain intact.
No mismatched installation is automatically accepted.

The original `reports/validation-20260928/` evidence is retained unchanged
and binds to the original digest. It is historical evidence, not evidence
of a fresh run with this preparation baseline. The fresh full run in
[`reports/validation-20261014/`](../reports/validation-20261014/VALIDATION.json)
uses the updated declaration and passes all 47 tests with zero skips.
Its preparation log records this replacement inventory check. Exact
reproduction steps are in the research package's README. Further runs must
use a fresh output directory.

To reproduce preparation from this research package with Node 22.22.2 and
its bundled npm 10.9.7 on `PATH` and Python 3.12 or newer:

```sh
runtime=$(mktemp -d /tmp/zodiacs-rc10-preparation.XXXXXX)
python3 ../accuracy-audit-20260928/bootstrap.py --runtime "$runtime"
node scripts/check-preparation.mjs --engine "$runtime/package/dist/index.js"
```

Omitting `--tarball` downloads the SHA-256-checked archive from its pinned
commit. To use the carried archive offline, add
`--tarball ../../artifacts/zodiacs-engine-0.1.1-rc.10.tgz`; npm still needs
registry access or cached locked dependency bytes. Preparation never builds
or imports the root engine and never changes its source, dependencies or
release archive.
