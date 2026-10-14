import { useCallback, useRef, useState } from "react";
import { CheckCircle2, ImageUp, ScanLine, XCircle } from "lucide-react";
import { CameraIdle, QrCameraView } from "../components/QrCameraView";
import { decodeQrFromImage, useQrScanner } from "../lib/use-qr-scanner";
import { ApiClientError, api } from "../services/api";

const PREFIX = "aulanexo:student:v1:";
async function hashPayload(payload: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

type Reading =
  | { ok: true; at: Date; name: string; code: string; course?: string; active: boolean }
  | { ok: false; at: Date; reason: string };

// Pitido corto y vibración al leer (como cualquier lector de QR del celular). Ambos son opcionales.
function feedback(ok: boolean) {
  try { navigator.vibrate?.(ok ? 60 : [80, 60, 80]); } catch { /* sin vibración */ }
  try {
    const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = ok ? 880 : 220; gain.gain.value = 0.08;
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + (ok ? 0.12 : 0.25));
    oscillator.onended = () => void context.close();
  } catch { /* sin audio */ }
}

// Lee el QR real de un estudiante y muestra su nombre y código, sin registrar asistencia.
export function StudentQrReader() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const lastRef = useRef({ payload: "", at: 0 });

  const handle = useCallback(async (payload: string) => {
    // La cámara lee varias veces por segundo: se ignora el mismo código durante 2 segundos.
    const now = Date.now();
    if (payload === lastRef.current.payload && now - lastRef.current.at < 2000) return;
    lastRef.current = { payload, at: now };
    let reading: Reading;
    if (!payload.startsWith(PREFIX) || payload.length > 160) {
      reading = { ok: false, at: new Date(), reason: "Este QR no es un código de estudiante de SIRAE." };
    } else {
      try {
        const { item } = await api.lookupStudentByQr(await hashPayload(payload));
        reading = { ok: true, at: new Date(), name: item.fullName, code: item.document, course: item.courseGroup ? item.courseGroup.label : undefined, active: item.status === "ACTIVO" };
      } catch (error) {
        reading = { ok: false, at: new Date(), reason: error instanceof ApiClientError || error instanceof Error ? error.message : "No se pudo consultar el QR." };
      }
    }
    feedback(reading.ok);
    setReadings((current) => [reading, ...current].slice(0, 8));
  }, []);

  const scanner = useQrScanner((text) => { void handle(text); });
  const [imageNotice, setImageNotice] = useState("");
  const fromImage = async (file?: File) => {
    if (!file) return;
    setImageNotice("Leyendo la imagen…");
    const text = await decodeQrFromImage(file);
    if (!text) { setImageNotice("No se encontró ningún QR en la imagen. Prueba con una foto más nítida y de frente."); return; }
    setImageNotice(""); lastRef.current = { payload: "", at: 0 }; await handle(text);
  };
  const latest = readings[0];

  return <>
    <p className="notice notice-info" role="note">Escanea el QR de un estudiante para ver su nombre y su código. Solo consulta: <strong>no registra asistencia</strong>.</p>

    <article className="content-card">
      <QrCameraView scanner={scanner} title="Lector de prueba" idle={<CameraIdle text="Toca «Abrir cámara» para escanear" />}>
        {latest && <ResultSheet reading={latest} />}
      </QrCameraView>
      <div className="dialog-actions" style={{ marginTop: ".8rem", flexWrap: "wrap" }}>
        <button type="button" className="button button-primary" onClick={() => void scanner.start()}><ScanLine size={18} /> Abrir cámara</button>
        <label className="button button-secondary" style={{ cursor: "pointer" }}><ImageUp size={17} /> Leer desde una imagen
          <input type="file" accept="image/*" hidden onChange={(event) => { void fromImage(event.target.files?.[0]); event.target.value = ""; }} /></label>
      </div>
      {scanner.error && <p className="notice notice-error" role="alert">{scanner.error}</p>}
      {imageNotice && <p className="helper-text" role="status">{imageNotice}</p>}
      <p className="helper-text">La cámara se abre en pantalla completa. Mantén el QR dentro del recuadro; al leerlo suena un pitido y vibra. Si el salón está oscuro, usa la linterna.</p>
    </article>

    {latest && <article className="content-card" aria-live="polite"><h2>Última lectura</h2><ResultSheet reading={latest} /></article>}

    {readings.length > 1 && <article className="content-card"><h2>Lecturas anteriores</h2>
      <ul className="simple-list">{readings.slice(1).map((reading, index) => <li key={index}>{reading.at.toLocaleTimeString("es-CO")} · {reading.ok ? `${reading.name} (${reading.code})` : reading.reason}</li>)}</ul></article>}
  </>;
}

function ResultSheet({ reading }: { reading: Reading }) {
  const style = { display: "flex", gap: ".7rem", alignItems: "center", padding: ".8rem 1rem", borderRadius: 12, border: `1px solid ${reading.ok ? "#12b886" : "#e03131"}`, background: reading.ok ? "rgba(18,184,134,.12)" : "rgba(224,49,49,.1)" } as const;
  return <div className="qr-result" style={style} role={reading.ok ? "status" : "alert"}>
    {reading.ok ? <CheckCircle2 size={30} color="#12b886" aria-hidden="true" /> : <XCircle size={30} color="#e03131" aria-hidden="true" />}
    <div style={{ minWidth: 0 }}>
      {reading.ok ? <>
        <strong style={{ display: "block", fontSize: "1.1rem", overflowWrap: "anywhere" }}>{reading.name}</strong>
        <span>Código: <strong className="code-tag">{reading.code}</strong>{reading.course ? ` · Curso ${reading.course}` : ""}{reading.active ? "" : " · Estudiante inactivo"}</span>
      </> : <strong style={{ overflowWrap: "anywhere" }}>{reading.reason}</strong>}
    </div>
  </div>;
}
