import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigError } from "@/lib/ai/client";
import { chatRateLimiter } from "@/lib/rate-limit";
import { POST } from "./route";

const { runChat } = vi.hoisted(() => ({ runChat: vi.fn() }));

vi.mock("@/lib/ai/chat", () => ({ runChat }));

const context = { lat: 42.128, lon: -87.829, name: "Northbrook, IL", units: "imperial" };
const validBody = { messages: [{ role: "user", content: "Will it rain tomorrow?" }], context };

function request(body: unknown, ip = "203.0.113.5") {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  chatRateLimiter.reset();
  runChat.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/chat", () => {
  it("returns 200 with { reply, toolCalls }", async () => {
    const result = {
      reply: "Northbrook, IL tomorrow: 20% chance of rain.",
      toolCalls: [{ name: "get_forecast", arguments: { lat: 42.128, lon: -87.829, units: "imperial" } }],
    };
    runChat.mockResolvedValue(result);

    const res = await POST(request(validBody));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
    expect(runChat).toHaveBeenCalledWith(validBody.messages, context);
  });

  it("returns 400 for invalid JSON without calling the AI", async () => {
    const res = await POST(request("{not json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body must be valid JSON." });
    expect(runChat).not.toHaveBeenCalled();
  });

  it("returns 400 for a 501-character message without calling the AI", async () => {
    const res = await POST(
      request({ ...validBody, messages: [{ role: "user", content: "a".repeat(501) }] }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/500 characters/);
    expect(runChat).not.toHaveBeenCalled();
  });

  it("returns 400 for 11 messages without calling the AI", async () => {
    const messages = Array.from({ length: 11 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
    }));
    const res = await POST(request({ ...validBody, messages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/new chat/i);
    expect(runChat).not.toHaveBeenCalled();
  });

  it("returns 400 for out-of-range context", async () => {
    const res = await POST(request({ ...validBody, context: { ...context, lat: 120 } }));
    expect(res.status).toBe(400);
    expect(runChat).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After on the 21st request from one IP; other IPs still succeed", async () => {
    runChat.mockResolvedValue({ reply: "ok", toolCalls: [] });

    for (let i = 0; i < 20; i++) {
      expect((await POST(request(validBody, "198.51.100.1"))).status).toBe(200);
    }
    const limited = await POST(request(validBody, "198.51.100.1"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await limited.json()).toEqual({
      error: "Too many questions. Try again in a few minutes.",
    });
    expect(runChat).toHaveBeenCalledTimes(20);

    expect((await POST(request(validBody, "198.51.100.2"))).status).toBe(200);
  });

  it("returns 503 when AI is not configured", async () => {
    runChat.mockRejectedValue(new AiConfigError(["AZURE_OPENAI_ENDPOINT"]));

    const res = await POST(request(validBody));

    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Chat is unavailable right now." });
    expect(text).not.toMatch(/AZURE_OPENAI|stack/);
    expect(consoleError).toHaveBeenCalled();
  });

  it("returns 502 on other AI failures without leaking details or message contents", async () => {
    runChat.mockRejectedValue(new Error("Request timed out at secret-host.openai.azure.com"));

    const res = await POST(request(validBody));

    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: "Chat couldn't answer right now. Please try again." });
    expect(text).not.toMatch(/secret-host|stack/);
    expect(consoleError).toHaveBeenCalled();
    const logged = consoleError.mock.calls.flat().join(" ");
    expect(logged).not.toContain("Will it rain tomorrow?");
  });
});
