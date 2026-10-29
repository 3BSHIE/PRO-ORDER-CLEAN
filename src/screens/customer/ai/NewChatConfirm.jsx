import { useEffect, useRef } from "react";
import { useLanguage } from "../../../i18n/useLanguage.js";

/**
 * NewChatConfirm — Phase 121.3 §3.
 *
 * The one destructive control the assistant has, so it asks first.
 *
 * ── WHAT IT IS CAREFUL ABOUT ─────────────────────────────────────────────
 * It says what is lost and, just as importantly, what is NOT: the cart, the
 * orders and the table session are untouched, and the copy says so, because
 * a guest mid-order reading "start new chat" has every reason to think their
 * basket is on the line.
 *
 * ── ESCAPE ───────────────────────────────────────────────────────────────
 * The chat underneath also listens for Escape on the window. If both ran,
 * one press would answer the question AND close the assistant behind it, so
 * this one stops the event here and the caller suspends its own listener
 * while this is mounted. Same discipline the product sheet already uses.
 *
 * ── FOCUS ────────────────────────────────────────────────────────────────
 * The SAFE action takes focus, not the destructive one: a stray Enter on a
 * dialog the guest did not mean to open must not wipe the conversation.
 * Focus returns to whatever opened it when it closes.
 */
export default function NewChatConfirm({ characterName, onConfirm, onCancel }) {
  const { t } = useLanguage();
  const keepRef = useRef(null);
  const returnTo = useRef(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    keepRef.current?.focus();
    const el = returnTo.current;
    return () => {
      /* Only if it is still on the page and still focusable. */
      if (el && el.isConnected && typeof el.focus === "function") el.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    };
    /* Capture, so it runs before the chat's own window listener. */
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div className="aiconfirm" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="aiconfirm__box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aiconfirm-title"
        aria-describedby="aiconfirm-body"
      >
        <h2 className="aiconfirm__title" id="aiconfirm-title">
          {t("ai.newChatTitle", "Start a new chat?")}
        </h2>
        <p className="aiconfirm__body" id="aiconfirm-body">
          {t(
            "ai.newChatBody",
            "This replaces your current conversation with {name}. Your cart and your orders are not affected."
          ).replace("{name}", characterName)}
        </p>
        <div className="aiconfirm__actions">
          <button type="button" className="aiconfirm__btn aiconfirm__btn--go" onClick={onConfirm}>
            {t("ai.newChatConfirm", "Start new chat")}
          </button>
          <button
            ref={keepRef}
            type="button"
            className="aiconfirm__btn aiconfirm__btn--keep"
            onClick={onCancel}
          >
            {t("ai.newChatKeep", "Keep conversation")}
          </button>
        </div>
      </div>
    </div>
  );
}
