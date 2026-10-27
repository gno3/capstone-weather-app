# Tasks

## 1. Azure OpenAI client

- [x] 1.1 Create `lib/ai/client.ts` exporting `AiConfigError` and memoized `getAiClient()`, which returns `{ client, deployment }`. The client is an `AzureOpenAI` built from `AZURE_OPENAI_ENDPOINT`/`AZURE_OPENAI_DEPLOYMENT`/`AZURE_OPENAI_API_VERSION` with `azureADTokenProvider: getBearerTokenProvider(new DefaultAzureCredential(), "https://cognitiveservices.azure.com/.default")`, `timeout: 10_000`, and `maxRetries: 1`, and never sets `apiKey`. Verify that `npx tsc --noEmit` passes and that `grep -ri "apiKey\|api-key\|AZURE_OPENAI_KEY" lib/ai` returns nothing.
- [x] 1.2 Add `lib/ai/client.test.ts` (mocking `@azure/identity`). Cover three cases: missing env vars throw `AiConfigError` naming the missing variables; with all vars set, the token provider is requested for the Cognitive Services scope; the client is reused across calls. Verify that `npx vitest run lib/ai/client.test.ts` passes.

## 2. Forecast summarizer

- [x] 2.1 Create `lib/ai/summary.ts` with `buildSummaryInput(forecast, locationName)`, which produces the compact shape from design Decision 2: units, current conditions, all 24 hourly points, and the first 3 daily entries, with text condition labels and no emojis or codes. Also add a `SUMMARY_SYSTEM_PROMPT` constant covering 2-3 sentences, plain language, rain timing, temperature swings, wind, only numbers present, units as given, no emojis, and no non-weather advice. Verify with `npx tsc --noEmit`.
- [x] 2.2 Implement `summarizeForecast(forecast, locationName): Promise<string>`. It calls `chat.completions.create({ model: deployment, temperature: 0.2, max_completion_tokens: 120, messages: [system, user] })` and returns the trimmed content. It throws on an empty response and lets client errors propagate. Verify with the tests in 2.3.
- [x] 2.3 Add `lib/ai/summary.test.ts` using `vi.mock("./client")` and the `tests/fixtures/forecast.json` forecast normalized with `mapForecast(..., "metric")`. It must assert:
  - the user message JSON contains current conditions, exactly 24 hourly points, at most 3 days, °C/km/h units, and the location name, and contains no `emoji`/`weatherCode` fields or day 4+;
  - the system prompt includes the content rules;
  - the request uses the deployment, a low temperature, and `max_completion_tokens` ≤ 120;
  - a rejected `create` rejects `summarizeForecast` with the same error;
  - an empty completion rejects.

  Verify that `npx vitest run lib/ai/summary.test.ts` passes.

## 3. Cached summary and dashboard section

- [x] 3.1 Create `lib/ai/cached-summary.ts` exporting `getCachedSummary(lat, lon, units, locationName, hour)` with `"use cache"` and `cacheLife("hours")`. It calls `getForecast` and then `summarizeForecast`, following design Decision 3. Verify that `npm run build` succeeds with no Cache Components errors.
- [x] 3.2 Add `AiSummarySkeleton` to `components/WeatherSkeleton.tsx`: a single one-line pulse bar in card chrome with `role="status"`, `aria-label="Loading AI summary"`, and no text. Verify with `npm run lint`.
- [x] 3.3 Create `components/AiSummary.tsx`, an async server component. It awaits `getCachedSummary` and renders `<section aria-labelledby>` with an `<h2>` reading "AI summary" and a plain-text `<p>`. On any error it calls `console.error("[ai-summary] …")` and returns `null`. Verify with the tests in 3.4.
- [x] 3.4 Add `components/AiSummary.test.tsx`, which mocks `@/lib/ai/cached-summary`. When the mock rejects, `await AiSummary(props)` must return `null` and `console.error` must be called. When it resolves, `renderToStaticMarkup` output must contain "AI summary" and the summary text. Verify that `npx vitest run components/AiSummary.test.tsx` passes.
- [x] 3.5 In `app/page.tsx`, pass `location.label` into `ForecastContent`. Compute `hour = forecast.current.time.slice(0, 13)` and render `<Suspense fallback={<AiSummarySkeleton />}><AiSummary … /></Suspense>` directly above `<CurrentCard>`, inside the existing keyed boundary. Verify that `npm run build` and `npm run lint` pass.
- [x] 3.6 Update `README.md`:
  - Add an "AI summary" subsection covering the three env vars (with a `.env.local` example and no keys) and the fact that the feature is hidden when unset.
  - Explain local auth via `az login`, and recommend a chat model deployment (not a reasoning model).
  - Under "Deploy to Azure", list the prerequisites: an Azure OpenAI resource and deployment, App Service system-assigned identity, the `Cognitive Services OpenAI User` role, and the three app settings.

  Verify that the README's documented env var names match `lib/ai/client.ts`.

## 4. Integration checks

- [x] 4.1 Run `npm test` and `npm run build`, and verify both pass with the full suite.
- [x] 4.2 With AI env vars unset, run the app against `scripts/mock-open-meteo.mjs` (as in README "Checking the dashboard locally"). Verify that the dashboard renders all sections, shows no "AI summary" section or error banner, and that the server log contains the `[ai-summary]` config error.
- [x] 4.3 With valid env vars and `az login`, check these behaviors:
  - The "AI summary" section appears above "Current conditions", and the one-line skeleton shows first while the other sections are already visible.
  - A reload within the hour does not trigger a second model call (check the server log or network metrics).
  - Switching location and switching units each produce a new summary in the matching units.
  - Temporarily setting a wrong `AZURE_OPENAI_DEPLOYMENT` hides the section while the rest of the dashboard renders. Restoring it brings the summary back without a stale cached failure.
- [x] 4.4 Check at a 375px-wide viewport that the summary section and its skeleton cause no horizontal scrolling.
