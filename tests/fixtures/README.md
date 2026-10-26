# Test fixtures

## forecast.json

Unedited Open-Meteo forecast response for St. Louis (provider-default metric units),
captured 2026-10-26 18:43 UTC with:

```bash
mkdir -p tests/fixtures && curl -fsS "https://api.open-meteo.com/v1/forecast?latitude=38.63&longitude=-90.2&timezone=auto&forecast_days=7&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day&hourly=temperature_2m,precipitation_probability,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" > tests/fixtures/forecast.json
```

It contains 7 daily entries and 168 hourly points (`America/Chicago`, current time
`2026-10-26T13:30`). Do not edit it; tests derive edge-case and imperial-label variants
from deep copies.

Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0).
