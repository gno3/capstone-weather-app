import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  fetchMock.mockReset();
});

function request(query: string) {
  return new Request(`http://localhost/api/geocode${query}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("GET /api/geocode", () => {
  it("returns 200 with mapped results on a match", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        results: [
          {
            name: "Springfield",
            latitude: 39.80172,
            longitude: -89.64371,
            country: "United States",
            admin1: "Illinois",
            timezone: "America/Chicago",
          },
        ],
      }),
    );

    const res = await GET(request("?q=Springfield"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      results: [
        {
          name: "Springfield",
          region: "Illinois",
          country: "United States",
          lat: 39.80172,
          lon: -89.64371,
          timezone: "America/Chicago",
        },
      ],
    });
  });

  it("returns 200 with an empty list when upstream has no results", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ generationtime_ms: 0.3 }));

    const res = await GET(request("?q=zzzzqqq"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
  });

  it("returns 502 with a friendly error when upstream fails", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));

    const res = await GET(request("?q=London"));

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: "Location search is unavailable. Please try again." });
  });

  it.each([
    ["1-char query", "?q=L"],
    ["missing query", ""],
    ["whitespace-padded 1-char query", "?q=%20a%20"],
  ])("returns 400 for a %s without calling upstream", async (_label, query) => {
    const res = await GET(request(query));

    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 400 for a query over 100 characters without calling upstream", async () => {
    const res = await GET(request(`?q=${"a".repeat(101)}`));

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
