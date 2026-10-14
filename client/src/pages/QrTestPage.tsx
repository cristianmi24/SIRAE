import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Camera, CheckCircle2, Download, QrCode, RefreshCw } from "lucide-react";
import { CameraIdle, QrCameraView } from "../components/QrCameraView";
import { useQrScanner } from "../lib/use-qr-scanner";

const QR_PREFIX = "aulanexo:student:v1:";

function createTestPayload() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  return `${QR_PREFIX}${token}`;
}

type Verification = { ok: boolean; text: string };

export function QrTestPage() {
  const [qr, setQr] = useState("");
  const [expectedPayload, setExpectedPayload] = useState("");
  const [qrError, setQrError] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);

  useEffect(() => {
    let mounted = true;
    try {
      const testPayload = createTestPayload();
      setExpectedPayload(testPayload);
      void QRCode.toDataURL(testPayload, { errorCorrectionLevel: "M", margin: 4, width: 640, color: { dark: "#173F5F", light: "#FFFFFF" } })
        .then((dataUrl) => { if (mounted) setQr(dataUrl); })
        .catch(() => { if (mounted) setQrError("No se pudo crear el QR de prueba. Recarga la página e inténtalo de nuevo."); });
    } catch {
      setQrError("No se pudo crear un token local para el QR de prueba.");
    }
    return () => { mounted = false; };
  }, []);

  const handleResult = useCallback((scannedPayload: string) => {
    setVerification(scannedPayload === expectedPayload
      ? { ok: true, text: "¡Funciona! La cámara y el lector reconocieron el QR de prueba." }
      : { ok: false, text: "Se leyó otro QR, no el de prueba. No se consultó el servidor ni se registró asistencia." });
  }, [expectedPayload]);
  const scanner = useQrScanner(handleResult, { stopOnRead: true });

  return <section className="page">
    <div className="page-heading"><div><h1><QrCode size={25} aria-hidden="true" /> Probar lector QR</h1><p className="page-subtitle">Comprueba la lectura de la cámara antes de usar los QR de la lista.</p></div></div>
    <p className="notice notice-info" role="note">Este QR usa el mismo formato que los de la lista, pero con un token ficticio generado en este dispositivo. La prueba no consulta el servidor ni crea o modifica asistencias.</p>

    <div className="attendance-columns">
      <article className="content-card">
        <h2>1. Muestra el QR de prueba</h2>
        <p className="helper-text">Ábrelo en otra pantalla o descárgalo para imprimirlo; luego apunta hacia él con la cámara de este dispositivo.</p>
        {qr ? <img className="qr-test-image" src={qr} alt="QR sintético para probar el lector de SIRAE" /> : <p className="helper-text" role={qrError ? "alert" : "status"}>{qrError || "Generando QR de prueba…"}</p>}
        {qr && <a className="button button-secondary" href={qr} download="sirae-qr-prueba.png"><Download size={17} aria-hidden="true" /> Descargar QR de prueba</a>}
      </article>

      <article className="content-card">
        <h2>2. Verifica la lectura</h2>
        <p className="helper-text">Activa la cámara y centra el QR dentro del recuadro. El permiso de cámara solo se pide al tocar el botón.</p>
        <QrCameraView scanner={scanner} title="Prueba del lector QR" idle={<CameraIdle text="La cámara se enciende cuando la actives" />}>
          {verification && <p className={`notice notice-${verification.ok ? "success" : "error"}`} role={verification.ok ? "status" : "alert"}>{verification.text}</p>}
        </QrCameraView>
        {scanner.error && <p className="notice notice-error" role="alert">{scanner.error}</p>}
        {verification && <p className={`notice notice-${verification.ok ? "success" : "error"}`} role={verification.ok ? "status" : "alert"}>{verification.ok && <CheckCircle2 size={18} aria-hidden="true" />} {verification.text}</p>}
        <div className="dialog-actions">
          {!scanner.active && <button className="button button-primary" disabled={!qr || !expectedPayload} onClick={() => { setVerification(null); void scanner.start(); }}><Camera size={17} aria-hidden="true" /> Activar cámara</button>}
          {verification && <button className="button button-secondary" onClick={() => { setVerification(null); void scanner.start(); }}><RefreshCw size={16} aria-hidden="true" /> Probar otra vez</button>}
        </div>
      </article>
    </div>
  </section>;
}
