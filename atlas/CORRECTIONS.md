# Corrections

Anyone can propose a correction or an addition. It is accepted only with a
citation that meets the rules in `README.md`: a primary source (law, decree,
official gazette, municipal notice or council record, contemporary newspaper
report, railway notice or timetable), with a stable URL, a page and column
locator, and a short verbatim excerpt in the original language. Secondary
works, tzdb comments, websites and proprietary atlases are not accepted as
evidence; they may be offered as leads.

## How to propose one

Open an issue or a pull request in `zodiacs-org/engine` that gives:

- the rule id (or the place and period, for something not yet covered);
- what the clock showed, and when it changed, with the clock the change is
  read on;
- the citation fields: type, title, date, issuer, URL, locator, language and
  excerpt.

## How it is reviewed

1. A reviewer fetches the source at the URL given and reads the passage, on
   the page image where the archive serves it. Where an archive's page and
   image servers refuse the reviewer's requests, the passage may be read
   through the services the archive offers for that purpose, without getting
   around its access controls: its OCR text of the page, or its metadata and
   search services (for Gallica, OAIRecord for the issue's record and
   ContentSearch for the text of the page). Gallica serves its page images
   (IIIF) and OCR text (ALTO) to a plain, descriptive User-Agent that names
   the tool, and refuses some clients' default one; do not imitate a browser.
   The citation's `checks` records which was used, with the date and the
   result; words the method cannot confirm, such as a figure the OCR drops,
   make the check `partial` and are named in its note. A source that cannot
   be fetched and read at all is not accepted.
2. If the source supports the change, the rule's `version` goes up by one,
   an entry is added to its `changes`, the citation is added with the
   reviewer's retrieval date and its check, and the uncertainty flag and
   reason are revised. A rule is never edited in place without a new
   version. A corrected excerpt is noted, with the date, in the citation's
   `note`.
3. `node atlas/tools/check.mjs` and `node --test atlas/tools/selftest.mjs`
   must pass, and `node atlas/tools/compare-tzdb.mjs` is rerun so that
   `TZDB-DIFFERENCES.md` stays current.
4. The correction is logged below.

When two primary sources disagree, the rule keeps both citations, takes the
reading the stronger source supports (an enacted text over a report, a
report written at the time and place over one written later or elsewhere)
and is flagged `uncertain` with the disagreement stated in its reason.

## To report to tzdb

Two findings the owner may send to the tz project. The first looks like an
error in tzdb; the second is a difference between the instant a law set and
tzdb's entry, which may follow how the clocks were set. Nothing has been
sent; the owner decides whether to send them. Both are also listed in
`TZDB-DIFFERENCES.md`, with the periods they affect (explanations
`fr-summer-time-end-hour` and `de-reich-law-1893-instant`).

1. **French summer time, 1916-1919, ended at the start of the day the
   decrees name, not at its end.** tzdb's
   `Rule France 1916 1919 - Oct Sun>=1 23:00s 0 -` ends summer time at
   23:00 standard time on the Sunday each decree names for the return to
   normal time (1 October 1916, 7 October 1917, 6 October 1918, 5 October
   1919). The decrees give only the date. The Paris papers cited put the
   change at its start, 00:00 UTC: all public clocks set back from 01:00 to
   00:00 summer time in 1916, the clocks set back within the hour after
   midnight in 1917, legal time set back at 01:00 in 1919. For 1918 the
   source is the instructions to the railway networks, which set all clocks
   back at 01:00; that the other public clocks changed at that hour is an
   inference. That would read `Oct Sun>=1 0:00s`, 23 hours earlier.
   Citations: `fr-jo-1916-06-11-decree`, `fr-jo-1917-03-21-decree`,
   `fr-jo-1918-03-01-decree`, `fr-jo-1919-02-11-decree`,
   `fr-petitparisien-1916-09-30-public-clocks`,
   `fr-petitparisien-1916-09-30`, `fr-petitjournal-1916-09-30`,
   `fr-petitjournal-1917-10-06`, `fr-petitparisien-1917-10-07`,
   `fr-petitparisien-1918-10-04`, `fr-petitjournal-1919-10-05`.
2. **Germany's legal instant in 1893 differs from tzdb's entry.** tzdb's
   `Zone Europe/Berlin 0:53:28 - LMT 1893 Apr` puts the change at midnight
   Berlin mean time, 23:06:32 UTC on 31 March 1893. The Reich law of
   12 March 1893 came into force at the moment "in welchem nach der im
   vorhergehenden Absatz festgesetzten Zeitbestimmung der 1. April 1893
   beginnt": midnight Mid-European time, 23:00 UTC, when Berlin mean time
   read 23:53:28. As legal time that would read `1893 Mar 31 23:00u`, the
   form tzdb uses for Rome's change of 1893, 6 min 32 s earlier.
   `Europe/Kaliningrad` (Königsberg, German in 1893) ends its LMT line the
   same way, 22 minutes before the law's instant there. This is not shown
   to be an error: public clocks may have been set at local midnight, as
   Strasbourg's cathedral clock was when Alsace-Lorraine went over to
   Mid-European time in 1892 (`als-snn-1892-04-01-muenster`). Whether the
   clocks of Berlin or Königsberg changed at the legal instant or at local
   midnight was not researched; the atlas covers neither city. Citations:
   `de-rgbl-1893-03-12-law`, `als-snn-1892-04-01-muenster`.

## Log

Changes made before the first release, including those that followed the
independent review of 2026-09-28, are recorded in each rule's `changes` and
each corrected citation's `note`. The log starts with the first release.

| date | rule | version | change | proposed by | citation |
| --- | --- | --- | --- | --- | --- |
