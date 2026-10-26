# Design

## Context

See [proposal.md](./proposal.md) for motivation and the two capability deltas for behavior contracts.

Observed implementation:
- `lib/openmeteo.ts` currently implements only geocoding, with typed mapping, `OpenMeteoError`, and 86400-second revalidation. Preserve that behavior.
- `lib/types.ts` contains only `Location`. `lib/location.ts` owns coordinate validation, St. Louis defaults, first-value handling for repeated page parameters, and coordinate-based labels.
- `app/page.tsx` renders LocationSearch and an async heading under separate Suspense boundaries. LocationSearch navigates with coordinates/name and preserves units.
- Recharts is already installed. Vitest uses the Node environment; current adapter and route tests mock global fetch.
- Next.js 16.4.3 enables `cacheComponents` and `partialPrefetching`. Installed page/loading/fetch guides confirm promise-based searchParams, Suspense for runtime content, and per-fetch revalidation. Crucially, the installed error guide uses `retry`, not the older `reset` error-boundary prop.
- Root layout has no footer. Global styling already supports light/dark color schemes.

## Goals / Non-Goals

**Goals:**
- One normalized forecast source for server rendering and API consumers, with raw provider shapes confined to the adapter.
- A consistent URL-derived location/unit snapshot for every dashboard section.
- Explicit local-time semantics, unit-safe labels, and testable error paths without adding dependencies.

**Non-Goals:**
- Client-side forecast fetching or duplicating provider logic in route handlers.
- Replacing location-search semantics, global styling, or deployment configuration.
- A general-purpose meteorological model, automatic geolocation, or a new caching layer.

## Decisions

### 1. Normalize at the provider boundary

Extend `lib/types.ts` with a unit-system union and `Forecast` plus current/hourly/daily measurement types. The normalized shape will be:

- `timezone`: provider IANA timezone.
- `units`: `{ system, temperature, windSpeed, precipitation }`, with imperial or metric values and explicit display labels.
- `current`: `{ time, temperature, apparentTemperature, humidity, windSpeed, windDirection, weatherCode, isDay }`.
- `hourly[]`: `{ time, temperature, precipitationProbability, weatherCode }`.
- `daily[]`: `{ date, weatherCode, temperatureMax, temperatureMin, precipitationProbabilityMax, sunrise, sunset }`.

Use provider-local ISO strings for times/dates and boolean `isDay`. Represent permitted missing scalar measurements and sun events with nullable types; display "Unavailable" or chart gaps rather than zero. Validate the required objects, array alignment, timestamps, seven daily entries, and sufficient hourly coverage before returning. Invalid structure is an `OpenMeteoError`, not a partial successful forecast.

Implement `getForecast(lat, lon, units)` in `lib/openmeteo.ts`, reusing the error type and leaving searchLocations unchanged. Request:

| Group | Provider fields |
| --- | --- |
| current | temperature_2m, apparent_temperature, relative_humidity_2m, wind_speed_10m, wind_direction_10m, weather_code, is_day |
| hourly | temperature_2m, precipitation_probability, weather_code |
| daily | weather_code, temperature_2m_max, temperature_2m_min, precipitation_probability_max, sunrise, sunset |

Always set `timezone=auto`, `forecast_days=7`, and `next: { revalidate: 600 }`. Imperial adds `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, and `precipitation_unit=inch`; metric uses provider defaults. URL parameters distinguish coordinate/unit cache keys. Do not add `no-store`, which conflicts with revalidation.

Alternative: return provider JSON or convert imperial values in components. Rejected because it couples presentation to parallel arrays and risks values/labels disagreeing.

### 2. Honor the explicit hourly slicing rule and local clocks

Find the first index whose provider-local hourly string is >= `current.time`, then slice 24 points from all aligned arrays. The explicit comparison takes precedence over interpreting "current hour" as rounding down: a 14:15 current timestamp starts at 15:00. A negative find result or fewer than 24 available points is an unusable payload, never a slice from index -1 or midnight.

Compare consistently formatted local ISO timestamps directly; do not parse timezone-less strings using host-local Date constructors. Format chart hours and sunrise/sunset from local clock components, and daily weekday labels from date-only calendar values without shifting dates into the browser timezone. Retain timezone metadata for labels and accessibility.

Alternative: slice the first 24 points or compute a browser-clock index. Rejected because the provider starts at local midnight and viewers may be in another timezone.

### 3. Share parsing primitives but preserve page/API differences

Reuse/expose the existing coordinate parsing primitive in `lib/location.ts` rather than implementing different numeric/range checks in the API. Preserve resolveLocation fallback semantics and first-value behavior. Use a small shared units helper with exact accepted values.

- Page: resolve location as today; missing/unsupported units resolve to imperial. Read the first repeated value, consistent with existing location resolution.
- API: require both coordinates; reject blank/non-numeric/non-finite/out-of-range values, including missing values. Omitted units defaults to imperial, as confirmed by the user; explicit empty/unsupported units returns 400. Read the first repeated value, matching URLSearchParams.get and page conventions.
- API success returns the Forecast object directly, not an extra wrapper. Invalid input returns `{ error }` without a provider call. Upstream `OpenMeteoError` returns friendly `{ error }` with 502 and repository-style server logging. Unexpected programming errors propagate rather than being disguised as upstream outages.

Alternative: use resolveLocation for API requests. Rejected because it silently substitutes St. Louis for invalid API input.

### 4. Keep runtime rendering under Suspense and fetch directly

Retain the static page shell and the existing LocationSearch boundary. Replace the heading-only async region with an async dashboard region in `app/page.tsx` that awaits searchParams, resolves one location/unit snapshot, and calls getForecast directly. Pass normalized data to CurrentCard, HourlyChart, DailyList, and SunTimes.

Keep request-dependent work under Suspense for cache-components compatibility. Key the forecast-content boundary by resolved coordinates and units so query navigation can show new skeletons instead of leaving stale weather presented as current. Reuse weather skeleton markup between the explicit boundary and `app/loading.tsx`; only extract a helper when needed for this actual reuse.

Alternative: call `/api/forecast` from the page or add a client fetch effect. Rejected because it introduces an unnecessary HTTP hop or competing state lifecycle.

### 5. Minimize client boundaries and make responsive sizing structural

- CurrentCard, DailyList, SunTimes, and Footer remain server-renderable.
- HourlyChart is a client component using Recharts ResponsiveContainer and ComposedChart: temperature Line on a left YAxis and precipitation Bar on a right YAxis with domain `[0, 100]`. Provide correctly labeled tooltips/legend and accessible chart descriptions.
- UnitsToggle is a client component using current searchParams and router navigation. Clone current parameters and change only units; show the selected option with accessible pressed/selected state. Avoid navigating again when already selected.
- WMO lookup in `lib/wmo.ts` returns `{ label, emoji }` for all 28 supported codes. Codes 0 and 2 have day/night variants; code 1 can share the clear-family night variant. CurrentCard uses isDay. Daily summaries use daytime icons because the request has no per-day is_day. Unknown future codes visibly render an unknown-condition label, never a fake known condition.
- Use wrapping mobile layouts, `min-w-0`, a full-width chart parent with explicit height, and compact daily-row grids. Avoid fixed widths and hiding document overflow to mask clipping.

Alternative: make the entire page client-side or use a fixed chart width. Rejected due to excess client state and mobile overflow.

### 6. Keep attribution outside forecast failure boundaries

Add Footer to root layout with the exact attribution text and link from the dashboard spec. This preserves attribution during loading and errors without duplication.

Use `app/loading.tsx` for meaningful skeletons and `app/error.tsx` as a client boundary with a friendly alert/banner and retry button. Use the installed version's `retry: () => void` prop to re-fetch and re-render, not a legacy reset-only pattern. Do not render the error object's raw message, even in development; log failures through repository-standard server/framework diagnostics.

### 7. Verify contracts at the adapter, route, and browser boundaries

- Add a recorded, checked-in Open-Meteo JSON fixture with timezone/current/hourly/daily/unit metadata and enough hours to cross midnight. Record source/request provenance without credentials. Tests remain offline and deterministic; derive controlled variants for unit and slicing boundaries without claiming provider values were locally converted.
- Extend existing adapter tests for exact query field lists, both unit systems, revalidate 600, normalized fields, 24-point slicing, half-hour/current-time boundaries, midnight, and unusable payloads. Preserve all geocoding tests.
- Add table-driven WMO coverage for all 28 codes and day/night variants.
- Add route tests alongside the forecast handler for success shape, omitted units default, coordinate boundaries, invalid parameters/no upstream calls, and network/status/JSON/shape failures returning 502.
- Test parsing/unit helpers in the existing Node Vitest environment. Browser validation covers rendering/navigation rather than adding a DOM testing framework solely for this change.
- Exercise location switches, unit switches, back/forward, delayed responses, upstream failure/retry, timezone differences, and 375px layout in a browser with deterministic provider responses controlled on the server side. Browser request interception alone cannot mock a server-component provider fetch; use a local test harness or server-side fixture injection scoped to validation, not a production fallback.
- Check `document.documentElement.scrollWidth <= document.documentElement.clientWidth` at 375px in success/loading/error states, and inspect chart axes/tooltips and all seven daily rows.

## Risks / Trade-offs

- [Provider-local timestamps omit offsets and may repeat at DST transitions] -> Preserve provider ordering, use the specified first-match comparison, and avoid claiming unique UTC instants or elapsed-hour arithmetic.
- [Sparse/null values or polar sun events] -> Explicit nullable scalar handling; absent required structures and insufficient point coverage fail visibly rather than manufacturing values.
- [Recharts sizing or hydration behavior] -> Isolate the chart client boundary, give the parent a measurable height, and verify actual rendered width and axes at 375px.
- [Query navigation may reuse prior content] -> Resolve one location/unit snapshot per render, key pending forecast content, and test all sections after transitions and browser history.
- [Cached successful data may mask a simulated outage] -> Use isolated coordinate/unit cache keys or clear only the test cache when exercising errors. Retry does not promise to bypass a valid 600-second cached response.
- [Next.js APIs differ from familiar releases] -> Follow installed guides, particularly `retry`, async searchParams, and cache-components Suspense, and verify with a production build.

## Migration Plan

No data migration or new dependency is required. Implement adapter/contracts first, then API and UI against those contracts. Run focused tests per task group, integrated lint/build checks, and browser scenarios before release. Deploy using the existing standalone build flow. Rollback is a normal application revision rollback; there is no persisted user data or infrastructure change to reverse.
