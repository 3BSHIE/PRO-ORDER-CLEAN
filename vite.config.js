import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import devAccess from "./dev-server/devAccess.js";

export default defineConfig({
  /* devAccess is `apply: "serve"` — it has no build hooks and cannot reach a
     production bundle. See dev-server/devAccess.js for why the Developer Hub
     is gated in the server rather than in React. */
  plugins: [react(), devAccess()],
});
