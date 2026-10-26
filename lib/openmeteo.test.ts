import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTEMPT_TIMEOUT_MS,
  CURRENT_FIELDS,
  DAILY_FIELDS,
  getForecast,
  HOURLY_FIELDS,
  MAX_ATTEMPTS,
  OpenMeteoError,
  searchLocations,
} from "./openmeteo";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  fetchMock.mockReset();
});

/** The per-attempt abort signal is an implementation detail; compare the rest of init. */
function withoutSignal(init: RequestInit) {
  const { signal, ...rest } = init;
  expect(signal).toBeInstanceOf(AbortSignal);
  return rest;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("searchLocations", () => {
  it("maps matches to Location, including admin1 -> region", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            id: 2643743,
            name: "London",
            latitude: 51.50853,
            longitude: -0.12574,
            country: "United Kingdom",
            admin1: "England",
            timezone: "Europe/London",
          },
          {
            id: 2993458,
            name: "Monaco",
            latitude: 43.73333,
            longitude: 7.41667,
            country: "Monaco",
            timezone: "Europe/Monaco",
          },
        ],
      }),
    );

    const results = await searchLocations("London");

    expect(results).toEqual([
      {
        name: "London",
        region: "England",
        country: "United Kingdom",
        lat: 51.50853,
        lon: -0.12574,
        timezone: "Europe/London",
      },
      {
        name: "Monaco",
        country: "Monaco",
        lat: 43.73333,
        lon: 7.41667,
        timezone: "Europe/Monaco",
      },
    ]);
    expect(results[1]).not.toHaveProperty("region");
  });

  it("requests the geocoding API with the expected params and one-day revalidate", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

    await searchLocations("St. Louis & Co");

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe(
      "https://geocoding-api.open-meteo.com/v1/search",
    );
    expect(parsed.searchParams.get("name")).toBe("St. Louis & Co");
    expect(parsed.searchParams.get("count")).toBe("5");
    expect(parsed.searchParams.get("language")).toBe("en");
    expect(parsed.searchParams.get("format")).toBe("json");
    expect(withoutSignal(init)).toEqual({ next: { revalidate: 86400 } });
  });

  it("returns [] when the API omits results", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ generationtime_ms: 0.5 }));

    await expect(searchLocations("zzzzqqq")).resolves.toEqual([]);
  });

  it("rejects with OpenMeteoError on upstream 500", async () => {
    fetchMock.mockResolvedValue(new Response("Internal Server Error", { status: 500 }));

    await expect(searchLocations("London")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it("rejects with OpenMeteoError on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(searchLocations("London")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it("rejects with OpenMeteoError on invalid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(searchLocations("London")).rejects.toBeInstanceOf(OpenMeteoError);
  });
});

const FIXTURE_PATH = path.resolve(__dirname, "../tests/fixtures/forecast.json");
const RECORDED: RawForecast = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

type RawForecast = {
  timezone: string;
  current: Record<string, unknown>;
  current_units: Record<string, string>;
  hourly: Record<string, unknown[]>;
  hourly_units: Record<string, string>;
  daily: Record<string, unknown[]>;
  daily_units: Record<string, string>;
  [key: string]: unknown;
};

/** Deep copy of the recorded (metric) fixture so tests never mutate the original. */
function fixture(): RawForecast {
  return structuredClone(RECORDED);
}

/** Copy relabeled as an imperial response; values are not converted, only unit metadata. */
function imperialFixture(): RawForecast {
  const raw = fixture();
  for (const units of [raw.current_units, raw.hourly_units, raw.daily_units]) {
    for (const [key, label] of Object.entries(units)) {
      if (label === "°C") units[key] = "°F";
      if (label === "km/h") units[key] = "mp/h";
    }
  }
  return raw;
}

function withCurrentTime(time: string): RawForecast {
  const raw = fixture();
  raw.current.time = time;
  return raw;
}

describe("forecast fixture", () => {
  it("contains every requested field, 7 days, and 168 hourly points", () => {
    expect(RECORDED.timezone).toBe("America/Chicago");
    for (const field of CURRENT_FIELDS) expect(RECORDED.current).toHaveProperty(field);
    for (const field of HOURLY_FIELDS) expect(RECORDED.hourly[field]).toHaveLength(168);
    for (const field of DAILY_FIELDS) expect(RECORDED.daily[field]).toHaveLength(7);
    expect(RECORDED.hourly.time).toHaveLength(168);
    expect(RECORDED.daily.time).toHaveLength(7);
  });
});

describe("getForecast", () => {
  it("maps the recorded response to the normalized metric contract", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture()));

    const forecast = await getForecast(38.63, -90.2, "metric");

    expect(forecast.timezone).toBe("America/Chicago");
    expect(forecast.units).toEqual({
      system: "metric",
      temperature: "°C",
      windSpeed: "km/h",
      precipitation: "mm",
    });
    expect(forecast.current).toEqual({
      time: "2026-10-26T13:30",
      temperature: 23.5,
      apparentTemperature: 23.2,
      humidity: 44,
      windSpeed: 5.6,
      windDirection: 230,
      weatherCode: 0,
      isDay: true,
    });
    expect(forecast.hourly).toHaveLength(24);
    expect(forecast.hourly[0]).toEqual({
      time: "2026-10-26T14:00",
      temperature: RECORDED.hourly.temperature_2m[14],
      precipitationProbability: RECORDED.hourly.precipitation_probability[14],
      weatherCode: RECORDED.hourly.weather_code[14],
    });
    expect(forecast.daily).toHaveLength(7);
    expect(forecast.daily.map((d) => d.date)).toEqual(RECORDED.daily.time);
    expect(forecast.daily[0]).toEqual({
      date: "2026-10-26",
      weatherCode: 3,
      temperatureMax: 24.7,
      temperatureMin: 10.7,
      precipitationProbabilityMax: 1,
      sunrise: "2026-10-26T07:21",
      sunset: "2026-10-26T18:07",
    });
    expect(Object.keys(forecast).sort()).toEqual(["current", "daily", "hourly", "timezone", "units"]);
  });

  it("labels imperial forecasts as Fahrenheit and mph", async () => {
    fetchMock.mockResolvedValue(jsonResponse(imperialFixture()));

    const forecast = await getForecast(38.63, -90.2, "imperial");

    expect(forecast.units).toEqual({
      system: "imperial",
      temperature: "°F",
      windSpeed: "mph",
      precipitation: "in",
    });
  });

  it("rejects a response whose units disagree with the requested system", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture()));

    await expect(getForecast(38.63, -90.2, "imperial")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it("requests exact field groups, auto timezone, 7 days, and 600s revalidate (metric)", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture()));

    await getForecast(38.627, -90.199, "metric");

    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(url);
    expect(`${parsed.origin}${parsed.pathname}`).toBe("https://api.open-meteo.com/v1/forecast");
    expect(parsed.searchParams.get("latitude")).toBe("38.627");
    expect(parsed.searchParams.get("longitude")).toBe("-90.199");
    expect(parsed.searchParams.get("timezone")).toBe("auto");
    expect(parsed.searchParams.get("forecast_days")).toBe("7");
    expect(parsed.searchParams.get("current")).toBe(
      "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m,weather_code,is_day",
    );
    expect(parsed.searchParams.get("hourly")).toBe(
      "temperature_2m,precipitation_probability,weather_code",
    );
    expect(parsed.searchParams.get("daily")).toBe(
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    );
    expect(parsed.searchParams.has("temperature_unit")).toBe(false);
    expect(parsed.searchParams.has("wind_speed_unit")).toBe(false);
    expect(parsed.searchParams.has("precipitation_unit")).toBe(false);
    expect(withoutSignal(init)).toEqual({ next: { revalidate: 600 } });
  });

  it("requests Fahrenheit, mph, and inches for imperial", async () => {
    fetchMock.mockResolvedValue(jsonResponse(imperialFixture()));

    await getForecast(0, 0, "imperial");

    const parsed = new URL(fetchMock.mock.calls[0][0]);
    expect(parsed.searchParams.get("latitude")).toBe("0");
    expect(parsed.searchParams.get("longitude")).toBe("0");
    expect(parsed.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(parsed.searchParams.get("wind_speed_unit")).toBe("mph");
    expect(parsed.searchParams.get("precipitation_unit")).toBe("inch");
  });

  it("distinguishes cache keys by coordinates and units", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      jsonResponse(url.includes("fahrenheit") ? imperialFixture() : fixture()),
    );

    await getForecast(1, 2, "metric");
    await getForecast(1, 2, "imperial");
    await getForecast(1, 3, "metric");

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(new Set(urls).size).toBe(3);
  });

  it("keeps geocoding on its one-day revalidate", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [] }));

    await searchLocations("London");

    expect(withoutSignal(fetchMock.mock.calls[0][1])).toEqual({ next: { revalidate: 86400 } });
  });
});

describe("hourly slicing", () => {
  async function hourlyFor(raw: unknown) {
    fetchMock.mockResolvedValue(jsonResponse(raw));
    return (await getForecast(38.63, -90.2, "metric")).hourly;
  }

  it("starts at the current time when it falls on an hour boundary", async () => {
    const hourly = await hourlyFor(withCurrentTime("2026-10-26T14:00"));

    expect(hourly).toHaveLength(24);
    expect(hourly[0].time).toBe("2026-10-26T14:00");
    expect(hourly[23].time).toBe("2026-10-27T13:00");
  });

  it("starts at the next hour when current time is 14:15", async () => {
    const hourly = await hourlyFor(withCurrentTime("2026-10-26T14:15"));

    expect(hourly).toHaveLength(24);
    expect(hourly[0].time).toBe("2026-10-26T15:00");
    expect(hourly[23].time).toBe("2026-10-27T14:00");
    expect(hourly.map((h) => h.time)).toEqual(RECORDED.hourly.time.slice(15, 39));
  });

  it("crosses midnight to the next day rather than the first midnight", async () => {
    const hourly = await hourlyFor(withCurrentTime("2026-10-26T23:45"));

    expect(hourly[0].time).toBe("2026-10-27T00:00");
    expect(hourly).toHaveLength(24);
  });

  it("accepts exactly 24 remaining points", async () => {
    const hourly = await hourlyFor(withCurrentTime("2026-11-01T00:00"));

    expect(hourly).toHaveLength(24);
    expect(hourly[23].time).toBe("2026-11-01T23:00");
  });

  it("does not depend on the host timezone", async () => {
    const original = process.env.TZ;
    process.env.TZ = "Asia/Tokyo";
    try {
      const hourly = await hourlyFor(withCurrentTime("2026-10-26T14:15"));
      expect(hourly[0].time).toBe("2026-10-26T15:00");
    } finally {
      process.env.TZ = original;
    }
  });

  it("rejects when no hourly point is at or after current time", async () => {
    await expect(hourlyFor(withCurrentTime("2026-11-02T00:00"))).rejects.toBeInstanceOf(
      OpenMeteoError,
    );
  });

  it("rejects when fewer than 24 points remain", async () => {
    await expect(hourlyFor(withCurrentTime("2026-11-01T01:00"))).rejects.toBeInstanceOf(
      OpenMeteoError,
    );
  });

  it("keeps null measurements as null rather than zero", async () => {
    const raw = fixture();
    raw.hourly.temperature_2m[14] = null;
    raw.hourly.precipitation_probability[15] = null;
    raw.current.apparent_temperature = null;
    raw.daily.sunrise[0] = null;
    raw.daily.temperature_2m_min[1] = null;
    fetchMock.mockResolvedValue(jsonResponse(raw));

    const forecast = await getForecast(38.63, -90.2, "metric");

    expect(forecast.hourly[0].temperature).toBeNull();
    expect(forecast.hourly[1].precipitationProbability).toBeNull();
    expect(forecast.current.apparentTemperature).toBeNull();
    expect(forecast.daily[0].sunrise).toBeNull();
    expect(forecast.daily[0].sunset).toBe("2026-10-26T18:07");
    expect(forecast.daily[1].temperatureMin).toBeNull();
  });
});

describe("getForecast failures", () => {
  it.each<[string, (raw: RawForecast) => unknown]>([
    ["missing current", (raw) => ({ ...raw, current: undefined })],
    ["missing hourly", (raw) => ({ ...raw, hourly: undefined })],
    ["missing daily", (raw) => ({ ...raw, daily: undefined })],
    ["missing timezone", (raw) => ({ ...raw, timezone: undefined })],
    ["non-object body", () => []],
    [
      "missing hourly measurement array",
      (raw) => {
        delete raw.hourly.precipitation_probability;
        return raw;
      },
    ],
    [
      "misaligned hourly arrays",
      (raw) => {
        raw.hourly.temperature_2m = raw.hourly.temperature_2m.slice(1);
        return raw;
      },
    ],
    [
      "misaligned daily arrays",
      (raw) => {
        raw.daily.sunset = raw.daily.sunset.slice(1);
        return raw;
      },
    ],
    [
      "wrong number of days",
      (raw) => {
        for (const key of Object.keys(raw.daily)) raw.daily[key] = raw.daily[key].slice(0, 6);
        return raw;
      },
    ],
    [
      "non-numeric measurement",
      (raw) => {
        raw.hourly.temperature_2m[20] = "warm";
        return raw;
      },
    ],
    [
      "malformed timestamp",
      (raw) => {
        raw.hourly.time[30] = "tomorrow";
        return raw;
      },
    ],
    [
      "malformed current time",
      (raw) => {
        raw.current.time = 1761500000;
        return raw;
      },
    ],
    [
      "missing current measurement",
      (raw) => {
        delete raw.current.wind_speed_10m;
        return raw;
      },
    ],
    [
      "invalid is_day",
      (raw) => {
        raw.current.is_day = "yes";
        return raw;
      },
    ],
  ])("rejects %s with OpenMeteoError", async (_label, mutate) => {
    fetchMock.mockResolvedValue(jsonResponse(mutate(fixture())));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it("rejects invalid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it("rejects network failures", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
  });

  it.each([400, 429, 500, 503])("rejects provider status %d", async (status) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: true, reason: "nope" }, status));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
  });
});

describe("connection retries", () => {
  /** Never settles until its abort signal fires, like a stalled TCP connect. */
  function stalledFetch(_url: string, init: RequestInit) {
    return new Promise<Response>((_, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    });
  }

  it("retries a network failure and returns the next successful response", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse(fixture()));

    const forecast = await getForecast(38.63, -90.2, "metric");

    expect(forecast.hourly).toHaveLength(24);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[0][0]);
  });

  it("aborts a stalled attempt after the per-attempt timeout and retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockImplementationOnce(stalledFetch).mockResolvedValueOnce(jsonResponse(fixture()));

    const pending = getForecast(38.63, -90.2, "metric");
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS);

    await expect(pending).resolves.toHaveProperty("timezone", "America/Chicago");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with OpenMeteoError after the maximum attempts", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    fetchMock.mockImplementation(stalledFetch);

    const pending = getForecast(38.63, -90.2, "metric");
    const assertion = expect(pending).rejects.toBeInstanceOf(OpenMeteoError);
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS * MAX_ATTEMPTS);

    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });

  it("does not retry an HTTP error status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: true }, 503));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unusable payload", async () => {
    fetchMock.mockResolvedValue(new Response("<html>", { status: 200 }));

    await expect(getForecast(38.63, -90.2, "metric")).rejects.toBeInstanceOf(OpenMeteoError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries geocoding network failures too", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));

    await expect(searchLocations("London")).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
