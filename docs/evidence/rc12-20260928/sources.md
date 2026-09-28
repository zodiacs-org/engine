# Progression time sources and scope

Retrieved 2026-09-28.

- [Juan Estadella, *Predictive Astrology*, third edition (2019)](https://juanestadella.com/Predictive_Astrology_Juan-Estadella_3rd_edition.pdf),
  printed pages 84–86, works a 365.2422-day year example: birth
  1889-04-16 19:40:40 UT, target 1901-05-09 12:00 UT, published progressed
  instant 1889-04-28 21:06:27 UT. The manual calculation rounds intermediate
  values. Exact elapsed-time arithmetic differs by about 3.684 seconds;
  the published-example threshold is 5 seconds. Its planetary table,
  topocentric houses and mean node are outside this time gate.

This source establishes conventions and one worked numerical example, not
astrological predictive validity or a universal precision guarantee.

## Independent execution

`progression-independent.py` uses exact rational arithmetic with
`3652422 / 10000`, followed by integer truncation toward zero. Its separate
1 ms allowance measures floating-point implementation agreement. Cases cover
positive/negative epochs, dates before birth, leap days, Date-range edges,
offset strings and deterministic random pairs. Package metadata and every
`dist` file must match the supplied archive before and after invocation.
The SHA-256 bindings, fixtures and individual outcomes are recorded in its
JSON output. No source PDF or screenshots are redistributed.
