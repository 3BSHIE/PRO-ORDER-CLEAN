/* Sticky top bar. Same markup that was inlined in each Phase 0 screen —
   extracted so every future surface shares one header shell.

   Phase 91.2 — two optional props, both additive:

   `center` is a third zone. Only Admin passes one (§3). Left undefined it
   renders nothing at all, so the flex `space-between` on .topbar__inner still
   sees exactly two children and the other thirteen consumers (Customer,
   Kitchen, Home, both login screens) lay out byte-identically.

   `className` lands on the <header>, which is what lets ONE surface opt out
   of the shared 1000px `.container` cap without moving every other header
   (§2). It is deliberately on the outer element rather than the inner one:
   the inner wrapper keeps `.container`, so the 20px padding rhythm stays
   shared and only the max-width is overridden. */
export default function Topbar({ left, center, right, className = "" }) {
  return (
    <header className={("topbar " + className).trim()}>
      <div className="container topbar__inner">
        {left}
        {center}
        {right}
      </div>
    </header>
  );
}
