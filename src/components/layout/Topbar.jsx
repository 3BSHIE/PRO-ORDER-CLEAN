/* Sticky top bar. Same markup that was inlined in each Phase 0 screen —
   extracted so every future surface shares one header shell. */
export default function Topbar({ left, right }) {
  return (
    <header className="topbar">
      <div className="container topbar__inner">
        {left}
        {right}
      </div>
    </header>
  );
}
