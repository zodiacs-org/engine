# Traditional sources and project conventions

Sources describe historical rules. They do not establish predictive validity.
No historical chart or person's question data is used in the fixtures.

## Significator selection

`lilly-house-ruler` and `lilly-moon` refer to William Lilly, *Christian
Astrology*, chapter XX, printed pages 123 and 124. The work first appeared
in 1647. The [linked transcription](https://maestrosdelsaber.com/wp-content/uploads/ftp-files/Astrologia/Astro%20y%20Religion/Astro%20Lilly%2C%20William%20-%20Christian%20Astrology%20Vol%201%201647.pdf)
has a title page naming the second edition, London: John Macock, 1659,
despite the filename. Read on 2026-10-14, PDF pages 150 and 151 (counting
from the first page), chapter XX: the ruler of the sign belonging to the
relevant house is its significator; the Moon accompanies the querent. These
definitions are paraphrased in the code, with no copied text or charts.

`ptolemy-domiciles` refers to Ptolemy, *Tetrabiblos* I.17, translated by
F. E. Robbins (Loeb Classical Library, 1940), the
[LacusCurtius text](https://penelope.uchicago.edu/Thayer/E/Roman/Texts/Ptolemy/Tetrabiblos/1B%2A.html#17),
read on 2026-10-14. This section specifies the traditional domicile rulers
that the engine already provides through `dignityRulersAt`. This project
imports that function and does not maintain its own ruler table. Literal
expectations in `tests/significators.test.ts` are independently transcribed
from the source, as derived in `tests/fixtures.md`.

The implementation applies house-ruler selection to the actual computed
first and declared quesited cusps. Lilly describes the ascending sign for
the querent. Using the first cusp is the explicit project convention when a
caller chooses an engine house system whose first cusp differs from the
Ascendant. No intercepted sign adds a ruler. The quesited house comes from
the caller, and the library does not classify the question label.

`caller-declaration` means a natural significator was explicitly supplied in
the question type. It makes no attribution to Lilly or any other tradition
for that association. No natural planet is chosen automatically.

Role preservation and grouping by physical planet are data conventions:
when a planet has several roles, all assignments remain present, and the
group explains the overlap. The library does not substitute a different
ruler, treat the planet as distinct bodies or infer an outcome from the
shared roles.

## Considerations before judgement

The consideration source records cite Lilly's *Christian Astrology*,
printed pages 122 and 123, under "Considerations before Judgment", in the
same [transcription linked above](https://maestrosdelsaber.com/wp-content/uploads/ftp-files/Astrologia/Astro%20y%20Religion/Astro%20Lilly%2C%20William%20-%20Christian%20Astrology%20Vol%201%201647.pdf),
read on 2026-10-14, PDF pages 149 and 150 counting from the first page.
The tradition names distinguish Lilly's cautions, Arabic rules he reports,
and the Via Combusta variant he attributes to others. This is an attribution
through Lilly, not a claim to have read Alkindus directly.

He lists ascending degrees 0, 1, 2 and 27, 28, 29, and personal-context
exceptions. He defines Via Combusta as the last fifteen degrees of Libra
and first fifteen of Scorpio. His Saturn-first caution emphasizes
retrograde motion; his Saturn-seventh caution concerns the judgement.
An adjacent seventh-house-affliction passage excepts seventh-house questions,
but the Saturn placement passage does not state that exception.

Project conventions translate these to early `[0, 3)`, late `[27, 30)`
degrees within the sign and lunar `[195, 225)` absolute degrees, using
half-open intervals without rounding. Saturn uses actual cusp intervals
through engine `houseOf`, with no cusp anticipation or ecliptic latitude.
Neither personal-context exceptions nor seventh-house suppression are
automatic. All conditions are individually toggleable geometric observations.
`tests/considerations.test.ts` enforces these choices and their boundary
arithmetic; `tests/fixtures.md` gives the derivations. The policy does not
add fixed-star exemptions or other Moon cautions mentioned in the passage.
