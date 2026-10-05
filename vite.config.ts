import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { lingui } from "@lingui/vite-plugin";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    tailwindcss(),
    lingui(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg", "pwa-maskable-512x512.png"],
      manifest: {
        name: "Web PWA for Opencode",
        short_name: "Opencode PWA",
        description: "Installable multi-server client for Opencode V2 API",
        theme_color: "#1d232a",
        background_color: "#1d232a",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "pwa-icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webmanifest}"],
        // SPA offline fallback: navigation requests serve the cached app
        // shell (index.html) so the app boots offline. API calls are
        // deliberately NOT cached here (NetworkOnly below); session messages
        // fall back to the IndexedDB cache in useSessionMessages instead.
        navigateFallback: "index.html",
        runtimeCaching: [
          {
            urlPattern: /\/api\/.*/i,
            handler: "NetworkOnly",
            method: "GET",
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
