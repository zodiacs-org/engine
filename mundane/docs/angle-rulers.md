# Angle rulers and essential dignity conventions

`analyzeAngleRulers` selects each angle's traditional domicile ruler and
evaluates that planet's essential dignities at its own chart position.
It returns the conditions of the rulers, labelled as traditional conventions,
not predictions. These conditions make no claim about events in a place.

The implementation reuses the engine's `sectOf`, `dignityRulersAt`, and
`essentialDignities`. It carries no additional domicile, exaltation,
triplicity, term, or face tables. The engine's source audit and transcriptions
are in [techniques.md](../../docs/techniques.md#essential-dignities),
[dignities.ts](../../src/techniques/dignities.ts), and
[dignities.test.ts](../../src/techniques/dignities.test.ts).

The inherited conventions are attributed there to:

- Ptolemy, *Tetrabiblos*, I.17, I.19, and I.20, translation by F. E. Robbins
  (Loeb Classical Library, 1940): domiciles, exaltations, and Egyptian terms.
- Dorotheus of Sidon, *Carmen Astrologicum*, I.1 and I.2, edition and
  translation by David Pingree (Teubner, 1976): domiciles, exaltations, and
  the Dorothean triplicity lords.
- al-Biruni, *The Book of Instruction in the Elements of the Art of
  Astrology*, sections 442, 445, 449, 451, and 453, translation by R. Ramsay
  Wright (Luzac, 1934): detriment, triplicities, Chaldean faces, and terms.
- William Lilly, *Christian Astrology* (1647), page 112: the order of
  essential dignities, sect-dependent triplicity, and the peregrine condition.

These references identify the tables already audited by the repository.
This milestone adds no source text or astronomical timing fixture.

## Sect and dignity selection

Sect uses the engine's longitude-only ecliptic convention, with the Sun in
the half-circle from the descendant toward the ascendant counted as day.
A Sun exactly on the ascendant counts as night; exactly on the descendant
counts as day. House-system changes and polar fallback do not redefine this
rule. It uses no solar latitude, altitude calculation, refraction, twilight,
or eclipse visibility. In supplied synthetic geometry, sect uses only the
ascendant and Sun longitudes, even if other angle rows are inconsistent.

Triplicity counts only the lord of that chart's sect. The participating lord
does not receive a triplicity dignity. Egyptian term and Chaldean face starts
are inclusive in the engine's arithmetic; their ends belong to the next
span. All dignities are retained, including simultaneous domicile and
exaltation. Detriment and fall remain separate from dignities. `peregrine`
means that the planet has no essential dignity; a planet with a debility
may still have a dignity and therefore not be peregrine.

Longitudes use degrees in the tropical ecliptic of date. The helper rejects
out-of-range or nonfinite longitudes and reuses the engine's normalization
and sign-boundary arithmetic. It adds no epsilon or exact arithmetic promise
to those functions. Sign and degree annotations on supplied body rows are
ignored; longitude determines the lookup. Unselected bodies are validated
but do not receive rulership. Output is detached from supplied geometry and
deeply frozen. It preserves repeated rulers in separate angle rows.

## Synthetic hand derivations

Every numerical case below is enforced in
[angle-rulers.test.ts](../test/angle-rulers.test.ts). These cases are invented
longitude geometry, with expectations derived by hand from the conventions
above. No expected value comes from a previous package output, a cast chart,
Swiss Ephemeris, or a person's birth data. They test conventional table
application rather than physical astronomy.

The base angles are ASC at 0 degrees, MC at 90, DSC at 180, and IC at 270.
Their signs are Aries, Cancer, Libra, and Capricorn, so their domicile rulers
are Mars, the Moon, Venus, and Saturn. The synthetic Sun at 305 degrees is
in the day half-circle; moving it to 5 degrees makes the chart night while
leaving the rulers' positions unchanged.

| Ruler | Own longitude, degrees | Hand lookup | Dignities by day | Dignities by night | Debility |
| --- | ---: | --- | --- | --- | --- |
| Mars | 211 | At 1 degree within Scorpio: Mars domicile, term, and face; water night lord Mars | domicile, term, face | domicile, triplicity, term, face | none |
| Moon | 35 | At 5 degrees within Taurus: Moon exaltation and earth night lord | exaltation | exaltation, triplicity | none |
| Venus | 275 | At 5 degrees within Capricorn: earth day lord Venus; term Mercury and face Jupiter | triplicity | none | none |
| Saturn | 9 | At 9 degrees within Aries: Saturn fall; term Venus and face Mars | none | none | fall |

The ruler's own longitude drives its condition. For example, ASC in Aries
selects Mars, but Mars at 211 degrees receives Scorpio dignities. Evaluating
Mars at ASC instead would lose its domicile and term and would describe the
wrong position. Venus in the night case and Saturn in both cases are
peregrine, because neither has an essential dignity there.

Other explicit hand lookups in the tests exercise:

- Each sign's start and an interior sample before its end, using the
  traditional domicile assignments. Mercury rules Gemini and Virgo,
  Jupiter Sagittarius and Pisces, and Saturn Capricorn and Aquarius.
- Mercury at 151 degrees, or 1 degree within Virgo: domicile, exaltation,
  and Egyptian term all apply. Repeated Mercury angle rulers retain this
  full condition independently in their angle rows.
- Jupiter at 245 degrees, or 5 degrees within Sagittarius: domicile and
  term, plus triplicity by night. At 65 degrees in Gemini it is the
  participating air lord and receives only face, with no triplicity dignity
  by either sect. Mercury
  at 65 degrees has domicile and term, plus triplicity by night.
- Saturn at 27 degrees in Aries: term alongside fall, so it is not
  peregrine. Mercury at 335 degrees in Pisces has detriment and fall
  with no dignity. The Sun at 305 degrees in Aquarius has detriment
  with no dignity.
- Venus's Aries term starts at 6 degrees and ends at 12; Mars's first
  Aries face ends at 10, while its domicile continues through Aries.
  Mars at 30 degrees starts Taurus and is in
  detriment. Half-degree samples on either side check span changes.
- ASC at 0 and at 350 degrees, with the Sun on either horizon and
  inside either half-circle, check sect boundaries and wraparound.

Separate integration checks cast arbitrary supplied instants at invented
equatorial and polar places, including requested Placidus and Koch fallback.
They compare the helper's conditions with the engine's essential dignity
functions on the cast chart. Those are integration checks, not independent
accuracy evidence. Input validation, order independence, ignored outer
planets and nodes, and frozen JSON-compatible output are also checked.

No ingress, lunation, or eclipse identity is inferred from these inputs.
The original chart retains its calculation flags and provenance; the
analysis carries conventions rather than an astronomical receipt.
