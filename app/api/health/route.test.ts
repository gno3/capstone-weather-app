import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: vi.fn(async () => {}) }));

import { GET } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe("GET /api/health", () => {
  it("returns 200 with { status: 'ok' }", async () => {
    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("is not cacheable", async () => {
    const res = await GET();

    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("does not call any upstream service", async () => {
    await GET();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
