# Synthetic TT chart campaign

Status: complete. Completed synthetic charts: 64; requested: 64.

Exact command argument vector: `["node","crosscheck/tools/campaign.mjs","crosscheck/runtime/p4-pilot.json","report"]`.
Runtime: `{"arch":"x64","node":"v22.23.3","platform":"linux"}`.
Campaign SHA-256: `deb432ab2a0380e667cdd99713b22f011ee5d542a0ce172f1159e46d431558ac`.
Engine build SHA-256: `227ac0feb3066f6cbbd6bd0efad7886bf06e463fe419f1162114c02acff0064b`.
Executable tooling SHA-256: `6402b7cf585ab1622ccae4958dfa3d9fd3577b0264a251171102f1e0fc1512ac`.

Sampling interval in epoch milliseconds: [-5364662400000, 7258118400000). This is the configured distribution, not continuous coverage or observed extrema.
The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.
Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.
Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.

Reference groups:

| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Reason |
| --- | --- | --- | ---: | ---: | --- |
| DE440 | available | [-5364662400000, 7258118400000) | 768 | 512 | Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval. |
| DE441 | empty | none | 0 | 0 | The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested. |

Residual counts sum coordinate comparisons, not charts. Empty groups have no requested interval or measured coverage. Unavailable exact centers have no numerical errors or maxima.

Engine minus JPL residuals:

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| JPL.DE440.Jupiter.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | 64 | 64 | 0 | 0 | 0 | 0 | 10000 | 20.108481463510486 | 1600.10287889326 | 1968.0562288544702 | 1967.9534976482828 | 4375.440821886063 |
| JPL.DE440.Mercury.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.4832806650594105 | 1.8051571214618507 | 2.6452370072225744 | 2.600715021519962 | 7.022982095963393 |
| JPL.DE440.Mercury.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.2785856938736231 | 2.316471655908714 | 3.204668213559221 | 3.192536353773564 | 10.848050015192712 |
| JPL.DE440.Moon.distance | km | 64 | 64 | 0 | 0 | 0 | 0 | 10000 | -10.825291501138963 | 10.825291501138963 | 10.933713009337959 | 1.5359505480107905 | 14.289762104745023 |
| JPL.DE440.Moon.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.022463301640500935 | 0.4475632207715378 | 0.6054149558506585 | 0.604998073424257 | 1.4650009290368526 |
| JPL.DE440.Moon.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 1.012759028007082 | 1.5538461083515642 | 2.237650142928979 | 1.995343908538132 | 7.588691147066129 |
| JPL.DE440.Neptune.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | 64 | 64 | 0 | 0 | 0 | 0 | 10000 | 9.594881808850918 | 541.4699427667074 | 660.951004364409 | 660.8813572899413 | 1659.0005342066288 |
| JPL.DE440.Sun.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0.05061882786869204 | 0.7367272548387573 | 0.9002023028376004 | 0.8987780150289161 | 2.1882775259943203 |
| JPL.DE440.Sun.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.1416529863583094 | 0.37964171178899164 | 0.47757459965063886 | 0.4560832486369574 | 1.2426967961800983 |
| JPL.DE440.Uranus.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | 64 | 64 | 0 | 0 | 0 | 0 | 10000 | -0.9973109009442851 | 1130.5928025731118 | 1387.5004941486734 | 1387.5001357238777 | 3742.743398055434 |
| JPL.DE440.Venus.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.46620422258789307 | 1.5403437639431174 | 2.2142682965984504 | 2.164633389782719 | 6.99152426488574 |
| JPL.DE440.Venus.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.07883926407075131 | 1.5310574064436366 | 2.4298412434599697 | 2.428561886973415 | 10.604448785943532 |
| JPL.DE441.Jupiter.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | 0 | 0 | 0 | 0 | 64 | 0 | 10000 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| JPL.housesNodesAngles | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Separate JPL convention differences:

These residuals compare the relativistic aberration direction with the Newtonian CN+S direction for the same reference states and frame. They are not engine errors, a complete model correction or an independent truth comparison. They are never subtracted from aggregate engine errors.

| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Convention.DE440.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -5.664180090291047e-7 | 0.000002496608555486871 | 0.0000035602469672018213 | 0.000003514901009490491 | 0.000010159220664718305 |
| Convention.DE440.Mercury.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.000013918133845436387 | 0.0002504420606896929 | 0.0002755882031536626 | 0.0002752365224088637 | 0.0004059206730744336 |
| Convention.DE440.Moon.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Moon.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 0 | 0 | 0 | 0 | 0 |
| Convention.DE440.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 3.056641572580475e-11 | 2.5219483431563115e-10 | 3.212137252111609e-10 | 3.197560812458591e-10 | 7.929123178353203e-10 |
| Convention.DE440.Sun.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 6.025707932622026e-7 | 0.000010020279006539567 | 0.000011259874613691341 | 0.000011243739802892902 | 0.00001785574568202719 |
| Convention.DE440.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | 8.075924074987285e-8 | 0.000008783055477492663 | 0.000013578992443666684 | 0.000013578752289153463 | 0.00004228070373812898 |
| Convention.DE440.Venus.lon | arcseconds | 64 | 64 | 0 | 0 | 0 | 0 | 60 | -0.000009200876860404605 | 0.00037955684675239354 | 0.0004072023910022302 | 0.00040709842925628297 | 0.0005252707069303142 |
| Convention.DE441.Jupiter.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | 0 | 0 | 0 | 0 | 64 | 0 | 60 | unavailable | unavailable | unavailable | unavailable | unavailable |

Engine minus JPL absolute-error percentiles:

Median, p99 and p99.9 select exact nearest ranks ceil(n*p) among absolute residuals. The histogram locates each rank exactly; only its value is approximated.
Each inclusive [lower, upper] interval encloses that order statistic in the channel unit. No midpoint or interpolated value is claimed. Maximum absolute residuals above are exact sample maxima.
The fixed histogram has an exact zero bucket, an underflow bucket below 2^-40, 16 equal subdivisions per power-of-two interval from 2^-40 to 2^40, and an overflow bucket starting at 2^40.
Regular bucket width is at most lower/16. Underflow and overflow have no relative-width guarantee; overflow is bounded by the exact observed maximum. Histogram storage is bounded independently of chart count.
Channels without a histogram, including historical statistics, have unavailable percentiles. Empty groups have unavailable percentiles and maxima.

| Channel | Unit | Median absolute interval | p99 absolute interval | p99.9 absolute interval |
| --- | --- | --- | --- | --- |
| JPL.DE440.Jupiter.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Mercury.distance | km | [1408, 1472] | [4352, 4375.440821886063] | [4352, 4375.440821886063] |
| JPL.DE440.Mercury.lat | arcseconds | [1, 1.0625] | [7, 7.022982095963393] | [7, 7.022982095963393] |
| JPL.DE440.Mercury.lon | arcseconds | [1.625, 1.6875] | [10.5, 10.848050015192712] | [10.5, 10.848050015192712] |
| JPL.DE440.Moon.distance | km | [10.5, 11] | [14, 14.289762104745023] | [14, 14.289762104745023] |
| JPL.DE440.Moon.lat | arcseconds | [0.296875, 0.3125] | [1.4375, 1.4650009290368526] | [1.4375, 1.4650009290368526] |
| JPL.DE440.Moon.lon | arcseconds | [1, 1.0625] | [7.5, 7.588691147066129] | [7.5, 7.588691147066129] |
| JPL.DE440.Neptune.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Sun.distance | km | [512, 544] | [1600, 1659.0005342066288] | [1600, 1659.0005342066288] |
| JPL.DE440.Sun.lat | arcseconds | [0.65625, 0.6875] | [2.125, 2.1882775259943203] | [2.125, 2.1882775259943203] |
| JPL.DE440.Sun.lon | arcseconds | [0.328125, 0.34375] | [1.1875, 1.2426967961800983] | [1.1875, 1.2426967961800983] |
| JPL.DE440.Uranus.distance | km | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE440.Venus.distance | km | [960, 992] | [3712, 3742.743398055434] | [3712, 3742.743398055434] |
| JPL.DE440.Venus.lat | arcseconds | [0.90625, 0.9375] | [6.75, 6.99152426488574] | [6.75, 6.99152426488574] |
| JPL.DE440.Venus.lon | arcseconds | [0.9375, 0.96875] | [10.5, 10.604448785943532] | [10.5, 10.604448785943532] |
| JPL.DE441.Jupiter.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.distance | km | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable |
| JPL.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable |
| JPL.housesNodesAngles | arcseconds | unavailable | unavailable | unavailable |
| Swiss.positions | arcseconds | unavailable | unavailable | unavailable |

Separate convention-difference absolute percentiles:

| Channel | Unit | Median absolute interval | p99 absolute interval | p99.9 absolute interval |
| --- | --- | --- | --- | --- |
| Convention.DE440.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Mars.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Mercury.lat | arcseconds | [0.0000013709068298339844, 0.000001430511474609375] | [0.000010013580322265625, 0.000010159220664718305] | [0.000010013580322265625, 0.000010159220664718305] |
| Convention.DE440.Mercury.lon | arcseconds | [0.000274658203125, 0.0002899169921875] | [0.000396728515625, 0.0004059206730744336] | [0.000396728515625, 0.0004059206730744336] |
| Convention.DE440.Moon.lat | arcseconds | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Moon.lon | arcseconds | [0, 0] | [0, 0] | [0, 0] |
| Convention.DE440.Neptune.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Neptune.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Pluto.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Saturn.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Sun.lat | arcseconds | [2.1100277081131935e-10, 2.1827872842550278e-10] | [7.8580342233181e-10, 7.929123178353203e-10] | [7.8580342233181e-10, 7.929123178353203e-10] |
| Convention.DE440.Sun.lon | arcseconds | [0.000009059906005859375, 0.0000095367431640625] | [0.0000171661376953125, 0.00001785574568202719] | [0.0000171661376953125, 0.00001785574568202719] |
| Convention.DE440.Uranus.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Uranus.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE440.Venus.lat | arcseconds | [0.0000040531158447265625, 0.000004291534423828125] | [0.000041961669921875, 0.00004228070373812898] | [0.000041961669921875, 0.00004228070373812898] |
| Convention.DE440.Venus.lon | arcseconds | [0.0004425048828125, 0.000457763671875] | [0.000518798828125, 0.0005252707069303142] | [0.000518798828125, 0.0005252707069303142] |
| Convention.DE441.Jupiter.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Jupiter.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Mars.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Mercury.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Moon.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Neptune.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Pluto.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Saturn.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Sun.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Uranus.lon | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lat | arcseconds | unavailable | unavailable | unavailable |
| Convention.DE441.Venus.lon | arcseconds | unavailable | unavailable | unavailable |

Exclusions:

- Reproduction: node crosscheck/tools/campaign.mjs crosscheck/runtime/p4-pilot.json all, then report. Specification: {"name":"phase2-pilot","profile":"phase2","kernel":"de440","seed":"synthetic-phase2-pilot-v1","total":64,"shards":2}. Preserve external Swiss environment selectors if enabled.
- Only exact Sun/Moon/Mercury/Venus centers compared; no other planets, houses, nodes, angles, speeds or topocentric checks. No UTC/UT1 validation.
- Full DE440 covers the entire requested TT span; DE441 has no selected interval or measurements. Inactive group and missing exact-center verdicts are unsupported, never zero-error observations.
- JPL residuals use Moon NONE and other exact centers CN+REL without deflection. They retain backdated-observer aberration, light-time, frame and periodic TT/TDB model differences. Convention channels isolate CN+REL minus CN+S on the same independent states, not total model error.
- Distances use binary64 TT Julian dates in calc, which can round relative to natalChart millisecond inputs; JPL uses TT seconds converted to TDB. Distance maxima are in km and angular maxima in arcseconds.
- Swiss.positions is the legacy unavailable channel; optional per-body Swiss channels carry actual measurements. Fallback/error/unsupported verdicts contain no residuals.
- Sample maxima are not unsampled bounds; no throughput guarantee. Command records report invocation; reproduction command above runs all shards from scratch with identical inputs.

Reference identities: `{"ERFA":{"nutationSha256":"a5246d525e987eb587bbe786b2846160e01be85b5d12af573870b89235695f49"},"EngineBuild":{"dependencySha256":"2dbbbbc51c24153b75d9683140572bd1d8352e671d0e617792349150e745143c","nodeExecutableSha256":"fde6a4bf8d0562f7751d1a2d6cb9b417c4cfe107bbcb0aa3e9a24e125e348f48","outputSha256":"5acff9549ca3f1b85e02d2f104811c10397a9e2baaa516b66db2dc46c459d2c2","sourceSha256":"749502dcde3ed7e762418e32b012ba864fdf17d8288a368a161a08d41f0b2635"},"JPL":{"name":"de440.bsp","sha256":"a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5","source":"https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/de440.bsp"},"ReferencePlan":{"bodies":{"Jupiter":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","status":"unavailable","target":599},"Mars":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","status":"unavailable","target":499},"Mercury":{"center":399,"status":"available","target":199},"Moon":{"center":399,"status":"available","target":301},"Neptune":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","status":"unavailable","target":899},"Pluto":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","status":"unavailable","target":999},"Saturn":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","status":"unavailable","target":699},"Sun":{"center":399,"status":"available","target":10},"Uranus":{"center":399,"reason":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution.","status":"unavailable","target":799},"Venus":{"center":399,"status":"available","target":299}},"groups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"kernel":"de440.bsp","reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"kernelCoverage":{"format":"LTL-IEEE","segments":[{"center":0,"endTdbSeconds":20514081600,"endWord":2217924,"frame":1,"startTdbSeconds":-14200747200,"startWord":8065,"target":1,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":3021512,"frame":1,"startTdbSeconds":-14200747200,"startWord":2217925,"target":2,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4051108,"frame":1,"startTdbSeconds":-14200747200,"startWord":3021513,"target":3,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4490572,"frame":1,"startTdbSeconds":-14200747200,"startWord":4051109,"target":4,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":4817032,"frame":1,"startTdbSeconds":-14200747200,"startWord":4490573,"target":5,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5105824,"frame":1,"startTdbSeconds":-14200747200,"startWord":4817033,"target":6,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5356948,"frame":1,"startTdbSeconds":-14200747200,"startWord":5105825,"target":7,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5608072,"frame":1,"startTdbSeconds":-14200747200,"startWord":5356949,"target":8,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":5859196,"frame":1,"startTdbSeconds":-14200747200,"startWord":5608073,"target":9,"type":2},{"center":0,"endTdbSeconds":20514081600,"endWord":6738120,"frame":1,"startTdbSeconds":-14200747200,"startWord":5859197,"target":10,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":10856492,"frame":1,"startTdbSeconds":-14200747200,"startWord":6738121,"target":301,"type":2},{"center":3,"endTdbSeconds":20514081600,"endWord":14974864,"frame":1,"startTdbSeconds":-14200747200,"startWord":10856493,"target":399,"type":2},{"center":1,"endTdbSeconds":20514081600,"endWord":14974876,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974865,"target":199,"type":2},{"center":2,"endTdbSeconds":20514081600,"endWord":14974888,"frame":1,"startTdbSeconds":-14200747200,"startWord":14974877,"target":299,"type":2}]},"paddingSeconds":86400,"sampling":{"bounds":"half-open","endExclusive":"2200-01-01T00:00:00.000Z","endMs":7258118400000,"endTdbSeconds":6311390399.999828,"start":"1800-01-01T00:00:00.000Z","startMs":-5364662400000,"startTdbSeconds":-6311390399.999973,"timeScale":"TT"},"selection":"Full DE440 inside its padded supported interval; DE441 outside, part 2 before part 1"},"Swiss":{"status":"unavailable"}}`.
Conventions: `{"Swiss":"unavailable","conventionDifference":"Convention channels: CN+REL minus CN+S direction using the same JPL kernel, TT/TDB and frame; Moon zero. Separate model sensitivity, not engine error or a correction to aggregate maxima.","correction":"JPL Moon NONE; Sun Mercury Venus CN+REL with no deflection; Earth center 399; NAIF periodic TT/TDB","distance":"Engine calc apparent geocentric light path in au converted to km minus JPL converged light path; geometric Moon. calc uses binary64 JD = TT days since J2000 + 2451545; chart uses original millisecond instant.","frame":"IAU2006 bias/precession and unadjusted IAU2000B true ecliptic/equinox of date","input":"Synthetic TT; uniform sphere; random house systems; half-open 1800-01-01 to 2200-01-01","limitations":"Engine backdated-observer aberration, light-time, frame and truncated TT/TDB differences remain in residuals. No solar deflection or moving-body ray integration; convention delta isolates only the selected aberration models.","referenceGroups":{"DE440":{"intervals":[{"endMs":7258118400000,"startMs":-5364662400000}],"reason":"Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.","status":"available"},"DE441":{"intervals":[],"reason":"The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.","status":"empty"}},"residual":"JPL channels: engine minus relativistic JPL direction in arcseconds; distance in km","tolerance":"60 arcseconds and 10000 km screening only; fixed before pilot, not accuracy bounds","unavailableBodies":{"Jupiter":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 599. No system-barycenter substitution.","Mars":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 499. No system-barycenter substitution.","Neptune":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 899. No system-barycenter substitution.","Pluto":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 999. No system-barycenter substitution.","Saturn":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 699. No system-barycenter substitution.","Uranus":"Exact-center comparison unavailable with the selected kernel: No covered segment for exact NAIF target 799. No system-barycenter substitution."}}`.
