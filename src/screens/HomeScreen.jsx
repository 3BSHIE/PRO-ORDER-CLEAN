import { useState } from "react";
import { ArrowUpRight, Check, QrCode, ShieldX } from "lucide-react";
import Topbar  from "../components/layout/Topbar.jsx";
import Logo    from "../components/brand/Logo.jsx";
import Button  from "../components/ui/Button.jsx";
import Card    from "../components/ui/Card.jsx";
import Badge   from "../components/ui/Badge.jsx";
import Input   from "../components/ui/Input.jsx";
import Modal   from "../components/ui/Modal.jsx";
import Tabs    from "../components/ui/Tabs.jsx";
import { SURFACES } from "../data/surfaces.js";
import { useLanguage } from "../i18n/useLanguage.js";

const TAB_ITEMS = [
  { id: "allday", label: "All day" },
  { id: "dinner", label: "Dinner" },
  { id: "drinks", label: "Drinks" },
];

const QR_TESTS = [
  { label: "Open valid Table 1 QR", icon: QrCode,  variant: "primary",
    to: "/r/lumiere/table/table-1-token", path: "/r/lumiere/table/table-1-token" },
  { label: "Open valid Table 2 QR", icon: QrCode,  variant: "outline",
    to: "/r/lumiere/table/table-2-token", path: "/r/lumiere/table/table-2-token" },
  { label: "Open invalid QR demo",  icon: ShieldX, variant: "outline",
    to: "/r/lumiere/table/broken-token",  path: "/r/lumiere/table/broken-token"  },
];

/* ═══════════════════════════════════════════════════════════════════════════
   HomeScreen — the demo/landing route at "/".

   Phase 33 production safety: everything below the hero is developer-only —
   the surface cards link straight to the Kitchen and Admin sign-in screens,
   the QR panel is a set of test shortcuts, and the Foundation kit is a
   component showcase. A guest reaches this route by tapping "Back to home"
   from an invalid QR, so in a production build none of that may be on offer.

   In production the route therefore renders the brand hero plus the same
   "scan the QR code on your table" line the invalid-access view already uses
   (an existing, already-translated string). A real marketing landing page
   can replace this later; the point here is only that "/" must never hand a
   diner staff navigation.
   ═══════════════════════════════════════════════════════════════════════ */

export default function HomeScreen({ onNavigate }) {
  const [tab,       setTab]       = useState("dinner");
  const [name,      setName]      = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const { t } = useLanguage();
  const isDev = import.meta.env.DEV;

  return (
    <>
      <Topbar
        left={<Logo variant="icon" size="nav" />}
        right={isDev ? <Badge tone="gold">Phase 24</Badge> : null}
      />

      <main className="container">
        {/* Hero */}
        <section className="hero anim-rise">
          <Logo variant="full" size="lg" style={{ margin: "0 auto 28px" }} />
          <span className="hero__eyebrow">Restaurant QR Ordering</span>
          <h1>Order smarter, <i>dine better.</i></h1>
          <p className="hero__lede">
            Scan your table QR, enter your name, browse the menu, and tap any
            item to see full details — no app, no account, no friction.
          </p>
        </section>

        {/* Production: a guest who lands here just needs to know what to do.
            Uses the same already-translated string as the invalid-QR view. */}
        {!isDev && (
          <p className="hero__lede" style={{ textAlign: "center", margin: "0 auto 48px" }}>
            {t(
              "common.invalidTableAccessMsg",
              "Please scan the QR code placed on your table to open the menu."
            )}
          </p>
        )}

        {/* ── Everything below is DEVELOPMENT ONLY (Phase 33) ────────────── */}
        {isDev && (
        <>
        {/* Demo surfaces */}
        <div className="section-label">Demo surfaces</div>
        <div className="navgrid">
          {Object.entries(SURFACES).map(([key, s], i) => (
            <button
              key={key}
              type="button"
              className="navcard anim-rise"
              style={{ animationDelay: `${120 + i * 70}ms` }}
              onClick={() => onNavigate(s.to)}
            >
              <span className="navcard__icon">
                <s.icon size={22} strokeWidth={1.9} />
              </span>
              <span className="navcard__title">{s.title}</span>
              <p className="navcard__desc">{s.desc}</p>
              <span className="navcard__go">
                Open <ArrowUpRight size={14} strokeWidth={2.4} />
              </span>
            </button>
          ))}
        </div>

        {/* QR test panel */}
        <div className="section-label">Customer flow · test</div>
        <Card className="qr-test anim-rise" style={{ animationDelay: "300ms" }}>
          <div className="qr-test__head">
            <div>
              <h3 style={{ marginBottom: 6 }}>Full customer onboarding flow</h3>
              <p>
                Valid QR → Welcome → Enter name → Menu → Tap item for details
              </p>
            </div>
            <Badge tone="neutral">Lumière</Badge>
          </div>

          {/* flow hint */}
          <div className="qr-test__flow">
            {["Scan QR", "Welcome", "Enter name", "Menu", "Tracking", "My Orders"].map((step, i, arr) => (
              <span key={step} className="qr-test__flow-step">
                <span>{step}</span>
                {i < arr.length - 1 && (
                  <span className="qr-test__flow-arrow">→</span>
                )}
              </span>
            ))}
          </div>

          <div className="qr-test__row">
            {QR_TESTS.map((t) => (
              <div key={t.to} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <Button variant={t.variant} icon={t.icon} onClick={() => onNavigate(t.to)}>
                  {t.label}
                </Button>
                <span className="qr-test__path">{t.path}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Foundation kit */}
        <div className="section-label">Foundation kit</div>
        <Card className="anim-rise" style={{ animationDelay: "360ms" }}>
          <p className="kit-caption">Buttons</p>
          <div className="kit-row">
            <Button icon={Check}>Place order</Button>
            <Button variant="outline">View menu</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Cancel order</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="divider" />
          <p className="kit-caption">Order status badges</p>
          <div className="kit-row">
            <Badge tone="received"  dot>Received</Badge>
            <Badge tone="preparing" dot>Preparing</Badge>
            <Badge tone="ready"     dot>Ready</Badge>
            <Badge tone="canceled"  dot>Canceled</Badge>
            <Badge tone="gold">Popular</Badge>
            <Badge tone="neutral">Draft</Badge>
          </div>
          <div className="divider" />
          <p className="kit-caption">Input</p>
          <Input
            label="Your name"
            placeholder="e.g. Layla"
            hint="Guests identify their order by name — no account needed."
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ maxWidth: 340 }}
          />
          <div className="divider" />
          <p className="kit-caption">Tabs</p>
          <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
          <p style={{ color: "var(--text-3)", fontSize: 13, margin: "10px 0 0" }}>
            Selected: {TAB_ITEMS.find((t) => t.id === tab)?.label}
          </p>
          <div className="divider" />
          <p className="kit-caption">Modal</p>
          <Button variant="outline" size="sm" onClick={() => setModalOpen(true)}>
            Open sample modal
          </Button>
        </Card>

        <footer className="foot">
          Phase 24 · Production QA & Polish — accessibility, performance, RTL, and code-quality pass across the whole app.
        </footer>
        </>
        )}
      </main>

      {/* Part of the dev-only Foundation kit — its only trigger lives inside
          the gated block above, so it is gated too rather than shipping an
          unreachable sample dialog in the production bundle. */}
      {isDev && (
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Sample modal"
          footer={
            <>
              <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
              <Button icon={Check}   onClick={() => setModalOpen(false)}>Confirm</Button>
            </>
          }
        >
          <p style={{ margin: "0 0 16px" }}>
            Bottom sheet on mobile, centered dialog on desktop. Item
            customisation and payment choice will live in shells like this.
          </p>
          <Input label="Sample field" placeholder="Type anything…" />
        </Modal>
      )}
    </>
  );
}
