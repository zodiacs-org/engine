/*
 * The instants on which the continuous-UTC rule must leave the time basis of
 * 1.1.0 and 2.0.0-rc.2 unchanged to the bit, shared by
 * src/time-scale-continuous.test.ts and
 * docs/evidence/continuous-utc-20261117/reference-time-basis.mjs. Each case is
 * [ms, scale, pin, fields], fields "all" for the whole record and "days" for
 * ut1Days and ttDays alone.
 */
const DAY = 86_400_000;
const TABLE_END = Date.UTC(2027, 9, 2);

/** mulberry32: a fixed sequence in [0, 1) from a 32-bit seed. */
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** `count` whole milliseconds in [from, to], from a seeded sequence. */
export function instantsBetween(seed, count, from, to) {
  const next = random(seed);
  return Array.from({ length: count }, () => from + Math.floor(next() * (to - from + 1)));
}

const at = (iso) => Date.parse(iso);

export const GROUPS = {
  // 2,000 UTC instants from 1972-01-01 to the table's last day, whole records.
  "utc-1972-to-table-end": instantsBetween(20_261_117, 2000, Date.UTC(1972, 0, 1), TABLE_END).map((ms) => [ms, "utc", null, "all"]),
  // The edges the ticket names, at and before the table's end, whole records.
  "edges-at-or-before-table-end": [
    [at("1971-12-31T23:59:59Z"), "utc", null, "all"],
    [at("1880-06-15T12:00:00Z"), "utc", null, "all"],
    [at("2027-05-20T00:00:00Z"), "utc", null, "all"],
    [at("2027-06-28T00:00:00Z"), "utc", null, "all"],
    [TABLE_END - 1, "utc", null, "all"],
    [TABLE_END, "utc", null, "all"],
    [TABLE_END, "ut1", null, "all"],
    [TABLE_END + 69_000, "tt", null, "all"]
  ],
  // TT and UT1 input after the table: ut1Days and ttDays.
  "tt-and-ut1-after-table-end": [
    ...instantsBetween(1, 200, TABLE_END + 1, Date.UTC(2209, 11, 31)).map((ms) => [ms, "tt", null, "days"]),
    ...instantsBetween(2, 200, TABLE_END + 1, Date.UTC(2209, 11, 31)).map((ms) => [ms, "ut1", null, "days"]),
    [Date.UTC(2030, 5, 15, 12), "ut1", null, "days"],
    [TABLE_END + 1, "ut1", null, "days"],
    [TABLE_END + 70_000, "tt", null, "days"]
  ],
  // Pinned ΔT on every scale, whole records.
  pinned: ["1990-06-15T12:00:00Z", "2030-06-15T12:00:00Z", "2199-06-19T12:00:00Z"].flatMap((iso) =>
    ["utc", "ut1", "tt"].map((scale) => [at(iso), scale, 70, "all"])
  )
};

export { DAY, TABLE_END };
