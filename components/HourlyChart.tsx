"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatHour, formatMeasurement } from "@/lib/format";
import type { ForecastUnits, HourlyPoint } from "@/lib/types";

const TEMPERATURE_COLOR = "#f97316";
const PRECIPITATION_COLOR = "#38bdf8";

export default function HourlyChart({
  hourly,
  units,
  timezone,
}: {
  hourly: HourlyPoint[];
  units: ForecastUnits;
  timezone: string;
}) {
  const data = hourly.map((point) => ({
    time: point.time,
    hour: formatHour(point.time),
    temperature: point.temperature,
    precipitation: point.precipitationProbability,
  }));

  return (
    <section
      aria-labelledby="hourly-heading"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 id="hourly-heading" className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
        Next 24 hours
      </h2>
      <p className="mt-1 break-words text-xs text-zinc-500 dark:text-zinc-400">
        Temperature ({units.temperature}) and chance of precipitation (%), local time ({timezone})
      </p>
      <div
        role="img"
        aria-label={`Hourly temperature in ${units.temperature} and precipitation probability for the next 24 hours, from ${data[0]?.hour} to ${data[data.length - 1]?.hour} local time`}
        className="mt-3 h-64 w-full min-w-0"
        data-testid="hourly-chart"
      >
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 320, height: 256 }}>
          <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.15} />
            <XAxis
              dataKey="hour"
              interval="preserveStartEnd"
              minTickGap={12}
              tick={{ fontSize: 11, fill: "currentColor" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="temperature"
              orientation="left"
              width={40}
              tick={{ fontSize: 11, fill: "currentColor" }}
              tickFormatter={(v: number) => `${Math.round(v)}°`}
              domain={["auto", "auto"]}
              allowDecimals={false}
            />
            <YAxis
              yAxisId="precipitation"
              orientation="right"
              width={40}
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tick={{ fontSize: 11, fill: "currentColor" }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              labelFormatter={(_label, payload) => {
                const time = payload?.[0]?.payload?.time as string | undefined;
                return time ? `${formatHour(time)} (${time.slice(0, 10)})` : "";
              }}
              formatter={(value, _name, item) => {
                const n = typeof value === "number" ? value : null;
                return item.dataKey === "temperature"
                  ? formatMeasurement(n, units.temperature)
                  : formatMeasurement(n, "%");
              }}
              contentStyle={{ fontSize: 12, color: "#18181b" }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              yAxisId="precipitation"
              dataKey="precipitation"
              name="Precipitation chance"
              fill={PRECIPITATION_COLOR}
              fillOpacity={0.6}
              isAnimationActive={false}
            />
            <Line
              yAxisId="temperature"
              type="monotone"
              dataKey="temperature"
              name={`Temperature (${units.temperature})`}
              stroke={TEMPERATURE_COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
