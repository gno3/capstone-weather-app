# Proposal

## Why

The app currently lets users choose a shareable location but displays only its heading. A weather dashboard will make that selection useful by showing current conditions, the next 24 forecast points, and a seven-day outlook with URL-controlled units.

## What Changes

- Add a server-only forecast integration alongside existing geocoding, mapping Open-Meteo data into typed current, hourly, daily, and unit models with a 600-second revalidation lifetime.
- Expose the same forecast function through `GET /api/forecast`, with parameter validation and friendly upstream errors.
- Render CurrentCard, HourlyChart, DailyList, and SunTimes for the URL location, preserving the existing St. Louis fallback and location-search behavior.
- Add complete Open-Meteo WMO labels and emoji, including day/night variants for clear and partly cloudy conditions.
- Add a URL-based UnitsToggle, defaulting to imperial, plus loading skeletons, a retryable error banner, and persistent Open-Meteo attribution.
- Cover fixture-based mapping, hourly slicing, units, weather codes, API validation/failure, navigation refreshes, and the 375px layout.
- Out of scope: new geocoding behavior, accounts, saved locations, geolocation, additional providers, and deployment changes.

## Capabilities

### New Capabilities

- `weather-forecast`: Forecast retrieval, normalized data and units, local-time slicing, caching, weather-code descriptions, and the forecast API contract.
- `weather-dashboard`: URL-driven weather presentation, unit navigation, responsive charts and daily outlook, loading/error recovery, and attribution.

### Modified Capabilities

None. Existing `location-search` requirements remain intact; the dashboard consumes its resolved location and preserved units.

## Impact

- Extend `lib/openmeteo.ts` and `lib/types.ts`; add WMO and unit/parameter helpers as needed, reusing existing location parsing rather than duplicating coordinate rules.
- Extend `app/page.tsx`; add `app/api/forecast/route.ts`, dashboard components, `app/loading.tsx`, and `app/error.tsx`. Put Footer in `app/layout.tsx` so it survives loading and forecast errors.
- Use the already-installed Recharts dependency; retain strict TypeScript, Tailwind, and the existing Vitest Node test setup.
- Preserve geocoding caching and tests, existing location-selection accessibility, and Next.js cache-components/Suspense conventions.
- Update README with dashboard URL examples, API behavior, and validation instructions.
