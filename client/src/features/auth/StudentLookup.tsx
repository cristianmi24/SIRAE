import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Camera, CameraOff, Search } from "lucide-react";
import { api, type StudentSelfReportDto } from "../../services/api";
import { useQrScanner } from "../../lib/use-qr-scanner";
import { CameraIndicator } from "../../components/CameraIndicator";

const QR_PREFIX = "aulanexo:student:v1:";
async function sha256(text: string) { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)); return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join(""); }

// El estudiante consulta su historial con su código único o escaneando su QR. No necesita cuenta.
export function StudentLookup({ onReport }: { onReport: (report: StudentSelfReportDto) => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const lookup = useMutation({ mutationFn: api.getStudentSelfReport, onSuccess: onReport, onError: (e) => setError(e instanceof Error ? e.message : "No se pudo consultar.") });
  // La cámara se apaga apenas lee el QR.
  const scanner = useQrScanner((text) => {
    if (!text.startsWith(QR_PREFIX)) { setError("Ese QR no es un código de estudiante de SIRAE."); return; }
    void sha256(text).then((tokenHash) => lookup.mutate({ tokenHash }));
  }, { stopOnRead: true });
  const message = error || scanner.error;
  return <div className="student-lookup">
    <form className="compact-form" onSubmit={(e) => { e.preventDefault(); setError(""); lookup.mutate({ code }); }}>
      <label className="form-field"><span>Tu código</span><input className="code-input" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "")); setError(""); }} maxLength={12} placeholder="ABC123" autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(error)} /></label>
      <button className="button button-primary button-wide" disabled={lookup.isPending || code.length < 3}><Search size={18} /> {lookup.isPending ? "Buscando…" : "Ver mi historial"}</button>
    </form>
    <div className="lookup-divider"><span>o</span></div>
    <div className="lookup-camera" hidden={!scanner.active}><video ref={scanner.videoRef} muted playsInline aria-label="Cámara para leer tu código QR" /></div>
    {scanner.active && <CameraIndicator onStop={scanner.stop} />}
    {scanner.active ? <button type="button" className="button button-secondary button-wide" onClick={scanner.stop}><CameraOff size={18} /> Apagar cámara</button>
      : <button type="button" className="button button-secondary button-wide" onClick={() => { setError(""); void scanner.start(); }} disabled={lookup.isPending}><Camera size={18} /> Escanear mi QR</button>}
    {!scanner.active && <p className="helper-text camera-note">La cámara solo se enciende cuando la activas y se apaga sola al leer el código.</p>}
    {message && <p className="notice notice-error" role="alert">{message}</p>}
  </div>;
}
