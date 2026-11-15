"""Fetch a JPL Horizons observer table over a span (QUANTITIES 2 and 31, airless, geocentric, TT, Julian dates,
extra precision) for one target, cached by query in HORIZONS_CACHE (default ./horizons-cache). For limb.py."""
import hashlib, os, subprocess, time, urllib.parse


def fetch(command, start, stop, step):
    cache = os.environ.get('HORIZONS_CACHE', 'horizons-cache')
    os.makedirs(cache, exist_ok=True)
    p = {'format': 'text', 'COMMAND': f"'{command}'", 'CENTER': "'500@399'", 'MAKE_EPHEM': 'YES', 'EPHEM_TYPE': 'OBSERVER',
         'TIME_TYPE': 'TT', 'QUANTITIES': "'2,31'", 'ANG_FORMAT': 'DEG', 'EXTRA_PREC': 'YES', 'CSV_FORMAT': 'YES',
         'APPARENT': 'AIRLESS', 'CAL_FORMAT': 'JD',
         'START_TIME': f"'JD {start:.9f}'", 'STOP_TIME': f"'JD {stop:.9f}'", 'STEP_SIZE': f"'{step}'"}
    url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(p, quote_via=urllib.parse.quote)
    path = f'{cache}/{command}-{hashlib.sha256(url.encode()).hexdigest()[:20]}.txt'
    if not os.path.exists(path):
        for attempt in range(12):
            r = subprocess.run(['curl', '-sS', '--max-time', '120', '-o', path + '.tmp', url])
            if r.returncode == 0 and '$$SOE' in open(path + '.tmp').read():
                os.replace(path + '.tmp', path)
                break
            time.sleep(10 + 10 * attempt)
        else:
            raise SystemExit(f'Horizons failed for {command}')
    text = open(path).read()
    rows = []
    for line in text.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines():
        f = [s.strip() for s in line.split(',')]
        rows.append((float(f[0]), float(f[3]), float(f[4])))
    return rows, hashlib.sha256(open(path, 'rb').read()).hexdigest()
