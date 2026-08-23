/* Status pill.
   tone: received | preparing | ready | canceled | gold | neutral */
export default function Badge({ tone = "neutral", dot = false, children }) {
  return (
    <span className={`badge badge--${tone}`}>
      {dot && <i className="badge__dot" />}
      {children}
    </span>
  );
}
