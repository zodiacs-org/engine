# Historical clock rules: a bounded research seed

Five source-checked legal regimes and eight boundary fixtures are ready for review. This is useful test material for the engine's future birth-time input layer. It does **not** establish a new historical discovery or supply a city-to-time-zone atlas.

The important distinction is between a law, its clock transition, the geographical area where it applied, and the clock convention used in an individual birth record. The dataset separates these rather than guessing a single birth instant.

## Run

Python 3.10 or later; standard library only. No network, engine dependency, system time zone or tzdb is used.

```bash
cd historical-time
python validate.py
python -m unittest -v test_validate.py
```

`validate.py` checks the fixed fixture values against calendar arithmetic, transition time bases and complete gap/fold candidate sets. The tests deliberately introduce the common one-hour time-basis error, confuse enactment with operation, remove evidence, and attempt out-of-scope years. Passing demonstrates consistency of this conditional model, not independent historical corroboration.

## Contents

| File | Purpose |
|---|---|
| `rules.json` | Six primary sources, five bounded interpretations, eight fixed fixtures |
| `validate.py` | Offline consistency checks and a deliberately limited single-transition resolver |
| `test_validate.py` | Thirteen tests including scope refusals and deliberate faulty inputs |
| `verification.json` | Saved result of the delivered checks |
| `REVIEW.md` | Independent agent review and resolved findings |
| `INTEGRATION.md` | Small acceptance contract for Opus; no engine edit needed |

## What the records say

| Record | Instrument date | Separate operative fact | Fixture scope |
|---|---|---|---|
| US 1918 seasonal rule | Approved 19 March 1918 | March/October last Sundays at 02:00 on the prevailing zone clock | 1918 only; conditional 75°W meridian example |
| US 1942 wartime advance | Approved 20 January 1942 | 02:00 on the twentieth day after enactment: 9 February | One transition, assuming unadvanced standard time beforehand |
| US 1945 wartime termination | Approved 25 September 1945 | 02:00 on 30 September overrides the earlier sunset provision | One federal rollback, assuming the advanced clock beforehand |
| US Uniform Time Act | Approved 13 April 1966 | General commencement 1 April 1967; distinct conditional provision for 1966 | 1967 only, assuming no state exemption |
| UK 2002 order | Made 12 February 2002 | In force 11 March; seasonal boundaries are 01:00 **GMT** | 2002 only; Great Britain and Northern Ireland |

The 1918, 1942, 1945 and 1967 records model an explicit minus-five-hour unadvanced meridian offset. They do not assert that any named city, hospital or household used it. The model interprets a US rollback's 02:00 as the then-prevailing advanced legal standard time. A historian should check that interpretation and local application before promotion into production.

A useful difference appears in the UK example. The October boundary is 01:00 GMT, which is 02:00 before the local rollback. Treating that statutory 01:00 as local time produces a one-hour error; a negative test detects it.

The US 1942 example catches a different mistake: using the approval date as the clock-change date. The 1966 Act likewise must not be reduced to either “everything started in 1966” or “nothing applied until 1967.” Its general commencement and conditional 1966 clause are different facts.

## Reading the fixtures

`expected_reference_instant` is the transition on the dataset's **GMT civil-arithmetic model**. It deliberately has no `Z` or UTC offset suffix. Historical mean-time labels are not silently promoted to physical UTC, UT1 or TT. The tool performs integer-second civil arithmetic and makes no subsecond or leap-second claim.

Offsets are `local label − reference label`, in seconds. At a transition the new offset is already in force; the old side ends strictly before it. Expected fixture values were written from the clauses and calendar arithmetic before the validator ran, not copied from engine or tzdb output.

For the conditional 1945 rollback, local `1945-09-30T01:30:00` has two reference labels: `05:30:00` and `06:30:00`. Both are returned. For the conditional 1918 advance, local `1918-03-31T02:30:00` has no candidate. Nothing is silently normalised into 03:30.

The resolver only handles the one-day neighbourhood of a fixture transition. It refuses unreviewed years, distant dates, and UTC-looking inputs. It is not a general time-zone library.

## Evidence and limits

Sources are official scans, not unsourced historical compilations. Critical printed clauses were visually inspected in addition to reading extracted text. The source entries include precise page/section locators, short excerpts and actual retrieval intervals on 27 September 2026. These timestamps establish access time; they do not imply the instrument is current law in 2026.

1. [US Act of 19 March 1918](https://www.govinfo.gov/link/statute/40/450), 40 Stat. 450–451, §§1–4.
2. [US Act of 20 January 1942](https://www.govinfo.gov/content/pkg/STATUTE-56/pdf/STATUTE-56-Pg9.pdf), 56 Stat. 9, operative paragraph and §2.
3. [US Act of 25 September 1945](https://www.govinfo.gov/content/pkg/STATUTE-59/pdf/STATUTE-59-Pg537.pdf), 59 Stat. 537, chapter 388.
4. [Uniform Time Act of 1966](https://www.govinfo.gov/content/pkg/STATUTE-80/pdf/STATUTE-80-Pg107.pdf), 80 Stat. 107–109, §§3(a), 4(a), 6.
5. [Summer Time Order 2002](https://www.legislation.gov.uk/uksi/2002/262/pdfs/uksi_20020262_en.pdf), articles 1 and 2(2)(b).
6. [Summer Time Act 1972](https://www.legislation.gov.uk/ukpga/1972/6/pdfs/ukpga_19720006_en.pdf), §1(1), with §4 applying the Act to Northern Ireland.

No source document has been redistributed. This package stores short excerpts and original interpretations. No proprietary astrology time atlas was used.

## Turning this into original historical research

Select one bounded place and period, then collect the missing evidence: the applicable boundary order or local statute, amendments and exceptions, and at least one contemporaneous operational record such as an official notice or institutional register instructions. Record whether an ambiguous time was written as standard or advanced time. Treat contradictory evidence as separate hypotheses with separate provenance.

AI can help locate documents, transcribe scans and propose possible contradictions. A proposed correction should carry the scan/page, a reviewed transcription, explicit scope, effective interval and independent human review. Validate it against separate contemporaneous evidence. Keep discovery candidates and accepted records distinct.

This seed supplies a reproducible workflow and known boundary traps. Claiming a previously undocumented local rule requires additional evidence; none is claimed here.
