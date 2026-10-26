This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Dashboard

The home page shows current conditions, a 24-hour temperature/precipitation chart, a 7-day
outlook, and sunrise/sunset for the location in the URL. Location and units live in the
query string, so every view is shareable:

| URL | Shows |
| --- | --- |
| `/` | Northbrook, IL (42.128, -87.829), imperial |
| `/?lat=40&lon=-75` | Those coordinates, labeled `40.000, -75.000` |
| `/?lat=51.50853&lon=-0.12574&name=London%2C+England%2C+United+Kingdom&units=metric` | London in °C and km/h |
| `/?units=kelvin` | Unsupported units fall back to imperial (°F, mph) |

Invalid or missing coordinates fall back to Northbrook, IL. The °F/°C control changes only the
`units` parameter (keeping `lat`, `lon`, `name`, and anything else); selecting a location
from search keeps the current `units`. Hourly labels and sun times use the forecast
location's local clock, not the browser's timezone.

### Checking the dashboard locally

Server components fetch forecasts on the server, so browser request mocking cannot control
them. For deterministic checks, start a local server with the validation-only harness
[`scripts/mock-open-meteo.mjs`](scripts/mock-open-meteo.mjs). It is never imported by the
app; it wraps `fetch` only in the process you start this way, serves forecasts derived from
`tests/fixtures/forecast.json`, and re-reads `/tmp/open-meteo-mock.json` on every request:

```bash
npm run build
echo '{"mode":"ok","delayMs":0}' > /tmp/open-meteo-mock.json
NODE_OPTIONS="--import ./scripts/mock-open-meteo.mjs" npx next start -p 3100
```

Longitudes between -30 and 40 are served as Europe/London (cooler, earlier sunset), so
location switches are visible. Successful forecasts are cached for 10 minutes per
coordinates/units, so use fresh coordinates (e.g. `?lat=12.3&lon=45.6`) when testing
loading or failures.

1. **Location refresh:** open `/?units=metric`, search "London", and select it. The URL
   keeps `units=metric`; the heading, current card, chart, 7-day list, and sun times all
   switch to London (`Local time (Europe/London)`, sunset 4:38 PM).
2. **Unit refresh:** press °C/°F (mouse, or Tab + Enter/Space). Current, feels-like,
   chart axis/tooltip, daily highs/lows, and wind change together; Back/Forward restore
   the matching view and pressed button.
3. **Loading:** set `{"mode":"ok","delayMs":5000}` and open new coordinates. Skeletons
   (no numbers) appear and the Open-Meteo attribution stays visible.
4. **Error and retry:** set `{"mode":"fail"}` and open new coordinates. A friendly banner
   with **Try again** appears (no stack trace or provider text); the server log shows the
   `OpenMeteoError`. Set `{"mode":"ok"}` and press **Try again**: the same URL renders.
5. **Timezones and midnight:** set `{"mode":"ok","currentTime":"2026-10-26T23:45"}` with
   new coordinates; the chart starts at 12 AM. Emulate another browser timezone in
   DevTools (Sensors → Location) and confirm hours and sun times do not change. Add
   `"nullSunrise":true` to see "Unavailable", or `"weatherCode":96` to force a long
   condition label.
6. **375px:** in DevTools device mode at 375px wide, with a long `name=` value, check the
   success, loading, and error states: `document.documentElement.scrollWidth <=
   document.documentElement.clientWidth`, and the chart axes, °F/°C control, all seven
   daily rows, sun times, and attribution are readable.

In the DevTools Network panel, the browser should make no requests to `open-meteo.com` and
none to `/api/forecast`; forecast data arrives in the server-rendered payload.

## Weather data

Forecasts and geocoding come from [Open-Meteo](https://open-meteo.com/) (no API key,
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)). Every page shows
"Weather data by Open-Meteo.com". Only the server calls Open-Meteo, through
`lib/openmeteo.ts`; the browser never requests an Open-Meteo host.

### Normalized forecast

`getForecast(lat, lon, units)` requests `https://api.open-meteo.com/v1/forecast` with
`timezone=auto`, `forecast_days=7`, and these fields:

| Group | Provider fields |
| --- | --- |
| current | `temperature_2m`, `apparent_temperature`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `weather_code`, `is_day` |
| hourly | `temperature_2m`, `precipitation_probability`, `weather_code` |
| daily | `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`, `sunrise`, `sunset` |

Imperial requests add `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, and
`precipitation_unit=inch`; metric uses provider defaults (°C, km/h, mm). A response whose
reported units disagree with the requested system is rejected rather than relabeled.

The provider's parallel arrays are mapped to `Forecast` (`lib/types.ts`). For the recorded
metric fixture (`GET /api/forecast?lat=38.63&lon=-90.2&units=metric`) the result is:

```jsonc
{
  "timezone": "America/Chicago",
  "units": { "system": "metric", "temperature": "°C", "windSpeed": "km/h", "precipitation": "mm" },
  "current": { "time": "2026-10-26T13:30", "temperature": 23.5, "apparentTemperature": 23.2,
               "humidity": 44, "windSpeed": 5.6, "windDirection": 230, "weatherCode": 0, "isDay": true },
  "hourly": [ { "time": "2026-10-26T14:00", "temperature": 23.9, "precipitationProbability": 1, "weatherCode": 0 } /* 24 points */ ],
  "daily": [ { "date": "2026-10-26", "weatherCode": 3, "temperatureMax": 24.7, "temperatureMin": 10.7,
               "precipitationProbabilityMax": 1, "sunrise": "2026-10-26T07:21", "sunset": "2026-10-26T18:07" } /* 7 days */ ]
}
```

Imperial responses have the same shape with `"system": "imperial"`, `°F`, `mph`, and `in`.

- Times are the forecast location's local clock (`YYYY-MM-DDTHH:mm`, no offset); `timezone`
  is the provider's IANA zone.
- Missing measurements and sun events are `null` (shown as "Unavailable" or chart gaps), never `0`.
- **Hourly slicing:** the 24 points start at the first hourly timestamp **>= `current.time`**,
  compared as local strings. Current time `14:00` starts at `14:00`; `14:15` starts at
  `15:00`; `23:45` starts at the next day's `00:00`. No match or fewer than 24 remaining
  points is an unusable response.
- Missing/misaligned arrays, malformed timestamps, non-numeric values, or anything other
  than 7 daily entries raise `OpenMeteoError` rather than returning a partial forecast.
- **Connection retries:** each Open-Meteo request attempt (forecast and geocoding) is capped at
  3 s, and network/timeout failures are retried up to 3 attempts in total. HTTP error statuses and
  unusable payloads are not retried. This covers occasional stalled TCP connects from Azure
  App Service, which would otherwise wait for Node's 10 s connect timeout and fail.
- **Caching:** forecast fetches use `next: { revalidate: 600 }` (ten minutes), keyed by the
  request URL (coordinates and units). Geocoding uses `revalidate: 86400`.
- Weather codes map to labels and emoji in `lib/wmo.ts` (all 28 Open-Meteo WMO codes, with
  night variants for clear/mainly clear/partly cloudy; unknown codes show "Unknown conditions").

Adapter tests use a recorded, unedited response in
[`tests/fixtures/forecast.json`](tests/fixtures/README.md) and run offline.

## API

### `GET /api/forecast?lat=&lon=&units=`

```bash
curl "http://localhost:3000/api/forecast?lat=42.128&lon=-87.829"               # imperial (default)
curl "http://localhost:3000/api/forecast?lat=51.50853&lon=-0.12574&units=metric"
```

| Case | Status | Body |
| --- | --- | --- |
| Success | 200 | `Forecast` object (above), unwrapped |
| Missing, blank, non-numeric, non-finite, or out-of-range `lat` (±90) / `lon` (±180) | 400 | `{ "error": "Provide valid coordinates: …" }` |
| `units` present but not exactly `imperial` or `metric` (including empty) | 400 | `{ "error": "Units must be imperial or metric." }` |
| Provider unreachable, non-2xx, invalid JSON, or unusable payload | 502 | `{ "error": "Weather forecast is unavailable. Please try again." }` |

Omitted `units` defaults to `imperial`. For repeated parameters the first value wins.
Invalid requests never contact the provider, and 502 bodies never include provider details.

### `GET /api/geocode?q=`

Returns `{ "results": Location[] }` for 2–100 character queries; 400 otherwise, 502 on
upstream failure.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
