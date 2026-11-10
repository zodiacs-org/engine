# Companion licences and dependencies

The original code, tests, scripts and documentation in `minorbodies/` use the
repository's MIT licence, reproduced in [LICENSE](LICENSE). This is what the
private development package's `license: "MIT"` describes. It does not relicense
JPL responses, generated ephemeris data, imported engine data or installed
dependencies. [SOURCES.md](SOURCES.md) records the source material and
[NOTICE](NOTICE) supplies attribution.

This directory runs inside an engine source checkout. It does not contain a
standalone distributable engine or an npm release. The parent engine's
[LICENSING.md](../LICENSING.md), [LICENSE](../LICENSE) and [NOTICE](../NOTICE)
remain part of this installation's licensing record. Retain them when moving
the checkout or redistributing included engine files.

## JPL numerical material

Original Horizons API responses and their request manifests are retained in
`tests/fixtures/`. Bulk captures, coefficients and derived reference rows stay
in ignored `.cache/` and `generated/`; their digests and source identities are
recorded in the committed manifests and receipts under `data/`.

The project expressly authorizes JPL/NASA public numerical data as an input.
The actual retained responses state no additional redistribution restriction.
This is the existing intake basis recorded in [SOURCES.md](SOURCES.md#jpl-horizons-numerical-data),
not a new licence issued by this project. Keep their JPL attribution, original
response legends, request manifests and digest receipts with the numerical
material. Describe generated coefficients as a local approximation derived
from those captures, with the capture's solution identity and measured scope.

The [SSD publication FAQ](https://ssd.jpl.nasa.gov/faq.html#publish) asks users
to obtain permission for republishing site information and points to
[JPL's copyright notice](https://www.jpl.nasa.gov/caltechjpl-privacy-policies-and-important-notices/).
Those pages, reread on 2026-10-15, do not supply a blanket licence for numerical
API output. This record therefore assigns no SPDX licence to the retained
responses and makes no claim that all NASA, JPL or Caltech content is public
domain. It grants no rights in their images, logos, website articles or
unrelated third-party data. Nothing here implies their endorsement.

## Engine code and data reused at runtime

The companion imports the existing engine's frame reduction, time basis,
ordinary-body calculation, signs and crossing solver through relative source
paths. Configured-aspect examples call the engine's aspect implementation.
Their implementation is not copied into this directory. The parent's code
licence and provenance conditions still apply.

The engine as distributed declares `MIT AND CC-BY-4.0`. Its delta-T model
includes Table S15 values and equation constants from Stephenson, Morrison
and Hohenkerk, *Measurement of the Earth's rotation: 720 BC to AD 2015*
(2016), [doi:10.1098/rspa.2016.0404](https://doi.org/10.1098/rspa.2016.0404),
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The engine
rounds the retained values and reconstructs their spline. Reusing the time
basis carries that attribution obligation; an explicit TT call bypassing
civil-time conversion does not remove data from the installed import graph.
The inherited attribution is repeated in [NOTICE](NOTICE).

The parent licensing record also preserves unresolved terms. Its time basis
and delta-T model contain values derived from IERS EOP 20 C04, for which that
record found no redistribution terms. Engine calc's static imports reach
Vedic star values supplied by CDS and values from Reid and Brunthaler. The
parent record leaves the CDS values' commercial-use terms and the latter
values' terms unresolved. These questions are not resolved by the companion's
MIT declaration, even though minor-body calculations use the tropical frame.
See the parent's *IERS data* and *Timing and Vedic values* sections for the
sources actually read and the scope of each open question.

Other inherited notices include Astronomy Engine's MIT precession and
observer code, the NOVAS-derived nutation values, IERS leap seconds and
Bulletin A, and the published frame constants. Preserve the complete parent
NOTICE with engine code; the selected attributions here do not replace it.

## Installed dependencies

The following direct npm dependencies are pinned by [package-lock.json](package-lock.json).
Their installed metadata and licence files were read on 2026-10-15.

| Package | Use | Licence record |
| --- | --- | --- |
| `astronomy-engine@2.1.19` | Runtime dependency of ordinary engine calculations; resolved from the companion installation | MIT, Don Cross. The installed `esm/astronomy.js` preserves the complete notice; the [tagged upstream licence](https://github.com/cosinekitty/astronomy/blob/v2.1.19/LICENSE) was also read. |
| `typescript@5.9.3` | Type checking only | Apache-2.0 in installed `typescript/LICENSE.txt`; retain its `ThirdPartyNoticeText.txt` with the tool. |
| `vitest@2.1.9` | Test execution only | MIT for Vitest itself; installed `vitest/LICENSE.md` also records bundled BSD-3-Clause, ISC and MIT components. |
| `@types/node@22.19.19` | Type declarations only | MIT in installed `@types/node/LICENSE`. |

All are listed under `devDependencies` because this is a private source
development package. That label does not make Astronomy Engine optional at
runtime for delegated planetary calculations. Its version remains the engine's
existing pin; it is not the source of the fitted minor-body positions.

The independent reference environment is pinned in
[scripts/requirements-reference.txt](scripts/requirements-reference.txt):

| Component | Use | Licence record |
| --- | --- | --- |
| PyERFA 2.0.1.5 | Python interface used only for validation | BSD-3-Clause, PyERFA Developers; [tagged licence](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/LICENSE.rst). |
| ERFA 2.0.1 | Independent frame calculation through PyERFA | BSD-style licence, NumFOCUS Foundation, with SOFA heritage notice; [tagged licence](https://github.com/liberfa/erfa/blob/v2.0.1/LICENSE). This is a library derived from SOFA, rather than SOFA itself. |
| NumPy 2.2.6 | Arrays in the independent reference script | BSD-3-Clause for NumPy itself; [tagged licence](https://github.com/numpy/numpy/blob/v2.2.6/LICENSE.txt). |

These tagged licences and the installed PyERFA and NumPy licence files were
read on 2026-10-15. The reference script checks actual library versions.
None of these Python libraries is imported by the runtime evaluator, adapter
or CLI. No copy of their code or binary is committed here.

A NumPy wheel contains more than NumPy's own code. The installed Linux
wheel's `numpy-2.2.6.dist-info/LICENSE.txt` also identifies bundled OpenBLAS,
LAPACK and GCC runtime components, including the GCC Runtime Library
Exception. Its complete notices must travel with that wheel. Preserve each
downloaded npm package's and Python wheel's own licence and notice files when
preparing an offline installation. This table describes direct tools and the
reference stack; it is not a replacement for the notices of their transitive
or bundled dependencies. Do not relabel an offline dependency cache as MIT.

Swiss Ephemeris code, binaries, tables, fixtures and per-case output are
excluded from this companion. No AGPL or commercial ephemeris data is used.
