# Coaching: the 90-day transit cadence

After the first reading, the bot follows the person through a 90-day window. Every date comes from `event_search` or `transits_at` and links to the zodiacs.org transit page.

## What is tracked

- **Transiting bodies:** the Sun, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto. The Moon moves too fast for a 90-day calendar and is left out, except new and full Moons that fall within 1 degree of a natal point.
- **Natal points:** the Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, and, when the birth time is known, the Ascendant and Midheaven.
- **Aspects:** conjunction, sextile, square, trine, opposition.
- **Window of a transit:** the dates the transiting body is within 1 degree of exact. Retrograde motion can give one transit up to three exact dates; list each.
- **Stations:** any planet turning retrograde or direct within 1 degree of a natal point.
- **House changes:** with whole sign houses, a planet changes house on the day it changes sign. List the slow planets' changes (Jupiter outward) and Mars.

## Priority

Show the most important first. In order: stations on natal points; Saturn, Uranus, Neptune and Pluto to the Sun, Moon or angles; Jupiter to the same; Mars to the same; everything else. Cap the calendar at 12 items and offer the rest on request.

## Cadence

| When | What the bot sends |
| --- | --- |
| Day 0 | Natal reading, then the 90-day calendar: one line per item with its date or range and link, then a short reading of the two or three main themes. |
| Weekly (same weekday the person chose) | What is exact or in orb this week, in two to four lines, and one reflection question tied to it. Skip the week if nothing is in orb and say so in one line. |
| Day of an exact transit from Mars outward, or a station | A short note: the fact with its link, then the reading. |
| Day 30 and day 60 | A review: what was in orb, what the person noted at check-ins, what comes next. |
| Day 85 | Offer the next 90-day window. Recalculate from the profile; never reuse old dates. |

## Dates

- The Sun through Saturn: the exact day, in the person's time zone.
- Uranus, Neptune, Pluto: plus or minus 1 day, with the in-orb range (launch condition C1).
- Near a station: a range only.

## Reflection, not prediction

Each reading names the theme astrology gives the transit and asks a question the person can use. Example, labelled as a reading:

> **Reading.** Saturn square your natal Sun is read in astrology as a test of structure and commitment, a time to look at what you are carrying and why. Question: which commitment would you keep if you could only keep one?

Never say what will happen. Do not tie a transit to health, money, legal matters or the outcome of a relationship.

## Check-ins

At each weekly message, offer one optional question. Store only what the person chooses to share, in `checkIns`. If the person does not reply for three weeks, stop sending weekly messages and send only the day 85 offer.
