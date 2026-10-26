import { Suspense } from "react";
import CurrentCard from "@/components/CurrentCard";
import DailyList from "@/components/DailyList";
import HourlyChart from "@/components/HourlyChart";
import LocationSearch from "@/components/LocationSearch";
import SunTimes from "@/components/SunTimes";
import UnitsToggle from "@/components/UnitsToggle";
import { HeadingSkeleton, SearchSkeleton, WeatherSkeleton } from "@/components/WeatherSkeleton";
import { resolveLocation } from "@/lib/location";
import { getForecast } from "@/lib/openmeteo";
import type { UnitSystem } from "@/lib/types";
import { resolveUnits } from "@/lib/units";

async function ForecastContent({
  lat,
  lon,
  units,
}: {
  lat: number;
  lon: number;
  units: UnitSystem;
}) {
  const forecast = await getForecast(lat, lon, units);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <CurrentCard current={forecast.current} units={forecast.units} />
      <HourlyChart hourly={forecast.hourly} units={forecast.units} timezone={forecast.timezone} />
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-start">
        <DailyList daily={forecast.daily} units={forecast.units} />
        <SunTimes today={forecast.daily[0]} timezone={forecast.timezone} />
      </div>
    </div>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const params = await searchParams;
  const location = resolveLocation(params);
  const units = resolveUnits(params);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="min-w-0 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
          {location.label}
        </h1>
        <UnitsToggle units={units} />
      </div>
      {/* Keyed so a new location/unit shows skeletons instead of stale weather. */}
      <Suspense key={`${location.lat},${location.lon},${units}`} fallback={<WeatherSkeleton />}>
        <ForecastContent lat={location.lat} lon={location.lon} units={units} />
      </Suspense>
    </>
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Suspense fallback={<SearchSkeleton />}>
        <LocationSearch />
      </Suspense>
      <Suspense
        fallback={
          <>
            <HeadingSkeleton />
            <WeatherSkeleton />
          </>
        }
      >
        <Dashboard searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
