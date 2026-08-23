/* Labelled text input with optional hint / error line. */
export default function Input({ label, hint, error, style, ...rest }) {
  return (
    <label className="field" style={style}>
      {label && <span className="field__label">{label}</span>}
      <input className={`input ${error ? "input--error" : ""}`} {...rest} />
      {(error || hint) && (
        <span className={`field__hint ${error ? "field__hint--error" : ""}`}>
          {error || hint}
        </span>
      )}
    </label>
  );
}
