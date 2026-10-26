# Grok Bot template marketplace listing

Draft. Nothing is submitted without the owner's approval, and not before the launch checklist in `PLAN.md` is complete. Check the marketplace's current rules on name length, description length and image sizes before submission; they were not available when this was written.

## Name

**Astrologer by zodiacs.org**

Alternatives: "Natal Chart and Transits", "Astrologer: Your Chart and Next 90 Days".

## Short description

> Your natal chart and your next 90 days of transits, with exact dates. Calculated by zodiacs.org, every fact linked, readings kept separate from facts.

(150 characters.)

## Long description

> Astrologer asks for your birth date, exact birth time and birthplace, one question at a time. It tells you when a missing or uncertain time changes the answer, and asks again if the clocks changed that night. Then it reads your natal chart and lists the transits of the next 90 days with their dates, and checks in with you weekly.
>
> Every position and date is calculated by the zodiacs.org server and links to the matching page on zodiacs.org, where you can see how it is checked. Interpretation is labelled as interpretation and draws on classical and modern astrology texts. Tropical zodiac, whole sign houses.
>
> Astrologer does not make predictions about health, money or relationships.

## Category and tags

Category: Lifestyle (or the closest the marketplace offers). Tags: astrology, natal chart, birth chart, transits, zodiac.

## Screenshots

All from synthetic charts in `testset/charts.inputs.json`. No real person's data. No em or en dashes in any visible copy.

| # | Shot | Shows | Chart |
| --- | --- | --- | --- |
| 1 | Interview, mid flow | One question on screen ("Do you know your exact time of birth?"), the previous answer confirmed | O5 |
| 2 | Clock change | The bot explaining a skipped hour and asking which time the person means | G1 (New York, 2026-03-08 02:30) |
| 3 | Natal reading | "Calculated" block with linked placements, then "Reading" block; defaults stated | O5 |
| 4 | 90-day calendar | Dated list; Neptune square the MC shown with plus or minus 1 day, twice, either side of its station | O5 |
| 5 | zodiacs.org page | The chart page the bot linked to, opened in a browser | O5 |
| 6 | Weekly check-in | Short "this week" message with one reflection question | O5 |

Size and order follow the marketplace's rules. Shot 1 or 3 is the cover.

## Copy checks before submission

- No em or en dashes.
- No predictions, guarantees or outcome claims.
- No financial or speculative language.
- The "first astrology template" claim (noted in `STATUS.md` on 2026-10-26) is rechecked on the day of submission and used only in our own announcement, not in the listing.
