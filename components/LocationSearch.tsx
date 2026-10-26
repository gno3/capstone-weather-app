"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatLocationLabel } from "@/lib/location";
import type { Location } from "@/lib/types";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 300;

type Status = "idle" | "loading" | "success" | "error";

export default function LocationSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listboxId = useId();

  const [input, setInput] = useState("");
  // Separate from `input` so filling the box with a selected label doesn't trigger a new search.
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<Location[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    const term = searchTerm.trim();
    if (term.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/geocode?${new URLSearchParams({ q: term })}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = (await res.json()) as { results: Location[] };
        setResults(data.results);
        setActiveIndex(-1);
        setStatus("success");
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, retryNonce]);

  const hasQuery = searchTerm.trim().length >= MIN_QUERY_LENGTH;
  const showDropdown = open && hasQuery && status !== "idle";
  const showOptions = showDropdown && status !== "error" && results.length > 0;

  function handleChange(value: string) {
    setInput(value);
    setSearchTerm(value);
    setOpen(true);
    setActiveIndex(-1);
    if (value.trim().length < MIN_QUERY_LENGTH) {
      setResults([]);
      setStatus("idle");
    }
  }

  function select(location: Location) {
    const label = formatLocationLabel(location);
    const params = new URLSearchParams({
      lat: String(location.lat),
      lon: String(location.lon),
      name: label,
    });
    const units = searchParams.get("units");
    if (units) params.set("units", units);

    router.push(`${pathname}?${params}`);
    setInput(label);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        if (status !== "success" || results.length === 0) return;
        e.preventDefault();
        setOpen(true);
        const last = results.length - 1;
        setActiveIndex((i) =>
          e.key === "ArrowDown" ? (i >= last ? 0 : i + 1) : i <= 0 ? last : i - 1,
        );
        break;
      }
      case "Enter":
        if (showOptions && activeIndex >= 0) {
          e.preventDefault();
          select(results[activeIndex]);
        }
        break;
      case "Escape":
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  }

  let liveMessage = "";
  if (showDropdown) {
    if (status === "loading" && results.length === 0) liveMessage = "Searching…";
    else if (status === "error") liveMessage = "Couldn't search locations.";
    else if (status === "success" && results.length === 0) liveMessage = "No locations found";
    else if (status === "success")
      liveMessage = `${results.length} location${results.length === 1 ? "" : "s"} found`;
  }

  return (
    <div className="relative w-full max-w-md">
      <input
        type="text"
        role="combobox"
        aria-label="Search for a location"
        aria-autocomplete="list"
        aria-expanded={showOptions}
        aria-controls={showOptions ? listboxId : undefined}
        aria-activedescendant={
          showOptions && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
        autoComplete="off"
        spellCheck={false}
        placeholder="Search for a city…"
        value={input}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <div aria-live="polite" className="sr-only">
        {liveMessage}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {status === "error" ? (
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300">
              <span>Couldn&apos;t search locations.</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setRetryNonce((n) => n + 1)}
                className="min-h-11 rounded-md px-3 font-medium text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-zinc-800"
              >
                Retry
              </button>
            </div>
          ) : status === "loading" && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-500">No locations found</p>
          ) : null}

          {showOptions && (
            <ul id={listboxId} role="listbox" aria-label="Matching locations">
              {results.map((loc, i) => (
                <li
                  key={`${loc.lat},${loc.lon},${i}`}
                  id={`${listboxId}-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    select(loc);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex min-h-11 cursor-pointer items-center px-4 py-2 text-base text-zinc-900 dark:text-zinc-100 ${
                    i === activeIndex ? "bg-blue-50 dark:bg-zinc-800" : ""
                  }`}
                >
                  {formatLocationLabel(loc)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
