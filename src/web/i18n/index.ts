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
          builtBy: "Built by FakturaFlow for Shopify merchants selling B2B in Poland.",
          description:
            "Turn B2B Shopify orders into Polish KSeF e-invoices without turning your store into an accounting cockpit. Built by FakturaFlow."
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
          empty: "Your Shopify orders will appear here. Mark B2B orders, add buyer NIP, then generate a KSeF invoice.",
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
          builtBy: "Stworzone przez FakturaFlow dla sprzedawców Shopify obsługujących B2B w Polsce.",
          description:
            "Zamieniaj zamówienia B2B z Shopify w polskie e-faktury KSeF bez ciężkiego systemu księgowego. Stworzone przez FakturaFlow."
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
          empty: "Tutaj pojawią się zamówienia Shopify. Oznacz B2B, dodaj NIP nabywcy i wygeneruj fakturę KSeF.",
          filter: "Tylko nieprzetworzone B2B"
        }
      }
    }
  }
});

export default i18n;
