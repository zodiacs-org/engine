# Sample provenance and attribution

These are generated synthetic calendar examples, not birth records. The range,
body list and cadence are fixed in [config.json](config.json). The archive
identity is recorded in the database manifest and [../src/identity.mjs](../src/identity.mjs).
The database stores calculated tropical geocentric positions and derived event
records, with the conventions and limitations in [../README.md](../README.md).

Generated sample data is offered under CC BY 4.0. Attribute Zodiacs.org,
SkyDB sample database, and retain this file when redistributing the sample.
https://creativecommons.org/licenses/by/4.0/

Calculations use @zodiacs/engine by Zodiacs.org (MIT AND CC-BY-4.0), with
Astronomy Engine by Don Cross (MIT): https://github.com/cosinekitty/astronomy.
The engine uses the rounded Table S15 values and spline of F. R. Stephenson,
L. V. Morrison and C. Y. Hohenkerk, 2016, "Measurement of the Earth's rotation:
720 BC to AD 2015", Proc. R. Soc. A 472:20160404,
https://doi.org/10.1098/rspa.2016.0404 (CC BY 4.0). SkyDB stores calculated
positions, rather than copies of that table. The engine's full source notices
and licensing record are preserved alongside this attribution as NOTICE.txt
and ENGINE-LICENSING.txt. Their source is the installed pinned engine archive; dash typography in the
licensing transcript is normalized to ASCII.
These files describe upstream inputs and do not assert new permissions for them.

Run `node skydb/scripts/sample.mjs` from the repository root to generate or
verify/resume the fixed sample. Existing corrupt samples fail verification;
regenerate in a clean directory rather than overwriting published tiles.
[test/cli.node-test.mjs](../test/cli.node-test.mjs) regenerates in a temporary directory,
checks every persisted byte and compares each decoded sample to direct engine
calls. Reproduction is checked on the test runtime, not promised across all
platforms or compression library versions. These are agreement checks, not
independent astronomical accuracy evidence.
