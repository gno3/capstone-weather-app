import { MAX_LATITUDE, MAX_LONGITUDE, parseCoordinate } from "@/lib/location";
import { getForecast, OpenMeteoError } from "@/lib/openmeteo";
import { parseUnits } from "@/lib/units";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = parseCoordinate(params.get("lat"), MAX_LATITUDE);
  const lon = parseCoordinate(params.get("lon"), MAX_LONGITUDE);
  const units = parseUnits(params.get("units"));

  if (lat === undefined || lon === undefined) {
    return Response.json(
      { error: "Provide valid coordinates: lat between -90 and 90, lon between -180 and 180." },
      { status: 400 },
    );
  }
  if (units === undefined) {
    return Response.json({ error: "Units must be imperial or metric." }, { status: 400 });
  }

  try {
    return Response.json(await getForecast(lat, lon, units));
  } catch (err) {
    if (!(err instanceof OpenMeteoError)) throw err;
    console.error("Forecast failed:", err.message);
    return Response.json(
      { error: "Weather forecast is unavailable. Please try again." },
      { status: 502 },
    );
  }
}
