# Spec Delta

## Purpose

Lets dashboard users ask plain-language weather questions and get short answers grounded only in Open-Meteo location and forecast data, with guardrails that keep the feature safe, cheap, and non-disruptive to the dashboard.

## ADDED Requirements

### Requirement: Chat endpoint contract
The system SHALL expose `POST /api/chat` accepting JSON `{ messages, context: { lat, lon, name, units } }`, where `messages` is an ordered list of `{ role: "user" | "assistant", content }` ending with a user message. On success it SHALL return HTTP 200 with `{ reply, toolCalls }`: `reply` is non-empty plain text and `toolCalls` lists each tool invoked, in order, with its name and arguments.

#### Scenario: Successful chat turn
- **WHEN** a client posts a valid conversation and context and the AI service is available
- **THEN** the response is 200 with a non-empty `reply` string
- **AND** `toolCalls` is an array whose entries each contain the tool `name` and its `arguments`

#### Scenario: Malformed body
- **WHEN** the body is not JSON, `messages` is missing or empty, the last message is not from the user, or a message has an unknown role or non-string content
- **THEN** the response is 400 with a friendly `error` message and the AI service is not called

### Requirement: Chat context is validated
The `context` SHALL require `lat` within [-90, 90], `lon` within [-180, 180], `units` of `imperial` or `metric`, and a non-empty `name` of at most 200 characters. Invalid context SHALL be rejected with 400 before any AI or Open-Meteo call.

#### Scenario: Out-of-range context
- **WHEN** a request has `context.lat` of 120 or `context.units` of `kelvin`
- **THEN** the response is 400 with a friendly `error` and no AI or Open-Meteo call is made

### Requirement: Message size and conversation length limits
Each user message SHALL be at most 500 characters after trimming and SHALL not be blank. Each assistant message SHALL be at most 1,000 characters. A conversation SHALL contain at most 10 messages. Violations SHALL be rejected with 400 and a friendly, specific `error`, without calling the AI service.

#### Scenario: Over-long message
- **WHEN** the latest user message is 501 characters long
- **THEN** the response is 400 with an error explaining the 500-character limit
- **AND** the AI service is not called

#### Scenario: Conversation too long
- **WHEN** a request contains 11 messages
- **THEN** the response is 400 with an error explaining the conversation limit and suggesting starting a new chat

### Requirement: Per-client rate limiting
The chat endpoint SHALL allow at most 20 requests per client IP in any 5-minute window. Further requests in that window SHALL receive 429 with a friendly `error` and a `Retry-After` header, without calling the AI service. Limits are tracked in memory per server instance.

#### Scenario: Limit exceeded
- **WHEN** the same client IP sends a 21st chat request within 5 minutes
- **THEN** the response is 429 with a `Retry-After` header and a friendly `error`
- **AND** the AI service is not called

#### Scenario: Window resets
- **WHEN** 5 minutes have passed since a client's earliest counted request
- **THEN** that client can make chat requests again

#### Scenario: Clients are independent
- **WHEN** one client IP has exhausted its limit
- **THEN** requests from a different client IP are still accepted

### Requirement: Weather tools backed by Open-Meteo
The model SHALL have two tools: `search_locations(query)` returning matching places, and `get_forecast(lat, lon, units)` returning the forecast. Results SHALL use the same normalized location and forecast shapes the dashboard uses (current conditions, next 24 hours, 7 days), never raw provider responses.

#### Scenario: Forecast tool result
- **WHEN** the model calls `get_forecast` with valid arguments
- **THEN** the forecast for those coordinates and units is fetched through the server's Open-Meteo access layer
- **AND** the normalized forecast is returned to the model as the tool result

### Requirement: Tool arguments are validated before use
Tool arguments SHALL be validated before any Open-Meteo call: `lat` within [-90, 90], `lon` within [-180, 180], `units` of `imperial` or `metric`, and `query` of 2-100 characters. Invalid arguments or tool failures SHALL return an error result to the model instead of failing the request.

#### Scenario: Invalid tool arguments
- **WHEN** the model calls `get_forecast` with `lat` 200 or `units` "kelvin"
- **THEN** Open-Meteo is not called
- **AND** the model receives an error tool result and the loop continues

#### Scenario: Upstream tool failure
- **WHEN** Open-Meteo fails during a tool call
- **THEN** the model receives an error tool result and can tell the user weather data is unavailable

### Requirement: Bounded tool loop
The server SHALL run model, then requested tools, then model again, feeding each tool result back. It SHALL execute at most 4 tool rounds per request; if the model still requests tools after the 4th round, it SHALL request a final answer with tools disabled.

#### Scenario: Tool result fed back
- **WHEN** the model requests `get_forecast` and then answers
- **THEN** the second model call includes the tool result tied to that tool call
- **AND** the reply is the model's final text

#### Scenario: Round limit enforced
- **WHEN** the model requests a tool on every call
- **THEN** tools are executed for exactly 4 rounds
- **AND** one more model call is made with tools disabled and its text is returned as `reply`

### Requirement: Answers grounded in tool results
Instructions SHALL require answers only from tool results in the current conversation, never from memory or general knowledge; with no usable data, the reply SHALL say so rather than guess.

#### Scenario: Question about current location
- **WHEN** the user asks "Will it rain tomorrow?" without naming a place
- **THEN** `get_forecast` is called with the context's coordinates and units
- **AND** the reply is based on that forecast's data

### Requirement: Defaults to the dashboard location and units
When the user does not name a place or units, the chat SHALL use the dashboard's current location and units from `context`. Every answer SHALL state the location and the day it refers to.

#### Scenario: Default location named in reply
- **WHEN** the dashboard shows Northbrook, IL in imperial and the user asks "How windy is it?"
- **THEN** the forecast is requested for Northbrook's coordinates in imperial units
- **AND** the reply names Northbrook and the day being described

### Requirement: Ambiguous places are clarified
When a named place matches multiple distinct locations, the reply SHALL ask the user which one they mean, listing the candidates, instead of choosing one.

#### Scenario: Ambiguous city
- **WHEN** the user asks "Weather in Springfield?"
- **THEN** `search_locations` is called for "Springfield"
- **AND** the reply asks which Springfield, naming candidates such as their state or country, and gives no forecast yet

### Requirement: Seven-day forecast horizon is explained
When asked about a date beyond the 7-day forecast, the reply SHALL explain that forecasts cover only the next 7 days and SHALL not invent or estimate values for that date.

#### Scenario: Date beyond the horizon
- **WHEN** the user asks "High in Chicago in 3 weeks?"
- **THEN** the reply explains that the forecast covers only 7 days
- **AND** it gives no temperature for that date

### Requirement: Off-topic requests are declined
Requests unrelated to weather SHALL be declined briefly with a pointer back to weather questions, without calling tools.

#### Scenario: Non-weather request
- **WHEN** the user asks "Write me a poem"
- **THEN** the reply briefly declines and invites a weather question
- **AND** `toolCalls` is empty

### Requirement: Replies are short
Instructions SHALL require plain-text replies under about 80 words with no markdown headings or tables.

#### Scenario: Reply length
- **WHEN** the user asks for this week's forecast
- **THEN** the reply is plain text of roughly 80 words or fewer

### Requirement: AI access is server-only and keyless
Chat SHALL call the AI service only from the server using the existing Entra ID token-based configuration; no API key is used and the browser never calls the AI service or Open-Meteo directly.

#### Scenario: Browser isolation
- **WHEN** a user sends a chat message
- **THEN** the browser calls only `/api/chat`, not the AI service or Open-Meteo

### Requirement: AI failures return a friendly error
If AI configuration is missing or the AI service fails or returns no text, the endpoint SHALL log the error server-side and respond with a non-200 status and a friendly `error`, with no stack trace or internal detail.

#### Scenario: AI service error
- **WHEN** the AI service times out or errors during a chat request
- **THEN** the response is 502 with a friendly `error` and no stack trace
- **AND** the error is written to the server log

#### Scenario: AI not configured
- **WHEN** any required Azure OpenAI setting is unset
- **THEN** the response is 503 with a friendly `error` saying chat is unavailable

### Requirement: Collapsible chat panel on the dashboard
The dashboard SHALL include a chat panel, collapsed by default, that expands to show a message list, a text input with send control, and 3 suggested questions while the conversation is empty. Selecting a suggestion SHALL send it as the user's message.

#### Scenario: Open panel and use a suggestion
- **WHEN** a user expands the chat panel with no messages and selects a suggested question
- **THEN** that question appears as a user message and is sent to `/api/chat`

#### Scenario: Collapsed by default
- **WHEN** the dashboard loads
- **THEN** the chat panel is collapsed and the rest of the dashboard is unaffected

### Requirement: Chat uses the dashboard's active location and units
Each chat request from the panel SHALL include the dashboard's current location coordinates, label, and units as `context`.

#### Scenario: After switching units
- **WHEN** the user switches the dashboard to metric and sends a chat message
- **THEN** the request `context.units` is `metric`

### Requirement: Panel shows loading and blocks duplicate sends
While a reply is pending, the panel SHALL show a loading indicator and SHALL disable sending.

#### Scenario: Pending reply
- **WHEN** a message has been sent and no response has arrived
- **THEN** a loading indicator is visible and the send control is disabled

### Requirement: Panel validates input before sending
The panel SHALL prevent sending blank messages, SHALL show a friendly error when a message exceeds 500 characters, and SHALL tell the user to start a new chat when the conversation limit is reached.

#### Scenario: Over-long message in the panel
- **WHEN** the user types a 501-character message and tries to send it
- **THEN** a friendly error explains the 500-character limit and the conversation is unchanged

### Requirement: Panel failures are recoverable and contained
When a chat request fails, the panel SHALL show a friendly message with a retry control that resends the last user message. Chat failures SHALL not affect any other dashboard section.

#### Scenario: AI failure with retry
- **WHEN** `/api/chat` returns an error or the network fails
- **THEN** the panel shows a friendly error with a "Retry" control
- **AND** all other dashboard sections remain visible and working

#### Scenario: Retry succeeds
- **WHEN** the user selects "Retry" and the request succeeds
- **THEN** the reply appears and the error message is cleared

### Requirement: Conversation is ephemeral
The conversation SHALL be kept only in the panel's in-browser state; it SHALL not be persisted on the server or in browser storage, and reloading the page SHALL start an empty conversation.

#### Scenario: Reload clears chat
- **WHEN** a user reloads the dashboard after chatting
- **THEN** the chat panel shows no previous messages
