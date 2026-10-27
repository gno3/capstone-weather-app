import { runChat } from "@/lib/ai/chat";
import { parseChatRequest } from "@/lib/ai/chat-validation";
import { AiConfigError } from "@/lib/ai/client";
import { chatRateLimiter, clientIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = chatRateLimiter.check(clientIp(request));
  if (!limit.allowed) {
    return Response.json(
      { error: "Too many questions. Try again in a few minutes." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = parseChatRequest(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    return Response.json(await runChat(parsed.messages, parsed.context));
  } catch (err) {
    // Message contents are never logged.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : "unknown error";
    if (err instanceof AiConfigError) {
      console.error("[chat] AI not configured:", reason);
      return Response.json({ error: "Chat is unavailable right now." }, { status: 503 });
    }
    console.error("[chat] failed:", reason);
    return Response.json(
      { error: "Chat couldn't answer right now. Please try again." },
      { status: 502 },
    );
  }
}
