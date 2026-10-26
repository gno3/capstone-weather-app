import type {
  CurrentConditions,
  DailySummary,
  Forecast,
  HourlyPoint,
  Location,
  UnitSystem,
} from "./types";
import { UNIT_LABELS } from "./units";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const GEOCODING_REVALIDATE_SECONDS = 86400;

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
export const FORECAST_REVALIDATE_SECONDS = 600;
export const FORECAST_DAYS = 7;
export const HOURLY_POINTS = 24;

export const CURRENT_FIELDS = [
  "temperature_2m",
  "apparent_temperature",
  "relative_humidity_2m",
  "wind_speed_10m",
  "wind_direction_10m",
  "weather_code",
  "is_day",
] as const;
export const HOURLY_FIELDS = ["temperature_2m", "precipitation_probability", "weather_code"] as const;
export const DAILY_FIELDS = [
  "weather_code",
  "temperature_2m_max",
  "temperature_2m_min",
  "precipitation_probability_max",
  "sunrise",
  "sunset",
] as const;

// Some connections from Azure App Service to Open-Meteo stall during the TCP connect. Undici
// would wait 10 s and fail, so cap each attempt and retry network failures on a new connection.
export const ATTEMPT_TIMEOUT_MS = 3000;
export const MAX_ATTEMPTS = 3;

/**
 * Fetches with a per-attempt timeout (covering connect and response headers), retrying only
 * network/timeout failures. HTTP error statuses are returned to the caller, never retried.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`Timed out after ${ATTEMPT_TIMEOUT_MS} ms`)),
      ATTEMPT_TIMEOUT_MS,
    );
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Open-Meteo attempt ${attempt} failed; retrying:`, describe(err));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function describe(err: unknown): string {
  if (!(err instanceof Error)) return "unknown error";
  const cause = err.cause instanceof Error ? ` (${err.cause.message})` : "";
  return `${err.message}${cause}`;
}

export class OpenMeteoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenMeteoError";
  }
}

type RawGeocodingResult = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone: string;
};

type RawGeocodingResponse = {
  results?: RawGeocodingResult[];
};

function toLocation(raw: RawGeocodingResult): Location {
  const location: Location = {
    name: raw.name,
    country: raw.country,
    lat: raw.latitude,
    lon: raw.longitude,
    timezone: raw.timezone,
  };
  if (raw.admin1) location.region = raw.admin1;
  return location;
}

export async function searchLocations(q: string): Promise<Location[]> {
  const params = new URLSearchParams({ name: q, count: "5", language: "en", format: "json" });

  let res: Response;
  try {
    res = await fetchWithRetry(`${GEOCODING_URL}?${params}`, {
      next: { revalidate: GEOCODING_REVALIDATE_SECONDS },
    });
  } catch (err) {
    throw new OpenMeteoError("Geocoding request failed", { cause: err });
  }

  if (!res.ok) {
    throw new OpenMeteoError(`Geocoding request failed with status ${res.status}`);
  }

  let body: RawGeocodingResponse;
  try {
    body = (await res.json()) as RawGeocodingResponse;
  } catch (err) {
    throw new OpenMeteoError("Geocoding response was not valid JSON", { cause: err });
  }

  return (body.results ?? []).map(toLocation);
}

const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

type RawRecord = Record<string, unknown>;

function isRecord(value: unknown): value is RawRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(detail: string): never {
  throw new OpenMeteoError(`Forecast response was unusable: ${detail}`);
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return invalid(`${field} is not a number`);
}

function localDateTime(value: unknown, field: string): string {
  if (typeof value === "string" && LOCAL_DATETIME.test(value)) return value;
  return invalid(`${field} is not a local timestamp`);
}

function nullableLocalDateTime(value: unknown, field: string): string | null {
  return value === null ? null : localDateTime(value, field);
}

function alignedArrays(
  group: unknown,
  groupName: string,
  fields: readonly string[],
): { time: unknown[]; columns: Record<string, unknown[]> } {
  if (!isRecord(group)) return invalid(`${groupName} is missing`);
  const time = group.time;
  if (!Array.isArray(time)) return invalid(`${groupName}.time is missing`);
  const columns: Record<string, unknown[]> = {};
  for (const field of fields) {
    const column = group[field];
    if (!Array.isArray(column)) return invalid(`${groupName}.${field} is missing`);
    if (column.length !== time.length) return invalid(`${groupName}.${field} is misaligned`);
    columns[field] = column;
  }
  return { time, columns };
}

function mapCurrent(raw: unknown): CurrentConditions {
  if (!isRecord(raw)) return invalid("current is missing");
  if (raw.is_day !== 0 && raw.is_day !== 1) return invalid("current.is_day is invalid");
  for (const field of CURRENT_FIELDS) {
    if (!(field in raw)) return invalid(`current.${field} is missing`);
  }
  return {
    time: localDateTime(raw.time, "current.time"),
    temperature: nullableNumber(raw.temperature_2m, "current.temperature_2m"),
    apparentTemperature: nullableNumber(raw.apparent_temperature, "current.apparent_temperature"),
    humidity: nullableNumber(raw.relative_humidity_2m, "current.relative_humidity_2m"),
    windSpeed: nullableNumber(raw.wind_speed_10m, "current.wind_speed_10m"),
    windDirection: nullableNumber(raw.wind_direction_10m, "current.wind_direction_10m"),
    weatherCode: nullableNumber(raw.weather_code, "current.weather_code"),
    isDay: raw.is_day === 1,
  };
}

/**
 * Returns the 24 consecutive points starting at the first local timestamp >= currentTime.
 * Provider-local "YYYY-MM-DDTHH:mm" strings sort lexicographically, so they are compared
 * directly instead of being parsed in the host timezone.
 */
export function sliceHourly(raw: unknown, currentTime: string): HourlyPoint[] {
  const { time, columns } = alignedArrays(raw, "hourly", HOURLY_FIELDS);
  const times = time.map((t, i) => localDateTime(t, `hourly.time[${i}]`));
  const start = times.findIndex((t) => t >= currentTime);
  if (start === -1) return invalid("no hourly data at or after current time");
  if (times.length - start < HOURLY_POINTS) return invalid("insufficient hourly coverage");

  return times.slice(start, start + HOURLY_POINTS).map((t, offset) => {
    const i = start + offset;
    return {
      time: t,
      temperature: nullableNumber(columns.temperature_2m[i], `hourly.temperature_2m[${i}]`),
      precipitationProbability: nullableNumber(
        columns.precipitation_probability[i],
        `hourly.precipitation_probability[${i}]`,
      ),
      weatherCode: nullableNumber(columns.weather_code[i], `hourly.weather_code[${i}]`),
    };
  });
}

function mapDaily(raw: unknown): DailySummary[] {
  const { time, columns } = alignedArrays(raw, "daily", DAILY_FIELDS);
  if (time.length !== FORECAST_DAYS) return invalid(`expected ${FORECAST_DAYS} daily entries`);
  return time.map((date, i) => {
    if (typeof date !== "string" || !LOCAL_DATE.test(date)) {
      return invalid(`daily.time[${i}] is not a date`);
    }
    return {
      date,
      weatherCode: nullableNumber(columns.weather_code[i], `daily.weather_code[${i}]`),
      temperatureMax: nullableNumber(columns.temperature_2m_max[i], `daily.temperature_2m_max[${i}]`),
      temperatureMin: nullableNumber(columns.temperature_2m_min[i], `daily.temperature_2m_min[${i}]`),
      precipitationProbabilityMax: nullableNumber(
        columns.precipitation_probability_max[i],
        `daily.precipitation_probability_max[${i}]`,
      ),
      sunrise: nullableLocalDateTime(columns.sunrise[i], `daily.sunrise[${i}]`),
      sunset: nullableLocalDateTime(columns.sunset[i], `daily.sunset[${i}]`),
    };
  });
}

const PROVIDER_UNIT_LABELS: Record<UnitSystem, { temperature: string; windSpeed: string }> = {
  imperial: { temperature: "°F", windSpeed: "mp/h" },
  metric: { temperature: "°C", windSpeed: "km/h" },
};

/** Rejects responses whose reported units disagree with the requested unit system. */
function checkProviderUnits(body: RawRecord, units: UnitSystem): void {
  const expected = PROVIDER_UNIT_LABELS[units];
  const checks: [unknown, string, string][] = [
    [body.current_units, "temperature_2m", expected.temperature],
    [body.current_units, "apparent_temperature", expected.temperature],
    [body.current_units, "wind_speed_10m", expected.windSpeed],
    [body.hourly_units, "temperature_2m", expected.temperature],
    [body.daily_units, "temperature_2m_max", expected.temperature],
    [body.daily_units, "temperature_2m_min", expected.temperature],
  ];
  for (const [group, field, label] of checks) {
    if (isRecord(group) && field in group && group[field] !== label) {
      invalid(`${field} unit does not match ${units}`);
    }
  }
}

export function mapForecast(body: unknown, units: UnitSystem): Forecast {
  if (!isRecord(body)) return invalid("body is not an object");
  checkProviderUnits(body, units);
  if (typeof body.timezone !== "string" || body.timezone === "") {
    return invalid("timezone is missing");
  }
  const current = mapCurrent(body.current);
  return {
    timezone: body.timezone,
    units: UNIT_LABELS[units],
    current,
    hourly: sliceHourly(body.hourly, current.time),
    daily: mapDaily(body.daily),
  };
}

export function buildForecastUrl(lat: number, lon: number, units: UnitSystem): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
    current: CURRENT_FIELDS.join(","),
    hourly: HOURLY_FIELDS.join(","),
    daily: DAILY_FIELDS.join(","),
  });
  if (units === "imperial") {
    params.set("temperature_unit", "fahrenheit");
    params.set("wind_speed_unit", "mph");
    params.set("precipitation_unit", "inch");
  }
  return `${FORECAST_URL}?${params}`;
}

export async function getForecast(lat: number, lon: number, units: UnitSystem): Promise<Forecast> {
  let res: Response;
  try {
    res = await fetchWithRetry(buildForecastUrl(lat, lon, units), {
      next: { revalidate: FORECAST_REVALIDATE_SECONDS },
    });
  } catch (err) {
    throw new OpenMeteoError("Forecast request failed", { cause: err });
  }

  if (!res.ok) {
    throw new OpenMeteoError(`Forecast request failed with status ${res.status}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new OpenMeteoError("Forecast response was not valid JSON", { cause: err });
  }

  return mapForecast(body, units);
}
