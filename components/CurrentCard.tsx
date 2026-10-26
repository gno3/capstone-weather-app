import { compassDirection, formatMeasurement, UNAVAILABLE } from "@/lib/format";
import type { CurrentConditions, ForecastUnits } from "@/lib/types";
import { describeWeather } from "@/lib/wmo";

export default function CurrentCard({
  current,
  units,
}: {
  current: CurrentConditions;
  units: ForecastUnits;
}) {
  const condition = describeWeather(current.weatherCode, current.isDay);
  const direction = compassDirection(current.windDirection);
  const wind =
    current.windSpeed === null
      ? UNAVAILABLE
      : `${formatMeasurement(current.windSpeed, units.windSpeed, " ")}${direction ? ` ${direction}` : ""}`;

  return (
    <section
      aria-labelledby="current-heading"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="current-heading" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Current conditions
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span aria-hidden className="text-5xl leading-none">
          {condition.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-4xl font-semibold tracking-tight sm:text-5xl">
            {formatMeasurement(current.temperature, units.temperature)}
          </p>
          <p className="break-words text-base text-zinc-700 dark:text-zinc-300">{condition.label}</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm min-[360px]:grid-cols-3">
        <div className="min-w-0">
          <dt className="text-zinc-500 dark:text-zinc-400">Feels like</dt>
          <dd className="font-medium">
            {formatMeasurement(current.apparentTemperature, units.temperature)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-zinc-500 dark:text-zinc-400">Humidity</dt>
          <dd className="font-medium">{formatMeasurement(current.humidity, "%")}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-zinc-500 dark:text-zinc-400">Wind</dt>
          <dd className="font-medium">
            {wind}
            {direction && current.windDirection !== null && (
              <span className="sr-only"> (from {Math.round(current.windDirection)}°)</span>
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
