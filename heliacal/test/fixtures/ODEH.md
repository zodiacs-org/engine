# Independent Odeh criterion checks

`odeh-reference.json` checks the lunar crescent criterion of Mohammad Sh.
Odeh, *New Criterion for Lunar Crescent Visibility*, Experimental Astronomy
18 (2004), pp. 39-64, published by Springer in 2006, DOI
[10.1007/s10686-005-9002-5](https://doi.org/10.1007/s10686-005-9002-5).
The [paper](https://astronomycenter.net/pdf/2006_cri.pdf) was fetched and the
relevant page images inspected on the retrieval date in the fixture.
Locators below use the paper's printed page numbers.

Section 5, p. 43, specifies airless topocentric arc of vision and
topocentric crescent width. Equation (2), p. 61, gives the cubic and
classifies its residual V with inclusive lower bounds. Width is in
arcminutes in this equation, unlike the arcseconds used in the observation
database's width column. The API accepts the width directly; the fixture
does not infer an unstated equation for deriving it from elongation.
Exact category boundaries belong to the more visible interval. Odeh's
categories preserve separate unaided, possible unaided, optical-only and
below-optical meanings. They must not be treated as Yallop's categories.

The worked geometry is invented. It exercises every category, nonround
decimal inputs, positive and negative lunar altitude, zero width and a
small positive width. A negative lunar altitude remains a valid arithmetic
input here; its category is not an assertion that the crescent is above
the observer's horizon. These cases have no ephemeris or observation
input. Their independent generator,
[`build-odeh-reference.py`](../../scripts/build-odeh-reference.py), evaluates
the cubic directly with Python Decimal arithmetic and checks identical
rounding at the precisions recorded in the fixture. It imports no engine
and reads no TypeScript output.

Selected widths from Table V, p. 43, provide a second check of the three
category boundary curves. Their published values were transcribed from
the rendered page. The test computes each curve from equation (2) and its
category offset, then compares it with the corresponding printed boundary.
It does not classify the rounded table value as though it were the exact
boundary. The source values are numerical facts from the criterion table;
none of the observation records in Table VI is copied.

Equation (1), p. 43, gives the evening best time as sunset plus four ninths
of the positive moonset lag. The fixtures apply it to invented instants,
including a result across a UTC year boundary and offsets that round in
either direction. Exact rational integer arithmetic provides the expected
nearest-millisecond results. The paper supplies no morning formula here;
these checks imply no morning search rule.

All comparison gates were written in the generator before running the
TypeScript comparison. The synthetic formula gate is an absolute numeric
gate; the Table V gate allows half its printed angular unit. Category
labels and rounded millisecond times are exact. The fixture records the
values and rationale, and `../odeh-reference.test.ts` enforces them.
These are implementation checks, with no historical date agreement,
calibration validation, sighting guarantee or weather uncertainty claim.

The original generator, synthetic inputs, metadata and tests use the
repository's MIT licence. This does not assert a licence to reproduce
the source article, its prose, figures, programs or observation database.
No Swiss Ephemeris material supplies an input or expected result.

To regenerate or check the fixture from the repository root:

```sh
python3 heliacal/scripts/build-odeh-reference.py
python3 heliacal/scripts/build-odeh-reference.py --check
```

Vitest reads the small committed fixture offline and downloads nothing.
