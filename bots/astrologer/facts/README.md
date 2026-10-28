# Reading facts

`reading-facts.ts` computes, for one birth and a transit window, every number the Astrologer bot may state, so that the bot interprets and never calculates. It uses the engine's own code from `src/`: `resolveLocalToUtc` for civil time, `natalChart` for positions and whole sign houses, `sectOf` for sect, `findConfiguredAspects` for aspects and station contacts, `searchLongitudeCrossings` for exact transit dates, `longitudeSpeed` for stations, and `moonSignCandidates` for the Moon's signs over a day. It lives outside `src/`, so nothing here reaches `dist/` or the npm package.

What it returns: the native's calendar age at the window start (years and months from the local birth date, and a stage: infant under 2, child 2 to 12, adolescent 13 to 17, adult), and for each chart version:

- Placements: sign, degree truncated to the arcminute, whole sign house, retrograde.
- Sect from the engine (`sectOf`), not from the Sun's house, and the sect team after Ptolemy, *Tetrabiblos* I.7: by day the Sun is the sect light, Jupiter the benefic and Saturn the malefic of sect, Venus the benefic and Mars the malefic contrary to sect; by night the Moon, Venus and Mars, with Jupiter and Saturn contrary to sect. Mercury is a morning star (day sect) when it is west of the Sun in longitude, an evening star (night sect) when east. Without a birth time both teams are listed for reference and none is assigned.
- Essential dignities of the seven classical planets from the engine (`essentialDignities` and `dignityRulersAt` in `src/techniques/dignities.ts`): domicile and exaltation (*Tetrabiblos* I.17 and I.19), detriment and fall, Dorothean triplicity counting the lord of the chart's sect, Egyptian term, Chaldean face, peregrine, and the lord of each dignity at the planet's degree. Without a birth time the triplicity is given for either sect.
- The next birthday: the next calendar anniversary of the local birth date on or after the window start (1 March in a common year for a 29 February birth), and the age reached then.
- Natal aspects between the Sun to Pluto, the true node, the Ascendant and the Midheaven, with the engine's default orbs, ranked by orb, tightest first.
- The chart ruler: the traditional domicile lord of the rising sign (`dignityRulersAt`), with its placement, its dignity line, its sect role from the sect team and Mercury's phase, and its aspects from the ranking.
- Planets on an angle: each conjunction or opposition of a planet or the node with the Ascendant or Midheaven in the ranking, read as on the Ascendant, Descendant, Midheaven or IC, or a line saying none is. Also the points in the angular whole sign houses (1, 4, 7, 10), labelled as house placements.
- The solar return for the next birthday: the local date of the Sun's crossing of its natal longitude (`searchLongitudeCrossings`, searched within 4 days of the anniversary), marked inside or after the window. When it is inside the window it is the same date as the transit line of the Sun conjunct the natal Sun.
- Points within 2 degrees of a sign edge, with the neighbouring sign and, for the Ascendant, Midheaven and Moon, the birth-time shift in minutes that moves the point across the edge.
- Transits in the window (Sun, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto; conjunction, square, trine, opposition; to the natal Sun, Moon, Mercury, Venus, Mars, Ascendant and Midheaven), dated in the person's zone. Uranus, Neptune and Pluto, and any hit where the body moves under 0.01 degrees a day, are given as the date range within 1 degree.
- Stations in the window (Mercury to Pluto) and, for each, the natal points within 2 degrees of a major aspect, or a statement that none is.

Every fact line of the text sheet starts with an ID in square brackets, numbered in sheet order and stable for the same input and options: N age and next birthday, P placements, K sect, D dignities, A natal aspects, R chart ruler, C planets on an angle, H angular houses, E sign edges, B solar return, T transits, S stations, and S1a, S1b, ... the natal contacts of station S1. The bot names a contact only by quoting its line with the ID.

A repeated local time (`fold`) gives both charts, a skipped one (`gap`) both candidates, and an unknown time a reference chart at local noon with planets only: no houses, angles, chart ruler, angle contacts, sect or Moon degree, and the Moon's signs over the local date.

Run it from the repository root after `npm ci`:

```sh
# one birth, text sheet (add --json for the structured facts)
node_modules/.bin/vite-node bots/astrologer/facts/cli.ts -- \
  '{"date":"1998-04-04","time":"14:44","timeKnown":true,"zone":"Europe/Istanbul","lat":41.0082,"lon":28.9784}'

# many births: a JSON object of id to input on stdin, a JSON object of id to sheet on stdout
node_modules/.bin/vite-node bots/astrologer/facts/cli.ts -- --batch < inputs.json > sheets.json

# options: --window-start YYYY-MM-DD (default 2026-11-01), --days N (default 90)
```

## Checking a reading

`check-reading.ts` reads a reading against its sheet. It finds every aspect, transit or station contact the reading names (two points and an aspect word close together in a clause, in either order, including "on", "meets", "returns" and aspects to the Descendant or IC) and flags it when no sheet line has the same two points with the same aspect, or, for a transit or station, the same direction (moving body first, natal point second). It also flags an ID that is not on the sheet, and an ID quoted with another line's planets.

Angle claims are read as conjunctions with the angle: "on the Ascendant", "the rising degree", "conjunct the MC", "Saturn rising", "Jupiter culminating", and "on the Ascendant axis" (which passes with a conjunction or an opposition). A rising sign ("Scorpio rising", "the rising sign") is not a claim. A violation of an angle claim quotes the sheet's lines of planets on an angle.

Birthday claims are checked against the next birthday and solar return lines: a date written next to "birthday" or "solar return" must be one of those dates, "the day after (or N days before) the birthday" must agree with the date it is said of (in the same sentence or the one before), and "turns N" or "the Nth birthday" must give the sheet's age. Dates are read as ISO dates, "11 November" or "November 11". It is a heuristic over English: it misses relations whose subject is far from the aspect word, and a relation on either chart of a fold or gap passes.

```sh
node_modules/.bin/vite-node bots/astrologer/facts/check-cli.ts -- --sheet sheet.txt --reading reading.md [--json]
# exit 0: no violation; 1: violations (printed); 2: bad arguments
```

The grading harness (`grading/run.py`) runs it after the writer. When it fails, the writer gets the flagged sentences with their problems and returns a replacement for each, which is spliced into the reading in place; the whole reading is rewritten only when no flagged sentence can be located or the reply cannot be read. At most 2 revisions; each chart's checks, with the revision mode, are recorded in `checks/<id>.json`.

Tests: `npx vitest run bots/astrologer/facts`. Typecheck: `npx tsc -p bots/astrologer/facts/tsconfig.json`. The tests pin structure and the engine's own consistency (ranking order, station speed sign, contacts against a separately written separation); they are regression tests, not accuracy evidence.
