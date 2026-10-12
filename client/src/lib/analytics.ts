import { useEffect } from "react";
import { useLocation } from "react-router-dom";

declare global { interface Window { gtag?: (...args: unknown[]) => void } }

// Las rutas con códigos o identificadores se envían sin ellos: el enlace público de asistencia
// y los perfiles de estudiantes no deben llegar a Google Analytics.
export function sanitizePath(pathname: string): string {
  return pathname
    .replace(/^\/asistencia\/[^/]+/, "/asistencia/:token")
    .replace(/^\/students\/(?!import$|codes$)[^/]+/, "/students/:id")
    .replace(/^\/reports\/(students|courses)\/[^/]+/, "/reports/$1/:id");
}

export function usePageViews(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    const path = sanitizePath(pathname);
    window.gtag?.("event", "page_view", { page_path: path, page_location: `${window.location.origin}${path}`, page_title: document.title });
  }, [pathname]);
}
