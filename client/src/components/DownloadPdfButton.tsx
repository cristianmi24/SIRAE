import { useState } from "react";
import { Download } from "lucide-react";

// Descarga un PDF generado por el servidor (archivo real, no impresión de pantalla).
export function DownloadPdfButton({ onDownload, label = "Descargar PDF" }: { onDownload: () => Promise<void>; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <span className="download-pdf">
    <button className="button button-primary" disabled={busy} onClick={() => { setBusy(true); setError(""); void onDownload().catch((e) => setError(e instanceof Error ? e.message : "No se pudo generar el PDF.")).finally(() => setBusy(false)); }}>
      <Download size={17} /> {busy ? "Generando PDF…" : label}
    </button>
    {error && <small className="download-error" role="alert">{error}</small>}
  </span>;
}
