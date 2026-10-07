import { StrictMode } from "react";
// MUST be the first import: activates the locale before the shell evaluates.
import "./logic/I18nProvider.tsx";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";
import { I18nProvider } from "./logic/I18nProvider.tsx";
import { ServerProvider } from "./state/servers.tsx";
import { SessionTabsProvider } from "./state/sessionTabs.tsx";

registerSW({ immediate: true });

const rootElement = document.getElementById("root");
if (rootElement === null) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <ServerProvider>
        <SessionTabsProvider>
          <App />
        </SessionTabsProvider>
      </ServerProvider>
    </I18nProvider>
  </StrictMode>,
);
