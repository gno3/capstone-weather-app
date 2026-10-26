# Tasks

## 1. Forecast adapter and shared contracts

- [x] 1.1 Extend `lib/types.ts` with unit-system and normalized Forecast/current/hourly/daily types described in design decision 1, including timezone and explicit nullable values; verify strict typing with `npx tsc --noEmit` after the adapter is wired.
- [x] 1.2 Reuse/expose the coordinate parser in `lib/location.ts` and add shared unit parsing without changing existing location defaults or repeated-value semantics; add tests for zero/boundary/invalid coordinates and page/API unit defaults, and verify the focused helper and existing location tests pass.
- [x] 1.3 Record a real Open-Meteo response (St. Louis, provider-default metric units) to `tests/fixtures/forecast.json` with:
  `mkdir -p tests/fixtures && curl -fsS "https://api.open-meteo.com/v1/forecast?latitude=38.63&longitude=-90.2&timezone=auto&forecast_days=7&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" > tests/fixtures/forecast.json`
  Commit it unedited, note the command and capture date next to it (e.g. a README line in `tests/fixtures/`), and derive edge-case and imperial-label variants in tests from copies rather than editing the file. Verify it contains all requested fields, 7 daily entries and 168 hourly points, and that tests load it without network access.
- [x] 1.4 Implement `getForecast(lat, lon, units)` alongside geocoding with the exact requested field groups, `timezone=auto`, `forecast_days=7`, imperial parameters, and `next: { revalidate: 600 }`; extend adapter tests to verify normalized current/daily data, both unit systems and labels, exact request parameters, and unchanged 86400-second geocoding caching.
- [x] 1.5 Implement aligned 24-point hourly slicing from the first local timestamp >= current.time and explicit provider error/shape handling; add fixture-based hour-boundary, 14:15, midnight, no-match, insufficient-coverage, null-value, malformed-array, invalid-JSON, network, and non-success response tests; verify with `npm test -- lib/openmeteo.test.ts`.
- [x] 1.6 Add `lib/wmo.ts` and table-driven tests for all 28 supported codes, clear/partly-cloudy day/night variants, and an explicit unknown-condition result; verify with `npm test -- lib/wmo.test.ts`.
- [x] 1.7 Update README with normalized forecast fields, provider source/attribution, ten-minute forecast caching, and the >= current.time slicing rule; verify documented examples match adapter tests and fixture provenance.

## 2. Forecast API

- [x] 2.1 Add `app/api/forecast/route.ts` using getForecast and shared parsing: valid coordinates required, omitted units defaults to imperial, explicit invalid units returns 400, success returns Forecast directly, and upstream OpenMeteoError returns logged friendly 502 JSON; verify handler tests cover successful imperial/metric responses and the exact response shape.
- [x] 2.2 Add `app/api/forecast/route.test.ts` cases for missing/blank/non-numeric/non-finite/out-of-range coordinates, accepted zero and range endpoints, empty/unsupported units, omitted units, and repeated-value handling; verify invalid requests return `{ error }` with 400 and never invoke upstream.
- [x] 2.3 Test network, provider status, invalid JSON, and unusable payload failures through the forecast handler; verify 502 responses contain no raw details with `npm test -- app/api/forecast/route.test.ts`, and confirm unexpected programming failures are not silently presented as valid forecasts.
- [x] 2.4 Document forecast API request examples, imperial default, normalized success body, and 400/502 behavior in README; verify examples agree with route tests.

## 3. Dashboard presentation and URL integration

- [x] 3.1 Add CurrentCard, DailyList, and SunTimes consuming only normalized data, with WMO descriptions, unit labels, and explicit unavailable values; verify displayed measurements, seven daily rows, first-day local sunrise/sunset, day/night conditions, and null sun-event presentation using fixture-backed browser checks.
- [x] 3.2 Add the client HourlyChart with Recharts ResponsiveContainer/ComposedChart, left temperature Line and right precipitation Bar with `[0, 100]` domain; verify 24 plotted points, correct axes/tooltip units, location-local clock labels, null gaps, and a measurable full-width chart at 375px.
- [x] 3.3 Add the client UnitsToggle that changes only the URL units parameter, preserves location/other parameters, exposes selected state, and supports keyboard activation; verify an actual unit switch fetches the selected values and updates current/apparent/hourly/daily temperatures and wind together.
- [x] 3.4 Wire the async dashboard region in `app/page.tsx` to await searchParams, use existing location resolution and shared unit resolution, and call getForecast directly under Suspense; key the forecast-content boundary by location/units and verify direct links, St. Louis fallback, missing-name labels, invalid page units, location selection, and back/forward all settle to consistent data in every section.
- [x] 3.5 Add Footer to root layout with "Weather data by Open-Meteo.com" linked to `https://open-meteo.com/`; add shared weather skeletons and `app/loading.tsx`, and implement friendly `app/error.tsx` with this installed Next.js version's `retry` prop; verify server-controlled delays and failures show skeletons/error banner, preserve attribution, and recover for the same URL after retry.
- [x] 3.6 Update README with dashboard URL/unit examples and steps for checking location refresh, unit refresh, loading, error/retry, timezone differences, and 375px behavior; verify the steps against the implemented UI without adding production mock-data fallbacks.

## 4. Integrated verification

- [x] 4.1 Run the existing and new focused adapter/helper/WMO/route tests together; run `npm run lint` and `npm run build` to verify strict types, generated route props, cache-components/Suspense compatibility, client chart bundling, and the installed error-boundary API. Preserve all existing geocoding/location behavior.
- [x] 4.2 Use server-controlled deterministic forecasts to verify location and unit transitions, browser history, midnight and cross-timezone labels, loading, upstream failure, and retry; inspect browser requests to verify no Open-Meteo request or client forecast-fetch effect is introduced.
- [x] 4.3 At a 375px viewport with long location and condition labels, verify `document.documentElement.scrollWidth <= document.documentElement.clientWidth` for success/loading/error states; visually verify chart axes and tooltips, unit control, all seven daily rows, sun times, and attribution remain readable without clipping or overflow-hiding workarounds.
