import { HeadingSkeleton, SearchSkeleton, WeatherSkeleton } from "@/components/WeatherSkeleton";

export default function Loading() {
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <SearchSkeleton />
      <HeadingSkeleton />
      <WeatherSkeleton />
    </main>
  );
}
