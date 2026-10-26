# Tasks

## 1. Domain types and location helpers

- [x] 1.1 Create `lib/types.ts` with the `Location` type (`name`, `region?`, `country`, `lat`, `lon`, `timezone`) and verify `npx tsc --noEmit` passes
- [x] 1.2 Create `lib/location.ts` with `DEFAULT_LOCATION` (St. Louis, Missouri, United States, 38.627, -90.199, America/Chicago), `formatLocationLabel` (skips missing region), and `resolveLocation(searchParams)` (validates lat/lon range, default label "St. Louis, MO", coordinate label when `name` missing); verify with `lib/location.test.ts` covering default, valid, non-numeric, out-of-range, and no-name cases plus labels with/without region (`npm test`)

## 2. Open-Meteo geocoding client

- [x] 2.1 Implement `searchLocations(q)` and `OpenMeteoError` in `lib/openmeteo.ts`: build URL with `URLSearchParams` (`name`, `count=5`, `language=en`, `format=json`), `fetch` with `next: { revalidate: 86400 }`, map `admin1 → region` / `latitude → lat` / `longitude → lon`, return `[]` when `results` is absent, throw `OpenMeteoError` on non-OK, network, or JSON failure
- [x] 2.2 Add `lib/openmeteo.test.ts` with mocked `fetch` (`vi.stubGlobal`) covering: match mapping incl. missing `admin1`, request URL params and `next.revalidate: 86400`, missing `results` → `[]`, upstream 500 → rejects with `OpenMeteoError`; verify `npm test` passes

## 3. Geocode API route

- [x] 3.1 Implement `GET` in `app/api/geocode/route.ts`: trim `q`; 400 `{ error }` if missing/< 2 or > 100 chars; 200 `{ results }` on success; 502 `{ error }` with a friendly message on any thrown error (log message server-side only)
- [x] 3.2 Add `app/api/geocode/route.test.ts` with mocked `fetch` covering: match → 200 with mapped results, empty upstream → 200 `{ results: [] }`, upstream 500 → 502 friendly error, 1-char and missing `q` → 400 with `fetch` not called, 101-char `q` → 400; verify `npm test` passes

## 4. LocationSearch component

- [x] 4.1 Create `components/LocationSearch.tsx` (`'use client'`): input with 300ms debounced `useEffect`, 2-char minimum, `AbortController` cancellation, and `retryNonce`; fetch only `/api/geocode`; verify `npx tsc --noEmit` and `npm run lint` pass
- [x] 4.2 Render the dropdown: options labeled via `formatLocationLabel`, "No locations found" on empty, "Couldn't search locations." with a Retry button on error, loading state, `aria-live` status region; mobile-first styling usable at 375px; verify lint/type-check pass
- [x] 4.3 Add keyboard handling (ArrowDown/ArrowUp wrap, Enter selects only highlighted, Escape closes) and combobox/listbox ARIA attributes; options select via `onMouseDown` with `preventDefault`; verify lint/type-check pass
- [x] 4.4 On select, `router.push` to `${pathname}?lat=&lon=&name=` preserving only `units` from `useSearchParams()`, set input to the label, and close the dropdown; verify lint/type-check pass

## 5. Page integration

- [x] 5.1 Replace the scaffold in `app/page.tsx` with a server component that awaits `searchParams`, calls `resolveLocation`, shows the active location label as a heading, and renders `<LocationSearch />` inside `<Suspense>` with an input-shaped fallback; verify `npm run build` succeeds with no prerender errors

## 6. Integration verification

- [x] 6.1 Run `npm test`, `npm run lint`, and `npm run build`; all pass
- [x] 6.2 With `npm run dev`, manually verify: `/` shows "St. Louis, MO"; "London" lists up to 5 matches; "Springfield" lists several US states; typing "L" makes no request (Network tab); a nonsense query shows "No locations found"; the browser only calls `/api/geocode` (no `open-meteo.com` requests)
- [x] 6.3 Manually verify keyboard flow (arrows wrap, Enter selects, Escape closes), that selecting from `/?units=metric` yields `?lat=&lon=&name=&units=metric` and the heading updates, and that the layout works at 375px width
- [x] 6.4 Manually verify the failure path by temporarily pointing the upstream at an unreachable host (or blocking it) and confirming the Retry message appears and no stack trace is shown; revert the temporary change

## Workflow follow-up

- Archive the change after review with `/opsx:archive`.
