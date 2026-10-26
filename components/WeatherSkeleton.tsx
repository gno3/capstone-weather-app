import type { ReactNode } from "react";

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`} />;
}

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200 bg-white p-4 sm:p-6 dark:border-zinc-800 dark:bg-zinc-900">
      {children}
    </div>
  );
}

/** Placeholder for the forecast sections; contains no weather values. */
export function WeatherSkeleton() {
  return (
    <div role="status" aria-label="Loading weather" className="flex min-w-0 flex-col gap-4">
      <span className="sr-only">Loading weather…</span>
      <Card>
        <Block className="h-4 w-36" />
        <div className="mt-3 flex items-center gap-4">
          <Block className="h-12 w-12 rounded-full" />
          <div className="flex flex-col gap-2">
            <Block className="h-10 w-24" />
            <Block className="h-4 w-28" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <Block className="h-9" />
          <Block className="h-9" />
          <Block className="h-9" />
        </div>
      </Card>
      <Card>
        <Block className="h-4 w-28" />
        <Block className="mt-3 h-64 w-full" />
      </Card>
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] sm:items-start">
        <Card>
          <Block className="h-4 w-28" />
          <div className="mt-3 flex flex-col gap-3">
            {Array.from({ length: 7 }, (_, i) => (
              <Block key={i} className="h-6 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <Block className="h-4 w-32" />
          <Block className="mt-3 h-12 w-full" />
        </Card>
      </div>
    </div>
  );
}

/** Placeholder for the location heading and units control. */
export function HeadingSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Block className="h-8 w-48 max-w-full" />
      <Block className="h-12 w-24 rounded-lg" />
    </div>
  );
}

/** Matches the LocationSearch input's size while it loads. */
export function SearchSkeleton() {
  return (
    <div
      aria-hidden
      className="h-[50px] w-full max-w-md rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
    />
  );
}
