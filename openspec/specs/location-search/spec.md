# location-search Specification

## Purpose

Lets users find a place by name, pick it from a list of matches, and land on a shareable URL that identifies the active location, with a sensible default when none is given.

## Requirements

### Requirement: Geocode endpoint returns matching locations
The system SHALL expose `GET /api/geocode?q=<query>` that returns HTTP 200 with a JSON body `{ "results": Location[] }`, containing at most 5 locations matching the query, in the order provided by the Open-Meteo Geocoding API. Each `Location` SHALL contain `name`, `country`, `lat`, `lon`, and `timezone`, and SHALL contain `region` when the upstream provides a first-level administrative area.

#### Scenario: City with many matches
- **WHEN** a client requests `GET /api/geocode?q=London`
- **THEN** the response status is 200
- **AND** `results` contains between 1 and 5 locations
- **AND** each location has `name`, `country`, `lat`, `lon`, and `timezone`

#### Scenario: Ambiguous US city name
- **WHEN** a client requests `GET /api/geocode?q=Springfield`
- **THEN** the response status is 200
- **AND** `results` contains several locations whose `region` values are different US states

#### Scenario: Region is mapped from the first administrative level
- **WHEN** the upstream returns a match with `admin1` set to "Missouri"
- **THEN** that location's `region` is "Missouri"

#### Scenario: Region omitted when upstream has none
- **WHEN** the upstream returns a match without `admin1`
- **THEN** that location has no `region` value

### Requirement: Geocode endpoint returns an empty list when nothing matches
The system SHALL respond with HTTP 200 and `{ "results": [] }` when the geocoding service reports no matches, including when the upstream response omits the `results` field.

#### Scenario: No matches upstream
- **WHEN** a client requests `GET /api/geocode?q=zzzzqqq` and the upstream response has no `results` field
- **THEN** the response status is 200
- **AND** the body is `{ "results": [] }`

### Requirement: Geocode endpoint rejects short or missing queries
The system SHALL respond with HTTP 400 and a JSON body `{ "error": string }` when `q` is missing or shorter than 2 characters after trimming whitespace, and SHALL NOT call the geocoding service in that case.

#### Scenario: One-character query
- **WHEN** a client requests `GET /api/geocode?q=L`
- **THEN** the response status is 400
- **AND** the body contains an `error` message
- **AND** no upstream request is made

#### Scenario: Missing query
- **WHEN** a client requests `GET /api/geocode` without `q`
- **THEN** the response status is 400

#### Scenario: Whitespace-only padding
- **WHEN** a client requests `GET /api/geocode?q=%20a%20`
- **THEN** the response status is 400

### Requirement: Geocode endpoint rejects overly long queries
The system SHALL respond with HTTP 400 and `{ "error": string }` when the trimmed `q` is longer than 100 characters, without calling the geocoding service.

#### Scenario: Query over the limit
- **WHEN** a client requests `GET /api/geocode` with a `q` of 101 characters
- **THEN** the response status is 400
- **AND** no upstream request is made

### Requirement: Geocode endpoint reports upstream failure
The system SHALL respond with HTTP 502 and a JSON body `{ "error": string }` when the geocoding service returns a non-success status, cannot be reached, or returns an unparseable body. The error message SHALL be user-friendly and SHALL NOT include stack traces or upstream response details.

#### Scenario: Upstream returns 500
- **WHEN** a client requests `GET /api/geocode?q=London` and the upstream responds with status 500
- **THEN** the response status is 502
- **AND** the body contains a friendly `error` message

#### Scenario: Upstream unreachable
- **WHEN** a client requests `GET /api/geocode?q=London` and the upstream request fails with a network error
- **THEN** the response status is 502

### Requirement: Geocoding results are cached for one day
The system SHALL cache geocoding responses from the upstream service for 86400 seconds per distinct query.

#### Scenario: Upstream request carries a one-day cache lifetime
- **WHEN** a query is geocoded
- **THEN** the upstream request is issued with a cache lifetime of 86400 seconds

### Requirement: Browser never calls the geocoding service directly
The location search UI SHALL obtain suggestions only through the application's `/api/geocode` endpoint; the browser SHALL NOT send requests to Open-Meteo.

#### Scenario: Typing a query
- **WHEN** the user types "London" in the search input
- **THEN** the browser requests `/api/geocode?q=London`
- **AND** no browser request is sent to any `open-meteo.com` host

### Requirement: Search input is debounced and length-gated
The location search input SHALL wait until the user has stopped typing for 300ms before requesting suggestions, and SHALL NOT request suggestions while the trimmed input is shorter than 2 characters. A response for an outdated query SHALL NOT replace suggestions for the current query.

#### Scenario: One-character input
- **WHEN** the user types "L" and pauses
- **THEN** no suggestion request is made
- **AND** no dropdown is shown

#### Scenario: Rapid typing
- **WHEN** the user types "Lond" with less than 300ms between keystrokes and then pauses
- **THEN** exactly one suggestion request is made, for "Lond"

#### Scenario: Out-of-order responses
- **WHEN** a response for "Lon" arrives after the user has changed the input to "London"
- **THEN** the dropdown shows suggestions for "London" only

### Requirement: Suggestions are shown as a labeled dropdown
The location search SHALL display matches in a dropdown below the input, each labeled "Name, Region, Country", omitting the region segment when a location has no region.

#### Scenario: Match with region
- **WHEN** suggestions include a location named "Springfield" in region "Illinois", country "United States"
- **THEN** that option is labeled "Springfield, Illinois, United States"

#### Scenario: Match without region
- **WHEN** suggestions include a location named "Monaco" with no region in country "Monaco"
- **THEN** that option is labeled "Monaco, Monaco"

### Requirement: Empty results show a message
The location search SHALL display "No locations found" when a completed search for a query of 2 or more characters returns no results.

#### Scenario: No matches
- **WHEN** the user searches for "zzzzqqq" and the endpoint returns `{ "results": [] }`
- **THEN** the dropdown shows "No locations found"

### Requirement: Failed searches show a retry option
The location search SHALL display a friendly error message with a retry control when the suggestion request fails (non-success status or network error). Activating retry SHALL repeat the search for the current input.

#### Scenario: Upstream failure
- **WHEN** the endpoint responds with 502 for the current query
- **THEN** the dropdown shows a message that the search failed with a "Retry" control
- **AND** no stack trace or raw error detail is shown

#### Scenario: Retry succeeds
- **WHEN** the user activates "Retry" and the endpoint now responds with matches
- **THEN** the dropdown shows the matching suggestions

### Requirement: Suggestions are keyboard operable
The location search SHALL support keyboard interaction: Arrow Down and Arrow Up move the highlighted suggestion (wrapping at the ends), Enter selects the highlighted suggestion, and Escape closes the dropdown. The control SHALL expose combobox/listbox semantics to assistive technology.

#### Scenario: Navigate and select
- **WHEN** suggestions are shown and the user presses Arrow Down twice then Enter
- **THEN** the second suggestion is selected

#### Scenario: Wrap around
- **WHEN** the first suggestion is highlighted and the user presses Arrow Up
- **THEN** the last suggestion is highlighted

#### Scenario: Close with Escape
- **WHEN** the dropdown is open and the user presses Escape
- **THEN** the dropdown closes and the input keeps its text

#### Scenario: Enter with nothing highlighted
- **WHEN** the dropdown is open, no suggestion is highlighted, and the user presses Enter
- **THEN** no navigation occurs

### Requirement: Selecting a location updates the URL
Selecting a suggestion (by click, tap, or Enter) SHALL navigate to the current page with `lat`, `lon`, and `name` query parameters set to the chosen location, SHALL preserve an existing `units` parameter, and SHALL close the dropdown.

#### Scenario: Select with units present
- **WHEN** the current URL is `/?units=metric` and the user selects "London, England, United Kingdom" (51.50853, -0.12574)
- **THEN** the browser navigates to a URL whose query has `lat=51.50853`, `lon=-0.12574`, `name=London, England, United Kingdom` (URL-encoded), and `units=metric`

#### Scenario: Select without units
- **WHEN** the current URL has no `units` parameter and the user selects a location
- **THEN** the resulting URL has `lat`, `lon`, and `name` and no `units` parameter

### Requirement: Active location defaults to Northbrook
The system SHALL resolve the active location from the `lat`, `lon`, and `name` URL parameters. When `lat` or `lon` is missing or is not a valid coordinate (latitude in [-90, 90], longitude in [-180, 180]), the active location SHALL be Northbrook, IL (lat 42.128, lon -87.829). When coordinates are valid but `name` is missing, a coordinate-based label SHALL be used.

#### Scenario: No location in URL
- **WHEN** the user opens `/` with no query parameters
- **THEN** the active location is Northbrook, IL at 42.128, -87.829

#### Scenario: Location in URL
- **WHEN** the user opens `/?lat=51.50853&lon=-0.12574&name=London`
- **THEN** the active location is "London" at 51.50853, -0.12574

#### Scenario: Invalid coordinates
- **WHEN** the user opens `/?lat=abc&lon=-0.12574`
- **THEN** the active location is Northbrook, IL

#### Scenario: Out-of-range coordinates
- **WHEN** the user opens `/?lat=95&lon=10`
- **THEN** the active location is Northbrook, IL

#### Scenario: Coordinates without a name
- **WHEN** the user opens `/?lat=40&lon=-75`
- **THEN** the active location is at 40, -75 with a label derived from the coordinates
