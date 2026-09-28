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

1. A reviewer fetches the source at the URL given and reads the passage. A
   source that cannot be fetched and read is not accepted.
2. If the source supports the change, the rule's `version` goes up by one,
   an entry is added to its `changes`, the citation is added with the
   reviewer's retrieval date, and the uncertainty flag and reason are
   revised. A rule is never edited in place without a new version.
3. `npm run atlas:check` must pass, and `node atlas/tools/compare-tzdb.mjs`
   is rerun so that `TZDB-DIFFERENCES.md` stays current.
4. The correction is logged below.

When two primary sources disagree, the rule keeps both citations, takes the
reading the stronger source supports (an enacted text over a report, a
report written at the time and place over one written later or elsewhere)
and is flagged `uncertain` with the disagreement stated in its reason.

## Log

| date | rule | version | change | proposed by | citation |
| --- | --- | --- | --- | --- | --- |
