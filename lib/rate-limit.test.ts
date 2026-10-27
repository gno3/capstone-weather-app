import { describe, expect, it } from "vitest";
import {
  CHAT_RATE_LIMIT,
  CHAT_RATE_WINDOW_MS,
  chatRateLimiter,
  clientIp,
  createRateLimiter,
} from "./rate-limit";

function fakeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("createRateLimiter", () => {
  it("allows 20 requests then rejects the 21st with retryAfterSeconds", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 20, windowMs: 300_000, now: clock.now });

    for (let i = 0; i < 20; i++) {
      expect(limiter.check("a")).toEqual({ allowed: true });
      clock.advance(1_000);
    }
    // First request was 20 s ago, so it expires in 280 s.
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 280 });
  });

  it("allows requests again once the window has passed", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 20, windowMs: 300_000, now: clock.now });
    for (let i = 0; i < 20; i++) limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);

    clock.advance(299_999);
    expect(limiter.check("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });

    clock.advance(1);
    expect(limiter.check("a")).toEqual({ allowed: true });
  });

  it("does not count rejected requests", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 2, windowMs: 1_000, now: clock.now });
    limiter.check("a");
    limiter.check("a");
    for (let i = 0; i < 5; i++) limiter.check("a");
    clock.advance(1_000);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: () => 0 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(true);
  });

  it("evicts expired keys first, then the oldest keys, past maxKeys", () => {
    const clock = fakeClock();
    const limiter = createRateLimiter({ limit: 1, windowMs: 1_000, now: clock.now, maxKeys: 3 });

    limiter.check("old");
    clock.advance(2_000);
    limiter.check("a");
    limiter.check("b");
    expect(limiter.size()).toBe(3);

    // "old" is expired, so it is evicted ahead of live keys.
    limiter.check("c");
    expect(limiter.size()).toBe(3);
    expect(limiter.check("a").allowed).toBe(false);

    // No expired keys remain, so the oldest live key ("a") is evicted.
    limiter.check("d");
    expect(limiter.size()).toBe(3);
    expect(limiter.check("b").allowed).toBe(false);
    expect(limiter.check("c").allowed).toBe(false);
    expect(limiter.check("d").allowed).toBe(false);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("configures the chat limiter at 20 per 5 minutes", () => {
    expect(CHAT_RATE_LIMIT).toBe(20);
    expect(CHAT_RATE_WINDOW_MS).toBe(300_000);
    chatRateLimiter.reset();
    expect(chatRateLimiter.size()).toBe(0);
  });
});

describe("clientIp", () => {
  function req(headers: Record<string, string>) {
    return new Request("http://localhost/api/chat", { headers });
  }

  it("uses the first x-forwarded-for entry and strips an IPv4 port", () => {
    expect(clientIp(req({ "x-forwarded-for": "203.0.113.5:51234, 10.0.0.1" }))).toBe("203.0.113.5");
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.7" }))).toBe("198.51.100.7");
  });

  it("keeps IPv6 addresses intact", () => {
    expect(clientIp(req({ "x-forwarded-for": "2001:db8::1, 10.0.0.1" }))).toBe("2001:db8::1");
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(req({ "x-real-ip": "192.0.2.9" }))).toBe("192.0.2.9");
    expect(clientIp(req({ "x-forwarded-for": " ", "x-real-ip": "192.0.2.9" }))).toBe("192.0.2.9");
  });

  it('returns "unknown" with no headers', () => {
    expect(clientIp(req({}))).toBe("unknown");
  });
});
