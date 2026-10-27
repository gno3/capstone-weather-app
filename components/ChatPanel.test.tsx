import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ChatPanel from "./ChatPanel";

describe("ChatPanel", () => {
  const html = renderToStaticMarkup(
    <ChatPanel lat={42.128} lon={-87.829} name="Northbrook, IL" units="imperial" />,
  );

  it("renders collapsed with a toggle", () => {
    expect(html).toContain("Ask about the weather");
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*aria-controls="[^"]+-panel"/);
    expect(html).toMatch(/<div id="[^"]+-panel" hidden=""/);
  });

  it("shows suggestions and an empty, live conversation", () => {
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Will it rain tomorrow?");
    expect(html).toContain("0/500");
    expect(html).not.toContain("New chat");
    expect(html).not.toContain("Retry");
  });

  it("disables Send for a blank draft", () => {
    expect(html).toMatch(/<button type="submit" disabled=""/);
  });
});
