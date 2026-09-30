"""How the natal instants of horizons-returns.py were chosen, from Horizons's
longitudes alone (no engine output): for Mercury to Pluto, the stations of a
retrograde loop in the window year (daily Horizons longitudes), the loop's
middle degree, and the first minute, in a chosen earlier year, at which the
body stood within a minute's motion of that degree. The instants are then
written into horizons-returns.py as invented natal charts.

    HORIZONS_CACHE=/some/scratch python3 tools/horizons-select.py
"""
from datetime import datetime, timedelta, timezone

import horizons

U = timezone.utc
# body: (window year of the loop, earlier year to search for the natal instant)
PLAN = {'Mercury': (2031, 1995), 'Venus': (2033, 1988), 'Mars': (2035, 1993), 'Jupiter': (2037, 2025),
        'Saturn': (2040, 2009), 'Uranus': (2040, 1955), 'Neptune': (2040, 1874), 'Pluto': (2050, 1801)}


def seam(a, b):
    return (a - b + 180) % 360 - 180


for body, (loop_year, natal_year) in PLAN.items():
    rows, _, _ = horizons.query(body, datetime(loop_year, 1, 1, tzinfo=U), datetime(loop_year + 1, 6, 30, tzinfo=U), '1 d')
    unwrapped, total = [], 0.0
    for index, (when, lon) in enumerate(rows):
        if index:
            total += seam(lon, rows[index - 1][1])
        unwrapped.append((when, rows[0][1] + total))
    stations = [(unwrapped[i][0], unwrapped[i][1]) for i in range(1, len(unwrapped) - 1)
                if (unwrapped[i][1] - unwrapped[i - 1][1]) * (unwrapped[i + 1][1] - unwrapped[i][1]) < 0]
    # The first retrograde station (a maximum) and the direct station after it.
    first = next(i for i, (when, value) in enumerate(stations)
                 if i + 1 < len(stations) and value > stations[i + 1][1])
    middle = round(((stations[first][1] + stations[first + 1][1]) / 2) % 360, 2)
    scan, _, _ = horizons.query(body, datetime(natal_year, 1, 1, tzinfo=U), datetime(natal_year + 3, 12, 31, tzinfo=U), '1 d')
    for (t0, l0), (t1, l1) in zip(scan, scan[1:]):
        if seam(l0, middle) * seam(l1, middle) < 0 and abs(seam(l0, middle)) < 90:
            fine, _, _ = horizons.query(body, t0, t0 + timedelta(days=1), '1 m')
            natal = min(fine, key=lambda row: abs(seam(row[1], middle)))
            break
    print(body, 'loop', [(when.date().isoformat(), round(value % 360, 4)) for when, value in stations[first:first + 2]],
          'middle', middle, 'natal', natal[0].strftime('%Y-%m-%dT%H:%MZ'), round(natal[1], 6))
