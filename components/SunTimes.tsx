import { formatClock } from "@/lib/format";
import type { DailySummary } from "@/lib/types";

export default function SunTimes({ today, timezone }: { today: DailySummary; timezone: string }) {
  return (
    <section
      aria-labelledby="sun-heading"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="sun-heading" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Sunrise &amp; sunset
      </h2>
      <dl className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">
            <span aria-hidden>🌅 </span>Sunrise
          </dt>
          <dd className="text-lg font-medium">{formatClock(today.sunrise)}</dd>
        </div>
        <div>
          <dt className="text-sm text-zinc-500 dark:text-zinc-400">
            <span aria-hidden>🌇 </span>Sunset
          </dt>
          <dd className="text-lg font-medium">{formatClock(today.sunset)}</dd>
        </div>
      </dl>
      <p className="mt-2 break-words text-xs text-zinc-500 dark:text-zinc-400">
        Local time ({timezone})
      </p>
    </section>
  );
}
