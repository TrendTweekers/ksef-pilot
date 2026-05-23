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
          heroTitle: "B2B invoices, ready for KSeF",
          heroCopy: "Find B2B orders, add the buyer NIP, and create a draft FA(3) invoice before anything touches the government API.",
          builtBy: "Built by FakturaFlow",
          description:
            "Turn B2B Shopify orders into Polish KSeF e-invoices without turning your store into an accounting cockpit. Built by FakturaFlow."
        },
        stats: {
          b2b: "B2B marked",
          ready: "Ready to draft",
          drafts: "Draft invoices"
        },
        settings: {
          title: "KSeF Settings",
          sellerSection: "Seller identity",
          ksefSection: "KSeF connection",
          tokenLabel: "KSeF API token",
          tokenHelp: "Paste the token generated at ksef.podatki.gov.pl. It is encrypted before storage.",
          tokenSkip: "Leave this empty while testing. Draft invoice generation does not require a KSeF token.",
          safeTest: "Safe test mode: use fake seller details and no KSeF token. The app will only save draft XML locally.",
          sellerNip: "Seller NIP",
          sellerNipHelp: "For dev testing you can use any 10 digits, for example 1234567890.",
          sellerName: "Seller legal name",
          sellerAddress: "Seller address",
          placeOfIssue: "Place of issue",
          test: "Test connection",
          save: "Save settings",
          connected: "Connected",
          notConnected: "Not connected"
        },
        orders: {
          title: "B2B orders",
          description: "Review Shopify orders and create draft invoices. The app reads orders only and never edits them.",
          empty: "Your Shopify orders will appear here. Mark B2B orders, add buyer NIP, then generate a KSeF invoice.",
          filter: "Unprocessed B2B only",
          refresh: "Refresh orders",
          loading: "Loading orders",
          buyerNip: "Buyer NIP",
          buyerName: "Buyer name",
          saveFlag: "Save B2B flag",
          generate: "Generate invoice",
          loadError: "Could not load Shopify orders. Check that the app has read_orders access and the store is installed.",
          saveError: "Could not save the B2B flag.",
          generateError: "Could not generate the invoice.",
          invoiceCreated: "Draft invoice created for {{orderName}}.",
          safeTest: "No real submission happens here yet. Generate invoice creates a draft record and XML in this app only."
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
          heroTitle: "Faktury B2B gotowe pod KSeF",
          heroCopy: "Znajdź zamówienia B2B, dodaj NIP nabywcy i utwórz szkic FA(3), zanim cokolwiek trafi do API rządowego.",
          builtBy: "Stworzone przez FakturaFlow",
          description:
            "Zamieniaj zamówienia B2B z Shopify w polskie e-faktury KSeF bez ciężkiego systemu księgowego. Stworzone przez FakturaFlow."
        },
        stats: {
          b2b: "Oznaczone B2B",
          ready: "Gotowe do szkicu",
          drafts: "Szkice faktur"
        },
        settings: {
          title: "Ustawienia KSeF",
          sellerSection: "Dane sprzedawcy",
          ksefSection: "Połączenie KSeF",
          tokenLabel: "Token API KSeF",
          tokenHelp: "Wklej token wygenerowany na ksef.podatki.gov.pl. Przechowujemy go w formie szyfrowanej.",
          tokenSkip: "Podczas testów zostaw to pole puste. Generowanie szkicu faktury nie wymaga tokenu KSeF.",
          safeTest: "Bezpieczny test: użyj fikcyjnych danych sprzedawcy i bez tokenu KSeF. Aplikacja zapisze tylko lokalny szkic XML.",
          sellerNip: "NIP sprzedawcy",
          sellerNipHelp: "Do testów możesz wpisać dowolne 10 cyfr, na przykład 1234567890.",
          sellerName: "Nazwa sprzedawcy",
          sellerAddress: "Adres sprzedawcy",
          placeOfIssue: "Miejsce wystawienia",
          test: "Testuj połączenie",
          save: "Zapisz ustawienia",
          connected: "Połączono",
          notConnected: "Nie połączono"
        },
        orders: {
          title: "Zamówienia B2B",
          description: "Sprawdzaj zamówienia Shopify i twórz szkice faktur. Aplikacja tylko odczytuje zamówienia i nigdy ich nie edytuje.",
          empty: "Tutaj pojawią się zamówienia Shopify. Oznacz B2B, dodaj NIP nabywcy i wygeneruj fakturę KSeF.",
          filter: "Tylko nieprzetworzone B2B",
          refresh: "Odśwież zamówienia",
          loading: "Ładowanie zamówień",
          buyerNip: "NIP nabywcy",
          buyerName: "Nazwa nabywcy",
          saveFlag: "Zapisz B2B",
          generate: "Generuj fakturę",
          loadError: "Nie udało się pobrać zamówień Shopify. Sprawdź instalację aplikacji i dostęp read_orders.",
          saveError: "Nie udało się zapisać oznaczenia B2B.",
          generateError: "Nie udało się wygenerować faktury.",
          invoiceCreated: "Utworzono szkic faktury dla {{orderName}}.",
          safeTest: "Tu nie ma jeszcze prawdziwej wysyłki. Generuj fakturę tworzy tylko szkic i XML w tej aplikacji."
        }
      }
    }
  }
});

export default i18n;
