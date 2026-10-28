# Sources for interpretation

The bot grounds its readings in these texts, not in horoscope copy. It paraphrases, names the source when a reading leans on one ("in the Hellenistic tradition, following Valens"), and quotes at most a short phrase. Calculated facts never come from these texts; they come from the MCP server.

Classical texts often speak in fixed outcomes (illness, death, fortune). The bot does not pass those on. It translates a classical judgment into the theme it describes and keeps the boundaries in `INSTRUCTIONS.md`.

## Classical

| Text | Edition | Use it for |
| --- | --- | --- |
| Claudius Ptolemy, *Tetrabiblos* (2nd century) | trans. F. E. Robbins, Loeb Classical Library 435, Harvard University Press, 1940 | Planetary natures, aspects, the general logic of nativities |
| Dorotheus of Sidon, *Carmen Astrologicum* (1st century) | trans. Benjamin N. Dykes, *Carmen Astrologicum: The 'Umar al-Tabari Translation*, Cazimi Press, 2017 | Sect, triplicity rulers, houses |
| Vettius Valens, *Anthologies* (2nd century) | trans. Mark T. Riley, 2010 | Whole sign houses, house rulers, time lords |
| Firmicus Maternus, *Mathesis* (4th century) | trans. James Herschel Holden, American Federation of Astrologers, 2011 | Planets in houses and signs |
| Abu Ma'shar, *The Abbreviation of the Introduction to Astrology* (9th century) | ed. and trans. Charles Burnett, Keiji Yamamoto and Michio Yano, Brill, 1994 | Dignities, aspects, definitions |
| Al-Biruni, *The Book of Instruction in the Elements of the Art of Astrology* (1029) | trans. R. Ramsay Wright, Luzac, 1934 | Definitions and terms |
| William Lilly, *Christian Astrology* (1647) | facsimile editions | House meanings, planetary significations |

## Modern

| Text | Edition | Use it for |
| --- | --- | --- |
| Chris Brennan, *Hellenistic Astrology: The Study of Fate and Fortune* | Amor Fati Publications, 2017 | History and use of whole sign houses, sect, rulership |
| Robert Hand, *Whole Sign Houses: The Oldest House System* | ARHAT, 2000 | Why whole sign houses |
| Demetra George, *Ancient Astrology in Theory and Practice*, Volume 1 | Rubedo Press, 2019 | Planetary condition, sect, rulership |
| Deborah Houlding, *The Houses: Temples of the Sky* | Ascella, 1998 | House meanings across traditions |
| Robert Hand, *Planets in Transit: Life Cycles for Living* | Para Research, 1976 | Transit meanings, planet by planet |
| Steven Forrest, *The Changing Sky* | ACS Publications, 1986 | Transits as choices rather than fixed events |
| Liz Greene, *Saturn: A New Look at an Old Devil* | Samuel Weiser, 1976 | Saturn transits, psychological reading |
| Howard Sasportas, *The Twelve Houses* | Aquarian Press, 1985 | House meanings, psychological reading |
| Stephen Arroyo, *Astrology, Karma and Transformation* | CRCS Publications, 1978 | Outer planet transits |

## How the bot combines them

1. Start from the classical technique: the planet's nature, its sign and house, its ruler and its aspects.
2. Add the modern reading of the same factor, labelled as modern where the two differ.
3. For transits, describe the theme and the timing; use Hand and Forrest for the reading, and the classical texts for the planet's nature.
4. When sources disagree, say so briefly rather than choosing silently.
