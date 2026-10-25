import { useEffect } from "react";
import { X } from "lucide-react";

/* Modal shell — bottom sheet on mobile, centered dialog ≥640px.
   Real flows (item customization, payment choice…) will reuse this. */
/* Phase 93.3 — `className` lands on the dialog box so one modal can opt
   into its own width without moving every other Admin dialog. Optional and
   additive: omitted, the shell renders exactly as before. */
/* Phase 108.0 — `stickyHead` is an OPTIONAL region rendered with the title
   and the X inside one sticky block, for a dialog whose body is long enough
   that losing its header hurts (the Product Editor).

   The wrapper is rendered ONLY when something is passed, so every other
   modal in the app keeps byte-identical DOM and the shell renders exactly as
   before when the prop is omitted. */
export default function Modal({ open, onClose, title, children, footer, className = "", stickyHead = null }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  /* Extracted so the sticky and non-sticky paths cannot drift apart. */
  const head = (
    <div className="modal__head">
      <h3 className="modal__title">{title}</h3>
      <button
        type="button"
        className="modal__x"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={15} />
      </button>
    </div>
  );

  return (
    <div
      className="modal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className={("modal " + className).trim()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__handle" />
        {stickyHead ? (
          <div className="modal__sticky">
            {head}
            {stickyHead}
          </div>
        ) : (
          head
        )}
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
