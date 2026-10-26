# Design

## Context

The repo is a fresh Next.js 16.4 App Router scaffold (`app/page.tsx` is the Create Next App page; no `lib/` or `components/` yet). `next.config.ts` enables `cacheComponents` and `partialPrefetching`, and builds `standalone` output. Vitest runs in the `node` environment with the `@/` alias; no DOM testing libraries are installed. Project constraints (from OpenSpec config) require all Open-Meteo access to go through `lib/openmeteo.ts` on the server, domain types in `lib/types.ts`, location/units in the URL, and friendly errors.

See proposal.md for scope and specs/location-search/spec.md for required behavior.

## Goals / Non-Goals

**Goals:**
- A single typed server-side entry point for geocoding that later features can reuse.
- A thin, easily unit-tested route handler.
- An accessible, mobile-friendly combobox with no new dependencies.

**Non-Goals:**
- Recent/saved locations, geolocation ("use my location"), or reverse geocoding.
- Fetching or displaying weather for the selected location.
- DOM/component tests (would need jsdom + Testing Library; deferred).

## Decisions

### D1. Module layout
- `lib/types.ts`: `Location` (`name`, `region?`, `country`, `lat`, `lon`, `timezone`).
- `lib/openmeteo.ts`: `searchLocations(q: string): Promise<Location[]>`, plus an internal raw-response type and a mapper. Throws a typed `OpenMeteoError` on non-OK status, network failure, or bad JSON so callers can distinguish upstream failures.
- `lib/location.ts`: `DEFAULT_LOCATION`, `formatLocationLabel(loc)` ("Name, Region, Country", skipping missing region), and `resolveLocation(searchParams)` for the page. Kept separate from `openmeteo.ts` because it has no network concerns and is shared by server page and client component.
- `app/api/geocode/route.ts`: `GET` handler.
- `components/LocationSearch.tsx`: `'use client'` combobox.

Alternative: put label formatting inside the component. Rejected because the page also needs to show the active location name consistently.

### D2. Upstream request
Build the URL with `URLSearchParams` (`name`, `count=5`, `language=en`, `format=json`) so user input is always encoded. Call `fetch(url, { next: { revalidate: 86400 } })` per project convention. Map `admin1 → region`, `latitude → lat`, `longitude → lon`; drop `region` when `admin1` is absent. Treat a missing `results` array as `[]`.

### D3. Route handler validation and errors
Read `q` via `new URL(request.url).searchParams` (works with plain `Request` in tests and `NextRequest` at runtime). Trim, then:
- `< 2` chars → 400 `{ error: "Enter at least 2 characters." }`
- `> 100` chars → 400 `{ error: "Search is too long." }` (bounds upstream URL length / abuse)
- `OpenMeteoError` or any thrown error → 502 `{ error: "Location search is unavailable. Please try again." }`; log server-side with `console.error` (message only), never echo upstream details.

Reading request search params makes the handler run at request time under Cache Components, which is what we want; caching lives at the `fetch` level.

### D4. Client search behavior
- Local state: `query`, `results`, `status` (`idle | loading | success | error`), `open`, `activeIndex` (-1 = none).
- A `useEffect` on `query` sets a 300ms timeout; when it fires and `query.trim().length >= 2`, it calls `/api/geocode?q=...` with an `AbortController`. Cleanup clears the timeout and aborts the in-flight request, so stale responses never overwrite current results (spec: out-of-order responses).
- A `retryNonce` counter in the effect deps lets the Retry button re-run the same query without retyping.
- Non-OK response or network error (excluding `AbortError`) → `status = "error"`, showing "Couldn't search locations." with a Retry button.
- Empty successful result → "No locations found".

Alternative: a debounce utility/hook or a library (e.g. `use-debounce`). Rejected: one usage, no new deps.

### D5. Keyboard and ARIA
WAI-ARIA combobox pattern: input has `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`; list is `role="listbox"` with `role="option"` items and `aria-selected`. ArrowDown/ArrowUp wrap through options (open the list if closed and results exist), Enter selects only when `activeIndex >= 0`, Escape closes. Options use `onMouseDown` + `preventDefault` so the input's blur handler doesn't close the list before the click registers. Status messages are rendered in an `aria-live="polite"` region.

### D6. Navigation
On select: `const params = new URLSearchParams(); params.set("lat", …); params.set("lon", …); params.set("name", formatLocationLabel(loc));` then copy `units` from `useSearchParams()` if present, and `router.push(\`${pathname}?${params}\`)`. Only `units` is carried over (per requirement); other params are dropped. Input text is set to the label and the dropdown closes.

`name` holds the full display label (e.g. "Springfield, Illinois, United States") so a shared URL renders the same heading without another geocoding call.

### D7. Page integration
`app/page.tsx` becomes a server component that awaits `searchParams`, calls `resolveLocation`, and renders a heading with the active location label plus `<LocationSearch />`. Because `LocationSearch` uses `useSearchParams`, it is wrapped in `<Suspense>` with an input-shaped fallback, as required for prerendering under Cache Components. Default label for St. Louis is "St. Louis, MO". When coordinates are valid but `name` is missing, the label is the coordinates formatted to 3 decimals (e.g. "40.000, -75.000").

### D8. Tests
Vitest, `node` environment, `vi.stubGlobal("fetch", vi.fn())` with `vi.unstubAllGlobals()` in `afterEach`.
- `lib/openmeteo.test.ts`: match (mapping incl. `admin1 → region`, missing `admin1`), request URL params and `next.revalidate`, missing `results` → `[]`, upstream 500 → throws.
- `app/api/geocode/route.test.ts`: match → 200 body, empty → 200 `[]`, upstream 500 → 502 friendly error, `q` of 1 char / missing → 400 and `fetch` not called, `q` > 100 → 400.
- `lib/location.test.ts`: `resolveLocation` default/valid/invalid/out-of-range/no-name and `formatLocationLabel` with/without region.

## Risks / Trade-offs

- [`next.revalidate` on `fetch` may not persist across requests when `cacheComponents` is on — the Next 16 guide recommends `'use cache'` + `cacheLife` instead] → Keep `next: { revalidate: 86400 }` as the project config mandates; the spec only asserts the request carries that lifetime. If cross-request caching is needed later, wrap `searchLocations` in a `'use cache'` function with `cacheLife({ revalidate: 86400 })` without changing the API.
- [Open-Meteo rate limits or outages] → 300ms debounce, 2-char minimum, and daily caching reduce calls; failures surface as 502 + Retry.
- [No component tests for keyboard/debounce behavior] → Covered by manual verification tasks; DOM tests can be added later with jsdom.
- [Coordinates in the URL are user-controlled] → `resolveLocation` validates numeric range and falls back to default; `name` is rendered as text by React (no HTML injection).

## Migration Plan

Additive; no data migration. Deploy via the existing `scripts/deploy.sh`. Rollback by redeploying the previous build.
