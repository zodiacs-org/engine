# Progression time sources and scope

Retrieved 2026-09-28. Revised for rc.13 the same day: the page range, the
PDF's digest, the time basis and the precision budget below. The rc.12 run's
recorded outputs are unchanged.

- [Juan Estadella, *Predictive Astrology*, third edition (2019)](https://juanestadella.com/Predictive_Astrology_Juan-Estadella_3rd_edition.pdf),
  PDF SHA-256 `bf52656b367ad7d1415a7b021a0a0db3a609bf35c7a40053ff0622e7a3325622`
  (3,662,908 bytes, 332 pages; printed page numbers equal PDF page numbers).
  Printed pages 84–85 work a 365.2422-day year example: birth 1889-04-16
  19:40:40 UT and target 1901-05-09 12:00 UT (p. 84), published progressed
  instant 1889-04-28 21:06:27 UT (p. 85). Page 86 continues with the converse
  mapping and the solar arc, and later pages with the planetary table,
  topocentric houses and mean node; all are outside this time gate. rc.12
  cited pp. 84–86 here and in `progression-independent.json`, counting that
  continuation; the recorded JSON is left as it was run.
- The manual calculation rounds intermediate values. Exact elapsed-time
  arithmetic on the stated inputs differs from the printed instant by 3.684
  seconds; the published-example threshold is 5 seconds.

This source establishes conventions and one worked numerical example, not
astrological predictive validity or a universal precision guarantee.

## Why the published example allows 5 seconds

The book's own arithmetic carries a stated precision, and its worst case is
4.73 seconds:

| Step in the book | Precision | Worst case | In this example |
| --- | --- | --- | --- |
| Birth time 19:40:40 written as 19.677 h | truncated to 0.001 h | 3.6 s | 2.8 s: 19.677 h is 19:40:37.2 |
| Radix fraction, event fraction and 4404.680125 / 365.2422 | six decimals of a day | 3 × 0.0432 s = 0.13 s | 0.0417 s: 12.059614483… written 12.059614 |
| Result 0.879489 d = 21:06:27.8496 | printed to whole seconds, truncated | < 1 s | 0.85 s |
| Total | | 4.73 s | 3.684 s |

The 5-second comparison in `src/progressions.test.ts` therefore tests the
book's result at the book's own precision. A tighter regression starts from
the birth time the book actually computed with: the exact mapping of
1889-04-16T19:40:37.200Z to 1901-05-09T12:00Z is 21:06:27.8913… UT, which this
pre-epoch Date truncates to 21:06:27.892. It floors to the printed 21:06:27 and
lies 42 ms from the book's unrounded 21:06:27.8496, the 42 ms being its
six-decimal quotient; the test requires 50 ms. Both figures were recomputed for
rc.13 with exact rational arithmetic and with the packed engine.

## Time basis and speed

The mapping counts elapsed UTC milliseconds as JavaScript `Date` does: 86,400,000
to the day, without leap seconds. It uses neither ephemeris (TT) days nor
civil calendar days. Position rows at the mapped instant take their speed from
the ordinary central difference over ±0.001 day (±0.25 day for the true
nodes), in degrees per day at that instant; numerically this is also degrees
of progressed motion per 365.2422-day year of life. A target
before birth maps backwards with the same signed formula; that is not a
converse progression, which the book works separately on pp. 85–86.

## Independent execution

`progression-independent.py` uses exact rational arithmetic with
`3652422 / 10000`, followed by integer truncation toward zero. Its separate
1 ms allowance measures floating-point implementation agreement. Cases cover
positive/negative epochs, dates before birth, leap days, Date-range edges,
offset strings and deterministic random pairs. Package metadata and every
`dist` file must match the supplied archive before and after invocation.
The SHA-256 bindings, fixtures and individual outcomes are recorded in its
JSON output. No source PDF or screenshots are redistributed.
