# Private solar-term prototype

`@zodiacs/solar-terms@0.0.0` composes a supplied engine's forward Sun-longitude searches into a Gregorian-year inventory of the twenty-four solar terms. It is private preparation; it is not exported from the carried engine package or published in a registry.

Pass an explicitly versioned engine to `createSolarTermScanner`, then call the returned `solarTermsForYear`. The output includes each term's tropical longitude, conventional label, jie/zhongqi class and UTC timestamp. The named window is open at January 1 and closed at the next January 1, matching the supplied crossing solver. Terms are sorted chronologically.

The aggregate sample budget applies across every search. A budget refusal, missing/additional term or non-distinct timestamp returns no partial term inventory. Invalid provider accounting, backward crossings or out-of-window timestamps throw. Input years, option data properties and the finite budget are validated before calling the longitude source.

Every computed result explicitly states `accuracy.status: "unvalidated"` and `completeness.status: "unproven"`. Solver arithmetic checks do not establish astronomical accuracy or the programme's independent event gate. Actual ephemeris execution, independent astronomical comparison, sources for calendar definitions, Node/packed typing and full repository gates are still required.

This prototype changes no core packed file, archive, package version or scientific tolerance. It does not implement Four Pillars, location-based hour conventions, day-boundary conventions or a public release.

The angle catalogue and alternating major/minor classification are checked against the [Hong Kong Observatory's solar-term explanation](https://www.hko.gov.hk/en/gts/time/24solarterms.htm). The [official GB/T 33661-2017 registry entry](https://std.samr.gov.cn/gb/search/gbDetailed?id=71F772D817FDD3A7E05397BE0A0AB82A) identifies the Chinese-calendar standard; its normative coordinate/time text remains unread. `docs/evidence/solar-terms-20261009/definition-review.json` records these limits. The carried engine uses Astronomy Engine, so another call to that dependency would not establish independent ephemeris accuracy.
