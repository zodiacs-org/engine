Skyfield 1.55 uses NAIF's DE440s kernel. The adapter checks SHA-256
`c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`
before loading the local file. This kernel covers JD 2396752.5 to 2506352.5
(TDB), including the last L1 instant in 2148. [Engine licence (MIT)](https://github.com/skyfielders/python-skyfield/blob/1.55/LICENSE).

For L1, `tt_jd` reads the supplied TT. From Earth's centre,
`observe(target).apparent().frame_latlon(ecliptic_frame)` gives latitude and
longitude in the true ecliptic and equinox of date. Mercury and Venus use their
centres. Mars through Pluto use system barycentres. The adapter measures L1
only. All 240 positions pass, including the Moon in 1851 (`L1-POS-0002`).
