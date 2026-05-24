import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Badge,
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Select,
  Spinner,
  Tabs,
  Text,
  TextField
} from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { AppBridgeBootstrap } from "./components/AppBridgeBootstrap";

type View = "orders" | "invoices" | "queue" | "settings" | "billing";
type InvoicePeriod = "week" | "month" | "all";
type QueueStatus = "all" | "pending" | "processing" | "retrying" | "submitted" | "failed";

interface SettingsState {
  sellerNip: string;
  sellerName: string;
  sellerAddress: string;
  placeOfIssue: string;
  ksefTestMode: boolean;
}

interface KsefReadiness {
  environment: "TEST" | "DEMO" | "PROD";
  apiBaseUrl: string | null;
  liveSubmissionEnabled: boolean;
  canLiveSubmit: boolean;
  issues: string[];
}

type SettingsResponse = SettingsState & {
  connected: boolean;
  hasToken: boolean;
  checkedAt?: string;
  tokenTestError?: string;
  readiness?: KsefReadiness;
};

interface OrderRow {
  id: string;
  name: string;
  createdAt: string;
  currency: string;
  totalGross: number;
  buyerName: string;
  buyerNip: string;
  nipSource?: string;
  isB2b: boolean;
  processed: boolean;
  invoiceStatus?: string;
  ksefNumber?: string;
  unsupportedReason?: "non_pln" | "mixed_vat" | "missing_tax_lines";
}

interface InvoiceRow {
  id: string;
  orderName: string;
  buyerName: string;
  nip: string;
  status: string;
  correctionOf?: string | null;
  lastError?: string | null;
  fa3ValidatedAt?: string | null;
  fa3ValidationStatus?: string | null;
  fa3ValidationError?: string | null;
  ksefNumber?: string;
  upoStatus?: string | null;
  upoFetchedAt?: string | null;
  hasUpo?: boolean;
  totalGross: string | number;
  createdAt: string;
  itemCount: number;
  submission?: {
    id: string;
    mode: string;
    status: string;
    attempts: number;
    nextRetryAt?: string | null;
    lastError?: string | null;
    ksefNumber?: string | null;
    sessionReferenceNumber?: string | null;
    invoiceReferenceNumber?: string | null;
  } | null;
}

interface QueueSubmission {
  id: string;
  mode: string;
  status: string;
  attempts: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  ksefNumber?: string | null;
  sessionReferenceNumber?: string | null;
  invoiceReferenceNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  invoice: {
    id: string;
    orderName: string;
    buyerName: string;
    nip: string;
    status: string;
    ksefNumber?: string | null;
    upoStatus?: string | null;
    hasUpo: boolean;
    totalGross: string | number;
  };
}

interface QueueResponse {
  summary: {
    total: number;
    pending: number;
    processing: number;
    retrying: number;
    submitted: number;
    failed: number;
  };
  submissions: QueueSubmission[];
}

interface AutomationHealth {
  workerSecretConfigured: boolean;
  productionRequiresWorkerSecret: boolean;
  liveSubmissionEnabled: boolean;
  retryEndpoint: string;
  statusRefreshEndpoint: string;
  dueRetries: number;
  pendingStatusRefreshes: number;
  failedSubmissions: number;
  checkedAt: string;
}

interface BillingSummary {
  plan: string;
  planName: string;
  limit: number | null;
  used: number;
  remaining: number | null;
  billingStatus: string;
  canGenerate: boolean;
  managedPricingUrl: string;
  plans: Record<string, { name: string; price: number; limit: number | null }>;
}

interface ReviewStatus {
  shouldAsk: boolean;
  reviewUrl: string | null;
}

interface SetupStatus {
  complete: boolean;
  items: Array<{
    id: string;
    label: string;
    done: boolean;
    detail: string;
  }>;
}

interface XsdValidationResult {
  invoiceId: string;
  orderName: string;
  fa3ValidatedAt?: string | null;
  fa3ValidationStatus?: string | null;
  fa3ValidationError?: string | null;
  validation: {
    valid: boolean;
    enforced: boolean;
    officialXsdUrl: string;
    issueCount: number;
    issues: Array<{ path: string; code: string; message: string; severity: string }>;
    suppressedIssueCount?: number;
    compatibilityNotes?: string[];
  };
}

function currencyWarning(order: OrderRow, translate: (key: string, values?: Record<string, unknown>) => string) {
  return order.currency === "PLN"
    ? ""
    : translate("orders.devCurrency", { currency: order.currency });
}

function useShop() {
  return useMemo(() => new URLSearchParams(window.location.search).get("shop") ?? "", []);
}

function isInstallError(message: string) {
  return message.toLowerCase().includes("shop is not installed");
}

export function App() {
  const { t, i18n } = useTranslation();
  const shop = useShop();
  const [view, setView] = useState<View>("orders");
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<SettingsState>({
    sellerNip: "",
    sellerName: "",
    sellerAddress: "",
    placeOfIssue: "",
    ksefTestMode: true
  });
  const [saving, setSaving] = useState(false);
  const [hasKsefToken, setHasKsefToken] = useState(false);
  const [connectionState, setConnectionState] = useState<"unknown" | "connected" | "error">("unknown");
  const [ksefReadiness, setKsefReadiness] = useState<KsefReadiness | null>(null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [onlyUnprocessedB2b, setOnlyUnprocessedB2b] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicePeriod, setInvoicePeriod] = useState<InvoicePeriod>("month");
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");
  const [xmlPreview, setXmlPreview] = useState<{ title: string; xml: string } | null>(null);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(null);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [xsdValidation, setXsdValidation] = useState<XsdValidationResult | null>(null);
  const [validatingInvoiceId, setValidatingInvoiceId] = useState<string | null>(null);
  const [submittingInvoiceId, setSubmittingInvoiceId] = useState<string | null>(null);
  const [refreshingStatusInvoiceId, setRefreshingStatusInvoiceId] = useState<string | null>(null);
  const [correctingInvoiceId, setCorrectingInvoiceId] = useState<string | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>("all");
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState("");
  const [queueActionId, setQueueActionId] = useState<string | null>(null);
  const [automationHealth, setAutomationHealth] = useState<AutomationHealth | null>(null);

  function apiPath(path: string) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}shop=${encodeURIComponent(shop)}`;
  }

  function updateOrder(orderId: string, update: Partial<OrderRow>) {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...update } : order)));
  }

  function installShop() {
    if (!shop) {
      return;
    }

    window.open(`/auth?shop=${encodeURIComponent(shop)}`, "_top");
  }

  async function loadSettings() {
    if (!shop) return;

    const response = await fetch(apiPath("/api/ksef/settings"));

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      setSettingsError(payload.error ?? t("settings.loadError"));
      return;
    }

    const result = (await response.json()) as SettingsResponse;
    setSettings({
      sellerNip: result.sellerNip ?? "",
      sellerName: result.sellerName ?? "",
      sellerAddress: result.sellerAddress ?? "",
      placeOfIssue: result.placeOfIssue ?? "",
      ksefTestMode: result.ksefTestMode ?? true
    });
    setKsefReadiness(result.readiness ?? null);
    setHasKsefToken(result.hasToken ?? false);
    setConnectionState(result.connected ? "connected" : "unknown");
  }

  async function loadOrders() {
    if (!shop) {
      setOrderError(t("orders.missingShop"));
      return;
    }

    setOrdersLoading(true);
    setOrderError("");
    try {
      const response = await fetch(apiPath(`/api/orders?onlyUnprocessedB2b=${onlyUnprocessedB2b}`));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("orders.loadError"));
      }

      const result = (await response.json()) as { orders: OrderRow[] };
      setOrders(result.orders);
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : t("orders.loadError"));
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadInvoices() {
    if (!shop) return;

    setInvoicesLoading(true);
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices?period=${invoicePeriod}`));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.openError"));
      }

      const result = (await response.json()) as { invoices: InvoiceRow[] };
      setInvoices(result.invoices);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.openError"));
    } finally {
      setInvoicesLoading(false);
    }
  }

  async function loadQueue() {
    if (!shop) return;

    setQueueLoading(true);
    setQueueError("");
    try {
      const response = await fetch(apiPath(`/api/ksef/submissions?status=${queueStatus}`));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("queue.loadError"));
      }

      setQueue((await response.json()) as QueueResponse);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : t("queue.loadError"));
    } finally {
      setQueueLoading(false);
    }
  }

  async function loadAutomationHealth() {
    if (!shop) return;

    const response = await fetch(apiPath("/api/ksef/automation-health"));
    if (response.ok) {
      setAutomationHealth((await response.json()) as AutomationHealth);
    }
  }

  async function loadBilling() {
    if (!shop) return;

    setBillingLoading(true);
    setBillingError("");
    try {
      const response = await fetch(apiPath("/api/billing"));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("billing.loadError"));
      }

      setBilling((await response.json()) as BillingSummary);
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : t("billing.loadError"));
    } finally {
      setBillingLoading(false);
    }
  }

  async function loadReviewStatus() {
    if (!shop) return;

    const response = await fetch(apiPath("/api/review/status"));
    if (response.ok) {
      setReviewStatus((await response.json()) as ReviewStatus);
    }
  }

  async function loadSetupStatus() {
    if (!shop) return;

    const response = await fetch(apiPath("/api/setup/status"));
    if (response.ok) {
      setSetupStatus((await response.json()) as SetupStatus);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, [shop]);

  useEffect(() => {
    void loadOrders();
    void loadBilling();
    void loadReviewStatus();
    void loadSetupStatus();
  }, [shop, onlyUnprocessedB2b]);

  useEffect(() => {
    if (view === "invoices") {
      void loadInvoices();
    }
  }, [shop, invoicePeriod, view]);

  useEffect(() => {
    if (view === "queue") {
      void loadQueue();
      void loadAutomationHealth();
    }
  }, [shop, queueStatus, view]);

  async function saveSettings(includeToken = false) {
    if (!shop) {
      setSettingsError(t("settings.missingShop"));
      return;
    }

    setSaving(true);
    setSettingsError("");
    setSettingsMessage("");
    try {
      const response = await fetch(`/api/ksef/settings?shop=${encodeURIComponent(shop)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: includeToken ? token || undefined : undefined,
          ...settings
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("settings.saveError"));
      }

      const result = (await response.json()) as SettingsResponse;
      setSettings({
        sellerNip: result.sellerNip ?? "",
        sellerName: result.sellerName ?? "",
        sellerAddress: result.sellerAddress ?? "",
        placeOfIssue: result.placeOfIssue ?? "",
        ksefTestMode: result.ksefTestMode ?? true
      });
      setKsefReadiness(result.readiness ?? null);
      setHasKsefToken(result.hasToken ?? false);
      setConnectionState(result.connected ? "connected" : "unknown");
      if (includeToken && result.connected) {
        setToken("");
      }
      setSettingsMessage(t(result.connected ? "settings.connectedSaved" : "settings.saved"));
      if (result.tokenTestError) {
        setSettingsError(result.tokenTestError);
      }
    } catch (error) {
      setConnectionState("error");
      setSettingsError(error instanceof Error ? error.message : t("settings.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function saveFlag(order: OrderRow) {
    setActionOrderId(order.id);
    setOrderError("");
    try {
      const response = await fetch(apiPath("/api/orders/flag"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          orderName: order.name,
          isB2b: order.isB2b,
          nip: order.buyerNip,
          buyerName: order.buyerName
        })
      });

      if (!response.ok) {
        throw new Error("Flag save failed");
      }
    } catch {
      setOrderError(t("orders.saveError"));
    } finally {
      setActionOrderId(null);
    }
  }

  async function generateInvoice(order: OrderRow) {
    setActionOrderId(order.id);
    setOrderError("");
    setLastInvoice("");
    try {
      const response = await fetch(apiPath("/api/orders/generate-invoice"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          buyerNip: order.buyerNip,
          buyerName: order.buyerName
        })
      });

      if (!response.ok) {
        const message = ((await response.json()) as { error?: string }).error ?? t("orders.generateError");
        throw new Error(message);
      }

      const result = (await response.json()) as { invoice: { id: string; orderName: string; status: string } };
      updateOrder(order.id, { processed: true, invoiceStatus: result.invoice.status });
      setLastInvoice(t("orders.invoiceCreated", { orderName: result.invoice.orderName }));
      void loadInvoices();
      void loadBilling();
      void loadReviewStatus();
      void loadSetupStatus();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : t("orders.generateError"));
    } finally {
      setActionOrderId(null);
    }
  }

  async function generateReadyDrafts() {
    const readyOrders = orders.filter(
      (order) => order.isB2b && !order.processed && !order.unsupportedReason && order.buyerNip.replace(/\D/g, "").length === 10
    );

    if (!readyOrders.length) return;

    setBulkGenerating(true);
    setOrderError("");
    setLastInvoice("");
    let created = 0;

    try {
      for (const order of readyOrders) {
        setActionOrderId(order.id);
        const response = await fetch(apiPath("/api/orders/generate-invoice"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            orderId: order.id,
            buyerNip: order.buyerNip,
            buyerName: order.buyerName
          })
        });

        if (!response.ok) {
          const message = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? t("orders.generateError");
          throw new Error(`${order.name}: ${message}`);
        }

        const result = (await response.json()) as { invoice: { status: string } };
        updateOrder(order.id, { processed: true, invoiceStatus: result.invoice.status });
        created += 1;
      }

      setLastInvoice(t("orders.bulkCreated", { count: created }));
      void loadInvoices();
      void loadBilling();
      void loadReviewStatus();
      void loadSetupStatus();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : t("orders.generateError"));
    } finally {
      setActionOrderId(null);
      setBulkGenerating(false);
    }
  }

  async function previewInvoice(invoice: InvoiceRow) {
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${invoice.id}`));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.openError"));
      }

      const result = (await response.json()) as { invoice: InvoiceRow & { fa3Xml: string } };
      setXmlPreview({ title: `${invoice.orderName} FA(3) XML`, xml: result.invoice.fa3Xml });
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.openError"));
    }
  }

  function downloadInvoice(invoice: InvoiceRow) {
    window.open(apiPath(`/api/invoices/${invoice.id}/xml`), "_blank");
  }

  function downloadInvoicePdf(invoice: InvoiceRow) {
    window.open(apiPath(`/api/invoices/${invoice.id}/pdf`), "_blank");
  }

  function downloadInvoiceZip() {
    window.open(apiPath(`/api/invoices/export.zip?period=${invoicePeriod}`), "_blank");
    setTimeout(() => {
      void loadInvoices();
      void loadReviewStatus();
      void loadSetupStatus();
    }, 1200);
  }

  async function submitInvoice(invoice: InvoiceRow) {
    setSubmittingInvoiceId(invoice.id);
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${invoice.id}/submit`), { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.submitError"));
      }

      await loadInvoices();
      void loadSetupStatus();
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.submitError"));
    } finally {
      setSubmittingInvoiceId(null);
    }
  }

  async function refreshKsefStatus(invoice: InvoiceRow) {
    setRefreshingStatusInvoiceId(invoice.id);
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${invoice.id}/refresh-status`), { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.refreshStatusError"));
      }

      await loadInvoices();
      void loadSetupStatus();
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.refreshStatusError"));
    } finally {
      setRefreshingStatusInvoiceId(null);
    }
  }

  async function refreshQueueStatus(submission: QueueSubmission) {
    setQueueActionId(submission.id);
    setQueueError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${submission.invoice.id}/refresh-status`), { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("queue.refreshError"));
      }

      await loadQueue();
      void loadAutomationHealth();
      void loadInvoices();
      void loadSetupStatus();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : t("queue.refreshError"));
    } finally {
      setQueueActionId(null);
    }
  }

  async function retryQueueSubmission(submission: QueueSubmission) {
    setQueueActionId(submission.id);
    setQueueError("");
    try {
      const response = await fetch(apiPath(`/api/ksef/submissions/${submission.id}/retry`), { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("queue.retryError"));
      }

      await loadQueue();
      void loadAutomationHealth();
      void loadInvoices();
      void loadSetupStatus();
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : t("queue.retryError"));
    } finally {
      setQueueActionId(null);
    }
  }

  function downloadInvoiceUpo(invoice: InvoiceRow) {
    window.open(apiPath(`/api/invoices/${invoice.id}/upo.xml`), "_blank");
  }

  async function createCorrection(invoice: InvoiceRow) {
    setCorrectingInvoiceId(invoice.id);
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${invoice.id}/correction`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: t("invoices.defaultCorrectionReason") })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.correctionError"));
      }

      await loadInvoices();
      void loadBilling();
      void loadSetupStatus();
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.correctionError"));
    } finally {
      setCorrectingInvoiceId(null);
    }
  }

  async function validateInvoice(invoice: InvoiceRow) {
    setValidatingInvoiceId(invoice.id);
    setInvoiceError("");
    try {
      const response = await fetch(apiPath(`/api/invoices/${invoice.id}/validate`));

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("invoices.validateError"));
      }

      const result = (await response.json()) as XsdValidationResult;
      setXsdValidation(result);
      setInvoices((current) =>
        current.map((item) =>
          item.id === result.invoiceId
            ? {
                ...item,
                fa3ValidatedAt: result.fa3ValidatedAt,
                fa3ValidationStatus: result.fa3ValidationStatus,
                fa3ValidationError: result.fa3ValidationError,
                lastError: result.fa3ValidationError ?? item.lastError
              }
            : item
        )
      );
      void loadSetupStatus();
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : t("invoices.validateError"));
    } finally {
      setValidatingInvoiceId(null);
    }
  }

  function openManagedPricing() {
    if (!billing?.managedPricingUrl) {
      setBillingError(t("billing.unavailable"));
      return;
    }

    window.open(billing.managedPricingUrl, "_top");
  }

  async function dismissReview() {
    await fetch(apiPath("/api/review/dismiss"), { method: "POST" });
    setReviewStatus({ shouldAsk: false, reviewUrl: reviewStatus?.reviewUrl ?? null });
  }

  const tabs = [
    { id: "orders", content: t("nav.orders") },
    { id: "invoices", content: t("nav.invoices") },
    { id: "queue", content: t("nav.queue") },
    { id: "settings", content: t("nav.settings") },
    { id: "billing", content: t("nav.billing") }
  ];
  const selectedTab = tabs.findIndex((tab) => tab.id === view);
  const b2bCount = orders.filter((order) => order.isB2b).length;
  const draftCount = orders.filter((order) => order.invoiceStatus === "draft").length;
  const readyCount = orders.filter((order) => order.isB2b && !order.processed).length;
  const readyVisibleCount = orders.filter(
    (order) => order.isB2b && !order.processed && !order.unsupportedReason && order.buyerNip.replace(/\D/g, "").length === 10
  ).length;
  const blockedOrderCount = orders.filter((order) => order.isB2b && !order.processed && order.unsupportedReason).length;
  const limitReached = billing ? !billing.canGenerate : false;
  const locale = i18n.language.startsWith("en") ? "en" : "pl";
  const currentPlanName = billing ? t(`plans.${billing.plan}`, { defaultValue: billing.planName }) : "";
  const languageOptions = [
    { label: t("language.pl"), value: "pl" },
    { label: t("language.en"), value: "en" }
  ];
  const planCards = [
    ["free", t("plans.free"), "$0", t("billing.invoicesMonth", { count: 5 })],
    ["basic", t("plans.basic"), "$9.99", t("billing.invoicesMonth", { count: 50 })],
    ["pro", t("plans.pro"), "$19.99", t("billing.invoicesMonth", { count: 200 })],
    ["unlimited", t("plans.unlimited"), "$39.99", t("billing.unlimitedInvoices")]
  ];
  const submissionModeLabel = settings.ksefTestMode ? t("invoices.testMode") : t("invoices.liveMode");
  const ksefStatusLabel = settings.ksefTestMode
    ? t("settings.safeModeStatus")
    : ksefReadiness?.canLiveSubmit
      ? t("settings.liveReadyStatus")
      : ksefReadiness?.liveSubmissionEnabled
        ? t("settings.liveNeedsSetupStatus")
        : t("settings.liveDisabledStatus");
  const ksefStatusDotClass = ksefReadiness?.canLiveSubmit
    ? "status-dot connected"
    : !settings.ksefTestMode && !ksefReadiness?.liveSubmissionEnabled
      ? "status-dot danger"
      : "status-dot";
  const ksefBadgeTone: "success" | "attention" = ksefReadiness?.canLiveSubmit ? "success" : "attention";
  const liveSubmissionBlocked = !settings.ksefTestMode && !ksefReadiness?.canLiveSubmit;
  const readinessItems = ksefReadiness
    ? [
        {
          label: t("settings.readinessEnvironment"),
          value: ksefReadiness.environment,
          ok: true
        },
        {
          label: t("settings.readinessServerLive"),
          value: ksefReadiness.liveSubmissionEnabled ? t("settings.enabled") : t("settings.disabled"),
          ok: ksefReadiness.liveSubmissionEnabled
        },
        {
          label: t("settings.readinessMerchantMode"),
          value: settings.ksefTestMode ? t("settings.safeMode") : t("settings.liveMode"),
          ok: !settings.ksefTestMode
        },
        {
          label: t("settings.readinessToken"),
          value: connectionState === "connected" ? t("settings.connected") : t("settings.notConnected"),
          ok: connectionState === "connected"
        },
        {
          label: t("settings.readinessSellerNip"),
          value: settings.sellerNip ? t("settings.savedValue") : t("settings.missingValue"),
          ok: Boolean(settings.sellerNip)
        },
        {
          label: t("settings.readinessLiveReady"),
          value: ksefReadiness.canLiveSubmit ? t("settings.yes") : t("settings.no"),
          ok: ksefReadiness.canLiveSubmit
        }
      ]
    : [];

  return (
    <>
      <AppBridgeBootstrap />
      <Page title={t("home.title")} subtitle={t("home.tagline")}>
        <Layout>
          <Layout.Section>
            <BlockStack gap="500">
              <div className="app-hero">
                <div>
                  <div className="app-eyebrow">{t("home.builtBy")}</div>
                  <Text as="h1" variant="heading2xl">
                    {t("home.heroTitle")}
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    {t("home.heroCopy")}
                  </Text>
                </div>
                <div className="hero-status">
                  <span className={ksefStatusDotClass} />
                  {ksefStatusLabel}
                </div>
                <div className="language-switcher">
                  <Select
                    label={t("language.label")}
                    labelHidden
                    value={locale}
                    options={languageOptions}
                    onChange={(language) => void i18n.changeLanguage(language)}
                  />
                </div>
              </div>

              <div className="stat-grid">
                <div className="stat-card">
                  <span>{t("stats.b2b")}</span>
                  <strong>{b2bCount}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("stats.ready")}</span>
                  <strong>{readyCount}</strong>
                </div>
                <div className="stat-card">
                  <span>{t("stats.drafts")}</span>
                  <strong>{draftCount}</strong>
                </div>
              </div>

              <Tabs tabs={tabs} selected={selectedTab} onSelect={(index) => setView(tabs[index].id as View)} />

              {reviewStatus?.shouldAsk ? (
                <Card>
                  <InlineStack align="space-between" blockAlign="center" gap="300">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        {t("review.title")}
                      </Text>
                      <Text as="p" tone="subdued">
                        {t("review.body")}
                      </Text>
                    </BlockStack>
                    <InlineStack gap="200">
                      {reviewStatus.reviewUrl ? (
                        <Button variant="primary" url={reviewStatus.reviewUrl} target="_blank" onClick={dismissReview}>
                          {t("review.leave")}
                        </Button>
                      ) : null}
                      <Button onClick={dismissReview}>{t("review.later")}</Button>
                    </InlineStack>
                  </InlineStack>
                </Card>
              ) : null}

              {setupStatus ? (
                <Card>
                  <BlockStack gap="300">
                    <InlineStack align="space-between" blockAlign="center">
                      <BlockStack gap="100">
                        <Text as="h2" variant="headingMd">
                          {t("setup.title")}
                        </Text>
                        <Text as="p" tone="subdued">
                          {t("setup.description")}
                        </Text>
                      </BlockStack>
                      <Badge tone={setupStatus.complete ? "success" : "attention"}>
                        {`${setupStatus.items.filter((item) => item.done).length}/${setupStatus.items.length}`}
                      </Badge>
                    </InlineStack>
                    <div className="setup-grid">
                      {setupStatus.items.map((item) => (
                        <div className={item.done ? "setup-item done" : "setup-item"} key={item.id}>
                          <span>{item.done ? t("common.done") : t("common.open")}</span>
                          <Text as="h3" variant="headingSm">
                            {t(`setup.${item.id}`, { defaultValue: item.label })}
                          </Text>
                          <Text as="p" tone="subdued">
                            {t(`setupDetails.${item.id}.${item.done ? "done" : "open"}`, {
                              defaultValue: item.detail
                            })}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </BlockStack>
                </Card>
              ) : null}

              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between" blockAlign="center">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        {view === "settings"
                          ? t("settings.title")
                          : view === "orders"
                            ? t("orders.title")
                            : view === "invoices"
                              ? t("invoices.title")
                              : view === "queue"
                                ? t("queue.title")
                                : t("billing.title")}
                      </Text>
                      <Text as="p" tone="subdued">
                        {view === "orders"
                          ? t("orders.description")
                          : view === "invoices"
                            ? t("invoices.description")
                            : view === "queue"
                              ? t("queue.description")
                              : view === "billing"
                                ? t("billing.description")
                                : t("home.description")}
                      </Text>
                    </BlockStack>
                    <Badge tone={ksefBadgeTone}>{ksefStatusLabel}</Badge>
                  </InlineStack>

                  {view === "settings" ? (
                    <BlockStack gap="300">
                      <Banner tone="info">{t("settings.safeTest")}</Banner>
                      <div className="onboarding-steps">
                        <div className="onboarding-step">
                          <span>1</span>
                          <div>
                            <Text as="h3" variant="headingSm">
                              {t("settings.onboardingSellerTitle")}
                            </Text>
                            <Text as="p" tone="subdued">
                              {t("settings.onboardingSellerBody")}
                            </Text>
                          </div>
                        </div>
                        <div className="onboarding-step">
                          <span>2</span>
                          <div>
                            <Text as="h3" variant="headingSm">
                              {t("settings.onboardingTokenTitle")}
                            </Text>
                            <Text as="p" tone="subdued">
                              {t("settings.onboardingTokenBody")}
                            </Text>
                          </div>
                        </div>
                        <div className="onboarding-step">
                          <span>3</span>
                          <div>
                            <Text as="h3" variant="headingSm">
                              {t("settings.onboardingLiveTitle")}
                            </Text>
                            <Text as="p" tone="subdued">
                              {t("settings.onboardingLiveBody")}
                            </Text>
                          </div>
                        </div>
                      </div>
                      <Checkbox
                        label={t("settings.testMode")}
                        checked={settings.ksefTestMode}
                        onChange={(ksefTestMode) => setSettings((current) => ({ ...current, ksefTestMode }))}
                        helpText={t("settings.testModeHelp")}
                      />
                      {!settings.ksefTestMode && !ksefReadiness?.liveSubmissionEnabled ? (
                        <Banner tone="warning">{t("settings.liveServerDisabledBanner")}</Banner>
                      ) : null}
                      {ksefReadiness ? (
                        <div className="readiness-card">
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                              <Text as="h3" variant="headingMd">
                                {t("settings.readinessTitle")}
                              </Text>
                              <Badge tone={ksefBadgeTone}>{ksefStatusLabel}</Badge>
                            </InlineStack>
                            <div className="readiness-grid">
                              {readinessItems.map((item) => (
                                <div className={item.ok ? "readiness-item ok" : "readiness-item warn"} key={item.label}>
                                  <span>{item.label}</span>
                                  <strong>{item.value}</strong>
                                </div>
                              ))}
                            </div>
                            {ksefReadiness.issues.length ? (
                              <div className="readiness-issues">
                                {ksefReadiness.issues.map((issue) => (
                                  <Text as="p" tone="subdued" key={issue}>
                                    {t(`settings.readinessIssues.${issue}`, { defaultValue: issue })}
                                  </Text>
                                ))}
                              </div>
                            ) : null}
                          </BlockStack>
                        </div>
                      ) : null}
                      {settingsMessage ? <Banner tone="success">{settingsMessage}</Banner> : null}
                      {settingsError ? (
                        <Banner tone="critical">
                          <BlockStack gap="200">
                            <Text as="p">{settingsError}</Text>
                            {isInstallError(settingsError) && shop ? (
                              <InlineStack>
                                <Button onClick={installShop}>{t("install.connect")}</Button>
                              </InlineStack>
                            ) : null}
                          </BlockStack>
                        </Banner>
                      ) : null}
                      <div className="settings-grid">
                        <div className="settings-panel">
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">
                              {t("settings.sellerSection")}
                            </Text>
                            <TextField
                              label={t("settings.sellerNip")}
                              value={settings.sellerNip}
                              onChange={(sellerNip) => setSettings((current) => ({ ...current, sellerNip }))}
                              autoComplete="off"
                              helpText={t("settings.sellerNipHelp")}
                            />
                            <TextField
                              label={t("settings.sellerName")}
                              value={settings.sellerName}
                              onChange={(sellerName) => setSettings((current) => ({ ...current, sellerName }))}
                              autoComplete="organization"
                            />
                            <TextField
                              label={t("settings.sellerAddress")}
                              value={settings.sellerAddress}
                              onChange={(sellerAddress) => setSettings((current) => ({ ...current, sellerAddress }))}
                              autoComplete="street-address"
                            />
                            <TextField
                              label={t("settings.placeOfIssue")}
                              value={settings.placeOfIssue}
                              onChange={(placeOfIssue) => setSettings((current) => ({ ...current, placeOfIssue }))}
                              autoComplete="address-level2"
                            />
                          </BlockStack>
                        </div>
                        <div className="settings-panel">
                          <BlockStack gap="300">
                            <Text as="h3" variant="headingMd">
                              {t("settings.ksefSection")}
                            </Text>
                            <div className={connectionState === "connected" ? "token-status connected" : hasKsefToken ? "token-status warning" : "token-status"}>
                              <span className={connectionState === "connected" ? "status-dot connected" : "status-dot"} />
                              <div>
                                <Text as="p" fontWeight="semibold">
                                  {connectionState === "connected"
                                    ? t("settings.tokenConnectedTitle")
                                    : hasKsefToken
                                      ? t("settings.tokenNeedsRetestTitle")
                                      : t("settings.tokenMissingTitle")}
                                </Text>
                                <Text as="p" tone="subdued">
                                  {connectionState === "connected"
                                    ? t("settings.tokenConnectedBody")
                                    : hasKsefToken
                                      ? t("settings.tokenNeedsRetestBody")
                                      : t("settings.tokenMissingBody")}
                                </Text>
                              </div>
                            </div>
                            <TextField
                              label={t("settings.tokenLabel")}
                              value={token}
                              onChange={setToken}
                              type="password"
                              autoComplete="off"
                              helpText={t("settings.tokenHelp")}
                            />
                            <div className="test-note">
                              <Text as="p" tone="subdued">
                                {t("settings.tokenSkip")}
                              </Text>
                            </div>
                          </BlockStack>
                        </div>
                      </div>
                      <InlineStack gap="200">
                        <Button variant="primary" loading={saving} disabled={!shop} onClick={() => saveSettings(false)}>
                          {t("settings.save")}
                        </Button>
                        <Button disabled={!token || !shop || !settings.sellerNip} onClick={() => saveSettings(true)}>
                          {t("settings.saveAndTest")}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  ) : null}

                  {view === "orders" ? (
                    <BlockStack gap="400">
                      <Banner tone="info">{t("orders.safeTest")}</Banner>
                      {billing ? (
                        <Banner tone={limitReached ? "critical" : "info"}>
                          {billing.limit === null
                            ? t("orders.billingUnlimited", { plan: currentPlanName })
                            : t("orders.billingUsage", { plan: currentPlanName, used: billing.used, limit: billing.limit })}
                        </Banner>
                      ) : null}
                      <Banner tone="info">{t("orders.rememberedNips")}</Banner>
                      {blockedOrderCount ? (
                        <Banner tone="warning">{t("orders.blockedSummary", { count: blockedOrderCount })}</Banner>
                      ) : null}
                      {orderError ? (
                        <Banner tone="critical">
                          <BlockStack gap="200">
                            <Text as="p">{orderError}</Text>
                            {isInstallError(orderError) && shop ? (
                              <InlineStack>
                                <Button onClick={installShop}>{t("install.connect")}</Button>
                              </InlineStack>
                            ) : null}
                          </BlockStack>
                        </Banner>
                      ) : null}
                      {lastInvoice ? <Banner tone="success">{lastInvoice}</Banner> : null}
                      <InlineStack align="space-between" blockAlign="center">
                        <Checkbox
                          label={t("orders.filter")}
                          checked={onlyUnprocessedB2b}
                          onChange={setOnlyUnprocessedB2b}
                        />
                        <InlineStack gap="200">
                          <Button
                            variant="primary"
                            disabled={!readyVisibleCount || limitReached}
                            loading={bulkGenerating}
                            onClick={generateReadyDrafts}
                          >
                            {t("orders.generateReady")}
                          </Button>
                          <Button onClick={loadOrders} loading={ordersLoading}>
                            {t("orders.refresh")}
                          </Button>
                        </InlineStack>
                      </InlineStack>
                      {ordersLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel={t("orders.loading")} size="small" />
                        </InlineStack>
                      ) : null}
                      {!ordersLoading && orders.length === 0 ? (
                        <div className="empty-state">
                          <Text as="h3" variant="headingMd">
                            {t("orders.emptyTitle")}
                          </Text>
                          <Text as="p" tone="subdued">
                            {t("orders.empty")}
                          </Text>
                        </div>
                      ) : null}
                      <BlockStack gap="300">
                        {orders.map((order) => (
                          <div className="order-row" key={order.id}>
                            <InlineStack align="space-between" blockAlign="start" gap="300">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingMd">
                                    {order.name}
                                  </Text>
                                  {order.processed ? <Badge tone="success">{order.invoiceStatus ?? "draft"}</Badge> : null}
                                </InlineStack>
                                <Text as="p" tone="subdued">
                                  {new Date(order.createdAt).toLocaleDateString(locale)} - {order.totalGross.toFixed(2)}{" "}
                                  {order.currency}
                                </Text>
                              </BlockStack>
                              <Checkbox
                                label="B2B"
                                checked={order.isB2b}
                                onChange={(isB2b) => updateOrder(order.id, { isB2b })}
                              />
                            </InlineStack>
                            <div className="order-fields">
                              <TextField
                                label={t("orders.buyerNip")}
                                value={order.buyerNip}
                                onChange={(buyerNip) => updateOrder(order.id, { buyerNip })}
                                autoComplete="off"
                              />
                              <TextField
                                label={t("orders.buyerName")}
                                value={order.buyerName}
                                onChange={(buyerName) => updateOrder(order.id, { buyerName })}
                                autoComplete="organization"
                              />
                            </div>
                            {order.nipSource ? (
                              <Text as="p" tone="subdued">
                                {t("orders.nipSource", { source: order.nipSource })}
                              </Text>
                            ) : null}
                            {currencyWarning(order, t) ? (
                              <Text as="p" tone="subdued">
                                {currencyWarning(order, t)}
                              </Text>
                            ) : null}
                            {order.unsupportedReason ? (
                              <Banner tone="warning">
                                {t(`orders.unsupported.${order.unsupportedReason}`, {
                                  defaultValue: t("orders.unsupported.default")
                                })}
                              </Banner>
                            ) : null}
                            <InlineStack gap="200">
                              <Button loading={actionOrderId === order.id} onClick={() => saveFlag(order)}>
                                {t("orders.saveFlag")}
                              </Button>
                              <Button
                                variant="primary"
                                loading={actionOrderId === order.id}
                                disabled={
                                  limitReached ||
                                  !order.isB2b ||
                                  order.processed ||
                                  Boolean(order.unsupportedReason) ||
                                  order.buyerNip.replace(/\D/g, "").length !== 10
                                }
                                onClick={() => generateInvoice(order)}
                              >
                                {t("orders.generate")}
                              </Button>
                            </InlineStack>
                          </div>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  ) : null}

                  {view === "invoices" ? (
                    <BlockStack gap="400">
                      <Banner tone="info">{t("invoices.safeTest")}</Banner>
                      <Banner tone={settings.ksefTestMode || ksefReadiness?.canLiveSubmit ? "info" : "warning"}>
                        {settings.ksefTestMode
                          ? t("invoices.testModeBanner")
                          : ksefReadiness?.canLiveSubmit
                            ? t("invoices.liveReadyBanner")
                            : t("invoices.liveBlockedBanner")}
                      </Banner>
                      {invoiceError ? <Banner tone="critical">{invoiceError}</Banner> : null}
                      {xsdValidation ? (
                        <Banner tone={xsdValidation.validation.valid ? "success" : "critical"}>
                          <BlockStack gap="200">
                            <Text as="p">
                              {xsdValidation.validation.valid
                                ? t("invoices.validatePassed", { orderName: xsdValidation.orderName })
                                : t("invoices.validateFailed", {
                                    orderName: xsdValidation.orderName,
                                    count: xsdValidation.validation.issueCount
                                  })}
                            </Text>
                            {!xsdValidation.validation.valid ? (
                              <BlockStack gap="100">
                                {xsdValidation.validation.issues.slice(0, 4).map((issue, index) => (
                                  <Text as="p" tone="subdued" key={`${issue.code}-${index}`}>
                                    {issue.code}: {issue.message}
                                  </Text>
                                ))}
                              </BlockStack>
                            ) : null}
                            {xsdValidation.validation.valid && xsdValidation.validation.suppressedIssueCount ? (
                              <Text as="p" tone="subdued">
                                {xsdValidation.validation.compatibilityNotes?.[0]}
                              </Text>
                            ) : null}
                          </BlockStack>
                        </Banner>
                      ) : null}
                      <InlineStack align="space-between" blockAlign="end" gap="300">
                        <div className="period-select">
                          <Select
                            label={t("invoices.exportPeriod")}
                            value={invoicePeriod}
                            onChange={(value) => setInvoicePeriod(value as InvoicePeriod)}
                            options={[
                              { label: t("invoices.thisWeek"), value: "week" },
                              { label: t("invoices.thisMonth"), value: "month" },
                              { label: t("invoices.allDrafts"), value: "all" }
                            ]}
                          />
                        </div>
                        <InlineStack gap="200">
                          <Button onClick={loadInvoices} loading={invoicesLoading}>
                            {t("common.refresh")}
                          </Button>
                          <Button variant="primary" disabled={!invoices.length} onClick={downloadInvoiceZip}>
                            {t("invoices.downloadZip")}
                          </Button>
                        </InlineStack>
                      </InlineStack>
                      {invoicesLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel={t("invoices.loading")} size="small" />
                        </InlineStack>
                      ) : null}
                      {!invoicesLoading && invoices.length === 0 ? (
                        <div className="empty-state">
                          <Text as="h3" variant="headingMd">
                            {t("invoices.emptyTitle")}
                          </Text>
                          <Text as="p" tone="subdued">
                            {t("invoices.empty")}
                          </Text>
                        </div>
                      ) : null}
                      <BlockStack gap="300">
                        {invoices.map((invoice) => (
                          <div className="invoice-row" key={invoice.id}>
                            <InlineStack align="space-between" blockAlign="start" gap="300">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingMd">
                                    {invoice.orderName}
                                  </Text>
                                  <Badge tone={invoice.status === "draft" ? "info" : invoice.status === "exported" || invoice.status === "correction_needed" ? "attention" : "success"}>
                                    {invoice.status}
                                  </Badge>
                                  <Badge tone={invoice.fa3ValidationStatus === "valid" ? "success" : invoice.fa3ValidationStatus === "invalid" ? "critical" : "attention"}>
                                    {invoice.fa3ValidationStatus === "valid"
                                      ? t("invoices.validationValid")
                                      : invoice.fa3ValidationStatus === "invalid"
                                        ? t("invoices.validationInvalid")
                                        : t("invoices.validationRequired")}
                                  </Badge>
                                  {invoice.submission ? <Badge tone="info">{invoice.submission.mode}</Badge> : null}
                                  {invoice.correctionOf ? <Badge tone="attention">{t("invoices.correction")}</Badge> : null}
                                </InlineStack>
                                <Text as="p" tone="subdued">
                                  {invoice.buyerName} - NIP {invoice.nip} - {Number(invoice.totalGross).toFixed(2)} PLN
                                </Text>
                                {invoice.ksefNumber ? (
                                  <Text as="p" tone="success">
                                    {t("invoices.ksefApproved", { number: invoice.ksefNumber })}
                                  </Text>
                                ) : null}
                                {invoice.correctionOf ? (
                                  <Text as="p" tone="subdued">
                                    {t("invoices.correctionOf", { id: invoice.correctionOf.slice(0, 8) })}
                                  </Text>
                                ) : null}
                                {invoice.submission?.invoiceReferenceNumber ? (
                                  <Text as="p" tone="subdued">
                                    {t("invoices.invoiceReference", { number: invoice.submission.invoiceReferenceNumber })}
                                  </Text>
                                ) : null}
                                {invoice.upoStatus ? (
                                  <Text as="p" tone="subdued">
                                    {t("invoices.upoStatus", { status: invoice.upoStatus })}
                                  </Text>
                                ) : null}
                                {invoice.fa3ValidatedAt && invoice.fa3ValidationStatus === "valid" ? (
                                  <Text as="p" tone="subdued">
                                    {t("invoices.validatedAt", { date: new Date(invoice.fa3ValidatedAt).toLocaleString(locale) })}
                                  </Text>
                                ) : null}
                                {invoice.fa3ValidationError ? (
                                  <Text as="p" tone="critical">
                                    {invoice.fa3ValidationError}
                                  </Text>
                                ) : null}
                                {invoice.submission?.lastError ? (
                                  <Text as="p" tone="critical">
                                    {invoice.submission.lastError}
                                  </Text>
                                ) : null}
                                {invoice.lastError && !invoice.submission?.lastError && invoice.lastError !== invoice.fa3ValidationError ? (
                                  <Text as="p" tone={invoice.status === "correction_needed" ? "subdued" : "critical"}>
                                    {invoice.lastError}
                                  </Text>
                                ) : null}
                                <Text as="p" tone="subdued">
                                  {t("invoices.createdLine", {
                                    date: new Date(invoice.createdAt).toLocaleString(locale),
                                    count: invoice.itemCount
                                  })}
                                </Text>
                              </BlockStack>
                              <InlineStack gap="200">
                                <Button loading={validatingInvoiceId === invoice.id} onClick={() => validateInvoice(invoice)}>
                                  {t("invoices.validate")}
                                </Button>
                                <Button
                                  variant="primary"
                                  disabled={
                                    Boolean(invoice.ksefNumber) ||
                                    liveSubmissionBlocked ||
                                    invoice.fa3ValidationStatus !== "valid"
                                  }
                                  loading={submittingInvoiceId === invoice.id}
                                  onClick={() => submitInvoice(invoice)}
                                >
                                  {invoice.ksefNumber ? t("invoices.submitted") : t("invoices.submit", { mode: submissionModeLabel })}
                                </Button>
                                {invoice.submission?.mode === "live" && invoice.submission.invoiceReferenceNumber ? (
                                  <Button
                                    loading={refreshingStatusInvoiceId === invoice.id}
                                    onClick={() => refreshKsefStatus(invoice)}
                                  >
                                    {t("invoices.refreshStatus")}
                                  </Button>
                                ) : null}
                                {invoice.hasUpo ? (
                                  <Button onClick={() => downloadInvoiceUpo(invoice)}>{t("invoices.downloadUpo")}</Button>
                                ) : null}
                                {!invoice.correctionOf ? (
                                  <Button loading={correctingInvoiceId === invoice.id} onClick={() => createCorrection(invoice)}>
                                    {t("invoices.createCorrection")}
                                  </Button>
                                ) : null}
                                <Button onClick={() => previewInvoice(invoice)}>{t("invoices.previewXml")}</Button>
                                <Button onClick={() => downloadInvoicePdf(invoice)}>{t("invoices.downloadPdf")}</Button>
                                <Button variant="primary" onClick={() => downloadInvoice(invoice)}>
                                  {t("invoices.downloadXml")}
                                </Button>
                              </InlineStack>
                            </InlineStack>
                          </div>
                        ))}
                      </BlockStack>
                      {xmlPreview ? (
                        <div className="xml-preview">
                          <InlineStack align="space-between" blockAlign="center">
                            <Text as="h3" variant="headingMd">
                              {xmlPreview.title}
                            </Text>
                            <Button onClick={() => setXmlPreview(null)}>{t("common.closePreview")}</Button>
                          </InlineStack>
                          <pre>{xmlPreview.xml}</pre>
                        </div>
                      ) : null}
                    </BlockStack>
                  ) : null}

                  {view === "queue" ? (
                    <BlockStack gap="400">
                      <Banner tone="info">{t("queue.help")}</Banner>
                      {automationHealth ? (
                        <div className="automation-health">
                          <InlineStack align="space-between" blockAlign="center" gap="300">
                            <BlockStack gap="100">
                              <Text as="h3" variant="headingMd">
                                {t("queue.automationTitle")}
                              </Text>
                              <Text as="p" tone="subdued">
                                {t("queue.automationDescription")}
                              </Text>
                            </BlockStack>
                            <Badge
                              tone={
                                automationHealth.workerSecretConfigured || !automationHealth.productionRequiresWorkerSecret
                                  ? "success"
                                  : "critical"
                              }
                            >
                              {automationHealth.workerSecretConfigured
                                ? t("queue.workerSecured")
                                : t("queue.workerSecretMissing")}
                            </Badge>
                          </InlineStack>
                          <div className="automation-grid">
                            <div className="automation-item">
                              <span>{t("queue.liveSubmission")}</span>
                              <strong>{automationHealth.liveSubmissionEnabled ? t("settings.enabled") : t("settings.disabled")}</strong>
                            </div>
                            <div className="automation-item">
                              <span>{t("queue.dueRetries")}</span>
                              <strong>{automationHealth.dueRetries}</strong>
                            </div>
                            <div className="automation-item">
                              <span>{t("queue.pendingRefreshes")}</span>
                              <strong>{automationHealth.pendingStatusRefreshes}</strong>
                            </div>
                            <div className="automation-item">
                              <span>{t("queue.failedSubmissions")}</span>
                              <strong>{automationHealth.failedSubmissions}</strong>
                            </div>
                          </div>
                          <Text as="p" tone="subdued">
                            {t("queue.workerEndpoints", {
                              retry: automationHealth.retryEndpoint,
                              refresh: automationHealth.statusRefreshEndpoint
                            })}
                          </Text>
                        </div>
                      ) : null}
                      {queueError ? <Banner tone="critical">{queueError}</Banner> : null}
                      {queue ? (
                        <div className="queue-summary">
                          {(["total", "processing", "retrying", "failed", "submitted"] as const).map((key) => (
                            <div className="queue-summary-item" key={key}>
                              <span>{t(`queue.summary.${key}`)}</span>
                              <strong>{queue.summary[key]}</strong>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <InlineStack align="space-between" blockAlign="end" gap="300">
                        <div className="period-select">
                          <Select
                            label={t("queue.filter")}
                            value={queueStatus}
                            onChange={(value) => setQueueStatus(value as QueueStatus)}
                            options={[
                              { label: t("queue.status.all"), value: "all" },
                              { label: t("queue.status.pending"), value: "pending" },
                              { label: t("queue.status.processing"), value: "processing" },
                              { label: t("queue.status.retrying"), value: "retrying" },
                              { label: t("queue.status.submitted"), value: "submitted" },
                              { label: t("queue.status.failed"), value: "failed" }
                            ]}
                          />
                        </div>
                        <Button onClick={loadQueue} loading={queueLoading}>
                          {t("common.refresh")}
                        </Button>
                      </InlineStack>
                      {queueLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel={t("queue.loading")} size="small" />
                        </InlineStack>
                      ) : null}
                      {!queueLoading && queue?.submissions.length === 0 ? (
                        <div className="empty-state">
                          <Text as="h3" variant="headingMd">
                            {t("queue.emptyTitle")}
                          </Text>
                          <Text as="p" tone="subdued">
                            {t("queue.empty")}
                          </Text>
                        </div>
                      ) : null}
                      <BlockStack gap="300">
                        {queue?.submissions.map((submission) => (
                          <div className="queue-row" key={submission.id}>
                            <InlineStack align="space-between" blockAlign="start" gap="300">
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="h3" variant="headingMd">
                                    {submission.invoice.orderName}
                                  </Text>
                                  <Badge tone={submission.status === "submitted" ? "success" : submission.status === "failed" ? "critical" : "attention"}>
                                    {t(`queue.status.${submission.status}`, { defaultValue: submission.status })}
                                  </Badge>
                                  <Badge tone="info">{submission.mode}</Badge>
                                </InlineStack>
                                <Text as="p" tone="subdued">
                                  {submission.invoice.buyerName} - NIP {submission.invoice.nip} -{" "}
                                  {Number(submission.invoice.totalGross).toFixed(2)} PLN
                                </Text>
                                <Text as="p" tone="subdued">
                                  {t("queue.createdLine", {
                                    date: new Date(submission.createdAt).toLocaleString(locale),
                                    attempts: submission.attempts
                                  })}
                                </Text>
                                {submission.nextRetryAt ? (
                                  <Text as="p" tone="subdued">
                                    {t("queue.nextRetry", { date: new Date(submission.nextRetryAt).toLocaleString(locale) })}
                                  </Text>
                                ) : null}
                                {submission.invoiceReferenceNumber ? (
                                  <Text as="p" tone="subdued">
                                    {t("invoices.invoiceReference", { number: submission.invoiceReferenceNumber })}
                                  </Text>
                                ) : null}
                                {submission.ksefNumber || submission.invoice.ksefNumber ? (
                                  <Text as="p" tone="success">
                                    {t("invoices.ksefApproved", { number: submission.ksefNumber ?? submission.invoice.ksefNumber })}
                                  </Text>
                                ) : null}
                                {submission.lastError ? (
                                  <Text as="p" tone="critical">
                                    {submission.lastError}
                                  </Text>
                                ) : null}
                              </BlockStack>
                              <InlineStack gap="200">
                                {submission.mode === "live" && submission.invoiceReferenceNumber ? (
                                  <Button loading={queueActionId === submission.id} onClick={() => refreshQueueStatus(submission)}>
                                    {t("invoices.refreshStatus")}
                                  </Button>
                                ) : null}
                                {submission.status === "failed" || submission.status === "retrying" ? (
                                  <Button
                                    variant="primary"
                                    loading={queueActionId === submission.id}
                                    disabled={liveSubmissionBlocked && submission.mode === "live"}
                                    onClick={() => retryQueueSubmission(submission)}
                                  >
                                    {t("queue.retryNow")}
                                  </Button>
                                ) : null}
                              </InlineStack>
                            </InlineStack>
                          </div>
                        ))}
                      </BlockStack>
                    </BlockStack>
                  ) : null}

                  {view === "billing" ? (
                    <BlockStack gap="400">
                      {billingError ? <Banner tone="critical">{billingError}</Banner> : null}
                      <Banner tone="info">{t("billing.managed")}</Banner>
                      {billing ? (
                        <div className="billing-summary">
                          <BlockStack gap="100">
                            <Text as="h3" variant="headingMd">
                              {currentPlanName}
                            </Text>
                            <Text as="p" tone="subdued">
                              {t("common.status")}: {billing.billingStatus}
                            </Text>
                          </BlockStack>
                          <strong>
                            {billing.limit === null
                              ? t("billing.usedUnlimited", { used: billing.used })
                              : t("billing.usedLimited", { used: billing.used, limit: billing.limit })}
                          </strong>
                          <Button variant="primary" onClick={openManagedPricing}>
                            {t("billing.manage")}
                          </Button>
                        </div>
                      ) : null}
                      {billingLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel={t("billing.loadError")} size="small" />
                        </InlineStack>
                      ) : null}
                      <div className="plan-grid">
                        {planCards.map(([handle, name, price, limit]) => (
                          <div className="plan-card" key={handle}>
                            <BlockStack gap="300">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="h3" variant="headingMd">
                                  {name}
                                </Text>
                                {billing?.plan === handle ? <Badge tone="success">{t("common.current")}</Badge> : null}
                              </InlineStack>
                              <Text as="p" variant="headingLg">
                                {price}
                              </Text>
                              <Text as="p" tone="subdued">
                                {limit}
                              </Text>
                              <Button
                                variant={billing?.plan === handle ? "secondary" : "primary"}
                                disabled={!billing?.managedPricingUrl}
                                loading={billingLoading}
                                onClick={openManagedPricing}
                              >
                                {billing?.plan === handle ? t("billing.currentInShopify") : t("billing.manageInShopify")}
                              </Button>
                            </BlockStack>
                          </div>
                        ))}
                      </div>
                    </BlockStack>
                  ) : null}
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    </>
  );
}
