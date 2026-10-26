/*
 * Validation-only harness: deterministic, server-side Open-Meteo forecasts for browser checks.
 * Never imported by the app. Load it explicitly into a local server process:
 *
 *   NODE_OPTIONS="--import ./scripts/mock-open-meteo.mjs" npm run start
 *
 * Each forecast request re-reads the JSON control file (MOCK_OPEN_METEO_CONTROL, default
 * /tmp/open-meteo-mock.json), so behavior can change without restarting:
 *   { "mode": "ok" | "fail", "delayMs": 0, "currentTime": "2026-10-26T23:45",
 *     "nullSunrise": true, "weatherCode": 99 }
 *
 * Responses derive from tests/fixtures/forecast.json. Longitudes in [-30, 40] are served as
 * Europe/London with earlier sun times and cooler temperatures so location switches are
 * visible; imperial requests are converted (°F, mp/h) like the real provider.
 * Other requests (e.g. geocoding) pass through to the real network.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const FORECAST_PREFIX = "https://api.open-meteo.com/v1/forecast";
const CONTROL = process.env.MOCK_OPEN_METEO_CONTROL || "/tmp/open-meteo-mock.json";
const FIXTURE = fileURLToPath(new URL("../tests/fixtures/forecast.json", import.meta.url));

function readControl() {
  try {
    return { mode: "ok", delayMs: 0, ...JSON.parse(fs.readFileSync(CONTROL, "utf8")) };
  } catch {
    return { mode: "ok", delayMs: 0 };
  }
}

function shiftClock(value, minutes) {
  if (value === null) return null;
  const [date, time] = value.split("T");
  const total = Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) + minutes;
  const h = String(Math.floor(total / 60)).padStart(2, "0");
  const m = String(total % 60).padStart(2, "0");
  return `${date}T${h}:${m}`;
}

function buildForecast(url, control) {
  const raw = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const lon = Number(url.searchParams.get("longitude"));
  const london = lon >= -30 && lon <= 40;
  const c2f = (v) => (v === null ? null : Math.round((v * 9) / 5 * 10 + 320) / 10);
  const kmh2mph = (v) => (v === null ? null : Math.round((v / 1.609344) * 10) / 10);
  const imperial = url.searchParams.get("temperature_unit") === "fahrenheit";

  if (control.currentTime) raw.current.time = control.currentTime;

  if (london) {
    raw.timezone = "Europe/London";
    const cooler = (v) => (v === null ? null : Math.round((v - 10) * 10) / 10);
    for (const k of ["temperature_2m", "apparent_temperature"]) raw.current[k] = cooler(raw.current[k]);
    raw.current.weather_code = 61;
    raw.hourly.temperature_2m = raw.hourly.temperature_2m.map(cooler);
    raw.daily.temperature_2m_max = raw.daily.temperature_2m_max.map(cooler);
    raw.daily.temperature_2m_min = raw.daily.temperature_2m_min.map(cooler);
    raw.daily.sunrise = raw.daily.sunrise.map((v) => shiftClock(v, -25));
    raw.daily.sunset = raw.daily.sunset.map((v) => shiftClock(v, -89));
  }

  if (control.nullSunrise) raw.daily.sunrise[0] = null;
  if (control.weatherCode !== undefined) {
    raw.current.weather_code = control.weatherCode;
    raw.daily.weather_code = raw.daily.weather_code.map(() => control.weatherCode);
  }

  if (imperial) {
    for (const k of ["temperature_2m", "apparent_temperature"]) raw.current[k] = c2f(raw.current[k]);
    raw.current.wind_speed_10m = kmh2mph(raw.current.wind_speed_10m);
    raw.hourly.temperature_2m = raw.hourly.temperature_2m.map(c2f);
    raw.daily.temperature_2m_max = raw.daily.temperature_2m_max.map(c2f);
    raw.daily.temperature_2m_min = raw.daily.temperature_2m_min.map(c2f);
    for (const units of [raw.current_units, raw.hourly_units, raw.daily_units]) {
      for (const [key, label] of Object.entries(units)) {
        if (label === "°C") units[key] = "°F";
        if (label === "km/h") units[key] = "mp/h";
      }
    }
  }
  return raw;
}

const realFetch = globalThis.fetch;

globalThis.fetch = async function mockOpenMeteoFetch(input, init) {
  const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!href.startsWith(FORECAST_PREFIX)) return realFetch(input, init);

  const control = readControl();
  if (control.delayMs > 0) await new Promise((r) => setTimeout(r, control.delayMs));
  console.log(`[mock-open-meteo] ${control.mode} ${href}`);
  if (control.mode === "fail") {
    return new Response(JSON.stringify({ error: true, reason: "mock outage" }), { status: 503 });
  }
  return Response.json(buildForecast(new URL(href), control));
};
