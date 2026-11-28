# Conditions-to-check packs

The `launch`, `contract-signing` and `travel` packs are editable examples of
traditional astrology conditions to check. They are not predictions,
probabilities, empirically validated activity recommendations or verbatim rule
sets attributed to a historical author. Their choices, weights, station
margins and aspect allowance are workbench policy choices. Changing the activity
label does not change any rule.

`listPresetPacks()` returns immutable catalog metadata under
`electional-presets/v1`. `createPresetRuleSet(name, context)` returns a complete,
detached and frozen `electional/v1` document through the existing strict
validator. Context requires `location`, a resolved UTC `range`, `houseSystem`
and `utcOffsetMinutes`. Unknown context fields or names reject. The CLI's
[`preset` command](CLI.md) exposes the same generator. Nothing is calculated
until that document is explicitly searched.

## Declared condition choices

Every pack checks for a non-void Moon under the engine's `traditional` body
convention and direct Mercury. Launch also checks direct Venus. Every pack
checks avoidance of Mercury stations within one elapsed day; launch includes
Venus stations too. This margin is an authored choice, including the existing
inclusive edge and numerical uncertainty conventions in [AVOIDANCE.md](AVOIDANCE.md).
It is not a historical prescription or a measured threshold of activity risk.

Other rules are preferences. Each declares weight `1` as an equal internal
comparison choice. Public CLI results report their states without emitting
scores or ranks. Unknown preferences remain unknown. A preference
failure does not exclude otherwise eligible hard-rule windows.

| Pack | Additional conditions to check |
| --- | --- |
| `launch` | Sun or Jupiter planetary hour; Moon in Waxing Crescent, First Quarter or Waxing Gibbous; either Venus or Jupiter in any angular house, meaning houses `1`, `4`, `7`, `10`. |
| `contract-signing` | Mercury planetary hour; Moon in Taurus or Libra; Moon applying by sextile or trine to Mercury within the declared `3` degree cap. |
| `travel` | Mercury or Jupiter planetary hour; Moon in Gemini or Sagittarius; Jupiter in house `9`. |

House preferences use the declared house system with `polarFallback: reject`.
Angular-house membership is a house criterion, not proximity to an angle by
longitude. The launch benefic criterion matches any selected body; the travel
criterion selects Jupiter alone. Applying uses the existing configured-aspect
API and its motion classification. [CHARTS.md](CHARTS.md) describes native
arithmetic and unresolved edges. The launch phase preference excludes the
engine's New Moon and Full Moon phase categories; category labels are not exact
elongation thresholds invented by the preset generator.

All hour rules carry the explicitly supplied fixed offset. It owns solar-day
dates and weekdays; it does not follow an IANA zone or daylight-saving changes.
Missing sunrise or sunset remains unresolved under [HOURS.md](HOURS.md).
Moon-not-void lookahead and station padding consume shared work and can reach
beyond the input range. Source coverage refusals are preserved.

The rule vocabulary also supports eclipse avoidance, explicit angular orbs,
other applying configurations and one synthetic natal synastry chart. These
packs leave those choices to an edited document. An eclipse rule requires an
explicit model in the controls file. Adding synastry requires a matching
`synthetic: true` natal input under [RULES.md](RULES.md); use invented data only.

## Relation to existing definitions and evidence

The underlying non-void convention and classical body set are documented in
the engine's [void-of-course guide](../docs/techniques.md#the-void-of-course-moon),
which discusses William Lilly, *Christian Astrology* (1647), p. 112, and the
engine's exact-perfection interpretation. Solar-day division and hour rulers
are the existing engine definitions in its
[planetary-hours guide](../docs/sky.md#planetary-hours), citing Chaucer's
*Treatise on the Astrolabe* II.10 and Cassius Dio's *Roman History* 37.18-19.
Those references define the reused calculations; they do not substantiate
this workbench's activity-specific packs. No new historical text, ephemeris
table or calculation algorithm is copied here.

[test/presets.electional-check.ts](test/presets.electional-check.ts) enforces
every choice and numeric policy in this document over invented context inputs.
It checks schema/JSON round trips, explicit offset transport, detached immutable
copies and rejection of invalid contexts. The CLI ESM check round-trips every
pack over the synthetic span stated in its committed evidence record.
These tests establish authored configuration behavior, not predictive validity
or astronomical accuracy. [references/README.md](references/README.md) records
the independent astronomical evidence used by the existing rule evaluators.
