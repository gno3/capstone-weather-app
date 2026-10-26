import { connection } from "next/server";

export async function GET() {
  // Opt out of build-time prerendering so a 200 proves the server is live.
  await connection();
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
