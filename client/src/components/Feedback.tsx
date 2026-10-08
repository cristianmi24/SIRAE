import { AlertCircle, CheckCircle2, Download, Printer, X } from "lucide-react";
import type { ReactNode } from "react";
import type { QrDelivery } from "../services/api";
import { useDialogBehavior } from "../lib/ui-hooks";
import { BrandLoader } from "./Loading";

export function LoadingState({ label = "Cargando información…" }: { label?: string }) {
  return <BrandLoader label={label} />;
}

export function ErrorPanel({ title = "No fue posible cargar la información", detail }: { title?: string; detail?: string }) {
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {detail ? <p>{detail}</p> : null}
      </div>
    </div>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-info">
      <CheckCircle2 size={20} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

export function StatusChip({ status }: { status: "ACTIVO" | "INACTIVO" | "ADMIN" | "DOCENTE" }) {
  const label = status === "ACTIVO" ? "Activo" : status === "INACTIVO" ? "Inactivo" : status === "ADMIN" ? "Administrador" : "Docente";
  return <span className={`status-chip status-${status.toLowerCase()}`}>{label}</span>;
}

export function QrDialog({
  result,
  studentName,
  code,
  onClose,
}: {
  code?: string;
  result: QrDelivery;
  studentName: string;
  onClose: () => void;
}) {
  const dialogRef = useDialogBehavior(onClose);
  const download = () => {
    const link = document.createElement("a");
    link.href = result.dataUrl;
    link.download = `QR-${studentName.replace(/\s+/g, "-").toLowerCase()}-v${result.version}.png`;
    link.click();
  };

  const print = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    const safeName = studentName.replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    })[character] || character);
    printWindow.document.write(`<!doctype html><html lang="es"><head><title>QR — ${safeName}</title><style>body{font-family:Arial,sans-serif;padding:32px;text-align:center;color:#173F5F}img{width:360px;max-width:100%;margin:24px auto;display:block}p{color:#334155}</style></head><body><h1>${safeName}</h1><p>QR de asistencia · versión ${result.version}</p><img src="${result.dataUrl}" alt="Código QR de ${safeName}" /><script>window.onload=()=>window.print()</script></body></html>`);
    printWindow.document.close();
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section ref={dialogRef} className="qr-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-dialog-title">
        <button type="button" className="icon-button" onClick={onClose} aria-label="Cerrar QR" title="Cerrar (Esc)">
          <X size={20} />
        </button>
        <div className="eyebrow">QR seguro generado</div>
        <h2 id="qr-dialog-title">{studentName}</h2>
        {code && <p className="qr-code-line">Código de asistencia: <strong className="code-tag">{code}</strong></p>}
        <img className="qr-image" src={result.dataUrl} alt={`Código QR de ${studentName}`} />
        <p className="helper-text">{result.oneTimeNotice}</p>
        <div className="dialog-actions">
          <button type="button" className="button button-secondary" onClick={download}>
            <Download size={17} /> Descargar PNG
          </button>
          <button type="button" className="button button-primary" onClick={print}>
            <Printer size={17} /> Imprimir QR
          </button>
        </div>
      </section>
    </div>
  );
}
