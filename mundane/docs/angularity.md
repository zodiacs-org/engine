# Angularity convention and test derivation

`analyzeAngularity` uses an explicit project convention: a classical planet
counts as angular when it lies in an angular house or within the selected
longitude orb of an angle. Both factors remain separate in the output.
This is labelled as traditional conventions, not predictions. The default
orb is a project setting, not a measured tolerance or a universal historical
rule. There is no score, cusp anticipation, latitude correction, temporal
window search, or forecast.

House membership reuses `src/houses.ts`'s `houseOf` with the supplied chart's
actual cusp longitudes. The rule selects houses 1, 4, 7, and 10. It keeps the
engine's cusp boundary arithmetic. Angle proximity instead compares the
short circular separation of the supplied longitudes, using `src/exact.ts`
to make inclusive orb decisions on exact binary64 values. It does not widen
the orb with an epsilon. A reported distance is rounded once. Engine
`CLASSICAL_PLANETS` and `hasClassicalDignities` in
`src/techniques/dignities.ts` supply selection and body-name validation.

Every numerical example below is enforced by
[angularity.test.ts](../test/angularity.test.ts), over invented geometry.
None is taken from a cast chart, a prior engine output, Swiss Ephemeris, or
a person's birth data. These are independent hand calculations of the chosen
convention, not ingress or lunation timing references.

## Equal sign cusps

The synthetic cusps are 0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300,
and 330 degrees. Each house spans its cusp inclusively to the next cusp
exclusively. Direct division by 30 gives the following expectations:

| Planet | Longitude, degrees | House | Angular house | Near angle at orb 5 degrees |
| --- | ---: | ---: | --- | --- |
| Sun | 35 | 2 | false | none |
| Moon | 359 | 12 | false | none |
| Mercury | 271 | 10 | true | MC at 270, distance 1 |
| Venus | 95 | 4 | true | IC at 90, distance 5 |
| Mars | 181 | 7 | true | none |
| Jupiter | 194 | 7 | true | DSC at 195, distance 1 |
| Saturn | 65 | 3 | false | none |

The other angle is ASC at 15 degrees. The Moon is 16 degrees from ASC
through longitude zero, so it matches when the orb is changed to 20. Changing
the synthetic MC to 250 and IC to 70 places a Sun at 250 in house 9 while
exactly on MC. A Saturn at 284 stays in house 10 while outside the default
angle orb. These cases demonstrate why the two factors remain separate.

## Unequal cusps and wraparound

The invented unequal cusps are 350, 15, 50, 85, 120, 155, 170, 195, 230,
265, 300, and 335 degrees. House 1 crosses longitude zero. Longitudes
0, 15, 84.5, 85, 170, 264.5, and 265 fall respectively in houses
1, 2, 3, 4, 7, 9, and 10. These expectations are interval membership
calculations, independent of any engine chart.

For angle separations, 359 and 0 degrees are 1 degree apart through zero.
With a 5-degree orb, the doubles immediately above and below 5 are tested
against an angle at zero; the former is excluded and the latter included.
With a zero orb, even the smallest positive double is excluded from proximity
to zero. The antipodal distance is 180 degrees; an orb of 180 includes every
angle, and all matches remain in the result.

The decimal spellings 7.6999999999999895 and 359.7 have exact binary64
circular separation 8 + 2^-50 degrees. This follows by taking the exact
rational doubles, subtracting, and folding by 360. An 8-degree orb must
exclude this pair, even if intermediate rounded subtraction loses the excess.
The test uses these input doubles directly without taking an expectation from
the engine's output.

## Integration and limitations

Separate checks cast arbitrary instants at synthetic places and compare house
membership with the engine's `houseOf` for supported systems. Polar fallback
checks compare the same geometry cast with requested Placidus and whole-sign
houses, in both hemispheres. Those comparisons establish integration only.
They do not establish astronomical accuracy or prove that all possible house
geometries are physically meaningful.

The helper checks numerical field shapes and requires every classical planet.
It does not authenticate supplied geometry or reconstruct houses. Body latitude,
speed, aspects, and sect do not enter angularity. An outer planet or node never
becomes a classical angular factor. Result house metadata retains the requested
and actual systems; calculation flags and astronomical provenance remain on
the original `EventChart`.
