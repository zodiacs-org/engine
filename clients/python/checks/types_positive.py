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
