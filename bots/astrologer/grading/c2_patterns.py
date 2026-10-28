"""Count the C2 (fact and reading kept apart) deduction patterns in a run's grades.

Usage: python3 c2_patterns.py GRADES_DIR [READINGS_DIR]

The grader gives no per-criterion notes, so the patterns are matched in the free-text
fields (invented_meanings, technique_errors, position_date_mismatches, worst_problem,
fix_for_writer). A grade counts for a pattern when one of its notes matches. With a
readings directory, the script also counts the readings that use the phrasing behind
each pattern, so a later run can be compared without a grader.
"""
import json, os, re, sys

FIELDS = ('invented_meanings', 'technique_errors', 'position_date_mismatches', 'worst_problem', 'fix_for_writer')

# Pattern key -> (description, regex over the grader's notes, regex over the reading text)
PATTERNS = {
  'P1': ('Comparative ranking or superlative stated as fact (hardest, heaviest, most reliable, strongest, main theme)',
         r"hardest|heaviest|heavier|weightiest|most reliab|reliabl[ey]|most dependable|strongest|most strained|main theme|most-touched|well-supported|ranks?|ranking",
         r"\b(hardest|heaviest|weightiest|most (reliable|reliably|dependable|strained|difficult|important|supported)|strongest(-conditioned)?|chart's main|window's main|main theme)\b"),
  'P2': ('Writer-computed fact not on the sheet (a small change of birth time does not move a planet, counts, "exact")',
         r"small (change|shift)|does not (change|move)|not an engine fact|uncomputed|own (calculation|reckoning|inference|unsourced)|does not compute|not (on|from) the sheet|count made by the writer|computed claim|worked this out",
         r"(small|slight) (change|shift) (in|of) (the )?birth time (does not|would not|doesn't|wouldn't)|(does not|would not|doesn't|wouldn't) (change|move)[^.]{0,40}(sign|out of)|(neither|none)[^.]{0,30}(changes?|moves?) sign"),
  'P3': ('Modern or outer-planet meaning labelled "traditional"',
         r"traditional (label|reading.{0,120}(modern|Pluto|Neptune|Uranus|psycholog))|(labell?ed|called|presented as|mislabell?ed|attribut\w+)[^.]{0,60}traditional|calling this '?traditional|modern[^.]{0,80}traditional|(?<!No )traditional (?!or modern)[^.]{0,80}modern",
         r"(a |in a |the )?traditional(ly| reading| terms| view)"),
  'P4': ('Sect or dignity doctrine turned into a settled outcome (moderated and workable, own resources, help arrives indirectly)',
         r"moderat|workable|own resources|indirect|takes its colou?r|settled fact|settled rule|stated (flatly|as (fact|settled))",
         r"\b(moderated|workable|its own resources|indirectly|takes its colou?r)\b"),
  'P5': ('Dispositor chain or loop turned into a causal or psychological claim ("which is why", "so")',
         r"(dispositor|chain|loop|lord)[^.]{0,160}(psycholog|causal|cause|leap|stretch|behaviou?ral|does not support|no (recognised|standard|tradition)|overstat|not a recognised)|(psycholog|causal|leap|stretch)[^.]{0,160}(dispositor|chain|loop)",
         r"(chain|loop|disposes|dispositor)[^.]{0,120}(which is why|so (your|the|this)|is how|is why)"),
  'P6': ('Transit or station tied to a natal theme, house or planet that none of its contact lines touches',
         r"does not (touch|involve)|touches no|no (stated|listed) (factor|link|contact)|moved onto|borrows|wrong natal|only through|without (the )?(rulership|a stated)|not tied|outside the (computed )?station orb|rests on the shared house",
         None),
}

def grade_hits(gdir):
  out = {}
  for f in sorted(os.listdir(gdir)):
    if not f.endswith('.json'): continue
    d = json.load(open(os.path.join(gdir, f)))
    notes = [n for k in FIELDS for n in (d.get(k) if isinstance(d.get(k), list) else [d.get(k) or ''])]
    hits = {}
    for k, (_, rx, _) in PATTERNS.items():
      m = [n for n in notes if re.search(rx, n, re.I)]
      if m: hits[k] = m
    out[f[:-5]] = (d['C2'], hits)
  return out

def reading_hits(rdir):
  out = {}
  for f in sorted(os.listdir(rdir)):
    if not f.endswith('.md') or '.draft' in f: continue
    t = open(os.path.join(rdir, f)).read()
    out[f[:-3]] = {k: len(re.findall(rr, t, re.I)) for k, (_, _, rr) in PATTERNS.items() if rr}
  return out

if __name__ == '__main__':
  g = grade_hits(sys.argv[1])
  c2 = [v[0] for v in g.values()]
  print(f'grades: {len(g)}; C2 mean {sum(c2)/len(c2):.2f}; C2=4: {c2.count(4)}; C2=5: {c2.count(5)}; other: {len(c2)-c2.count(4)-c2.count(5)}')
  print('pattern | grades with C2<5 | grades with C2=5 | charts (C2<5)')
  for k, (desc, _, _) in PATTERNS.items():
    lo = sorted(c for c, (s, h) in g.items() if k in h and s < 5)
    hi = sorted(c for c, (s, h) in g.items() if k in h and s == 5)
    print(f'{k} | {len(lo)} | {len(hi)} | {" ".join(lo)}')
  none = sorted(c for c, (s, h) in g.items() if s < 5 and not h)
  print('C2<5 with no pattern matched:', ' '.join(none) or 'none')
  if len(sys.argv) > 2:
    r = reading_hits(sys.argv[2])
    print('reading phrasing | readings using it | total uses')
    for k in PATTERNS:
      if PATTERNS[k][2]:
        n = [v[k] for v in r.values()]
        print(f'{k} | {sum(1 for x in n if x)} | {sum(n)}')
