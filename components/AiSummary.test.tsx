import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AiSummary, { type AiSummaryProps } from "./AiSummary";

const { getCachedSummary } = vi.hoisted(() => ({ getCachedSummary: vi.fn() }));

vi.mock("@/lib/ai/cached-summary", () => ({ getCachedSummary }));

const props: AiSummaryProps = {
  lat: 38.63,
  lon: -90.2,
  units: "metric",
  locationName: "St. Louis, Missouri, United States",
  hour: "2026-10-26T13",
};

describe("AiSummary", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getCachedSummary.mockReset();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("renders nothing and logs when the summary fails", async () => {
    getCachedSummary.mockRejectedValue(new Error("boom"));

    await expect(AiSummary(props)).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      "[ai-summary] failed",
      expect.objectContaining({ lat: props.lat, lon: props.lon, units: props.units }),
      expect.any(Error),
    );
  });

  it("renders the summary as plain text under an 'AI summary' heading", async () => {
    getCachedSummary.mockResolvedValue("Sunny and 24 °C this afternoon <b>today</b>.");

    const element = await AiSummary(props);
    const html = renderToStaticMarkup(element!);

    expect(getCachedSummary).toHaveBeenCalledWith(
      props.lat,
      props.lon,
      props.units,
      props.locationName,
      props.hour,
    );
    expect(html).toContain("AI summary");
    expect(html).toContain("Sunny and 24 °C this afternoon");
    expect(html).toContain('aria-labelledby="ai-summary-heading"');
    expect(html).not.toContain("<b>");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
