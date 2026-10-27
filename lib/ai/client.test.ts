import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getBearerTokenProvider, DefaultAzureCredential } = vi.hoisted(() => ({
  getBearerTokenProvider: vi.fn(() => async () => "test-token"),
  DefaultAzureCredential: vi.fn(),
}));

vi.mock("@azure/identity", () => ({ getBearerTokenProvider, DefaultAzureCredential }));

const ENV = {
  AZURE_OPENAI_ENDPOINT: "https://example.openai.azure.com",
  AZURE_OPENAI_DEPLOYMENT: "gpt-4o-mini",
  AZURE_OPENAI_API_VERSION: "2024-10-21",
};

async function loadClient() {
  vi.resetModules();
  return import("./client");
}

describe("getAiClient", () => {
  beforeEach(() => {
    getBearerTokenProvider.mockClear();
    DefaultAzureCredential.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws AiConfigError naming missing variables", async () => {
    vi.stubEnv("AZURE_OPENAI_ENDPOINT", ENV.AZURE_OPENAI_ENDPOINT);
    vi.stubEnv("AZURE_OPENAI_DEPLOYMENT", "");
    vi.stubEnv("AZURE_OPENAI_API_VERSION", "");
    const { getAiClient, AiConfigError } = await loadClient();

    let error: unknown;
    try {
      getAiClient();
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(AiConfigError);
    expect((error as Error).message).toContain("AZURE_OPENAI_DEPLOYMENT");
    expect((error as Error).message).toContain("AZURE_OPENAI_API_VERSION");
    expect((error as Error).message).not.toContain("AZURE_OPENAI_ENDPOINT");
    expect(getBearerTokenProvider).not.toHaveBeenCalled();
  });

  it("requests tokens for the Cognitive Services scope when configured", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getAiClient, COGNITIVE_SERVICES_SCOPE } = await loadClient();

    const { client, deployment } = getAiClient();

    expect(COGNITIVE_SERVICES_SCOPE).toBe("https://cognitiveservices.azure.com/.default");
    expect(DefaultAzureCredential).toHaveBeenCalledTimes(1);
    expect(getBearerTokenProvider).toHaveBeenCalledWith(
      expect.any(DefaultAzureCredential),
      "https://cognitiveservices.azure.com/.default",
    );
    expect(deployment).toBe(ENV.AZURE_OPENAI_DEPLOYMENT);
    expect(client).toBeDefined();
  });

  it("reuses the same client across calls", async () => {
    for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value);
    const { getAiClient } = await loadClient();

    const first = getAiClient();
    const second = getAiClient();

    expect(second).toBe(first);
    expect(second.client).toBe(first.client);
    expect(getBearerTokenProvider).toHaveBeenCalledTimes(1);
  });
});
