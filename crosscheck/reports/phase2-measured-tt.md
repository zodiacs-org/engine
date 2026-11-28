# Synthetic TT chart accuracy measurement

Measured 15360 synthetic charts drawn from the configured TT interval [1800-01-01T00:00:00.000Z, 2200-01-01T00:00:00.000Z), for Sun, Moon, Mercury and Venus only. This sampling interval is not continuous coverage or the observed extrema.

The largest measured absolute engine-versus-JPL differences were 20.628863252841256 arcseconds in longitude and 15.690152603462337 arcseconds in latitude.

The largest measured absolute engine-versus-Swiss instrument differences were 20.627267301438224 arcseconds in longitude and 15.692287875236133 arcseconds in latitude.

These are sample maxima with the conventions recorded below, not bounds for untested charts. Swiss-minus-JPL results and JPL convention differences remain separate.

Retained charts: 15360 of the requested 1000000. The final invocation completed its explicit budget of 4096 additional charts per selected shard (all shards). The requested target remains incomplete.

Measured campaign driver time across the recorded invocations: 721.986780018 seconds. This includes startup and the external adapter when enabled; it excludes resource scans and report rendering. No execution-time extrapolation is used.

DE441 has no selected interval or measurements.

Exact centers unavailable in this campaign: Jupiter, Mars, Neptune, Pluto, Saturn, Uranus. Their rows contain no numerical measurements.

Status: partial. Completed synthetic charts: 15360; requested: 1000000.

Exact command argument vector: `["node","crosscheck/reporting/final-campaign.mjs","crosscheck/runtime/campaigns/phase2-million-tt/final-bundle.json","crosscheck/runtime/campaigns/phase2-million-tt/resource-progress.json","phase2-measured-tt"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `e0134608ca96bdeb2ff4ff701c2936657f32d8f45fa838e4c3783c2e73b97be2`.
Engine build SHA-256: `227ac0feb3066f6cbbd6bd0efad7886bf06e463fe419f1162114c02acff0064b`.
Executable tooling SHA-256: `9cc02af073d1cdef5df63acc9a672880bdd80a28783ac856115cd276dd454d08`.

Sampling interval in epoch milliseconds: [-5364662400000, 7258118400000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

Swiss instrument: available. External optional test instrument; JPL remains the positional accuracy reference.
Swiss returned-flag responses: SWIEPH 61440; Moshier fallback 0; other backend fallback 0.
Flag-response counts use engine-minus-Swiss longitude channels only, so latitude channels and Swiss-minus-JPL comparisons do not duplicate them. Longitude verdict totals include inactive-group and unsupported-center outcomes and are not instrument request counts. Per-channel flags and fallback/error/unsupported verdicts remain in the tables and receipt.

Reference groups:

| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Engine/Swiss residuals | Swiss/JPL residuals | Reason |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| DE440 | available | [-5364662400000, 7258118400000) | 184320 | 122880 | 122880 | 122880 | Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval. |
| DE441 | empty | none | 0 | 0 | 0 | 0 | The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested. |

Residual counts sum coordinate comparisons, not charts. Empty groups have no requested interval or measured coverage. Unavailable exact centers have no numerical errors or maxima.

Engine minus JPL residuals:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.DE440.Jupiter.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 15360 | 15360 | 0 | 0 | 0 | 0 | 10000 | 44.29996907027187 | 1531.5392263463534 | 1927.8791681957407 | 1927.370125301178 | 8121.2498898506165 |
| JPL.DE440.Mercury.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.013757590428806497 | 1.9690138078350141 | 2.694365737035548 | 2.694330613272375 | 13.398667414551468 |
| JPL.DE440.Mercury.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.12919423052653473 | 2.179340272989565 | 2.846748182002699 | 2.843815054206992 | 14.114625990896457 |
| JPL.DE440.Moon.distance | km | 15360 | 15360 | 0 | 0 | 0 | 0 | 10000 | -10.524060307040676 | 10.524060307040687 | 10.642209275258619 | 1.581383227485095 | 16.416595032496843 |
| JPL.DE440.Moon.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.005621949918085155 | 0.42668311618832605 | 0.5711557832422878 | 0.5711281138328163 | 2.420556905280158 |
| JPL.DE440.Moon.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 1.3461168149516824 | 1.9612933033588311 | 2.7671036392128747 | 2.4176087505321178 | 10.432922880681872 |
| JPL.DE440.Neptune.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 15360 | 15360 | 0 | 0 | 0 | 0 | 10000 | -2.058636495862941 | 608.4027558752995 | 752.2097746491766 | 752.2069576210682 | 2389.296553105116 |
| JPL.DE440.Sun.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.007349390047212946 | 0.8310128286655496 | 1.0266478878671406 | 1.026621581756392 | 3.1255848852742876 |
| JPL.DE440.Sun.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.11776213298860595 | 0.4897768059928964 | 0.615161857133424 | 0.6037848876096664 | 2.3776774534781 |
| JPL.DE440.Uranus.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 15360 | 15360 | 0 | 0 | 0 | 0 | 10000 | 173.2487884893657 | 1075.8926971737767 | 1337.511970583979 | 1326.24399291473 | 4820.399586983025 |
| JPL.DE440.Venus.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.03681226326367372 | 1.4983081642174303 | 2.2487875104279964 | 2.248486185043249 | 15.690152603462337 |
| JPL.DE440.Venus.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.11814447687299884 | 1.6920598013388144 | 2.760531151519084 | 2.7580018348601034 | 20.628863252841256 |
| JPL.DE441.Jupiter.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | 0 | 0 | 0 | 0 | 15360 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Separate JPL convention differences:

These residuals compare the relativistic aberration direction with the Newtonian CN+S direction for the same reference states and frame. They are not engine errors, a complete model correction or an independent truth comparison. They are never subtracted from aggregate engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Convention.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -8.40656472109782e-7 | 0.000002469059538493369 | 0.000003553082858120657 | 0.0000034522013980315197 | 0.000010411949702415768 |
| Convention.DE440.Mercury.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 0.0000015037540546103399 | 0.00023806130882597643 | 0.0002640276112869072 | 0.0002640233289798716 | 0.00041342877921124455 |
| Convention.DE440.Moon.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Moon.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 2.105926973161767e-12 | 2.6228320792825355e-10 | 3.2991282524529004e-10 | 3.2990610381275637e-10 | 9.460559289090065e-10 |
| Convention.DE440.Sun.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -3.518942737201768e-7 | 0.00001078044690849822 | 0.000011991750740879647 | 0.000011986586513745806 | 0.00001825192157411948 |
| Convention.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -7.455191296392637e-8 | 0.000009469013933476936 | 0.000014314639424696186 | 0.000014314445286889034 | 0.000042825554302794444 |
| Convention.DE440.Venus.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.000001948602053047926 | 0.00037655648239542927 | 0.0004065143127046732 | 0.0004065096424241265 | 0.0005275704097584821 |
| Convention.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus Swiss instrument residuals:

These are comparisons with a second instrument, separate from engine accuracy versus JPL. Only SWIEPH returned flags contribute numerical residuals.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Swiss.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mercury.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.013157311233743424 | 1.9694762349115187 | 2.6947133115201845 | 2.6946811901308827 | 13.39945119050121 |
| Swiss.DE440.Mercury.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.1287653621566213 | 2.1792670847836684 | 2.846851538525544 | 2.843937967662787 | 14.11744004534512 |
| Swiss.DE440.Moon.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.006274054984814758 | 0.4504437398335301 | 0.6001337959792026 | 0.6001009992580045 | 2.483367240142975 |
| Swiss.DE440.Moon.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 2.0431826530208466 | 2.2795155453779836 | 3.163663325071305 | 2.4154027160695 | 11.171191123253266 |
| Swiss.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.007353149431084832 | 0.8310252988600254 | 1.0266835083798405 | 1.0266571762631287 | 3.1252470506146026 |
| Swiss.DE440.Sun.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.1175380929029179 | 0.48980267531696536 | 0.6151780746387743 | 0.6038450631022939 | 2.377314377304174 |
| Swiss.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.03666049100632741 | 1.4973564748328918 | 2.248683522185309 | 2.2483846626738275 | 15.692287875236133 |
| Swiss.DE440.Venus.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.11792531089253876 | 1.6923363201258506 | 2.7608921019587234 | 2.7583724947347026 | 20.627267301438224 |
| Swiss.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Swiss instrument minus JPL residuals:

These compare the same Swiss positions with the selected JPL reference and frame. Model and convention differences can contribute; no Swiss difference is subtracted from engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| SwissJPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mercury.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.0006002791950630095 | 0.004220391740079608 | 0.020978987596879686 | 0.020970397837857223 | 1.2061768844356058 |
| SwissJPL.DE440.Mercury.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.0004288683694206706 | 0.009280512011835917 | 0.02042582713115823 | 0.02042132429382755 | 0.5907809760628879 |
| SwissJPL.DE440.Moon.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 0.0006521050667296131 | 0.04009362354027579 | 0.0445526546456951 | 0.04454788204797756 | 0.06980789350214955 |
| SwissJPL.DE440.Moon.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.69706583807015 | 0.6970658380701507 | 0.6976248577873249 | 0.027922385255270542 | 0.7620072649288545 |
| SwissJPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | 0.000003759383871914707 | 0.0003437724295936567 | 0.0004699636638931979 | 0.0004699486274188083 | 0.001958510117916007 |
| SwissJPL.DE440.Sun.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.00022404008558806523 | 0.0007869548385584378 | 0.0010651200634251158 | 0.001041290924554908 | 0.005235748372456328 |
| SwissJPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.00015177225734627127 | 0.0041541780949388785 | 0.023971103319194758 | 0.023970622843835547 | 1.1439315982863074 |
| SwissJPL.DE440.Venus.lon | arcseconds | 15360 | 15360 | 0 | 0 | 0 | 0 | 60 | -0.00021916598149942295 | 0.010876734409475125 | 0.02622261282592816 | 0.026221696926230484 | 0.7934338586210288 |
| SwissJPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Other comparison channels:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 15360 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus JPL absolute-error percentiles:

Median, p99 and p99.9 select exact nearest ranks ceil(n*p) among absolute residuals. The histogram locates each rank exactly; only its value is approximated.
Each inclusive [lower, upper] interval encloses that order statistic in the channel unit. No midpoint or interpolated value is claimed. Maximum absolute residuals above are exact sample maxima.
The fixed histogram has an exact zero bucket, an underflow bucket below 2^-40, 16 equal subdivisions per power-of-two interval from 2^-40 to 2^40, and an overflow bucket starting at 2^40.
Regular bucket width is at most lower/16. Underflow and overflow have no relative-width guarantee; overflow is bounded by the exact observed maximum. Histogram storage is bounded independently of chart count.
Channels without a histogram, including historical statistics, have unavailable percentiles. Empty groups have unavailable percentiles and maxima.

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| JPL.DE440.Jupiter.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 8121.2498898506165 | [6656, 6912] | [4864, 5120] | [1280, 1344] |
| JPL.DE440.Mercury.lat | arcseconds | 13.398667414551468 | [11.5, 12] | [8.5, 9] | [1.375, 1.4375] |
| JPL.DE440.Mercury.lon | arcseconds | 14.114625990896457 | [11.5, 12] | [8, 8.5] | [1.6875, 1.75] |
| JPL.DE440.Moon.distance | km | 16.416595032496843 | [14.5, 15] | [14, 14.5] | [10.5, 11] |
| JPL.DE440.Moon.lat | arcseconds | 2.420556905280158 | [1.9375, 2] | [1.625, 1.6875] | [0.3125, 0.328125] |
| JPL.DE440.Moon.lon | arcseconds | 10.432922880681872 | [9, 9.5] | [7.75, 8] | [1.1875, 1.25] |
| JPL.DE440.Neptune.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 2389.296553105116 | [2176, 2304] | [1856, 1920] | [512, 544] |
| JPL.DE440.Sun.lat | arcseconds | 3.1255848852742876 | [2.875, 3] | [2.5, 2.625] | [0.71875, 0.75] |
| JPL.DE440.Sun.lon | arcseconds | 2.3776774534781 | [1.9375, 2] | [1.5625, 1.625] | [0.40625, 0.421875] |
| JPL.DE440.Uranus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 4820.399586983025 | [3840, 3968] | [3328, 3456] | [896, 928] |
| JPL.DE440.Venus.lat | arcseconds | 15.690152603462337 | [13, 13.5] | [8, 8.5] | [0.96875, 1] |
| JPL.DE440.Venus.lon | arcseconds | 20.628863252841256 | [17, 18] | [11, 11.5] | [1, 1.0625] |
| JPL.DE441.Jupiter.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Separate convention-difference absolute percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| Convention.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 0.000010411949702415768 | [0.000010013580322265625, 0.000010411949702415768] | [0.0000095367431640625, 0.000010013580322265625] | [0.0000015497207641601562, 0.0000016093254089355469] |
| Convention.DE440.Mercury.lon | arcseconds | 0.00041342877921124455 | [0.0004119873046875, 0.00041342877921124455] | [0.000396728515625, 0.0004119873046875] | [0.0002593994140625, 0.000274658203125] |
| Convention.DE440.Moon.lat | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Moon.lon | arcseconds | 0 | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 9.460559289090065e-10 | [8.440110832452774e-10, 8.731149137020111e-10] | [7.566995918750763e-10, 7.8580342233181e-10] | [2.255546860396862e-10, 2.3283064365386963e-10] |
| Convention.DE440.Sun.lon | arcseconds | 0.00001825192157411948 | [0.00001811981201171875, 0.00001825192157411948] | [0.0000171661376953125, 0.00001811981201171875] | [0.000011920928955078125, 0.00001239776611328125] |
| Convention.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 0.000042825554302794444 | [0.0000400543212890625, 0.000041961669921875] | [0.00003814697265625, 0.0000400543212890625] | [0.00000476837158203125, 0.0000050067901611328125] |
| Convention.DE440.Venus.lon | arcseconds | 0.0005275704097584821 | [0.000518798828125, 0.0005275704097584821] | [0.000518798828125, 0.0005275704097584821] | [0.0004425048828125, 0.000457763671875] |
| Convention.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Engine minus Swiss instrument absolute-error percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| Swiss.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Mercury.lat | arcseconds | 13.39945119050121 | [11.5, 12] | [8.5, 9] | [1.375, 1.4375] |
| Swiss.DE440.Mercury.lon | arcseconds | 14.11744004534512 | [11.5, 12] | [8, 8.5] | [1.6875, 1.75] |
| Swiss.DE440.Moon.lat | arcseconds | 2.483367240142975 | [2, 2.125] | [1.6875, 1.75] | [0.328125, 0.34375] |
| Swiss.DE440.Moon.lon | arcseconds | 11.171191123253266 | [9.5, 10] | [8.5, 9] | [1.375, 1.4375] |
| Swiss.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Sun.lat | arcseconds | 3.1252470506146026 | [2.875, 3] | [2.5, 2.625] | [0.71875, 0.75] |
| Swiss.DE440.Sun.lon | arcseconds | 2.377314377304174 | [1.9375, 2] | [1.5625, 1.625] | [0.40625, 0.421875] |
| Swiss.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE440.Venus.lat | arcseconds | 15.692287875236133 | [13, 13.5] | [8, 8.5] | [0.96875, 1] |
| Swiss.DE440.Venus.lon | arcseconds | 20.627267301438224 | [17, 18] | [11, 11.5] | [1, 1.0625] |
| Swiss.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Swiss instrument minus JPL absolute-error percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| SwissJPL.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Mercury.lat | arcseconds | 1.2061768844356058 | [0.2109375, 0.21875] | [0.0703125, 0.07421875] | [0.00054931640625, 0.000579833984375] |
| SwissJPL.DE440.Mercury.lon | arcseconds | 0.5907809760628879 | [0.21875, 0.2265625] | [0.06640625, 0.0703125] | [0.004150390625, 0.00439453125] |
| SwissJPL.DE440.Moon.lat | arcseconds | 0.06980789350214955 | [0.06640625, 0.06980789350214955] | [0.06640625, 0.06980789350214955] | [0.04296875, 0.044921875] |
| SwissJPL.DE440.Moon.lon | arcseconds | 0.7620072649288545 | [0.75, 0.7620072649288545] | [0.75, 0.7620072649288545] | [0.6875, 0.71875] |
| SwissJPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Sun.lat | arcseconds | 0.001958510117916007 | [0.001708984375, 0.00177001953125] | [0.0013427734375, 0.00140380859375] | [0.00023651123046875, 0.000244140625] |
| SwissJPL.DE440.Sun.lon | arcseconds | 0.005235748372456328 | [0.004150390625, 0.00439453125] | [0.003173828125, 0.0032958984375] | [0.000579833984375, 0.0006103515625] |
| SwissJPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE440.Venus.lat | arcseconds | 1.1439315982863074 | [0.25, 0.265625] | [0.11328125, 0.1171875] | [0.00048828125, 0.000518798828125] |
| SwissJPL.DE440.Venus.lon | arcseconds | 0.7934338586210288 | [0.28125, 0.296875] | [0.09375, 0.09765625] | [0.004150390625, 0.00439453125] |
| SwissJPL.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable | unavailable |
| SwissJPL.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable | unavailable |

Other comparison channel absolute percentiles:

| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |
| --- | --- | ---: | --- | --- | --- |
| JPL.housesNodesAngles | arcseconds | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | unavailable | unavailable | unavailable | unavailable |

Exclusions:

- Partial numerical reproduction from empty checkpoints: recreate the same specification and execute the recorded resource receipt wrapper commands in order, with the same external Swiss selectors. Prepare final-bundle.json from the preserved campaign identity and resulting shard states as documented in VALIDATION.md, then run this aggregate export command. Specification: {"kernel":"de440","name":"phase2-million-tt","profile":"phase2","seed":"synthetic-phase2-million-v1","shards":3,"total":1000000}.
- Only exact Sun/Moon/Mercury/Venus centers compared; no other planets, houses, nodes, angles, speeds or topocentric checks. No UTC/UT1 validation.
- Full DE440 covers the entire requested TT span; DE441 has no selected interval or measurements. Inactive group and missing exact-center verdicts are unsupported, never zero-error observations.
- JPL residuals use Moon NONE and other exact centers CN+REL without deflection. They retain backdated-observer aberration, light-time, frame and periodic TT/TDB model differences. Convention channels isolate CN+REL minus CN+S on the same independent states, not total model error.
- Distances use binary64 TT Julian dates in calc, which can round relative to natalChart millisecond inputs; JPL uses TT seconds converted to TDB. Distance maxima are in km and angular maxima in arcseconds.
- Swiss and SwissJPL channels use the same synthetic chart, TT Julian date and one adapter response per compared body. Swiss is a second instrument, not the accuracy arbiter. The receipt records version, adapter/binding hashes, ephemeris SHA-256 identities and returned-flag counts.
- Swiss apparent places include its deflection model and lunar apparent corrections, unlike JPL without deflection and geometric Moon. Frame and TT Julian-date rounding differences also remain in these separate instrument comparisons.
- Swiss.positions is the legacy unavailable channel; per-body Swiss channels carry measurements only when configured. Non-SWIEPH responses, including Moshier fallback, error and unsupported verdicts contain no residuals.
- Sample maxima are not unsampled bounds; no throughput guarantee. Command records report invocation; reproduction command above runs all shards from scratch with identical inputs.
- Aggregate rendering source: crosscheck/reporting/final-campaign.mjs; SHA-256 08b1041db0e92d2eee9195968e71945752889911bf85bb2030c88020f0d0e967. The frozen executable tooling digest identifies the measurement, not this later presentation module.
- This is the largest completed campaign prefix retained after the bounded continuation. The explicit case budget limits this session; the requested million charts are incomplete. The matching resource receipt records actual driver elapsed time without extrapolating completion time.

Reference identities: `{"ERFA":{"nutationSha256":"a5246d525e987eb587bbe786b2846160e01be85b5d12af573870b89235695f49"},"EngineBuild":{"dependencySha256":"2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c","nodeExecutableSha256":"fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48","outputSha256":"5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2","sourceSha256":"749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635"},"JPL":{"name":"de440.bsp","sha256":"a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5","source":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp"},"ReferencePlan":{"bodies":{"Jupiter":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","status":"unavailable","target":599},"Mars":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","status":"unavailable","target":499},"Mercury":{"center":399,"status":"available","target":199},"Moon":{"center":399,"status":"available","target":301},"Neptune":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","status":"unavailable","target":899},"Pluto":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","status":"unavailable","target":999},"Saturn":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","status":"unavailable","target":699},"Sun":{"center":399,"status":"available","target":10},"Uranus":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution.","status":"unavailable","target":799},"Venus":{"center":399,"status":"available","target":299}},"groups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"kernel":"de440.bsp","reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"kernelCoverage":{"format":"LTL-IEEE","segments":[{"center":0,"endTdbSeconds":20514081600,"endWord":2217924,"frame":1,"startTdbSeconds":-14200747200,"startWord":8065,"target":1,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":3021512,"frame":1,"startTdbSeconds":-14200747200,"startWord":2217925,"target":2,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4051108,"frame":1,"startTdbSeconds":-14200747200,"startWord":3021513,"target":3,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4490572,"frame":1,"startTdbSeconds":-14200747200,"startWord":4051109,"target":4,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4817032,"frame":1,"startTdbSeconds":-14200747200,"startWord":4490573,"target":5,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5105824,"frame":1,"startTdbSeconds":-14200747200,"startWord":4817033,"target":6,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5356948,"frame":1,"startTdbSeconds":-14200747200,"startWord":5105825,"target":7,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5608072,"frame":1,"startTdbSeconds":-14200747200,"startWord":5356949,"target":8,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5859196,"frame":1,"startTdbSeconds":-14200747200,"startWord":5608073,"target":9,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":6738120,"frame":1,"startTdbSeconds":-14200747200,"startWord":5859197,"target":10,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":10856492,"frame":1,"startTdbSeconds":-14200747200,"startWord":6738121,"target":301,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":14974864,"frame":1,"startTdbSeconds":-14200747200,"startWord":10856493,"target":399,"type":2},{"center":1,"endTdbSeconds":20514081600,"endWord":14974876,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974865,"target":199,"type":2},{"center":2,"endTdbSeconds":20514081600,"endWord":14974888,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974877,"target":299,"type":2}]},"paddingSeconds":86400,"sampling":{"bounds":"half-open","endExclusive":"2200-01-01T00:00:00.000Z","endMs":7258118400000,"endTdbSeconds":6311390399.999828,"start":"1800-01-01T00:00:00.000Z","startMs":-5364662400000,"startTdbSeconds":-6311390399.999973,"timeScale":"TT"},"selection":"Full DE440 inside its padded supported interval; DE441 outside, part 2 before part 1"},"Swiss":{"adapterSha256":"278e146f5c576493622d71dfd957bf88c988aa16730cd910fd73003961912542","binding":"pyswisseph 20230604","bindingSha256":"865fc01ea4ce1233415a1fc6f384b372f3356ac2c137ef266b9de87df67176e2","engineVersion":"2.10.03","ephemerisFiles":{"seas_18.se1":"a2cd8fc33807c78ca9a700c91c2e042258b12fc4796519e00781440b5ad8b2e2","semo_18.se1":"1ca07bd67c24374d77226180c20a4f9996cba013697894810518e7eb582ca4f7","sepl_18.se1":"ca1393ceab3a44fbc895887cf789c68819ae6a1cbc9b22225872dbe4ccd99a66"}}}`.
Conventions: `{"Swiss":"Optional external apparent geocentric true-of-date instrument; SWIEPH responses only. Swiss channels: engine minus Swiss; SwissJPL channels: Swiss minus JPL, in arcseconds. Same chart and a single adapter response per exact body.","SwissConventionDifference":"Swiss apparent places include its deflection model and lunar apparent corrections; JPL has no deflection and uses geometric Moon. Frame, ephemeris and TT Julian-date rounding differences remain. Instrument comparisons are separate from JPL accuracy and convention channels; never subtract aggregate maxima.","conventionDifference":"Convention channels: CN+REL minus CN+S direction using the same JPL kernel, TT/TDB and frame; Moon zero. Separate model sensitivity, not engine error or a correction to aggregate maxima.","correction":"JPL Moon NONE; Sun Mercury Venus CN+REL with no deflection; Earth center 399; NAIF periodic TT/TDB","distance":"Engine calc apparent geocentric light path in au converted to km minus JPL converged light path; geometric Moon. calc uses binary64 JD = TT days since J2000 + 2451545; chart uses original millisecond instant.","frame":"IAU2006 bias/precession and unadjusted IAU2000B true ecliptic/equinox of date","input":"Synthetic TT; uniform sphere; random house systems; half-open 1800-01-01 to 2200-01-01","limitations":"Engine backdated-observer aberration, light-time, frame and truncated TT/TDB differences remain in residuals. No solar deflection or moving-body ray integration; convention delta isolates only the selected aberration models.","referenceGroups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"residual":"JPL channels: engine minus relativistic JPL direction in arcseconds; distance in km","tolerance":"60 arcseconds and 10000 km screening only; fixed before pilot, not accuracy bounds","unavailableBodies":{"Jupiter":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","Mars":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","Neptune":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","Pluto":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","Saturn":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","Uranus":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution."}}`.
