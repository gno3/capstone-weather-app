# Tasks

## 1. Request and tool-argument validation

- [x] 1.1 Create `lib/ai/chat-validation.ts` exporting limits (`MAX_MESSAGE_CHARS` 500, `MAX_ASSISTANT_CHARS` 1000, `MAX_MESSAGES` 10, `MAX_NAME_CHARS` 200), `ChatMessage`/`ChatContext` types, and `parseChatRequest(body)` that rejects non-object bodies, empty/oversized `messages`, unknown roles, non-string or blank content, a last message not from the user, over-long user/assistant messages, and invalid context (lat/lon via `parseCoordinate`, units via `isUnitSystem`, name 1–200 chars) with friendly, specific errors; verify with `lib/ai/chat-validation.test.ts` covering each rejection plus a valid request (`npx vitest run lib/ai/chat-validation.test.ts`)
- [x] 1.2 Add `parseSearchArgs` (query trimmed, 2–100 chars) and `parseForecastArgs` (lat/lon ranges, units enum) that accept a raw JSON argument string and return `{ ok, value | error }`, tolerating invalid JSON; verify with tests for valid args, out-of-range lat/lon (e.g. lat 200), `units: "kelvin"`, missing fields, and malformed JSON

## 2. Rate limiter

- [x] 2.1 Create `lib/rate-limit.ts` with `createRateLimiter({ limit, windowMs, now, maxKeys })` (sliding-window log, `retryAfterSeconds` on rejection, bounded key count) and a module-level `chatRateLimiter` (20 per 5 minutes); verify with `lib/rate-limit.test.ts` using a fake clock: 20 allowed then 21st rejected with correct `retryAfterSeconds`, allowed again after the window, independent keys, and key eviction past `maxKeys`
- [x] 2.2 Add `clientIp(request)` (first `x-forwarded-for` entry with IPv4 `:port` stripped, then `x-real-ip`, then `"unknown"`); verify with tests for each header form including `"203.0.113.5:51234, 10.0.0.1"`

## 3. Tool loop and system prompt

- [x] 3.1 Create `lib/ai/chat.ts` with `CHAT_TOOLS` (`search_locations`, `get_forecast` function schemas, units enum) and `buildChatSystemPrompt(context)` containing all rules from design §3 and a JSON-encoded default-location/units block; verify with tests asserting the prompt includes the context name/coords/units and each rule (tool-only grounding, ambiguity question, 7-day horizon, default location/units, state location and day, decline non-weather, ~80 words)
- [x] 3.2 Implement tool execution: validate args with task 1.2 helpers, call `searchLocations` / `getForecast`, return `{ results: Location[] }` or the `Forecast` unchanged, and convert invalid args, unknown tools, and `OpenMeteoError` into `{ error }` results without throwing; verify with tests that invalid args never call Open-Meteo and that an upstream failure yields an error tool result
- [x] 3.3 Implement `runChat(messages, context, deps?)` per design §2 (max 4 tool rounds, ≤ 4 calls per round run in parallel, `tool_choice: "none"` final call, temperature 0.2, `max_completion_tokens` 300, empty reply throws) returning `{ reply, toolCalls: { name, arguments }[] }`; verify with `lib/ai/chat.test.ts` using a mocked `./client` (pattern from `summary.test.ts`): no-tool answer returns `toolCalls: []`; `get_forecast` call is executed with context coords and its result is sent back as a `tool` message with the matching `tool_call_id`; a model that always requests tools gets exactly 4 tool rounds then one `tool_choice: "none"` call (5 `create` calls total); AI errors propagate

## 4. Chat API route

- [x] 4.1 Create `app/api/chat/route.ts` `POST` handler: rate limit by `clientIp` (429 + `Retry-After`), parse JSON (400 on failure), `parseChatRequest` (400), `runChat`, map `AiConfigError` → 503 and other errors → 502 with friendly messages, log without message contents; verify with `app/api/chat/route.test.ts` (mock `@/lib/ai/chat` and reset the limiter) covering 200 success shape, 400 for an over-long message and 11 messages with `runChat` not called, 429 on the 21st request from one IP while another IP still succeeds, 503 and 502 bodies with no stack traces
- [x] 4.2 Document `POST /api/chat` in `README.md` under `## API` (request/response shape, limits, rate limit, error statuses, example `curl`) and mention the chat panel in the Dashboard/AI section; verify the documented `curl` returns the documented shape against `npm run dev`

## 5. Chat panel UI

- [x] 5.1 Create `components/chat-panel-state.ts` with pure helpers: `validateDraft(draft, messages)` (blank, >500 chars, conversation-limit cases using shared limits), `buildChatRequest(messages, context)`, `errorMessageFor(status | "network")` (429, 400 server message passthrough, 503, 502/other → retry message), and the 3 suggested questions; verify with `components/chat-panel-state.test.ts`
- [x] 5.2 Create `components/ChatPanel.tsx` (`"use client"`) per design §6: collapsed-by-default toggle with `aria-expanded`, message list with `aria-live`, suggestions when empty, input with character count, Send disabled while loading or blank, loading indicator, inline validation errors, friendly error with "Retry" that resends the same messages, "New chat" reset, `AbortController` cleanup, conversation in component state only; verify with `components/ChatPanel.test.tsx` (`renderToStaticMarkup`) that the initial render is collapsed and contains the toggle, and `npm run lint` passes
- [x] 5.3 Mount `ChatPanel` in `app/page.tsx` `Dashboard` after the heading row, outside the forecast `Suspense`, passing `lat`, `lon`, `location.label`, and `units`; read the relevant guide in `node_modules/next/dist/docs/` for client components under `cacheComponents` first; verify `npm run build` succeeds and the dashboard renders unchanged with the panel collapsed

## 6. Integration verification

- [x] 6.1 Run `npm test`, `npm run lint`, and `npm run build`; verify all pass
- [x] 6.2 With Azure OpenAI configured and `npm run dev`, exercise the spec scenarios in the browser at 375 px and desktop: "Will it rain tomorrow?" (calls `get_forecast` with the dashboard location, reply names location and day), "Weather in Springfield?" (asks which one), "High in Chicago in 3 weeks?" (explains the 7-day limit), "Write me a poem" (declined, no tool calls), a 501-character message (friendly error), and a units switch (next request uses the new units); verify each by the reply and the `toolCalls` in the network response, and that the browser makes no requests to Open-Meteo or Azure OpenAI
- [x] 6.3 Unset one `AZURE_OPENAI_*` variable (or point the endpoint at an unreachable host), send a chat message, and verify the panel shows the retry message while every other dashboard section still renders
