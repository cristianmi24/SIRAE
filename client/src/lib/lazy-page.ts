import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "sirae:chunk-reload";

// Carga diferida tolerante a redes lentas y a nuevos despliegues:
// reintenta la descarga y, si el archivo ya no existe (versión nueva publicada),
// recarga la página una sola vez para traer la versión actual.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyPage<T extends ComponentType<any>>(loader: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await loader();
    } catch (first) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      try {
        return await loader();
      } catch {
        let lastReload = 0;
        try { lastReload = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0); } catch { /* sin almacenamiento */ }
        if (navigator.onLine && Date.now() - lastReload > 30_000) {
          try { window.sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* sin almacenamiento */ }
          window.location.reload();
          return new Promise<{ default: T }>(() => undefined);
        }
        throw first;
      }
    }
  });
}
