import { Suspense } from "react";
import LocationSearch from "@/components/LocationSearch";
import { resolveLocation } from "@/lib/location";

async function ActiveLocationHeading({
  searchParams,
}: {
  searchParams: PageProps<"/">["searchParams"];
}) {
  const location = resolveLocation(await searchParams);
  return <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{location.label}</h1>;
}

function SearchFallback() {
  return (
    <div
      aria-hidden
      className="h-[50px] w-full max-w-md rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <Suspense fallback={<SearchFallback />}>
        <LocationSearch />
      </Suspense>
      <Suspense
        fallback={<div className="h-8 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />}
      >
        <ActiveLocationHeading searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
