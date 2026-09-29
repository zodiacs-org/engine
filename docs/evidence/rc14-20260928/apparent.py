"""Apparent geocentric places in the true equator and equinox of date.

Two independent references, both vectorized over Terrestrial Time (TT) instants
given as Julian dates:

* ERFA alone, for the Sun: the Earth's heliocentric and barycentric state from
  erfa.epv00 (a fit to JPL DE405).
* JPL's DE440s kernel, read with jplephem, for the Sun, the Moon and the planets
  (system barycentres for Mars to Pluto), 1849-12-26 to 2150-01-22.

Both take the source at the retarded time (light time), deflect planetary light
by the Sun (erfa.ld), apply annual aberration with the Earth's barycentric
velocity (erfa.ab), and rotate with the IAU 2006/2000A bias-precession-nutation
matrix (erfa.pnm06a). The true obliquity of date is erfa.obl06 plus the nut06a
nutation in obliquity. TDB is TT plus erfa.dtdb at the geocentre.

Neither reference is the engine's ephemeris, and no Swiss Ephemeris code or
output is used.
"""
import erfa
import numpy as np

AU_KM = 149597870.700
C_AU_PER_DAY = 173.1446326846693
ARCSEC = 180 / np.pi * 3600
J2000 = 2451545.0
PLANETS = {"Mercury": (1, 199), "Venus": (2, 299), "Mars": (4,), "Jupiter": (5,), "Saturn": (6,),
           "Uranus": (7,), "Neptune": (8,), "Pluto": (9,)}


def parts(jd_tt):
    """TT as ERFA's two-part date, split at J2000 for precision."""
    jd_tt = np.asarray(jd_tt, dtype=float)
    return np.full_like(jd_tt, J2000), jd_tt - J2000


def true_frame(jd_tt):
    """The GCRS-to-true-of-date matrices and the true obliquity (radians)."""
    one, two = parts(jd_tt)
    return erfa.pnm06a(one, two), erfa.obl06(one, two) + erfa.nut06a(one, two)[1]


def tdb_of(jd_tt):
    one, two = parts(jd_tt)
    return jd_tt + erfa.dtdb(one, two, 0.0, 0.0, 0.0, 0.0) / 86400.0


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def observe(geometric, earth_velocity, sun_to_earth, deflect, source_from_sun=None):
    """Deflection (optional) and aberration of geometric geocentric vectors, all (N, 3) in au and au/day."""
    direction = unit(geometric)
    em = np.linalg.norm(sun_to_earth, axis=-1)
    if deflect:
        direction = erfa.ld(1.0, direction, unit(source_from_sun), unit(sun_to_earth), em, 1e-9)
    v = earth_velocity / C_AU_PER_DAY
    bm1 = np.sqrt(1 - np.sum(v * v, axis=-1))
    return erfa.ab(direction, v, em, bm1)


def to_date(jd_tt, gcrs):
    """Declination and ecliptic longitude/latitude of date (radians), and the true obliquity."""
    matrix, eps = true_frame(jd_tt)
    x, y, z = np.einsum("nij,nj->ni", matrix, gcrs).T
    dec = np.arcsin(z / np.sqrt(x * x + y * y + z * z))
    ye = y * np.cos(eps) + z * np.sin(eps)
    ze = -y * np.sin(eps) + z * np.cos(eps)
    return {"dec": dec, "lon": np.mod(np.arctan2(ye, x), 2 * np.pi), "lat": np.arcsin(ze / np.sqrt(x * x + ye * ye + ze * ze)),
            "eps": eps}


def erfa_sun(jd_tt):
    one, two = parts(tdb_of(jd_tt))
    heliocentric, barycentric = erfa.epv00(one, two)
    earth, velocity = barycentric["p"], barycentric["v"]
    sun, sun_velocity = earth - heliocentric["p"], velocity - heliocentric["v"]
    tau = np.linalg.norm(sun - earth, axis=-1) / C_AU_PER_DAY
    geometric = sun - sun_velocity * tau[:, None] - earth
    return to_date(jd_tt, observe(geometric, velocity, earth - sun, deflect=False))


class DE440s:
    def __init__(self, path):
        from jplephem.spk import SPK
        self.kernel = SPK.open(path)

    def _position(self, chain, tdb):
        total = 0
        for centre, target in zip(chain[:-1], chain[1:]):
            total = total + self.kernel[centre, target].compute(tdb)
        return (total / AU_KM).T

    def _earth(self, tdb):
        position = (self.kernel[0, 3].compute(tdb) + self.kernel[3, 399].compute(tdb)) / AU_KM
        velocity = (self.kernel[0, 3].compute_and_differentiate(tdb)[1] + self.kernel[3, 399].compute_and_differentiate(tdb)[1]) / AU_KM
        return position.T, velocity.T

    def body(self, name, jd_tt):
        tdb = tdb_of(jd_tt)
        earth, velocity = self._earth(tdb)
        sun_now = self._position((0, 10), tdb)
        chain = {"Sun": (0, 10), "Moon": (0, 3, 301)}.get(name) or (0,) + PLANETS[name]
        tau = np.zeros_like(tdb)
        for _ in range(4):
            source = self._position(chain, tdb - tau)
            tau = np.linalg.norm(source - earth, axis=-1) / C_AU_PER_DAY
        deflect = name not in ("Sun", "Moon")
        return to_date(jd_tt, observe(source - earth, velocity, earth - sun_now, deflect, source - sun_now))
