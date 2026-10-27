import { cacheLife } from "next/cache";
import { getForecast } from "../openmeteo";
import type { UnitSystem } from "../types";
import { summarizeForecast } from "./summary";

/**
 * Cached per (lat, lon, units, locationName, hour). The forecast is refetched inside the
 * scope (normally a fetch-cache hit) so the full forecast payload never becomes the key.
 */
export async function getCachedSummary(
  lat: number,
  lon: number,
  units: UnitSystem,
  locationName: string,
  hour: string,
): Promise<string> {
  "use cache";
  cacheLife("hours");
  void hour;
  const forecast = await getForecast(lat, lon, units);
  return summarizeForecast(forecast, locationName);
}
