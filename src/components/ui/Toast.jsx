import { useEffect } from "react";

/**
 * Lightweight toast notification.
 *
 * Usage in parent:
 *   const [toast, setToast] = useState(false);
 *   <button onClick={() => setToast(true)}>Add</button>
 *   <Toast visible={toast} message="..." onDone={() => setToast(false)} />
 *
 * Props:
 *   visible  — controls render (parent owns boolean state)
 *   message  — string to display
 *   onDone   — called after `duration` ms so parent can clear state
 *   duration — ms before onDone fires (default 2600)
 */
export default function Toast({ visible, message, onDone, duration = 2600 }) {
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [visible, duration, onDone]);

  if (!visible) return null;

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className="toast">{message}</div>
    </div>
  );
}
