import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mapForecast } from "../openmeteo";
import { SUMMARY_SYSTEM_PROMPT, buildSummaryInput, summarizeForecast } from "./summary";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));

vi.mock("./client", () => ({
  getAiClient: () => ({
    client: { chat: { completions: { create } } },
    deployment: "test-deployment",
  }),
}));

const FIXTURE_PATH = path.resolve(__dirname, "../../tests/fixtures/forecast.json");
const forecast = mapForecast(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")), "metric");
const LOCATION = "St. Louis, Missouri, United States";

function completion(content: string | null) {
  return { choices: [{ message: { role: "assistant", content } }] };
}

type Request = {
  model: string;
  temperature: number;
  max_completion_tokens: number;
  messages: { role: string; content: string }[];
};

function lastRequest(): Request {
  return create.mock.calls.at(-1)![0] as Request;
}

describe("summarizeForecast", () => {
  beforeEach(() => {
    create.mockReset();
  });

  it("sends a compact metric view of the forecast as the user message", async () => {
    create.mockResolvedValue(completion("  Mild and dry today.  "));

    await expect(summarizeForecast(forecast, LOCATION)).resolves.toBe("Mild and dry today.");

    const user = lastRequest().messages.find((m) => m.role === "user")!;
    expect(user.content.startsWith(`Location: ${LOCATION}\n`)).toBe(true);
    const json = user.content.slice(user.content.indexOf("\n") + 1);
    const input = JSON.parse(json);

    expect(input.location).toBe(LOCATION);
    expect(input.units).toEqual({ temperature: "°C", windSpeed: "km/h", precipitation: "mm" });
    expect(input.current).toMatchObject({
      time: forecast.current.time,
      temperature: forecast.current.temperature,
      windSpeed: forecast.current.windSpeed,
    });
    expect(typeof input.current.condition).toBe("string");
    expect(input.next24Hours).toHaveLength(24);
    expect(input.next3Days.length).toBeLessThanOrEqual(3);
    expect(input.next3Days.map((d: { date: string }) => d.date)).toEqual(
      forecast.daily.slice(0, 3).map((d) => d.date),
    );

    expect(json).not.toMatch(/emoji/i);
    expect(json).not.toMatch(/weatherCode/);
    for (const day of forecast.daily.slice(3)) {
      expect(json).not.toContain(day.date);
    }
  });

  it("uses a system prompt that carries the content rules", async () => {
    create.mockResolvedValue(completion("Summary."));
    await summarizeForecast(forecast, LOCATION);

    const system = lastRequest().messages.find((m) => m.role === "system")!;
    expect(system.content).toBe(SUMMARY_SYSTEM_PROMPT);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/2-3 short sentences/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/never more than 3/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/no more than 60 words/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/plain language/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/rain timing/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/temperature swings/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/wind/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/only numbers that appear/i);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/units exactly as given/i);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/emojis/);
    expect(SUMMARY_SYSTEM_PROMPT).toMatch(/no advice/);
  });

  it("calls the deployment with a low temperature and a small token cap", async () => {
    create.mockResolvedValue(completion("Summary."));
    await summarizeForecast(forecast, LOCATION);

    const request = lastRequest();
    expect(request.model).toBe("test-deployment");
    expect(request.temperature).toBeLessThanOrEqual(0.3);
    expect(request.max_completion_tokens).toBeLessThanOrEqual(120);
    expect(request.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("propagates client errors unchanged", async () => {
    const error = new Error("429 Too Many Requests");
    create.mockRejectedValue(error);
    await expect(summarizeForecast(forecast, LOCATION)).rejects.toBe(error);
  });

  it("rejects on an empty completion", async () => {
    create.mockResolvedValue(completion("   "));
    await expect(summarizeForecast(forecast, LOCATION)).rejects.toThrow(/empty/);

    create.mockResolvedValue({ choices: [] });
    await expect(summarizeForecast(forecast, LOCATION)).rejects.toThrow(/empty/);
  });
});

describe("buildSummaryInput", () => {
  it("keeps nulls instead of inventing values", () => {
    const withNull = { ...forecast, current: { ...forecast.current, temperature: null } };
    expect(buildSummaryInput(withNull, LOCATION).current.temperature).toBeNull();
  });
});
