import { useMemo, useState } from "react";
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Frame,
  InlineStack,
  Layout,
  Navigation,
  Page,
  Text,
  TextField
} from "@shopify/polaris";
import { HomeIcon, OrderIcon, SettingsIcon, ReceiptDollarIcon } from "@shopify/polaris-icons";
import { useTranslation } from "react-i18next";
import { AppBridgeBootstrap } from "./components/AppBridgeBootstrap";

type View = "orders" | "settings" | "billing";

function useShop() {
  return useMemo(() => new URLSearchParams(window.location.search).get("shop") ?? "", []);
}

export function App() {
  const { t } = useTranslation();
  const shop = useShop();
  const [view, setView] = useState<View>("settings");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [connectionState, setConnectionState] = useState<"unknown" | "connected" | "error">("unknown");

  async function saveToken() {
    setSaving(true);
    try {
      const response = await fetch(`/api/ksef/settings?shop=${encodeURIComponent(shop)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      if (!response.ok) {
        throw new Error("Token save failed");
      }

      const result = (await response.json()) as { connected: boolean };
      setConnectionState(result.connected ? "connected" : "error");
    } catch {
      setConnectionState("error");
    } finally {
      setSaving(false);
    }
  }

  const navigationMarkup = (
    <Navigation location="/">
      <Navigation.Section
        items={[
          {
            label: t("home.title"),
            icon: HomeIcon,
            selected: false,
            onClick: () => setView("settings")
          },
          {
            label: t("nav.orders"),
            icon: OrderIcon,
            selected: view === "orders",
            onClick: () => setView("orders")
          },
          {
            label: t("nav.settings"),
            icon: SettingsIcon,
            selected: view === "settings",
            onClick: () => setView("settings")
          },
          {
            label: t("nav.billing"),
            icon: ReceiptDollarIcon,
            selected: view === "billing",
            onClick: () => setView("billing")
          }
        ]}
      />
    </Navigation>
  );

  return (
    <Frame navigation={navigationMarkup}>
      <AppBridgeBootstrap />
      <Page title={t("home.title")} subtitle={t("home.tagline")}>
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingMd">
                      {view === "settings" ? t("settings.title") : view === "orders" ? t("orders.title") : "Billing"}
                    </Text>
                    <Text as="p" tone="subdued">
                      {t("home.description")}
                    </Text>
                  </BlockStack>
                  <Badge tone={connectionState === "connected" ? "success" : "attention"}>
                    {connectionState === "connected" ? t("settings.connected") : t("settings.notConnected")}
                  </Badge>
                </InlineStack>

                {view === "settings" ? (
                  <BlockStack gap="300">
                    <TextField
                      label={t("settings.tokenLabel")}
                      value={token}
                      onChange={setToken}
                      type="password"
                      autoComplete="off"
                      helpText={t("settings.tokenHelp")}
                    />
                    <InlineStack gap="200">
                      <Button variant="primary" loading={saving} disabled={!token || !shop} onClick={saveToken}>
                        {t("settings.save")}
                      </Button>
                      <Button disabled={!token || !shop} onClick={saveToken}>
                        {t("settings.test")}
                      </Button>
                    </InlineStack>
                  </BlockStack>
                ) : null}

                {view === "orders" ? (
                  <BlockStack gap="300">
                    <InlineStack align="space-between">
                      <Text as="p">{t("orders.empty")}</Text>
                      <Badge>{t("orders.filter")}</Badge>
                    </InlineStack>
                  </BlockStack>
                ) : null}

                {view === "billing" ? (
                  <InlineStack gap="200" wrap>
                    {["Free: 5 invoices/month", "Basic $9.99: 50 invoices/month", "Pro $19.99: 200 invoices/month", "Unlimited $39.99"].map(
                      (tier) => (
                        <Badge key={tier}>{tier}</Badge>
                      )
                    )}
                  </InlineStack>
                ) : null}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    </Frame>
  );
}
