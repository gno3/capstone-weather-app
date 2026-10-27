"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { MAX_MESSAGE_CHARS, type ChatMessage } from "@/lib/ai/chat-validation";
import type { UnitSystem } from "@/lib/types";
import {
  SUGGESTED_QUESTIONS,
  buildChatRequest,
  errorMessageFor,
  validateDraft,
} from "./chat-panel-state";

export type ChatPanelProps = {
  lat: number;
  lon: number;
  name: string;
  units: UnitSystem;
};

type Status = "idle" | "loading" | "error";

export default function ChatPanel({ lat, lon, name, units }: ChatPanelProps) {
  const id = useId();
  const panelId = `${id}-panel`;
  const inputId = `${id}-input`;

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, status]);

  const loading = status === "loading";

  async function post(conversation: ChatMessage[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Latest props, so location/unit changes apply to the next request.
        body: JSON.stringify(buildChatRequest(conversation, { lat, lon, name, units })),
        signal: controller.signal,
      });
      const body: unknown = await res.json().catch(() => null);
      if (controller.signal.aborted) return;
      const data = (body ?? {}) as { reply?: unknown; error?: unknown };

      if (!res.ok || typeof data.reply !== "string" || data.reply.trim() === "") {
        setStatus("error");
        setError(errorMessageFor(res.ok ? 502 : res.status, data.error));
        return;
      }
      setMessages([...conversation, { role: "assistant", content: data.reply }]);
      setStatus("idle");
    } catch {
      if (controller.signal.aborted) return;
      setStatus("error");
      setError(errorMessageFor("network"));
    }
  }

  function send(text: string) {
    if (loading) return;
    const result = validateDraft(text, messages);
    if (!result.ok) {
      if (result.error) {
        setStatus("idle");
        setError(result.error);
      }
      return;
    }
    const next: ChatMessage[] = [...messages, { role: "user", content: result.content }];
    setMessages(next);
    setDraft("");
    void post(next);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(draft);
  }

  function retry() {
    if (messages.at(-1)?.role === "user") void post(messages);
  }

  function newChat() {
    abortRef.current?.abort();
    setMessages([]);
    setDraft("");
    setStatus("idle");
    setError(null);
  }

  const overLimit = draft.trim().length > MAX_MESSAGE_CHARS;

  return (
    <section
      aria-label="Weather chat"
      className="min-w-0 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:px-6"
      >
        <span>Ask about the weather</span>
        <span aria-hidden className="text-zinc-500 dark:text-zinc-400">
          {open ? "▴" : "▾"}
        </span>
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="flex min-w-0 flex-col gap-3 border-t border-zinc-200 px-4 pb-4 pt-3 sm:px-6 dark:border-zinc-800"
      >
        <ol
          ref={listRef}
          aria-live="polite"
          aria-label="Conversation"
          className="flex max-h-80 min-w-0 flex-col gap-2 overflow-y-auto"
        >
          {messages.map((message, index) => (
            <li
              key={index}
              className={`max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm ${
                message.role === "user"
                  ? "self-end bg-blue-600 text-white"
                  : "self-start bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
              }`}
            >
              <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
              {message.content}
            </li>
          ))}
          {loading && (
            <li className="self-start text-sm text-zinc-500 dark:text-zinc-400" role="status">
              Thinking…
            </li>
          )}
        </ol>

        {messages.length === 0 && !loading && (
          <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => send(question)}
                className="min-h-11 rounded-full border border-zinc-300 px-3 text-sm hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                {question}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
          >
            <span className="min-w-0 break-words">{error}</span>
            {status === "error" && (
              <button
                type="button"
                onClick={retry}
                className="min-h-11 rounded-md px-2 font-medium underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <form onSubmit={onSubmit} className="flex min-w-0 flex-col gap-2">
          <label htmlFor={inputId} className="sr-only">
            Your weather question
          </label>
          <textarea
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(draft);
              }
            }}
            rows={2}
            placeholder={`Ask about ${name}…`}
            aria-describedby={`${inputId}-count`}
            className="min-w-0 resize-none rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-950"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span
              id={`${inputId}-count`}
              className={`text-xs ${overLimit ? "text-red-600 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400"}`}
            >
              {draft.trim().length}/{MAX_MESSAGE_CHARS}
            </span>
            <div className="flex gap-2">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={newChat}
                  className="min-h-11 rounded-lg border border-zinc-300 px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-zinc-700"
                >
                  New chat
                </button>
              )}
              <button
                type="submit"
                disabled={loading || draft.trim() === ""}
                className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
