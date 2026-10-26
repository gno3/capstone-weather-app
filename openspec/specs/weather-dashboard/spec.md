# weather-dashboard Specification

## Purpose

Lets users inspect current conditions and upcoming weather for a shareable URL location, change units, and recover from temporary forecast failures on mobile and desktop.

## Requirements

### Requirement: Dashboard reflects the URL location
The dashboard SHALL display weather for the active `lat`, `lon`, and `name` URL parameters using the existing location resolution behavior. Missing or invalid coordinates SHALL retain the Northbrook, IL fallback. Location changes SHALL update the heading and every weather section consistently.

#### Scenario: Default dashboard
- **WHEN** a user opens `/`
- **THEN** the dashboard shows Northbrook, IL weather at 42.128, -87.829

#### Scenario: Valid coordinates without a name
- **WHEN** a user opens `/?lat=40&lon=-75`
- **THEN** weather is for those coordinates and the heading uses the existing coordinate-based label

#### Scenario: Changing location
- **WHEN** a user selects London from location search while metric units are selected
- **THEN** the URL changes to London's coordinates and label while preserving `units=metric`
- **AND** current conditions, the hourly chart, the daily list, and sunrise/sunset all update to London
- **AND** the settled view contains no weather from the previous location

### Requirement: Current conditions are readable
The dashboard SHALL show current temperature, apparent temperature, relative humidity, wind speed and direction, and a weather label with emoji appropriate to the provider's day/night status.

#### Scenario: Current conditions
- **WHEN** a valid forecast is displayed
- **THEN** current temperature and apparent temperature include the selected temperature unit
- **AND** humidity is shown as a percentage and wind includes direction and the selected speed unit
- **AND** the weather description uses current weather code and day/night status

### Requirement: Hourly outlook displays temperature and precipitation together
The dashboard SHALL show the forecast's 24 hourly points with a temperature line on a left temperature axis and precipitation probability bars on a right percentage axis fixed to 0-100. Time labels SHALL represent the forecast location's local time, including across midnight.

#### Scenario: Dual-axis chart
- **WHEN** the hourly forecast is displayed
- **THEN** the chart contains 24 temperature values and 24 precipitation probability values
- **AND** temperature and precipitation have distinguishable series and correctly unit-labeled tooltips
- **AND** the precipitation axis spans 0 through 100

### Requirement: Seven-day outlook displays daily summaries
The dashboard SHALL show seven daily rows, each containing the day, weather emoji and label, high and low temperatures in the selected unit, and maximum precipitation probability.

#### Scenario: Daily list
- **WHEN** a valid seven-day forecast is displayed
- **THEN** exactly seven rows are shown in forecast-date order
- **AND** each row includes day, condition, high/low, and maximum precipitation percentage

### Requirement: Sun times use the forecast location
The dashboard SHALL show sunrise and sunset for the first daily forecast date in the forecast location's local time, not the server or browser timezone. Missing sun events SHALL be labeled unavailable rather than fabricated.

#### Scenario: Different browser timezone
- **WHEN** a user in a different timezone views London's forecast
- **THEN** sunrise and sunset display the London-local times returned for the first forecast day

#### Scenario: Missing sun event
- **WHEN** a valid forecast has a null sunrise or sunset
- **THEN** the corresponding event is visibly labeled unavailable

### Requirement: Units are shareable and navigable
The dashboard SHALL default to imperial units when `units` is absent or unsupported. A keyboard-operable unit control SHALL update `units` to `imperial` or `metric`, preserve the other current URL parameters, and clearly identify the selected option. Unit changes SHALL refresh weather values and labels together.

#### Scenario: Unit toggle
- **WHEN** a user switches a named location from imperial to metric
- **THEN** the URL preserves `lat`, `lon`, and `name` and sets `units=metric`
- **AND** current, apparent, hourly, and daily temperatures change to metric values and Celsius labels
- **AND** wind changes to metric values and km/h labels

#### Scenario: Shared URL and browser history
- **WHEN** a user opens a metric URL directly or navigates back to it
- **THEN** all sections and the selected unit control match that URL

#### Scenario: Unsupported page units
- **WHEN** a user opens a dashboard URL with `units=kelvin`
- **THEN** the dashboard consistently uses imperial values and labels

### Requirement: Loading provides weather skeletons
The dashboard SHALL provide layout-appropriate skeletons while forecast content is pending. The loading experience SHALL remain usable at 375px width and SHALL NOT show fabricated weather values.

#### Scenario: Delayed forecast
- **WHEN** the forecast request is delayed
- **THEN** skeleton placeholders appear for the pending weather content until it can be rendered
- **AND** Open-Meteo attribution remains visible

### Requirement: Forecast failures provide friendly recovery
An upstream forecast failure SHALL display a friendly error banner with an operable retry button rather than a stack trace or raw provider response. Retry SHALL attempt to retrieve and render weather for the current URL.

#### Scenario: Failure and retry
- **WHEN** the provider fails while loading a dashboard
- **THEN** a friendly banner and retry button appear
- **AND** no stack trace or provider payload appears in the UI
- **WHEN** the provider recovers and the user activates retry
- **THEN** the dashboard renders successfully for the same URL location and units

### Requirement: Weather views remain usable on small screens
The dashboard, loading state, and error state SHALL fit a 375px-wide viewport without horizontal document scrolling. Weather labels, long location names, chart axes, unit controls, and daily rows SHALL remain readable without clipping required information.

#### Scenario: Narrow viewport
- **WHEN** the dashboard is viewed at 375px width with a long location name and weather description
- **THEN** document scroll width is no greater than viewport client width
- **AND** chart, controls, and all seven daily rows remain within the viewport

### Requirement: Attribution is always visible
Every application page state SHALL display the text "Weather data by Open-Meteo.com" linking to `https://open-meteo.com/`, including forecast loading and error states.

#### Scenario: Persistent attribution
- **WHEN** the dashboard is successful, pending, or showing a forecast failure
- **THEN** the attribution text and link remain visible
