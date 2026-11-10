# Published London crescent examples

`yallop-published.json` retains selected numerical predictions from B. D.
Yallop, *A Method for Predicting the First Sighting of the New Crescent
Moon*, HM Nautical Almanac Office, NAO Technical Note No. 69 (1997), updated
April 1998, [Appendix A, printed p. 16, PDF page
17](https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf).
The source was fetched and read on the retrieval date recorded in the
fixture; its digest identifies that PDF. The page was inspected as an image
because its text encoding does not reliably extract the numbers. Tests
read the fixture offline, with no network requests.

These are the author's calculated London predictions, not observations.
The selected January and August rows give separate failed and passing
evenings, including both published unaided-eye categories. Source times
are in GMT and printed to whole minutes. The fixture represents them as
UTC instants; the test's time gate allows for that time-scale distinction
and for differing horizon conventions. Coordinates convert the source's
degrees and minutes to decimal degrees, with west longitude negative.
Height is unspecified by the source; this comparison explicitly assumes
sea level. It uses the library's upper-limb, standard-refraction horizon,
with no horizon dip. The source does not publish all original horizon or
ephemeris implementation settings in Appendix A.

The selected rows and gates were transcribed before running this
implementation against them. `../yallop-published.test.ts` enforces the
fixture's absolute time gates and exact category comparisons. The pure
best-time check applies Yallop equation (4.1), printed p. 4, to the rounded
source sunset and moonset values. Its gate allows for rounding of both
inputs and the printed answer. The end-to-end gate additionally allows
different engine and source horizon conventions; it is an acceptance gate
for these examples, not a bound on uncertainty in astronomical times or
observability. No tolerance was tuned to computed results.

The geometry-at-published-time test checks the category using engine
positions and the criterion. Library and subprocess CLI tests separately
compute horizons, select best times and recover the failed-to-passing
evening transitions. The output receipts establish which engine positions
were used; they do not certify Yallop's model or authenticate visibility.
No observed first sighting, universal forecast accuracy, morning extension,
Odeh calibration or planetary visibility is validated by these examples.

The publication explicitly reserves copyright and requires permission for
reproduction. This fixture retains only a small selection of numerical
facts for verification. It reproduces no prose, page image, substantial
table, program or observational database. Attribution remains with Yallop
and HM Nautical Almanac Office. The repository's MIT licence applies to
our original metadata and test code, not to the publication; no permission
to redistribute that publication is asserted. No Swiss Ephemeris material
is used.
