"use client";

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  // The error object is intentionally not rendered; details stay in server logs.
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        <div className="min-w-0">
          <p className="font-semibold">We couldn&apos;t load the weather right now.</p>
          <p className="text-sm">The forecast service may be temporarily unavailable.</p>
        </div>
        <button
          type="button"
          onClick={() => retry()}
          className="min-h-11 rounded-md bg-amber-600 px-4 font-medium text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
