from zodiacs_compute import ComputeClient
client = ComputeClient()
client.chart({"latitude": 1.0, "longitude": 2.0})  # E
client.chart({"utc": "2000-01-01T12:00:00Z", "local": {"date": "2000-01-01", "time": "12:00", "zone": "UTC"}, "latitude": 1.0, "longitude": 2.0})  # E
client.positions({"instants": ["2000-01-01T12:00:00Z"], "bodies": ["Invented body"]})  # E
client.positions({"instants": ["2000-01-01T12:00:00Z"], "latitude": 1.0})  # E
client.call("unknown", {})  # E
client.sky_fact({"kind": "sign", "body": "Moon", "sign": "aries", "instant": "2000-01-01T12:00:00Z", "date": "2000-01-01"})  # E
client.sky_fact({"kind": "retrograde", "body": "Mercury", "instant": "2000-01-01T12:00:00Z", "zone": "Europe/Paris"})  # E
client.sky_fact({"kind": "sign", "body": "Moon", "sign": "aries"})  # E
