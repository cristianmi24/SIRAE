import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import "./styles/index.css";
import { applyStoredTheme } from "./lib/ui-hooks";

applyStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.DEV) {
  // En desarrollo no se usa service worker: se quitan los registrados antes y sus cachés,
  // porque servían módulos viejos y mezclaban versiones de React.
  void navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())));
  if ("caches" in window) void caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("aulanexo-")).map((key) => caches.delete(key))));
} else if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // La app sigue siendo funcional en navegador sin soporte de PWA.
    });
  }, { once: true });
}
