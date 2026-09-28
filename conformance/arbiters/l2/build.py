#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Arbiter and vector generator for level L2 (houses and angles), suite v0.

    python3 conformance/arbiters/l2/build.py           # writes conformance/vectors/L2-houses-angles.json
    python3 conformance/arbiters/l2/build.py --report  # also prints the diagnostics quoted in README.md

Requirements: Python 3.11 and pyerfa 2.0.1.5 (ERFA 2.0.1). Nothing else: no
astrology engine and no Swiss Ephemeris code is imported or consulted. The
output is deterministic (the same bytes on every run).

Where each number comes from
----------------------------
* Earth rotation, precession-nutation and obliquity: ERFA (the BSD-licensed
  derivative of IAU SOFA). GAST = gst06a (IAU 2006 precession, IAU 2000A
  nutation); true obliquity = obl06 + the Delta-epsilon of nut06a.
* TT - UT1 (Delta T): IERS measurements where they exist (UT1-UTC from the
  IERS finals2000A series, TAI-UTC from IERS Bulletin C), the Espenak & Meeus
  (2006) polynomials elsewhere. See TimeScale.
* Everything after RAMC, the true obliquity and the latitude is spherical
  geometry written in this file from the published definition of each angle
  and house system (Holden, The Elements of House Division, 1977; Munkasey,
  An Astrological House Formulary; Smart, Textbook on Spherical Astronomy).
  Each definition is implemented twice by different routes (great-circle
  vector algebra and the classical trigonometric formula, or two different
  root-finding spaces), and each result is then checked against its defining
  property with ERFA's own coordinate routines. The build stops if any two
  routes disagree by more than CHECK_LIMIT_ARCSEC.
* Diagnostics only (quoted in the arbiter texts, never used for a value):
  the change of every output for Delta T + 60 s, for small RAMC and
  obliquity errors, and for ERFA's older IAU model sets (older_models).
"""

from __future__ import annotations

import csv
import hashlib
import itertools
import json
import math
import os
import re
import statistics
import sys
import warnings

import erfa

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, os.pardir, os.pardir))  # conformance/

SUITE = 'zodiacs-conformance'
SUITE_VERSION = '0.1.0'
LEVEL = 'L2'
TITLE = 'Houses and angles'
GENERATOR = 'arbiters/l2/build.py'
OUTPUT = 'vectors/L2-houses-angles.json'
IERS_CSV = 'sources/l2/iers-finals2000A-ut1.csv'
LEAP_DAT = 'sources/l2/Leap_Second.dat'

DEG = math.pi / 180.0
TAU = 2.0 * math.pi
HALF_PI = 0.5 * math.pi
ARCSEC = DEG / 3600.0
DJM0 = 2400000.5  # JD of MJD 0

# Two routes to the same quantity must agree to this (arcsec) or the build stops.
CHECK_LIMIT_ARCSEC = 1e-6

SYSTEMS = ('placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius',
           'equal', 'whole-sign', 'morinus', 'meridian', 'topocentric', 'vehlow', 'equal-mc')

# Which arbiter entry speaks for which house system (families of definitions).
FAMILY = {
    'equal': 'l2-houses-ecliptic', 'whole-sign': 'l2-houses-ecliptic',
    'vehlow': 'l2-houses-ecliptic', 'equal-mc': 'l2-houses-ecliptic',
    'porphyry': 'l2-houses-ecliptic',
    'regiomontanus': 'l2-houses-great-circle', 'campanus': 'l2-houses-great-circle',
    'meridian': 'l2-houses-great-circle', 'morinus': 'l2-houses-great-circle',
    'placidus': 'l2-houses-semi-arc', 'koch': 'l2-houses-semi-arc',
    'alcabitius': 'l2-houses-semi-arc', 'topocentric': 'l2-houses-semi-arc',
}


class CircumpolarError(ArithmeticError):
    """A semi-arc does not exist: the point never rises or never sets (|tan(phi) tan(delta)| > 1)."""


class DegenerateError(ArithmeticError):
    """Two great circles coincide, or an intersection lies on the line that decides its side."""


# ---------------------------------------------------------------------------
# Small numerical helpers
# ---------------------------------------------------------------------------

def anp(a: float) -> float:
    """Angle normalised to [0, 2pi)."""
    a = math.fmod(a, TAU)
    if a < 0.0:
        a += TAU
    if a >= TAU:
        a -= TAU
    return a


def anpm(a: float) -> float:
    """Angle normalised to [-pi, pi)."""
    a = anp(a)
    return a - TAU if a >= math.pi else a


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(a):
    return math.sqrt(dot(a, a))


def neg(a):
    return (-a[0], -a[1], -a[2])


def lin(p, a, q, b):
    """p*a + q*b for vectors a, b."""
    return (p * a[0] + q * b[0], p * a[1] + q * b[1], p * a[2] + q * b[2])


def radec_vec(ra, dec):
    return (math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec))


def deg_out(a_rad: float) -> float:
    """Longitude for the vector file: degrees in [0, 360), rounded to 1e-10 degree."""
    d = round(anp(a_rad) / DEG, 10)
    if d >= 360.0:
        d = 0.0
    return d + 0.0  # never -0.0


def sha256_file(rel: str) -> str:
    with open(os.path.join(ROOT, rel), 'rb') as f:
        return hashlib.sha256(f.read()).hexdigest()


def cal2jd(y: int, m: int, d: int) -> float:
    a, b = erfa.cal2jd(y, m, d)
    return float(a) + float(b)


def bisect(fn, lo: float, hi: float) -> float:
    """Root of fn on (lo, hi) given fn < 0 just above lo and fn > 0 just below hi.

    The end signs are known analytically for every equation solved here, so
    the ends themselves are never evaluated. Runs until lo and hi are
    adjacent doubles."""
    for _ in range(400):
        mid = 0.5 * (lo + hi)
        if mid <= lo or mid >= hi:
            break
        if fn(mid) < 0.0:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)


def count_sign_changes(fn, lo: float, hi: float, n: int = 2000) -> int:
    """Sign changes of fn on a uniform interior grid, counting the known
    signs at the ends (negative at lo, positive at hi). One means the root
    found by bisect is the only one at this resolution."""
    signs = [-1.0]
    for i in range(n):
        v = fn(lo + (hi - lo) * (i + 0.5) / n)
        signs.append(-1.0 if v < 0.0 else 1.0)
    signs.append(1.0)
    return sum(1 for a, b in zip(signs, signs[1:]) if a != b)


# ---------------------------------------------------------------------------
# Time: TT - UT1
# ---------------------------------------------------------------------------

def delta_t_espenak_meeus(y: float) -> float:
    """Delta T (s) from the Espenak & Meeus polynomials, F. Espenak and J. Meeus,
    Five Millennium Canon of Solar Eclipses: -1999 to +3000, NASA/TP-2006-214141
    (2006), section 2.6; also eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html.
    Only the segments 1800..2200 that this suite needs are transcribed. The
    polynomials already assume a lunar secular acceleration of
    -25.858"/cy^2, so no correction term is applied. y is a decimal year."""
    if y < 1800.0 or y > 2201.0:
        raise ValueError('decimal year outside 1800..2201: %r' % y)
    if y < 1860.0:
        t = y - 1800.0
        return (13.72 - 0.332447 * t + 0.0068612 * t ** 2 + 0.0041116 * t ** 3
                - 0.00037436 * t ** 4 + 0.0000121272 * t ** 5
                - 0.0000001699 * t ** 6 + 0.000000000875 * t ** 7)
    if y < 1900.0:
        t = y - 1860.0
        return (7.62 + 0.5737 * t - 0.251754 * t ** 2 + 0.01680668 * t ** 3
                - 0.0004473624 * t ** 4 + t ** 5 / 233174.0)
    if y < 1920.0:
        t = y - 1900.0
        return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4
    if y < 1941.0:
        t = y - 1920.0
        return 21.20 + 0.84493 * t - 0.076100 * t ** 2 + 0.0020936 * t ** 3
    if y < 1961.0:
        t = y - 1950.0
        return 29.07 + 0.407 * t - t ** 2 / 233.0 + t ** 3 / 2547.0
    if y < 1986.0:
        t = y - 1975.0
        return 45.45 + 1.067 * t - t ** 2 / 260.0 - t ** 3 / 718.0
    if y < 2005.0:
        t = y - 2000.0
        return (63.86 + 0.3345 * t - 0.060374 * t ** 2 + 0.0017275 * t ** 3
                + 0.000651814 * t ** 4 + 0.00002373599 * t ** 5)
    if y < 2050.0:
        t = y - 2000.0
        return 62.92 + 0.32217 * t + 0.005589 * t ** 2
    if y < 2150.0:
        return -20.0 + 32.0 * ((y - 1820.0) / 100.0) ** 2 - 0.5628 * (2150.0 - y)
    u = (y - 1820.0) / 100.0
    return -20.0 + 32.0 * u * u


EM_BOUNDARIES = (1860.0, 1900.0, 1920.0, 1941.0, 1961.0, 1986.0, 2005.0, 2050.0, 2150.0)


def decimal_year(jd_ut1: float) -> float:
    """Decimal Gregorian year used as the polynomials' argument (documented rule):
    y = 2000 + (JD - 2451544.5) / 365.2425, i.e. years of 365.2425 days from
    2000-01-01T00:00. It stays within a day of the calendar year fraction over
    1800..2200, far inside the polynomials' own uncertainty."""
    return 2000.0 + (jd_ut1 - 2451544.5) / 365.2425


class TimeScale:
    """Delta T = TT - UT1 (seconds) for a UT1 Julian date.

    Observed IERS range, UT1 MJD 41684 (1973-01-02) to the last row flagged
    'I' (MJD 61300, 2026-09-17), per daily row:
        Delta T = 32.184 s + (TAI - UTC) - (UT1 - UTC)
    with UT1 - UTC from sources/l2/iers-finals2000A-ut1.csv and TAI - UTC from
    sources/l2/Leap_Second.dat (IERS Bulletin C; every row is also checked
    against erfa.dat). Delta T has no leap-second steps, so it is
    interpolated linearly in time between consecutive rows. Rows flagged 'P'
    (IERS predictions) are not used.

    Everywhere else (1800..1973-01-02 and after 2026-09-17): the Espenak &
    Meeus (2006) polynomials of decimal_year(JD).
    """

    def __init__(self):
        self.leaps = self._read_leaps(os.path.join(ROOT, LEAP_DAT))
        self.dt = {}
        self.dut1 = {}
        with open(os.path.join(ROOT, IERS_CSV), newline='', encoding='ascii') as f:
            for row in csv.DictReader(f):
                if row['flag'] != 'I':
                    continue
                mjd = int(row['mjd'])
                dut1 = float(row['ut1_minus_utc_s'])
                tai_utc = self.tai_utc(mjd)
                y, mo, d = (int(v) for v in row['date'].split('-'))
                with warnings.catch_warnings():
                    warnings.simplefilter('ignore')  # ERFA flags dates past its table's horizon as 'dubious'
                    erfa_dat = float(erfa.dat(y, mo, d, 0.0))
                if erfa_dat != tai_utc:
                    raise RuntimeError('TAI-UTC disagrees with erfa.dat on %s' % row['date'])
                self.dut1[mjd] = dut1
                self.dt[mjd] = 32.184 + tai_utc - dut1
        self.first = min(self.dt)
        self.last = max(self.dt)
        if sorted(self.dt) != list(range(self.first, self.last + 1)):
            raise RuntimeError('observed IERS rows are not contiguous')

    @staticmethod
    def _read_leaps(path):
        leaps = []
        with open(path, encoding='ascii') as f:
            for line in f:
                s = line.strip()
                if not s or s.startswith('#'):
                    continue
                mjd, _d, _m, _y, tai_utc = s.split()
                leaps.append((int(float(mjd)), int(tai_utc)))
        return leaps

    def tai_utc(self, mjd: int) -> int:
        value = None
        for start, v in self.leaps:
            if mjd >= start:
                value = v
        if value is None:
            raise ValueError('no TAI-UTC before MJD %d' % mjd)
        return value

    def __call__(self, jd_ut1: float):
        mjd = jd_ut1 - DJM0
        if self.first <= mjd <= self.last:
            i = int(math.floor(mjd))
            if i == self.last:
                return self.dt[i], 'IERS'
            f = mjd - i
            return self.dt[i] + f * (self.dt[i + 1] - self.dt[i]), 'IERS'
        return delta_t_espenak_meeus(decimal_year(jd_ut1)), 'Espenak-Meeus'


def earth_angles(jd_ut1: float, jd_tt: float):
    """(GAST, true obliquity) in radians from ERFA, IAU 2006/2000A.

    The dates are split as (2400000.5, JD - 2400000.5): for JDs in this
    suite's range that subtraction is exact (Sterbenz), so nothing of the
    recorded doubles is lost."""
    ut = jd_ut1 - DJM0
    tt = jd_tt - DJM0
    gast = float(erfa.gst06a(DJM0, ut, DJM0, tt))
    eps_mean = float(erfa.obl06(DJM0, tt))
    _dpsi, deps = erfa.nut06a(DJM0, tt)
    return gast, eps_mean + float(deps)


# ---------------------------------------------------------------------------
# The sphere
# ---------------------------------------------------------------------------

class Sky:
    """RAMC theta, true obliquity eps and latitude phi (radians), with the
    reference points as unit vectors in the true equator-and-equinox-of-date
    frame (x to the true equinox, z to the celestial north pole):

      K  north ecliptic pole          (RA 270 deg, dec 90 deg - eps)
      Z  zenith                       (RA theta, dec phi)
      E  east point of the horizon    (RA theta + 90 deg, dec 0)
      N  north point of the horizon   = Z x E (dec 90 deg - |phi|)
      M  equator point on the upper meridian (RA theta, dec 0)

    RAMC is local apparent sidereal time: GAST + east longitude (polar
    motion and the deflection of the vertical are not part of the
    astrological definition and are not applied)."""

    def __init__(self, theta: float, eps: float, phi: float):
        self.theta, self.eps, self.phi = theta, eps, phi
        self.ce, self.se = math.cos(eps), math.sin(eps)
        ct, st = math.cos(theta), math.sin(theta)
        cp, sp = math.cos(phi), math.sin(phi)
        self.K = (0.0, -self.se, self.ce)
        self.Z = (cp * ct, cp * st, sp)
        self.E = (-st, ct, 0.0)
        self.N = (-sp * ct, -sp * st, cp)
        self.M = (ct, st, 0.0)

    # --- conversions along the ecliptic -----------------------------------
    def lon_of(self, X) -> float:
        """Ecliptic longitude of the direction X (need not be a unit vector)."""
        return anp(math.atan2(X[1] * self.ce + X[2] * self.se, X[0]))

    def ra_to_lon(self, alpha: float) -> float:
        """The ecliptic point whose right ascension is alpha (projection along the
        hour circle): tan(lambda) = tan(alpha) / cos(eps), same quadrant."""
        return anp(math.atan2(math.sin(alpha), math.cos(alpha) * self.ce))

    def equator_to_lon(self, alpha: float) -> float:
        """Ecliptic longitude of the equator point (alpha, 0) (projection along the
        circle of longitude through the ecliptic poles)."""
        return anp(math.atan2(math.sin(alpha) * self.ce, math.cos(alpha)))

    def decl(self, lam: float) -> float:
        return math.asin(self.se * math.sin(lam))

    def ra(self, lam: float) -> float:
        return anp(math.atan2(math.sin(lam) * self.ce, math.cos(lam)))

    # --- great circles --------------------------------------------------------
    def meet(self, pole, side):
        """Intersection of the ecliptic with the great circle whose pole is
        `pole`: the two intersections are +-(K x pole); the one returned is on
        the side of `side` (positive dot product). Returns (longitude, margin),
        margin = |cos| of the angle between the intersection and `side`."""
        X = cross(self.K, pole)
        nx = norm(X)
        if nx < 1e-12:
            raise DegenerateError('great circle coincides with the ecliptic')
        s = dot(X, side) / (nx * norm(side))
        if s < 0.0:
            X, s = neg(X), -s
        if s < 1e-9:
            raise DegenerateError('intersection lies on the deciding line')
        return self.lon_of(X), s


def asc_formula(R: float, p: float, eps: float) -> float:
    """Classical closed form (Smart; Holden): the ecliptic point rising on the
    horizon whose zenith has right ascension R and declination p,
        lambda = atan2(cos R, -(sin R cos eps + tan p sin eps)).
    It returns the eastern intersection only while cos p cos eps + sin p sin eps
    sin R > 0 (always true for |p| < 90 deg - eps); callers that go beyond that
    say so."""
    return anp(math.atan2(math.cos(R), -(math.sin(R) * math.cos(eps) + math.tan(p) * math.sin(eps))))


def asc_from_oa(oa: float, p: float, eps: float) -> float:
    """The same formula written with the oblique ascension OA = R + 90 deg:
    lambda = atan2(sin OA, cos OA cos eps - tan p sin eps)."""
    return anp(math.atan2(math.sin(oa), math.cos(oa) * math.cos(eps) - math.tan(p) * math.sin(eps)))


# ---------------------------------------------------------------------------
# Angles (primary route: great-circle intersections)
# ---------------------------------------------------------------------------

def ascendant(s: Sky):
    """Ascendant: the ecliptic's intersection with the horizon (pole Z) on the
    eastern side (positive component along E, i.e. hour angle in (-180, 0):
    rising). Well defined for |phi| < 90 deg - eps."""
    return s.meet(s.Z, s.E)


def midheaven(s: Sky):
    """MC: the ecliptic's intersection with the meridian (pole E) on the upper
    branch, hour angle 0 (positive component along M), i.e. right ascension =
    RAMC."""
    return s.meet(s.E, s.M)


def vertex(s: Sky):
    """Vertex (Johndro; Jayne): the ecliptic's intersection with the prime
    vertical (the great circle through E, Z and W; pole N) on the WESTERN side
    (negative component along E), in both hemispheres."""
    return s.meet(s.N, neg(s.E))


def east_point(s: Sky):
    """East point (equatorial ascendant): the ecliptic point whose right
    ascension is RAMC + 90 deg, i.e. the ecliptic's intersection with the hour
    circle through E (that circle's pole is M), on E's side."""
    return s.meet(s.M, s.E)


# ---------------------------------------------------------------------------
# House systems (primary routes). Index m = k - 1 for cusps k = 11, 12, 1, 2, 3
# (m = -2, -1, 0, 1, 2); cusps 4..9 are the opposites of 10..3.
# ---------------------------------------------------------------------------

QUADRANT_M = (-2, -1, 1, 2)          # cusps 11, 12, 2, 3
M_TO_INDEX = {-2: 10, -1: 11, 1: 1, 2: 2}  # 0-based list index of cusp 11, 12, 2, 3


def from_quadrants(mc, c11, c12, asc, c2, c3):
    c = [0.0] * 12
    c[9], c[10], c[11], c[0], c[1], c[2] = mc, c11, c12, asc, c2, c3
    for k in (9, 10, 11, 0, 1, 2):
        c[(k + 6) % 12] = anp(c[k] + math.pi)
    return c


def h_equal(s, asc, mc):
    """Equal (Holden: 'equal house from the ascendant'): cusp 1 = Asc, cusp k =
    Asc + 30 deg * (k - 1)."""
    return [anp(asc + k * math.pi / 6.0) for k in range(12)]


def h_whole_sign(s, asc, mc):
    """Whole sign: cusp 1 = 0 deg of the sign holding the Asc, then +30 deg."""
    sign = math.floor((anp(asc) / DEG) / 30.0)
    return [anp((sign + k) * math.pi / 6.0) for k in range(12)]


def h_vehlow(s, asc, mc):
    """Vehlow (Johannes Vehlow's equal houses): the Asc in the middle of house 1,
    cusp 1 = Asc - 15 deg, then +30 deg."""
    return [anp(asc - math.pi / 12.0 + k * math.pi / 6.0) for k in range(12)]


def h_equal_mc(s, asc, mc):
    """Equal from the MC: cusp 10 = MC, cusp k = MC + 30 deg * (k - 10)."""
    return [anp(mc + (k - 9) * math.pi / 6.0) for k in range(12)]


def h_porphyry(s, asc, mc):
    """Porphyry (Holden): each quadrant of the ecliptic between the angles is
    trisected in longitude. q1 = arc MC->Asc in (0, 180 deg); cusp 11 = MC + q1/3,
    cusp 12 = MC + 2 q1/3; q2 = 180 deg - q1 = arc Asc->IC; cusp 2 = Asc + q2/3,
    cusp 3 = Asc + 2 q2/3."""
    q1 = anp(asc - mc)
    q2 = math.pi - q1
    return from_quadrants(mc, anp(mc + q1 / 3.0), anp(mc + 2.0 * q1 / 3.0),
                          asc, anp(asc + q2 / 3.0), anp(asc + 2.0 * q2 / 3.0))


def h_alcabitius(s, asc, mc):
    """Alcabitius (Holden; the 'standard' medieval system): the diurnal semi-arc
    of the ascendant degree is trisected in right ascension and the division
    points are carried to the ecliptic along hour circles. DSA = RA(Asc) - RAMC
    (the Asc rises now, so its hour angle is -DSA), NSA = 180 deg - DSA:
    cusp 11: RA = RAMC + DSA/3; 12: RAMC + 2 DSA/3; 2: RA(Asc) + NSA/3;
    3: RA(Asc) + 2 NSA/3."""
    a_asc = s.ra(asc)
    dsa = anp(a_asc - s.theta)
    nsa = math.pi - dsa
    return from_quadrants(mc, s.ra_to_lon(s.theta + dsa / 3.0), s.ra_to_lon(s.theta + 2.0 * dsa / 3.0),
                          asc, s.ra_to_lon(a_asc + nsa / 3.0), s.ra_to_lon(a_asc + 2.0 * nsa / 3.0))


def h_regiomontanus(s, asc, mc):
    """Regiomontanus (Holden; Munkasey): the celestial equator is divided into
    30 deg arcs from the meridian; house circle k is the great circle through
    the north and south points of the horizon and the equator point
    Q_k = (RAMC + 90 deg + 30 deg * (k - 1), 0). Cusp k is where that circle
    meets the ecliptic on the half-circle N -> Q_k -> S (the side of Q_k's
    component perpendicular to N)."""
    out = {}
    for m in QUADRANT_M:
        Q = radec_vec(s.theta + HALF_PI + m * math.pi / 6.0, 0.0)
        side = lin(1.0, Q, -dot(Q, s.N), s.N)
        out[m] = s.meet(cross(s.N, Q), side)[0]
    return from_quadrants(mc, out[-2], out[-1], asc, out[1], out[2])


def h_campanus(s, asc, mc):
    """Campanus (Holden; Munkasey): the prime vertical is divided into 30 deg
    arcs from the east point; house circle k is the great circle through the
    north and south points of the horizon and the prime-vertical point
    P_k = cos(a) E + sin(a) Z, a = 30 deg * (1 - k) (cusp 12: 30 deg above the
    east point, cusp 11: 60 deg, cusp 10: the zenith; cusps 2, 3: 30 and 60 deg
    below it). Cusp k is where that circle meets the ecliptic on P_k's side."""
    out = {}
    for m in QUADRANT_M:
        a = -m * math.pi / 6.0
        P = lin(math.cos(a), s.E, math.sin(a), s.Z)
        out[m] = s.meet(cross(s.N, P), P)[0]
    return from_quadrants(mc, out[-2], out[-1], asc, out[1], out[2])


def h_meridian(s, asc, mc):
    """Meridian (axial rotation; Holden): the equator is divided into 30 deg arcs
    from the meridian and projected to the ecliptic along hour circles: cusp k
    is the ecliptic point with right ascension RAMC + 90 deg + 30 deg * (k - 1)
    (so cusp 10 = MC and cusp 1 = the east point)."""
    return [s.ra_to_lon(s.theta + HALF_PI + k * math.pi / 6.0) for k in range(12)]


def h_morinus(s, asc, mc):
    """Morinus (Holden): the equator is divided into 30 deg arcs from the
    meridian and projected to the ecliptic along great circles through the
    ecliptic poles: cusp k is the ecliptic longitude of the equator point
    (RAMC + 90 deg + 30 deg * (k - 1), 0). (Cusp 10 is not the MC.)"""
    return [s.equator_to_lon(s.theta + HALF_PI + k * math.pi / 6.0) for k in range(12)]


def topocentric_pole(phi: float, m: int) -> float:
    """Polich & Page: tan(pole of the house circle) = (n / 3) tan(phi), n = 3 - |m|
    (n = 1 for cusps 11 and 3, 2 for 12 and 2, 3 for the Asc)."""
    return math.atan((1.0 - abs(m) / 3.0) * math.tan(phi))


def h_topocentric(s, asc, mc):
    """Topocentric (W. Polich and A. P. Nelson Page): cusp k is the degree rising
    on the oblique horizon of pole p_m, tan p_m = (1 - |m|/3) tan(phi), at the
    sidereal time RAMC + 30 deg * m, m = k - 1 (so the horizon's east point is
    the equator point RAMC + 90 deg + 30 deg * m, as in Regiomontanus). Route:
    the horizon of a fictitious observer at latitude p_m under RAMC + 30 m."""
    out = {}
    for m in QUADRANT_M:
        out[m] = ascendant(Sky(s.theta + m * math.pi / 6.0, s.eps, topocentric_pole(s.phi, m)))[0]
    return from_quadrants(mc, out[-2], out[-1], asc, out[1], out[2])


def koch_semi_arc(s: Sky, mc: float) -> float:
    """Diurnal semi-arc of the MC degree: the hour angle H0 at which it rises,
    cos H0 = -tan(phi) tan(delta_MC)."""
    x = -math.tan(s.phi) * math.tan(s.decl(mc))
    if abs(x) > 1.0:
        raise CircumpolarError('the MC degree does not rise and set')
    return math.acos(x)


def h_koch(s, asc, mc):
    """Koch (birthplace / GOH system; Holden; Munkasey): the diurnal semi-arc of
    the MC degree is trisected in time. The MC degree rose when the RAMC was
    RAMC - DSA_MC; cusp 11 is the degree that was rising at RAMC - 2 DSA_MC/3,
    cusp 12 at RAMC - DSA_MC/3 (cusp 1 at RAMC, cusp 10 at RAMC - DSA_MC). On
    the other side cusps 2 and 3 are the degrees rising at RAMC + DSA_MC/3 and
    RAMC + 2 DSA_MC/3 (the opposites of the degrees setting at those times,
    which trisect the MC degree's semi-arc from culmination to setting).
    In general cusp k = Asc(RAMC + m DSA_MC/3, phi), m = k - 1."""
    dsa = koch_semi_arc(s, mc)
    out = {}
    for m in QUADRANT_M:
        out[m] = ascendant(Sky(s.theta + m * dsa / 3.0, s.eps, s.phi))[0]
    return from_quadrants(mc, out[-2], out[-1], asc, out[1], out[2])


def placidus_equation(s: Sky, m: int, lam: float, upper: bool) -> float:
    """Placidus condition as a function of longitude (radians):

        RA(lambda) - RAMC  -  [90 deg + 30 deg*m + (1 - |m|/3) AD(delta(lambda))]

    AD = asin(tan phi tan delta) is the ascensional difference, DSA = 90 + AD,
    NSA = 90 - AD. For m = -2, -1 (cusps 11, 12) this is RA - RAMC = DSA/3,
    2 DSA/3: the point has 1/3, 2/3 of its diurnal semi-arc still to go to
    culmination. For m = 1, 2 (cusps 2, 3) it is RA - RAMC = 180 - 2 NSA/3,
    180 - NSA/3: the point is 2/3, 1/3 of its nocturnal semi-arc past lower
    culmination. `upper` picks the branch of RA - RAMC: (-180, 180] for the
    MC->Asc quadrant, [0, 360) for Asc->IC."""
    x = math.tan(s.phi) * math.tan(s.decl(lam))
    if abs(x) > 1.0:
        raise CircumpolarError('circumpolar ecliptic point')
    d = s.ra(lam) - s.theta
    d = anpm(d) if upper else anp(d)
    return d - (HALF_PI + m * math.pi / 6.0 + (1.0 - abs(m) / 3.0) * math.asin(x))


def placidus_cusp(s: Sky, asc: float, mc: float, m: int, verify: bool = False):
    """Placidus (Holden; Munkasey: 'semi-arc' system of Placidus de Titis): cusp
    k is the ecliptic point that has completed the fraction of its own
    semi-arc named in placidus_equation. Solved by bisection in longitude over
    the quadrant (MC->Asc for 11, 12; Asc->IC for 2, 3). The end signs follow
    from the definition, with f = 1 - |m|/3:
      MC end (m < 0):  RA - RAMC = 0, so h = -(90 + 30m + f AD_MC) = -f DSA_MC < 0;
      Asc end (m < 0): RA - RAMC = DSA_Asc, so h = (|m|/3) DSA_Asc > 0;
      Asc end (m > 0): h = -(m/3) NSA_Asc < 0;
      IC end (m > 0):  RA - RAMC = 180, so h = f NSA_IC > 0
    (all semi-arcs positive while |phi| < 90 - eps). Returns (longitude, number
    of sign changes seen on a 2000-point grid when verify is set)."""
    if m < 0:
        start, arc, upper = mc, anp(asc - mc), True
    else:
        start, arc, upper = asc, anp(mc + math.pi - asc), False

    def fn(t):
        return placidus_equation(s, m, start + t * arc, upper)

    t = bisect(fn, 0.0, 1.0)
    changes = count_sign_changes(fn, 0.0, 1.0) if verify else None
    return anp(start + t * arc), changes


def h_placidus(s, asc, mc):
    out = {m: placidus_cusp(s, asc, mc, m)[0] for m in QUADRANT_M}
    return from_quadrants(mc, out[-2], out[-1], asc, out[1], out[2])


HOUSES = {
    'placidus': h_placidus, 'koch': h_koch, 'regiomontanus': h_regiomontanus,
    'campanus': h_campanus, 'porphyry': h_porphyry, 'alcabitius': h_alcabitius,
    'equal': h_equal, 'whole-sign': h_whole_sign, 'morinus': h_morinus,
    'meridian': h_meridian, 'topocentric': h_topocentric, 'vehlow': h_vehlow,
    'equal-mc': h_equal_mc,
}


def house_cusps(system: str, s: Sky):
    asc = ascendant(s)[0]
    mc = midheaven(s)[0]
    return HOUSES[system](s, asc, mc)


# ---------------------------------------------------------------------------
# Whether the cusps exist: the construction test (decides the status vectors)
# ---------------------------------------------------------------------------
#
# Definition. A house system's cusps exist where its defining construction has
# a solution for every cusp and the twelve cusps that result are in zodiacal
# order: going 1 -> 2 -> ... -> 12 -> 1 they advance through exactly one turn
# of longitude, every step forward. With cusps 4-9 opposite 10-3 that is
#     0 < d11 < d12 < d1 < d2 < d3 < 180 deg,  d_k = cusp k - cusp 10 (forward).
# Only Placidus and Koch can fail it where these vectors lie; for every other
# system of this file the construction is a great-circle intersection or an
# arithmetic step that always has a solution, and the order is checked on
# every valued vector (check_houses).
#
# Placidus. Construction of Placidus de Titis, Tabulae primi mobilis (Milan,
# 1657; English translation by J. Cooper, Primum Mobile, 1814), restated in
# R. W. Holden, The Elements of House Division (L. N. Fowler, Romford, 1977):
# cusp 10 is the degree on the upper meridian and cusp 1 the degree rising;
# cusps 11 and 12 are the degrees that still have 1/3 and 2/3 of their own
# diurnal semi-arc to go to culmination, and cusps 3 and 2 the degrees that
# have completed 1/3 and 2/3 of their own nocturnal semi-arc since lower
# culmination. The construction divides a degree's semi-arc, so only degrees
# that rise and set can satisfy it; placidus_roots searches ALL of those
# degrees, not only one quadrant.
#
# Koch. Construction of W. A. Koch and E. Schaeck, Hausertabellen des
# Geburtsortes (Goppingen, 1962), restated in Holden (1977): the diurnal
# semi-arc of the MC degree is trisected in time and cusp k is the degree
# rising at RAMC + (k - 1) DSA_MC/3 (k = 11, 12, 2, 3 as -2, -1, 1, 2). It
# needs the MC degree to rise and set; the degree rising at any sidereal time
# is the eastern intersection of horizon and ecliptic, which always exists.

CUSP_OF_M = {-2: 11, -1: 12, 1: 2, 2: 3}


def rising_setting_half_width(s: Sky):
    """Degrees that rise and set satisfy |tan phi tan delta| <= 1, i.e.
    |sin lambda| <= cos(phi)/sin(eps). Returns None when that is every degree
    (|phi| < 90 deg - eps), else the half-width of the two arcs, centred on the
    equinoxes, that it leaves."""
    c = math.cos(s.phi) / s.se
    return None if c >= 1.0 else math.asin(c)


def lon_of_ad(s: Sky, ad: float, branch: int) -> float:
    """At |phi| > 90 - eps: the degree with ascensional difference ad on the arc
    around 0 deg (branch 0) or 180 deg (branch 1). tan(delta) = sin(ad)/tan(phi)
    and sin(lambda) = sin(delta)/sin(eps) are monotonic on each arc, so ad runs
    once over [-90, 90] deg along it (the arc's ends are its two degrees whose
    semi-arcs are 0 and 180 deg)."""
    d = math.atan(math.sin(ad) / math.tan(s.phi))
    la = math.asin(max(-1.0, min(1.0, math.sin(d) / s.se)))
    return anp(la if branch == 0 else math.pi - la)


def placidus_residual(s: Sky, m: int, lam: float, ad: float) -> float:
    """The Placidus condition for cusp m at degree lam (ascensional difference ad),
    as an angle wrapped to [-180, 180) deg: RA - RAMC - (90 + 30m + (1 - |m|/3) ad)."""
    return anpm(s.ra(lam) - s.theta - (HALF_PI + m * math.pi / 6.0 + (1.0 - abs(m) / 3.0) * ad))


def _root_between(fn, x_neg: float, x_pos: float) -> float:
    for _ in range(400):
        mid = 0.5 * (x_neg + x_pos)
        if mid == x_neg or mid == x_pos:
            break
        if fn(mid) < 0.0:
            x_neg = mid
        else:
            x_pos = mid
    return 0.5 * (x_neg + x_pos)


def _golden_min(fn, a: float, b: float) -> float:
    g = (math.sqrt(5.0) - 1.0) / 2.0
    c, d = b - g * (b - a), a + g * (b - a)
    fc, fd = fn(c), fn(d)
    for _ in range(200):
        if abs(b - a) < 1e-15:
            break
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - g * (b - a)
            fc = fn(c)
        else:
            a, c, fc = c, d, fd
            d = a + g * (b - a)
            fd = fn(d)
    return min(fc, fd)


def scan_roots(fn, a: float, b: float, n: int):
    """Zeros of fn on [a, b], where fn is an angle residual that is continuous
    except for 360-deg wraps: sign changes between neighbouring grid points with
    both values within 90 deg of zero, refined by bisection to adjacent doubles
    and verified. Also returns the closest approach min |fn|, with every local
    minimum of |fn| on the grid refined by golden-section search."""
    xs = [a + (b - a) * i / n for i in range(n + 1)]
    vs = [fn(x) for x in xs]
    roots = []
    for i in range(n):
        v0, v1 = vs[i], vs[i + 1]
        if abs(v0) >= HALF_PI or abs(v1) >= HALF_PI:
            continue  # a wrap of the angle, not a zero
        if v0 == 0.0:
            roots.append(xs[i])
        elif (v0 < 0.0) != (v1 < 0.0) and v1 != 0.0:
            r = _root_between(fn, xs[i], xs[i + 1]) if v0 < 0.0 else _root_between(fn, xs[i + 1], xs[i])
            if abs(fn(r)) > 1e-9:
                raise AssertionError('scan_roots: bisection did not converge to a zero')
            roots.append(r)
    if vs[n] == 0.0:
        roots.append(xs[n])
    closest = min(abs(v) for v in vs)
    for i in range(1, n):
        if abs(vs[i]) <= abs(vs[i - 1]) and abs(vs[i]) <= abs(vs[i + 1]):
            closest = min(closest, _golden_min(lambda x: abs(fn(x)), xs[i - 1], xs[i + 1]))
    return roots, closest


def placidus_roots(s: Sky, m: int):
    """Every degree of the ecliptic that rises and sets and satisfies the
    Placidus condition for cusp m (radians), and the condition's closest
    approach to zero over all those degrees (radians of hour angle)."""
    hw = rising_setting_half_width(s)
    pieces = []
    if hw is None:
        def f(lam):
            return placidus_residual(s, m, lam, math.asin(math.tan(s.phi) * math.tan(s.decl(lam))))
        pieces.append((f, 0.0, TAU, 36000, anp))
    else:
        for branch in (0, 1):
            def f(ad, branch=branch):
                return placidus_residual(s, m, lon_of_ad(s, ad, branch), ad)
            pieces.append((f, -HALF_PI, HALF_PI, 4000, (lambda ad, branch=branch: lon_of_ad(s, ad, branch))))
    found, closest = [], math.inf
    for f, a, b, n, to_lon in pieces:
        r, c = scan_roots(f, a, b, n)
        found += [to_lon(x) for x in r]
        closest = min(closest, c)
    roots = []
    for x in sorted(found):
        if not roots or abs(anpm(x - roots[-1])) > 1e-9:
            roots.append(x)
    if len(roots) > 1 and abs(anpm(roots[0] - roots[-1])) <= 1e-9:
        roots.pop()
    return roots, closest


def zodiacal_positions(c10, c11, c12, c1, c2, c3):
    """Forward distance (radians) of cusps 11, 12, 1, 2 and 3 from cusp 10."""
    return {11: anp(c11 - c10), 12: anp(c12 - c10), 1: anp(c1 - c10), 2: anp(c2 - c10), 3: anp(c3 - c10)}


def in_zodiacal_order(d) -> bool:
    seq = [0.0, d[11], d[12], d[1], d[2], d[3], math.pi]
    return all(b > a for a, b in zip(seq, seq[1:]))


def order_violations(d) -> list:
    """What breaks the order of a set that is not in zodiacal order: a list of
    (words, size in degrees)."""
    out = []
    running = None
    for k in (11, 12, 1, 2, 3):
        x = d[k] / DEG
        if x <= 0.0 or x >= 180.0:
            if x > 270.0 or x <= 0.0:
                size = (360.0 - x) % 360.0
                out.append(('cusp %d falls %.2f° before the MC' % (k, size), size))
            else:
                size = x - 180.0
                out.append(('cusp %d falls %.2f° past the IC' % (k, size), size))
        elif running is not None and d[k] <= d[running]:
            size = (d[running] - d[k]) / DEG
            out.append(('cusp %d falls %.2f° before cusp %d' % (k, size, running), size))
        else:
            running = k
    return out


def construction(system: str, s: Sky) -> dict:
    """The construction test for Placidus or Koch at one sidereal time."""
    asc, mc = ascendant(s)[0], midheaven(s)[0]
    if system == 'koch':
        x = math.tan(s.phi) * math.tan(s.decl(mc))
        if abs(x) > 1.0:
            return {'exists': False, 'mode': 'no-semi-arc', 'tan_product': x}
        dsa = math.acos(-x)
        c = {m: ascendant(Sky(s.theta + m * dsa / 3.0, s.eps, s.phi))[0] for m in QUADRANT_M}
        d = zodiacal_positions(mc, c[-2], c[-1], asc, c[1], c[2])
        if in_zodiacal_order(d):
            return {'exists': True, 'unique': True, 'cusps': from_quadrants(mc, c[-2], c[-1], asc, c[1], c[2])}
        return {'exists': False, 'mode': 'out-of-order', 'violations': order_violations(d), 'dsa_mc': dsa,
                'koch_cusps': c}
    if system != 'placidus':
        raise ValueError(system)
    roots, closest = {}, {}
    for m in QUADRANT_M:
        roots[CUSP_OF_M[m]], closest[CUSP_OF_M[m]] = placidus_roots(s, m)
    missing = [k for k in (11, 12, 2, 3) if not roots[k]]
    if missing:
        return {'exists': False, 'mode': 'no-solution', 'cusps': missing, 'roots': roots,
                'closest_deg': {k: closest[k] / DEG for k in missing}}
    ordered = []
    for c11, c12, c2, c3 in itertools.product(roots[11], roots[12], roots[2], roots[3]):
        if in_zodiacal_order(zodiacal_positions(mc, c11, c12, asc, c2, c3)):
            ordered.append(from_quadrants(mc, c11, c12, asc, c2, c3))
    if ordered:
        return {'exists': True, 'unique': len(ordered) == 1, 'cusps': ordered[0], 'roots': roots,
                'counts': {k: len(roots[k]) for k in roots}}
    if all(len(roots[k]) == 1 for k in roots):
        d = zodiacal_positions(mc, roots[11][0], roots[12][0], asc, roots[2][0], roots[3][0])
        return {'exists': False, 'mode': 'out-of-order', 'violations': order_violations(d), 'roots': roots}
    return {'exists': False, 'mode': 'no-ordered-choice', 'counts': {k: len(roots[k]) for k in roots},
            'roots': roots}


def construction_fails_robustly(system: str, s: Sky) -> bool:
    """Guard for a status vector: the construction fails at the case's RAMC and
    also 0.1 deg (24 s of sidereal time) either side of it."""
    for dth in (0.0, POL_GUARD_DRAMC_DEG * DEG, -POL_GUARD_DRAMC_DEG * DEG):
        if construction(system, Sky(s.theta + dth, s.eps, s.phi))['exists']:
            return False
    return True


def minus(text: str) -> str:
    """Typographic minus sign for numbers in prose."""
    return text.replace('-', '\u2212')


def failure_text(system: str, r: dict) -> str:
    """One sentence (no final stop) saying how a construction fails."""
    name = system.capitalize()
    if r['mode'] == 'no-solution':
        ks = r['cusps']
        which = ('cusp %d' % ks[0]) if len(ks) == 1 else ('cusps ' + ', '.join(str(k) for k in ks[:-1])
                                                          + ' and %d' % ks[-1])
        misses = ', '.join('%.2f°' % r['closest_deg'][k] for k in ks)
        return ('%s %s no solution, since no degree that rises and sets meets the %s condition for %s (closest '
                'miss %s of hour angle)' % (which, 'has' if len(ks) == 1 else 'have', name,
                                            'it' if len(ks) == 1 else 'them', misses))
    if r['mode'] == 'no-semi-arc':
        never = 'rises' if r['tan_product'] < -1.0 else 'sets'
        return ('the MC degree never %s (tan φ tan δ_MC = %s), so the diurnal semi-arc that %s trisects does not '
                'exist and cusps 11, 12, 2 and 3 cannot be constructed'
                % (never, minus('%.3f' % r['tan_product']), name))
    if r['mode'] == 'out-of-order':
        return ('every %s cusp can be constructed but the cusps are not in zodiacal order (%s)'
                % (name, '; '.join(words for words, _size in r['violations'])))
    return ('the %s conditions have solutions (%s per cusp 11, 12, 2, 3) but no choice of them is in zodiacal '
            'order' % (name, ', '.join(str(r['counts'][k]) for k in (11, 12, 2, 3))))


# ---------------------------------------------------------------------------
# Second routes and property checks (run on every vector; the build stops if
# any residual exceeds CHECK_LIMIT_ARCSEC)
# ---------------------------------------------------------------------------

def erfa_radec(lam: float, eps: float):
    """(RA, dec) of the ecliptic point lambda through ERFA's own vector routines:
    s2c, a frame rotation about x by -eps (rx), rxp, c2s."""
    r = erfa.rx(-eps, erfa.ir())
    a, d = erfa.c2s(erfa.rxp(r, erfa.s2c(lam, 0.0)))
    return float(erfa.anp(a)), float(d)


def erfa_lon_of_equator_point(alpha: float, eps: float) -> float:
    r = erfa.rx(eps, erfa.ir())
    a, _b = erfa.c2s(erfa.rxp(r, erfa.s2c(alpha, 0.0)))
    return float(erfa.anp(a))


def erfa_horizon(ha: float, dec: float, phi: float):
    """Horizon components (x_E, x_N, x_Z) of a point from ERFA's hd2ae
    (azimuth from north through east)."""
    az, el = erfa.hd2ae(ha, dec, phi)
    az, el = float(az), float(el)
    return (math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el))


class Checks:
    def __init__(self):
        self.max = {}

    def record(self, label: str, residual_rad: float):
        r = abs(residual_rad) / ARCSEC
        if r > CHECK_LIMIT_ARCSEC:
            raise AssertionError('%s: two routes differ by %.3e arcsec' % (label, r))
        if r > self.max.get(label, -1.0):
            self.max[label] = r

    def require(self, label: str, ok: bool):
        if not ok:
            raise AssertionError('%s: property violated' % label)
        self.max.setdefault(label, 0.0)


def check_angles(ck: Checks, s: Sky, asc, mc, vtx, ep):
    """Closed forms and ERFA properties for the four angles. Returns whether
    the co-latitude closed form for the vertex lands on the anti-vertex."""
    ck.record('asc: closed form', anpm(asc - asc_formula(s.theta, s.phi, s.eps)))
    ck.record('mc: closed form', anpm(mc - anp(math.atan2(math.sin(s.theta), math.cos(s.theta) * s.ce))))
    ck.record('east point: closed form', anpm(ep - asc_formula(s.theta, 0.0, s.eps)))
    # Vertex: the usual closed form is the ascendant formula at co-latitude
    # p = 90 - phi under RAMC + 180 (that horizon's zenith is N, its east point is
    # the real west point W). In vector form the formula's point X satisfies
    # X.W = cos p cos eps + sin p sin eps sin(RAMC + 180); the tan-p form divides
    # by cos p = sin phi, which flips the point for phi < 0. So the closed form
    # returns the western intersection iff
    #     sign(phi) * (sin phi cos eps - cos phi sin eps sin RAMC) > 0
    # i.e. always when |phi| > eps, and for |phi| < eps only on part of the
    # sidereal day; otherwise it returns the eastern one (the anti-vertex).
    # (phi = 0 follows the phi > 0 branch: tan(pi/2) evaluates to +1.6e16.)
    v_cf = asc_formula(s.theta + math.pi, HALF_PI - s.phi, s.eps)
    d = anpm(vtx - v_cf)
    cf_is_anti = abs(d) > HALF_PI
    ck.record('vertex: closed form (mod 180 deg)', anpm(d + math.pi) if cf_is_anti else d)
    sgn = 1.0 if s.phi >= 0.0 else -1.0
    predicted_anti = not (sgn * (math.sin(s.phi) * s.ce - math.cos(s.phi) * s.se * math.sin(s.theta)) > 0.0)
    ck.require('vertex: closed-form branch predicted', cf_is_anti == predicted_anti)
    # ERFA properties.
    for label, lam in (('asc', asc), ('mc', mc), ('vertex', vtx), ('east point', ep)):
        a, d_ = erfa_radec(lam, s.eps)
        x = erfa_horizon(s.theta - a, d_, s.phi)
        if label == 'asc':
            ck.record('asc: altitude 0 (ERFA)', math.asin(x[2]))
            ck.require('asc: east of the meridian (ERFA)', x[0] > 0.0)
        elif label == 'mc':
            ck.record('mc: hour angle 0 (ERFA)', anpm(s.theta - a))
        elif label == 'vertex':
            ck.record('vertex: on the prime vertical (ERFA)', math.asin(x[1]))
            ck.require('vertex: west of the meridian (ERFA)', x[0] < 0.0)
        else:
            ck.record('east point: RA = RAMC + 90 (ERFA)', anpm(a - s.theta - HALF_PI))
    return cf_is_anti


def placidus_roots_by_ad(s: Sky, m: int, n: int = 20000):
    """Second route to placidus_roots, in ascensional difference alone. Along the
    ecliptic tan(delta) = tan(eps) sin(RA), so for a degree with RA = RAMC + 90 +
    30m + f AD (f = 1 - |m|/3) the condition sin AD = tan(phi) tan(delta) reads
        F(AD) = sin AD - tan(phi) tan(eps) sin(RAMC + 90 + 30m + f AD) = 0,
    a smooth function on [-90, 90] deg with no wrap; each zero is one solving
    degree (its RA gives it, and its true AD is asin(sin AD) = AD), so these
    zeros must be exactly the degrees placidus_roots finds."""
    c = math.tan(s.phi) * math.tan(s.eps)
    f = 1.0 - abs(m) / 3.0
    base = s.theta + HALF_PI + m * math.pi / 6.0

    def F(ad):
        return math.sin(ad) - c * math.sin(base + f * ad)

    xs = [-HALF_PI + math.pi * i / n for i in range(n + 1)]
    vs = [F(x) for x in xs]
    roots = []
    for i in range(n):
        if vs[i] == 0.0:
            roots.append(xs[i])
        elif (vs[i] < 0.0) != (vs[i + 1] < 0.0) and vs[i + 1] != 0.0:
            roots.append(_root_between(F, xs[i], xs[i + 1]) if vs[i] < 0.0 else _root_between(F, xs[i + 1], xs[i]))
    if vs[n] == 0.0:
        roots.append(xs[n])
    return sorted(s.ra_to_lon(base + f * ad) for ad in roots)


def check_status(ck: Checks, system: str, s: Sky, r: dict):
    """Second routes for a status vector's failure, and ERFA checks of what was built."""
    if system == 'placidus':
        for m in QUADRANT_M:
            k = CUSP_OF_M[m]
            a = sorted(r['roots'][k])
            b = placidus_roots_by_ad(s, m)
            ck.require('status placidus: same solutions by ascensional difference', len(a) == len(b))
            for x, y in zip(a, b):
                ck.record('status placidus: same solutions by ascensional difference', anpm(x - y))
                ra_, d_ = erfa_radec(x, s.eps)
                ad_e = math.asin(math.tan(s.phi) * math.tan(d_))
                ck.record('status placidus: solutions meet the condition (ERFA)',
                          anpm(ra_ - s.theta - (HALF_PI + m * math.pi / 6.0 + (1.0 - abs(m) / 3.0) * ad_e)))
        return
    _a, d_mc = erfa_radec(midheaven(s)[0], s.eps)
    x = math.tan(s.phi) * math.tan(d_mc)
    if r['mode'] == 'no-semi-arc':
        ck.require('status koch: MC degree never rises or sets (ERFA)', abs(x) > 1.0)
        ck.record('status koch: tan phi tan delta_MC (ERFA)', (x - r['tan_product']) * ARCSEC)
        return
    ck.require('status koch: MC degree rises and sets (ERFA)', abs(x) <= 1.0)
    for m in QUADRANT_M:
        lam = r['koch_cusps'][m]
        ra_, d_ = erfa_radec(lam, s.eps)
        h = erfa_horizon(s.theta + m * r['dsa_mc'] / 3.0 - ra_, d_, s.phi)
        ck.record('status koch: cusps rise at RAMC + m DSA/3 (ERFA)', math.asin(h[2]))
        ck.require('status koch: rising side (ERFA)', h[0] > 0.0)


def check_houses(ck: Checks, system: str, s: Sky, c):
    """Second route and ERFA property for one system's twelve cusps c."""
    asc_cf = asc_formula(s.theta, s.phi, s.eps)
    mc_cf = anp(math.atan2(math.sin(s.theta), math.cos(s.theta) * s.ce))
    tag = system + ': '
    for k in range(6):
        ck.record(tag + 'opposite cusps', anpm(c[k + 6] - c[k] - math.pi))
    if system in ('placidus', 'koch', 'regiomontanus', 'campanus', 'porphyry', 'alcabitius', 'topocentric'):
        ck.record(tag + 'cusp 1 = Asc', anpm(c[0] - asc_cf))
        ck.record(tag + 'cusp 10 = MC', anpm(c[9] - mc_cf))
        for k in range(12):
            arc = anp(c[(k + 1) % 12] - c[k])
            ck.require(tag + 'cusps in order', 0.0 < arc < math.pi)

    if system == 'equal':
        for k in range(12):
            ck.record(tag + 'Asc + 30(k-1)', anpm(c[k] - asc_cf - k * math.pi / 6.0))
    elif system == 'whole-sign':
        sign = math.floor((asc_cf / DEG) / 30.0)
        for k in range(12):
            ck.record(tag + 'sign of the Asc', anpm(c[k] - (sign + k) * math.pi / 6.0))
        ck.require(tag + 'Asc inside house 1', 0.0 <= anp(asc_cf - c[0]) < math.pi / 6.0)
    elif system == 'vehlow':
        for k in range(12):
            ck.record(tag + 'Asc - 15 + 30(k-1)', anpm(c[k] - asc_cf + math.pi / 12.0 - k * math.pi / 6.0))
    elif system == 'equal-mc':
        for k in range(12):
            ck.record(tag + 'MC + 30(k-10)', anpm(c[k] - mc_cf - (k - 9) * math.pi / 6.0))
    elif system == 'porphyry':
        q1, q2 = anp(asc_cf - mc_cf), anp(mc_cf + math.pi - asc_cf)
        for i, k in enumerate((9, 10, 11)):
            ck.record(tag + 'trisected quadrants', anpm(c[(k + 1) % 12] - c[k] - q1 / 3.0))
            ck.record(tag + 'trisected quadrants', anpm(c[i + 1] - c[i] - q2 / 3.0))
    elif system == 'alcabitius':
        # Second route: DSA from the ascensional difference formula (not the RA difference).
        a_asc, d_asc = erfa_radec(asc_cf, s.eps)
        dsa = HALF_PI + math.asin(math.tan(s.phi) * math.tan(d_asc))
        nsa = math.pi - dsa
        want = {-2: s.theta + dsa / 3.0, -1: s.theta + 2.0 * dsa / 3.0,
                1: a_asc + nsa / 3.0, 2: a_asc + 2.0 * nsa / 3.0}
        for m, alpha in want.items():
            ck.record(tag + 'AD-formula semi-arc', anpm(c[M_TO_INDEX[m]] - s.ra_to_lon(alpha)))
            a, _d = erfa_radec(c[M_TO_INDEX[m]], s.eps)
            ck.record(tag + 'RA of cusp (ERFA)', anpm(a - alpha))
    elif system == 'meridian':
        for k in range(12):
            Q = radec_vec(s.theta + HALF_PI + k * math.pi / 6.0, 0.0)
            lam, _ = s.meet(cross((0.0, 0.0, 1.0), Q), Q)
            ck.record(tag + 'hour-circle intersection', anpm(c[k] - lam))
            a, _d = erfa_radec(c[k], s.eps)
            ck.record(tag + 'RA = RAMC + 90 + 30(k-1) (ERFA)', anpm(a - s.theta - HALF_PI - k * math.pi / 6.0))
        ck.record(tag + 'cusp 10 = MC', anpm(c[9] - mc_cf))
    elif system == 'morinus':
        for k in range(12):
            alpha = s.theta + HALF_PI + k * math.pi / 6.0
            Q = radec_vec(alpha, 0.0)
            X = lin(1.0, Q, -dot(Q, s.K), s.K)  # drop Q's component along the ecliptic pole
            ck.record(tag + 'projection through the ecliptic poles', anpm(c[k] - s.lon_of(X)))
            ck.record(tag + 'longitude of the equator point (ERFA)',
                      anpm(c[k] - erfa_lon_of_equator_point(alpha, s.eps)))
    elif system == 'regiomontanus':
        for m in QUADRANT_M:
            lam = c[M_TO_INDEX[m]]
            alt = asc_from_oa(s.theta + HALF_PI + m * math.pi / 6.0,
                              math.atan(math.tan(s.phi) * math.cos(m * math.pi / 6.0)), s.eps)
            ck.record(tag + 'pole formula tan p = tan phi cos(30m)', anpm(lam - alt))
            # ERFA: the cusp lies in the plane through the N-S line and Q_k, on Q_k's side.
            q = erfa_horizon(-HALF_PI - m * math.pi / 6.0, 0.0, s.phi)
            aq = math.atan2(q[2], q[0])
            a, d_ = erfa_radec(lam, s.eps)
            x = erfa_horizon(s.theta - a, d_, s.phi)
            ck.record(tag + 'in the house plane (ERFA)', math.asin(-math.sin(aq) * x[0] + math.cos(aq) * x[2]))
            ck.require(tag + "on Q's side (ERFA)", math.cos(aq) * x[0] + math.sin(aq) * x[2] > 0.0)
    elif system == 'campanus':
        for m in QUADRANT_M:
            lam = c[M_TO_INDEX[m]]
            a_pv = -m * math.pi / 6.0
            Zk = lin(math.cos(a_pv), s.Z, -math.sin(a_pv), s.E)  # tilted zenith: pole of the house circle
            R = math.atan2(Zk[1], Zk[0])
            p = math.asin(max(-1.0, min(1.0, Zk[2])))
            ck.record(tag + 'tilted-zenith closed form', anpm(lam - asc_formula(R, p, s.eps)))
            a, d_ = erfa_radec(lam, s.eps)
            x = erfa_horizon(s.theta - a, d_, s.phi)
            ck.record(tag + 'in the house plane (ERFA)', math.asin(-math.sin(a_pv) * x[0] + math.cos(a_pv) * x[2]))
            ck.require(tag + "on P's side (ERFA)", math.cos(a_pv) * x[0] + math.sin(a_pv) * x[2] > 0.0)
    elif system == 'topocentric':
        for m in QUADRANT_M:
            lam = c[M_TO_INDEX[m]]
            p = topocentric_pole(s.phi, m)
            ck.record(tag + 'oblique-ascension closed form',
                      anpm(lam - asc_from_oa(s.theta + HALF_PI + m * math.pi / 6.0, p, s.eps)))
            a, d_ = erfa_radec(lam, s.eps)
            x = erfa_horizon(s.theta + m * math.pi / 6.0 - a, d_, p)
            ck.record(tag + 'on the pole-p horizon (ERFA)', math.asin(x[2]))
            ck.require(tag + 'rising side (ERFA)', x[0] > 0.0)
    if system in ('placidus', 'koch'):
        # The construction test (whole ecliptic, zodiacal order) must find these
        # cusps and no other ordered set: the value exists and is unique.
        r = construction(system, s)
        ck.require(tag + 'construction exists and is unique', r['exists'] and r['unique'])
        for k in range(12):
            ck.record(tag + 'construction test = cusps', anpm(r['cusps'][k] - c[k]))
        if system == 'placidus':
            for m in QUADRANT_M:
                b = placidus_roots_by_ad(s, m)
                ck.require(tag + 'one solution by ascensional difference too', len(b) == 1)
                ck.record(tag + 'one solution by ascensional difference too', anpm(b[0] - c[M_TO_INDEX[m]]))
    if system == 'koch':
        # Second route: oblique ascensions. OA(MC degree) = RAMC - AD_MC, DSA = 90 + AD_MC;
        # OA of cusps 11, 12 = OA_MC + DSA/3, + 2 DSA/3; of cusps 2, 3 = OA_Asc + DSA/3, + 2 DSA/3.
        _a, d_mc = erfa_radec(mc_cf, s.eps)
        ad = math.asin(math.tan(s.phi) * math.tan(d_mc))
        dsa = HALF_PI + ad
        oa = {-2: s.theta - ad + dsa / 3.0, -1: s.theta - ad + 2.0 * dsa / 3.0,
              1: s.theta + HALF_PI + dsa / 3.0, 2: s.theta + HALF_PI + 2.0 * dsa / 3.0}
        for m in QUADRANT_M:
            lam = c[M_TO_INDEX[m]]
            ck.record(tag + 'oblique-ascension closed form', anpm(lam - asc_from_oa(oa[m], s.phi, s.eps)))
            a, d_ = erfa_radec(lam, s.eps)
            x = erfa_horizon(s.theta + m * dsa / 3.0 - a, d_, s.phi)
            ck.record(tag + 'rising at RAMC + m DSA/3 (ERFA)', math.asin(x[2]))
            ck.require(tag + 'rising side (ERFA)', x[0] > 0.0)
    elif system == 'placidus':
        # Second route: solve in the ascensional difference instead of the longitude.
        # For an ecliptic point tan(delta) = tan(eps) sin(RA), so with
        # RA = RAMC + 90 + 30m + (1 - |m|/3) AD the condition sin AD = tan phi tan delta
        # becomes F(AD) = sin AD - tan phi tan eps sin(RA(AD)) = 0 on (-90, 90),
        # negative at -90 and positive at +90 while |tan phi tan eps| < 1.
        c_ = math.tan(s.phi) * math.tan(s.eps)
        for m in QUADRANT_M:
            lam = c[M_TO_INDEX[m]]
            f = 1.0 - abs(m) / 3.0
            base = s.theta + HALF_PI + m * math.pi / 6.0

            def F(ad, base=base, f=f):
                return math.sin(ad) - c_ * math.sin(base + f * ad)

            ad = bisect(F, -HALF_PI, HALF_PI)
            ck.require(tag + 'AD-space root unique', count_sign_changes(F, -HALF_PI, HALF_PI) == 1)
            ck.record(tag + 'ascensional-difference route', anpm(lam - s.ra_to_lon(base + f * ad)))
            _l, changes = placidus_cusp(s, c[0], c[9], m, verify=True)
            ck.require(tag + 'longitude-space root unique', changes == 1)
            a, d_ = erfa_radec(lam, s.eps)
            ad_e = math.asin(math.tan(s.phi) * math.tan(d_))
            ck.record(tag + 'semi-arc fraction (ERFA)', anpm((a - s.theta) - (base - s.theta + f * ad_e)))


# ---------------------------------------------------------------------------
# Case design (fixed rule, seeded; no engine output involved)
# ---------------------------------------------------------------------------

MASK64 = (1 << 64) - 1


class SplitMix64:
    """SplitMix64 (Steele, Lea & Flood 2014; the published constants), seeded
    from SHA-256 of a label so every stream of the design is independent and
    reproducible on any platform."""

    def __init__(self, label: str):
        digest = hashlib.sha256(('zodiacs-conformance/L2/0.1.0/' + label).encode('utf-8')).digest()
        self.state = int.from_bytes(digest[:8], 'big')

    def u64(self) -> int:
        self.state = (self.state + 0x9E3779B97F4A7C15) & MASK64
        z = self.state
        z = ((z ^ (z >> 30)) * 0xBF58476D1CE4E5B9) & MASK64
        z = ((z ^ (z >> 27)) * 0x94D049BB133111EB) & MASK64
        return z ^ (z >> 31)

    def uniform(self) -> float:
        """Uniform in [0, 1) from the top 53 bits."""
        return (self.u64() >> 11) * (1.0 / 9007199254740992.0)

    def below(self, n: int) -> int:
        """Uniform integer in [0, n), by rejection (no modulo bias)."""
        limit = (1 << 64) - ((1 << 64) % n)
        while True:
            x = self.u64()
            if x < limit:
                return x % n

    def shuffle(self, items: list) -> list:
        """Fisher-Yates."""
        for i in range(len(items) - 1, 0, -1):
            j = self.below(i + 1)
            items[i], items[j] = items[j], items[i]
        return items


JD_1800 = cal2jd(1800, 1, 1)
JD_2200 = cal2jd(2200, 1, 1)
JD_2025 = cal2jd(2025, 1, 1)
JD_2031 = cal2jd(2031, 1, 1)

ASC_LATITUDES = (0, 15, -15, 30, -30, 45, -45, 52, -52, 60, -60, 64, -64, 66, -66)  # x4 = 60
VTX_LATITUDES = (60, 45, 30, 15, 5, -5, -15, -30, -45, -60)
CSP_POOL = (60, 52, 45, 30, 15, 0, -15, -30, -45, -52, -60)
CSP_EXTRAS = (('placidus', 66), ('koch', -66), ('topocentric', 64), ('regiomontanus', -64), ('campanus', 66))
POL_LATITUDES = (70, 75, 80, -72, -78)
POL_SYSTEMS = ('placidus', 'koch')
POL_GUARD_DRAMC_DEG = 0.1   # a status case must fail at RAMC and RAMC +- this
WHOLE_SIGN_GUARD_DEG = 0.01   # Asc at least this far from a sign boundary
VERTEX_GUARD = math.sin(1.0 * DEG)  # vertex at least 1 deg from the meridian plane


def stratum_draw(rng: SplitMix64, lo: float, hi: float, n: int, i: int) -> float:
    return lo + (i + rng.uniform()) * (hi - lo) / n


def instant(rng, lo, hi, n, i) -> float:
    """A UT1 Julian date drawn uniformly in stratum i of n over [lo, hi),
    rounded to 1e-6 day (0.0864 s): arbitrary times of day, not round hours."""
    return round(stratum_draw(rng, lo, hi, n, i), 6)


def longitudes(label: str, n: int) -> list:
    """n geographic longitudes, one uniform draw in each of n equal strata of
    [-180, 180), rounded to 1e-4 degree, then shuffled."""
    rng = SplitMix64(label)
    lons = [round(stratum_draw(rng, -180.0, 180.0, n, i), 4) for i in range(n)]
    return rng.shuffle(lons)


def tt_of(ts: TimeScale, jd_ut1: float) -> float:
    """jd_tt = jd_ut1 + Delta T / 86400, rounded to 1e-9 day (86 microseconds).
    The rounded value is the one recorded in the vector and the one used."""
    dt, _src = ts(jd_ut1)
    return round(jd_ut1 + dt / 86400.0, 9)


def sky_of(case) -> Sky:
    gast, eps = earth_angles(case['jd_ut1'], case['jd_tt'])
    return Sky(anp(gast + case['lon'] * DEG), eps, case['lat'] * DEG)


def design(ts: TimeScale) -> list:
    cases = []

    # angles.asc-mc: 60 cases. Latitudes: each of the 15 values 4 times, order
    # shuffled. Instants: one per stratum of 55 equal strata over
    # 1800-01-01..2200-01-01 UT1, plus one per stratum of 5 over
    # 2025-01-01..2031-01-01. Longitudes: 60 strata of [-180, 180), shuffled.
    # Cases are listed in time order.
    rng = SplitMix64('asc-mc/instants')
    t = [instant(rng, JD_1800, JD_2200, 55, i) for i in range(55)]
    t += [instant(rng, JD_2025, JD_2031, 5, i) for i in range(5)]
    lats = SplitMix64('asc-mc/latitudes').shuffle([float(v) for v in ASC_LATITUDES * 4])
    lons = longitudes('asc-mc/longitudes', 60)
    block = [dict(kind='angles.asc-mc', jd_ut1=t[i], lat=lats[i], lon=lons[i]) for i in range(60)]
    cases += sorted(block, key=lambda c: c['jd_ut1'])

    # angles.vertex-east-point: 10 cases, the 10 latitudes in VTX_LATITUDES
    # (shuffled), instants one per stratum of 10 over 1800..2200, longitudes 10
    # strata shuffled. Guard: the vertex must lie at least 1 deg from the
    # meridian plane (its east/west side is then unambiguous); a case failing it
    # takes the next draw of its stratum. Listed in time order.
    rng = SplitMix64('vertex/instants')
    lats = SplitMix64('vertex/latitudes').shuffle([float(v) for v in VTX_LATITUDES])
    lons = longitudes('vertex/longitudes', 10)
    block = []
    for i in range(10):
        redraws = 0
        while True:
            c = dict(kind='angles.vertex-east-point', jd_ut1=instant(rng, JD_1800, JD_2200, 10, i),
                     lat=lats[i], lon=lons[i])
            c['jd_tt'] = tt_of(ts, c['jd_ut1'])
            if vertex(sky_of(c))[1] >= VERTEX_GUARD:
                break
            redraws += 1
        c['redraws'] = redraws
        block.append(c)
    cases += sorted(block, key=lambda c: c['jd_ut1'])

    # houses.cusps: 70 cases. System s (index in SYSTEMS) gets 5 cases at
    # latitudes CSP_POOL[(s + 2j) mod 11], j = 0..4 (both hemispheres for every
    # system), plus the 5 near-polar cases CSP_EXTRAS. Instants: one per stratum
    # of 70 over 1800..2200, strata assigned to cases by a shuffle; longitudes
    # 70 strata shuffled. Guard for whole-sign: the Asc must be at least 0.01 deg
    # from a sign boundary (else the next draw of the stratum). Listed by system
    # (SPEC order), then time.
    specs = [(sysname, float(CSP_POOL[(s + 2 * j) % 11])) for s, sysname in enumerate(SYSTEMS) for j in range(5)]
    specs += [(sysname, float(lat)) for sysname, lat in CSP_EXTRAS]
    strata = SplitMix64('cusps/strata').shuffle(list(range(70)))
    rng = SplitMix64('cusps/instants')
    lons = longitudes('cusps/longitudes', 70)
    block = []
    for i, (sysname, lat) in enumerate(specs):
        redraws = 0
        while True:
            c = dict(kind='houses.cusps', jd_ut1=instant(rng, JD_1800, JD_2200, 70, strata[i]),
                     lat=lat, lon=lons[i], system=sysname)
            c['jd_tt'] = tt_of(ts, c['jd_ut1'])
            if sysname != 'whole-sign':
                break
            a = anp(ascendant(sky_of(c))[0]) / DEG
            if abs(a - 30.0 * round(a / 30.0)) >= WHOLE_SIGN_GUARD_DEG:
                break
            redraws += 1
        c['redraws'] = redraws
        block.append(c)
    order = {name: i for i, name in enumerate(SYSTEMS)}
    cases += sorted(block, key=lambda c: (order[c['system']], c['jd_ut1']))

    # houses.cusps whose cusps do not exist (status "undefined"): ten cases,
    # Placidus and then Koch at each latitude of POL_LATITUDES. Case n (1..10)
    # draws its instant in stratum strata[n-1] of 10 over 1800..2200 (strata
    # shuffled) from the shared stream 'polar/instants', its longitude from 10
    # shuffled strata. Guard (construction_fails_robustly): the system's
    # construction must fail at the case's RAMC and at RAMC +- 0.1 deg. A case
    # whose first draw passes keeps the id L2-POL-000n. A case whose first draw
    # fails the guard (its cusps exist) is withdrawn and redrawn in the same
    # stratum, with the same latitude and longitude, from its own stream
    # 'polar/redraw/<n>' (so no other case moves), and the first redraw that
    # passes takes the next new id from L2-POL-0011 on. Only case 4 is redrawn:
    # its first draw, the withdrawn L2-POL-0004 (Placidus at -72 deg), has a
    # unique Placidus solution in zodiacal order.
    strata = SplitMix64('polar/strata').shuffle(list(range(10)))
    rng = SplitMix64('polar/instants')
    lons = longitudes('polar/longitudes', 10)
    next_new = 11
    n = 0
    for sysname in POL_SYSTEMS:
        for lat in POL_LATITUDES:
            n += 1
            c = dict(kind='houses.cusps', status=True, jd_ut1=instant(rng, JD_1800, JD_2200, 10, strata[n - 1]),
                     lat=float(lat), lon=lons[n - 1], system=sysname, case=n)
            c['jd_tt'] = tt_of(ts, c['jd_ut1'])
            if construction_fails_robustly(sysname, sky_of(c)):
                c['id'] = 'L2-POL-%04d' % n
            else:
                c['withdrawn'] = {'id': 'L2-POL-%04d' % n, 'jd_ut1': c['jd_ut1']}
                redraw = SplitMix64('polar/redraw/%d' % n)
                redraws = 0
                while True:
                    redraws += 1
                    c['jd_ut1'] = instant(redraw, JD_1800, JD_2200, 10, strata[n - 1])
                    c['jd_tt'] = tt_of(ts, c['jd_ut1'])
                    if construction_fails_robustly(sysname, sky_of(c)):
                        break
                c['redraws'] = redraws
                c['id'] = 'L2-POL-%04d' % next_new
                next_new += 1
            cases.append(c)

    for c in cases:
        c.setdefault('jd_tt', tt_of(ts, c['jd_ut1']))
    return cases


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------

def outputs(case, s: Sky) -> list:
    """The compared angles of a case, radians, in expected-key order."""
    if case['kind'] == 'angles.asc-mc':
        return [ascendant(s)[0], midheaven(s)[0]]
    if case['kind'] == 'angles.vertex-east-point':
        return [vertex(s)[0], east_point(s)[0]]
    return house_cusps(case['system'], s)


def older_models(jd_ut1: float, jd_tt: float):
    """(GAST, true obliquity) from two older IAU model sets, through ERFA, to
    measure how much the choice of model (not the geometry) moves each value:
      'IAU 2000B': gst00b, IAU 2006 mean obliquity + the IAU 2000B nutation in obliquity;
      'IAU 1980':  gst94 (IAU 1982 GMST + IAU 1994 equation of the equinoxes),
                   IAU 1980 mean obliquity + IAU 1980 nutation in obliquity."""
    ut, tt = jd_ut1 - DJM0, jd_tt - DJM0
    return {
        'IAU 2000B': (float(erfa.gst00b(DJM0, ut)), float(erfa.obl06(DJM0, tt)) + float(erfa.nut00b(DJM0, tt)[1])),
        'IAU 1980': (float(erfa.gst94(DJM0, ut)), float(erfa.obl80(DJM0, tt)) + float(erfa.nut80(DJM0, tt)[1])),
    }


def model_shifts(case):
    """Largest change (arcsec) of the compared outputs when GAST and the true
    obliquity come from each older model set instead of IAU 2006/2000A."""
    gast, eps = earth_angles(case['jd_ut1'], case['jd_tt'])
    phi = case['lat'] * DEG
    base = outputs(case, Sky(anp(gast + case['lon'] * DEG), eps, phi))
    out = {}
    for name, (g, e) in older_models(case['jd_ut1'], case['jd_tt']).items():
        alt = outputs(case, Sky(anp(g + case['lon'] * DEG), e, phi))
        out[name] = max(abs(anpm(u - d)) for u, d in zip(alt, base)) / ARCSEC
    return out


def sensitivities(case):
    """Arcsec-per-arcsec amplification of RAMC and obliquity errors into the
    compared outputs (max over outputs, central differences of 1e-6 rad), and
    the change (arcsec) when Delta T grows by 60 s."""
    gast, eps = earth_angles(case['jd_ut1'], case['jd_tt'])
    theta, phi = anp(gast + case['lon'] * DEG), case['lat'] * DEG
    h = 1e-6

    def amp(dth, dep):
        up = outputs(case, Sky(theta + dth, eps + dep, phi))
        dn = outputs(case, Sky(theta - dth, eps - dep, phi))
        return max(abs(anpm(u - d)) for u, d in zip(up, dn)) / (2.0 * h)

    base = outputs(case, Sky(theta, eps, phi))
    gast2, eps2 = earth_angles(case['jd_ut1'], case['jd_tt'] + 60.0 / 86400.0)
    moved = outputs(case, Sky(anp(gast2 + case['lon'] * DEG), eps2, phi))
    dt60 = max(abs(anpm(u - d)) for u, d in zip(moved, base)) / ARCSEC
    return amp(h, 0.0), amp(0.0, h), dt60


def fmt_sig(x: float, digits: int = 2) -> str:
    return ('%.' + str(digits) + 'g') % x


def evaluate(cases, ts: TimeScale):
    ck = Checks()
    rows = []
    for c in cases:
        s = sky_of(c)
        row = {'case': c, 'eps': s.eps, 'theta': s.theta}
        if c.get('status'):
            if not construction_fails_robustly(c['system'], s):
                raise AssertionError('%s: the cusps exist, so it cannot be a status vector' % c['id'])
            row['expected'] = {'status': 'undefined'}
            row['construction'] = {}
            for name, dth in (('at RAMC', 0.0), ('RAMC + 0.1', POL_GUARD_DRAMC_DEG * DEG),
                              ('RAMC - 0.1', -POL_GUARD_DRAMC_DEG * DEG)):
                s2 = Sky(s.theta + dth, s.eps, s.phi)
                row['construction'][name] = construction(c['system'], s2)
                check_status(ck, c['system'], s2, row['construction'][name])
            if 'withdrawn' in c:
                w = dict(c, jd_ut1=c['withdrawn']['jd_ut1'])
                w['jd_tt'] = tt_of(ts, w['jd_ut1'])
                row['withdrawn'] = dict(c['withdrawn'], construction=construction(c['system'], sky_of(w)))
            rows.append(row)
            continue
        asc, m_asc = ascendant(s)
        mc, _ = midheaven(s)
        vtx, m_vtx = vertex(s)
        ep, _ = east_point(s)
        if abs(c['lat']) < 90.0:
            row['vertex_cf_anti'] = check_angles(ck, s, asc, mc, vtx, ep)
        if c['kind'] == 'angles.asc-mc':
            row['expected'] = {'asc': deg_out(asc), 'mc': deg_out(mc)}
        elif c['kind'] == 'angles.vertex-east-point':
            row['expected'] = {'vertex': deg_out(vtx), 'east_point': deg_out(ep)}
            row['vertex_margin'] = m_vtx
        else:
            cusps = house_cusps(c['system'], s)
            check_houses(ck, c['system'], s, cusps)
            row['expected'] = {'cusps': [deg_out(x) for x in cusps]}
        row['amp_ramc'], row['amp_eps'], row['dt60'] = sensitivities(c)
        row['models'] = model_shifts(c)
        row['dt_source'] = ts(c['jd_ut1'])[1]
        rows.append(row)
    return rows, ck


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------

TOL_ARCSEC = {'abs': 1, 'unit': 'arcsec', 'wrap': 360}
NOTE_AMP = 10.0  # notes flag vectors whose outputs amplify RAMC/obliquity errors 10x or more


def vector_of(row, ident: str):
    c = row['case']
    inp = {'jd_ut1': c['jd_ut1'], 'jd_tt': c['jd_tt'], 'lat': c['lat'], 'lon': c['lon']}
    if c['kind'] == 'houses.cusps':
        inp['system'] = c['system']
    if c.get('status'):
        tol = {'status': {'exact': True}}
        arb = 'l2-houses-undefined'
        t = failure_text(c['system'], row['construction']['at RAMC'])
        note = t[0].upper() + t[1:] + '.'
    else:
        if c['kind'] == 'angles.asc-mc':
            tol = {'asc': dict(TOL_ARCSEC), 'mc': dict(TOL_ARCSEC)}
            arb = 'l2-angles-erfa'
        elif c['kind'] == 'angles.vertex-east-point':
            tol = {'vertex': dict(TOL_ARCSEC), 'east_point': dict(TOL_ARCSEC)}
            arb = 'l2-angles-erfa'
        else:
            tol = {'cusps': {'each': dict(TOL_ARCSEC)}}
            arb = FAMILY[c['system']]
        note = None
        legacy = row['models']['IAU 1980']
        legacy_clause = ('IAU 1982/1994 sidereal time with the IAU 1980 obliquity and nutation, instead of IAU '
                         '2006/2000A, would move it by %.2f″' % legacy)
        if max(row['amp_ramc'], row['amp_eps']) >= NOTE_AMP:
            what = 'a cusp' if c['kind'] == 'houses.cusps' else 'an output'
            note = ('Ill-conditioned near the polar circle: 1 mas of sidereal time moves %s by up to %.0f mas and '
                    '1 mas of obliquity by up to %.0f mas' % (what, row['amp_ramc'], row['amp_eps']))
            note += (', and ' + legacy_clause + '.') if legacy > 1.0 else '.'
        elif legacy > 1.0:
            note = 'Model-sensitive: ' + legacy_clause + ', more than the tolerance.'
        if c['kind'] == 'angles.vertex-east-point' and row.get('vertex_cf_anti'):
            note = ('Here the co-latitude closed form Asc(RAMC + 180°, 90° − φ) returns the eastern intersection '
                    '(the anti-vertex); the vertex is the western one, 180° from it.')
    v = {'id': ident, 'kind': c['kind'], 'input': inp, 'expected': row['expected'],
         'tolerance': tol, 'arbiter': arb}
    if note:
        v['note'] = note
    return v


def summarise(rows, ck: Checks, ts: TimeScale):
    """Numbers quoted in the arbiter texts (deterministic)."""
    out = {}
    live = [r for r in rows if 'dt60' in r]
    out['dt60_max'] = max(r['dt60'] for r in live)
    out['dt60_median'] = statistics.median(r['dt60'] for r in live)
    by = {}
    for r in live:
        c = r['case']
        key = c['kind'] if c['kind'] != 'houses.cusps' else c['system']
        by.setdefault(key, []).append(r)
    out['by'] = by
    out['check_max'] = max(ck.max.values())
    em_jumps = [abs(delta_t_espenak_meeus(b - 1e-9) - delta_t_espenak_meeus(b)) for b in EM_BOUNDARIES]
    out['em_jump_max'] = max(em_jumps)
    out['iers_first_mjd'] = ts.first
    out['iers_last_mjd'] = ts.last
    out['seam_1973'] = ts.dt[ts.first] - delta_t_espenak_meeus(decimal_year(DJM0 + ts.first))
    out['seam_2026'] = ts.dt[ts.last] - delta_t_espenak_meeus(decimal_year(DJM0 + ts.last))
    out['n_iers'] = sum(1 for r in live if r['dt_source'] == 'IERS') + sum(
        1 for r in rows if 'polar' in r and ts(r['case']['jd_ut1'])[1] == 'IERS')
    out['amp_max'] = max(max(r['amp_ramc'], r['amp_eps']) for r in live)
    # Per arbiter entry (family of definitions).
    fam = {}
    for r in live:
        c = r['case']
        fam.setdefault('l2-angles-erfa' if c['kind'] != 'houses.cusps' else FAMILY[c['system']], []).append(r)
    chk = {}
    for label, val in ck.max.items():
        aid = FAMILY.get(label.split(':')[0], 'l2-angles-erfa')  # 'asc: ...', 'vertex: ...' -> angles
        chk[aid] = max(chk.get(aid, 0.0), val)
    out['status'] = []
    for r in rows:
        c = r['case']
        if c.get('status'):
            out['status'].append({'id': c['id'], 'system': c['system'], 'lat': c['lat'],
                                  'year': decimal_year(c['jd_ut1']),
                                  'text': failure_text(c['system'], r['construction']['at RAMC']),
                                  'modes': sorted(set(x['mode'] for x in r['construction'].values())),
                                  'withdrawn': r.get('withdrawn')})
    out['status'].sort(key=lambda x: x['id'])
    misses, tans, sizes = [], [], []
    for r in rows:
        if r['case'].get('status'):
            x = r['construction']['at RAMC']
            if x['mode'] == 'no-solution':
                # The failure lasts while any one cusp stays unsolvable, i.e. for any
                # change of RAMC smaller than the largest closest miss (the residual
                # moves by exactly the change of RAMC).
                misses.append(max(x['closest_deg'].values()))
            elif x['mode'] == 'no-semi-arc':
                tans.append(abs(x['tan_product']))
            elif x['mode'] == 'out-of-order':
                sizes += [size for _words, size in x['violations']]
            else:
                raise AssertionError('unexpected failure mode %s' % x['mode'])
    out['status_margins'] = (min(misses), min(tans), min(sizes))
    out['family'] = {aid: {'n': len(rs),
                           'm2000b_max': max(r['models']['IAU 2000B'] for r in rs),
                           'm1980_max': max(r['models']['IAU 1980'] for r in rs),
                           'm1980_over': sum(1 for r in rs if r['models']['IAU 1980'] > 1.0),
                           'dt60_max': max(r['dt60'] for r in rs),
                           'dt60_median': statistics.median(r['dt60'] for r in rs),
                           'amp_ramc': max(r['amp_ramc'] for r in rs),
                           'amp_eps': max(r['amp_eps'] for r in rs),
                           'check_max': chk.get(aid, 0.0)} for aid, rs in fam.items()}
    return out


ROUTES = {
    'l2-angles-erfa': 'great-circle intersections of unit vectors, and the classical closed forms',
    'l2-houses-ecliptic': 'the angles as in l2-angles-erfa, then the arithmetic re-done from the closed-form '
                          'Asc and MC',
    'l2-houses-great-circle': 'cross-product intersections, and the pole-height or projection formulas',
    'l2-houses-semi-arc': 'Placidus by bisection in longitude and again in ascensional difference; Koch, '
                          'Alcabitius and topocentric by vector ascendants and by the oblique-ascension formula',
}

SOURCE_COMMON = (
    'ERFA 2.0.1 through pyerfa 2.0.1.5 (github.com/liberfa/erfa, derived from IAU SOFA): gst06a, obl06, nut06a. '
    'UT1−UTC: IERS finals2000A (the IERS Rapid Service/Prediction Centre finals.all fetched 2026-09-22, sha256 '
    'c672540e026d3cd4840c0858d4ce2bc4a18c3bc9751f9636c3285e11950d58a1; the three columns used are the committed '
    'CSV). TAI−UTC: IERS Bulletin C, hpiers.obspm.fr/iers/bul/bulc/Leap_Second.dat (through Bulletin C 72, '
    'fetched 2026-09-28). ΔT outside the IERS span: F. Espenak and J. Meeus, Five Millennium Canon of Solar '
    'Eclipses: −1999 to +3000, NASA/TP-2006-214141 (2006).')

TIME_METHOD = (
    'TT = UT1 + ΔT, ΔT = 32.184 s + (TAI−UTC) − (UT1−UTC) on the IERS rows flagged I (1973-01-02 to 2026-09-17, '
    'interpolated linearly in time; TAI−UTC equal to erfa.dat on every row), the Espenak–Meeus polynomials '
    'elsewhere; the TT used is input.jd_tt. GAST = ERFA gst06a (IAU 2006 precession, IAU 2000A nutation); true '
    'obliquity ε = obl06 + the Δε of nut06a; RAMC = GAST + east longitude (no polar motion; the latitude is used '
    'as given).')

DESIGN_METHOD = (
    'Cases come from the seeded design written in build.py and described in arbiters/l2/README.md (SplitMix64 '
    'streams; instants stratified over 1800–2200 UT1, longitudes stratified over −180…180°, latitudes from fixed '
    'lists); no engine output was consulted.')


def withdrawn_text(x) -> str:
    r = x['withdrawn']['construction']
    if r['exists'] and r['unique']:
        return ('its %s construction has exactly one solution for each cusp and they are in zodiacal order, so its '
                'cusps exist' % x['system'].capitalize())
    return 'its %s cusps exist' % x['system'].capitalize()


def uncertainty_text(summ, aid):
    f = summ['family'][aid]
    return (
        'Numerical: each value is computed by two independent routes (%s) and checked against its defining '
        'property with ERFA coordinate routines (s2c, rx, c2s, hd2ae); over this arbiter\'s %d vectors the largest '
        'disagreement is %s″. Time: TT is pinned by input.jd_tt; moving ΔT by 60 s moves no output by more than '
        '%s″ (median %s″), because IAU 2006 sidereal time depends on TT only through precession-nutation (about '
        '1e-4″ per minute) and the geometry amplifies that at most %.1f-fold. Model: the values are defined by IAU '
        '2006/2000A; another sidereal-time or obliquity model moves them by the model difference times the '
        'amplification, here at most %.1f (sidereal time) and %.1f (obliquity) arcsec per arcsec (vectors at 10 or '
        'more carry a note). Recomputed through ERFA with IAU 2000B sidereal time and nutation they move by at most '
        '%s″; with IAU 1982/1994 sidereal time and the IAU 1980 obliquity and nutation by at most %s″, %s. '
        'Rounding: 1e-10°. An after-the-fact comparison with Swiss Ephemeris is reported in '
        'arbiters/l2/swiss-check.json (statistics only).'
        % (ROUTES[aid], f['n'], fmt_sig(f['check_max']), fmt_sig(f['dt60_max']), fmt_sig(f['dt60_median']),
           max(f['amp_ramc'], f['amp_eps']), f['amp_ramc'], f['amp_eps'], fmt_sig(f['m2000b_max']),
           fmt_sig(f['m1980_max']),
           ('more than the tolerance on %d of these vectors (each carries a note)' % f['m1980_over'])
           if f['m1980_over'] else 'within the tolerance on every one of these vectors'))


def arbiters(summ, inputs):
    definitions = (' Definitions: R. W. Holden, The Elements of House Division (1977); M. P. Munkasey, An '
                   'Astrological House Formulary; W. M. Smart, Textbook on Spherical Astronomy.')
    return {
        'l2-angles-erfa': {
            'name': 'ERFA sidereal time and obliquity; spherical geometry of the angles',
            'source': SOURCE_COMMON + definitions,
            'inputs': inputs,
            'method': (
                TIME_METHOD + ' With K the ecliptic pole, Z the zenith, E the east point, N the north point of the '
                'horizon and M the equator point on the upper meridian (unit vectors of date), each angle is the '
                'ecliptic\'s intersection with a great circle, ±(K × pole), on a named side: ascendant, the horizon '
                '(pole Z) on E\'s side (rising); MC, the meridian (pole E) on the upper branch, right ascension = '
                'RAMC; vertex, the prime vertical (pole N) on the WEST side, in both hemispheres; east point, the hour '
                'circle through E (pole M), i.e. the ecliptic point with right ascension RAMC + 90°. Checked against '
                'the closed forms (Asc = atan2(cos RAMC, −(sin RAMC cos ε + tan φ sin ε)); MC = atan2(sin RAMC, '
                'cos RAMC cos ε); east point = that Asc formula at φ = 0; vertex = that formula at co-latitude '
                '90° − φ under RAMC + 180°, which returns the eastern intersection, 180° from the vertex, exactly '
                'when sign(φ)(sin φ cos ε − cos φ sin ε sin RAMC) ≤ 0, possible only for |φ| < ε) and, with ERFA, '
                'against altitude 0 (Asc), hour angle 0 (MC), azimuth 270° (vertex) and right ascension RAMC + 90° '
                '(east point). ' + DESIGN_METHOD),
            'generator': GENERATOR,
            'uncertainty': uncertainty_text(summ, 'l2-angles-erfa'),
        },
        'l2-houses-ecliptic': {
            'name': 'Ecliptic divisions: equal, whole-sign, Vehlow, equal-MC, Porphyry',
            'source': SOURCE_COMMON + definitions,
            'inputs': inputs,
            'method': (
                'TT, RAMC, ε, ascendant and MC exactly as in l2-angles-erfa, then: equal, cusp k = Asc + 30°(k−1); '
                'whole-sign, cusp 1 = 0° of the sign holding the Asc, then +30° (cases are drawn with the Asc at '
                'least 0.01° from a sign boundary); Vehlow, cusp 1 = Asc − 15°, then +30°; equal-MC, cusp k = '
                'MC + 30°(k−10); Porphyry, each quadrant MC→Asc→IC trisected in longitude. Cusps 4–9 are opposite '
                '10–3. ' + DESIGN_METHOD),
            'generator': GENERATOR,
            'uncertainty': uncertainty_text(summ, 'l2-houses-ecliptic'),
        },
        'l2-houses-great-circle': {
            'name': 'Fixed house circles: Regiomontanus, Campanus, meridian, Morinus',
            'source': SOURCE_COMMON + definitions,
            'inputs': inputs,
            'method': (
                'TT, RAMC and ε as in l2-angles-erfa. Each cusp is the ecliptic\'s intersection with a house '
                'circle, ±(K × pole), on a named side. Regiomontanus: the equator divided into 30° arcs from the '
                'meridian; circle k passes through the north and south points of the horizon and the equator point '
                'Q_k at right ascension RAMC + 90° + 30°(k−1); the cusp lies on the half-circle N→Q_k→S. Campanus: '
                'the prime vertical divided into 30° arcs from the east point; circle k passes through the north '
                'and south points and P_k = cos(a)E + sin(a)Z, a = 30°(1−k); the cusp lies on P_k\'s side. Meridian '
                '(axial rotation): cusp k is the ecliptic point with right ascension RAMC + 90° + 30°(k−1) '
                '(projection along hour circles; cusp 10 = MC, cusp 1 = east point). Morinus: cusp k is the '
                'ecliptic longitude of the equator point at right ascension RAMC + 90° + 30°(k−1) (projection '
                'along circles through the ecliptic poles; cusp 10 is not the MC). Second routes: the pole height '
                'tan p = tan φ cos(30°m) with the oblique-ascension Asc formula (Regiomontanus), the Asc formula '
                'for the house circle\'s own pole (Campanus), the closed-form projections (meridian, Morinus). '
                + DESIGN_METHOD),
            'generator': GENERATOR,
            'uncertainty': uncertainty_text(summ, 'l2-houses-great-circle'),
        },
        'l2-houses-semi-arc': {
            'name': 'Semi-arc and pole systems: Placidus, Koch, Alcabitius, topocentric',
            'source': SOURCE_COMMON + definitions + (' Topocentric: W. Polich and A. P. Nelson Page, the '
                                                     'topocentric system (tan of the house pole = n/3 · tan φ).'),
            'inputs': inputs,
            'method': (
                'TT, RAMC, ε, ascendant and MC as in l2-angles-erfa. With AD = asin(tan φ tan δ), DSA = 90° + AD, '
                'NSA = 90° − AD and m = k − 1 (cusps 11, 12, 2, 3 as m = −2, −1, 1, 2). Placidus: each cusp is the '
                'ecliptic point whose right ascension minus RAMC is 90° + 30°m + (1 − |m|/3)·AD of its own '
                'declination, i.e. DSA/3 and 2DSA/3 before culmination for cusps 11 and 12, and 2NSA/3 and NSA/3 '
                'after lower culmination for cusps 2 and 3; solved by bisection in longitude over the quadrant to '
                'adjacent doubles, and again in ascensional difference (sin AD = tan φ tan ε sin RA), each root '
                'checked unique on a 2000-point grid. Koch: the MC degree\'s diurnal semi-arc DSA_MC trisected in '
                'time; cusp k is the degree rising at RAMC + m·DSA_MC/3. Alcabitius: the ascendant\'s DSA trisected '
                'in right ascension and carried to the ecliptic along hour circles (RAMC + DSA/3, RAMC + 2DSA/3; '
                'RA(Asc) + NSA/3, RA(Asc) + 2NSA/3). Topocentric (Polich–Page): cusp k is the degree rising on '
                'the horizon of pole p, tan p = (1 − |m|/3) tan φ, at RAMC + 30°m. Cusps 4–9 are opposite 10–3. '
                + DESIGN_METHOD),
            'generator': GENERATOR,
            'uncertainty': uncertainty_text(summ, 'l2-houses-semi-arc'),
        },
        'l2-houses-undefined': {
            'name': 'Cusps that do not exist: the construction has no solution in zodiacal order',
            'source': ('Constructions: Placidus de Titis, Tabulae primi mobilis (Milan, 1657; English translation by '
                       'J. Cooper, Primum Mobile, 1814); W. A. Koch and E. Schaeck, Häusertabellen des Geburtsortes '
                       '(Göppingen, 1962); both restated in R. W. Holden, The Elements of House Division (L. N. '
                       'Fowler, Romford, 1977; page numbers not verified for this file). TT, RAMC and ε as in '
                       'l2-angles-erfa: ' + SOURCE_COMMON),
            'inputs': inputs,
            'method': (
                'Definition: a house system\'s cusps exist where its defining construction has a solution for every '
                'cusp and the twelve cusps that result are in zodiacal order (going 1→2→…→12→1 they advance through '
                'one turn of longitude, every step forward; with cusps 4–9 opposite 10–3, 0 < d11 < d12 < d1 < d2 < '
                'd3 < 180°, d_k the forward distance of cusp k from cusp 10). Placidus: cusps 11 and 12 are the '
                'degrees that still have 1/3 and 2/3 of their own diurnal semi-arc to go to culmination, cusps 3 and '
                '2 the degrees that have completed 1/3 and 2/3 of their own nocturnal semi-arc since lower '
                'culmination; only degrees that rise and set have semi-arcs, and every such degree of the ecliptic '
                'is searched (on each arc of degrees that rise and set, parametrised by the ascensional difference, '
                'on a 4000-point grid with every sign change refined by bisection and every local minimum of the '
                'residual refined). Koch: cusp k is the degree rising at RAMC + (k−1)·DSA_MC/3, which needs the MC '
                'degree to rise and set. Cusp 10 is the degree on the upper meridian and cusp 1 the degree rising '
                '(eastern horizon), which always exist. Each status vector fails at its RAMC and also 0.1° either '
                'side. How each one fails: '
                + '; '.join('%s (%s, φ = %s°, %d): %s' % (x['id'], x['system'].capitalize(), minus('%g' % x['lat']),
                                                         int(x['year']), x['text']) for x in summ['status'])
                + '. ' + ''.join('%s, the first draw of its case, was withdrawn before release: %s. '
                                 % (x['withdrawn']['id'], withdrawn_text(x)) for x in summ['status'] if x['withdrawn'])
                + DESIGN_METHOD),
            'generator': GENERATOR,
            'uncertainty': ('None from the numbers: no failure is marginal. The Placidus residual moves by exactly '
                            'the change of RAMC, so each Placidus failure survives any change of RAMC smaller than the '
                            'largest closest miss of its unsolvable cusps, here at least %.1f°; each MC degree that '
                            'never rises or sets has |tan φ tan δ_MC| ≥ %.2f; each order violation is at least %.1f°; '
                            'and every failure was also verified at RAMC ± 0.1°. Model differences in sidereal time '
                            'are of order 1 mas, legacy models 0.5″, so none can change a status.'
                            % summ['status_margins']),
        },
    }


def validate(doc):
    """Structure required by conformance/SPEC.md (v0), plus this level's design."""
    assert list(doc) == ['suite', 'suiteVersion', 'level', 'title', 'arbiters', 'vectors']
    assert doc['suite'] == SUITE and doc['suiteVersion'] == SUITE_VERSION and doc['level'] == LEVEL
    for aid, a in doc['arbiters'].items():
        assert list(a) == ['name', 'source', 'inputs', 'method', 'generator', 'uncertainty'], aid
        for i in a['inputs']:
            assert list(i) == ['path', 'sha256'] and i['path'].startswith('sources/') and len(i['sha256']) == 64
            assert sha256_file(i['path']) == i['sha256']
        assert os.path.exists(os.path.join(ROOT, a['generator']))
    kinds = {
        'angles.asc-mc': ('ASC', ['asc', 'mc']),
        'angles.vertex-east-point': ('VTX', ['vertex', 'east_point']),
        'houses.cusps': ('CSP', ['cusps']),
    }
    ids = set()
    counts = {}
    per_system = {}
    pol_ids = []
    for v in doc['vectors']:
        assert set(v) <= {'id', 'kind', 'input', 'expected', 'tolerance', 'arbiter', 'note'}
        assert list(v)[:6] == ['id', 'kind', 'input', 'expected', 'tolerance', 'arbiter']
        assert v['id'] not in ids
        ids.add(v['id'])
        assert v['arbiter'] in doc['arbiters']
        if 'note' in v:
            assert isinstance(v['note'], str) and v['note'].count('. ') == 0 and v['note'].endswith('.')
        inp = v['input']
        assert isinstance(inp['jd_ut1'], float) and isinstance(inp['jd_tt'], float)
        assert abs(inp['jd_tt'] - inp['jd_ut1']) < 0.01  # |Delta T| < 864 s (it is negative around 1900)
        assert -90.0 <= inp['lat'] <= 90.0 and -180.0 <= inp['lon'] <= 180.0
        tag, keys = kinds[v['kind']]
        status = v['expected'].get('status')
        if status is not None:
            tag = 'POL'
            assert v['expected'] == {'status': 'undefined'} and v['tolerance'] == {'status': {'exact': True}}
            assert inp['system'] in ('placidus', 'koch')
        else:
            assert list(v['expected']) == keys and list(v['tolerance']) == keys
            for k in keys:
                val = v['expected'][k]
                vals = val if isinstance(val, list) else [val]
                if k == 'cusps':
                    assert len(vals) == 12 and v['tolerance'][k] == {'each': TOL_ARCSEC}
                else:
                    assert v['tolerance'][k] == TOL_ARCSEC
                for x in vals:
                    assert isinstance(x, float) and 0.0 <= x < 360.0 and round(x, 10) == x
        if v['kind'] == 'houses.cusps':
            assert list(inp) == ['jd_ut1', 'jd_tt', 'lat', 'lon', 'system'] and inp['system'] in SYSTEMS
            if status is None:
                per_system[inp['system']] = per_system.get(inp['system'], 0) + 1
                assert abs(inp['lat']) <= 66.0
        else:
            assert list(inp) == ['jd_ut1', 'jd_tt', 'lat', 'lon']
        if tag == 'POL':
            assert re.fullmatch(r'L2-POL-\d{4}', v['id']) and v['id'] != 'L2-POL-0004'
            assert not pol_ids or v['id'] > pol_ids[-1]
            pol_ids.append(v['id'])
        else:
            assert v['id'] == 'L2-%s-%04d' % (tag, counts.get(tag, 0) + 1)
        counts[tag] = counts.get(tag, 0) + 1
    assert counts == {'ASC': 60, 'VTX': 10, 'CSP': 70, 'POL': 10}, counts
    assert set(per_system) == set(SYSTEMS) and min(per_system.values()) >= 5


def build(report: bool = False):
    ts = TimeScale()
    for b in EM_BOUNDARIES:
        if abs(delta_t_espenak_meeus(b - 1e-9) - delta_t_espenak_meeus(b)) > 0.5:
            raise AssertionError('Espenak-Meeus segments disagree at %s (transcription error?)' % b)
    cases = design(ts)
    rows, ck = evaluate(cases, ts)
    inputs = [{'path': IERS_CSV, 'sha256': sha256_file(IERS_CSV)},
              {'path': LEAP_DAT, 'sha256': sha256_file(LEAP_DAT)}]
    summ = summarise(rows, ck, ts)
    counters = {}
    vectors, status = [], []
    for row in rows:
        c = row['case']
        if c.get('status'):
            status.append(vector_of(row, c['id']))
            continue
        tag = {'angles.asc-mc': 'ASC', 'angles.vertex-east-point': 'VTX', 'houses.cusps': 'CSP'}[c['kind']]
        counters[tag] = counters.get(tag, 0) + 1
        vectors.append(vector_of(row, 'L2-%s-%04d' % (tag, counters[tag])))
    vectors += sorted(status, key=lambda v: v['id'])
    doc = {'suite': SUITE, 'suiteVersion': SUITE_VERSION, 'level': LEVEL, 'title': TITLE,
           'arbiters': arbiters(summ, inputs), 'vectors': vectors}
    validate(doc)
    text = json.dumps(doc, indent=2, ensure_ascii=False) + '\n'
    path = os.path.join(ROOT, OUTPUT)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
    print('wrote %s (%d vectors) sha256 %s' % (OUTPUT, len(vectors), digest), file=sys.stderr)
    if report:
        print_report(rows, ck, summ, vectors)
    return doc


def print_report(rows, ck, summ, vectors):
    print('== route/property checks: max residual (arcsec) per label')
    for label in sorted(ck.max):
        print('  %-58s %.3e' % (label, ck.max[label]))
    print('== Delta T: IERS rows MJD %d..%d; E-M jump max %.4f s; seams 1973 %+.3f s, 2026 %+.3f s; cases on IERS %d'
          % (summ['iers_first_mjd'], summ['iers_last_mjd'], summ['em_jump_max'], summ['seam_1973'],
             summ['seam_2026'], summ['n_iers']))
    print('== per kind/system: n, max amp RAMC, max amp eps, max dT60 (arcsec), median dT60')
    for key, rs in summ['by'].items():
        print('  %-26s %3d  %7.2f  %7.2f  %.2e  %.2e' % (
            key, len(rs), max(r['amp_ramc'] for r in rs), max(r['amp_eps'] for r in rs),
            max(r['dt60'] for r in rs), statistics.median(r['dt60'] for r in rs)))
    print('== vectors with notes')
    for v in vectors:
        if 'note' in v:
            print('  %s lat %6.1f %s: %s' % (v['id'], v['input']['lat'], v['input'].get('system', ''), v['note']))
    print('== status vectors: the construction test at RAMC and RAMC +- 0.1 deg')
    for r in rows:
        c = r['case']
        if not c.get('status'):
            continue
        print('  %s %-8s lat %5.1f  %7.2f  modes %s' % (c['id'], c['system'], c['lat'], decimal_year(c['jd_ut1']),
                                                        sorted(set(x['mode'] for x in r['construction'].values()))))
        print('      %s' % failure_text(c['system'], r['construction']['at RAMC']))
        if 'withdrawn' in r:
            w = r['withdrawn']['construction']
            print('      replaces %s (first draw, %.2f): exists %s, unique %s, solutions per cusp %s' % (
                r['withdrawn']['id'], decimal_year(r['withdrawn']['jd_ut1']), w['exists'], w.get('unique'),
                w.get('counts')))
    print('  margins (closest miss deg, min |tan phi tan delta_MC|, min order violation deg): %s'
          % (tuple(round(x, 3) for x in summ['status_margins']),))
    print('== redraws: %s' % [(r['case'].get('system', r['case']['kind']), r['case'].get('redraws'))
                              for r in rows if r['case'].get('redraws')])


if __name__ == '__main__':
    build(report='--report' in sys.argv[1:])
