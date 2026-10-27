# ai-summary Specification

## Purpose

Gives dashboard users a short, plain-language AI briefing of the active location's forecast without slowing down or breaking the rest of the dashboard.

## Requirements

### Requirement: Summary appears above current conditions
When a forecast renders successfully and AI is configured, the dashboard SHALL show a section labeled "AI summary" directly above the current-conditions card, containing a 2-3 sentence plain-language briefing of the active location's forecast.

#### Scenario: Successful summary
- **WHEN** a user opens a dashboard URL with a valid location and AI configured and available
- **THEN** a section labeled "AI summary" appears above the current-conditions card
- **AND** it contains two to three sentences of plain text about that location's weather

### Requirement: Summary content is grounded in displayed forecast data
The briefing SHALL be generated only from the active forecast's current conditions, the next 24 hourly points, and the first 3 days, and SHALL be instructed to prioritize rain timing, large temperature swings, and wind. It SHALL use only numbers present in that data and the selected units, with no emojis and no advice beyond weather.

#### Scenario: Metric units in summary
- **WHEN** the summary is generated for a dashboard with `units=metric`
- **THEN** the data sent to the model labels temperatures in °C and wind in km/h
- **AND** the instructions require keeping those units and using only numbers present in the data

#### Scenario: Compact model input
- **WHEN** a summary is requested
- **THEN** the model input contains current conditions, exactly 24 hourly points, and at most 3 daily entries
- **AND** it does not contain the remaining days or raw provider responses

### Requirement: AI access uses keyless identity
The AI service SHALL be called only from the server, authenticated with a Microsoft Entra ID token for the Cognitive Services scope. Endpoint, deployment, and API version SHALL come from environment configuration. No API key SHALL be read, stored, or sent, and the browser SHALL never call the AI service.

#### Scenario: No key-based auth
- **WHEN** the application calls the AI service
- **THEN** the request is authorized with a bearer token from the runtime identity and carries no API key

#### Scenario: Browser isolation
- **WHEN** a dashboard with a summary loads in the browser
- **THEN** the browser makes no requests to the AI service endpoint

### Requirement: Summaries are cached per location, units, and hour
Summaries SHALL be reused for the same location, units, and forecast-local hour, and SHALL be regenerated when any of those changes.

#### Scenario: Repeat view within the hour
- **WHEN** two requests for the same location and units occur within the same forecast-local hour on the same server instance
- **THEN** the AI service is called at most once and both views show the same summary

#### Scenario: Switching location or units
- **WHEN** a user switches location, or switches between imperial and metric
- **THEN** a summary for the new location and units is shown
- **AND** the settled view contains no summary from the previous location or units

### Requirement: Summary never delays the dashboard
The summary SHALL load independently of other weather sections. While it is pending, a one-line skeleton with no fabricated text SHALL occupy its slot, and the other forecast sections SHALL render as soon as forecast data is available.

#### Scenario: Slow model response
- **WHEN** the forecast is available but the AI response is delayed
- **THEN** current conditions, hourly chart, daily list, and sun times are displayed
- **AND** a one-line loading placeholder is shown where the summary will appear

### Requirement: AI failures are silent to users
If AI configuration is missing or any AI call fails, the summary section SHALL render nothing, the failure SHALL be logged server-side, and the rest of the dashboard SHALL render normally with no error banner caused by the AI failure.

#### Scenario: AI call fails
- **WHEN** the AI service returns an error or times out while the forecast succeeds
- **THEN** no "AI summary" section or error text is shown
- **AND** all other dashboard sections render normally
- **AND** the error is written to the server log

#### Scenario: AI not configured
- **WHEN** any of `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT`, or `AZURE_OPENAI_API_VERSION` is unset
- **THEN** the dashboard renders without an "AI summary" section and logs the missing configuration
