import { MAX_LATITUDE, MAX_LONGITUDE, parseCoordinate } from "../location";
import type { UnitSystem } from "../types";
import { isUnitSystem } from "../units";

export const MAX_MESSAGE_CHARS = 500;
export const MAX_ASSISTANT_CHARS = 1000;
export const MAX_MESSAGES = 10;
export const MAX_NAME_CHARS = 200;
export const MIN_QUERY_CHARS = 2;
export const MAX_QUERY_CHARS = 100;

export type ChatRole = "user" | "assistant";

export type ChatMessage = { role: ChatRole; content: string };

export type ChatContext = { lat: number; lon: number; name: string; units: UnitSystem };

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export type ChatRequest = { messages: ChatMessage[]; context: ChatContext };

export type ChatRequestResult = ({ ok: true } & ChatRequest) | { ok: false; error: string };

export const MESSAGE_TOO_LONG_ERROR = `Messages can be at most ${MAX_MESSAGE_CHARS} characters. Please shorten your question.`;
export const CONVERSATION_TOO_LONG_ERROR = `This conversation has reached the ${MAX_MESSAGES}-message limit. Start a new chat to keep asking questions.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts JSON numbers or numeric strings, reusing the shared coordinate range rules. */
function toCoordinate(value: unknown, limit: number): number | undefined {
  if (typeof value === "number") return parseCoordinate(String(value), limit);
  if (typeof value === "string") return parseCoordinate(value, limit);
  return undefined;
}

function parseMessages(raw: unknown): ParseResult<ChatMessage[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "Send at least one message." };
  }
  if (raw.length > MAX_MESSAGES) return { ok: false, error: CONVERSATION_TOO_LONG_ERROR };

  const messages: ChatMessage[] = [];
  for (const item of raw) {
    if (!isRecord(item)) return { ok: false, error: "Each message must be an object." };
    const { role, content } = item;
    if (role !== "user" && role !== "assistant") {
      return { ok: false, error: "Messages must come from the user or the assistant." };
    }
    if (typeof content !== "string") return { ok: false, error: "Message content must be text." };
    const text = content.trim();
    if (text === "") return { ok: false, error: "Messages can't be blank." };
    if (role === "user" && text.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: MESSAGE_TOO_LONG_ERROR };
    }
    if (role === "assistant" && text.length > MAX_ASSISTANT_CHARS) {
      return { ok: false, error: `Assistant messages can be at most ${MAX_ASSISTANT_CHARS} characters.` };
    }
    messages.push({ role, content: text });
  }

  if (messages.at(-1)!.role !== "user") {
    return { ok: false, error: "The last message must be your question." };
  }
  return { ok: true, value: messages };
}

function parseContext(raw: unknown): ParseResult<ChatContext> {
  if (!isRecord(raw)) return { ok: false, error: "Missing dashboard location." };

  const lat = toCoordinate(raw.lat, MAX_LATITUDE);
  const lon = toCoordinate(raw.lon, MAX_LONGITUDE);
  if (lat === undefined || lon === undefined) {
    return {
      ok: false,
      error: "Provide valid coordinates: lat between -90 and 90, lon between -180 and 180.",
    };
  }
  if (!isUnitSystem(raw.units)) return { ok: false, error: "Units must be imperial or metric." };

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length === 0 || name.length > MAX_NAME_CHARS) {
    return { ok: false, error: `Location name must be 1-${MAX_NAME_CHARS} characters.` };
  }

  return { ok: true, value: { lat, lon, name, units: raw.units } };
}

export function parseChatRequest(body: unknown): ChatRequestResult {
  if (!isRecord(body)) return { ok: false, error: "Request body must be a JSON object." };

  const messages = parseMessages(body.messages);
  if (!messages.ok) return messages;
  const context = parseContext(body.context);
  if (!context.ok) return context;

  return { ok: true, messages: messages.value, context: context.value };
}

function parseArgsJson(raw: string): ParseResult<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Tool arguments were not valid JSON." };
  }
  return isRecord(parsed)
    ? { ok: true, value: parsed }
    : { ok: false, error: "Tool arguments must be a JSON object." };
}

export type SearchArgs = { query: string };
export type ForecastArgs = { lat: number; lon: number; units: UnitSystem };

export function parseSearchArgs(raw: string): ParseResult<SearchArgs> {
  const args = parseArgsJson(raw);
  if (!args.ok) return args;
  const query = typeof args.value.query === "string" ? args.value.query.trim() : "";
  if (query.length < MIN_QUERY_CHARS || query.length > MAX_QUERY_CHARS) {
    return { ok: false, error: `query must be ${MIN_QUERY_CHARS}-${MAX_QUERY_CHARS} characters.` };
  }
  return { ok: true, value: { query } };
}

export function parseForecastArgs(raw: string): ParseResult<ForecastArgs> {
  const args = parseArgsJson(raw);
  if (!args.ok) return args;
  const { lat, lon, units } = args.value;
  const parsedLat = typeof lat === "number" ? toCoordinate(lat, MAX_LATITUDE) : undefined;
  const parsedLon = typeof lon === "number" ? toCoordinate(lon, MAX_LONGITUDE) : undefined;
  if (parsedLat === undefined) return { ok: false, error: "lat must be a number between -90 and 90." };
  if (parsedLon === undefined) {
    return { ok: false, error: "lon must be a number between -180 and 180." };
  }
  if (!isUnitSystem(units)) return { ok: false, error: 'units must be "imperial" or "metric".' };
  return { ok: true, value: { lat: parsedLat, lon: parsedLon, units } };
}
