# Proposal

## Why

The dashboard has no way to choose where to show weather for; the app is still the Create Next App scaffold. Users need to find a place by name and land on a shareable URL for it, and every later feature (current conditions, forecast charts) depends on a resolved location in the URL.

## What Changes

- Add a `Location` domain type (`name`, optional `region`, `country`, `lat`, `lon`, `timezone`) in `lib/types.ts`.
- Add `searchLocations(q)` in `lib/openmeteo.ts`, calling the Open-Meteo Geocoding API (`name=q`, `count=5`, `language=en`, `format=json`, cached for 86400s), mapping `admin1` to `region`, and returning `[]` when the API omits `results`.
- Add `GET /api/geocode?q=` returning `200 { results: Location[] }`, `400` for queries shorter than 2 characters, and `502 { error }` when the upstream call fails.
- Add a client `LocationSearch` component: input debounced at 300ms, dropdown of "Name, Region, Country" suggestions, keyboard support (Arrow Up/Down, Enter, Escape), "No locations found" empty state, and a retry message on failure. Selecting a suggestion navigates to `?lat=&lon=&name=` and preserves `units`.
- Resolve the active location from the URL, falling back to St. Louis, MO (38.627, -90.199) when none is given.
- Replace the scaffold home page content with the search control and the active location name.
- Add Vitest tests for `searchLocations` and the route handler with mocked `fetch` (match, empty, upstream 500).

## Capabilities

### New Capabilities
- `location-search`: finding places by name through the Open-Meteo geocoding proxy, choosing one in the UI, and resolving the active location (including the default) from the URL.

### Modified Capabilities
<!-- None: no existing specs. -->

## Impact

- New files: `lib/types.ts`, `lib/openmeteo.ts`, `lib/location.ts`, `app/api/geocode/route.ts`, `components/LocationSearch.tsx`, and tests under `lib/` and `app/api/geocode/`.
- Modified: `app/page.tsx` (scaffold content replaced).
- New external dependency at runtime: `https://geocoding-api.open-meteo.com/v1/search` (no API key), called only from the server.
- No new npm packages.
- Out of scope: weather data display, units toggle UI, the Open-Meteo attribution footer, and component-level (DOM) tests.
