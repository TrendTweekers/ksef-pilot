import { useEffect } from "react";
import createApp from "@shopify/app-bridge";

export function AppBridgeBootstrap() {
  useEffect(() => {
    const host = new URLSearchParams(window.location.search).get("host");
    const apiKey = import.meta.env.VITE_SHOPIFY_API_KEY as string | undefined;

    if (!host || !apiKey) {
      return;
    }

    createApp({
      apiKey,
      host,
      forceRedirect: true
    });
  }, []);

  return null;
}
