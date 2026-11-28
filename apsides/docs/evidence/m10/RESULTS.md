# Independent apsis validation

Acceptance status: **FAIL**. Limits are the unchanged M2 registration.

This report is reproduced by `scripts/validate-references.mjs` and checked by
`test/validation-evidence.vitest.ts`. Its inputs are independent Horizons fixtures,
not stored engine expectations. Raw measurements go to ignored `.generated/validation/`.

Runtime: Node 22.22.2, linux, x64.

| Input | SHA-256 |
| --- | --- |
| M2 registration | `258cb2831f5d762dc59857d748fe4100aabee03e7203807be7f085566461ccf6` |
| Development manifest | `4a5f59ab67fbe97c595d80694e0df8a1a2307b5b3a830cc0881c50e6de5afe99` |
| Held-out manifest | `c44c281f183199e6e688a6e3c19194024f55a81cc352b5357f2e4736c1b09c9b` |
| Engine archive | `c4d3754de899fb98882331e6d7b9ce3ce77fb2072baeb002aa0ef8c77b0ab0f6` |
| Dependency lock | `f5b0d4bf2af8c58fafc1072fb1aa7bb51a08b05e4c7148833b3428efcf58eefe` |
| Implementation src/ | `0214c2866f25529c4e7b7fc5b3a63e2b6046dc89a020cd4baf8d3d112141e4ce` |
| Validation scripts | `2e9423a3768f6c8c8244434500ea749636f1ab06ad0a34c154ab495037081b22` |

The implementation digest binds sorted source paths and byte digests. The tool
digest binds the validation scripts. The engine archive records the ephemeris
dependency pin; the lock records dependency versions and integrity.

## Event searches and same-instant measurements

Windows are Gregorian TT, with `(from,to]` ownership. Moon is geocentric; all
other targets are heliocentric. Mars through Pluto use system barycenters.
Reference and engine events are paired uniquely by body and kind within
neighborhoods bounded by midpoints between adjacent reference events and by
the window edges. Matching does not use the time allowance. Multiple candidates
are ambiguous, not arbitrarily paired. Counts are relative to reference grid
turns, not proof of continuous completeness. A refusal leaves missing/extra
counts unavailable. Same-TT probes are still compared after a refusal.

Error maxima below are absolute and rounded upward to six significant digits.
Event distance compares the two independently located extrema. Same-TT errors
compare the engine at each reference before/at/after epoch with that Horizons
sample. Speeds are signed radial rate and total velocity magnitude, in km/s.
The reference grid, solution IDs and complete requests are in each fixture,
indexed by [development](../../../references/manifest.json) and
[held-out](../../../references/held-out/manifest.json) manifests.

### development

| Case | TT window | Search | Reference/returned | Matched/missed/extra/ambiguous | Compared probes | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| dev-moon-2000 | 2000-01-01 to 2000-02-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-mercury-2000 | 2000-01-01 to 2000-04-01 | complete | 3/3 | 3/0/0/0 | 9/9 | PASS |
| dev-venus-2000 | 2000-01-01 to 2001-01-01 | complete | 3/3 | 3/0/0/0 | 9/9 | PASS |
| dev-earth-2000 | 2000-01-01 to 2001-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-mars-2000 | 2000-01-01 to 2002-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-jupiter-2000 | 2000-01-01 to 2013-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-saturn-1980 | 1980-01-01 to 2011-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-uranus-1880 | 1880-01-01 to 1965-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| dev-neptune-1805 | 1805-01-01 to 1971-01-01 | complete | 6/6 | 6/0/0/0 | 18/18 | PASS |
| dev-pluto-1805 | 1805-01-01 to 1900-01-01 | complete | 1/1 | 1/0/0/0 | 3/3 | FAIL |

| Case | Event time, s | Event distance, km | Same-TT distance, km | Same-TT radial speed, km/s | Same-TT total speed, km/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| dev-moon-2000 | 63.4177 | 11.9207 | 11.9547 | 0.0000123381 | 0.0000397248 |
| dev-mercury-2000 | 51.2514 | 1713.80 | 1717.34 | 0.00110528 | 0.00488104 |
| dev-venus-2000 | 1643.34 | 738.616 | 739.899 | 0.000124876 | 0.000814369 |
| dev-earth-2000 | 1792.97 | 2066.17 | 2066.40 | 0.000227218 | 0.000273144 |
| dev-mars-2000 | 2663.01 | 3076.90 | 3086.83 | 0.000781762 | 0.000335673 |
| dev-jupiter-2000 | 55255.8 | 30658.0 | 30700.6 | 0.000541029 | 0.000829413 |
| dev-saturn-1980 | 75002.6 | 16885.5 | 17001.3 | 0.000306204 | 0.000964455 |
| dev-uranus-1880 | 441474 | 51375.9 | 51411.6 | 0.000323772 | 0.000788421 |
| dev-neptune-1805 | 1.35821e+6 | 120619 | 120668 | 0.000205146 | 0.000633170 |
| dev-pluto-1805 | 47178.4 | 205752 | 205766 | 0.000180131 | 0.000101784 |

### held-out

| Case | TT window | Search | Reference/returned | Matched/missed/extra/ambiguous | Compared probes | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| held-moon-2024 | 2024-01-01 to 2024-03-01 | complete | 5/5 | 5/0/0/0 | 15/15 | PASS |
| held-mercury-2024 | 2024-01-01 to 2025-01-01 | complete | 8/8 | 8/0/0/0 | 24/24 | FAIL |
| held-venus-2024 | 2024-01-01 to 2025-01-01 | complete | 3/3 | 3/0/0/0 | 9/9 | PASS |
| held-earth-2024 | 2024-01-01 to 2025-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| held-mars-2024 | 2024-01-01 to 2026-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| held-jupiter-2030 | 2030-01-01 to 2043-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| held-saturn-2020 | 2020-01-01 to 2051-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| held-uranus-2000 | 2000-01-01 to 2085-01-01 | complete | 2/2 | 2/0/0/0 | 6/6 | PASS |
| held-neptune-2005 | 2005-01-01 to 2171-01-01 | complete | 6/6 | 6/0/0/0 | 18/18 | FAIL |
| held-pluto-1900 | 1900-01-01 to 2195-01-01 | refused | 2/unavailable | 0/unavailable/unavailable/unavailable | 6/6 | FAIL |

| Case | Event time, s | Event distance, km | Same-TT distance, km | Same-TT radial speed, km/s | Same-TT total speed, km/s |
| --- | ---: | ---: | ---: | ---: | ---: |
| held-moon-2024 | 62.9190 | 12.1503 | 12.1710 | 0.00000878083 | 0.0000372355 |
| held-mercury-2024 | 215.470 | 2606.23 | 2617.05 | 0.00256515 | 0.00512266 |
| held-venus-2024 | 1926.29 | 755.813 | 757.242 | 0.000146123 | 0.000652963 |
| held-earth-2024 | 1368.96 | 921.537 | 921.544 | 0.000174478 | 0.000252188 |
| held-mars-2024 | 2558.28 | 2130.11 | 2130.19 | 0.000513258 | 0.000285778 |
| held-jupiter-2030 | 42657.1 | 20865.5 | 20909.1 | 0.000405905 | 0.000810186 |
| held-saturn-2020 | 51466.2 | 53518.8 | 53542.7 | 0.000164388 | 0.00121732 |
| held-uranus-2000 | 120709 | 47729.5 | 47739.8 | 0.0000927390 | 0.000223745 |
| held-neptune-2005 | 2.61853e+6 | 93523.5 | 93429.6 | 0.000293508 | 0.000534508 |
| held-pluto-1900 | unavailable | unavailable | 142697 | 0.000234884 | 0.000113133 |

## Acceptance failures

Every failed metric is retained below. Numeric error magnitudes are rounded
upward; acceptance is evaluated on full-precision values with no added slack.

| Case | Check | Reference or index | Point | Error magnitude | Limit |
| --- | --- | --- | --- | ---: | ---: |
| dev-pluto-1805 | eventDistanceKm | dev-pluto-1805-01 | - | 205752 | 100000 |
| dev-pluto-1805 | sameTtDistanceKm | dev-pluto-1805-01 | before | 205766 | 100000 |
| dev-pluto-1805 | sameTtDistanceKm | dev-pluto-1805-01 | at | 205751 | 100000 |
| dev-pluto-1805 | sameTtDistanceKm | dev-pluto-1805-01 | after | 205732 | 100000 |
| held-mercury-2024 | sameTtOrbitalSpeedKmPerSecond | held-mercury-2024-03 | after | 0.00505983 | 0.005 |
| held-mercury-2024 | sameTtOrbitalSpeedKmPerSecond | held-mercury-2024-05 | at | 0.00502352 | 0.005 |
| held-mercury-2024 | sameTtOrbitalSpeedKmPerSecond | held-mercury-2024-05 | after | 0.00512266 | 0.005 |
| held-neptune-2005 | eventTimeSeconds | held-neptune-2005-05 | - | 2.61853e+6 | 2592000 |
| held-pluto-1900 | search-completion: non-unimodal | - | - | unavailable | - |
| held-pluto-1900 | sameTtDistanceKm | held-pluto-1900-02 | before | 142672 | 100000 |
| held-pluto-1900 | sameTtDistanceKm | held-pluto-1900-02 | at | 142684 | 100000 |
| held-pluto-1900 | sameTtDistanceKm | held-pluto-1900-02 | after | 142697 | 100000 |

Search detail for held-pluto-1900: Apsis distance refinement refused on TT seconds -325892139.3210798 to -325892138.8618639 from J2000.

## Physical-center spot comparisons

These are signed differences at the preregistered TT epochs, retaining full
binary64 precision; printed digits do not establish physical accuracy.
No physical-center acceptance limits or event-time checks were registered.
They neither replace the barycenter targets nor validate physical-center apsides.
The [physical-center fixture](../../../references/held-out/physical-centers.json)
retains the returned satellite-system solutions separately from DE441 barycenters.

| Body | JD TT | Comparison | Distance, km | Radial speed, km/s | Total speed, km/s |
| --- | ---: | --- | ---: | ---: | ---: |
| Mars | 2451545 | physicalMinusBarycenter | 0.000007599592208862305 | -3.326200193054518e-8 | 4.644679307830302e-9 |
| Mars | 2451545 | engineMinusBarycenter | -938.3474254906178 | 0.00023833149956220545 | 0.00020024682000396865 |
| Mars | 2451545 | engineMinusPhysical | -938.34743309021 | 0.000238364761564136 | 0.00020024217532466082 |
| Mars | 2469807.5 | physicalMinusBarycenter | 0.00015661120414733887 | -1.3060130754638521e-9 | 3.575578944037261e-8 |
| Mars | 2469807.5 | engineMinusBarycenter | 2773.4703935980797 | -0.0002379535204173333 | -0.00027150867359182485 |
| Mars | 2469807.5 | engineMinusPhysical | 2773.4702369868755 | -0.00023795221440425784 | -0.0002715444293812652 |
| Jupiter | 2451545 | physicalMinusBarycenter | 4.378093957901001 | 0.00003052246137902337 | 0.00008197272448562387 |
| Jupiter | 2451545 | engineMinusBarycenter | 16134.318884015083 | 0.00031296147498757754 | -0.00042699367146248335 |
| Jupiter | 2451545 | engineMinusPhysical | 16129.940790057182 | 0.00028243901360855417 | -0.0005089663959481072 |
| Jupiter | 2469807.5 | physicalMinusBarycenter | -94.74650609493256 | -0.0006747019217311356 | -0.00029553179349584013 |
| Jupiter | 2469807.5 | engineMinusBarycenter | 12270.954846858978 | 0.00005785056714091574 | 0.0004493750755489856 |
| Jupiter | 2469807.5 | engineMinusPhysical | 12365.70135295391 | 0.0007325524888720514 | 0.0007449068690448257 |
| Saturn | 2451545 | physicalMinusBarycenter | 36.33605980873108 | 0.0011851967512980788 | -0.00004298714283201832 |
| Saturn | 2451545 | engineMinusBarycenter | -31651.26471877098 | 0.00037032298847444745 | 0.001331371732444353 |
| Saturn | 2451545 | engineMinusPhysical | -31687.600778579712 | -0.0008148737628236313 | 0.0013743588752763714 |
| Saturn | 2469807.5 | physicalMinusBarycenter | -162.93581008911133 | -0.0009724668989274099 | -0.000816190947162454 |
| Saturn | 2469807.5 | engineMinusBarycenter | 34752.67709207535 | -0.000309139116291296 | 0.0005115605188468209 |
| Saturn | 2469807.5 | engineMinusPhysical | 34915.61290216446 | 0.0006633277826361139 | 0.0013277514660092748 |
| Uranus | 2451545 | physicalMinusBarycenter | 54.48323678970337 | 0.0002200529562501885 | 0.00013371952850871338 |
| Uranus | 2451545 | engineMinusBarycenter | -1109.6332893371582 | 0.000006422584757803662 | 0.0002926898201405237 |
| Uranus | 2451545 | engineMinusPhysical | -1164.1165261268616 | -0.00021363037149238484 | 0.0001589702916318103 |
| Uranus | 2469807.5 | physicalMinusBarycenter | -768.5301599502563 | 0.00008534520308158856 | -0.000051580588781519054 |
| Uranus | 2469807.5 | engineMinusBarycenter | -47533.27727651596 | -0.0000623130414007314 | -0.000730435536237195 |
| Uranus | 2469807.5 | engineMinusPhysical | -46764.747116565704 | -0.00014765824448231997 | -0.000678854947455676 |
| Neptune | 2451545 | physicalMinusBarycenter | 98.13628578186035 | 0.0001864545366321857 | -0.000877151607384441 |
| Neptune | 2451545 | engineMinusBarycenter | -16999.880046844482 | 0.00023797957772777462 | 0.0010480642498071902 |
| Neptune | 2451545 | engineMinusPhysical | -17098.016332626343 | 0.00005152504109558892 | 0.0019252158571916311 |
| Neptune | 2469807.5 | physicalMinusBarycenter | 472.4645690917969 | 0.000903138712004874 | -0.00014384155306679247 |
| Neptune | 2469807.5 | engineMinusBarycenter | 21246.208163261414 | -0.000011312208005036443 | 0.0003119805763596162 |
| Neptune | 2469807.5 | engineMinusPhysical | 20773.743594169617 | -0.0009144509200099103 | 0.00045582212942640865 |
| Pluto | 2451545 | physicalMinusBarycenter | -1462.1556797027588 | -0.0142342425852241 | 0.014564938309144182 |
| Pluto | 2451545 | engineMinusBarycenter | 9476.15182876587 | 0.00002555774430290647 | 0.000014509031807996564 |
| Pluto | 2451545 | engineMinusPhysical | 10938.307508468628 | 0.014259800329527006 | -0.014550429277336185 |
| Pluto | 2469807.5 | physicalMinusBarycenter | 1341.7140636444092 | 0.004536013301702058 | -0.01254017011800368 |
| Pluto | 2469807.5 | engineMinusBarycenter | 211305.51874160767 | 0.00009855355650922881 | -0.00011564729710045185 |
| Pluto | 2469807.5 | engineMinusPhysical | 209963.80467796326 | -0.004437459745192829 | 0.012424522820903228 |

## Coverage limits

The held-out cases were first evaluated in M10 after fixing the M1-M9 search.
No search policy, sampler, ephemeris, original fixture or allowance was tuned
using these cases. They are now consumed validation data; future tuning requires
a new registration and new held-out cases. Development and held-out results
stay separate. All selected cases remain visible, including failures.

The Moon's held-out reference grid is finer than its search grid; planetary
reference grids are as fine as their search grids, except Earth's finer search
grid. Neither sampling proves that hidden pairs of extrema are absent.
The reference rate brackets localize roots of the returned Horizons solution.
Their numerical widths do not bound that solution's physical uncertainty.
These measurements do not extend beyond the listed windows, target centers
and independent sample epochs, validate civil-time conversion, or validate
the optional lunar phase annotation. No dates are ranked.
