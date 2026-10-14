# Independent Yallop criterion checks

`yallop-reference.json` contains synthetic worked calculations of the
criterion published by B. D. Yallop, *A Method for Predicting the First
Sighting of the New Crescent Moon*, HM Nautical Almanac Office, NAO
Technical Note No. 69 (1997), updated April 1998. The
[published note](https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf)
was fetched and the relevant page images read on the retrieval date in the
fixture. Printed page numbers are used below.

The checks implement the definitions in section 2, p. 1, the semidiameter
and crescent-width equations (3.8)-(3.10), p. 3, the q expression (6.1),
p. 11, and the category intervals in Table 5, p. 12. The best-time cases
apply equation (4.1), p. 4, to invented sunset and moonset times. These
locators and numerical definitions are facts about the published method;
the note's prose, program, observation table and calculated examples are
not redistributed. The original fixture inputs, arithmetic, metadata and
test code are under the repository's MIT licence. This does not assert a
licence to reproduce the source publication.

All geometry is synthetic. Angles are airless geocentric values: lunar
altitude, solar altitude and Sun-Moon separation in degrees, and lunar
horizontal parallax in arcminutes. The semidiameter correction uses the
geocentric lunar altitude and parallax converted to radians inside the sine.
The width uses geocentric separation and the corrected semidiameter. The
arc of vision remains the difference of geocentric altitudes. Negative
lunar altitude is included as an arithmetic case; its category is not a
claim that an observer can see through the horizon.

The independent generator is
[`build-yallop-reference.py`](../../scripts/build-yallop-reference.py).
It uses only Python's standard library, Decimal arithmetic, original
Taylor-series sine and cosine, and Machin's identity for pi. It evaluates
the cubic directly. It has no engine imports and reads no TypeScript
output. Before serializing values to JSON numbers, it checks that the
results round identically at both Decimal precisions recorded in the
fixture. The chosen samples exercise each category, positive and negative
semidiameter corrections, a zero correction at the horizon, and positive
width at a tiny elongation. Exact-boundary category cases assign equality
to the less visible interval, as Table 5 specifies.

Comparison tolerances were fixed in the generator before running the
TypeScript tests. The arithmetic gate is absolute; a separate relative
width gate detects cancellation near zero separation. Best-time results
use exact integer rational arithmetic and round the offset to the nearest
millisecond. The synthetic cases include an observation time across UTC
midnight and lags that round in either direction. The gates and covered
cases are enforced by `../yallop-reference.test.ts`. They measure formula
implementation only, with no ephemeris accuracy or sighting-performance
claim and no atmospheric or observer uncertainty estimate.

To regenerate or verify the committed fixture from the repository root:

```sh
python3 heliacal/scripts/build-yallop-reference.py
python3 heliacal/scripts/build-yallop-reference.py --check
```

Vitest reads the small committed fixture offline. No test downloads the
paper, and no Swiss Ephemeris input or output is used.
