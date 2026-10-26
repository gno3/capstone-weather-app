import { first, type SearchParams } from "./location";
import type { ForecastUnits, UnitSystem } from "./types";

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "imperial";

export const UNIT_LABELS: Record<UnitSystem, ForecastUnits> = {
  imperial: { system: "imperial", temperature: "°F", windSpeed: "mph", precipitation: "in" },
  metric: { system: "metric", temperature: "°C", windSpeed: "km/h", precipitation: "mm" },
};

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === "imperial" || value === "metric";
}

/**
 * Strict parsing for API input: an omitted value defaults to imperial, while an explicit
 * empty or unsupported value returns undefined so callers can reject it.
 */
export function parseUnits(value: string | null | undefined): UnitSystem | undefined {
  if (value === undefined || value === null) return DEFAULT_UNIT_SYSTEM;
  return isUnitSystem(value) ? value : undefined;
}

/** Lenient page resolution: missing or unsupported units fall back to imperial. */
export function resolveUnits(searchParams: SearchParams): UnitSystem {
  const value = first(searchParams.units);
  return isUnitSystem(value) ? value : DEFAULT_UNIT_SYSTEM;
}
