# Coverage

Version 0.1.0 covers civil time from 1 January 1870, 00:00 on each place's
own clock, to 1 January 1920, 00:00 on the same clock (`coverage` in
`data/atlas.json`). A reading outside that window resolves as
`out-of-coverage`.

A place is covered when it is listed in `data/places.json`. Each place
belongs to one jurisdiction, and a jurisdiction is used only for places that
followed the same sequence of rules for the whole window. Where a
jurisdiction's rules are general (a national law, local mean time) and it
lists where they apply (`readByLongitude`), another place there can be read
by longitude with
`resolve.mjs --jurisdiction ID --department CODE --longitude DEG`; the
resolver checks the département and the longitude against the areas the
jurisdiction lists and refuses anything else. In this slice only
`fr-general` allows it.

Where a source gives a place's old time only at the moment it was given up
(a debate of 1891, a clock set back in 1883, the change of 1892), the rule
for the time before that change assumes that the place had kept it since
1 January 1870, and is flagged `inferred`; no source found suggests
otherwise.

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
Ajaccio. Another commune is read by its longitude with its département. The
resolver refuses Moselle, Bas-Rhin and Haut-Rhin (German from 1871 to
1918); the ten départements occupied in 1914-1918 in the usual count
(Aisne, Ardennes, Marne, Meurthe-et-Moselle, Meuse, Nord, Oise,
Pas-de-Calais, Somme, Vosges) and Seine-et-Marne, which German forces
entered in September 1914 (an official statement of 7 September has them
advancing on 5 and 6 September into the region between Coulommiers and La
Ferté-Gaucher, `fr-nytribune-1914-09-08-coulommiers`); the atlas does not
record where the front ran or which communes were reached, so each is
refused whole; and Paris (`fr-paris`). No other département is refused:
that German forces held communes elsewhere in September 1914, in the Aube
for instance, was not established. The resolver also refuses a longitude
outside mainland France (5.2° west to 7.6° east) or Corsica (8.5° to 9.6°
east) for a département there. The limits are coarse: they catch a wrong
département or a longitude from elsewhere, not every error. Tende and La
Brigue (Alpes-Maritimes), Italian until 1947, fall inside them and are not
covered.

### What the clocks showed

| from | civil clocks | clocks inside railway stations |
| --- | --- | --- |
| 1870 | each commune's local mean time; in Paris, Paris mean time (+0:09:21) | Paris mean time less five minutes (+0:04:21) |
| 17 March 1891 (law of 14 March 1891) | Paris mean time, +0:09:21 | unchanged, +0:04:21 |
| 11 March 1911, midnight (law of 9 March 1911) | Paris mean time less 9 min 21 s, +0:00: in Paris at midnight; elsewhere from midnight, when the post offices changed, to the end of March (`inferred`) | legal time, +0:00, at the railway midnight |
| 14 June 1916, 23:00 | summer time, +1:00 | the same |
| 1 October 1916, 01:00 summer time | +0:00 | the same |
| 24 March 1917, 23:00 | +1:00 | the same |
| 7 October 1917, 01:00 summer time (within the hour after midnight) | +0:00 | the same |
| 9 March 1918, 23:00 | +1:00 | the same |
| 6 October 1918, 01:00 summer time (the railways' hour; `inferred` for other clocks) | +0:00 | the same |
| 1 March 1919, 23:00 | +1:00 | the same |
| 5 October 1919, 01:00 summer time | +0:00 | the same |

Local mean time before 1891 is computed from the place's longitude (GeoNames,
see `longitudeSource` in `data/atlas.json`) at 240 seconds per degree. The
practice itself, legal time as each place's mean time, is cited to the
Senate debate of 17 February 1891. The same debate says that in towns some
clocks were already kept to the railway station's Paris time, so
`fr-lmt-before-1891` is flagged `uncertain`. Brest, where the debate says
every public clock but the station's kept local time, has its own
jurisdiction; its rule is flagged `inferred`, since the debate describes
Brest's clocks in 1891 only.

The 1891 law bound Paris from 17 March and other arrondissements one clear
day after the Journal officiel reached them; the change is placed at
midnight starting 17 March with a window to the end of March.

The law of 1911 names no date. In Paris the public clocks, the post offices
and the railways changed at midnight in the night of 10 to 11 March 1911.
Elsewhere the post offices and the railways changed at the same midnight,
and a Chalon-sur-Saône paper told its readers that legal time moved back at
midnight and that the new time could be read on 11 March at a bank's
regulator clock, set by telephone from the Observatory. When each commune's
other public clocks changed is not recorded, and the law bound each
arrondissement one clear day after the Journal officiel reached it, as in
1891. Outside Paris the change is therefore placed at the same midnight with
a window to the end of March, and the rule that follows it,
`fr-wet-1911-provinces`, is flagged `inferred`; Paris has its own rules for
1891-1911 and keeps `fr-wet-1911`.

Summer time ended each autumn at 01:00 summer time on the date the decree
names; the decrees give only the date. The newspapers cited report that hour
for all public clocks in 1916, for the clocks generally in 1917 and for
legal time in 1919. For 1918 the source is the instructions to the railway
networks; that the other public clocks changed at the same hour is assumed,
and the rules on either side of that change are flagged `inferred`.

### Left out

- Algeria, which the laws of 1891 and 1911 also cover.
- Alsace and Moselle before November 1918 were German; they have their own
  jurisdictions (below).
- Communes occupied by German forces in 1914-1918 (in the Nord,
  Pas-de-Calais, Somme, Oise, Aisne, Marne, Ardennes, Meuse,
  Meurthe-et-Moselle and Vosges, and in September 1914 the Seine-et-Marne).
  What their clocks showed under occupation was not researched, so they are
  not covered, before or after.
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
| 1 April 1892 (order of the Ministry for Alsace-Lorraine) | Mid-European time, +1:00: the cathedral clock at midnight local time; some tower clocks the afternoon before, the other public clocks during 1 April | Mid-European time, +1:00, in the early hours (window 23:25 to 06:00 local time) |
| 1 April 1893 (Reich law of 12 March 1893) | +1:00, now as legal time; the clocks did not change | the same |
| 30 April 1916, 23:00 | German summer time, +2:00 | the same |
| 1 October 1916, 01:00 summer time | +1:00 | the same |
| 16 April 1917, 02:00 | +2:00 | the same |
| 17 September 1917, 03:00 summer time | +1:00 | the same |
| 15 April 1918, 02:00 | +2:00 | the same |
| 16 September 1918, 03:00 summer time | +1:00 | the same |
| 19 November 1918, morning | | French time, taken as +0:00 (`uncertain`) |
| 21 November 1918, noon | the city's clocks set back to 11:05, that is +0:05 (`uncertain`) | |
| 1 March 1919, 23:00 | French summer time, +1:00: the clocks go forward 55 minutes (`uncertain`) | French summer time, +1:00 (`uncertain`) |
| 5 October 1919, 01:00 summer time | +0:00 | the same |

The change of 1892 in Strasbourg is timed by the cathedral clock, which
struck midnight local time and, barely a minute later, half past twelve. The
tower clocks of the suburb of Ruprechtsau already showed the new time on the
afternoon of 31 March, and the municipal authorities were to correct the
other public clocks during 1 April, so the boundary's window runs from noon
on 31 March to the end of 1 April. In both cities the rule for the time
before 1892 is flagged `inferred`: the sources show local mean time only at
the change.

Strasbourg's public clocks were set five minutes ahead of Greenwich in
November 1918 and were still so in mid-December, when the station clock ran
on French legal time five minutes behind them. When the public clocks were
corrected is not known. The atlas keeps +0:05 until the latest date the
sources allow, the start of summer time at 23:00 on 1 March 1919 by those
clocks (22:55 UTC), so that night the clocks go forward 55 minutes, to
French summer time (+1:00) rather than +1:05; both periods are flagged
`uncertain`. For Metz the report says only that the cathedral clock showed
French time from the morning of 19 November, not by how much it changed;
+0:00 is assumed and flagged `uncertain`, since Strasbourg, going over to
French time two days later, set its clocks five minutes ahead of Greenwich.
French summer time in 1919 is documented for the railways of Alsace and
Lorraine; that the two cities' public clocks followed is assumed, and
flagged `uncertain` for the start (Strasbourg's clocks could have gone to
+1:05) and `inferred` for the return on 5 October with the rest of France.

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
| New York (`us-new-york`) | `us-nyc` | −74.00597 | city time, −4:56:01.62 (City Hall clock stopped 3 min 58.38 s) | 18 Nov 1883, noon Eastern |
| Baltimore (`us-baltimore`) | `us-baltimore` | −76.61219 | city time, −5:06:28 (advanced 6 min 28 s) | 18 Nov 1883, noon |
| Washington (`us-washington`) | `us-washington` | −77.03637 | Washington time, −5:08:12 (8 min 12 s behind Eastern) | 13 Mar 1884 (act of Congress) |
| Providence (`us-providence`) | `us-providence` | −71.41283 | city time, −4:45:20 (railroads set back 14 min 40 s) | 20 Nov 1883 |
| Indianapolis (`us-indianapolis`) | `us-indianapolis` | −86.15804 | city time, −5:44:00 (court-house clock set back 16 minutes) | 18 Nov 1883, noon Central, the clock that afternoon |
| Louisville (`us-louisville`) | `us-louisville` | −85.75941 | city time, −5:42:00 (city clock set back 18 minutes; the longitude gives −5:43:02) | 18 Nov 1883, noon Central |
| Chicago (`us-chicago`) | `us-chicago` | −87.65005 | city time, −5:51:00 (Central time nine minutes slower) | 18 Nov 1883, noon |
| Saint Paul (`us-saint-paul`) | `us-saint-paul` | −93.09327 | city time, −6:12:08 (a railroad's change, 12 min 8 s) | 25 Nov 1883, noon |
| Minneapolis (`us-minneapolis`) | `us-minneapolis` | −93.26384 | local mean time, −6:13:03 | 25 Nov 1883 |

Where a report measures a city's change, the old city time is taken from
it, to the second or the minute it gives: New York, Baltimore, Washington,
Providence, Indianapolis, Louisville, Chicago and Saint Paul. Each rule
quotes its report and gives the longitude's mean time for comparison.
Minneapolis, which no report measures, has the mean time of its longitude.
Each city's old time is assumed to have held from 1870 to the change, so
these rules are flagged `inferred`, except Louisville's, flagged `uncertain`:
the report's 18 minutes put city time at −5:42:00 and the longitude at
−5:43:02, and tzdb's comments (a lead, not a source) have the Louisville &
Nashville Railroad's trains standing still for 18 minutes at its change,
which may be what the report measured. Where a report leaves the moment
of a change open, between noon by the old time and noon by the new
(Baltimore, Chicago, Saint Paul), between noon and the setting of the City
Hall clock (New York) or between noon by the old time and the afternoon
(Indianapolis), or gives only the day (Providence, Louisville,
Minneapolis), the boundary's window covers every reading the report
allows. Chicago's adoption is flagged `inferred`: the railroads, the Board
of Trade, hotels and business houses are reported to have adopted the new
time, the city government is not. So is Minneapolis's: the new time was to
be "generally adopted" on 25 November 1883 and two days later was "working
finely throughout Minneapolis", though "some are slow in adopting it".

Washington kept two times from 18 November 1883: the railroads and the
businesses dealing with them went to Eastern time, while other businesses,
the government departments and the noon fire bells kept Washington time
until Congress fixed the District's legal time on 13 March 1884. The atlas
gives Washington time for that period and flags it `uncertain`.

From the Standard Time Act of 19 March 1918 every covered city is on its
zone's time (Eastern: the 75th meridian; Central: the 90th), with daylight
saving time from 02:00 on the last Sunday in March to 02:00 on the last
Sunday in October in 1918 and 1919 (31 March to 27 October 1918, 30 March
to 26 October 1919). The act of 20 August 1919 repealed daylight saving
time after the October change. The Act left the zone limits to the
Interstate Commerce Commission. Its orders were not found and not read; a
Laramie paper of 10 April 1918 reports that for 1918 it recognized the
limits already in use. Each covered city is taken to be in the zone whose
time it had kept since 1883 or 1884, and the zone rules of 1918 and 1919
are flagged `inferred`.

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

## How the flags are given

- `documented`: the cited sources state the offset and the change for the
  place, or a law that covers it, over the rule's whole period. A time
  adopted by law, ordinance or a reported act stays documented until the
  next change the sources report.
- `inferred`: the rule rests on a stated assumption. A place's time reported
  only at the moment it was given up is carried back to 1870 (Brest,
  Strasbourg, Metz, eight of the American cities); a place's public clocks
  are taken to have followed where the sources name only its railways, its
  post offices or its businesses (Chicago and Minneapolis in 1883, the
  French communes outside Paris in 1911, France in the autumn of 1918,
  Alsace and Lorraine on 5 October 1919); the railway rule of one company is
  applied to the others (`fr-rail-interior-before-1911`); a city is taken to
  be in the zone whose time it kept (the zone rules of 1918 and 1919).
- `uncertain`: the sources leave the offset or the date open, or disagree;
  the atlas gives its best reading and the reason names the alternative.

## How the excerpts were checked

Every excerpt was transcribed from the page image on the retrieval date.
After an independent review re-fetched every source, each excerpt was
checked again on 2026-09-28, and its `checks` record how. Gallica's page and
image servers at first refused automated requests, so the Gallica excerpts
were checked against the text its search service (ContentSearch) returns for
the cited page. A second review found that Gallica serves page images and
its OCR text (ALTO) to a plain, descriptive User-Agent; every excerpt whose
check had been partial was then read on the page image. Excerpts added after
the reviews were transcribed from the page image and checked against the
archive's OCR text of the page.

| archive | excerpts | checked against | checked | matches | partial |
| --- | ---: | --- | ---: | ---: | ---: |
| Gallica (BnF) | 41 | the text its search service returns for the cited page | 37 | 29 | 8 |
| | | its OCR text of the page (ALTO) | 4 | 3 | 1 |
| | | the page image | 12 | 12 | 0 |
| Library of Congress | 24 | its OCR text of the page | 24 | 20 | 4 |
| | | the page image | 4 | 4 | 0 |
| Internet Archive | 1 | the scan's OCR text | 1 | 1 | 0 |

A `partial` check is one where the method could not confirm some words,
which its note names: the OCR garbles or drops them. In the eight Gallica
cases these are the "24" of "24 heures 59" (Le Petit Parisien, 1918), the
"60" of "60 minutes" (Le Petit Parisien, 1919), the month in three German
reports, two short stretches of the Bundesrat order as printed in 1916,
"französische Zeit" in Strasbourg's notice of 1918, and several words of the
law of 1917. In the three Library of Congress cases it is a figure ("73 h
meridian" for "75th meridian" in Baltimore, the seconds the New York City
Hall clock stood still, the first "twelve seconds" in Washington). All
eleven were read again on the page image, where they match; in Strasbourg's
notice the scan is faded in the middle of "französische", which the notice's
heading gives in full. Of the excerpts added later, two OCR checks are
partial: the OCR garbles an "l'heure" in the Courrier de Saône-et-Loire of
1911, whose letters a printing fault displaces on the page image the excerpt
was transcribed from, and has "tlsa" for a "the" in the New York Tribune of
1914. Read again on the page image, both excerpts match.

Apart from such OCR errors the checks found the excerpts as transcribed,
except one:

- `fr-petitparisien-1916-09-30` ended "au lieu de 23 heures", cutting off
  the "59" that follows. It now reads "au lieu de 23 heures 59, afin de ne
  pas créer de confusion", as the page does, and the rules citing it say
  "rather than at 23:59".

`mos-matin-1918-11-21-metz` was shortened to stop before "se déroulait à la
préfecture la cérémonie d'ordre civil" when those words could not be found
in the search service's text, which drops a line there; the page image
shows them as first transcribed, and the shorter excerpt is kept. The issue
number of `de-snn-1917-09-14-ende` is corrected to Nr. 215, as the masthead
reads. Ten excerpts longer than 40 words were shortened with `[...]`.

## Counts for version 0.1.0

| | places | jurisdictions | rules | citations |
| --- | ---: | ---: | ---: | ---: |
| France | 10 | 3 | 16 | 29 |
| Alsace and Moselle | 2 | 2 | 16 | 14 |
| United States | 9 | 9 | 27 | 23 |
| all | 21 | 14 | 59 | 66 |

Rules by flag: 27 `documented`, 26 `inferred`, 6 `uncertain`.

- `uncertain`: `fr-lmt-before-1891` (towns' clocks may already have shown
  Paris time), `als-strasbourg-french-1918` (when Strasbourg's five minutes
  were corrected), `mos-metz-french-1918` (by how much Metz changed),
  `als-mos-summer-1919` (+1:00 or +1:05 in Strasbourg),
  `us-washington-two-times-1883` (two times in use),
  `us-louisville-city-time-before-1883` (the report's 18 minutes or the
  longitude).
- `inferred`: `fr-brest-lmt-before-1891`, `fr-rail-interior-before-1911`,
  `fr-wet-1911-provinces`, `fr-summer-1918`, `fr-wet-1918`,
  `als-strasbourg-lmt-before-1892`, `mos-metz-lmt-before-1892`,
  `als-mos-wet-1919`, the city-time rules before standard time of New York,
  Baltimore, Washington, Providence, Indianapolis, Chicago, Saint Paul and
  Minneapolis, `us-chicago-central-1883`, `us-minneapolis-central-1883`, and
  the eight zone rules of 1918 and 1919 (`us-eastern-*`, `us-central-*`).

Citations by type: 45 newspaper reports, 9 laws, 5 decrees, 3
parliamentary debates, 2 railway notices, 1 ministerial decision, 1
municipal notice.

`node atlas/tools/check.mjs` checks 258 boundaries with 2,735 round trips and
the comparison with tzdb (108 periods differ, each matched by exactly one
explanation in `TZDB-DIFFERENCES.md`).
