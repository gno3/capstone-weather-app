import { describe, expect, it } from "vitest";
import type { ChatMessage } from "@/lib/ai/chat-validation";
import {
  RATE_LIMIT_ERROR,
  RETRY_ERROR,
  SUGGESTED_QUESTIONS,
  UNAVAILABLE_ERROR,
  buildChatRequest,
  errorMessageFor,
  validateDraft,
} from "./chat-panel-state";

function conversation(length: number): ChatMessage[] {
  return Array.from({ length }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `m${i}`,
  }));
}

describe("validateDraft", () => {
  it("is a no-op for blank drafts", () => {
    expect(validateDraft("", [])).toEqual({ ok: false, error: null });
    expect(validateDraft("   \n ", [])).toEqual({ ok: false, error: null });
  });

  it("returns trimmed content for a valid draft", () => {
    expect(validateDraft("  Rain?  ", [])).toEqual({ ok: true, content: "Rain?" });
    expect(validateDraft("a".repeat(500), [])).toEqual({ ok: true, content: "a".repeat(500) });
  });

  it("rejects drafts over 500 characters", () => {
    expect(validateDraft("a".repeat(501), [])).toEqual({
      ok: false,
      error: expect.stringMatching(/500 characters/),
    });
  });

  it("asks for a new chat when the conversation limit would be exceeded", () => {
    expect(validateDraft("Next?", conversation(9)).ok).toBe(true);
    expect(validateDraft("Next?", conversation(10))).toEqual({
      ok: false,
      error: expect.stringMatching(/new chat/i),
    });
  });
});

describe("buildChatRequest", () => {
  it("includes the messages and the active context", () => {
    const messages: ChatMessage[] = [{ role: "user", content: "Rain?" }];
    expect(
      buildChatRequest(messages, { lat: 1.5, lon: -2.5, name: "Somewhere", units: "metric" }),
    ).toEqual({
      messages: [{ role: "user", content: "Rain?" }],
      context: { lat: 1.5, lon: -2.5, name: "Somewhere", units: "metric" },
    });
  });

  it("caps long assistant replies at the server's history limit", () => {
    const request = buildChatRequest(
      [
        { role: "user", content: "Week?" },
        { role: "assistant", content: "x".repeat(1200) },
        { role: "user", content: "And tomorrow?" },
      ],
      { lat: 0, lon: 0, name: "Here", units: "imperial" },
    );
    expect(request.messages[1].content).toHaveLength(1000);
  });
});

describe("errorMessageFor", () => {
  it("maps statuses to friendly messages", () => {
    expect(errorMessageFor(429)).toBe(RATE_LIMIT_ERROR);
    expect(errorMessageFor(503)).toBe(UNAVAILABLE_ERROR);
    expect(errorMessageFor(502)).toBe(RETRY_ERROR);
    expect(errorMessageFor(500)).toBe(RETRY_ERROR);
    expect(errorMessageFor("network")).toBe(RETRY_ERROR);
  });

  it("passes through the server's 400 message", () => {
    expect(errorMessageFor(400, "Messages can't be blank.")).toBe("Messages can't be blank.");
    expect(errorMessageFor(400)).toBe(RETRY_ERROR);
    expect(errorMessageFor(400, { nope: true })).toBe(RETRY_ERROR);
  });
});

describe("SUGGESTED_QUESTIONS", () => {
  it("has 3 questions", () => {
    expect(SUGGESTED_QUESTIONS).toHaveLength(3);
  });
});
