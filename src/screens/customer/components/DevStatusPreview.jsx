/**
 * DevStatusPreview — Phase 88.2 (§9). DEVELOPMENT ONLY.
 *
 * Lets the owner drive Tracking through every status without going to the
 * Kitchen board and back, so the station transitions, connector progress,
 * icon loops, status sentence and timer behaviour can all be checked in one
 * place.
 *
 * ══ IT NEVER TOUCHES THE ORDER ═══════════════════════════════════════════
 *   This is a RENDER override and nothing else. The parent keeps the real
 *   order exactly as storage returned it and passes a shallow copy with one
 *   field swapped to the view. Nothing is written: not the order, not the
 *   status history, not localStorage, not the session. Reset simply drops the
 *   override, and the next 4s poll — which never stopped — repaints the real
 *   status.
 *
 * ══ IT CANNOT REACH PRODUCTION ═══════════════════════════════════════════
 *   Every call site is wrapped in `import.meta.env.DEV`, which Vite replaces
 *   with the literal `false` at build time; the branch and this module's
 *   import are then dropped by the bundler's dead-code elimination. Verified
 *   by grepping the production bundle for these labels — see the phase report.
 *
 * ══ IT LOOKS LIKE A TOOL, ON PURPOSE ═════════════════════════════════════
 *   Dashed border, monospace, a DEV tag, and no restaurant theming. §9 asks
 *   that it never be mistaken for customer UI, and the surest way to achieve
 *   that is to make it look like it does not belong to the design at all.
 *   English-only, which §16 explicitly permits for a development control.
 */


/* Styles live INSIDE the component, not in global.css, so the tool leaves
   nothing at all behind in production. A stylesheet is not tree-shaken by
   class usage: rules parked in global.css would still ship to customers as
   dead bytes even though the markup can never render. Carried here they are
   part of this module, and the module is dropped whole with it.

   The palette is hard-coded slate/amber on purpose — it must NOT follow the
   restaurant theme, or the panel would start to look like product UI. */
const DEV_CSS = `
.devpv{
  margin:12px 0 4px;padding:9px 11px;
  border:1px dashed #4b5563;border-radius:8px;
  background:rgba(30,41,59,.55);
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.devpv__head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.devpv__tag{
  font-size:9px;font-weight:700;letter-spacing:.1em;
  padding:2px 6px;border-radius:4px;background:#f59e0b;color:#1c1917}
.devpv__title{font-size:11.5px;color:#e2e8f0;font-weight:600}
.devpv__state{font-size:10.5px;color:#94a3b8;margin-inline-start:auto}
.devpv__row{display:flex;flex-wrap:wrap;gap:5px}
.devpv__btn{
  font-family:inherit;font-size:11px;line-height:1;
  padding:6px 9px;border-radius:5px;cursor:pointer;
  background:#1e293b;border:1px solid #475569;color:#cbd5e1;
  transition:background .12s,border-color .12s,color .12s}
.devpv__btn:hover:not(:disabled){background:#334155;color:#f1f5f9}
.devpv__btn--on{background:#0ea5e9;border-color:#0ea5e9;color:#04202e;font-weight:700}
.devpv__btn--reset{margin-inline-start:auto;border-style:dashed}
.devpv__btn:disabled{opacity:.4;cursor:not-allowed}
.devpv__note{margin:8px 0 0;font-size:10px;color:#64748b;line-height:1.4}
[dir="rtl"] .devpv{direction:ltr;text-align:left}
`;

const STATUSES = ["received", "preparing", "ready", "delivered", "canceled"];

export default function DevStatusPreview({ actualStatus, previewStatus, onPreview, onReset }) {
  const shown = previewStatus || actualStatus;

  return (
    <div className="devpv" role="group" aria-label="Developer status preview">
      <style>{DEV_CSS}</style>
      <div className="devpv__head">
        <span className="devpv__tag">DEV</span>
        <span className="devpv__title">Status preview</span>
        <span className="devpv__state">
          {previewStatus
            ? `preview: ${previewStatus} (actual: ${actualStatus})`
            : `actual: ${actualStatus}`}
        </span>
      </div>
      <div className="devpv__row">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`devpv__btn ${shown === s ? "devpv__btn--on" : ""}`}
            aria-pressed={shown === s}
            onClick={() => onPreview(s)}
          >
            {s}
          </button>
        ))}
        <button
          type="button"
          className="devpv__btn devpv__btn--reset"
          onClick={onReset}
          disabled={!previewStatus}
        >
          reset
        </button>
      </div>
      <p className="devpv__note">
        Visual override only — the stored order is never modified.
      </p>
    </div>
  );
}
