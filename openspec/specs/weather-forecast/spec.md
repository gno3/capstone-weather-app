# weather-forecast Specification

## Purpose

Provides consistent, unit-aware Open-Meteo forecasts for the dashboard and API consumers, including local forecast times and readable weather conditions.

## Requirements

### Requirement: Forecasts come from Open-Meteo on the server
The system SHALL retrieve forecasts from `https://api.open-meteo.com/v1/forecast` on the server, without API keys, using the selected latitude and longitude, automatic timezone selection, and seven forecast days. Browser code SHALL NOT request Open-Meteo directly.

#### Scenario: Forecast request
- **WHEN** a forecast is requested for latitude 38.627 and longitude -90.199
- **THEN** the provider request includes `latitude=38.627`, `longitude=-90.199`, `timezone=auto`, and `forecast_days=7`
- **AND** no browser request is sent to an Open-Meteo host

### Requirement: Forecast data contains the requested measurements
The forecast SHALL contain current temperature, apparent temperature, humidity, wind speed and direction, weather code and day/night status; hourly temperature, precipitation probability and weather code; and daily weather code, high/low temperature, maximum precipitation probability, sunrise and sunset.

#### Scenario: Successful response mapping
- **WHEN** the provider returns a valid forecast
- **THEN** current measurements map from `temperature_2m`, `apparent_temperature`, `relative_humidity_2m`, `wind_speed_10m`, `wind_direction_10m`, `weather_code`, and `is_day`
- **AND** hourly measurements map from `temperature_2m`, `precipitation_probability`, and `weather_code`
- **AND** daily measurements map from `weather_code`, `temperature_2m_max`, `temperature_2m_min`, `precipitation_probability_max`, `sunrise`, and `sunset`

### Requirement: Forecasts expose a normalized unit-aware contract
Successful forecasts SHALL expose `current`, `hourly`, `daily`, and `units` with normalized field names, timestamps, and unit labels rather than raw parallel provider arrays. The contract SHALL retain the provider timezone for location-local presentation.

#### Scenario: Normalized forecast response
- **WHEN** a valid forecast is retrieved
- **THEN** `current` is one measurement object, `hourly` is an array of measurement objects, and `daily` is an array of seven day objects
- **AND** unit labels describe the selected temperature and wind units
- **AND** the timezone and location-local timestamps are retained

### Requirement: Hourly forecast starts at the provider current time
The hourly forecast SHALL consist of the 24 consecutive points beginning at the first hourly timestamp greater than or equal to `current.time`. Comparison SHALL use the provider's local timestamps rather than the server or browser timezone.

#### Scenario: Current time at an hour boundary
- **WHEN** provider current time is `2026-10-26T14:00` and hourly data begins at local midnight
- **THEN** the first hourly point is `2026-10-26T14:00`
- **AND** the last of the 24 points is `2026-10-27T13:00`

#### Scenario: Current time between hour boundaries
- **WHEN** provider current time is `2026-10-26T14:15`
- **THEN** the first hourly point is `2026-10-26T15:00`
- **AND** exactly 24 consecutive points are returned

#### Scenario: Current time near midnight
- **WHEN** provider current time is `2026-10-26T23:45`
- **THEN** the hourly forecast starts at `2026-10-27T00:00`, not the first midnight in the response

### Requirement: Selected units control provider values and labels
Imperial forecasts SHALL request Fahrenheit, mph, and inches. Metric forecasts SHALL use Celsius, km/h, and millimeters. The system SHALL NOT merely relabel numbers from another unit system.

#### Scenario: Imperial request
- **WHEN** imperial units are selected
- **THEN** the provider request includes `temperature_unit=fahrenheit`, `wind_speed_unit=mph`, and `precipitation_unit=inch`
- **AND** forecast temperature and wind labels are Fahrenheit and mph

#### Scenario: Metric request
- **WHEN** metric units are selected
- **THEN** provider metric defaults or their explicit equivalents are used
- **AND** forecast temperature and wind labels are Celsius and km/h

### Requirement: Forecast responses have a ten-minute cache lifetime
The system SHALL request a 600-second server revalidation lifetime for each distinct provider forecast request. Different coordinates or unit systems SHALL NOT share an incorrectly keyed forecast.

#### Scenario: Cache settings
- **WHEN** a forecast provider request is made
- **THEN** its server revalidation lifetime is 600 seconds
- **AND** latitude, longitude, and unit selection distinguish provider requests

### Requirement: Forecast API validates coordinates and units
`GET /api/forecast?lat=&lon=&units=` SHALL return 400 with `{ "error": string }` for missing, blank, non-finite, non-numeric, or out-of-range coordinates, or explicitly unsupported units, without contacting the provider. Latitude SHALL be within [-90, 90] and longitude within [-180, 180]. Omitted units SHALL default to imperial; accepted explicit values SHALL be `imperial` and `metric`.

#### Scenario: Invalid parameters
- **WHEN** either coordinate is absent, blank, `abc`, `NaN`, infinite, or outside its range, or units is empty or `kelvin`
- **THEN** the response status is 400 with a friendly JSON error
- **AND** no provider request is made

#### Scenario: Valid boundary coordinates
- **WHEN** the API receives `lat=90&lon=-180&units=metric`
- **THEN** it requests a metric forecast for those coordinates

#### Scenario: Default API units
- **WHEN** the API receives `lat=0&lon=0` with no units parameter
- **THEN** it requests an imperial forecast

### Requirement: Forecast API returns normalized forecasts and upstream errors
The API SHALL return 200 with the normalized forecast on success. Network failures, unsuccessful provider statuses, invalid JSON, or unusable forecast structures SHALL return 502 with `{ "error": string }`. Errors SHALL be friendly and SHALL NOT expose stack traces or raw provider details.

#### Scenario: Successful API forecast
- **WHEN** valid parameters are supplied and the provider returns valid data
- **THEN** the API returns 200 with `current`, `hourly`, `daily`, `units`, and timezone metadata

#### Scenario: Upstream failures
- **WHEN** the provider is unreachable, returns 500, returns invalid JSON, or lacks required measurement arrays
- **THEN** the API returns 502 with a friendly error instead of a partial success-shaped forecast

### Requirement: Supported WMO codes have readable conditions
The system SHALL provide a nonempty label and emoji for every Open-Meteo weather code: 0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, and 99. Clear and partly cloudy conditions SHALL have day/night variants.

#### Scenario: Complete code coverage
- **WHEN** any listed supported code is described
- **THEN** it returns its weather label and emoji, not an unknown-condition fallback

#### Scenario: Day and night conditions
- **WHEN** clear code 0 or partly cloudy code 2 is described for daytime and nighttime
- **THEN** each description has an appropriate day/night variant
