import { getCachedSummary } from "@/lib/ai/cached-summary";
import type { UnitSystem } from "@/lib/types";

export type AiSummaryProps = {
  lat: number;
  lon: number;
  units: UnitSystem;
  locationName: string;
  hour: string;
};

/** Fails soft: any AI or config error is logged server-side and the section is omitted. */
export default async function AiSummary({ lat, lon, units, locationName, hour }: AiSummaryProps) {
  let summary: string;
  try {
    summary = await getCachedSummary(lat, lon, units, locationName, hour);
  } catch (err) {
    console.error("[ai-summary] failed", { lat, lon, units }, err);
    return null;
  }

  return (
    <section
      aria-labelledby="ai-summary-heading"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="ai-summary-heading" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        AI summary
      </h2>
      <p className="mt-2 break-words text-base text-zinc-700 dark:text-zinc-300">{summary}</p>
    </section>
  );
}
