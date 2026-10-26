import { describe, expect, it } from "vitest";
import { formatLocationLabel, resolveLocation } from "./location";

describe("resolveLocation", () => {
  it("defaults to St. Louis when the URL has no location", () => {
    expect(resolveLocation({})).toEqual({ lat: 38.627, lon: -90.199, label: "St. Louis, MO" });
  });

  it("uses lat, lon, and name from the URL", () => {
    expect(resolveLocation({ lat: "51.50853", lon: "-0.12574", name: "London" })).toEqual({
      lat: 51.50853,
      lon: -0.12574,
      label: "London",
    });
  });

  it("falls back to the default for non-numeric coordinates", () => {
    expect(resolveLocation({ lat: "abc", lon: "-0.12574" }).label).toBe("St. Louis, MO");
  });

  it("falls back to the default for empty coordinates", () => {
    expect(resolveLocation({ lat: "", lon: "" }).label).toBe("St. Louis, MO");
  });

  it("falls back to the default for out-of-range coordinates", () => {
    expect(resolveLocation({ lat: "95", lon: "10" }).label).toBe("St. Louis, MO");
    expect(resolveLocation({ lat: "10", lon: "-181" }).label).toBe("St. Louis, MO");
  });

  it("labels by coordinates when name is missing", () => {
    expect(resolveLocation({ lat: "40", lon: "-75" })).toEqual({
      lat: 40,
      lon: -75,
      label: "40.000, -75.000",
    });
  });

  it("uses the first value of repeated params", () => {
    expect(resolveLocation({ lat: ["40", "50"], lon: "-75", name: ["A", "B"] }).label).toBe("A");
  });
});

describe("formatLocationLabel", () => {
  it("includes the region when present", () => {
    expect(
      formatLocationLabel({ name: "Springfield", region: "Illinois", country: "United States" }),
    ).toBe("Springfield, Illinois, United States");
  });

  it("skips a missing region", () => {
    expect(formatLocationLabel({ name: "Monaco", country: "Monaco" })).toBe("Monaco, Monaco");
  });
});
