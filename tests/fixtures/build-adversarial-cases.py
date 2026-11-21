#!/usr/bin/env python3
"""Writes tests/fixtures/adversarial-astronomy.cases.json, the case list of
tests/adversarial-astronomy.spec.ts.

Run it from the repository root:  python3 -I tests/fixtures/build-adversarial-cases.py

Every case is written out below by hand; nothing is random and nothing is
taken from the engine. All birth data is synthetic.

The time zone cases carry two independent statements of the expected offset:

1. `claim`, typed here from the published history of the zone (the IANA tz
   database's own commentary: US War Time 1942 to 1945, British Double Summer
   Time, Amsterdam Time and the +00:20 zone of 1937 to 1940, India's wartime
   +06:30, Samoa's date line changes of 1892 and 2011, and so on);
2. what the host's compiled IANA tz database gives for that wall time, read
   with CPython's `zoneinfo` (no engine code is involved). The script stops
   if the two differ, and records the database's release in the fixture.

The compiled database must be a build with `backzone` (Debian's and most
distributions' are): Europe/Amsterdam's own history before 1940 exists only
there. The script checks that and stops otherwise.
"""
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

OUT = Path(__file__).with_name("adversarial-astronomy.cases.json")


def tzdb_release() -> str:
    first = Path("/usr/share/zoneinfo/tzdata.zi").read_text(encoding="utf-8").splitlines()[0]
    assert first.startswith("# version "), first
    return first.removeprefix("# version ").strip()


def read_wall_time(zone: str, date: str, time: str):
    """The host tz database's reading of a wall time: status, and the offset of each reading."""
    naive = datetime.fromisoformat(f"{date}T{time}:00")
    tz = ZoneInfo(zone)
    readings = []
    for fold in (0, 1):
        aware = naive.replace(tzinfo=tz, fold=fold)
        offset = aware.utcoffset()
        utc = (naive - offset).replace(tzinfo=timezone.utc)
        back = utc.astimezone(tz).replace(tzinfo=None)
        readings.append((int(offset.total_seconds()), utc, back == naive))
    (first, first_utc, first_ok), (second, second_utc, second_ok) = readings
    if first == second:
        assert first_ok, (zone, date, time)
        return "ok", first, None, first_utc
    if first_ok and second_ok:
        return "ambiguous", first, second, first_utc
    assert not first_ok and not second_ok, (zone, date, time)
    return "nonexistent", first, second, first_utc


# id, zone, date, time, claimed status, claimed offset seconds (of the reading the engine takes
# by default: the only one, the earlier one of a repeated time, or for a skipped time the offset
# before the jump, which moves the wall time forward by the jump), later offset or None, note.
TZ = [
    # US War Time, 1942-02-09 to 1945-09-30: an hour ahead all year.
    ("TZ-US-01", "America/New_York", "1942-02-09", "01:59", "ok", -18000, None, "last minute of Eastern Standard Time before War Time"),
    ("TZ-US-02", "America/New_York", "1942-02-09", "02:30", "nonexistent", -18000, -14400, "inside the hour War Time skipped"),
    ("TZ-US-03", "America/New_York", "1942-02-09", "03:00", "ok", -14400, None, "first minute of Eastern War Time"),
    ("TZ-US-04", "America/New_York", "1943-01-15", "12:00", "ok", -14400, None, "War Time in January: an hour ahead in winter"),
    ("TZ-US-05", "America/New_York", "1945-08-15", "12:00", "ok", -14400, None, "Eastern Peace Time, the same offset under a new name"),
    ("TZ-US-06", "America/New_York", "1945-09-30", "01:30", "ambiguous", -14400, -18000, "the hour repeated when War Time ended"),
    ("TZ-US-07", "America/New_York", "1945-09-30", "02:00", "ok", -18000, None, "first minute after War Time"),
    ("TZ-US-08", "America/Chicago", "1943-07-04", "12:00", "ok", -18000, None, "Central War Time"),
    ("TZ-US-09", "America/Los_Angeles", "1944-12-25", "08:00", "ok", -25200, None, "Pacific War Time in December"),
    ("TZ-US-10", "America/Phoenix", "1943-02-15", "12:00", "ok", -21600, None, "Arizona on Mountain War Time"),
    ("TZ-US-11", "America/Phoenix", "1944-02-15", "12:00", "ok", -25200, None, "Arizona left War Time on 1944-01-01, before the rest of the country"),
    ("TZ-US-12", "Pacific/Honolulu", "1943-06-01", "12:00", "ok", -34200, None, "Hawaiian War Time, -09:30"),
    ("TZ-US-13", "Pacific/Honolulu", "1947-06-08", "02:15", "nonexistent", -37800, -36000, "Hawaii moved from -10:30 to -10:00: a half hour skipped"),
    ("TZ-US-14", "America/New_York", "1850-01-01", "12:00", "ok", -17762, None, "local mean time before standard time, -04:56:02"),
    ("TZ-US-15", "America/New_York", "1883-11-18", "12:01", "ambiguous", -17762, -18000, "the day of two noons: 3 min 58 s repeated when standard time began"),
    ("TZ-US-16", "America/Sitka", "1867-10-18", "16:00", "ambiguous", 53927, -32473, "Alaska's transfer: the date line moved and a whole day repeated"),
    ("TZ-US-17", "America/New_York", "2021-03-14", "02:30", "nonexistent", -18000, -14400, "a modern skipped hour"),
    ("TZ-US-18", "America/New_York", "2021-11-07", "01:30", "ambiguous", -14400, -18000, "a modern repeated hour"),
    ("TZ-US-19", "America/New_York", "1990-06-15", "14:30", "ok", -14400, None, "the sprint's synthetic fixture"),
    ("TZ-US-20", "America/St_Johns", "1988-10-29", "23:00", "ambiguous", -5400, -12600, "Newfoundland's double daylight time of 1988: two hours repeated, across midnight"),
    # British Double Summer Time, and British Standard Time 1968 to 1971.
    ("TZ-UK-01", "Europe/London", "1940-02-25", "02:30", "nonexistent", 0, 3600, "summer time began in February 1940 and was kept through the winter"),
    ("TZ-UK-02", "Europe/London", "1940-12-25", "12:00", "ok", 3600, None, "summer time at Christmas 1940"),
    ("TZ-UK-03", "Europe/London", "1941-05-04", "02:30", "nonexistent", 3600, 7200, "the hour skipped when Double Summer Time began"),
    ("TZ-UK-04", "Europe/London", "1941-07-01", "12:00", "ok", 7200, None, "Double Summer Time"),
    ("TZ-UK-05", "Europe/London", "1941-08-10", "02:30", "ambiguous", 7200, 3600, "the hour repeated when Double Summer Time ended"),
    ("TZ-UK-06", "Europe/London", "1942-01-15", "12:00", "ok", 3600, None, "single summer time in January 1942"),
    ("TZ-UK-07", "Europe/London", "1945-07-14", "12:00", "ok", 7200, None, "the last full day of Double Summer Time in 1945"),
    ("TZ-UK-08", "Europe/London", "1945-07-16", "12:00", "ok", 3600, None, "the day after it ended"),
    ("TZ-UK-09", "Europe/London", "1947-06-01", "12:00", "ok", 7200, None, "Double Summer Time returned in 1947"),
    ("TZ-UK-10", "Europe/London", "1969-01-15", "12:00", "ok", 3600, None, "British Standard Time, an hour ahead in winter"),
    ("TZ-UK-11", "Europe/London", "1970-01-01", "00:00", "ok", 3600, None, "the Unix epoch was 01:00 in London"),
    ("TZ-UK-12", "Europe/Dublin", "1916-10-01", "02:30", "ambiguous", 2079, 0, "Dublin Mean Time ended: 34 min 39 s repeated"),
    # Amsterdam Time (+00:19:32), the +00:20 zone of 1937 to 1940, and the occupation.
    ("TZ-NL-01", "Europe/Amsterdam", "1936-12-01", "12:00", "ok", 1172, None, "Amsterdam Time, +00:19:32"),
    ("TZ-NL-02", "Europe/Amsterdam", "1937-06-15", "12:00", "ok", 4772, None, "Amsterdam summer time, +01:19:32"),
    ("TZ-NL-03", "Europe/Amsterdam", "1937-06-30", "23:59", "ok", 4772, None, "the last minute of Amsterdam Time"),
    ("TZ-NL-04", "Europe/Amsterdam", "1937-07-01", "00:00", "nonexistent", 4772, 4800, "28 seconds skipped when the zone became +00:20 (in summer time, +01:20)"),
    ("TZ-NL-05", "Europe/Amsterdam", "1937-07-15", "12:00", "ok", 4800, None, "the +00:20 zone in summer time, +01:20"),
    ("TZ-NL-06", "Europe/Amsterdam", "1937-12-01", "12:00", "ok", 1200, None, "the +00:20 zone"),
    ("TZ-NL-07", "Europe/Amsterdam", "1940-05-16", "00:30", "nonexistent", 1200, 7200, "the occupation put the clocks on German summer time: 1 h 40 min skipped"),
    ("TZ-NL-08", "Europe/Amsterdam", "1940-06-15", "12:00", "ok", 7200, None, "German summer time in the Netherlands"),
    # India: Madras time, Howrah time, and the wartime +06:30.
    ("TZ-IN-01", "Asia/Kolkata", "1860-01-01", "12:00", "ok", 21200, None, "Howrah mean time, +05:53:20"),
    ("TZ-IN-02", "Asia/Kolkata", "1900-06-15", "12:00", "ok", 19270, None, "Madras time, +05:21:10"),
    ("TZ-IN-03", "Asia/Kolkata", "1941-06-15", "12:00", "ok", 19800, None, "before the wartime advance"),
    ("TZ-IN-04", "Asia/Kolkata", "1941-12-15", "12:00", "ok", 23400, None, "the first wartime advance, +06:30"),
    ("TZ-IN-05", "Asia/Kolkata", "1942-07-01", "12:00", "ok", 19800, None, "between the two advances"),
    ("TZ-IN-06", "Asia/Kolkata", "1943-06-15", "12:00", "ok", 23400, None, "the second wartime advance, +06:30"),
    ("TZ-IN-07", "Asia/Kolkata", "1945-10-14", "23:30", "ambiguous", 23400, 19800, "the hour repeated when the advance ended"),
    ("TZ-IN-08", "Asia/Kolkata", "1945-10-15", "12:00", "ok", 19800, None, "back on +05:30"),
    # The date line.
    ("TZ-DL-01", "Pacific/Apia", "1892-07-04", "12:00", "ambiguous", 45184, -41216, "Samoa had two 4ths of July in 1892"),
    ("TZ-DL-02", "Pacific/Apia", "2011-12-29", "23:59", "ok", -36000, None, "the last minute before Samoa crossed the date line"),
    ("TZ-DL-03", "Pacific/Apia", "2011-12-30", "12:00", "nonexistent", -36000, 50400, "30 December 2011 did not happen in Samoa"),
    ("TZ-DL-04", "Pacific/Apia", "2011-12-31", "00:00", "ok", 50400, None, "the first minute after it"),
    ("TZ-DL-05", "Pacific/Kiritimati", "1994-12-31", "12:00", "nonexistent", -36000, 50400, "the Line Islands skipped 31 December 1994"),
    ("TZ-DL-06", "Asia/Manila", "1844-12-31", "12:00", "nonexistent", -57368, 29032, "the Philippines skipped 31 December 1844"),
    # Odd offsets and odd jumps.
    ("TZ-XX-01", "Europe/Paris", "1911-03-10", "23:55", "ambiguous", 561, 0, "Paris Mean Time ended: 9 min 21 s repeated"),
    ("TZ-XX-02", "Europe/Paris", "1911-03-11", "00:05", "ok", 0, None, "just after it"),
    ("TZ-XX-03", "Africa/Monrovia", "1971-06-15", "12:00", "ok", -2670, None, "Monrovia Mean Time, -00:44:30, in use until 1972"),
    ("TZ-XX-04", "Africa/Monrovia", "1972-01-07", "00:20", "nonexistent", -2670, 0, "44 min 30 s skipped when Liberia adopted UTC"),
    ("TZ-XX-05", "Asia/Kathmandu", "1986-01-01", "00:07", "nonexistent", 19800, 20700, "a quarter hour skipped: +05:30 to +05:45"),
    ("TZ-XX-06", "America/Caracas", "2007-12-09", "02:45", "ambiguous", -14400, -16200, "a half hour repeated: -04:00 to -04:30"),
    ("TZ-XX-07", "Asia/Pyongyang", "2015-08-14", "23:45", "ambiguous", 32400, 30600, "a half hour repeated, across midnight"),
    ("TZ-XX-08", "Asia/Pyongyang", "2018-05-04", "23:45", "nonexistent", 30600, 32400, "and skipped again in 2018"),
    ("TZ-XX-09", "Antarctica/Troll", "2021-03-28", "02:30", "nonexistent", 0, 7200, "a two hour jump"),
    ("TZ-XX-10", "Asia/Almaty", "2024-02-29", "23:30", "ambiguous", 21600, 18000, "an hour repeated on a leap day"),
    ("TZ-XX-11", "Australia/Lord_Howe", "2020-10-04", "02:15", "nonexistent", 37800, 39600, "a half hour of daylight saving: skipped"),
    ("TZ-XX-12", "Australia/Lord_Howe", "2020-04-05", "01:45", "ambiguous", 39600, 37800, "and repeated"),
    ("TZ-XX-13", "Europe/Moscow", "2011-03-27", "02:30", "nonexistent", 10800, 14400, "the last spring change before permanent summer time"),
    ("TZ-XX-14", "Europe/Moscow", "2014-10-26", "01:30", "ambiguous", 14400, 10800, "the hour repeated when Russia went back"),
    ("TZ-XX-15", "Asia/Singapore", "1981-12-31", "23:45", "nonexistent", 27000, 28800, "a half hour skipped at the end of 1981"),
    ("TZ-XX-16", "Asia/Tehran", "2023-03-22", "00:30", "ok", 12600, None, "Iran stopped changing its clocks after 2022"),
    ("TZ-XX-17", "Etc/GMT-14", "1990-06-15", "12:00", "ok", 50400, None, "a fixed zone at the far edge"),
]

# The zones whose pre-1970 history the host's Intl (ICU) does not carry as the tz database's
# backzone does: ICU reads Europe/Amsterdam as Europe/Brussels. Measured on Node 22.23.3 (ICU
# 78.3, tzdata 2026c); the spec reports the host's answer for these and does not hold it.
INTL_WITHOUT_BACKZONE = {"Europe/Amsterdam"}

# id, latitude, house system, instant, what Placidus must do, note. Longitude 25 E throughout.
POLAR_LATITUDES = [
    (66.5, "computed", "just outside the polar circle of 2000 (90 deg less the obliquity is about 66.562)"),
    (66.6, "fallback", "just inside it"),
    (67.5, "fallback", ""),
    (69.6492, "fallback", "the latitude of Tromso"),
    (71.17, "fallback", "the latitude of the North Cape"),
    (78.2232, "fallback", "the latitude of Longyearbyen"),
    (82.5, "fallback", "the latitude of Alert"),
    (85.0, "fallback", ""),
    (89.0, "fallback", ""),
    (89.9999, "fallback", "eleven metres from the pole"),
    (90.0, "fallback", "the North Pole"),
    (-66.6, "fallback", "just inside the Antarctic circle"),
    (-77.85, "fallback", "the latitude of McMurdo"),
    (-90.0, "fallback", "the South Pole"),
]
POLAR_INSTANT = "2000-06-21T12:00:00Z"
# Where the fallback begins, bisected by the spec and held to 90 deg less the true obliquity.
POLAR_BOUNDARIES = ["1850-06-21T12:00:00Z", "2000-06-21T12:00:00Z", "2099-12-21T03:00:00Z"]

# Nominal month and day of the Sun's entry into each sign; the search window is 6 days either side.
INGRESS_NOMINAL = {0: (3, 20), 30: (4, 20), 60: (5, 21), 90: (6, 21), 120: (7, 23), 150: (8, 23),
                   180: (9, 23), 210: (10, 23), 240: (11, 22), 270: (12, 22), 300: (1, 20), 330: (2, 19)}
INGRESS_YEARS = {2026: sorted(INGRESS_NOMINAL), 1850: [0, 90, 180, 270], 1900: [0, 90, 180, 270],
                 2000: [0, 90, 180, 270], 2099: [0, 90, 180, 270]}
# The one ingress the repository holds a reference for: NAIF's de440.bsp, reduced independently
# (docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json).
INGRESS_REFERENCE = {(2026, 240): "2026-11-22T07:23:20.563195Z"}

LEAP = [
    ("LEAP-01", "utc", {"utc": "2000-02-29T12:00:00Z"}, "ok", "2000 is a leap year (divisible by 400)"),
    ("LEAP-02", "utc", {"utc": "1900-02-29T12:00:00Z"}, "RangeError", "1900 is not a leap year"),
    ("LEAP-03", "utc", {"utc": "2100-02-29T12:00:00Z"}, "RangeError", "2100 is not a leap year"),
    ("LEAP-04", "utc", {"utc": "1904-02-29T12:00:00Z"}, "ok", "1904 is a leap year"),
    ("LEAP-05", "utc", {"utc": "2096-02-29T12:00:00Z"}, "ok", "2096 is a leap year"),
    ("LEAP-06", "utc", {"utc": "1899-02-29T12:00:00Z"}, "RangeError", "1899 is not a leap year"),
    ("LEAP-07", "utc", {"utc": "2000-02-30T12:00:00Z"}, "RangeError", "no 30 February"),
    ("LEAP-08", "local", {"date": "1900-02-29", "time": "12:00", "timeZone": "Europe/Moscow"}, "RangeError", "no 29 February 1900 in the Gregorian calendar"),
    ("LEAP-09", "local", {"date": "1900-02-29", "time": "12:00", "timeZone": "Europe/Moscow", "calendar": "julian"}, "ok",
     "29 February 1900 did exist in the Julian calendar Russia kept: it is 13 March 1900 Gregorian"),
    ("LEAP-10", "local", {"date": "2100-02-29", "time": "12:00", "timeZone": "UTC"}, "RangeError", "no 29 February 2100"),
    ("LEAP-11", "local", {"date": "2000-02-29", "time": "23:59", "timeZone": "America/New_York"}, "ok", "the last minute of a leap day, already 1 March in UTC"),
    ("LEAP-12", "local", {"date": "2024-02-29", "time": "12:00", "timeZone": "Asia/Tokyo"}, "ok", "an ordinary leap day"),
]
LEAP_EXPECTED_UTC = {"LEAP-09": "1900-03-13T09:29:43Z", "LEAP-11": "2000-03-01T04:59:00Z", "LEAP-12": "2024-02-29T03:00:00Z"}

# Unknown birth time. `moon`: how many signs the Moon is in during the local day; `sun` likewise.
NOTIME = [
    ("NOTIME-01", "1990-06-16", "America/New_York", 40.7128, -74.006, 2, 1, "the Moon enters Aries in the morning"),
    ("NOTIME-02", "2026-11-20", "Asia/Kolkata", 19.076, 72.8777, 2, 1, "the Moon enters Aries before noon"),
    ("NOTIME-03", "2000-09-14", "Europe/London", 51.5074, -0.1278, 2, 1, "the Moon enters Aries at 13:00 local"),
    ("NOTIME-04", "1944-06-14", "Europe/London", 51.5074, -0.1278, 2, 1, "under Double Summer Time, read from the pre-1970 zone history"),
    ("NOTIME-05", "1900-06-20", "Asia/Kolkata", 13.0827, 80.2707, 2, 1, "under Madras time, +05:21:10"),
    ("NOTIME-06", "1850-06-04", "America/New_York", 40.7128, -74.006, 2, 1, "under local mean time, in 1850"),
    ("NOTIME-07", "2099-07-09", "Asia/Tokyo", 35.6762, 139.6503, 2, 1, "in 2099"),
    ("NOTIME-08", "2026-08-30", "Australia/Sydney", -33.8688, 151.2093, 2, 1, "in the southern hemisphere"),
    ("NOTIME-09", "2026-05-13", "Arctic/Longyearbyen", 78.2232, 15.6267, 2, 1, "inside the polar circle, two hours after local midnight"),
    ("NOTIME-10", "1990-06-15", "America/New_York", 40.7128, -74.006, 1, 1, "control: the Moon stays in Pisces all day"),
    ("NOTIME-11", "2026-11-21", "Asia/Kolkata", 19.076, 72.8777, 1, 1, "control: the day after the Moon entered Aries"),
    ("NOTIME-12", "2026-11-22", "America/New_York", 40.7128, -74.006, None, 2, "the Sun enters Sagittarius at 02:23 local: the Sun sign itself depends on the time"),
    ("NOTIME-13", "2026-03-20", "Europe/London", 51.5074, -0.1278, None, 2, "the March equinox falls in the afternoon"),
]

YEARS = [
    ("YEAR-01", "1850-01-01T00:00:00Z", "jpl-de440", []),
    ("YEAR-02", "1850-06-15T12:00:00Z", "jpl-de440", []),
    ("YEAR-03", "1900-01-01T00:00:00Z", "jpl-de440", []),
    ("YEAR-04", "1900-03-01T00:00:00Z", "jpl-de440", []),
    ("YEAR-05", "1900-12-31T23:59:59Z", "jpl-de440", []),
    ("YEAR-06", "2099-01-01T00:00:00Z", "jpl-de440", ["delta-t-extrapolated"]),
    ("YEAR-07", "2099-12-31T23:59:59Z", "jpl-de440", ["delta-t-extrapolated"]),
    ("YEAR-08", "1790-01-03T00:00:00Z", "jpl-de440", []),
    ("YEAR-09", "2209-12-30T00:00:00Z", "jpl-de440", []),
    ("YEAR-10", "1790-01-01T00:00:00Z", "astronomy-engine", ["outside-de440-span"]),
    ("YEAR-11", "2210-01-02T00:00:00Z", "astronomy-engine", ["outside-de440-span"]),
    ("YEAR-12", "1700-01-01T00:00:00Z", "astronomy-engine", ["outside-de440-span", "outside-reference-span"]),
    ("YEAR-13", "0002-01-01T00:00:00Z", "astronomy-engine", ["outside-de440-span", "outside-reference-span"]),
]

OK_UTC = "1990-06-15T18:30:00Z"
NAN, INF = "__NaN__", "__Infinity__"  # JSON has no NaN or Infinity: the spec puts the numbers back.
# id, function, argument (JSON, with the two markers above), expectation, note.
BAD = [
    ("BAD-01", "natalChart", {}, "RangeError", "an empty object"),
    ("BAD-02", "natalChart", None, "RangeError", "null"),
    ("BAD-03", "natalChart", "1990-06-15", "RangeError", "a string in place of the birth"),
    ("BAD-04", "natalChart", [], "RangeError", "an array"),
    ("BAD-05", "natalChart", {"utc": "garbage"}, "RangeError", "not a date"),
    ("BAD-06", "natalChart", {"utc": "1990-02-30T00:00:00Z"}, "RangeError", "30 February"),
    ("BAD-07", "natalChart", {"utc": "1990-13-01T00:00:00Z"}, "RangeError", "month 13"),
    ("BAD-08", "natalChart", {"utc": "1990-06-15T25:00:00Z"}, "RangeError", "hour 25"),
    ("BAD-09", "natalChart", {"utc": "1990-06-15T12:00:60Z"}, "RangeError", "second 60 on a day with no leap second"),
    ("BAD-10", "natalChart", {"utc": "1990-06-15T12:00:00"}, "RangeError", "no UTC offset: the engine does not guess a zone"),
    ("BAD-11", "natalChart", {"utc": "1990-06-15"}, "RangeError", "a date with no time and no timeKnown: false"),
    ("BAD-12", "natalChart", {"utc": "1990-06-15T12:00:00+25:00"}, "RangeError", "an offset of 25 hours"),
    ("BAD-13", "natalChart", {"utc": "15/06/1990 14:30"}, "RangeError", "a day-first date"),
    ("BAD-14", "natalChart", {"utc": None}, "RangeError", "utc null"),
    ("BAD-15", "natalChart", {"utc": NAN}, "RangeError", "utc NaN"),
    ("BAD-16", "natalChart", {"utc": INF}, "RangeError", "utc Infinity"),
    ("BAD-17", "natalChart", {"utc": ["1990-06-15T12:00:00Z"]}, "RangeError", "utc in an array"),
    ("BAD-18", "natalChart", {"utc": OK_UTC, "latitude": 91, "longitude": 0}, "RangeError", "latitude 91"),
    ("BAD-19", "natalChart", {"utc": OK_UTC, "latitude": -90.0001, "longitude": 0}, "RangeError", "latitude just past the South Pole"),
    ("BAD-20", "natalChart", {"utc": OK_UTC, "latitude": 0, "longitude": 181}, "RangeError", "longitude 181"),
    ("BAD-21", "natalChart", {"utc": OK_UTC, "latitude": 0, "longitude": -180.0001}, "RangeError", "longitude just past -180"),
    ("BAD-22", "natalChart", {"utc": OK_UTC, "latitude": NAN, "longitude": 0}, "RangeError", "latitude NaN"),
    ("BAD-23", "natalChart", {"utc": OK_UTC, "latitude": 0, "longitude": NAN}, "RangeError", "longitude NaN"),
    ("BAD-24", "natalChart", {"utc": OK_UTC, "latitude": INF, "longitude": 0}, "RangeError", "latitude Infinity"),
    ("BAD-25", "natalChart", {"utc": OK_UTC, "latitude": "40.7128", "longitude": "-74.006"}, "RangeError", "coordinates as strings"),
    ("BAD-26", "natalChart", {"utc": OK_UTC, "latitude": 40.7128}, "RangeError", "a latitude with no longitude"),
    ("BAD-27", "natalChart", {"utc": OK_UTC, "lat": 40.7128, "lng": -74.006}, "RangeError", "lat and lng, which earlier releases ignored"),
    ("BAD-28", "natalChart", {"utc": OK_UTC, "latitude": 40.7128, "longitude": -74.006, "houseSystem": "PLACIDUS"}, "RangeError", "a house system in capitals"),
    ("BAD-29", "natalChart", {"utc": OK_UTC, "latitude": 40.7128, "longitude": -74.006, "houseSystem": "placidus "}, "RangeError", "a house system with a trailing space"),
    ("BAD-30", "natalChart", {"utc": OK_UTC, "latitude": 40.7128, "longitude": -74.006, "houseSystem": None}, "RangeError", "house system null"),
    ("BAD-31", "natalChart", {"utc": OK_UTC, "timeKnown": "false"}, "RangeError", "timeKnown as the string \"false\", which is truthy"),
    ("BAD-32", "natalChart", {"utc": OK_UTC, "timeKnown": 0}, "RangeError", "timeKnown 0"),
    ("BAD-33", "natalChart", {"utc": OK_UTC, "latitude": 40.7128, "longitude": -74.006, "flags": ["no-time"]}, "RangeError", "a no-time flag on a chart with a time"),
    ("BAD-34", "natalChart", {"utc": OK_UTC, "flags": ["bogus"]}, "RangeError", "an unknown flag"),
    ("BAD-35", "natalChart", {"utc": OK_UTC, "deltaT": NAN}, "RangeError", "deltaT NaN"),
    ("BAD-36", "natalChart", {"utc": OK_UTC, "timeScale": "tai"}, "RangeError", "an unknown time scale"),
    ("BAD-37", "natalChart", {"utc": "0001-01-01T00:00:00Z"}, "RangeError", "before the ephemeris begins"),
    ("BAD-38", "natalChart", {"utc": "3999-01-01T00:00:00Z"}, "RangeError", "after the ephemeris ends"),
    ("BAD-39", "natalChart", {"utc": 8.64e15}, "RangeError", "the largest JavaScript date"),
    ("BAD-40", "positions", "garbage", "RangeError", "positions of a string that is not a date"),
    ("BAD-41", "positions", None, "RangeError", "positions of null"),
    ("BAD-42", "positions", NAN, "RangeError", "positions of NaN"),
    ("BAD-43", "resolveLocalToUtc", ["1990-6-15", "12:00", "UTC"], "RangeError", "a date without zero padding"),
    ("BAD-44", "resolveLocalToUtc", ["1990-06-15", "24:00", "UTC"], "RangeError", "24:00"),
    ("BAD-45", "resolveLocalToUtc", ["1990-06-15", "12:60", "UTC"], "RangeError", "minute 60"),
    ("BAD-46", "resolveLocalToUtc", ["1990-06-31", "12:00", "UTC"], "RangeError", "31 June"),
    ("BAD-47", "resolveLocalToUtc", ["1990-06-15", "12:00", "Mars/Phobos"], "RangeError", "a zone that does not exist"),
    ("BAD-48", "resolveLocalToUtc", ["1990-06-15", "12:00", ""], "RangeError", "an empty zone"),
    ("BAD-49", "resolveLocalToUtc", ["1990-06-15", "12:00", "UTC+5"], "RangeError", "UTC+5 is not an IANA zone"),
    ("BAD-50", "resolveLocalToUtc", ["1990-06-15", "1230", "UTC"], "RangeError", "a time with no colon"),
    ("BAD-51", "resolveBirth", {"date": "1990-06-15", "time": "14:30", "timeZone": "America/New_York", "latitude": 95, "longitude": -74.006}, "RangeError", "a local birth at latitude 95"),
    ("BAD-52", "resolveBirth", {"date": "1990-06-15", "time": None, "timeZone": "America/New_York"}, "RangeError", "time null"),
    ("BAD-53", "resolveBirth", {"date": "1990-06-15", "time": "14:30", "timezone": "America/New_York"}, "RangeError", "timezone in lower case"),
    ("BAD-54", "searchLongitudeCrossings", ["Sun", NAN, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"], "RangeError", "a target longitude of NaN"),
    ("BAD-55", "searchLongitudeCrossings", ["Sun", 0, "2026-04-01T00:00:00Z", "2026-03-01T00:00:00Z"], "RangeError", "a window that ends before it begins"),
    ("BAD-56", "searchLongitudeCrossings", ["Vulcan", 0, "2026-03-01T00:00:00Z", "2026-04-01T00:00:00Z"], "RangeError",
     "a body that does not exist: a RangeError on every source (on 2.0.0-rc.3 the DE440 reader's own De440Error; BENCHMARK_AUDIT.md, known limits)"),
    # Unusual inputs the engine accepts, and must compute sanely.
    ("BAD-57", "natalChart", {"utc": 12345}, "ok", "a number is read as epoch milliseconds, as documented"),
    ("BAD-58", "natalChart", {"utc": "1990-06-15T12:00Z"}, "ok", "ISO 8601 without seconds"),
    ("BAD-59", "natalChart", {"utc": OK_UTC, "latitude": 0, "longitude": 180}, "ok", "longitude 180 exactly"),
    ("BAD-60", "natalChart", {"utc": OK_UTC, "latitude": 0, "longitude": -180}, "ok", "longitude -180 exactly"),
    ("BAD-61", "natalChart", {"utc": OK_UTC, "latitude": -0.0, "longitude": -0.0}, "ok", "negative zero"),
    ("BAD-62", "natalChart", {"utc": OK_UTC, "latitude": 40.7128, "longitude": -74.006, "timeKnown": False, "houseSystem": "placidus"}, "ok",
     "coordinates and a house system with timeKnown: false: still no houses"),
]


def main() -> None:
    release = tzdb_release()
    status, offset, _, _ = read_wall_time("Europe/Amsterdam", "1937-06-15", "12:00")
    if (status, offset) != ("ok", 4772):
        sys.exit("The host's tz database was built without backzone: Europe/Amsterdam 1937 is not +01:19:32.")

    cases = []
    for case_id, zone, date, time, claim_status, claim_offset, claim_later, note in TZ:
        status, offset, later, utc = read_wall_time(zone, date, time)
        if (status, offset, later if status != "ok" else None) != (claim_status, claim_offset, claim_later):
            sys.exit(f"{case_id}: claimed {claim_status} {claim_offset} {claim_later}, tz database gives {status} {offset} {later}")
        expected = {"status": status, "offsetSeconds": offset, "utc": utc.strftime("%Y-%m-%dT%H:%M:%SZ")}
        if status != "ok":
            expected["otherOffsetSeconds"] = later
        if status == "ambiguous":
            naive = datetime.fromisoformat(f"{date}T{time}:00")
            expected["laterUtc"] = (naive - timedelta(seconds=later)).strftime("%Y-%m-%dT%H:%M:%SZ")
        cases.append({"id": case_id, "category": "timezone", "input": {"zone": zone, "date": date, "time": time},
                      "expected": expected, "intlCarriesHistory": zone not in INTL_WITHOUT_BACKZONE, "note": note})

    for index, (latitude, placidus, note) in enumerate(POLAR_LATITUDES, start=1):
        for system in ("placidus", "whole"):
            cases.append({"id": f"POLAR-{index:02d}-{system}", "category": "polar",
                          "input": {"utc": POLAR_INSTANT, "latitude": latitude, "longitude": 25, "houseSystem": system},
                          "expected": {"houses": "whole" if system == "whole" else placidus}, "note": note})
    for index, instant in enumerate(POLAR_BOUNDARIES, start=1):
        cases.append({"id": f"POLAR-BOUNDARY-{index:02d}", "category": "polar-boundary", "input": {"utc": instant, "longitude": 25},
                      "expected": {"boundary": "90 degrees less the true obliquity of date"}, "note": "where the Placidus fallback begins"})

    for year, longitudes in INGRESS_YEARS.items():
        for longitude in longitudes:
            month, day = INGRESS_NOMINAL[longitude]
            middle = datetime(year, month, day, tzinfo=timezone.utc)
            case = {"id": f"INGRESS-{year}-{longitude:03d}", "category": "ingress",
                    "input": {"body": "Sun", "longitude": longitude,
                              "from": (middle - timedelta(days=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
                              "to": (middle + timedelta(days=6)).strftime("%Y-%m-%dT%H:%M:%SZ")},
                    "expected": {"crossings": 1}, "note": f"the Sun reaches {longitude} degrees in {year}"}
            if (year, longitude) in INGRESS_REFERENCE:
                case["expected"]["referenceUtc"] = INGRESS_REFERENCE[(year, longitude)]
                case["expected"]["reference"] = "NAIF de440.bsp, docs/evidence/1.1.0-rc.11-20261115/breaker/results/ingress-ref.json"
            cases.append(case)

    for case_id, form, value, expect, note in LEAP:
        expected = {"result": expect}
        if case_id in LEAP_EXPECTED_UTC:
            expected["utc"] = LEAP_EXPECTED_UTC[case_id]
        cases.append({"id": case_id, "category": "leap-day", "input": {"form": form, "value": value}, "expected": expected, "note": note})

    for case_id, date, zone, latitude, longitude, moon, sun, note in NOTIME:
        cases.append({"id": case_id, "category": "unknown-time",
                      "input": {"date": date, "timeZone": zone, "latitude": latitude, "longitude": longitude},
                      "expected": {"moonSigns": moon, "sunSigns": sun}, "note": note})

    for case_id, instant, ephemeris, flags in YEARS:
        cases.append({"id": case_id, "category": "extreme-year", "input": {"utc": instant},
                      "expected": {"ephemeris": ephemeris, "flags": flags}, "note": ""})

    for case_id, function, argument, expect, note in BAD:
        cases.append({"id": case_id, "category": "malformed", "input": {"function": function, "argument": argument},
                      "expected": {"result": expect}, "note": note})

    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids))
    counts: dict[str, int] = {}
    for case in cases:
        counts[case["category"]] = counts.get(case["category"], 0) + 1
    fixture = {
        "schema": "zodiacs.adversarial-astronomy.cases.v1",
        "about": "Hostile edge cases for tests/adversarial-astronomy.spec.ts. Written by tests/fixtures/build-adversarial-cases.py; do not edit by hand. All birth data is synthetic.",
        "timeZoneReference": {
            "source": "The host's compiled IANA tz database (zic, with backzone), read with CPython zoneinfo; each expected offset was also typed by hand from the zone's published history, and the generator stops if the two differ.",
            "tzdb": release,
        },
        "counts": counts,
        "total": len(cases),
        "cases": cases,
    }
    OUT.write_text(json.dumps(fixture, indent=1, ensure_ascii=True) + "\n", encoding="utf-8")
    print(f"{OUT.name}: {len(cases)} cases, tzdb {release}: {counts}")


if __name__ == "__main__":
    main()
