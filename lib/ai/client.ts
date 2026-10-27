import { DefaultAzureCredential, getBearerTokenProvider } from "@azure/identity";
import { AzureOpenAI } from "openai";

export const COGNITIVE_SERVICES_SCOPE = "https://cognitiveservices.azure.com/.default";

const REQUIRED_ENV = [
  "AZURE_OPENAI_ENDPOINT",
  "AZURE_OPENAI_DEPLOYMENT",
  "AZURE_OPENAI_API_VERSION",
] as const;

export class AiConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(`Azure OpenAI is not configured; missing: ${missing.join(", ")}`);
    this.name = "AiConfigError";
  }
}

export type AiClient = { client: AzureOpenAI; deployment: string };

let cached: AiClient | undefined;

/** Server-only Azure OpenAI client authenticated with Entra ID tokens (never an API key). */
export function getAiClient(): AiClient {
  if (cached) return cached;

  const missing = REQUIRED_ENV.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new AiConfigError(missing);

  const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.trim();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT!.trim();
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION!.trim();

  const client = new AzureOpenAI({
    endpoint,
    deployment,
    apiVersion,
    azureADTokenProvider: getBearerTokenProvider(
      new DefaultAzureCredential(),
      COGNITIVE_SERVICES_SCOPE,
    ),
    timeout: 10_000,
    maxRetries: 1,
  });

  cached = { client, deployment };
  return cached;
}
