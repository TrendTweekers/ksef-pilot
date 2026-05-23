import "@shopify/polaris/build/esm/styles.css";
import "./styles.css";
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import plTranslations from "@shopify/polaris/locales/pl.json";
import i18n from "./i18n";
import { App } from "./App";

function normalizedLanguage(language: string | undefined) {
  return language?.startsWith("en") ? "en" : "pl";
}

function Root() {
  const [locale, setLocale] = useState(normalizedLanguage(i18n.resolvedLanguage ?? i18n.language));

  useEffect(() => {
    const onLanguageChanged = (language: string) => setLocale(normalizedLanguage(language));
    i18n.on("languageChanged", onLanguageChanged);
    return () => {
      i18n.off("languageChanged", onLanguageChanged);
    };
  }, []);

  return (
    <AppProvider i18n={locale === "pl" ? plTranslations : enTranslations}>
      <App />
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
