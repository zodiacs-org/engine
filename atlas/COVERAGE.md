# Coverage

Version 0.1.0 covers civil time from 1 January 1870, 00:00 on each place's
own clock, to 1 January 1920, 00:00 on the same clock (`coverage` in
`data/atlas.json`). A reading outside that window resolves as
`out-of-coverage`.

A place is covered when it is listed in `data/places.json`. Each place
belongs to one jurisdiction, and a jurisdiction is used only for places that
followed the same sequence of rules for the whole window. Where a
jurisdiction's rules are general (a national law, local mean time), any
other place that followed them can be read by longitude with
`resolve.mjs --jurisdiction ID --longitude DEG`; the jurisdiction's
description says which places qualify.

## France

### Places

| place | jurisdiction | longitude | local mean time |
| --- | --- | ---: | ---: |
| Paris (`fr-paris`) | `fr-paris` | 2.3488 | +0:09:21 (Paris mean time, the Observatory meridian) |
| Brest (`fr-brest`) | `fr-brest` | −4.48628 | −0:17:56.7 |
| Nantes (`fr-nantes`) | `fr-general` | −1.55336 | −0:06:12.8 |
| Bordeaux (`fr-bordeaux`) | `fr-general` | −0.58046 | −0:02:19.3 |
| Rouen (`fr-rouen`) | `fr-general` | 1.09932 | +0:04:23.8 |
| Toulouse (`fr-toulouse`) | `fr-general` | 1.44367 | +0:05:46.5 |
| Lyon (`fr-lyon`) | `fr-general` | 4.84789 | +0:19:23.5 |
| Marseille (`fr-marseille`) | `fr-general` | 5.38107 | +0:21:31.5 |
| Nice (`fr-nice`) | `fr-general` | 7.26608 | +0:29:03.9 |
| Ajaccio (`fr-ajaccio`) | `fr-general` | 8.73812 | +0:34:57.1 |

`fr-general` stands for every commune of metropolitan France that was French
for the whole window and was not occupied by German forces in 1914-1918.
The towns listed are spread across the country's longitudes, from Brest to
Ajaccio.

### What the clocks showed

| from | civil clocks | clocks inside railway stations |
| --- | --- | --- |
| 1870 | each commune's local mean time; in Paris, Paris mean time (+0:09:21) | Paris mean time less five minutes (+0:04:21) |
| 17 March 1891 (law of 14 March 1891) | Paris mean time, +0:09:21 | unchanged, +0:04:21 |
| 11 March 1911, midnight (law of 9 March 1911) | Paris mean time less 9 min 21 s, +0:00 | legal time, +0:00 |
| 14 June 1916, 23:00 | summer time, +1:00 | the same |
| 1 October 1916, 01:00 summer time | +0:00 | the same |
| 24 March 1917, 23:00 | +1:00 | the same |
| 7 October 1917, 01:00 summer time (within the hour after midnight) | +0:00 | the same |
| 9 March 1918, 23:00 | +1:00 | the same |
| 6 October 1918, 01:00 summer time | +0:00 | the same |
| 1 March 1919, 23:00 | +1:00 | the same |
| 5 October 1919, 01:00 summer time | +0:00 | the same |

Local mean time before 1891 is computed from the place's longitude (GeoNames,
see `longitudeSource` in `data/atlas.json`) at 240 seconds per degree. The
practice itself, legal time as each place's mean time, is cited to the
Senate debate of 17 February 1891. The same debate says that in towns some
clocks were already kept to the railway station's Paris time, so
`fr-lmt-before-1891` is flagged `uncertain`; Brest, where the debate says
every public clock but the station's kept local time, has its own
jurisdiction and a `documented` rule.

The 1891 law bound Paris from 17 March and other arrondissements one clear
day after the Journal officiel reached them; the change is placed at
midnight starting 17 March with a window to the end of March. Summer time
ended each autumn at 01:00 summer time on the date the decree names, as the
newspapers cited report; the decrees give only the date.

### Left out

- Algeria, which the laws of 1891 and 1911 also cover.
- Alsace and Moselle before November 1918 were German; they have their own
  jurisdictions (below).
- Communes occupied by German forces in 1914-1918 (in the Nord,
  Pas-de-Calais, Somme, Oise, Aisne, Marne, Ardennes, Meuse,
  Meurthe-et-Moselle and Vosges). What their clocks showed under occupation
  was not researched, so they are not covered, before or after.
- The outside clocks of stations before 1891, which showed Paris mean time,
  are not a separate clock in the atlas: the `railway` clock is the time
  inside stations, by which trains ran.
- Monaco, which is not French.
