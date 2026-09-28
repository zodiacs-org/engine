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

## Alsace and Moselle

Strasbourg and Metz were French until 1871, part of the German Reichsland
Elsaß-Lothringen from 1871 to November 1918, and French again after. Each
has its own jurisdiction, because the change back to French time was made
city by city.

### Places

| place | jurisdiction | longitude | local mean time |
| --- | --- | ---: | ---: |
| Strasbourg (`fr-strasbourg`) | `als-strasbourg` | 7.74553 | +0:30:58.9 |
| Metz (`fr-metz`) | `mos-metz` | 6.17269 | +0:24:41.4 |

### What the clocks showed

| from | Strasbourg | Metz |
| --- | --- | --- |
| 1870 | local mean time | local mean time |
| 1 April 1892 (order of the Ministry for Alsace-Lorraine) | Mid-European time, +1:00, from midnight local time | Mid-European time, +1:00, in the early hours (window 23:25 to 06:00 local time) |
| 1 April 1893 (Reich law of 12 March 1893) | +1:00, now as legal time; the clocks did not change | the same |
| 30 April 1916, 23:00 | German summer time, +2:00 | the same |
| 1 October 1916, 01:00 summer time | +1:00 | the same |
| 16 April 1917, 02:00 | +2:00 | the same |
| 17 September 1917, 03:00 summer time | +1:00 | the same |
| 15 April 1918, 02:00 | +2:00 | the same |
| 16 September 1918, 03:00 summer time | +1:00 | the same |
| 19 November 1918, morning | | French time, taken as +0:00 |
| 21 November 1918, noon | the city's clocks set back to 11:05, that is +0:05 | |
| 1 March 1919, 23:00 | French summer time, +1:00 | the same |
| 5 October 1919, 01:00 summer time | +0:00 | the same |

Strasbourg's public clocks were set five minutes ahead of Greenwich in
November 1918 and were still so in mid-December, when the station clock ran
on French legal time five minutes behind them. When the public clocks were
corrected is not known; the atlas keeps +0:05 until summer time began on
1 March 1919 and flags the whole period `uncertain`. For Metz the report
says only that the cathedral clock showed French time from the morning of
19 November; +0:00 is assumed. French summer time in 1919 is documented for
the railways of Alsace and Lorraine; that the two cities' public clocks
followed, and went back on 5 October with the rest of France, is inferred.

### Left out

- The other communes of Alsace and Moselle. They followed the same rules
  until November 1918, but each changed to French time on its own day, and
  the reports found for Haguenau, Saint-Louis and Mulhouse were read only in
  the archive's OCR, not on page images.
- Railway time in Alsace-Lorraine before 1892. The Metz report of March 1892
  has the station clocks going from local time to Mid-European time at
  midnight Mid-European time, 23:25 local time; what railway clocks showed
  in earlier years was not found. The station clock in Strasbourg in
  December 1918 is noted in `als-strasbourg-french-1918` but not kept as a
  separate clock.
