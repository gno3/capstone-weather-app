import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoError, searchLocations } from "./openmeteo";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

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
    expect(init).toEqual({ next: { revalidate: 86400 } });
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
