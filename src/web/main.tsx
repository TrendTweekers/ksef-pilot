import "@shopify/polaris/build/esm/styles.css";
import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { AppProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import plTranslations from "@shopify/polaris/locales/pl.json";
import "./i18n";
import { App } from "./App";

const locale = navigator.language.startsWith("pl") ? "pl" : "en";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppProvider i18n={locale === "pl" ? plTranslations : enTranslations}>
      <App />
    </AppProvider>
  </React.StrictMode>
);
