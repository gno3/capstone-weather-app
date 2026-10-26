import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as openmeteo from "@/lib/openmeteo";
import { GET } from "./route";

const fetchMock = vi.fn();

const RECORDED = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../tests/fixtures/forecast.json"), "utf8"),
);

/** Deep copy of the recorded metric fixture, optionally relabeled as an imperial response. */
function fixture(units: "metric" | "imperial" = "metric") {
  const raw = structuredClone(RECORDED);
  if (units === "imperial") {
    for (const group of [raw.current_units, raw.hourly_units, raw.daily_units]) {
      for (const [key, label] of Object.entries(group)) {
        if (label === "°C") group[key] = "°F";
        if (label === "km/h") group[key] = "mp/h";
      }
    }
  }
  return raw;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

function request(query: string) {
  return new Request(`http://localhost/api/forecast${query}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function upstreamUrl(): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

describe("GET /api/forecast success", () => {
  it("returns the normalized metric forecast directly", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("metric")));

    const res = await GET(request("?lat=38.63&lon=-90.2&units=metric"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["current", "daily", "hourly", "timezone", "units"]);
    expect(body.timezone).toBe("America/Chicago");
    expect(body.units).toEqual({
      system: "metric",
      temperature: "°C",
      windSpeed: "km/h",
      precipitation: "mm",
    });
    expect(Object.keys(body.current).sort()).toEqual(
      [
        "apparentTemperature",
        "humidity",
        "isDay",
        "temperature",
        "time",
        "weatherCode",
        "windDirection",
        "windSpeed",
      ].sort(),
    );
    expect(body.hourly).toHaveLength(24);
    expect(Object.keys(body.hourly[0]).sort()).toEqual(
      ["precipitationProbability", "temperature", "time", "weatherCode"].sort(),
    );
    expect(body.daily).toHaveLength(7);
    expect(Object.keys(body.daily[0]).sort()).toEqual(
      [
        "date",
        "precipitationProbabilityMax",
        "sunrise",
        "sunset",
        "temperatureMax",
        "temperatureMin",
        "weatherCode",
      ].sort(),
    );
    expect(upstreamUrl().searchParams.has("temperature_unit")).toBe(false);
  });

  it("returns an imperial forecast when requested", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("imperial")));

    const res = await GET(request("?lat=38.63&lon=-90.2&units=imperial"));

    expect(res.status).toBe(200);
    expect((await res.json()).units).toEqual({
      system: "imperial",
      temperature: "°F",
      windSpeed: "mph",
      precipitation: "in",
    });
    expect(upstreamUrl().searchParams.get("temperature_unit")).toBe("fahrenheit");
  });

  it("defaults omitted units to imperial and accepts zero coordinates", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("imperial")));

    const res = await GET(request("?lat=0&lon=0"));

    expect(res.status).toBe(200);
    const url = upstreamUrl();
    expect(url.searchParams.get("latitude")).toBe("0");
    expect(url.searchParams.get("longitude")).toBe("0");
    expect(url.searchParams.get("temperature_unit")).toBe("fahrenheit");
    expect(url.searchParams.get("wind_speed_unit")).toBe("mph");
    expect(url.searchParams.get("precipitation_unit")).toBe("inch");
  });

  it.each([
    ["90", "-180"],
    ["-90", "180"],
  ])("accepts boundary coordinates lat=%s lon=%s with metric units", async (lat, lon) => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("metric")));

    const res = await GET(request(`?lat=${lat}&lon=${lon}&units=metric`));

    expect(res.status).toBe(200);
    const url = upstreamUrl();
    expect(url.searchParams.get("latitude")).toBe(lat);
    expect(url.searchParams.get("longitude")).toBe(lon);
    expect(url.searchParams.has("temperature_unit")).toBe(false);
  });

  it("uses the first of repeated values", async () => {
    fetchMock.mockResolvedValue(jsonResponse(fixture("metric")));

    const res = await GET(request("?lat=10&lat=20&lon=30&lon=40&units=metric&units=imperial"));

    expect(res.status).toBe(200);
    const url = upstreamUrl();
    expect(url.searchParams.get("latitude")).toBe("10");
    expect(url.searchParams.get("longitude")).toBe("30");
    expect(url.searchParams.has("temperature_unit")).toBe(false);
  });
});

describe("GET /api/forecast validation", () => {
  it.each([
    ["missing lat", "?lon=0"],
    ["missing lon", "?lat=0"],
    ["missing both", ""],
    ["blank lat", "?lat=&lon=0"],
    ["whitespace lon", "?lat=0&lon=%20%20"],
    ["non-numeric lat", "?lat=abc&lon=0"],
    ["NaN lon", "?lat=0&lon=NaN"],
    ["infinite lat", "?lat=Infinity&lon=0"],
    ["negative infinite lon", "?lat=0&lon=-Infinity"],
    ["lat above range", "?lat=90.01&lon=0"],
    ["lat below range", "?lat=-91&lon=0"],
    ["lon above range", "?lat=0&lon=180.5"],
    ["lon below range", "?lat=0&lon=-181"],
    ["empty units", "?lat=0&lon=0&units="],
    ["unsupported units", "?lat=0&lon=0&units=kelvin"],
    ["wrong-case units", "?lat=0&lon=0&units=Metric"],
    ["repeated invalid-first lat", "?lat=abc&lat=10&lon=0"],
    ["repeated unsupported-first units", "?lat=0&lon=0&units=kelvin&units=metric"],
  ])("returns 400 for %s without calling upstream", async (_label, query) => {
    const res = await GET(request(query));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["error"]);
    expect(typeof body.error).toBe("string");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/forecast upstream failures", () => {
  const FRIENDLY = { error: "Weather forecast is unavailable. Please try again." };

  async function expectFriendly502(res: Response) {
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual(FRIENDLY);
    expect(text).not.toMatch(/stack|status|fetch failed|secret-provider-detail|unusable/i);
  }

  it("returns 502 on network failure and logs it", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expectFriendly502(await GET(request("?lat=1&lon=2")));
    expect(console.error).toHaveBeenCalled();
  });

  it.each([429, 500, 503])("returns 502 on provider status %d", async (status) => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: true, reason: "secret-provider-detail" }, status),
    );
    await expectFriendly502(await GET(request("?lat=1&lon=2")));
  });

  it("returns 502 on invalid JSON", async () => {
    fetchMock.mockResolvedValue(new Response("<html>secret-provider-detail", { status: 200 }));
    await expectFriendly502(await GET(request("?lat=1&lon=2")));
  });

  it("returns 502 on an unusable payload instead of a partial forecast", async () => {
    const raw = fixture("imperial");
    delete raw.hourly.temperature_2m;
    fetchMock.mockResolvedValue(jsonResponse(raw));
    await expectFriendly502(await GET(request("?lat=1&lon=2")));
  });

  it("does not disguise unexpected programming errors as upstream outages", async () => {
    vi.spyOn(openmeteo, "getForecast").mockRejectedValue(new TypeError("bug"));

    await expect(GET(request("?lat=1&lon=2"))).rejects.toThrow("bug");
  });
});
