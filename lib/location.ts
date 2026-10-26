import type { Location } from "./types";

export const DEFAULT_LOCATION: Location = {
  name: "Northbrook",
  region: "Illinois",
  country: "United States",
  lat: 42.128,
  lon: -87.829,
  timezone: "America/Chicago",
};

export const DEFAULT_LOCATION_LABEL = "Northbrook, IL";

export type ActiveLocation = {
  lat: number;
  lon: number;
  label: string;
};

export type SearchParams = Record<string, string | string[] | undefined>;

export const MAX_LATITUDE = 90;
export const MAX_LONGITUDE = 180;

export function formatLocationLabel(loc: Pick<Location, "name" | "region" | "country">): string {
  return [loc.name, loc.region, loc.country].filter(Boolean).join(", ");
}

export function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Returns a finite number within [-limit, limit], or undefined for missing/blank/invalid input. */
export function parseCoordinate(
  value: string | null | undefined,
  limit: number,
): number | undefined {
  if (value === undefined || value === null || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

export function resolveLocation(searchParams: SearchParams): ActiveLocation {
  const lat = parseCoordinate(first(searchParams.lat), MAX_LATITUDE);
  const lon = parseCoordinate(first(searchParams.lon), MAX_LONGITUDE);

  if (lat === undefined || lon === undefined) {
    return { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon, label: DEFAULT_LOCATION_LABEL };
  }

  const name = first(searchParams.name)?.trim();
  return { lat, lon, label: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
}
