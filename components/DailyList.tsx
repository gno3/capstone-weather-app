import { formatDay, formatMeasurement } from "@/lib/format";
import type { DailySummary, ForecastUnits } from "@/lib/types";
import { describeWeather } from "@/lib/wmo";

export default function DailyList({ daily, units }: { daily: DailySummary[]; units: ForecastUnits }) {
  return (
    <section
      aria-labelledby="daily-heading"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="daily-heading" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        7-day forecast
      </h2>
      <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
        {daily.map((day, i) => {
          // The daily request has no is_day value, so daily summaries use daytime icons.
          const condition = describeWeather(day.weatherCode, true);
          return (
            <li
              key={day.date}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[7rem_minmax(0,1fr)_auto_auto]"
            >
              <span className="font-medium">
                {i === 0 ? "Today" : formatDay(day.date)}
                {i === 0 && <span className="sr-only">, {formatDay(day.date)}</span>}
              </span>
              <span className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 sm:col-start-auto sm:row-start-auto">
                <span aria-hidden>{condition.emoji}</span>
                <span className="break-words text-zinc-700 dark:text-zinc-300">{condition.label}</span>
              </span>
              <span
                className="text-right text-sky-700 tabular-nums dark:text-sky-400"
                title="Maximum precipitation probability"
              >
                <span aria-hidden>💧</span>
                <span className="sr-only">Precipitation chance </span>
                {formatMeasurement(day.precipitationProbabilityMax, "%")}
              </span>
              <span className="text-right tabular-nums">
                <span className="sr-only">High </span>
                <span className="font-semibold">
                  {formatMeasurement(day.temperatureMax, units.temperature)}
                </span>
                <span aria-hidden className="text-zinc-400"> / </span>
                <span className="sr-only">, low </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  {formatMeasurement(day.temperatureMin, units.temperature)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
