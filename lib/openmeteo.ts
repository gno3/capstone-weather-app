import type { Location } from "./types";

const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const GEOCODING_REVALIDATE_SECONDS = 86400;

export class OpenMeteoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OpenMeteoError";
  }
}

type RawGeocodingResult = {
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  admin1?: string;
  timezone: string;
};

type RawGeocodingResponse = {
  results?: RawGeocodingResult[];
};

function toLocation(raw: RawGeocodingResult): Location {
  const location: Location = {
    name: raw.name,
    country: raw.country,
    lat: raw.latitude,
    lon: raw.longitude,
    timezone: raw.timezone,
  };
  if (raw.admin1) location.region = raw.admin1;
  return location;
}

export async function searchLocations(q: string): Promise<Location[]> {
  const params = new URLSearchParams({ name: q, count: "5", language: "en", format: "json" });

  let res: Response;
  try {
    res = await fetch(`${GEOCODING_URL}?${params}`, {
      next: { revalidate: GEOCODING_REVALIDATE_SECONDS },
    });
  } catch (err) {
    throw new OpenMeteoError("Geocoding request failed", { cause: err });
  }

  if (!res.ok) {
    throw new OpenMeteoError(`Geocoding request failed with status ${res.status}`);
  }

  let body: RawGeocodingResponse;
  try {
    body = (await res.json()) as RawGeocodingResponse;
  } catch (err) {
    throw new OpenMeteoError("Geocoding response was not valid JSON", { cause: err });
  }

  return (body.results ?? []).map(toLocation);
}
