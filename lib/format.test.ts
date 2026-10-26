import { describe, expect, it } from "vitest";
import { compassDirection, formatClock, formatDay, formatHour, formatMeasurement } from "./format";

describe("formatHour", () => {
  it.each([
    ["2026-10-26T00:00", "12 AM"],
    ["2026-10-26T01:00", "1 AM"],
    ["2026-10-26T12:00", "12 PM"],
    ["2026-10-26T14:00", "2 PM"],
    ["2026-10-26T23:00", "11 PM"],
  ])("%s -> %s", (input, expected) => {
    expect(formatHour(input)).toBe(expected);
  });
});

describe("formatClock", () => {
  it("formats sun times from local clock components", () => {
    expect(formatClock("2026-10-26T07:21")).toBe("7:21 AM");
    expect(formatClock("2026-10-26T18:07")).toBe("6:07 PM");
  });

  it("labels missing events as unavailable", () => {
    expect(formatClock(null)).toBe("Unavailable");
  });

  it("ignores the host timezone", () => {
    const original = process.env.TZ;
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(formatClock("2026-10-26T07:21")).toBe("7:21 AM");
      expect(formatDay("2026-10-26")).toBe("Mon, Oct 26");
    } finally {
      process.env.TZ = original;
    }
  });
});

describe("formatDay", () => {
  it("formats calendar dates without shifting", () => {
    expect(formatDay("2026-10-26")).toBe("Mon, Oct 26");
    expect(formatDay("2026-11-01")).toBe("Sun, Nov 1");
  });
});

describe("compassDirection", () => {
  it.each([
    [0, "N"],
    [359, "N"],
    [45, "NE"],
    [90, "E"],
    [230, "SW"],
    [360, "N"],
  ])("%d° -> %s", (deg, expected) => {
    expect(compassDirection(deg)).toBe(expected);
  });

  it("returns null when unavailable", () => {
    expect(compassDirection(null)).toBeNull();
  });
});

describe("formatMeasurement", () => {
  it("rounds and appends the unit", () => {
    expect(formatMeasurement(74.3, "°F")).toBe("74°F");
    expect(formatMeasurement(5.6, "km/h", " ")).toBe("6 km/h");
    expect(formatMeasurement(-0.4, "°C")).toBe("0°C");
  });

  it("does not fabricate zero for missing values", () => {
    expect(formatMeasurement(null, "°F")).toBe("Unavailable");
  });
});
