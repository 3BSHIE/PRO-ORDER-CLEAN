import { QrCode, ChefHat, LayoutDashboard } from "lucide-react";

/* The three demo surfaces. `to` is the route each card opens.
   Customer opens a valid table QR (happy path); the Home screen also
   exposes explicit valid/invalid test buttons below the cards. */
export const SURFACES = {
  customer: {
    title: "Customer Demo",
    icon: QrCode,
    desc: "Table-side ordering — guests scan, browse, customize and track. Mobile-first by design.",
    note: "This surface is intentionally empty for now. The guest ordering flow — menu, cart, tracking — arrives in an upcoming phase.",
    to: "/r/lumiere/table/table-1-token",
  },
  kitchen: {
    title: "Kitchen Demo",
    icon: ChefHat,
    desc: "A live ticket board for kitchen staff — move orders from Received to Preparing to Ready.",
    note: "This surface is intentionally empty for now. The PIN-protected kitchen board arrives in an upcoming phase.",
    to: "/kitchen/lumiere",
  },
  admin: {
    title: "Admin Demo",
    icon: LayoutDashboard,
    desc: "Menu, categories, tables, QR codes, orders and payments — managed from one place.",
    note: "This surface is intentionally empty for now. The management dashboard arrives in an upcoming phase.",
    to: "/admin/lumiere",
  },
};
