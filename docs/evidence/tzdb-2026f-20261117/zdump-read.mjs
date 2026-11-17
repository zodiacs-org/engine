/*
 * Reads `zdump -v` text (as oracle.mjs writes it: "NAME  <UT date> UT = <local
 * date> ABBR isdst=N gmtoff=N" per line) into each name's clock: the state in
 * force before its first listed instant, then every instant at which the
 * offset, isdst or abbreviation changes. A line dated before year 1000 (or
 * one whose UT zdump could not convert, an extreme of time_t, negative)
 * stands for the state in force from the beginning of time; one after 9999
 * is ignored. Lines with no local state are skipped.
 */
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const LINE = /^(\S+)  (?:\w{3} (\w{3}) +(\d+) (\d\d):(\d\d):(\d\d) (-?\d+) UT|(-?\d+) \(gmtime failed\)) = .* (\S+) isdst=(\d) gmtoff=(-?\d+)$/;

export function readZdump(text) {
  const raw = new Map();
  for (const line of text.split("\n")) {
    if (!line.includes(" isdst=")) continue;
    const match = LINE.exec(line);
    if (!match) throw new Error(`zdump-read: line not understood: ${line}`);
    const [, name, month, day, hh, mm, ss, yearText, seconds, abbr, isdst, gmtoff] = match;
    // zdump prints the bare count of seconds where gmtime cannot convert it: the extremes of time_t.
    const year = seconds === undefined ? Number(yearText) : Number(seconds) < 0 ? -Infinity : Infinity;
    if (year > 9999) continue;
    let t = -Infinity;
    if (year >= 1000) {
      const date = new Date(0);
      date.setUTCFullYear(year, MONTHS[month], Number(day));
      date.setUTCHours(Number(hh), Number(mm), Number(ss), 0);
      t = date.getTime() / 1000;
    }
    if (!raw.has(name)) raw.set(name, []);
    raw.get(name).push({ t, offset: Number(gmtoff), isdst: Number(isdst), abbr });
  }
  const clocks = new Map();
  for (const [name, lines] of raw) {
    lines.sort((a, b) => a.t - b.t);
    const [first] = lines;
    if (first.t !== -Infinity) throw new Error(`zdump-read: ${name} has no state from the beginning of time`);
    const changes = [];
    let current = first;
    for (const line of lines.slice(1)) {
      if (line.offset === current.offset && line.isdst === current.isdst && line.abbr === current.abbr) continue;
      changes.push(line);
      current = line;
    }
    clocks.set(name, { initial: { offset: first.offset, isdst: first.isdst, abbr: first.abbr }, changes });
  }
  return clocks;
}

/** The state in force at Unix second s. */
export function stateAt(clock, s) {
  let state = clock.initial;
  for (const change of clock.changes) {
    if (change.t > s) break;
    state = change;
  }
  return state;
}

/**
 * The intervals [from, to) before `end` on which two clocks give different
 * offsets, adjacent intervals with the same pair of offsets merged. Each
 * clock is constant between its own changes, so comparing on every segment
 * between the union of both clocks' changes is exhaustive.
 */
export function offsetDifferences(before, after, end) {
  const cuts = [...new Set([...before.changes, ...after.changes].map((change) => change.t).filter((t) => t < end))].sort((a, b) => a - b);
  const starts = [-Infinity, ...cuts];
  const out = [];
  starts.forEach((from, index) => {
    const to = index + 1 < starts.length ? starts[index + 1] : end;
    const old = stateAt(before, from).offset;
    const now = stateAt(after, from).offset;
    if (old === now) return;
    const last = out.at(-1);
    if (last && last.to === from && last.oldOffset === old && last.newOffset === now) last.to = to;
    else out.push({ from, to, oldOffset: old, newOffset: now });
  });
  return out;
}

/** The first instant from `start` on at which two clocks differ in offset, or null. */
export function firstDifferenceFrom(a, b, start) {
  const cuts = [...new Set([start, ...[...a.changes, ...b.changes].map((change) => change.t).filter((t) => t > start)])].sort((x, y) => x - y);
  return cuts.find((t) => stateAt(a, t).offset !== stateAt(b, t).offset) ?? null;
}

/** True when two clocks differ in offset at any instant from `start` on. */
export function differFrom(a, b, start) {
  return firstDifferenceFrom(a, b, start) !== null;
}

/**
 * The clock the package ships for a name, as the generator defines it: the
 * pinned build, or the default build where the two differ at any instant
 * from 1970 on (host-legal); "-00" spans (no local time) read from the
 * default build, as the engine reads them from the host's Intl. Null for a
 * name the default build lacks (the package leaves it out).
 *
 * `held`, for a zone the owner held at an earlier release (held.mjs): its
 * pinned clock must first differ from the default build at exactly
 * `held.firstDifferenceFromDefault`, and it is then not host-legal.
 */
export function shipped(pinned, host, name, held = null) {
  const p = pinned.get(name);
  const d = host.get(name);
  if (!d) return null;
  let hostLegal = !p || differFrom(p, d, 0);
  if (held && p) {
    const first = firstDifferenceFrom(p, d, 0);
    if (first !== held.firstDifferenceFromDefault) throw new Error(`zdump-read: held ${name} first differs from the default build at ${first}, expected ${held.firstDifferenceFromDefault}`);
    hostLegal = false;
  }
  if (hostLegal) return { form: "main", clock: d, hostLegal: !!p };
  if (![p.initial, ...p.changes].some((piece) => piece.abbr === "-00")) return { form: "main+backzone", clock: p, hostLegal: false };
  const cuts = [...new Set([...p.changes, ...d.changes].map((c) => c.t))].sort((a, b) => a - b);
  const merged = { initial: null, changes: [] };
  let last = null;
  for (const t of [-Infinity, ...cuts]) {
    const own = stateAt(p, t);
    const state = own.abbr === "-00" ? stateAt(d, t) : own;
    if (merged.initial === null) merged.initial = state;
    else if (!last || state.offset !== last.offset || state.isdst !== last.isdst || state.abbr !== last.abbr) merged.changes.push({ ...state, t });
    last = state;
  }
  return { form: "main+backzone", clock: merged, hostLegal: false };
}
