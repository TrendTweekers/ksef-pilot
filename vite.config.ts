import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3000",
      "/auth": "http://localhost:3000"
    }
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          shopify: ["@shopify/app-bridge", "@shopify/app-bridge-react", "@shopify/polaris", "@shopify/polaris-icons"],
          i18n: ["i18next", "i18next-browser-languagedetector", "react-i18next"]
        }
      }
    }
  }
});
