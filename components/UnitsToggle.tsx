"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { UnitSystem } from "@/lib/types";

const OPTIONS: { value: UnitSystem; label: string; description: string }[] = [
  { value: "imperial", label: "°F", description: "Imperial (°F, mph)" },
  { value: "metric", label: "°C", description: "Metric (°C, km/h)" },
];

export default function UnitsToggle({ units }: { units: UnitSystem }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function select(next: UnitSystem) {
    if (next === units) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("units", next);
    router.push(`${pathname}?${params}`, { scroll: false });
  }

  return (
    <div
      role="group"
      aria-label="Units"
      className="inline-flex shrink-0 rounded-lg border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
    >
      {OPTIONS.map((option) => {
        const selected = option.value === units;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.description}
            title={option.description}
            onClick={() => select(option.value)}
            className={`min-h-11 min-w-11 rounded-md px-3 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              selected
                ? "bg-blue-600 text-white"
                : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
