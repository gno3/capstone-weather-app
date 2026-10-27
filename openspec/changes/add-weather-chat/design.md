# Design

## Context

See proposal.md (Why) and `specs/weather-chat/spec.md` (requirements). Relevant current state:

- `lib/ai/client.ts` exposes `getAiClient()` → `{ client: AzureOpenAI, deployment }`, keyless (Entra ID), 10 s timeout, 1 retry, and throws `AiConfigError` when settings are missing. `lib/ai/summary.ts` shows the house pattern: a pure input builder plus a thin call to `client.chat.completions.create`, tested by mocking `./client`.
- `lib/openmeteo.ts` provides `searchLocations(q)` → `Location[]` (max 5) and `getForecast(lat, lon, units)` → `Forecast` (current, 24 hourly points, 7 daily entries), both throwing `OpenMeteoError` and using fetch revalidation, so repeated tool calls are usually cache hits.
- `lib/location.ts` (`parseCoordinate`, `MAX_LATITUDE/LONGITUDE`) and `lib/units.ts` (`isUnitSystem`) already encode the range/enum rules used by `/api/forecast`.
- `app/page.tsx` resolves `{ lat, lon, label }` and `units` from the URL in the server `Dashboard` component; the page uses `cacheComponents: true`. POST route handlers are always dynamic.
- Vitest runs in the `node` environment with no DOM library; component tests use `renderToStaticMarkup`.

## Goals / Non-Goals

**Goals:**
- Keep the tool loop a pure-ish function with injected dependencies so it is testable without network or Next.js.
- Reuse existing validation, mapping, and client code instead of duplicating it.
- Bound cost per request: ≤ 5 model calls, ≤ 4 tool rounds, ≤ 4 tool calls per round.

**Non-Goals:**
- Streaming responses, persistence, multi-instance rate limiting, and DOM-level interaction tests (no jsdom/testing-library added).
- Letting chat change the dashboard's URL location.

## Decisions

### 1. Module layout
- `lib/ai/chat-validation.ts` — `parseChatRequest(body)` returning `{ ok: true, messages, context } | { ok: false, error }`, plus `parseSearchArgs` / `parseForecastArgs` for tool arguments. Exports limits (`MAX_MESSAGE_CHARS = 500`, `MAX_ASSISTANT_CHARS = 1000`, `MAX_MESSAGES = 10`, `MAX_NAME_CHARS = 200`) so `ChatPanel` imports the same numbers. Built on `parseCoordinate`/`isUnitSystem` for consistency with `/api/forecast` and `/api/geocode` (query 2–100 chars).
- `lib/ai/chat.ts` — `CHAT_SYSTEM_PROMPT` builder, `CHAT_TOOLS` (OpenAI function schemas), `runChat(messages, context, deps?)` → `{ reply, toolCalls }`. `deps` defaults to `{ getAiClient, searchLocations, getForecast }`; tests may pass fakes or use `vi.mock` like `summary.test.ts`.
- `lib/rate-limit.ts` — `createRateLimiter({ limit, windowMs, now = Date.now, maxKeys })` → `check(key)` returning `{ allowed: true } | { allowed: false, retryAfterSeconds }`; module-level `chatRateLimiter` instance (20 / 300 000 ms). Plus `clientIp(request)` helper.
- `app/api/chat/route.ts` — `POST`: rate limit → parse JSON → validate → `runChat` → map errors.
- `components/ChatPanel.tsx` (client) and a small pure helper module `components/chat-panel-state.ts` (draft validation, request building, error-to-message mapping) so logic is unit-testable in the node environment.

Alternative considered: one file for everything in the route. Rejected — mixes HTTP, AI orchestration, and validation, and makes the loop hard to test with a mocked client.

### 2. Tool loop
```
msgs = [system, ...conversation]
for round in 0..MAX_TOOL_ROUNDS (4):
    res = create({ model, messages: msgs, tools: CHAT_TOOLS, tool_choice: "auto", temperature: 0.2, max_completion_tokens: 300 })
    calls = res.message.tool_calls
    if no calls: return text (empty → error)
    msgs.push(res.message)                       # assistant message with tool_calls
    for call in calls (first 4; extras get an error result):
        msgs.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await execute(call)) })
final = create({ ..., tools: CHAT_TOOLS, tool_choice: "none" })
return final text
```
- Calls within a round run with `Promise.all`; a round counts once regardless of how many calls it has.
- `execute` never throws: bad JSON arguments, failed validation, unknown tool name, or `OpenMeteoError` become `{ error: "<short reason>" }`. This lets the model explain ("weather data is unavailable") rather than failing the request (spec: Tool arguments are validated before use).
- Successful results are the mapped types serialized as-is: `{ results: Location[] }` and the `Forecast`. No reshaping, so the chat sees exactly what the dashboard shows. `Forecast` is small (24 hourly + 7 daily), so token cost is acceptable.
- `toolCalls` in the response is `{ name, arguments }[]` for every call, where `arguments` is the parsed object (or `{}` if unparsable). Results are not echoed to the browser.
- After round 4, `tool_choice: "none"` keeps the tools declared (required because history contains tool messages) but forces text. Alternative — returning a canned "I couldn't finish" message — rejected because the model usually has enough data by then.
- AI errors (`AiConfigError`, SDK errors, empty final text) propagate out of `runChat`; the route maps them.

### 3. System prompt and context
The prompt is static rules plus a final context block that the server builds from validated `context`:
```
Dashboard location (default): {"name":"Northbrook, IL","lat":42.128,"lon":-87.829}
Dashboard units (default): imperial
```
The name is JSON-encoded and described as data, which limits prompt-injection through `name`. Rules (from the request): answer only from tool results in this conversation, never memory; call `get_forecast` before answering any weather question; if `search_locations` returns several distinct places, ask which one, listing up to 5 with region/country; forecast covers today plus the next 6 days in the location's local time (daily[0] is today), so for later dates say so and give no numbers; default to dashboard location/units; name the location and day in each answer; briefly decline non-weather requests without calling tools; plain text, under ~80 words, no markdown headings/tables; keep units as given.
- "Today" comes from the forecast's `current.time` (location-local), not the server clock, which avoids UTC/timezone mistakes. The prompt notes this.
- Behavioral rules (ambiguity, 7-day horizon, decline, length) are enforced by instructions, so they are tested by asserting the prompt contains each rule and by manual scenario checks; they can't be unit-tested deterministically.

### 4. Validation and HTTP mapping
| Condition | Status | Body |
|---|---|---|
| Rate limited | 429 + `Retry-After` | `{ error: "Too many questions. Try again in a few minutes." }` |
| Bad JSON / shape / context / limits | 400 | `{ error: <specific friendly message> }` |
| `AiConfigError` | 503 | `{ error: "Chat is unavailable right now." }` |
| Any other AI failure or empty reply | 502 | `{ error: "Chat couldn't answer right now. Please try again." }` |
Rate limiting runs first so abusive malformed requests still count. Errors are logged with `console.error("[chat] ...", message)` — no message contents logged, to avoid storing user text.

### 5. Rate limiter
Sliding-window log: `Map<ip, number[]>` of request timestamps; on `check`, drop timestamps older than `windowMs`, reject if `length >= limit` with `retryAfterSeconds = ceil((oldest + windowMs - now)/1000)`, else push `now`. To bound memory, when the map exceeds `maxKeys` (10 000) remove keys whose newest timestamp is expired, then the oldest-inserted keys. Client IP: first entry of `x-forwarded-for` (Azure App Service sets it and may append `:port` to IPv4 — strip it), else `x-real-ip`, else `"unknown"`.
Alternative: fixed window counter — simpler but allows 2× bursts at boundaries; the log is cheap at 20 entries per key.

### 6. ChatPanel
- Rendered in `Dashboard` (server) right after the heading row, outside the forecast `Suspense`, with props `{ lat, lon, name: location.label, units }`. Not keyed by location, so the conversation survives location/unit changes while each request uses the latest props as `context`.
- Collapsed by default via a toggle button with `aria-expanded`/`aria-controls`. Expanded: message list (`aria-live="polite"`), 3 suggestions when empty ("Will it rain tomorrow?", "How windy is it today?", "What's the high this weekend?"), a textarea/input with a live character count, Send, and "New chat".
- State: `messages`, `draft`, `status: "idle" | "loading" | "error"`, `error`. Send validates the draft with the shared limits (blank → no-op; >500 → inline error; conversation would exceed 10 → prompt "New chat"), appends the user message, posts, then appends the reply. On failure the user message stays and a "Retry" button re-posts the same messages. `AbortController` cancels in-flight requests on unmount.
- Styling follows existing cards (rounded-xl, zinc borders, dark mode) and must work at 375 px.

## Risks / Trade-offs

- [Model ignores instructions (answers from memory, exceeds 80 words)] → low temperature, explicit rules, `max_completion_tokens` cap, and manual scenario checks; grounding is best-effort, not provable.
- [Prompt injection via user messages or `name`] → tools are read-only weather lookups with validated arguments; worst case is an off-topic reply. Name is JSON-encoded and length-capped.
- [In-memory rate limit is per instance and resets on restart/scale-out] → acceptable for a prototype; documented. Distributed limiting is a non-goal.
- [Spoofed `X-Forwarded-For` when not behind App Service] → acceptable for prototype; in Azure the front end sets the header.
- [Latency: up to 5 sequential model calls (10 s timeout each)] → most questions need 1–2 rounds; panel shows a loading state, and failures surface a retry.
- [Client can forge prior assistant messages] → capped at 1 000 chars and treated as conversation history only; no privileged effect.
- [Untested DOM interactions in ChatPanel] → logic lives in a pure helper with unit tests; interactions verified manually in the browser.

## Migration Plan

Additive. No new environment variables — chat uses the existing `AZURE_OPENAI_*` settings and the App Service managed identity role already granted for the summary. Deploy via the normal CI/CD pipeline; roll back by redeploying the previous build. If AI is unconfigured, the panel still renders and requests return 503 with a friendly message.
