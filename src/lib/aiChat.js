import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * aiChat — Phase 121.0. The AI Waiter's conversation state, and nothing else.
 *
 * ── WHAT THIS IS, AND WHAT IT DELIBERATELY IS NOT ────────────────────────
 * This is the foundation the real assistant will sit on: a message list, an
 * open/closed overlay, one conversation per customer session, and a single
 * place where the assistant's lifecycle becomes a mascot activity.
 *
 * It contains NO AI. There is no model, no provider SDK, no API key, no
 * endpoint and no network call anywhere in this phase — and none of those may
 * ever live in client code: the real provider has to be reached through a
 * server-side layer scoped to the restaurant and session.
 *
 * It also fabricates nothing. A customer who sends a message gets an honest
 * NOTICE saying the assistant is not connected yet. That notice is its own
 * role, never "assistant", so no part of the UI can render it as though a
 * waiter answered, and no later phase can mistake it for one.
 *
 * ── WHY SESSION STORAGE, KEYED THE WAY IT IS ─────────────────────────────
 * The conversation belongs to one customer sitting at one table right now.
 * sessionStorage dies with the tab, which is the same lifetime the customer
 * session itself already has, and the key carries the restaurant, the table
 * and the session's own start time — so a new guest at the same table on the
 * same device cannot open the previous guest's chat. Nothing is written to
 * localStorage, where it would outlive the visit.
 *
 * This is a prototype's isolation, not production security, and it is not
 * claimed to be: multi-device identity belongs to the backend phase.
 */

const KEY_PREFIX = "pro_order_ai_chat";

/** The lifecycle the mascot understands. Mapped in ONE place (below). */
export const AI_PHASE = { WELCOME: "welcome", CONVERSATION: "conversation" };

/** Message roles. "notice" is the product speaking, never the assistant. */
export const AI_ROLE = { USER: "user", ASSISTANT: "assistant", NOTICE: "notice" };

/**
 * The single map from "what the assistant is doing" to "what Zaatar shows".
 *
 * The package exposes the activity names; this is the one place PRO-ORDER
 * decides which one is current, so a later phase wires real lifecycle events
 * here and nothing else in the UI has to learn about poses.
 *
 * Phase 121.0 can honestly produce exactly two of them — a conversation that
 * has just opened, and one that is sitting idle. Thinking, Responding and
 * Suggesting describe work that is not happening yet, and §5 forbids timers
 * that pretend otherwise, so they are reachable through this function and
 * simply never selected until there is a real request to reflect.
 */
export function activityFor({ phase, pending }) {
  if (phase === AI_PHASE.WELCOME) return "assistant_welcome";
  if (pending) return "assistant_processing";
  return "assistant_idle";
}

function storageKey({ restaurantSlug, tableId, sessionStartedAt }) {
  return `${KEY_PREFIX}:${restaurantSlug}:${tableId}:${sessionStartedAt || "anon"}`;
}

function readChat(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.messages) ? parsed : null;
  } catch {
    return null;
  }
}

function writeChat(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the chat still works for this view, it just will
       not survive a reload. Failing silently matches the rest of the app. */
  }
}

let seq = 0;
function messageId() {
  seq += 1;
  return `m${Date.now().toString(36)}${seq}`;
}

/**
 * One conversation for the current customer session.
 *
 * @param {{restaurantSlug:string, tableId:string, sessionStartedAt?:string}} scope
 */
export function useAiChat(scope) {
  const key = useMemo(() => storageKey(scope), [scope.restaurantSlug, scope.tableId, scope.sessionStartedAt]);

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => readChat(key)?.messages ?? []);

  /* A different session (new guest, new table) is a different conversation.
     Re-reading on key change is what stops one leaking into the next. */
  useEffect(() => {
    setMessages(readChat(key)?.messages ?? []);
  }, [key]);

  useEffect(() => {
    writeChat(key, { messages });
  }, [key, messages]);

  /* Welcome is shown once per conversation. A chat reopened with history in
     it returns to the conversation layout rather than greeting the guest a
     second time — the handoff notes are explicit about that. */
  const phase = messages.length === 0 ? AI_PHASE.WELCOME : AI_PHASE.CONVERSATION;

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  /**
   * Record what the customer said, and answer honestly.
   *
   * The notice is appended in the same update as the message, so there is no
   * window in which the UI could show a spinner for work nobody is doing.
   */
  const send = useCallback((text) => {
    const body = String(text ?? "").trim();
    if (!body) return;
    setMessages((prev) => [
      ...prev,
      { id: messageId(), role: AI_ROLE.USER, text: body, at: Date.now() },
      { id: messageId(), role: AI_ROLE.NOTICE, key: "ai.notConnected", at: Date.now() },
    ]);
  }, []);

  /** Start over. The customer's own action, never automatic. */
  const reset = useCallback(() => setMessages([]), []);

  return { isOpen, open, close, messages, phase, send, reset };
}
