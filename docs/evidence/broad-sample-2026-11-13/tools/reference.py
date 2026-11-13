"""Independent reference: JPL DE421 (jplephem) + ERFA (pyerfa) IAU 2006/2000A.

Apparent geocentric ecliptic longitude/latitude, true ecliptic and equinox of date:
light-time (3 iterations), solar light deflection (erfa.ld, not for the Sun),
annual aberration (erfa.ab), GCRS -> true equator of date (erfa.pnm06a),
then R1(true obliquity) to the ecliptic of date.
All times: TT as days from J2000.0 (TDB taken from TT + erfa.dtdb at the geocentre).
The kernel is NAIF's de421.bsp, named by the DE421_BSP environment variable
(see ../README.md for its address and SHA-256).
"""
import os
import numpy as np
import erfa
from jplephem.spk import SPK

KERNEL = os.environ["DE421_BSP"]
J2000 = 2451545.0
AU_KM = 149597870.700
C_AUD = 173.1446326846693  # speed of light, au/day
_k = SPK.open(KERNEL)

# segments
def _seg(c, t):
    return _k[c, t]

BODY_CHAIN = {
    "Sun": [(0, 10)],
    "Mercury": [(0, 1), (1, 199)],
    "Venus": [(0, 2), (2, 299)],
    "Mars": [(0, 4)],          # system barycentre (as the conformance arbiter, NAIF 4)
    "Jupiter": [(0, 5)],
    "Saturn": [(0, 6)],
    "Uranus": [(0, 7)],
    "Neptune": [(0, 8)],
    "Pluto": [(0, 9)],
}


def _bary(chain, days_tdb):
    """Barycentric position (km) and velocity (km/day); days_tdb = TDB days from J2000 (two-part JD)."""
    p = 0.0
    v = 0.0
    for c, t in chain:
        pp, vv = _k[c, t].compute_and_differentiate(J2000, days_tdb)
        p = p + pp
        v = v + vv
    return np.asarray(p), np.asarray(v)


def earth_bary(jd_tdb):
    return _bary([(0, 3), (3, 399)], jd_tdb)


def moon_bary(jd_tdb):
    return _bary([(0, 3), (3, 301)], jd_tdb)


def body_bary(body, jd_tdb):
    if body == "Moon":
        return moon_bary(jd_tdb)
    return _bary(BODY_CHAIN[body], jd_tdb)


def tt_to_tdb_days(tt):
    """tt: days from J2000 TT (array). Returns tdb days from J2000 (geocentric dtdb)."""
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    # erfa.dtdb(date1, date2, ut, elong, u, v) seconds; geocentre -> u=v=0
    ut = (tt % 1.0)
    d = erfa.dtdb(J2000, tt, ut, 0.0, 0.0, 0.0)
    return tt + d / 86400.0


def apparent_gcrs(body, tt, deflect=True):
    """Unit apparent direction (GCRS, natural+aberrated), distance (au). tt days from J2000 TT."""
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    tdb = tt_to_tdb_days(tt)
    jd = tdb  # TDB days from J2000, passed as a two-part JD
    pe, ve = earth_bary(jd)
    ps, _ = _bary([(0, 10)], jd)
    pe = pe / AU_KM; ve = ve / AU_KM; ps = ps / AU_KM
    # light time
    tau = np.zeros_like(tdb)
    for _ in range(4):
        pb, _vb = body_bary(body, jd - tau)
        pb = pb / AU_KM
        d = pb - pe
        dist = np.sqrt((d * d).sum(axis=0))
        tau = dist / C_AUD
    pb, _vb = body_bary(body, jd - tau)
    pb = pb / AU_KM
    d = (pb - pe).T  # (n,3)
    dist = np.sqrt((d * d).sum(axis=1))
    p = d / dist[:, None]
    eh = (pe - ps).T  # heliocentric earth (sun at t; fine)
    em = np.sqrt((eh * eh).sum(axis=1))
    e = eh / em[:, None]
    if not deflect:
        pass
    elif body != "Sun" and body != "Moon":
        # Sun position at retarded time for q
        ps_r, _ = _bary([(0, 10)], jd - tau)
        ps_r = (ps_r / AU_KM).T
        qv = pb.T - ps_r
        qn = np.sqrt((qv * qv).sum(axis=1))
        q = qv / qn[:, None]
        p = erfa.ld(1.0, p, q, e, em, 1e-9)
    elif body == "Moon":
        qv = pb.T - ps.T
        qn = np.sqrt((qv * qv).sum(axis=1))
        q = qv / qn[:, None]
        p = erfa.ld(1.0, p, q, e, em, 1e-9)
    v = ve.T / C_AUD
    vv = (v * v).sum(axis=1)
    bm1 = np.sqrt(1.0 - vv)
    pab = erfa.ab(p, v, em, bm1)
    return pab, dist


def true_obliquity(tt):
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    eps0 = erfa.obl06(J2000, tt)
    dpsi, deps = erfa.nut06a(J2000, tt)
    return eps0 + deps, dpsi, deps, eps0


def to_ecliptic_of_date(pgcrs, tt):
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    rbpn = erfa.pnm06a(J2000, tt)  # (n,3,3)
    ptod = np.einsum("nij,nj->ni", rbpn, pgcrs)
    eps, *_ = true_obliquity(tt)
    ce, se = np.cos(eps), np.sin(eps)
    x = ptod[:, 0]
    y = ptod[:, 1] * ce + ptod[:, 2] * se
    z = -ptod[:, 1] * se + ptod[:, 2] * ce
    lon = np.degrees(np.arctan2(y, x)) % 360.0
    lat = np.degrees(np.arctan2(z, np.hypot(x, y)))
    return lon, lat


def apparent_lonlat(body, tt, deflect=True):
    p, dist = apparent_gcrs(body, tt, deflect)
    lon, lat = to_ecliptic_of_date(p, tt)
    return lon, lat, dist


def apparent_speed(body, tt, h=1.0 / 1440.0, deflect=True):
    """deg/day, central difference over +-h days (default 1 min)."""
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    l1, _, _ = apparent_lonlat(body, tt - h, deflect)
    l2, _, _ = apparent_lonlat(body, tt + h, deflect)
    d = (l2 - l1 + 540.0) % 360.0 - 180.0
    return d / (2 * h)


def true_node(tt):
    """Longitude of the ascending node of the osculating geocentric lunar orbit
    (geometric Moon state at tt, rotated by the static GCRS->true ecliptic of date
    rotation; inertial velocity), degrees."""
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    tdb = tt_to_tdb_days(tt)
    jd = tdb
    pm, vm = _bary([(3, 301)], jd)
    pe, ve = _bary([(3, 399)], jd)
    r = (pm - pe).T
    v = (vm - ve).T
    rbpn = erfa.pnm06a(J2000, tt)
    eps, *_ = true_obliquity(tt)
    ce, se = np.cos(eps), np.sin(eps)
    def rot(a):
        b = np.einsum("nij,nj->ni", rbpn, a)
        return np.stack([b[:, 0], b[:, 1] * ce + b[:, 2] * se, -b[:, 1] * se + b[:, 2] * ce], axis=1)
    r2, v2 = rot(r), rot(v)
    h = np.cross(r2, v2)
    return np.degrees(np.arctan2(h[:, 0], -h[:, 1])) % 360.0


def gast_and_eps(ut1, tt):
    """ut1, tt: days from J2000 on each scale. Returns GAST (rad) and true obliquity (rad)."""
    ut1 = np.atleast_1d(np.asarray(ut1, dtype=float))
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    g = erfa.gst06a(J2000, ut1, J2000, tt)
    eps, *_ = true_obliquity(tt)
    return g, eps


# ---------------- houses (independent closed forms; Swiss/standard definitions) ----------------
D = np.pi / 180.0


def asc1(x, f, eps):
    """Ecliptic longitude (deg) rising at 'x' (= ARMC + 90 for the ascendant) for pole height f (deg)."""
    x = np.radians(x); f = np.radians(f)
    return np.degrees(np.arctan2(np.sin(x), np.cos(eps) * np.cos(x) - np.sin(eps) * np.tan(f))) % 360.0


def ra_to_lon(a, eps):
    a = np.radians(a)
    return np.degrees(np.arctan2(np.sin(a), np.cos(a) * np.cos(eps))) % 360.0


def houses_ref(armc, lat, eps, system):
    """armc deg, lat deg, eps rad (true obliquity). Returns 12 cusps (deg) as a list, plus angles."""
    th = armc
    asc = asc1(th + 90, lat, eps)
    mc = ra_to_lon(th, eps)
    tanfi = np.tan(np.radians(lat))
    cusps = [None] * 13
    if system in ("placidus",):
        def plac(f, above):
            # above: cusps 11,12 measured from MC with fraction f of diurnal semi-arc
            ra = th + f * 90 if above else th + 180 - f * 90
            for _ in range(200):
                lam = ra_to_lon(ra, eps)
                dec = np.arcsin(np.sin(eps) * np.sin(np.radians(lam)))
                ad = np.degrees(np.arcsin(np.clip(tanfi * np.tan(dec), -1, 1)))
                if above:
                    new = th + f * (90 + ad)
                else:
                    new = th + 180 - f * (90 - ad)
                if abs(((new - ra + 540) % 360) - 180) < 1e-12:
                    ra = new; break
                ra = new
            return ra_to_lon(ra, eps)
        cusps[11] = plac(1 / 3, True); cusps[12] = plac(2 / 3, True)
        cusps[2] = plac(2 / 3, False); cusps[3] = plac(1 / 3, False)
    elif system == "koch":
        sd = np.sin(eps) * np.sin(np.radians(mc))  # sin dec of MC
        ad3 = np.degrees(np.arcsin(np.clip(tanfi * sd / np.sqrt(1 - sd * sd), -1, 1))) / 3
        cusps[11] = asc1(th + 30 - 2 * ad3, lat, eps); cusps[12] = asc1(th + 60 - ad3, lat, eps)
        cusps[2] = asc1(th + 120 + ad3, lat, eps); cusps[3] = asc1(th + 150 + 2 * ad3, lat, eps)
    elif system == "regiomontanus":
        f1 = np.degrees(np.arctan(tanfi * 0.5)); f2 = np.degrees(np.arctan(tanfi * np.cos(np.radians(30))))
        cusps[11] = asc1(th + 30, f1, eps); cusps[12] = asc1(th + 60, f2, eps)
        cusps[2] = asc1(th + 120, f2, eps); cusps[3] = asc1(th + 150, f1, eps)
    elif system == "topocentric":
        f1 = np.degrees(np.arctan(tanfi / 3)); f2 = np.degrees(np.arctan(tanfi * 2 / 3))
        cusps[11] = asc1(th + 30, f1, eps); cusps[12] = asc1(th + 60, f2, eps)
        cusps[2] = asc1(th + 120, f2, eps); cusps[3] = asc1(th + 150, f1, eps)
    elif system == "campanus":
        sf = np.sin(np.radians(lat)); cf = np.cos(np.radians(lat))
        fh1 = np.degrees(np.arcsin(sf / 2)); fh2 = np.degrees(np.arcsin(np.sqrt(3) / 2 * sf))
        xh1 = np.degrees(np.arctan(np.sqrt(3) / cf)); xh2 = np.degrees(np.arctan(1 / np.sqrt(3) / cf))
        cusps[11] = asc1(th + 90 - xh1, fh1, eps); cusps[12] = asc1(th + 90 - xh2, fh2, eps)
        cusps[2] = asc1(th + 90 + xh2, fh2, eps); cusps[3] = asc1(th + 90 + xh1, fh1, eps)
    elif system == "alcabitius":
        dek = np.arcsin(np.sin(np.radians(asc)) * np.sin(eps))
        sda = np.degrees(np.arccos(np.clip(-tanfi * np.tan(dek), -1, 1)))
        sna = 180 - sda; sd3 = sda / 3; sn3 = sna / 3
        cusps[11] = asc1(th + sd3, 0, eps); cusps[12] = asc1(th + 2 * sd3, 0, eps)
        cusps[2] = asc1(th + 180 - 2 * sn3, 0, eps); cusps[3] = asc1(th + 180 - sn3, 0, eps)
    elif system == "porphyry":
        q = (asc - mc) % 360  # MC -> ASC arc
        cusps[11] = (mc + q / 3) % 360; cusps[12] = (mc + 2 * q / 3) % 360
        r = (mc + 180 - asc) % 360  # ASC -> IC
        cusps[2] = (asc + r / 3) % 360; cusps[3] = (asc + 2 * r / 3) % 360
    if system in ("placidus", "koch", "regiomontanus", "topocentric", "campanus", "alcabitius", "porphyry"):
        cusps[1] = asc; cusps[10] = mc
        cusps[4] = (mc + 180) % 360; cusps[7] = (asc + 180) % 360
        for i, j in ((5, 11), (6, 12), (8, 2), (9, 3)):
            cusps[i] = (cusps[j] + 180) % 360
        return cusps[1:]
    if system == "equal":
        return [(asc + 30 * i) % 360 for i in range(12)]
    if system == "vehlow":
        return [(asc - 15 + 30 * i) % 360 for i in range(12)]
    if system == "whole":
        return [(np.floor(asc / 30) * 30 + 30 * i) % 360 for i in range(12)]
    if system == "equal-mc":
        return [(mc + 30 * (i - 9)) % 360 for i in range(12)]
    if system == "meridian":
        return [ra_to_lon(th + 30 * (i - 9), eps) for i in range(12)]
    if system == "morinus":
        out = []
        for i in range(12):
            a = np.radians(th + 30 * (i - 9))
            out.append(np.degrees(np.arctan2(np.sin(a) * np.cos(eps), np.cos(a))) % 360)
        return out
    raise ValueError(system)


def angles_ref(armc, lat, eps):
    asc = asc1(armc + 90, lat, eps)
    mc = ra_to_lon(armc, eps)
    f = 90 - lat if lat >= 0 else -90 - lat
    vertex = asc1(armc - 90, f, eps)
    if abs(lat) <= np.degrees(eps):  # Swiss: keep the vertex in the western hemisphere at tropical latitudes
        if ((vertex - mc + 540) % 360) - 180 > 0:
            vertex = (vertex + 180) % 360
    east = asc1(armc + 90, 0, eps)
    return asc, mc, vertex, east


def mean_points(tt):
    """Mean node and mean apogee (Lilith) on the true equinox of date, from ERFA fundamental
    arguments (IERS 2003 / Simon et al. 1994) + nut06a dpsi. Returns (node_lon, lilith_lon, lilith_lat) deg."""
    tt = np.atleast_1d(np.asarray(tt, dtype=float))
    T = tt / 36525.0
    om = np.array([erfa.faom03(x) for x in T])
    F = np.array([erfa.faf03(x) for x in T])
    l = np.array([erfa.fal03(x) for x in T])
    dpsi, _ = erfa.nut06a(J2000, tt)
    node = np.degrees(om + dpsi) % 360
    u = F - l + np.pi  # argument of latitude of the apogee: (F + om - l + pi) - om
    inc = np.radians(5.1453964)
    lam = om + np.arctan2(np.cos(inc) * np.sin(u), np.cos(u)) + dpsi
    bet = np.arcsin(np.sin(inc) * np.sin(u))
    return node, np.degrees(lam) % 360, np.degrees(bet)
