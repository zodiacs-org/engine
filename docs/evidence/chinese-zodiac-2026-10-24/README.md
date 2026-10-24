# Chinese zodiac Li Chun boundary: evidence (2026-10-24)

This directory backs the figures quoted for `tools/chinese-zodiac/` in its
README and in `docs/agents/CHINESE-ZODIAC.md`. It changes no engine code,
packed file, archive, vector or tolerance.

## What is measured

The tool computes Li Chun, the instant the Sun's apparent geocentric
ecliptic longitude of date reaches 315 degrees, with the solar series of
Meeus, *Astronomical Formulae for Calculators* (4th ed., 1988), chapter 18
(mean longitude, equation of centre, the five perturbation terms and the
apparent-place correction), and converts TT to UT with the Delta T
polynomials of Espenak and Meeus (NASA, 2006). That instant is compared
with two independent references.

| File | What it is |
| --- | --- |
| `fetch-references.mjs` | Fetches the references and writes `references.json`. Raw responses are not committed; their SHA-256 digests are. |
| `references.json` | Li Chun for 1900 to 2100 from JPL Horizons, and for 2019 to 2028 from the Hong Kong Observatory. |
| `measure.mjs` | Compares the tool with the references and writes `results.json`. |
| `results.json` | The figures below. |

**JPL Horizons.** Target 10 (Sun), geocentric, observer table, quantities 30
and 31 (TDB minus UT, and the apparent ecliptic longitude and latitude of
date), airless, extra precision, DE441; hourly from February 2 00:00 to
February 6 00:00 UT of each year, fetched 2026-10-24. The 315 degree
crossing is interpolated linearly between the two bracketing hourly
samples. Horizons reports UT1 before 1962 and UTC from 1962. In these
responses its Earth orientation data are measured to 2026-10-23 and
predicted to 2027-01-18; for the Li Chun of 2027 and later years, TDB minus
UT stays at 69.18 s (`earthOrientation` and `tdbMinusUtSeconds` in
`references.json`).

**Hong Kong Observatory.** The 24 solar terms XML file for each year
(`https://www.hko.gov.hk/en/gts/astronomy/data/files/24SolarTerms_YYYY.xml`),
Hong Kong Time (UTC+8), to the minute; the third entry, Li Chun. Of the
years 2000 to 2040 probed on 2026-10-24, the site served 2019 to 2028.

## Results

Computed minus reference, from `results.json`:

| Comparison | Years | Count | Largest difference | Mean |
| --- | --- | --- | --- | --- |
| Tool vs Horizons, UT | 1900 to 2100 | 201 | 292.0 s (1924) | 20.1 s |
| Tool vs Horizons, UT | 1900 to 2026 | 127 | 292.0 s (1924) | 51.7 s |
| Tool vs Horizons, UT (both use predicted Delta T) | 2027 to 2100 | 74 | 258.0 s (2043) | -34.2 s |
| Tool vs Horizons, TT (no Delta T in the comparison) | 1900 to 2100 | 201 | 323.7 s (2091) | 41.5 s |
| Tool vs HKO | 2019 to 2028 | 10 | 258.5 s (2020) | 25.3 s |
| Horizons vs HKO | 2019 to 2028 | 10 | 29.2 s (2025) | 7.5 s |

Horizons and HKO agree within HKO's rounding to the minute, so the two
references corroborate each other. In China Standard Time, Horizons puts
Li Chun on February 3 in 39 years, February 4 in 128 and February 5 in 34.

The tool reports any input within 600 s of its computed instant as
`depends`. With the largest UT difference of 292.0 s, a resolved result
can only come from an input at least 308 s from the Horizons instant. The
tests in `tools/chinese-zodiac/selftest.mjs` check this directly: for each
year, at every minute within 20 minutes of the Horizons instant, a resolved
result agrees with Horizons, and inputs further than 892 s from it (600 s
plus 292.0 s) are resolved. They also fail if `results.json` no longer
matches what `measure.mjs` computes from the committed code.

These figures are for this solar series over these years only. They are
not a statement about the engine's ephemeris, which this tool does not use.

## Reproduce

```sh
node docs/evidence/chinese-zodiac-2026-10-24/fetch-references.mjs   # network; rewrites references.json
node docs/evidence/chinese-zodiac-2026-10-24/measure.mjs            # offline; rewrites results.json
node --test tools/chinese-zodiac/selftest.mjs
```

A later fetch can differ from the committed one if Horizons updates its
Earth orientation data or HKO adds years; the digests in `references.json`
identify the responses used here.
