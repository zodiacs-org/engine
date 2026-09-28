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

The sources describe a place's old time at the moment it was given up (a
debate of 1891, a clock set back in 1883). Each rule for the time before a
place's first documented change assumes that the place had kept that time
since 1 January 1870; no source found suggests otherwise.

## France

### Places

| place | jurisdiction | longitude | local mean time |
| --- | --- | ---: | ---: |
| Paris (`fr-paris`) | `fr-paris` | 2.3488 | +0:09:21 (Paris mean time) |
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

## United States

### Places

| place | jurisdiction | longitude | time before standard time | standard time from |
| --- | --- | ---: | --- | --- |
| New York (`us-new-york`) | `us-nyc` | −74.00597 | city time, −4:56:01.62 (City Hall clock) | 18 Nov 1883, noon Eastern |
| Baltimore (`us-baltimore`) | `us-baltimore` | −76.61219 | city time, −5:06:28 | 18 Nov 1883, noon |
| Washington (`us-washington`) | `us-washington` | −77.03637 | Washington time, −5:08:12 | 13 Mar 1884 (act of Congress) |
| Providence (`us-providence`) | `us-providence` | −71.41283 | local mean time, −4:45:39 | 20 Nov 1883 |
| Indianapolis (`us-indianapolis`) | `us-indianapolis` | −86.15804 | local mean time, −5:44:38 | 18 Nov 1883, noon Central |
| Louisville (`us-louisville`) | `us-louisville` | −85.75941 | city time, −5:42:00 (clock set back 18 minutes) | 18 Nov 1883, noon Central |
| Chicago (`us-chicago`) | `us-chicago` | −87.65005 | local mean time, −5:50:36 | 18 Nov 1883, noon Central |
| Saint Paul (`us-saint-paul`) | `us-saint-paul` | −93.09327 | local mean time, −6:12:22 | 25 Nov 1883, noon Central |
| Minneapolis (`us-minneapolis`) | `us-minneapolis` | −93.26384 | local mean time, −6:13:03 | 25 Nov 1883 |

Where a report gives the size of a city's change to the second or the
minute, the old city time is taken from it (New York, Baltimore,
Washington, Louisville); otherwise it is the mean time of the city's
longitude, and the rule says how the reports compare. Each city's old time
is assumed to have held from 1870 to the change.

Washington kept two times from 18 November 1883: the railroads and the
businesses dealing with them went to Eastern time, while other businesses,
the government departments and the noon fire bells kept Washington time
until Congress fixed the District's legal time on 13 March 1884. The atlas gives Washington time for that
period and flags it `uncertain`.

From the Standard Time Act of 19 March 1918 every covered city is on its
zone's time (Eastern: the 75th meridian; Central: the 90th), with daylight
saving time from 02:00 on the last Sunday in March to 02:00 on the last
Sunday in October in 1918 and 1919 (31 March to 27 October 1918, 30 March
to 26 October 1919). The act of 20 August 1919 repealed daylight saving
time after the October change. Zone limits were fixed by an order of the
Interstate Commerce Commission, which was not read; each covered city is
taken to be in the zone whose time it had kept since 1883 or 1884.

### Left out, and why

The slice was first scoped as the twenty largest cities of the 1900 census
(New York, Chicago, Philadelphia, St. Louis, Boston, Baltimore, Cleveland,
Buffalo, San Francisco, Cincinnati, Pittsburgh, New Orleans, Detroit,
Milwaukee, Washington, Newark, Jersey City, Louisville, Minneapolis,
Providence) and the places tzdb gives zones of their own (Detroit,
Louisville, Indianapolis, Boise, Menominee and others). A city is covered
only where a primary source for its own change was found and read on a page
image; that held for the nine cities above. For the others no such report
was found in Chronicling America (Library of Congress) in the time
available, so they are not covered rather than covered by assumption. In
particular:

- Cleveland and Cincinnati: reports seen only in the archive's OCR text say
  both kept local time after the railroads changed on 18 November 1883
  (railroad timetables printed in Cleveland in December 1883 still convert
  from "Cleveland time"); when each city changed was not found.
- San Francisco and the rest of California: a Sacramento report of
  24 November 1883, seen in OCR, has the Central Pacific still running on
  San Francisco time; the date of the change was not found.
- Detroit (on local time until 1905 according to tzdb), Boise and
  Menominee: no primary source was found.
- Local daylight saving time before 1918 in the covered cities: none was
  found, and none is included.
- Railroad time before 1883 (each railroad kept its own standard, often the
  time of its headquarters city) is not kept as a separate clock.

## Counts for version 0.1.0

| | places | jurisdictions | rules | citations |
| --- | ---: | ---: | ---: | ---: |
| France | 10 | 3 | 14 | 25 |
| Alsace and Moselle | 2 | 2 | 16 | 13 |
| United States | 9 | 9 | 27 | 20 |
| all | 21 | 14 | 57 | 58 |

Rules by flag: 47 `documented`, 7 `inferred`, 3 `uncertain`.

- `uncertain`: `fr-lmt-before-1891` (towns' clocks may already have shown
  Paris time), `als-strasbourg-french-1918` (when Strasbourg's five minutes
  were corrected), `us-washington-two-times-1883` (two times in use).
- `inferred`: `fr-rail-interior-before-1911`, `mos-metz-french-1918`,
  `als-mos-summer-1919`, `als-mos-wet-1919`,
  `us-providence-city-time-before-1883`,
  `us-indianapolis-city-time-before-1883`,
  `us-minneapolis-city-time-before-1883`.

Citations by type: 37 newspaper reports, 9 laws, 5 decrees, 3
parliamentary debates, 2 railway notices, 1 ministerial decision, 1
municipal notice. All 58 excerpts were transcribed from page images.

`npm run atlas:check` checks 258 boundaries with 2,735 round trips and the
comparison with tzdb (106 periods differ, all explained in
`TZDB-DIFFERENCES.md`).
