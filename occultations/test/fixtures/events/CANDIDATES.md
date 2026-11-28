# M7 candidate retention contract

Recorded before evaluating the M7 candidate search against these references.
Only the frozen development partition is used. The source transcriptions,
partitions and numerical contact/outline acceptance limits remain unchanged.

The candidate screen must retain the event in each development occultation
window. For every published local contact time and local closest-approach
time, a candidate for that target must contain the instant inside its
terrestrial-parallax envelope interval. All times for the same local event
must belong to one candidate interval. Containment is inclusive, without a
timing allowance; it tests the broad screening envelope, not contact accuracy.
Refused searches, absent candidates and omitted source instants fail.

The source windows and identities are:

- USNO, *The American Ephemeris and Nautical Almanac for the Year 1923*
  (published 1921), pages 766-767, the Boston Aldebaran worked example.
  The frozen `usno-ae1923-aldebaran-jan27-boston` window runs from
  1923-01-27 to 1923-01-29 on nominal UT1 and uses `sao:94027`.
  [Publication scan](https://archive.org/details/in.ernet.dli.2015.515803).
- NAOJ, *Local Prediction*, Moon/Saturn on 2024-05-31, the synthetic station
  at latitude -20 degrees, longitude 0 degrees and nominal height 0 metres.
  The frozen `naoj-contacts-202408` window runs from 2024-05-31 to
  2024-06-01 on nominal UT1.
  [Local prediction request](https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/occuly_p_en.cgi?eclid=202408&choice=1&choice0=1&anywhere=1&lat=-20&lon=0&hgt=0&lst=0&lsti=0&btn01=Go&dtm=99&dt=69).
- NAOJ's `naoj-map-202408` uses that same Saturn event and window.
  Its group must also be retained; it is not an additional occultation.
  No outline coordinate comparison is part of M7.
  [Map request](https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/occuly_p_en.cgi?eclid=202408&lst=0&btn02=Go&dtm=99&dt=69).

`occultation-references.test.ts` enforces the complete development source
register above and the containment rule. Its clock conversion uses the
engine's `timeBasis` to map the reference's nominal UT1 label onto the
adapter input clock. A `Z` used while parsing is only a calendar encoding;
it does not relabel historical mean time or NAOJ's printed UT as UTC.

The original source clocks, model differences, station qualifications,
licences and receipts are retained in `EVENTS.md`, `development.json` and
`sources.json`. M8 and later milestones must still apply every original
numerical gate to the quantity it names. A geocentric minimum is not a local
contact or local minimum, so its time is not compared to those source times.

Passing establishes retention of these registered positive events only.
It does not establish all-sky catalogue completeness, absence of extra
candidates, local contact accuracy, global visibility, or a general bound.
The held-out partition remains reserved for M12.
