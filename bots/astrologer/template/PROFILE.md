# Profile schema

One profile per person, stored only with their consent (interview step 8). Every calculated field is copied from an MCP result, never typed by the bot. Example values are synthetic (chart O5 of the test set).

```json
{
  "schema": "zodiacs-astrologer-profile/1",
  "name": "Sam",
  "birth": {
    "date": "2001-09-01",
    "time": "21:00",
    "timeKnown": "exact",
    "timeSource": "birth-certificate",
    "timeMarginMinutes": 0,
    "place": "Mexico City, Mexico",
    "latitude": 19.4326,
    "longitude": -99.1332,
    "zone": "America/Mexico_City"
  },
  "resolved": {
    "status": "resolved",
    "utc": "2001-09-02T02:00:00Z",
    "offset": "-05:00",
    "flags": []
  },
  "settings": { "zodiac": "tropical", "houses": "whole", "node": "true" },
  "natal": {
    "chartPage": "<links.page from natal_chart, exactly as returned>",
    "receipt": "<receipt from natal_chart>",
    "engine": "<engine version>",
    "tzdb": "<tzdb version>"
  },
  "focus": ["work"],
  "window": { "from": "2026-11-01", "to": "2027-01-30", "calendarPage": "<links.page>" },
  "checkIns": [ { "date": "2026-11-08", "note": "<what the person chose to share>" } ],
  "consent": { "store": true, "date": "2026-11-01" }
}
```

## Fields

| Field | Type | Rule |
| --- | --- | --- |
| `birth.timeKnown` | `exact`, `approximate`, `unknown` | `unknown` means `time` is null and no houses or angles are given. |
| `birth.timeSource` | `birth-certificate`, `hospital-record`, `family`, `memory`, `unknown` | As the person said it. |
| `birth.timeMarginMinutes` | integer or null | Only for `approximate`. |
| `resolved.status` | `resolved`, `gap-chosen`, `fold-chosen`, `both-kept` | `both-kept` when the person could not choose; the bot then shows what differs. |
| `resolved.flags` | list | Copied from `resolve_civil_time`, for example `lmt`. |
| `settings` | object | Fixed for launch: tropical, whole sign, true node. |
| `natal` | object | Store the receipt and page link, not a copy of the positions, so the chart is always recalculated by the server. |
| `window` | object | The current 90-day window. |
| `checkIns` | list | Only what the person chose to share. |

Deleting a profile removes all of it. Nothing about a person is kept outside the profile.
