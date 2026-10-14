# Primary-source roadmap

These sources were fetched and the sections listed below read during the
foundation session. They guide later milestones; a citation here does not
mean that a model is implemented. Formulas must be implemented independently,
with their units, coordinate conventions and domain recorded in the tests.

## Horizon events already delegated to the engine

US Naval Observatory, *Rise, Set, and Twilight Definitions*, particularly
"Technical Definitions and Computational Details":
<https://aa.usno.navy.mil/faq/RST_defs>.
Read on 2026-10-14. The engine's sky guide explains its implementation and
the distinction between its variable solar radius and USNO's standard
solar radius. Refraction and the local horizon affect observed times.

The foundation comparison reuses a committed reference, not engine output:
`../src/sky/fixtures/usno-rstt.json`, whose source records retrieval on
2026-09-29 from the USNO *Complete Sun and Moon Data for One Day* API. The
tested row's URL is
<https://aa.usno.navy.mil/api/rstt/oneday?date=2024-06-21&coords=38.89,-77.03&tz=0>.
The API response could not be freshly retrieved in this session; the test
uses that existing attributed fixture. `test/engine.test.ts` states the
tolerance and exact comparison scope. The root licensing record identifies
the fixture as a US Government work.

## Planetary visibility

C. Schoch, "The 'Arcus Visionis' of the Planets in the Babylonian
Observations", *Monthly Notices of the Royal Astronomical Society* 84
(1924), pp. 731-734:
<https://articles.adsabs.harvard.edu/pdf/1924MNRAS..84..731S>.
The opening page defines the solar depression at the body's airless horizon
crossing. The following pages distinguish inner-planet appearances and give
historical visibility thresholds. A named Schoch model must keep those
conventions separate from configurable altitude or extinction additions.

Bradley E. Schaefer, "Astronomy and the Limits of Vision", *Vistas in
Astronomy* 36 (1993), pp. 311-361:
<https://www.uai.it/pianeti/wp-content/uploads/2021/03/ppr_Sch93-1.pdf>.
Sections 2.3 and 2.4 discuss air mass and extinction; section 3.10 discusses
heliacal phenomena. This is a possible source for a richer model. Adding an
extinction parameter to an arcus threshold alone does not implement
Schaefer's limiting-magnitude model. A later milestone must define exactly
how extinction and magnitude limits affect its chosen model.

## Lunar crescents

B. D. Yallop, *A Method for Predicting the First Sighting of the New
Crescent Moon*, NAO Technical Note 69, June 1997, updated April 1998:
<https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf>.
Sections 2-4 define the geometry, width and best observing time; section 6
gives the calibrated categories. Appendix A contains a worked output example.
The report carries a permission notice. Use original code and independent
criterion arithmetic; do not copy its program, prose or tables. Yallop's
geocentric altitude difference must not be silently replaced with Odeh's
topocentric definition.

Mohammad Sh. Odeh, "New Criterion for Lunar Crescent Visibility",
*Experimental Astronomy* 18, pp. 39-64,
DOI [10.1007/s10686-005-9002-5](https://doi.org/10.1007/s10686-005-9002-5):
<https://astronomycenter.net/pdf/2006_cri.pdf>.
Section 5, Table V and equation (2) provide a criterion and rounded boundary
values suitable for small independent worked tests. Use airless topocentric
geometry and the width unit of the equation, not the different width unit
printed in the observational table. Preserve the distinction between
unaided and optical-aid categories. Do not copy the observation database.

Both calibration tables include morning observations: Yallop section 5,
Table 4, and Odeh section 6, Table VI, identify morning/evening cases. Before
implementing last morning crescent searches, verify the source's observing
time convention and mark any symmetry extension explicitly. The presence
of morning observations alone does not validate a particular morning search.

## Event terminology

Francesca Schironi, "The Language of Astronomy", in *Coming to Terms:
Approaches to (Ancient) Terminologies* (2023), section 4.4, pp. 34-35:
<https://edoc.hu-berlin.de/server/api/core/bitstreams/07b8091d-970b-4c94-8013-4804d2f87a78/content>.
This historical analysis documents inconsistent use of acronychal and
cosmical names. Later event results must record the actual Sun/body
rise/set pairing and whether it is a geometric coincidence or a visibility
transition. The names alone are not a sufficient definition.

## Evidence to add with each model

Before running a comparison, commit or write the selected source inputs,
their units, the independent expected result and the tolerance rationale.
Use independently evaluated criterion arithmetic for implementation checks,
and small attributed published observations only where redistribution is
permitted. Distinguish those checks from engine parity, numerical invariants
and predictive-performance measurements. No Swiss Ephemeris material may
supply an expectation.
