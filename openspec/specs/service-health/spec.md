# service-health Specification

## Purpose

Exposes a lightweight liveness endpoint so deploy scripts and operators can confirm a running instance is serving requests.

## Requirements

### Requirement: Health endpoint reports liveness
`GET /api/health` SHALL return HTTP 200 with a JSON body exactly `{ "status": "ok" }` whenever the server is running. It SHALL NOT require authentication, query parameters, or any call to Open-Meteo.

#### Scenario: Healthy server
- **WHEN** a client sends `GET /api/health`
- **THEN** the response status is 200
- **AND** the `content-type` is JSON and the body is `{ "status": "ok" }`

#### Scenario: Open-Meteo unavailable
- **WHEN** Open-Meteo is unreachable and a client sends `GET /api/health`
- **THEN** the response status is still 200 with body `{ "status": "ok" }`

### Requirement: Health responses are not cached
Health responses SHALL be generated per request and SHALL NOT be served from a build-time or shared cache, so a 200 reflects a live server.

#### Scenario: Cache headers
- **WHEN** a client sends `GET /api/health`
- **THEN** the response includes `Cache-Control: no-store`
