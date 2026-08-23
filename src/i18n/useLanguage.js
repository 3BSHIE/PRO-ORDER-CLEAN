import { useState, useEffect, useCallback } from "react";
import {
  getLanguage,
  setLanguage as setLanguageRaw,
  toggleLanguage as toggleLanguageRaw,
  t as translate,
  LANGUAGE_CHANGE_EVENT,
} from "./language.js";

/**
 * useLanguage — React hook wrapper around the plain-function language
 * system. Since setLanguage() dispatches a window CustomEvent rather than
 * living in React state/context, any component that needs to re-render on
 * language change should use this hook instead of calling getLanguage()
 * directly in render (which would go stale after a switch elsewhere on the
 * page, e.g. AdminLayout's switcher vs. the page content below it).
 *
 * @returns {{ language: "en"|"ar", setLanguage: (l:string)=>void,
 *             toggleLanguage: ()=>void, t: (key:string, fallback?:string)=>string }}
 */
export function useLanguage() {
  const [language, setLanguageState] = useState(() => getLanguage());

  useEffect(() => {
    function handleChange(event) {
      setLanguageState(event.detail?.language ?? getLanguage());
    }
    window.addEventListener(LANGUAGE_CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(LANGUAGE_CHANGE_EVENT, handleChange);
  }, []);

  const setLanguage = useCallback((next) => setLanguageRaw(next), []);
  const toggleLanguage = useCallback(() => toggleLanguageRaw(), []);
  const t = useCallback((key, fallback) => translate(key, fallback), [language]);

  return { language, setLanguage, toggleLanguage, t };
}
