from zodiacs_compute import AsyncComputeClient, ComputeClient, contract as C
async def check(client: AsyncComputeClient) -> str:
    result: C.PositionsResponse = await client.positions({"instants": ["2000-01-01T12:00:00Z"], "bodies": ["Sun", "Moon"]})
    await client.chart({"utc": "2000-01-01T12:00:00Z", "latitude": 51.4779, "longitude": -0.0015})
    await client.chart({"local": {"date": "1990-06-15", "time": "14:30", "zone": "Europe/Paris"}, "latitude": 48.8566, "longitude": 2.3522})
    await client.houses({"utc": "2000-01-01T12:00:00Z", "latitude": 51.4779, "longitude": -0.0015})
    await client.events({"from": "2000-01-01T00:00:00Z", "to": "2000-01-02T00:00:00Z"})
    await client.time({"local": {"date": "1990-06-15", "time": "14:30", "zone": "Europe/Paris"}})
    await client.sky_fact({"kind": "sign", "body": "Moon", "sign": "aries", "instant": "2000-01-01T12:00:00Z"})
    await client.sky_fact({"kind": "retrograde", "body": "Mercury", "date": "2000-01-01", "zone": "Europe/Paris"})
    await client.elections({"from": "2000-01-01T00:00:00Z", "to": "2000-01-02T00:00:00Z", "conditions": [{"kind": "phase", "phase": "waxing"}]})
    return result["backend"]["version"]
def check_sync(client: ComputeClient) -> str:
    return client.call("positions", {"instants": ["2000-01-01T12:00:00Z"]})["backend"]["version"]

# TABLE_END in scripts/continuous-utc-instants.mjs is 2027-10-02T00:00:00.000Z.
# That UTC instant keeps the iers basis. The synthetic 2030 result uses
# continuous UTC and puts TT 69.184 s ahead of UTC.
AT_TABLE_END: C.TimeScale = {
    "input": "utc",
    "basis": "iers",
    "ut1MinusUtc": {"seconds": -0.148, "sigma": 0.0262, "source": "predicted"},
    "leapSeconds": {"taiMinusUtc": 37, "listed": False},
}
CONTINUOUS_UTC: C.TimeResult = {
    "utc": "2030-01-01T00:00:00.000Z",
    "offsetMinutes": 0,
    "flags": [],
    "localMeanTime": None,
    "zoneHistory": "runtime",
    "zoneUncertain": False,
    "tt": "2030-01-01T00:01:09.184",
    "deltaT": {
        "seconds": 69.602296295502,
        "sigma": 0.710146195012318,
        "model": "zodiacs-deltat/1",
        "table": "2026-09-24",
        "tableDigest": "6371988c510a1c6c",
        "segment": "extrapolated",
    },
    "timeScale": {
        "input": "utc",
        "basis": "continuous-utc",
        "ut1MinusUtc": {"seconds": -0.4182962955020031, "sigma": 0.710146195012318, "source": "model"},
        "leapSeconds": {"taiMinusUtc": 37, "listed": False},
    },
}
