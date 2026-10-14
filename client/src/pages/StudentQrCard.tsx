import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer, QrCode } from "lucide-react";
import { api } from "../services/api";

const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);

// QR del estudiante dentro de su perfil: se ve, se descarga y se imprime cuando se necesite.
export function StudentQrCard({ studentId, name, code, active }: { studentId: string; name: string; code: string; active: boolean }) {
  const client = useQueryClient();
  const status = useQuery({ queryKey: ["studentQr", studentId], queryFn: () => api.getStudentQrStatus(studentId), enabled: active, staleTime: 60_000 });
  const generate = useMutation({
    mutationFn: () => api.regenerateStudentQr(studentId),
    onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["studentQr", studentId] }), client.invalidateQueries({ queryKey: ["student", studentId] })]); },
  });
  const data = status.data;
  const fileName = `QR-${name.replace(/\s+/g, "-").toLowerCase()}-${code}.png`;

  const download = () => {
    if (!data?.dataUrl) return;
    const link = document.createElement("a");
    link.href = data.dataUrl; link.download = fileName; link.click();
  };
  const print = () => {
    if (!data?.dataUrl) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;
    printWindow.opener = null;
    printWindow.document.write(`<!doctype html><title>QR ${escapeHtml(name)}</title><style>body{font-family:sans-serif;text-align:center;margin:40px}img{width:320px;height:320px}h1{font-size:22px;margin:0 0 4px}p{margin:0 0 16px;color:#526174}</style><h1>${escapeHtml(name)}</h1><p>Código: ${escapeHtml(code)}</p><img alt="QR de ${escapeHtml(name)}" src="${data.dataUrl}">`);
    printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  return <article className="content-card student-qr-card">
    <h2><QrCode size={18} aria-hidden="true" /> Código QR</h2>
    {!active ? <p className="helper-text">El estudiante está inactivo. Reactívalo para ver y emitir su QR.</p>
      : status.isLoading ? <p className="helper-text">Cargando el QR…</p>
      : status.error ? <p className="helper-text" role="alert">{status.error instanceof Error ? status.error.message : "No se pudo cargar el QR."}</p>
      : data?.available && data.dataUrl ? <div className="student-qr-body">
        <img className="student-qr-image" src={data.dataUrl} alt={`Código QR de ${name}`} />
        <div className="student-qr-side">
          <p className="helper-text">Muéstralo en pantalla o imprímelo. Cada vez que el estudiante lo presenta, la asistencia se registra en la clase que tengas abierta. Versión {data.qrVersion}.</p>
          <div className="dialog-actions" style={{ flexWrap: "wrap" }}>
            <button type="button" className="button button-primary" onClick={download}><Download size={17} aria-hidden="true" /> Descargar QR</button>
            <button type="button" className="button button-secondary" onClick={print}><Printer size={17} aria-hidden="true" /> Imprimir</button>
          </div>
        </div>
      </div>
      : <div>
        <p className="helper-text">{data?.message}</p>
        <button type="button" className="button button-primary" disabled={generate.isPending} onClick={() => { if (window.confirm("Se creará un QR nuevo y el QR impreso anterior dejará de funcionar. ¿Continuar?")) generate.mutate(); }}><QrCode size={17} aria-hidden="true" /> {generate.isPending ? "Generando…" : "Generar y mostrar QR"}</button>
        {generate.error && <p className="notice notice-error" role="alert">{generate.error instanceof Error ? generate.error.message : "No se pudo generar el QR."}</p>}
      </div>}
  </article>;
}
