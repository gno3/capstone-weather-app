import { describe, expect, it } from "vitest";
import { describeWeather, SUPPORTED_WMO_CODES, UNKNOWN_CONDITION } from "./wmo";

const EXPECTED: [number, string][] = [
  [0, "Clear sky"],
  [1, "Mainly clear"],
  [2, "Partly cloudy"],
  [3, "Overcast"],
  [45, "Fog"],
  [48, "Depositing rime fog"],
  [51, "Light drizzle"],
  [53, "Moderate drizzle"],
  [55, "Dense drizzle"],
  [56, "Light freezing drizzle"],
  [57, "Dense freezing drizzle"],
  [61, "Slight rain"],
  [63, "Moderate rain"],
  [65, "Heavy rain"],
  [66, "Light freezing rain"],
  [67, "Heavy freezing rain"],
  [71, "Slight snowfall"],
  [73, "Moderate snowfall"],
  [75, "Heavy snowfall"],
  [77, "Snow grains"],
  [80, "Slight rain showers"],
  [81, "Moderate rain showers"],
  [82, "Violent rain showers"],
  [85, "Slight snow showers"],
  [86, "Heavy snow showers"],
  [95, "Thunderstorm"],
  [96, "Thunderstorm with slight hail"],
  [99, "Thunderstorm with heavy hail"],
];

describe("describeWeather", () => {
  it("supports exactly the 28 Open-Meteo codes", () => {
    expect(SUPPORTED_WMO_CODES).toHaveLength(28);
    expect([...SUPPORTED_WMO_CODES].sort((a, b) => a - b)).toEqual(EXPECTED.map(([c]) => c));
  });

  it.each(EXPECTED)("code %d -> %s", (code, label) => {
    for (const isDay of [true, false]) {
      const condition = describeWeather(code, isDay);
      expect(condition.label).toBe(label);
      expect(condition.emoji).not.toBe("");
      expect(condition).not.toEqual(UNKNOWN_CONDITION);
    }
  });

  it.each([0, 1, 2])("code %d has distinct day and night variants", (code) => {
    const day = describeWeather(code, true);
    const night = describeWeather(code, false);
    expect(night.emoji).not.toBe(day.emoji);
    expect(night.emoji).toContain("🌙");
    expect(day.emoji).not.toContain("🌙");
  });

  it("defaults to the daytime variant", () => {
    expect(describeWeather(0)).toEqual(describeWeather(0, true));
  });

  it.each([null, 4, 100, -1])("returns an explicit unknown condition for %s", (code) => {
    expect(describeWeather(code)).toEqual({ label: "Unknown conditions", emoji: "❔" });
  });
});
