import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
 * A follow-up the guest can tap instead of typing.
 *
 * @typedef {{ id: string, text: string }} SuggestedFollowUp
 *
 * -- Phase 121.5 section 5: the contract, and nothing behind it yet -------
 * The owner wants the suggested questions to follow the conversation. That
 * is the AI Brain's job and the AI Brain does not exist, so what ships here
 * is the SHAPE of the answer and the path it travels, with the honest
 * opener set flowing through it meanwhile.
 *
 * A reply may carry its own follow-ups. The UI reads them from the most
 * recent reply that has any, and falls back to the openers, so the day a
 * model starts returning them the row simply begins changing - no component
 * learns anything new, and no suggestion is ever invented here.
 */
export const MAX_FOLLOW_UPS = 4;

/**
 * Clean a list of follow-ups from any source into something renderable:
 * strings trimmed, blanks dropped, duplicates removed case-insensitively,
 * ids made stable, and the whole thing capped.
 *
 * Defensive on purpose. The eventual producer is a language model, and a
 * model may repeat itself, return twenty, or return nothing at all.
 *
 * @param {Array<SuggestedFollowUp|string>|null|undefined} list
 * @returns {SuggestedFollowUp[]}
 */
export function normalizeFollowUps(list, max = MAX_FOLLOW_UPS) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of list) {
    const text = String((typeof entry === "string" ? entry : entry?.text) ?? "").trim();
    if (!text) continue;
    const fold = text.toLocaleLowerCase();
    if (seen.has(fold)) continue;
    seen.add(fold);
    const id = (typeof entry === "object" && entry?.id) ? String(entry.id) : `f${out.length}-${fold.slice(0, 40)}`;
    out.push({ id, text });
    if (out.length === max) break;
  }
  return out;
}

/**
 * The single map from "what the assistant is doing" to "what Zaatar shows".
 *
 * The package exposes the activity names; this is the one place PRO-ORDER
 * decides which one is current, so a later phase wires real lifecycle events
 * here and nothing else in the UI has to learn about poses.
 *
 * Phase 121.0 could honestly produce exactly two of them — a conversation that
 * has just opened, and one that is sitting idle. Thinking, Responding and
 * Suggesting described work that was not happening yet, and §5 forbade timers
 * that pretend otherwise, so they were reachable through this function and
 * simply never selected until there was a real request to reflect.
 *
 * ── Phase 121.3a — Suggesting now has something real to reflect ──────────
 * 121.2 put real product cards beside the character and 121.3 kept them
 * there, but neither came back to this function: it still took only `phase`
 * and `pending`, so `assistant_recommending` had no input that could ever
 * select it and the mascot stayed in Idle with a card at his shoulder. That
 * was the whole defect — not a missing pose, a missing argument.
 *
 * `recommending` means a recommendation is ACTUALLY ON SCREEN beside him,
 * not that product IDs exist. A collapsed strip the guest has not opened is
 * not a displayed product and must not raise the cane; the caller decides
 * that, because only the caller knows which way the panel is laid out.
 *
 * Priority is unchanged where it already existed: greeting a new guest wins,
 * then work in progress, and Suggesting sits below both — a recommendation
 * can wait, a reply cannot.
 */
export function activityFor({ phase, pending, recommending }) {
  if (phase === AI_PHASE.WELCOME) return "assistant_welcome";
  if (pending) return "assistant_processing";
  if (recommending) return "assistant_recommending";
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
      /* -- Phase 121.5 section 5: THE SEAM ------------------------------
         This object is the whole extension point. Today it is the honest
         not-connected notice and it carries no follow-ups, so the row
         below falls back to the openers. When the AI Brain lands, this
         becomes the assistant's reply and gains two fields the rest of
         the UI already knows how to render:

             { id, role: AI_ROLE.ASSISTANT, text,
               followUps: SuggestedFollowUp[],   // section 5
               recommendationIds: string[] }     // the carousel

         Nothing else in the component tree has to change for that. What
         must NOT happen here is a fabricated reply or a fabricated
         suggestion: a notice is not an assistant, and an invented
         follow-up would imply a capability the restaurant has not got. */
      { id: messageId(), role: AI_ROLE.NOTICE, key: "ai.notConnected", at: Date.now(), followUps: null },
    ]);
  }, []);

  /* The follow-ups belonging to the latest reply that offered any. Stale
     ones can never be shown: a newer reply without follow-ups returns the
     row to the openers rather than leaving the previous turn's questions
     under a different answer. New Chat empties the list, so it resets with
     everything else. */
  const followUps = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m.role === AI_ROLE.USER) continue;
      return normalizeFollowUps(m.followUps);
    }
    return [];
  }, [messages]);

  /* ── Phase 121.3 §3 — the seam a cancelable request will need ──────────
     There is nothing in flight today: no model, no stream, no request. But
     "New chat" is the one action that MUST be able to abandon work in
     progress, and bolting that on afterwards is how a reset ends up racing
     a reply that arrives into a conversation the guest already cleared.

     So the seam exists now and is empty: whatever starts a request later
     parks its AbortController here, and every path that clears the
     conversation goes through cancelInFlight() first. Nothing is faked to
     exercise it — §3 is explicit that a pretend stream is not wanted. */
  const inFlight = useRef(null);
  const cancelInFlight = useCallback(() => {
    const request = inFlight.current;
    inFlight.current = null;
    try {
      request?.abort?.();
    } catch {
      /* An already-settled request is not an error worth surfacing. */
    }
  }, []);

  /** Start over. The customer's own action, never automatic. */
  const reset = useCallback(() => {
    cancelInFlight();
    setMessages([]);
  }, [cancelInFlight]);

  return { isOpen, open, close, messages, phase, send, reset, followUps, inFlight, cancelInFlight };
}
