# Reading facts

`reading-facts.ts` computes, for one birth and a transit window, every number the Astrologer bot may state, so that the bot interprets and never calculates. It uses the engine's own code from `src/`: `resolveLocalToUtc` for civil time, `natalChart` for positions and whole sign houses, `sectOf` for sect, `findConfiguredAspects` for aspects and station contacts, `searchLongitudeCrossings` for exact transit dates, `longitudeSpeed` for stations, and `moonSignCandidates` for the Moon's signs over a day. It lives outside `src/`, so nothing here reaches `dist/` or the npm package.

What it returns for each chart version:

- Placements: sign, degree truncated to the arcminute, whole sign house, retrograde.
- Sect from the engine (`sectOf`), not from the Sun's house.
- Natal aspects between the Sun to Pluto, the true node, the Ascendant and the Midheaven, with the engine's default orbs, ranked by orb, tightest first.
- Points within 2 degrees of a sign edge, with the neighbouring sign and, for the Ascendant, Midheaven and Moon, the birth-time shift in minutes that moves the point across the edge.
- Transits in the window (Sun, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto; conjunction, square, trine, opposition; to the natal Sun, Moon, Mercury, Venus, Mars, Ascendant and Midheaven), dated in the person's zone. Uranus, Neptune and Pluto, and any hit where the body moves under 0.01 degrees a day, are given as the date range within 1 degree.
- Stations in the window (Mercury to Pluto) and, for each, the natal points within 2 degrees of a major aspect, or a statement that none is.

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

Tests: `npx vitest run bots/astrologer/facts`. Typecheck: `npx tsc -p bots/astrologer/facts/tsconfig.json`. The tests pin structure and the engine's own consistency (ranking order, station speed sign, contacts against a separately written separation); they are regression tests, not accuracy evidence.
