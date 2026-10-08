import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { AlertTriangle, Copy, Link2, Lock } from "lucide-react";
import { api } from "../../services/api";

const alertLabel = { DEVICE_BLOCKED: "Dispositivo bloqueado", CODE_INVALID: "Código incorrecto", ALREADY_REGISTERED: "Código ya usado" } as const;

function useCountdown(target?: string) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  if (!target) return "";
  const left = Math.max(0, new Date(target).getTime() - now);
  return `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")}`;
}

// Registro por código: el docente habilita un enlace por unos minutos; cada estudiante entra con su código.
export function CodeLinkPanel({ sessionId, open, clock, onMessage }: { sessionId: string; open: boolean; clock: (iso?: string) => string; onMessage: (m: { tone: "info" | "success" | "error"; text: string }) => void }) {
  const client = useQueryClient();
  const [minutes, setMinutes] = useState("20");
  const [autoClose, setAutoClose] = useState(true);
  const [qr, setQr] = useState("");
  const link = useQuery({ queryKey: ["attendanceLink", sessionId], queryFn: () => api.getAttendanceLink(sessionId), refetchInterval: 4000 });
  const item = link.data?.item;
  const url = item?.token ? `${window.location.origin}/asistencia/${item.token}` : "";
  const countdown = useCountdown(item?.state === "ACTIVE" ? item.expiresAt : undefined);
  useEffect(() => { if (url) void QRCode.toDataURL(url, { margin: 1, width: 240 }).then(setQr).catch(() => setQr("")); else setQr(""); }, [url]);
  useEffect(() => { if (item?.sessionState === "CLOSED") void client.invalidateQueries({ queryKey: ["sessions"] }); }, [item?.sessionState, client]);
  const refresh = async () => { await client.invalidateQueries({ queryKey: ["attendanceLink", sessionId] }); await client.invalidateQueries({ queryKey: ["roster", sessionId] }); };
  const fail = (fallback: string) => (error: unknown) => onMessage({ tone: "error", text: error instanceof Error ? error.message : fallback });
  const start = useMutation({ mutationFn: () => api.openAttendanceLink(sessionId, { minutes: Number(minutes), autoClose }), onSuccess: async () => { onMessage({ tone: "success", text: `Registro por código abierto durante ${minutes} minutos.` }); await refresh(); }, onError: fail("No se pudo abrir el registro.") });
  const stop = useMutation({ mutationFn: () => api.closeAttendanceLink(sessionId), onSuccess: async () => { onMessage({ tone: "info", text: "Registro por código cerrado. Las pantallas de los estudiantes ya se liberaron." }); await refresh(); }, onError: fail("No se pudo cerrar el registro.") });

  if (link.isLoading) return <p className="helper-text">Cargando…</p>;
  if (item?.state === "ACTIVE") return <div className="code-link">
    <div className="code-link-head"><span className="status-chip status-activo">Abierto</span><strong className="code-countdown" aria-live="off">{countdown}</strong><span className="helper-text">{item.registered} {item.registered === 1 ? "registro" : "registros"}</span></div>
    <div className="code-link-body">
      {qr && <img className="code-link-qr" src={qr} alt="Código QR del enlace de asistencia" />}
      <div>
        <p className="helper-text">Comparte el enlace o deja que escaneen este QR. Cada estudiante escribe su código; cada código y cada dispositivo sirven una sola vez en esta clase.</p>
        <div className="code-link-url"><Link2 size={15} aria-hidden="true" /><input readOnly value={url} aria-label="Enlace de asistencia" onFocus={(e) => e.currentTarget.select()} /><button className="icon-only" title="Copiar enlace" aria-label="Copiar enlace" onClick={() => void navigator.clipboard?.writeText(url).then(() => onMessage({ tone: "success", text: "Enlace copiado." }))}><Copy size={15} /></button></div>
        <p className="helper-text">Cierra a las {clock(item.expiresAt)}{item.autoClose ? " y la clase se cerrará sola (los que no se registraron quedan ausentes)." : "."}</p>
        <button className="button button-danger compact-button" onClick={() => stop.mutate()} disabled={stop.isPending}><Lock size={15} /> Terminar registro ahora</button>
      </div>
    </div>
    {item.alerts.length > 0 && <ul className="code-alerts">{item.alerts.map((a) => <li key={a.id}><AlertTriangle size={14} aria-hidden="true" /><strong>{alertLabel[a.kind]}</strong>{a.studentName && <> · {a.studentName}</>}<span>{clock(a.at)}</span></li>)}</ul>}
  </div>;

  return <form className="code-link code-link-setup" onSubmit={(e) => { e.preventDefault(); start.mutate(); }}>
    {item?.state === "EXPIRED" && <p className="helper-text">El último registro por código terminó con {item.registered} {item.registered === 1 ? "estudiante" : "estudiantes"}. Abre uno nuevo si lo necesitas.</p>}
    <p className="helper-text">Los estudiantes abren un enlace en su celular y escriben su código. Sin cámara, sin ubicación ni datos biométricos.</p>
    <div className="inline-form">
      <label className="form-field narrow-field"><span>Minutos</span><input type="number" inputMode="numeric" min="1" max="240" value={minutes} onChange={(e) => setMinutes(e.target.value)} required /></label>
      <label className="check-line"><input type="checkbox" checked={autoClose} onChange={(e) => setAutoClose(e.target.checked)} /> Cerrar la clase al terminar el tiempo</label>
      <button className="button button-primary" disabled={!open || start.isPending || !Number(minutes)}>{start.isPending ? "Abriendo…" : "Abrir registro por código"}</button>
    </div>
    {!open && <p className="helper-text">La clase está cerrada.</p>}
  </form>;
}
