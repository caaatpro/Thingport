import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";

// Namespaces by area: "common" (generic words), "app" (shell chrome, modals), "library" (viewer
// overlays and previews), "models" (Models page, model detail, author page). English is the only
// language; the strings stay in i18n so they live in one place rather than inline in components.
i18n.use(initReactI18next).init({
  resources: {
    en: { common: en.common, app: en.app, library: en.library, models: en.models },
  },
  lng: "en",
  ns: ["common", "app", "library", "models"],
  defaultNS: "common",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
