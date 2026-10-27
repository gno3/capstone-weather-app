import {
  CONVERSATION_TOO_LONG_ERROR,
  MAX_ASSISTANT_CHARS,
  MAX_MESSAGE_CHARS,
  MAX_MESSAGES,
  MESSAGE_TOO_LONG_ERROR,
  type ChatContext,
  type ChatMessage,
} from "@/lib/ai/chat-validation";

export const SUGGESTED_QUESTIONS = [
  "Will it rain tomorrow?",
  "How windy is it today?",
  "What's the high this weekend?",
] as const;

export const RETRY_ERROR = "Chat couldn't answer right now. Please try again.";
export const UNAVAILABLE_ERROR = "Chat is unavailable right now.";
export const RATE_LIMIT_ERROR = "Too many questions. Try again in a few minutes.";

export type DraftResult =
  | { ok: true; content: string }
  // `error: null` means "do nothing" (blank draft).
  | { ok: false; error: string | null };

export function validateDraft(draft: string, messages: ChatMessage[]): DraftResult {
  const content = draft.trim();
  if (content === "") return { ok: false, error: null };
  if (content.length > MAX_MESSAGE_CHARS) return { ok: false, error: MESSAGE_TOO_LONG_ERROR };
  if (messages.length + 1 > MAX_MESSAGES) return { ok: false, error: CONVERSATION_TOO_LONG_ERROR };
  return { ok: true, content };
}

export function buildChatRequest(
  messages: ChatMessage[],
  context: ChatContext,
): { messages: ChatMessage[]; context: ChatContext } {
  return {
    // Long model replies are capped so they never trip the server's history limit.
    messages: messages.map(({ role, content }) => ({
      role,
      content: role === "assistant" ? content.slice(0, MAX_ASSISTANT_CHARS) : content,
    })),
    context: { lat: context.lat, lon: context.lon, name: context.name, units: context.units },
  };
}

export function errorMessageFor(status: number | "network", serverMessage?: unknown): string {
  if (status === 429) return RATE_LIMIT_ERROR;
  if (status === 400 && typeof serverMessage === "string" && serverMessage.trim()) {
    return serverMessage;
  }
  if (status === 503) return UNAVAILABLE_ERROR;
  return RETRY_ERROR;
}
