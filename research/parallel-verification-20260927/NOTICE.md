# Research provenance and third-party notices

This subtree contains original verification scripts, research specifications,
finite fixtures, short source excerpts and saved measurement records. It is
separate from the production package and runtime. It includes no Swiss
Ephemeris source, binary, data file or Swiss-generated expected-value fixture.
Mentions of Swiss describe the project's comparison goal, not an endorsement.

Third-party material retains its own terms. This notice does not relicense JPL,
ERFA, SOFA, government publications or the engine's dependencies. Retain the
engine repository's existing LICENSE, LICENSING and NOTICE files and the notices
supplied by any dependencies installed to rerun this work.

## Numerical references

- **JPL Horizons, NASA/JPL:** `toolkit/` and `events/` retain acquisition
  parameters, responses, digests and retrieval metadata for public ephemeris
  queries. References were acquired independently of candidate output. Consult
  the [Horizons API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html)
  and [manual](https://ssd.jpl.nasa.gov/horizons/manual.html) for conventions and
  service/data limitations. These references are not an assertion that every
  reference uncertainty is bounded by a runner's numerical threshold.
- **ERFA/PyERFA:** `geometry/` uses independently generated output from pinned
  PyERFA 2.0.1.5 and ERFA 2.0.1, original geometry code, and a small set of
  upstream numerical control values. ERFA derives from SOFA; this kit uses ERFA
  and does not claim to be SOFA. Relevant primary code includes
  [gst06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/gst06a.c),
  [obl06](https://github.com/liberfa/erfa/blob/v2.0.1/src/obl06.c),
  [nut06a](https://github.com/liberfa/erfa/blob/v2.0.1/src/nut06a.c), and
  [PyERFA controls](https://github.com/liberfa/pyerfa/blob/v2.0.1.5/erfa/tests/test_ufunc.py).
  Keep the applicable upstream notices when redistributing upstream code.
  Neither IAU, SOFA, ERFA nor JPL endorses this kit.
- **Astronomy Engine:** `reproductions/` compares Moon illumination through a
  separate geometric operation in the engine's existing 2.1.19 dependency.
  That comparison is explicitly not an independent ephemeris reference.
  Bootstrap installs the dependency in an isolated runtime; its own license and
  notices remain applicable. No installed dependency tree belongs in this
  research delivery.

## Historical records

`historical-time/rules.json` identifies six primary statutory sources from the
U.S. Government Publishing Office and the UK's legislation.gov.uk, with precise
locators, short excerpts and retrieval intervals. Full source documents are not
redistributed here. Agent-authored interpretations and arithmetic fixtures are
conditional research records, not authoritative legal advice, a geographical
time atlas or independently verified birth times. No human historical review
has occurred; all records remain ineligible for production use without further
review and applicability evidence. No proprietary astrology time atlas was
used.

## Identity and review limits

The frozen baseline is `@zodiacs/engine@0.1.1-rc.10`, source reference
`f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`, packed artifact SHA-256
`a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`.
The enclosing runner records distribution and dependency digests. A version
string or caller-supplied source label alone is not trusted artifact identity.

Reviews and measurements in this delivery were performed by AI agents. Tests,
independent numerical implementations and primary-source checks are recorded
with their limits; they are not a substitute for human scientific, historical
or legal review. Passing finite cases does not establish universal precision,
search completeness, calibration of probabilities or astrology's predictive
validity. No source/fixture licensing clearance beyond the recorded provenance
is claimed.
