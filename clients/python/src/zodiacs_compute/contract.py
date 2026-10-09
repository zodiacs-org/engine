# Generated from the verified Compute contract; run scripts/generate-contract.mjs.
from typing import Literal, NotRequired, Required, TypeAlias, TypedDict, Union

PlaceInstantRequest_Option1 = TypedDict("PlaceInstantRequest_Option1", {"utc": Required["Instant"], "latitude": Required["Latitude"], "longitude": Required["Longitude"], "houseSystem": NotRequired["HouseSystem"]}, total=False)

PlaceInstantRequest_Option2 = TypedDict("PlaceInstantRequest_Option2", {"local": Required["LocalTime"], "latitude": Required["Latitude"], "longitude": Required["Longitude"], "houseSystem": NotRequired["HouseSystem"]}, total=False)

LocalTime = TypedDict("LocalTime", {"date": Required[str], "time": Required[str], "zone": Required[str]}, total=False)

ChartResponse = TypedDict("ChartResponse", {"schema": Required[Literal["zodiacs.compute-api.chart.v1"]], "result": Required["ChartResult"], "receipt": Required["CalculationReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

ChartResult = TypedDict("ChartResult", {"instant": Required[str], "local": Required[Union["LocalResolution", None]], "bodies": Required[list["BodyPosition"]], "angles": Required[Union["Angles", None]], "houses": Required[Union["Houses", None]], "aspects": Required[list["Aspect"]], "flags": Required[list["ChartFlag"]], "deltaT": Required["DeltaT"], "timeScale": Required["TimeScale"]}, total=False)

LocalResolution_localMeanTime_Option0 = TypedDict("LocalResolution_localMeanTime_Option0", {"longitude": Required[float], "zoneOffsetMinutes": Required[float]}, total=False)

LocalResolution = TypedDict("LocalResolution", {"offsetMinutes": Required[float], "flags": Required[list[Literal["dst-gap", "dst-fold", "lmt"]]], "localMeanTime": Required[Union["LocalResolution_localMeanTime_Option0", None]], "zoneHistory": Required[Literal["pinned", "runtime"]], "zoneUncertain": Required[bool]}, total=False)

BodyPosition = TypedDict("BodyPosition", {"body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]], "lon": Required[float], "lat": Required[float], "speed": Required[float], "retrograde": Required[bool], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float]}, total=False)

Angles = TypedDict("Angles", {"asc": Required[float], "mc": Required[float], "dsc": Required[float], "ic": Required[float]}, total=False)

Houses = TypedDict("Houses", {"system": Required["HouseSystem"], "cusps": Required[list[float]]}, total=False)

Aspect = TypedDict("Aspect", {"a": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]], "b": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]], "type": Required[Literal["conjunction", "sextile", "square", "trine", "opposition"]], "orb": Required[float], "applying": Required[bool]}, total=False)

DeltaT = TypedDict("DeltaT", {"seconds": Required[float], "sigma": Required[float], "model": Required[Literal["iers-utc/1", "zodiacs-deltat/1"]], "table": Required[str], "tableDigest": Required[str], "segment": Required[Literal["long-term", "reconstructed", "observed", "predicted", "extrapolated"]]}, total=False)

TimeScale_ut1MinusUtc_Option0 = TypedDict("TimeScale_ut1MinusUtc_Option0", {"seconds": Required[float], "sigma": Required[float], "source": Required[Literal["observed", "predicted", "fallback"]]}, total=False)

TimeScale_leapSeconds_Option0 = TypedDict("TimeScale_leapSeconds_Option0", {"taiMinusUtc": Required[float], "listed": Required[bool]}, total=False)

TimeScale = TypedDict("TimeScale", {"input": Required[Literal["utc"]], "basis": Required[Literal["iers", "delta-t"]], "ut1MinusUtc": Required[Union["TimeScale_ut1MinusUtc_Option0", None]], "leapSeconds": Required[Union["TimeScale_leapSeconds_Option0", None]]}, total=False)

CalculationReceipt_coordinates_Option0 = TypedDict("CalculationReceipt_coordinates_Option0", {"latitude": Required[float], "longitude": Required[float]}, total=False)

CalculationReceipt = TypedDict("CalculationReceipt", {"schema": Required[Literal["zodiacs.calculation-receipt.draft-v1"]], "instant": Required[str], "sourceInstant": NotRequired[Union[str, None]], "timeKnown": Required[bool], "reference": Required[Literal["supplied-instant", "utc-noon", "local-noon"]], "localResolution": Required[Union[dict[str, object], None]], "coordinates": Required[Union["CalculationReceipt_coordinates_Option0", None]], "houses": Required[dict[str, object]], "inputFlags": Required[list["ChartFlag"]], "resultFlags": Required[list["ChartFlag"]], "engine": Required["Backend"], "provenance": Required[Union[dict[str, object], None]], "conventions": Required[dict[str, str]], "coverage": Required[dict[str, str]]}, total=False)

Backend_ephemeris = TypedDict("Backend_ephemeris", {"name": Required[Literal["astronomy-engine"]], "version": Required[str]}, total=False)

Backend = TypedDict("Backend", {"name": Required[Literal["@zodiacs/engine"]], "version": Required[str], "ephemeris": Required["Backend_ephemeris"]}, total=False)

Cite = TypedDict("Cite", {"url": Required[str], "receipt": Required[str], "engine": Required[Literal["@zodiacs/engine"]], "version": Required[str]}, total=False)

ErrorResponse_error = TypedDict("ErrorResponse_error", {"code": Required[Literal["not-found", "method-not-allowed", "disabled", "rate-limited", "rate-limit-unavailable", "unsupported-media-type", "payload-too-large", "invalid-json", "invalid-request", "budget-exhausted", "calculation-failed"]], "message": Required[str], "pointer": NotRequired[str], "limit": NotRequired[str], "max": NotRequired[int], "retryAfterSeconds": NotRequired[int]}, total=False)

ErrorResponse = TypedDict("ErrorResponse", {"error": Required["ErrorResponse_error"]}, total=False)

PositionsRequest = TypedDict("PositionsRequest", {"instants": Required[list["Instant"]], "bodies": NotRequired[list[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto", "North Node", "South Node"]]]}, total=False)

PositionsResponse = TypedDict("PositionsResponse", {"schema": Required[Literal["zodiacs.compute-api.positions.v1"]], "result": Required["PositionsResult"], "receipt": Required["ComputeReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

PositionsResult_instants_Item = TypedDict("PositionsResult_instants_Item", {"instant": Required[str], "bodies": Required[list["BodyPosition"]], "deltaT": Required["DeltaT"], "timeScale": Required["TimeScale"], "flags": Required[list[Literal["outside-reference-span"]]]}, total=False)

PositionsResult = TypedDict("PositionsResult", {"instants": Required[list["PositionsResult_instants_Item"]]}, total=False)

ComputeReceipt_referenceSpan = TypedDict("ComputeReceipt_referenceSpan", {"from": Required[str], "to": Required[str]}, total=False)

ComputeReceipt_deltaT_Item0 = TypedDict("ComputeReceipt_deltaT_Item0", {"model": Required[Literal["iers-utc/1"]], "table": Required[str], "tableDigest": Required[str]}, total=False)

ComputeReceipt_deltaT_Item1 = TypedDict("ComputeReceipt_deltaT_Item1", {"model": Required[Literal["zodiacs-deltat/1"]], "table": Required[str], "tableDigest": Required[str]}, total=False)

ComputeReceipt_timeResolution_policy = TypedDict("ComputeReceipt_timeResolution_policy", {"fold": NotRequired[Literal["earlier"]], "gap": NotRequired[Literal["shift-forward"]]}, total=False)

ComputeReceipt_timeResolution = TypedDict("ComputeReceipt_timeResolution", {"resolver": Required[str], "policy": Required["ComputeReceipt_timeResolution_policy"], "pinnedTzdb": Required[dict[str, object]], "runtimeTzdb": Required[Union[str, None]]}, total=False)

ComputeReceipt_search = TypedDict("ComputeReceipt_search", {"solver": Required[Literal["engine-longitude-crossings"]], "stepDays": Required[dict[str, float]], "bisections": Required[int], "samples": Required[int], "maxSamples": Required[int], "window": Required[Literal["start-exclusive-end-inclusive"]], "completeness": Required[Literal["tested-not-proven"]]}, total=False)

ComputeReceipt_electionSearch_voidOfCourse = TypedDict("ComputeReceipt_electionSearch_voidOfCourse", {"convention": Required[Literal["last-exact-ptolemaic-aspect-to-sign-exit"]], "bodies": Required[Literal["modern"]], "scanHours": Required[float]}, total=False)

ComputeReceipt_electionSearch = TypedDict("ComputeReceipt_electionSearch", {"solver": Required[Literal["engine-longitude-crossings-and-sampled-houses"]], "stepDays": Required[dict[str, float]], "voidOfCourse": Required["ComputeReceipt_electionSearch_voidOfCourse"], "houseSampleMinutes": Required[Literal[60]], "boundarySeconds": Required[Literal[1]], "resolutionSeconds": Required[Literal[2]], "fullCalculationCost": Required[Literal[25]], "samples": Required[int], "maxSamples": Required[int], "window": Required[Literal["start-inclusive-end-exclusive"]], "completeness": Required[Literal["tested-not-proven"]]}, total=False)

ComputeReceipt = TypedDict("ComputeReceipt", {"schema": Required[Literal["zodiacs.compute-receipt.v1"]], "endpoint": Required[Literal["chart", "positions", "houses", "events", "time", "sky-fact", "elections"]], "engine": Required["Backend"], "conventions": Required[dict[str, str]], "coverage": Required[dict[str, str]], "referenceSpan": Required["ComputeReceipt_referenceSpan"], "deltaT": Required[list[Union["ComputeReceipt_deltaT_Item0", "ComputeReceipt_deltaT_Item1"]]], "timeResolution": NotRequired["ComputeReceipt_timeResolution"], "search": NotRequired["ComputeReceipt_search"], "electionSearch": NotRequired["ComputeReceipt_electionSearch"]}, total=False)

HousesResponse = TypedDict("HousesResponse", {"schema": Required[Literal["zodiacs.compute-api.houses.v1"]], "result": Required["HousesResult"], "receipt": Required["CalculationReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

HousesResult = TypedDict("HousesResult", {"instant": Required[str], "local": Required[Union["LocalResolution", None]], "angles": Required[Union["Angles", None]], "houses": Required[Union["Houses", None]], "flags": Required[list["ChartFlag"]], "deltaT": Required["DeltaT"], "timeScale": Required["TimeScale"]}, total=False)

EventsRequest = TypedDict("EventsRequest", {"from": Required["Instant"], "to": Required["Instant"], "bodies": NotRequired[list[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]]], "kinds": NotRequired[list[Literal["ingress", "station", "lunation"]]]}, total=False)

EventsResponse = TypedDict("EventsResponse", {"schema": Required[Literal["zodiacs.compute-api.events.v1"]], "result": Required["EventsResult"], "receipt": Required["ComputeReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

EventsResult_events_Item_Option0 = TypedDict("EventsResult_events_Item_Option0", {"kind": Required[Literal["ingress"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "at": Required[str], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "retrograde": Required[bool]}, total=False)

EventsResult_events_Item_Option1 = TypedDict("EventsResult_events_Item_Option1", {"kind": Required[Literal["station"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "at": Required[str], "type": Required[Literal["retrograde", "direct"]], "lon": Required[float], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float]}, total=False)

EventsResult_events_Item_Option2 = TypedDict("EventsResult_events_Item_Option2", {"kind": Required[Literal["lunation"]], "type": Required[Literal["new", "full"]], "at": Required[str], "lon": Required[float], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float]}, total=False)

EventsResult = TypedDict("EventsResult", {"from": Required[str], "to": Required[str], "events": Required[list[Union["EventsResult_events_Item_Option0", "EventsResult_events_Item_Option1", "EventsResult_events_Item_Option2"]]]}, total=False)

TimeRequest = TypedDict("TimeRequest", {"local": Required["LocalTime"], "longitude": NotRequired["Longitude"]}, total=False)

TimeResponse = TypedDict("TimeResponse", {"schema": Required[Literal["zodiacs.compute-api.time.v1"]], "result": Required["TimeResult"], "receipt": Required["ComputeReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

TimeResult_localMeanTime_Option0 = TypedDict("TimeResult_localMeanTime_Option0", {"longitude": Required[float], "zoneOffsetMinutes": Required[float]}, total=False)

TimeResult = TypedDict("TimeResult", {"utc": Required[str], "offsetMinutes": Required[float], "flags": Required[list[Literal["dst-gap", "dst-fold", "lmt", "outside-reference-span"]]], "localMeanTime": Required[Union["TimeResult_localMeanTime_Option0", None]], "zoneHistory": Required[Literal["pinned", "runtime"]], "zoneUncertain": Required[bool], "tt": Required[str], "deltaT": Required["DeltaT"], "timeScale": Required["TimeScale"]}, total=False)

SignFact_Option1 = TypedDict("SignFact_Option1", {"kind": Required[Literal["sign"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "instant": Required["Instant"]}, total=False)

SignFact_Option2 = TypedDict("SignFact_Option2", {"kind": Required[Literal["sign"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "date": Required[str], "zone": NotRequired[str]}, total=False)

RetrogradeFact_Option1 = TypedDict("RetrogradeFact_Option1", {"kind": Required[Literal["retrograde"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "instant": Required["Instant"]}, total=False)

RetrogradeFact_Option2 = TypedDict("RetrogradeFact_Option2", {"kind": Required[Literal["retrograde"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "date": Required[str], "zone": NotRequired[str]}, total=False)

IngressFact = TypedDict("IngressFact", {"kind": Required[Literal["ingress"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "date": Required[str], "zone": NotRequired[str]}, total=False)

PhaseFact = TypedDict("PhaseFact", {"kind": Required[Literal["phase"]], "phase": Required[Literal["new", "first-quarter", "full", "last-quarter"]], "date": Required[str], "zone": NotRequired[str]}, total=False)

SkyFactResponse = TypedDict("SkyFactResponse", {"schema": Required[Literal["zodiacs.compute-api.sky-fact.v1"]], "result": Required["SkyFactResult"], "receipt": Required["ComputeReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

SkyFactResult_window_Option0 = TypedDict("SkyFactResult_window_Option0", {"from": Required[str], "to": Required[str]}, total=False)

SkyFactResult_zone_Option0 = TypedDict("SkyFactResult_zone_Option0", {"start": Required["ZoneEdge"], "end": Required["ZoneEdge"]}, total=False)

SkyFactResult_facts_Option0 = TypedDict("SkyFactResult_facts_Option0", {"lon": Required[float], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float], "speed": Required[float], "retrograde": Required[bool], "deltaT": Required["DeltaT"], "timeScale": Required["TimeScale"], "boundaryMarginArcsec": NotRequired[float], "flags": Required[list[Literal["outside-reference-span"]]]}, total=False)

SkyFactResult_facts_Option1_changes_Item = TypedDict("SkyFactResult_facts_Option1_changes_Item", {"at": Required[str], "into": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "retrograde": Required[bool]}, total=False)

SkyFactResult_facts_Option1 = TypedDict("SkyFactResult_facts_Option1", {"atStart": Required["BodyState"], "atEnd": Required["BodyState"], "flags": Required[list[Literal["outside-reference-span"]]], "changes": Required[list["SkyFactResult_facts_Option1_changes_Item"]]}, total=False)

SkyFactResult_facts_Option2_stations_Item = TypedDict("SkyFactResult_facts_Option2_stations_Item", {"at": Required[str], "type": Required[Literal["retrograde", "direct"]]}, total=False)

SkyFactResult_facts_Option2 = TypedDict("SkyFactResult_facts_Option2", {"atStart": Required["BodyState"], "atEnd": Required["BodyState"], "flags": Required[list[Literal["outside-reference-span"]]], "stations": Required[list["SkyFactResult_facts_Option2_stations_Item"]]}, total=False)

SkyFactResult_facts_Option3_ingresses_Item = TypedDict("SkyFactResult_facts_Option3_ingresses_Item", {"at": Required[str], "retrograde": Required[bool]}, total=False)

SkyFactResult_facts_Option3 = TypedDict("SkyFactResult_facts_Option3", {"ingresses": Required[list["SkyFactResult_facts_Option3_ingresses_Item"]], "flags": Required[list[Literal["outside-reference-span"]]]}, total=False)

SkyFactResult_facts_Option4_lunations_Item = TypedDict("SkyFactResult_facts_Option4_lunations_Item", {"at": Required[str], "lon": Required[float], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float]}, total=False)

SkyFactResult_facts_Option4 = TypedDict("SkyFactResult_facts_Option4", {"lunations": Required[list["SkyFactResult_facts_Option4_lunations_Item"]], "flags": Required[list[Literal["outside-reference-span"]]]}, total=False)

SkyFactResult = TypedDict("SkyFactResult", {"answer": Required[Literal["true", "false", "depends"]], "basis": Required[Literal["instant", "local-day", "any-zone-day"]], "fact": Required["SkyFactEcho"], "instant": Required[Union[str, None]], "window": Required[Union["SkyFactResult_window_Option0", None]], "zone": Required[Union["SkyFactResult_zone_Option0", None]], "facts": Required[Union["SkyFactResult_facts_Option0", "SkyFactResult_facts_Option1", "SkyFactResult_facts_Option2", "SkyFactResult_facts_Option3", "SkyFactResult_facts_Option4"]]}, total=False)

SkyFactEcho = TypedDict("SkyFactEcho", {"kind": Required[Literal["sign", "retrograde", "ingress", "phase"]], "body": NotRequired[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": NotRequired[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "phase": NotRequired[Literal["new", "first-quarter", "full", "last-quarter"]], "instant": NotRequired[Union[str, None]], "date": Required[Union[str, None]], "zone": Required[Union[str, None]]}, total=False)

ZoneEdge_localMeanTime_Option0 = TypedDict("ZoneEdge_localMeanTime_Option0", {"longitude": Required[float], "zoneOffsetMinutes": Required[float]}, total=False)

ZoneEdge = TypedDict("ZoneEdge", {"offsetMinutes": Required[float], "flags": Required[list[Literal["dst-gap", "dst-fold", "lmt"]]], "localMeanTime": Required[Union["ZoneEdge_localMeanTime_Option0", None]], "zoneHistory": Required[Literal["pinned", "runtime"]], "zoneUncertain": Required[bool], "utc": Required[str]}, total=False)

BodyState = TypedDict("BodyState", {"lon": Required[float], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "degree": Required[float], "speed": Required[float], "retrograde": Required[bool]}, total=False)

ElectionsRequest = TypedDict("ElectionsRequest", {"from": Required["Instant"], "to": Required["Instant"], "conditions": Required[list["ElectionCondition"]], "place": NotRequired["ElectionPlace"]}, total=False)

PhaseCondition = TypedDict("PhaseCondition", {"kind": Required[Literal["phase"]], "phase": Required[Literal["waxing", "waning"]], "not": NotRequired[bool]}, total=False)

VoidOfCourseCondition = TypedDict("VoidOfCourseCondition", {"kind": Required[Literal["void-of-course"]], "not": NotRequired[bool]}, total=False)

SignCondition = TypedDict("SignCondition", {"kind": Required[Literal["sign"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": Required[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "not": NotRequired[bool]}, total=False)

RetrogradeCondition = TypedDict("RetrogradeCondition", {"kind": Required[Literal["retrograde"]], "body": Required[Literal["Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "not": NotRequired[bool]}, total=False)

AngularCondition = TypedDict("AngularCondition", {"kind": Required[Literal["angular"]], "body": Required[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "not": NotRequired[bool]}, total=False)

ElectionPlace = TypedDict("ElectionPlace", {"latitude": Required[float], "longitude": Required["Longitude"], "houseSystem": NotRequired["HouseSystem"]}, total=False)

ElectionsResponse = TypedDict("ElectionsResponse", {"schema": Required[Literal["zodiacs.compute-api.elections.v1"]], "result": Required["ElectionsResult"], "receipt": Required["ComputeReceipt"], "backend": Required["Backend"], "cite": Required["Cite"]}, total=False)

ElectionsResult_conditions_Item = TypedDict("ElectionsResult_conditions_Item", {"kind": Required[Literal["phase", "void-of-course", "sign", "retrograde", "angular"]], "phase": NotRequired[Literal["waxing", "waning"]], "body": NotRequired[Literal["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]], "sign": NotRequired[Literal["aries", "taurus", "gemini", "cancer", "leo", "virgo", "libra", "scorpio", "sagittarius", "capricorn", "aquarius", "pisces"]], "not": Required[bool]}, total=False)

ElectionsResult_place_Option0 = TypedDict("ElectionsResult_place_Option0", {"latitude": Required[float], "longitude": Required[float], "houseSystem": Required["HouseSystem"]}, total=False)

ElectionsResult_windows_Item = TypedDict("ElectionsResult_windows_Item", {"from": Required[str], "to": Required[str]}, total=False)

ElectionsResult = TypedDict("ElectionsResult", {"from": Required[str], "to": Required[str], "conditions": Required[list["ElectionsResult_conditions_Item"]], "place": Required[Union["ElectionsResult_place_Option0", None]], "windows": Required[list["ElectionsResult_windows_Item"]], "flags": Required[list[Literal["outside-reference-span"]]]}, total=False)

PlaceInstantRequest : TypeAlias = Union["PlaceInstantRequest_Option1", "PlaceInstantRequest_Option2"]
Instant : TypeAlias = str
Latitude : TypeAlias = float
Longitude : TypeAlias = float
HouseSystem : TypeAlias = Literal["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"]
ChartFlag : TypeAlias = Literal["dst-gap", "dst-fold", "lmt", "no-time", "polar-fallback", "outside-reference-span"]
SkyFactRequest : TypeAlias = Union["SignFact", "RetrogradeFact", "IngressFact", "PhaseFact"]
SignFact : TypeAlias = Union["SignFact_Option1", "SignFact_Option2"]
RetrogradeFact : TypeAlias = Union["RetrogradeFact_Option1", "RetrogradeFact_Option2"]
ElectionCondition : TypeAlias = Union["PhaseCondition", "VoidOfCourseCondition", "SignCondition", "RetrogradeCondition", "AngularCondition"]

RESPONSE_SCHEMAS: dict[str, str] = {"chart":"zodiacs.compute-api.chart.v1","positions":"zodiacs.compute-api.positions.v1","houses":"zodiacs.compute-api.houses.v1","events":"zodiacs.compute-api.events.v1","time":"zodiacs.compute-api.time.v1","sky-fact":"zodiacs.compute-api.sky-fact.v1","elections":"zodiacs.compute-api.elections.v1"}
