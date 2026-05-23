import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

void i18n.use(LanguageDetector).use(initReactI18next).init({
  fallbackLng: "pl",
  supportedLngs: ["pl", "en"],
  detection: {
    order: ["localStorage"],
    caches: ["localStorage"]
  },
  interpolation: {
    escapeValue: false
  },
  resources: {
    pl: {
      translation: {
        language: {
          label: "Język",
          pl: "Polski",
          en: "English"
        },
        common: {
          refresh: "Odśwież",
          closePreview: "Zamknij podgląd",
          status: "Status",
          current: "Aktywny",
          loading: "Ładowanie",
          done: "Gotowe",
          open: "Otwarte"
        },
        nav: {
          orders: "Zamówienia",
          invoices: "Faktury",
          settings: "Ustawienia KSeF",
          billing: "Rozliczenia"
        },
        install: {
          connect: "Połącz sklep Shopify"
        },
        home: {
          title: "KSeF Pilot",
          tagline: "Polskie e-faktury dla Shopify",
          heroTitle: "Faktury B2B gotowe pod KSeF",
          heroCopy:
            "Znajdź zamówienia B2B, dodaj NIP nabywcy i utwórz szkic FA(3), zanim cokolwiek trafi do rządowego API.",
          builtBy: "Stworzone przez FakturaFlow",
          description:
            "Zamieniaj zamówienia B2B z Shopify w polskie e-faktury KSeF bez ciężkiego systemu księgowego. Stworzone przez FakturaFlow."
        },
        stats: {
          b2b: "Oznaczone B2B",
          ready: "Gotowe do szkicu",
          drafts: "Szkice faktur"
        },
        review: {
          title: "Czy KSeF Pilot pomaga?",
          body:
            "Jeśli oszczędza czas, opinia w Shopify pomoże nam dotrzeć do kolejnych sprzedawców. Jeśli nie, napisz nam zanim poprosimy publicznie.",
          leave: "Dodaj opinię",
          later: "Nie teraz"
        },
        setup: {
          title: "Lista konfiguracji",
          description: "Najważniejsze kroki przed prawdziwą wysyłką do KSeF.",
          seller: "Dane sprzedawcy",
          billing: "Rozliczenia",
          orders: "Pierwszy szkic faktury",
          export: "Eksport dla księgowości",
          ksef: "Token KSeF",
          xsd: "Walidacja schemy FA(3)"
        },
        setupDetails: {
          seller: {
            done: "Dane sprzedawcy zapisane.",
            open: "Dodaj NIP i nazwę sprzedawcy w ustawieniach KSeF."
          },
          billing: {
            done: "Limit planu pozwala tworzyć kolejne faktury.",
            open: "Wybierz plan, aby tworzyć więcej faktur."
          },
          orders: {
            done: "Pierwszy szkic faktury został utworzony.",
            open: "Oznacz zamówienie B2B i wygeneruj pierwszy szkic."
          },
          export: {
            done: "Eksport dla księgowości został użyty.",
            open: "Wyeksportuj ZIP z XML, PDF i CSV."
          },
          ksef: {
            done: "Token KSeF jest połączony.",
            open: "Opcjonalne podczas testów. Wymagane przed prawdziwą wysyłką."
          },
          xsd: {
            done: "FA(3) XML przechodzi walidację XSD.",
            open: "Waliduj każdy szkic faktury oficjalną schemą FA(3)."
          }
        },
        settings: {
          title: "Ustawienia KSeF",
          sellerSection: "Dane sprzedawcy",
          ksefSection: "Połączenie KSeF",
          tokenLabel: "Token API KSeF",
          tokenHelp: "Wklej token wygenerowany na ksef.podatki.gov.pl. Przechowujemy go w formie szyfrowanej.",
          tokenSkip: "Podczas testów zostaw to pole puste. Generowanie szkicu faktury nie wymaga tokenu KSeF.",
          safeTest:
            "Bezpieczny tryb testowy: użyj fikcyjnych danych sprzedawcy i nie podawaj tokenu KSeF. Aplikacja zapisze tylko lokalny szkic XML.",
          sellerNip: "NIP sprzedawcy",
          sellerNipHelp: "Do testów możesz wpisać dowolne 10 cyfr, na przykład 1234567890.",
          sellerName: "Nazwa prawna sprzedawcy",
          sellerAddress: "Adres sprzedawcy",
          placeOfIssue: "Miejsce wystawienia",
          test: "Testuj połączenie",
          save: "Zapisz ustawienia",
          saved: "Ustawienia zapisane. KSeF może pozostać niepołączony podczas testowania szkiców faktur.",
          connectedSaved: "Ustawienia zapisane i token KSeF został zapisany.",
          loadError: "Nie udało się wczytać ustawień.",
          saveError: "Nie udało się zapisać ustawień.",
          missingShop: "Shopify nie przekazało domeny sklepu. Otwórz aplikację ponownie z menu Aplikacje w panelu Shopify.",
          connected: "Połączono",
          notConnected: "Nie połączono"
        },
        orders: {
          title: "Zamówienia B2B",
          description: "Sprawdzaj zamówienia Shopify i twórz szkice faktur. Aplikacja tylko odczytuje zamówienia i nigdy ich nie edytuje.",
          emptyTitle: "Shopify zwróciło 0 zamówień",
          empty:
            "Utwórz nowe zamówienie testowe w sklepie deweloperskim i odśwież ponownie. Zakres read_orders w Shopify pokazuje tylko świeże zamówienia; starsze próbki mogą być widoczne w panelu, ale nie w API.",
          filter: "Tylko nieprzetworzone B2B",
          refresh: "Odśwież zamówienia",
          loading: "Ładowanie zamówień",
          buyerNip: "NIP nabywcy",
          buyerName: "Nazwa nabywcy",
          saveFlag: "Zapisz B2B",
          generate: "Generuj fakturę",
          generateReady: "Generuj gotowe szkice",
          nipSource: "Źródło NIP: {{source}}",
          devCurrency: "Tryb testowy: zamówienie w {{currency}} zostanie zapisane jako PLN w XML FA(3).",
          billingUnlimited: "Plan {{plan}}: nielimitowane faktury w tym miesiącu.",
          billingUsage: "Plan {{plan}}: wykorzystano {{used}}/{{limit}} faktur w tym miesiącu.",
          rememberedNips: "Zapisane numery NIP są pamiętane przy kliencie Shopify i uzupełniane w kolejnych zamówieniach B2B.",
          loadError: "Nie udało się pobrać zamówień Shopify. Sprawdź instalację aplikacji i dostęp read_orders.",
          missingShop: "Shopify nie przekazało domeny sklepu. Otwórz aplikację ponownie z menu Aplikacje w panelu Shopify.",
          saveError: "Nie udało się zapisać oznaczenia B2B.",
          generateError: "Nie udało się wygenerować faktury.",
          invoiceCreated: "Utworzono szkic faktury dla {{orderName}}.",
          bulkCreated: "Utworzono szkice faktur: {{count}}.",
          safeTest: "Tu nie ma jeszcze prawdziwej wysyłki. Generowanie faktury tworzy tylko szkic i XML w tej aplikacji."
        },
        invoices: {
          title: "Szkice faktur",
          description: "Pobierz pojedyncze XML albo tygodniowy/miesięczny ZIP dla księgowości.",
          safeTest:
            "Szkice to lokalne pliki XML FA(3). ZIP zawiera XML, podglądy PDF i manifest CSV do sprawdzenia przez księgowość przed wysyłką do KSeF.",
          validatePassed: "{{orderName}} przeszło oficjalną walidację XSD FA(3).",
          validateFailed: "{{orderName}} nie przeszło oficjalnej walidacji XSD FA(3): {{count}} błędów.",
          exportPeriod: "Okres eksportu",
          thisWeek: "Ten tydzień",
          thisMonth: "Ten miesiąc",
          allDrafts: "Wszystkie szkice",
          downloadZip: "Pobierz ZIP",
          loading: "Ładowanie faktur",
          emptyTitle: "Nie ma jeszcze szkiców faktur",
          empty: "Wygeneruj szkic z zamówienia B2B, a potem wróć tutaj, aby sprawdzić lub wyeksportować plik.",
          createdLine: "Utworzono {{date}} - pozycji: {{count}}",
          validate: "Waliduj FA(3)",
          previewXml: "Podgląd XML",
          downloadPdf: "Pobierz PDF",
          downloadXml: "Pobierz XML",
          openError: "Nie udało się otworzyć XML faktury.",
          validateError: "Nie udało się zwalidować XML faktury."
        },
        billing: {
          title: "Rozliczenia",
          description: "Wybierz lub zmień plan na stronie rozliczeń Shopify.",
          managed:
            "Shopify obsługuje zmianę planu i zatwierdzenie płatności na stronie Shopify App Pricing. KSeF Pilot tylko odczytuje aktywny plan i limity.",
          manage: "Zarządzaj planem w Shopify",
          unavailable: "Strona rozliczeń Shopify nie jest jeszcze dostępna. Odśwież rozliczenia i spróbuj ponownie.",
          loadError: "Nie udało się wczytać rozliczeń.",
          usedUnlimited: "{{used}} użyto / bez limitu",
          usedLimited: "{{used}} / {{limit}} użyto",
          currentInShopify: "Aktywny w Shopify",
          manageInShopify: "Zarządzaj w Shopify",
          invoicesMonth: "{{count}} faktur/miesiąc",
          unlimitedInvoices: "Bez limitu faktur"
        },
        plans: {
          free: "Free",
          basic: "Basic",
          pro: "Pro",
          unlimited: "Unlimited"
        }
      }
    },
    en: {
      translation: {
        language: {
          label: "Language",
          pl: "Polski",
          en: "English"
        },
        common: {
          refresh: "Refresh",
          closePreview: "Close preview",
          status: "Status",
          current: "Current",
          loading: "Loading",
          done: "Done",
          open: "Open"
        },
        nav: {
          orders: "Orders",
          invoices: "Invoices",
          settings: "KSeF Settings",
          billing: "Billing"
        },
        install: {
          connect: "Connect Shopify store"
        },
        home: {
          title: "KSeF Pilot",
          tagline: "Polish e-invoices for Shopify",
          heroTitle: "B2B invoices, ready for KSeF",
          heroCopy:
            "Find B2B orders, add the buyer NIP, and create a draft FA(3) invoice before anything touches the government API.",
          builtBy: "Built by FakturaFlow",
          description:
            "Turn B2B Shopify orders into Polish KSeF e-invoices without turning your store into an accounting cockpit. Built by FakturaFlow."
        },
        stats: {
          b2b: "B2B marked",
          ready: "Ready to draft",
          drafts: "Draft invoices"
        },
        review: {
          title: "Is KSeF Pilot helping?",
          body:
            "If it is saving time, a Shopify review would help us reach more merchants. If not, tell us before we ask publicly.",
          leave: "Leave review",
          later: "Not now"
        },
        setup: {
          title: "Setup checklist",
          description: "Keep the compliance path visible before live KSeF submission.",
          seller: "Seller identity",
          billing: "Billing",
          orders: "First draft invoice",
          export: "Accountant export",
          ksef: "KSeF token",
          xsd: "FA(3) schema validation"
        },
        setupDetails: {
          seller: {
            done: "Seller details are saved.",
            open: "Add seller NIP and legal name in KSeF Settings."
          },
          billing: {
            done: "The current plan limit allows more invoices.",
            open: "Choose a plan to generate more invoices."
          },
          orders: {
            done: "The first draft invoice has been created.",
            open: "Mark a B2B order and generate the first draft."
          },
          export: {
            done: "The accountant export has been used.",
            open: "Export a ZIP packet with XML, PDF, and CSV."
          },
          ksef: {
            done: "KSeF token is connected.",
            open: "Optional for testing. Required before live submission."
          },
          xsd: {
            done: "FA(3) XML passes XSD validation.",
            open: "Validate every draft invoice against the official FA(3) schema."
          }
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
          saved: "Settings saved. KSeF can stay not connected while you test with draft invoices.",
          connectedSaved: "Settings saved and KSeF token stored.",
          loadError: "Could not load settings.",
          saveError: "Could not save settings.",
          missingShop: "Shopify did not provide the shop domain. Reopen the app from the Shopify admin Apps menu.",
          connected: "Connected",
          notConnected: "Not connected"
        },
        orders: {
          title: "B2B orders",
          description: "Review Shopify orders and create draft invoices. The app reads orders only and never edits them.",
          emptyTitle: "Shopify returned 0 orders",
          empty:
            "Create a new test order in this dev store, then refresh again. Shopify's read_orders scope only exposes recent orders; older sample orders may show in Shopify admin but not in the API.",
          filter: "Unprocessed B2B only",
          refresh: "Refresh orders",
          loading: "Loading orders",
          buyerNip: "Buyer NIP",
          buyerName: "Buyer name",
          saveFlag: "Save B2B flag",
          generate: "Generate invoice",
          generateReady: "Generate ready drafts",
          nipSource: "NIP source: {{source}}",
          devCurrency: "Dev mode: this {{currency}} test order will be drafted as PLN for FA(3) XML.",
          billingUnlimited: "{{plan}} plan: unlimited invoices this month.",
          billingUsage: "{{plan}} plan: {{used}}/{{limit}} invoices used this month.",
          rememberedNips: "Saved buyer NIPs are remembered by Shopify customer and used to prefill future B2B orders.",
          loadError: "Could not load Shopify orders. Check that the app has read_orders access and the store is installed.",
          missingShop: "Shopify did not provide the shop domain. Reopen the app from the Shopify admin Apps menu.",
          saveError: "Could not save the B2B flag.",
          generateError: "Could not generate the invoice.",
          invoiceCreated: "Draft invoice created for {{orderName}}.",
          bulkCreated: "{{count}} draft invoice(s) created.",
          safeTest: "No real submission happens here yet. Generate invoice creates a draft record and XML in this app only."
        },
        invoices: {
          title: "Draft invoices",
          description: "Download XML one-by-one or export a weekly/monthly ZIP for accountant review.",
          safeTest:
            "Drafts are local FA(3) XML files. The ZIP includes XML, PDF previews, and a CSV manifest for accountant review before any KSeF submission flow is enabled.",
          validatePassed: "{{orderName}} passed official FA(3) XSD validation.",
          validateFailed: "{{orderName}} failed official FA(3) XSD validation with {{count}} issue(s).",
          exportPeriod: "Export period",
          thisWeek: "This week",
          thisMonth: "This month",
          allDrafts: "All drafts",
          downloadZip: "Download ZIP",
          loading: "Loading invoices",
          emptyTitle: "No draft invoices yet",
          empty: "Generate a draft from a B2B order, then come back here to inspect or export it.",
          createdLine: "Created {{date}} - {{count}} line item(s)",
          validate: "Validate FA(3)",
          previewXml: "Preview XML",
          downloadPdf: "Download PDF",
          downloadXml: "Download XML",
          openError: "Could not open invoice XML.",
          validateError: "Could not validate invoice XML."
        },
        billing: {
          title: "Billing",
          description: "Choose or change a plan on Shopify's pricing page.",
          managed:
            "Shopify handles plan changes and payment approval on the Shopify App Pricing page. KSeF Pilot only reads the active plan and usage limits.",
          manage: "Manage pricing in Shopify",
          unavailable: "Managed Pricing is not available yet. Refresh billing and try again.",
          loadError: "Could not load billing.",
          usedUnlimited: "{{used}} used / unlimited",
          usedLimited: "{{used}} / {{limit}} used",
          currentInShopify: "Current in Shopify",
          manageInShopify: "Manage in Shopify",
          invoicesMonth: "{{count}} invoices/month",
          unlimitedInvoices: "Unlimited invoices"
        },
        plans: {
          free: "Free",
          basic: "Basic",
          pro: "Pro",
          unlimited: "Unlimited"
        }
      }
    }
  }
});

export default i18n;
