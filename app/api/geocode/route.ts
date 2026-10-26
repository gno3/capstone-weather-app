import { searchLocations } from "@/lib/openmeteo";

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (q.length < MIN_QUERY_LENGTH) {
    return Response.json({ error: "Enter at least 2 characters." }, { status: 400 });
  }
  if (q.length > MAX_QUERY_LENGTH) {
    return Response.json({ error: "Search is too long." }, { status: 400 });
  }

  try {
    const results = await searchLocations(q);
    return Response.json({ results });
  } catch (err) {
    console.error("Geocoding failed:", err instanceof Error ? err.message : "unknown error");
    return Response.json(
      { error: "Location search is unavailable. Please try again." },
      { status: 502 },
    );
  }
}
