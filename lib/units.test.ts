import { describe, expect, it } from "vitest";
import { parseUnits, resolveUnits, UNIT_LABELS } from "./units";

describe("resolveUnits (page)", () => {
  it.each([
    ["absent", {}, "imperial"],
    ["imperial", { units: "imperial" }, "imperial"],
    ["metric", { units: "metric" }, "metric"],
    ["unsupported", { units: "kelvin" }, "imperial"],
    ["empty", { units: "" }, "imperial"],
    ["wrong case", { units: "Metric" }, "imperial"],
    ["repeated (first wins)", { units: ["metric", "imperial"] }, "metric"],
    ["repeated unsupported first", { units: ["kelvin", "metric"] }, "imperial"],
  ])("%s -> %s", (_label, params, expected) => {
    expect(resolveUnits(params)).toBe(expected);
  });
});

describe("parseUnits (API)", () => {
  it("defaults omitted units to imperial", () => {
    expect(parseUnits(null)).toBe("imperial");
    expect(parseUnits(undefined)).toBe("imperial");
  });

  it("accepts the exact supported values", () => {
    expect(parseUnits("imperial")).toBe("imperial");
    expect(parseUnits("metric")).toBe("metric");
  });

  it.each(["", " ", "kelvin", "METRIC", "metric "])("rejects explicit %j", (value) => {
    expect(parseUnits(value)).toBeUndefined();
  });
});

describe("UNIT_LABELS", () => {
  it("labels each system consistently", () => {
    expect(UNIT_LABELS.imperial).toEqual({
      system: "imperial",
      temperature: "°F",
      windSpeed: "mph",
      precipitation: "in",
    });
    expect(UNIT_LABELS.metric).toEqual({
      system: "metric",
      temperature: "°C",
      windSpeed: "km/h",
      precipitation: "mm",
    });
  });
});
