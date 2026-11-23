"""Solve the extra quarter and outer station cases with the independent L4 reduction."""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'conformance/arbiters/l4'))
import build as l4


def solve(sky, selection, start, stop):
    station = isinstance(selection, str)
    quantity = l4.Quantity(sky, selection if station else None)
    times = l4.grid(start, start, stop, 6 * l4.HOUR)
    values = l4.rate(quantity, times) if station else l4.wrap(quantity.at(times) - selection)
    events = []
    for i in range(1, len(times)):
        rising = values[i - 1] < 0 <= values[i]
        falling = values[i - 1] > 0 >= values[i]
        if station and (rising or falling):
            direction = 'direct' if rising else 'retrograde'
            root = l4.solve_station(quantity, (times[i - 1], times[i], direction))
            samples = quantity.at(root + np.array([-l4.HOUR, 0, l4.HOUR]))
            tolerance, _ = l4.tolerance('event.station', selection, {'lon': samples})
            events.append({'ttSeconds': root, 'direction': direction, 'toleranceSeconds': tolerance})
        elif not station and rising:
            root = l4.solve_level(quantity, (times[i - 1], times[i], selection))
            events.append({'ttSeconds': root, 'toleranceSeconds': 2})
    return {'selection': selection, 'fromTtSeconds': start, 'toTtSeconds': stop, 'events': events}


def main(path):
    if l4.sha256_file(path) != l4.KERNEL_SHA256:
        raise ValueError('expected the pinned NAIF DE440s kernel')
    sky = l4.Sky(path)
    april = (l4.seconds(2024, 4, 1), l4.seconds(2024, 5, 1))
    year = (l4.seconds(2024, 1, 1), l4.seconds(2025, 1, 1))
    cases = [solve(sky, angle, *april) for angle in (90, 270)]
    cases += [solve(sky, body, *year) for body in ('Uranus', 'Neptune', 'Pluto')]
    print(json.dumps({'kernel': l4.KERNEL_URL, 'sha256': l4.KERNEL_SHA256,
                      'timeOrigin': 'J2000.0 TT', 'cases': cases}, indent=2))


if __name__ == '__main__':
    main(sys.argv[1])
