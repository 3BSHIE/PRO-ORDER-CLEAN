import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { getLanguage, applyLanguage } from "./i18n/language.js";

// Apply the saved language (dir/lang on <html>) immediately on load, before
// the first paint — this only sets document attributes, it does not
// dispatch the change event (that's only for in-session switches).
applyLanguage(getLanguage());

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
