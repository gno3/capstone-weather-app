export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimiter = {
  check(key: string): RateLimitResult;
  reset(): void;
  size(): number;
};

export type RateLimiterOptions = {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
};

export const CHAT_RATE_LIMIT = 20;
export const CHAT_RATE_WINDOW_MS = 5 * 60 * 1000;
export const DEFAULT_MAX_KEYS = 10_000;

/** Sliding-window log limiter kept in memory (per server instance). */
export function createRateLimiter({
  limit,
  windowMs,
  now = Date.now,
  maxKeys = DEFAULT_MAX_KEYS,
}: RateLimiterOptions): RateLimiter {
  const log = new Map<string, number[]>();

  function evict(current: number) {
    for (const [key, times] of log) {
      if (log.size <= maxKeys) return;
      if (times.length === 0 || times.at(-1)! <= current - windowMs) log.delete(key);
    }
    for (const key of log.keys()) {
      if (log.size <= maxKeys) return;
      log.delete(key);
    }
  }

  return {
    check(key) {
      const current = now();
      const cutoff = current - windowMs;
      const times = (log.get(key) ?? []).filter((t) => t > cutoff);

      if (times.length >= limit) {
        log.set(key, times);
        const retryAfterMs = times[0] + windowMs - current;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
      }

      times.push(current);
      log.set(key, times);
      if (log.size > maxKeys) evict(current);
      return { allowed: true };
    },
    reset() {
      log.clear();
    },
    size() {
      return log.size;
    },
  };
}

export const chatRateLimiter = createRateLimiter({
  limit: CHAT_RATE_LIMIT,
  windowMs: CHAT_RATE_WINDOW_MS,
});

/** First X-Forwarded-For entry (IPv4 `:port` stripped), then X-Real-IP, else "unknown". */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return stripIpv4Port(forwarded);
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return stripIpv4Port(real);
  return "unknown";
}

function stripIpv4Port(ip: string): string {
  const match = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  return match ? match[1] : ip;
}
