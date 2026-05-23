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
  Spinner,
  Tabs,
  Text,
  TextField
} from "@shopify/polaris";
import { useTranslation } from "react-i18next";
import { AppBridgeBootstrap } from "./components/AppBridgeBootstrap";

type View = "orders" | "settings" | "billing";

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

function useShop() {
  return useMemo(() => new URLSearchParams(window.location.search).get("shop") ?? "", []);
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
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [onlyUnprocessedB2b, setOnlyUnprocessedB2b] = useState(false);
  const [orderError, setOrderError] = useState("");
  const [actionOrderId, setActionOrderId] = useState<string | null>(null);
  const [lastInvoice, setLastInvoice] = useState("");

  function apiPath(path: string) {
    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}shop=${encodeURIComponent(shop)}`;
  }

  function updateOrder(orderId: string, update: Partial<OrderRow>) {
    setOrders((current) => current.map((order) => (order.id === orderId ? { ...order, ...update } : order)));
  }

  async function loadSettings() {
    if (!shop) return;

    const response = await fetch(apiPath("/api/ksef/settings"));

    if (!response.ok) return;

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
    if (!shop) return;

    setOrdersLoading(true);
    setOrderError("");
    try {
      const response = await fetch(apiPath(`/api/orders?onlyUnprocessedB2b=${onlyUnprocessedB2b}`));

      if (!response.ok) {
        throw new Error("Order fetch failed");
      }

      const result = (await response.json()) as { orders: OrderRow[] };
      setOrders(result.orders);
    } catch {
      setOrderError(t("orders.loadError"));
    } finally {
      setOrdersLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, [shop]);

  useEffect(() => {
    void loadOrders();
  }, [shop, onlyUnprocessedB2b]);

  async function saveToken() {
    setSaving(true);
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
        throw new Error("Token save failed");
      }

      const result = (await response.json()) as { connected: boolean };
      setConnectionState(result.connected ? "connected" : "error");
      setToken("");
    } catch {
      setConnectionState("error");
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

      const result = (await response.json()) as { invoice: { orderName: string; status: string } };
      updateOrder(order.id, { processed: true, invoiceStatus: result.invoice.status });
      setLastInvoice(t("orders.invoiceCreated", { orderName: result.invoice.orderName }));
    } catch (error) {
      setOrderError(error instanceof Error ? error.message : t("orders.generateError"));
    } finally {
      setActionOrderId(null);
    }
  }

  const tabs = [
    { id: "orders", content: t("nav.orders") },
    { id: "settings", content: t("nav.settings") },
    { id: "billing", content: t("nav.billing") }
  ];
  const selectedTab = tabs.findIndex((tab) => tab.id === view);
  const b2bCount = orders.filter((order) => order.isB2b).length;
  const draftCount = orders.filter((order) => order.invoiceStatus === "draft").length;
  const readyCount = orders.filter((order) => order.isB2b && !order.processed).length;

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
                        {view === "settings" ? t("settings.title") : view === "orders" ? t("orders.title") : "Billing"}
                      </Text>
                      <Text as="p" tone="subdued">{view === "orders" ? t("orders.description") : t("home.description")}</Text>
                    </BlockStack>
                    <Badge tone={connectionState === "connected" ? "success" : "attention"}>
                      {connectionState === "connected" ? t("settings.connected") : t("settings.notConnected")}
                    </Badge>
                  </InlineStack>

                  {view === "settings" ? (
                    <BlockStack gap="300">
                      <Banner tone="info">{t("settings.safeTest")}</Banner>
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
                      {orderError ? <Banner tone="critical">{orderError}</Banner> : null}
                      {lastInvoice ? <Banner tone="success">{lastInvoice}</Banner> : null}
                      <InlineStack align="space-between" blockAlign="center">
                        <Checkbox
                          label={t("orders.filter")}
                          checked={onlyUnprocessedB2b}
                          onChange={setOnlyUnprocessedB2b}
                        />
                        <Button onClick={loadOrders} loading={ordersLoading}>
                          {t("orders.refresh")}
                        </Button>
                      </InlineStack>
                      {ordersLoading ? (
                        <InlineStack align="center">
                          <Spinner accessibilityLabel={t("orders.loading")} size="small" />
                        </InlineStack>
                      ) : null}
                      {!ordersLoading && orders.length === 0 ? <Text as="p">{t("orders.empty")}</Text> : null}
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
