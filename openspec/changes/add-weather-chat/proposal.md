# Proposal

## Why

The dashboard answers "what is the weather here" but not follow-up questions like "will it rain tomorrow?" or "what about Denver?". A small chat grounded in the same Open-Meteo data lets users ask those questions in plain language without the AI inventing weather from memory.

## What Changes

- New `POST /api/chat` endpoint: accepts `{ messages, context: { lat, lon, name, units } }` and returns `{ reply, toolCalls }`. Server-only; reuses the existing keyless Azure OpenAI client.
- Function calling with two tools backed by the existing Open-Meteo access layer: `search_locations(query)` and `get_forecast(lat, lon, units)`. Tool results are the same normalized location and forecast shapes the dashboard uses. The server runs model → tools → model for at most 4 tool rounds, then forces a final answer.
- System prompt rules: answer only from tool results; ask which place when a name is ambiguous; explain the 7-day forecast limit for later dates; default to the dashboard's location and units; state the location and day being answered; briefly decline non-weather requests; keep replies under ~80 words.
- Guardrails: at most 500 characters per user message and 10 messages per conversation; in-memory per-IP rate limit (20 requests / 5 minutes); tool arguments validated (latitude/longitude ranges, units enum, query length) before any Open-Meteo call.
- New client `ChatPanel` on the dashboard: collapsible, message list, input, loading state, 3 suggested questions, retry on failure. Conversation lives in component state only (no persistence).
- Tests for the tool loop (mocked AI client), input validation, and rate limiting.

## Capabilities

### New Capabilities
- `weather-chat`: Conversational weather Q&A on the dashboard, grounded in Open-Meteo tool results, including the chat API contract, answer rules, guardrails, and the chat panel UI.

### Modified Capabilities
<!-- None. The dashboard gains a panel, but no existing weather-dashboard or ai-summary requirement changes. -->

## Impact

- **New code**: `app/api/chat/route.ts`, `lib/ai/chat.ts` (tool loop, prompt, tool definitions), `lib/ai/chat-validation.ts` (request and tool-argument validation), `lib/rate-limit.ts`, `components/ChatPanel.tsx`, plus tests.
- **Reused**: `lib/ai/client.ts` (`getAiClient`), `lib/openmeteo.ts` (`searchLocations`, `getForecast`), `lib/location.ts` coordinate parsing, `lib/units.ts` units parsing.
- **Modified**: `app/page.tsx` mounts the panel with the active location and units; `README.md` documents the endpoint.
- **APIs**: adds `POST /api/chat`. No changes to existing endpoints.
- **Dependencies**: none new (uses existing `openai` SDK).
- **Cost/ops**: each chat request may make up to 5 model calls and several Open-Meteo calls; bounded by the guardrails above. Rate-limit state is per App Service instance and resets on restart.
- **Out of scope**: conversation persistence, streaming responses, authentication, shared/distributed rate limiting, changing the dashboard location from chat.
