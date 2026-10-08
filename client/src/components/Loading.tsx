import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

// Animación de carga con la marca. Si tarda, avisa que la conexión está lenta.
export function BrandLoader({ label, fullScreen = false }: { label: string; fullScreen?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => { const timer = window.setTimeout(() => setSlow(true), 5000); return () => window.clearTimeout(timer); }, []);
  return <div className={`brand-loader ${fullScreen ? "is-full" : ""}`} role="status" aria-live="polite">
    <div className="brand-loader-logo"><img src="/sirae-mark.webp" alt="" width={96} height={63} /><span className="brand-loader-ring" aria-hidden="true" /></div>
    <p className="brand-loader-label">{label}</p>
    <div className="brand-loader-bar" aria-hidden="true"><i /></div>
    {slow && <p className="brand-loader-slow">{navigator.onLine ? "La conexión está lenta. Seguimos intentando…" : "No hay conexión a internet. Seguiremos cuando vuelva."}</p>}
  </div>;
}

// Barra fina arriba mientras hay peticiones en curso (solo si tardan más de 300 ms).
export function TopProgress() {
  const busy = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 300);
    return () => window.clearTimeout(timer);
  }, [busy]);
  return visible ? <div className="top-progress" role="progressbar" aria-label="Cargando"><i /></div> : null;
}
