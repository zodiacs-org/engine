# Personal Sky Calendar: scope

Status: draft for Dias. Nothing here is built or public yet.
Part of: the Astrologer bot (bots/astrologer, merged in engine PR #77).

## 1. What it is

A person tells the Astrologer bot their birth details once. Every Monday morning the bot sends them a short note listing that week's exact transits to their own birth chart. Each line says what is happening in plain words and links to the matching zodiacs.org page. If they add a partner, the note also has a short section on how that week's sky touches the two charts together.

It describes the sky. It never predicts events, never picks dates, never talks about money or prices, and never uses crypto language. No dashes anywhere in the copy.

## 2. Saving birth data (privacy first)

- **Opt in only.** The bot asks before saving anything: "Do you want me to keep your birth details so I can send your weekly sky note?" No answer or a no means nothing is stored and the bot works one chat at a time, as it does today.
- **What is stored:** the existing profile format in template/PROFILE.md (name or nickname, birth date, time and how sure the time is, place with its coordinates and time zone, the engine receipt, settings, consent date). Nothing else: no email unless the delivery channel needs it, no free text diary unless the person types it into a check in.
- **Where:** in the person's own bot memory on the Grok Bot side, not on zodiacs.org. zodiacs.org gets the birth data only as tool inputs at the moment of each weekly calculation, the same way the public tools work now, and keeps no copy.
- **Partner data:** stored only after the person confirms the partner agreed to it. The bot says so plainly.
- **Control:** "show my saved details", "change my birth time", "stop the weekly note" and "delete everything" each work in one message. Delete removes the profile, the partner profile and the routine.
- **Unknown birth time:** allowed. The note then leaves out anything that depends on the rising sign or houses, and says once that the time is unknown.

## 3. The Monday note

**Timing.** Monday at about 08:00 in the person's own time zone (from their profile, which they can change). Covers Monday to Sunday.

**What goes in.**
1. Exact transits that week: a moving planet reaching an exact aspect (conjunction, opposition, square, trine, sextile) to a natal planet or angle, with the exact date. Fast Moon contacts are left out, otherwise there would be dozens.
2. Stations that fall within a tight orb of a natal point.
3. Sign changes and new or full Moons only when they touch the chart.
4. At most 6 lines. If there are more, the slow planets and stations come first, Sun, Mercury and Venus contacts get grouped into one line.
5. A quiet week says so in one sentence instead of filling space.

**Each line.** Example (synthetic chart):

> Tuesday 10 Nov. Transiting Saturn square your natal Sun, exact. Saturn is the planet of structure and limits, a square is a point of friction, and the Sun stands for your sense of purpose. Read more: zodiacs.org/... (planet in aspect page)

Rules for each line:
- The aspect wording is copied from the engine result, never typed by the model (same rule and checker as the main bot).
- One or two plain sentences that explain the symbols. No "this week you will", no "a good day to", no outcomes.
- One link to the matching zodiacs.org page (sky calendar, planet, aspect or Moon phase page). Links are built from the tool output, never guessed.
- Dates in the person's time zone.

**Short sign off.** One sentence pointing to the full chart or the Astrologer bot if they want a deeper reading, plus "Reply stop to pause these notes."

## 4. Add your partner

- Optional step after the first note: "Want to add a partner? I need their birth details and their OK."
- Weekly section, at most 3 lines: transits that week to a point in the partner's chart that is also in a tight contact with the person's chart (for example, Mars crossing a spot where her Venus meets his Moon). Uses get_compatibility for the shared contacts and the same transit search for each chart.
- Descriptive only: "this touches the part of your charts that describes how you show affection to each other", never "you will argue" or "a good week for a talk".
- No compatibility scores, no rankings.
- Removing the partner deletes their data.

## 5. How it fits the existing tools without breaking the plugins

The plugins are submitted (OpenAI and Anthropic, server 0.5.1, 13 tools). Their names, inputs and outputs must not change.

- **No changes to the 13 tools.** The calendar is built on the bot side out of tools that already exist: the natal chart and transit search the Astrologer bot already uses from the engine, plus get_compatibility, get_sky_calendar and get_upcoming_events for links and context.
- **If a new tool is needed** (for example a single call that returns "exact transits to this chart between two dates"), it is added as a new, separately named tool in a later server version (0.6.0). It does not touch the existing 13, and the listings can be updated in a later review round. The scope assumes we first try to do it with the existing tools.
- **Reuse from PR #77:** the facts builder (bots/astrologer/facts), the reading checker, the dash removal step and the grading set. The weekly note gets its own small writer prompt and its own checker pass.
- **Routine:** a weekly Grok Bot routine per subscribed person. Each run: load profile, call the engine for the week, build a facts sheet, write the note, run the checker and the dash removal, send.

## 6. Data and accuracy moat

What a copycat app cannot match quickly:
- **Verified math.** All 13 tools matched Swiss Ephemeris (worst planet error 0.0055 degrees) and 126 sky events matched to seconds or minutes. The weekly note uses the same engine and can say "checked against an independent ephemeris" honestly.
- **Facts never typed by the model.** Every aspect name and date is copied from an engine line and checked automatically. The grading went from 11 charts with serious errors to 0 across 64 hard test charts (midnight births, daylight saving gaps, high latitudes, old dates).
- **The zodiacs.org page graph.** Every line links into a real page on the site, which also helps the site's search traffic.
- **Saved profiles and habit.** A weekly note that is right every week builds trust that a one off chart reading cannot.

## 7. Rollout

1. Dias reviews this doc and answers the open questions below.
2. Build the weekly transit search on the bot side with existing tools (draft PR in the engine repo, bots/astrologer).
3. Weekly note writer prompt, checker pass, dash removal and tests.
4. Grade 64 test charts times 4 sample weeks with the same blind grader, plus a separate check that every link resolves.
5. Partner section, then grade 20 sample pairs.
6. Private test: Dias and two or three trusted people for four Mondays.
7. Marketplace listing draft (text only, nothing published): name "Astrologer: Personal Sky Calendar", short description "Your birth chart, and the exact sky contacts to it each week, explained in plain words with links to zodiacs.org. Descriptive only.", 3 screenshots of a sample note on synthetic data. Dias approves before anything goes live.
8. Launch as part of the Astrologer bot template after Dias says go.

## 8. Effort and Max usage

| Step | Rough effort |
|---|---|
| Weekly transit search and facts sheet | 1 to 2 days |
| Note writer, checker pass, tests | 1 to 2 days |
| Grading (64 charts x 4 weeks) and fixes | 1 to 2 days |
| Partner section and grading | 1 to 2 days |
| Private test and listing draft | 4 weeks of Mondays, little work each |

About 5 to 8 working days of build, plus the four week private test.

**Max usage (claude -p only, never the API):** each grading pass is about 256 notes written and 256 graded, roughly 500 to 600 Opus calls, about 2 to 3 hours at 3 in parallel. That is several times one v10 run (about 160 calls), so it is best split over two days to stay under Max limits. Running the live weekly notes afterwards is per user, one short write per person per Monday; whether those run on Max or on another paid model is an open question below.

## 9. Open questions for Dias

1. Delivery: inside Grok Bot chat only, or also email? Email means storing an address.
2. Which model writes the live weekly notes once real people use it? Max is a personal plan and may not be the right home for a public product.
3. Free for everyone, or part of a paid tier later? (No price talk in the copy either way.)
4. Default send time: 08:00 local, or let people pick?
5. Partner consent: is "my partner agreed" from the user enough, or should the partner confirm in their own chat?
6. Should Moon contacts ever appear (for example a full Moon on a natal planet), or keep the note to slower planets only?
7. Do you want a Russian version from day one, since the site already has Russian pages?
8. Is a new MCP tool in a later version (0.6.0) acceptable if the existing 13 turn out too slow for a weekly scan?
