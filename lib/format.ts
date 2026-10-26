/**
 * Formatting helpers for provider-local timestamps. Values are read from the string's clock
 * components so labels show the forecast location's time regardless of server/browser zone.
 */

export const UNAVAILABLE = "Unavailable";

function clockParts(localDateTime: string): { hour: number; minute: number } {
  const [, time = ""] = localDateTime.split("T");
  const [hour, minute] = time.split(":").map(Number);
  return { hour, minute };
}

function to12Hour(hour: number): { h: number; period: "AM" | "PM" } {
  return { h: hour % 12 === 0 ? 12 : hour % 12, period: hour < 12 ? "AM" : "PM" };
}

/** "2026-10-26T14:00" -> "2 PM" */
export function formatHour(localDateTime: string): string {
  const { h, period } = to12Hour(clockParts(localDateTime).hour);
  return `${h} ${period}`;
}

/** "2026-10-26T07:21" -> "7:21 AM"; null -> "Unavailable" */
export function formatClock(localDateTime: string | null): string {
  if (localDateTime === null) return UNAVAILABLE;
  const { hour, minute } = clockParts(localDateTime);
  const { h, period } = to12Hour(hour);
  return `${h}:${String(minute).padStart(2, "0")} ${period}`;
}

/** "2026-10-26" -> "Mon, Oct 26", computed as a calendar date (no timezone shift). */
export function formatDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/** Degrees the wind blows from -> 16-point compass label. */
export function compassDirection(degrees: number | null): string | null {
  if (degrees === null) return null;
  const index = Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[index];
}

/** Rounds and appends a unit, e.g. (74.3, "°F") -> "74°F"; null -> "Unavailable". */
export function formatMeasurement(value: number | null, unit: string, separator = ""): string {
  if (value === null) return UNAVAILABLE;
  const rounded = Math.round(value);
  return `${Object.is(rounded, -0) ? 0 : rounded}${separator}${unit}`;
}
