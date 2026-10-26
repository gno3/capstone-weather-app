import { describe, expect, it } from "vitest";
import { formatLocationLabel, parseCoordinate, resolveLocation } from "./location";

describe("resolveLocation", () => {
  it("defaults to Northbrook when the URL has no location", () => {
    expect(resolveLocation({})).toEqual({ lat: 42.128, lon: -87.829, label: "Northbrook, IL" });
  });

  it("uses lat, lon, and name from the URL", () => {
    expect(resolveLocation({ lat: "51.50853", lon: "-0.12574", name: "London" })).toEqual({
      lat: 51.50853,
      lon: -0.12574,
      label: "London",
    });
  });

  it("falls back to the default for non-numeric coordinates", () => {
    expect(resolveLocation({ lat: "abc", lon: "-0.12574" }).label).toBe("Northbrook, IL");
  });

  it("falls back to the default for empty coordinates", () => {
    expect(resolveLocation({ lat: "", lon: "" }).label).toBe("Northbrook, IL");
  });

  it("falls back to the default for out-of-range coordinates", () => {
    expect(resolveLocation({ lat: "95", lon: "10" }).label).toBe("Northbrook, IL");
    expect(resolveLocation({ lat: "10", lon: "-181" }).label).toBe("Northbrook, IL");
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

describe("parseCoordinate", () => {
  it.each([
    ["0", 90, 0],
    ["-0", 90, -0],
    ["90", 90, 90],
    ["-90", 90, -90],
    ["180", 180, 180],
    ["-180", 180, -180],
    ["38.627", 90, 38.627],
  ])("accepts %j within ±%d", (value, limit, expected) => {
    expect(parseCoordinate(value, limit)).toBe(expected);
  });

  it.each([
    [undefined, 90],
    [null, 90],
    ["", 90],
    ["   ", 90],
    ["abc", 90],
    ["NaN", 90],
    ["Infinity", 90],
    ["-Infinity", 180],
    ["90.0001", 90],
    ["-90.5", 90],
    ["180.1", 180],
    ["-181", 180],
  ])("rejects %j within ±%d", (value, limit) => {
    expect(parseCoordinate(value, limit)).toBeUndefined();
  });
});

describe("resolveLocation boundaries", () => {
  it("accepts zero coordinates instead of falling back", () => {
    expect(resolveLocation({ lat: "0", lon: "0" })).toEqual({
      lat: 0,
      lon: 0,
      label: "0.000, 0.000",
    });
  });

  it("accepts range endpoints", () => {
    expect(resolveLocation({ lat: "90", lon: "-180", name: "Edge" })).toEqual({
      lat: 90,
      lon: -180,
      label: "Edge",
    });
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
