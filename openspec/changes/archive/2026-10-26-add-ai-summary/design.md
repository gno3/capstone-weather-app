# Design

## Context

See [proposal.md](./proposal.md) for motivation and [specs/ai-summary/spec.md](./specs/ai-summary/spec.md) for the behavior contract.

Current state that shapes the approach:

- `app/page.tsx` renders `Dashboard`, which awaits `searchParams`, then renders `ForecastContent` inside a `<Suspense>` keyed by `lat,lon,units`. `ForecastContent` calls `getForecast()` and renders `CurrentCard`, `HourlyChart`, `DailyList`, and `SunTimes`.
- `lib/openmeteo.ts` returns the normalized `Forecast` (`lib/types.ts`). `hourly` is already sliced to 24 points starting at the current hour, and `daily` has 7 entries. Hourly points carry temperature, precipitation probability, and weather code only. Wind exists only on `current`.
- `next.config.ts` enables `cacheComponents: true`, so caching uses `"use cache"` + `cacheLife` (Next 16.4). Per `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md`, every serializable argument and closed-over value becomes part of the cache key, cached scopes cannot read `searchParams`/headers, and the default runtime cache is in-memory per instance.
- `openai@^7.45` (`AzureOpenAI` with `azureADTokenProvider`, `deployment`, `apiVersion`, `endpoint`) and `@azure/identity@^4.14` are already in `package.json`.
- Vitest runs in the `node` environment with no DOM testing library. `tsconfig` uses `jsx: react-jsx`. `tests/fixtures/forecast.json` is a raw metric Open-Meteo response that `mapForecast()` can normalize.

## Goals / Non-Goals

**Goals:**
- Keep the AI path entirely server-side and off the dashboard's critical render path.
- Make the summarizer unit-testable with a mocked client, and keep cache/Next-specific code out of it.
- Bound worst-case latency and cost per summary.

**Non-Goals:**
- Provisioning Azure OpenAI, the model deployment, App Service managed identity, or role assignments in `scripts/deploy.sh` or CI. These are documented as prerequisites only.
- Adding Open-Meteo fields (for example hourly wind) to enrich the prompt. The summary uses the existing normalized forecast.
- Streaming tokens to the browser, user feedback on summaries, or a shared/remote cache handler.

## Decisions

### 1. Module layout: client → summarizer → cached wrapper → component

| Module | Responsibility |
| --- | --- |
| `lib/ai/client.ts` | `getAiClient(): { client: AzureOpenAI; deployment: string }`. Reads the three env vars. If any are missing it throws `AiConfigError` (named after the missing vars) before any network call. Builds `AzureOpenAI({ endpoint, deployment, apiVersion, azureADTokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default"), timeout: 10_000, maxRetries: 1 })` and memoizes it at module level. It never passes `apiKey`. |
| `lib/ai/summary.ts` | Pure logic, no Next imports. `buildSummaryInput(forecast, locationName)` returns the compact object. `SUMMARY_SYSTEM_PROMPT` is a constant. `summarizeForecast(forecast, locationName): Promise<string>` calls `chat.completions.create` and returns the trimmed text. It throws on a client error or empty content and does not catch. |
| `lib/ai/cached-summary.ts` | `"use cache"` boundary (Decision 3). |
| `components/AiSummary.tsx` | Async server component. Holds the only `try/catch` (fail soft) and the markup. Also exports `AiSummarySkeleton`. |

*Why:* the spec's test requirements map directly onto this split. `summary.ts` is tested with `vi.mock("./client")`, and `AiSummary` is tested by mocking the cached wrapper. Keeping `"use cache"`/`cacheLife` out of `summary.ts` avoids Next runtime APIs in unit tests. *Alternative:* a single module with try/catch inside `summarizeForecast`. Rejected because the requirement is that errors reach the caller, and fail-soft is a presentation concern.

### 2. Compact model input

`buildSummaryInput` emits JSON with:
- `location`
- `timezone`
- `units` (`temperature`, `windSpeed`, `precipitation` from `forecast.units`)
- `current`: `time`, `temperature`, `feelsLike`, `humidityPercent`, `windSpeed`, `windDirectionDeg`, `condition`
- `next24Hours[24]`: `time`, `temperature`, `precipitationChancePercent`, `condition`
- `next3Days[≤3]`: `date`, `high`, `low`, `precipitationChancePercent`, `condition`

`condition` is the text label from `describeWeather(code, isDay)`. The emoji field is dropped, and weather codes, sunrise/sunset, and days 4–7 are omitted. Null values stay `null` so the model cannot invent numbers. The user message is a single line, `Location: <name>\n<JSON.stringify(input)>`, with no pretty-printing to save tokens.

*Why:* short descriptive keys plus explicit units let the prompt say "use units as given" without extra explanation, and labels avoid having to teach WMO codes. *Alternative:* sending the whole `Forecast`. Rejected as larger and contrary to the request.

### 3. Caching: key on (lat, lon, units, locationName, hour), refetch the forecast inside the cache scope

```ts
// lib/ai/cached-summary.ts
export async function getCachedSummary(lat, lon, units, locationName, hour) {
  "use cache";
  cacheLife("hours");
  const forecast = await getForecast(lat, lon, units);
  return summarizeForecast(forecast, locationName);
}
```

- `hour` is `forecast.current.time.slice(0, 13)` (for example `"2026-10-26T14"`), computed in `ForecastContent` from the forecast it already has. It is location-local and deterministic, and it avoids `Date.now()`, which Cache Components restricts during prerendering.
- Passing the whole `Forecast` as an argument would make the full payload the cache key. That key changes every time Open-Meteo's current block advances (about every 15 minutes) or its revalidate window (600 s) refreshes, which breaks "per hour" caching. Fetching inside the scope keeps the key to exactly location + units + hour. `getForecast` uses `fetch` with `next.revalidate: 600`, so the extra call is normally a data-cache hit.
- `cacheLife("hours")` (revalidate 1 h, expire 1 day) matches the key granularity. Once the hour rolls over, the key changes anyway.
- `locationName` is part of the key so that two names for the same coordinates are not merged. It is a deliberate duplicate entry, and the cost is negligible.

*Alternative:* `unstable_cache` or a hand-rolled `Map`. Rejected because the project uses Cache Components and the request specifies `"use cache"` + `cacheLife`.

### 4. Rendering: nested Suspense inside the keyed forecast boundary

In `ForecastContent`, above `<CurrentCard>`:

```tsx
<Suspense fallback={<AiSummarySkeleton />}>
  <AiSummary lat={lat} lon={lon} units={units} locationName={locationName} hour={hour} />
</Suspense>
```

`Dashboard` passes `location.label` down as `locationName`.

- Because it sits inside the existing `key={lat,lon,units}` boundary, switching location or units remounts it and shows the forecast skeleton first, then the new summary. No stale summary carries over.
- The nested boundary lets current conditions, the chart, and the lists stream as soon as `getForecast` resolves, while the summary streams later.
- `AiSummarySkeleton` is a single `h-5` pulse bar inside the same card chrome, with `role="status"`, `aria-label="Loading AI summary"`, and no text content. It lives in `components/WeatherSkeleton.tsx` next to the other skeletons.
- `AiSummary` renders `<section aria-labelledby="ai-summary-heading">` with `<h2>AI summary</h2>` (same style as the "Current conditions" heading) and a `<p>` with the text. Plain text only, so the model output is never rendered as HTML.
- `WeatherSkeleton` does not get a summary placeholder. If AI is disabled, a placeholder would then collapse and shift the layout.

### 5. Fail soft at the component boundary only

`AiSummary` wraps `await getCachedSummary(...)` in `try/catch`. On any error it calls `console.error("[ai-summary] failed", { lat, lon, units }, err)` and returns `null`. This covers `AiConfigError`, auth/network/HTTP errors, timeouts, empty content, and a failing inner `getForecast`. Errors are therefore never thrown into `app/error.tsx`, so an AI failure can never show the dashboard's error banner.

### 6. Model parameters

The request uses `model: deployment`, `temperature: 0.2`, `max_completion_tokens: 120`, and two messages (system and user).

*Why `max_completion_tokens`:* it is the current parameter on Azure OpenAI chat completions and is required by newer model families. `max_tokens` is deprecated there. The system prompt tells the model to write 2-3 short sentences of plain language (never more than 3 and at most 60 words, because live testing showed the model sometimes ran to 4 sentences), mention only what matters today (rain timing, big temperature swings, wind) and skip anything unremarkable, use only numbers present in the data with the units as given, use no emojis or markdown, and give no advice beyond describing the weather.

## Risks / Trade-offs

- [The deployed model is a reasoning model that rejects `temperature` or uses up the token budget on reasoning] → Target a chat model deployment (for example `gpt-4o-mini`) and document it in the README. If the request fails, the feature fails soft rather than breaking the page.
- [Thrown errors might be cached by `"use cache"`, pinning a failure for an hour] → Errors from cached functions are not stored as cache entries. Implementation verifies this manually by starting with bad config, fixing it, and confirming the summary appears without a restart (task 4.3).
- [In-memory cache per App Service instance; a scale-out or restart re-calls the model] → Acceptable at prototype scale. Calls are bounded to one per location/units/hour per instance.
- [The summary's forecast is fetched separately from the displayed one and could differ slightly within the hour] → Both come from the same 10-minute revalidated data within the same hour key. Accepted.
- [The model may still hallucinate numbers despite instructions] → Low temperature, a compact input containing only the relevant numbers, and an explicit "only numbers present" rule. The section is clearly labeled "AI summary".
- [Missing config logs on every dashboard render] → Acceptable noise that makes misconfiguration visible. The message names the missing variables and contains no secrets.
- [`DefaultAzureCredential` probing slows the first call locally] → The summary is off the critical path, and the client timeout (10 s, 1 retry) bounds how long the skeleton stays visible.
- [A new dependency on Azure OpenAI alongside the "Open-Meteo only" data rule] → The model adds no weather data. It only rephrases Open-Meteo values, and the attribution footer is unchanged.

## Migration Plan

1. Merge with no env vars set. Production behaves exactly as today, because the summary section is absent and a config error is logged.
2. Out of band: create an Azure OpenAI resource and a chat model deployment, enable a system-assigned managed identity on the App Service, grant it `Cognitive Services OpenAI User` on the resource, and set the three app settings.
3. Rollback: remove the app settings to disable the feature, or revert the commit. There is no data to migrate.
