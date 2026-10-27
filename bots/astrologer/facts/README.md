# Reading facts

`reading-facts.ts` computes, for one birth and a transit window, every number the Astrologer bot may state, so that the bot interprets and never calculates. It uses the engine's own code from `src/`: `resolveLocalToUtc` for civil time, `natalChart` for positions and whole sign houses, `sectOf` for sect, `findConfiguredAspects` for aspects and station contacts, `searchLongitudeCrossings` for exact transit dates, `longitudeSpeed` for stations, and `moonSignCandidates` for the Moon's signs over a day. It lives outside `src/`, so nothing here reaches `dist/` or the npm package.

What it returns: the native's calendar age at the window start (years and months from the local birth date, and a stage: infant under 2, child 2 to 12, adolescent 13 to 17, adult), and for each chart version:

- Placements: sign, degree truncated to the arcminute, whole sign house, retrograde.
- Sect from the engine (`sectOf`), not from the Sun's house, and the sect team after Ptolemy, *Tetrabiblos* I.7: by day the Sun is the sect light, Jupiter the benefic and Saturn the malefic of sect, Venus the benefic and Mars the malefic contrary to sect; by night the Moon, Venus and Mars, with Jupiter and Saturn contrary to sect. Mercury is a morning star (day sect) when it is west of the Sun in longitude, an evening star (night sect) when east. Without a birth time both teams are listed for reference and none is assigned.
- Essential dignities of the seven classical planets from the engine (`essentialDignities` and `dignityRulersAt` in `src/techniques/dignities.ts`): domicile and exaltation (*Tetrabiblos* I.17 and I.19), detriment and fall, Dorothean triplicity counting the lord of the chart's sect, Egyptian term, Chaldean face, peregrine, and the lord of each dignity at the planet's degree. Without a birth time the triplicity is given for either sect.
- Natal aspects between the Sun to Pluto, the true node, the Ascendant and the Midheaven, with the engine's default orbs, ranked by orb, tightest first.
- Points within 2 degrees of a sign edge, with the neighbouring sign and, for the Ascendant, Midheaven and Moon, the birth-time shift in minutes that moves the point across the edge.
- Transits in the window (Sun, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto; conjunction, square, trine, opposition; to the natal Sun, Moon, Mercury, Venus, Mars, Ascendant and Midheaven), dated in the person's zone. Uranus, Neptune and Pluto, and any hit where the body moves under 0.01 degrees a day, are given as the date range within 1 degree.
- Stations in the window (Mercury to Pluto) and, for each, the natal points within 2 degrees of a major aspect, or a statement that none is.

Every fact line of the text sheet starts with an ID in square brackets, numbered in sheet order and stable for the same input and options: N age, P placements, K sect, D dignities, A natal aspects, E sign edges, T transits, S stations, and S1a, S1b, ... the natal contacts of station S1. The bot names a contact only by quoting its line with the ID.

A repeated local time (`fold`) gives both charts, a skipped one (`gap`) both candidates, and an unknown time a reference chart at local noon with planets only: no houses, angles, sect or Moon degree, and the Moon's signs over the local date.

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

`check-reading.ts` reads a reading against its sheet. It finds every aspect, transit or station contact the reading names (two points and an aspect word close together in a clause, in either order, including "on", "meets", "returns" and aspects to the Descendant or IC) and flags it when no sheet line has the same two points with the same aspect, or, for a transit or station, the same direction (moving body first, natal point second). It also flags an ID that is not on the sheet, and an ID quoted with another line's planets. It is a heuristic over English: it misses relations whose subject is far from the aspect word, and a relation on either chart of a fold or gap passes.

```sh
node_modules/.bin/vite-node bots/astrologer/facts/check-cli.ts -- --sheet sheet.txt --reading reading.md [--json]
# exit 0: no violation; 1: violations (printed); 2: bad arguments
```

The grading harness (`grading/run.py`) runs it after the writer, sends the writer one revision prompt listing the violations when it fails (at most 2 revisions) and records each chart's checks in `checks/<id>.json`.

Tests: `npx vitest run bots/astrologer/facts`. Typecheck: `npx tsc -p bots/astrologer/facts/tsconfig.json`. The tests pin structure and the engine's own consistency (ranking order, station speed sign, contacts against a separately written separation); they are regression tests, not accuracy evidence.
