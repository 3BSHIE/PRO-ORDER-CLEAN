import { useEffect } from "react";
import { X } from "lucide-react";

/* Modal shell — bottom sheet on mobile, centered dialog ≥640px.
   Real flows (item customization, payment choice…) will reuse this. */
export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="modal__overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__handle" />
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
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>
  );
}
