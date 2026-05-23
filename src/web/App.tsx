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

type View = "orders" | "invoices" | "settings" | "billing";
type InvoicePeriod = "week" | "month" | "all";

interface SettingsState {
  sellerNip: string;
  sellerName: string;
  sellerAddress: string;
  placeOfIssue: string;
}

interface OrderRow {
  id: string;
  name: string;
  createdAt: string;
  currency: string;
  totalGross: number;
  buyerName: string;
  buyerNip: string;
  isB2b: boolean;
  processed: boolean;
  invoiceStatus?: string;
  ksefNumber?: string;
}

interface InvoiceRow {
  id: string;
  orderName: string;
  buyerName: string;
  nip: string;
  status: string;
  ksefNumber?: string;
  totalGross: string | number;
  createdAt: string;
  itemCount: number;
}

function currencyWarning(order: OrderRow) {
  return order.currency === "PLN"
    ? ""
    : `Dev mode: this ${order.currency} test order will be drafted as PLN for FA(3) XML.`;
}

function useShop() {
  return useMemo(() => new URLSearchParams(window.location.search).get("shop") ?? "", []);
}

function isInstallError(message: string) {
  return message.toLowerCase().includes("shop is not installed");
}

export function App() {
  const { t } = useTranslation();
  const shop = useShop();
  const [view, setView] = useState<View>("orders");
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<SettingsState>({
    sellerNip: "",
    sellerName: "",
    sellerAddress: "",
    placeOfIssue: ""
  });
  const [saving, setSaving] = useState(false);
  const [connectionState, setConnectionState] = useState<"unknown" | "connected" | "error">("unknown");
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

    const result = (await response.json()) as SettingsState & { connected: boolean; hasToken: boolean };
    setSettings({
      sellerNip: result.sellerNip ?? "",
      sellerName: result.sellerName ?? "",
      sellerAddress: result.sellerAddress ?? "",
      placeOfIssue: result.placeOfIssue ?? ""
    });
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
        throw new Error(payload.error ?? "Could not load draft invoices.");
      }

      const result = (await response.json()) as { invoices: InvoiceRow[] };
      setInvoices(result.invoices);
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not load draft invoices.");
    } finally {
      setInvoicesLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, [shop]);

  useEffect(() => {
    void loadOrders();
  }, [shop, onlyUnprocessedB2b]);

  useEffect(() => {
    if (view === "invoices") {
      void loadInvoices();
    }
  }, [shop, invoicePeriod, view]);

  async function saveToken() {
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
          token: token || undefined,
          ...settings
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? t("settings.saveError"));
      }

      const result = (await response.json()) as { connected: boolean };
      setConnectionState(result.connected ? "connected" : "unknown");
      setToken("");
      setSettingsMessage(t(result.connected ? "settings.connectedSaved" : "settings.saved"));
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
        const message = ((await response.json()) as { error?: string }).error ?? "Invoice generation failed";
        throw new Error(message);
      }

      const result = (await response.json()) as { invoice: { id: string; orderName: string; status: string } };
      updateOrder(order.id, { processed: true, invoiceStatus: result.invoice.status });
      setLastInvoice(t("orders.invoiceCreated", { orderName: result.invoice.orderName }));
      void loadInvoices();
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : t("orders.generateError"));
    } finally {
      setActionOrderId(null);
    }
  }

  async function generateReadyDrafts() {
    const readyOrders = orders.filter(
      (order) => order.isB2b && !order.processed && order.buyerNip.replace(/\D/g, "").length === 10
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
          const message = ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Invoice generation failed";
          throw new Error(`${order.name}: ${message}`);
        }

        const result = (await response.json()) as { invoice: { status: string } };
        updateOrder(order.id, { processed: true, invoiceStatus: result.invoice.status });
        created += 1;
      }

      setLastInvoice(`${created} draft invoice${created === 1 ? "" : "s"} created.`);
      void loadInvoices();
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
        throw new Error(payload.error ?? "Could not open invoice XML.");
      }

      const result = (await response.json()) as { invoice: InvoiceRow & { fa3Xml: string } };
      setXmlPreview({ title: `${invoice.orderName} FA(3) XML`, xml: result.invoice.fa3Xml });
    } catch (error) {
      setInvoiceError(error instanceof Error ? error.message : "Could not open invoice XML.");
    }
  }

  function downloadInvoice(invoice: InvoiceRow) {
    window.open(apiPath(`/api/invoices/${invoice.id}/xml`), "_blank");
  }

  function downloadInvoiceZip() {
    window.open(apiPath(`/api/invoices/export.zip?period=${invoicePeriod}`), "_blank");
  }

  const tabs = [
    { id: "orders", content: t("nav.orders") },
    { id: "invoices", content: "Invoices" },
    { id: "settings", content: t("nav.settings") },
    { id: "billing", content: t("nav.billing") }
  ];
  const selectedTab = tabs.findIndex((tab) => tab.id === view);
  const b2bCount = orders.filter((order) => order.isB2b).length;
  const draftCount = orders.filter((order) => order.invoiceStatus === "draft").length;
  const readyCount = orders.filter((order) => order.isB2b && !order.processed).length;
  const readyVisibleCount = orders.filter(
    (order) => order.isB2b && !order.processed && order.buyerNip.replace(/\D/g, "").length === 10
  ).length;

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
                  <span className={connectionState === "connected" ? "status-dot connected" : "status-dot"} />
                  {connectionState === "connected" ? t("settings.connected") : t("settings.notConnected")}
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
                              ? "Draft invoices"
                              : "Billing"}
                      </Text>
                      <Text as="p" tone="subdued">
                        {view === "orders"
                          ? t("orders.description")
                          : view === "invoices"
                            ? "Download XML one-by-one or export a weekly/monthly ZIP for accountant review."
                            : t("home.description")}
                      </Text>
                    </BlockStack>
                    <Badge tone={connectionState === "connected" ? "success" : "attention"}>
                      {connectionState === "connected" ? t("settings.connected") : t("settings.notConnected")}
                    </Badge>
                  </InlineStack>

                  {view === "settings" ? (
                    <BlockStack gap="300">
                      <Banner tone="info">{t("settings.safeTest")}</Banner>
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
                        <Button variant="primary" loading={saving} disabled={!shop} onClick={saveToken}>
                          {t("settings.save")}
                        </Button>
                        <Button disabled={!token || !shop} onClick={saveToken}>
                          {t("settings.test")}
                        </Button>
                      </InlineStack>
                    </BlockStack>
                  ) : null}

                  {view === "orders" ? (
                    <BlockStack gap="400">
                      <Banner tone="info">{t("orders.safeTest")}</Banner>
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
                            disabled={!readyVisibleCount}
                            loading={bulkGenerating}
                            onClick={generateReadyDrafts}
                          >
                            Generate ready drafts
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
                                  {new Date(order.createdAt).toLocaleDateString()} - {order.totalGross.toFixed(2)}{" "}
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
                            {currencyWarning(order) ? (
                              <Text as="p" tone="subdued">
                                {currencyWarning(order)}
                              </Text>
                            ) : null}
                            <InlineStack gap="200">
                              <Button loading={actionOrderId === order.id} onClick={() => saveFlag(order)}>
                                {t("orders.saveFlag")}
                              </Button>
                              <Button
                                variant="primary"
                                loading={actionOrderId === order.id}
                                disabled={!order.isB2b || order.processed || order.buyerNip.replace(/\D/g, "").length !== 10}
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
                      <Banner tone="info">
                        Drafts are local FA(3) XML files. Use this for weekly or monthly accountant review before any KSeF submission flow is enabled.
                      </Banner>
                      {invoiceError ? <Banner tone="critical">{invoiceError}</Banner> : null}
                      <InlineStack align="space-between" blockAlign="end" gap="300">
                        <div className="period-select">
                          <Select
                            label="Export period"
                            value={invoicePeriod}
                            onChange={(value) => setInvoicePeriod(value as InvoicePeriod)}
                            options={[
                              { label: "This week", value: "week" },
                              { label: "This month", value: "month" },
                              { label: "All drafts", value: "all" }
                            ]}
                          />
                        </div>
                        <InlineStack gap="200">
                          <Button onClick={loadInvoices} loading={invoicesLoading}>
                            Refresh
                          </Button>
                          <Button variant="primary" disabled={!invoices.length} onClick={downloadInvoiceZip}>
                            Download ZIP
                          </Button>
                        </InlineStack>
                      </InlineStack>
                      {invoicesLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel="Loading invoices" size="small" />
                        </InlineStack>
                      ) : null}
                      {!invoicesLoading && invoices.length === 0 ? (
                        <div className="empty-state">
                          <Text as="h3" variant="headingMd">
                            No draft invoices yet
                          </Text>
                          <Text as="p" tone="subdued">
                            Generate a draft from a B2B order, then come back here to inspect or export it.
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
                                  <Badge tone={invoice.status === "draft" ? "info" : "success"}>{invoice.status}</Badge>
                                </InlineStack>
                                <Text as="p" tone="subdued">
                                  {invoice.buyerName} - NIP {invoice.nip} - {Number(invoice.totalGross).toFixed(2)} PLN
                                </Text>
                                <Text as="p" tone="subdued">
                                  Created {new Date(invoice.createdAt).toLocaleString()} - {invoice.itemCount} line item
                                  {invoice.itemCount === 1 ? "" : "s"}
                                </Text>
                              </BlockStack>
                              <InlineStack gap="200">
                                <Button onClick={() => previewInvoice(invoice)}>Preview XML</Button>
                                <Button variant="primary" onClick={() => downloadInvoice(invoice)}>
                                  Download XML
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
                            <Button onClick={() => setXmlPreview(null)}>Close preview</Button>
                          </InlineStack>
                          <pre>{xmlPreview.xml}</pre>
                        </div>
                      ) : null}
                    </BlockStack>
                  ) : null}

                  {view === "billing" ? (
                    <InlineStack gap="200" wrap>
                      {[
                        "Free: 5 invoices/month",
                        "Basic $9.99: 50 invoices/month",
                        "Pro $19.99: 200 invoices/month",
                        "Unlimited $39.99"
                      ].map((tier) => (
                        <Badge key={tier}>{tier}</Badge>
                      ))}
                    </InlineStack>
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
