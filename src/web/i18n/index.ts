import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

void i18n.use(LanguageDetector).use(initReactI18next).init({
  fallbackLng: "en",
  supportedLngs: ["en", "pl"],
  interpolation: {
    escapeValue: false
  },
  resources: {
    en: {
      translation: {
        nav: {
          orders: "Orders",
          settings: "KSeF Settings",
          billing: "Billing"
        },
        home: {
          title: "KSeF Pilot",
          tagline: "Polish e-invoices for Shopify",
          description:
            "Automate Polish KSeF e-invoices for B2B Shopify orders. Built by FakturaFlow."
        },
        settings: {
          title: "KSeF Settings",
          tokenLabel: "KSeF API token",
          tokenHelp: "Paste the token generated at ksef.podatki.gov.pl. It is encrypted before storage.",
          test: "Test connection",
          save: "Save token",
          connected: "Connected",
          notConnected: "Not connected"
        },
        orders: {
          title: "B2B orders",
          empty: "Order import will appear here after Shopify OAuth is connected.",
          filter: "Unprocessed B2B only"
        }
      }
    },
    pl: {
      translation: {
        nav: {
          orders: "Zamówienia",
          settings: "Ustawienia KSeF",
          billing: "Rozliczenia"
        },
        home: {
          title: "KSeF Pilot",
          tagline: "Polskie e-faktury dla Shopify",
          description:
            "Automatyzuj polskie e-faktury KSeF dla zamówień B2B w Shopify. Stworzone przez FakturaFlow."
        },
        settings: {
          title: "Ustawienia KSeF",
          tokenLabel: "Token API KSeF",
          tokenHelp: "Wklej token wygenerowany na ksef.podatki.gov.pl. Przechowujemy go w formie szyfrowanej.",
          test: "Testuj połączenie",
          save: "Zapisz token",
          connected: "Połączono",
          notConnected: "Nie połączono"
        },
        orders: {
          title: "Zamówienia B2B",
          empty: "Import zamówień pojawi się tutaj po połączeniu OAuth Shopify.",
          filter: "Tylko nieprzetworzone B2B"
        }
      }
    }
  }
});

export default i18n;
