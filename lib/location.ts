import type { Location } from "./types";

export const DEFAULT_LOCATION: Location = {
  name: "St. Louis",
  region: "Missouri",
  country: "United States",
  lat: 38.627,
  lon: -90.199,
  timezone: "America/Chicago",
};

export const DEFAULT_LOCATION_LABEL = "St. Louis, MO";

export type ActiveLocation = {
  lat: number;
  lon: number;
  label: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

export function formatLocationLabel(loc: Pick<Location, "name" | "region" | "country">): string {
  return [loc.name, loc.region, loc.country].filter(Boolean).join(", ");
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseCoordinate(value: string | undefined, limit: number): number | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : undefined;
}

export function resolveLocation(searchParams: SearchParams): ActiveLocation {
  const lat = parseCoordinate(first(searchParams.lat), 90);
  const lon = parseCoordinate(first(searchParams.lon), 180);

  if (lat === undefined || lon === undefined) {
    return { lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon, label: DEFAULT_LOCATION_LABEL };
  }

  const name = first(searchParams.name)?.trim();
  return { lat, lon, label: name || `${lat.toFixed(3)}, ${lon.toFixed(3)}` };
}
