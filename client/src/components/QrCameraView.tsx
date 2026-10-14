import { useEffect, useRef, type ReactNode } from "react";
import { Camera, CameraOff, Flashlight, FlashlightOff, SwitchCamera, X } from "lucide-react";
import type { useQrScanner } from "../lib/use-qr-scanner";

type Scanner = ReturnType<typeof useQrScanner>;

// Vista de la cámara para leer QR. Al encenderse ocupa toda la pantalla (celular o computador)
// con un recuadro guía; al apagarse vuelve a su lugar en la página. La lectura la hace useQrScanner.
export function QrCameraView({ scanner, title, idle, children }: { scanner: Scanner; title: string; idle?: ReactNode; children?: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { active, stop } = scanner;
  useEffect(() => {
    if (!active) return;
    document.body.classList.add("camera-open");
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") stop(); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.classList.remove("camera-open"); window.removeEventListener("keydown", onKey); };
  }, [active, stop]);
  // El mismo elemento <video> se mantiene siempre montado: la cámara se conecta a él antes de ampliarse.
  return <div className={`camera-frame ${active ? "is-expanded" : ""}`} hidden={!active && !idle} {...(active ? { role: "dialog", "aria-modal": true, "aria-label": title } : {})}>
    <video ref={scanner.videoRef} muted playsInline hidden={!active} aria-label="Cámara para escanear códigos QR" />
    {!active && idle}
    {active && <div className="camera-overlay">
      <div className="camera-topbar">
        <span className="camera-dot" aria-hidden="true" />
        <span>{title}</span>
        {scanner.torchSupported && <button type="button" className="camera-icon-button" onClick={() => void scanner.toggleTorch()} aria-pressed={scanner.torchOn} aria-label={scanner.torchOn ? "Apagar linterna" : "Encender linterna"} title="Linterna">{scanner.torchOn ? <FlashlightOff size={20} /> : <Flashlight size={20} />}</button>}
        {scanner.cameras > 1 && <button type="button" className="camera-icon-button" onClick={() => void scanner.switchCamera()} aria-label="Cambiar de cámara" title="Cambiar de cámara"><SwitchCamera size={20} /></button>}
        <button ref={closeRef} type="button" className="camera-icon-button" onClick={stop} aria-label="Cerrar cámara" title="Cerrar cámara (Esc)"><X size={22} /></button>
      </div>
      <div className="camera-guide" aria-hidden="true" />
      <div className="camera-bottombar">
        {children}
        <p className="camera-hint">Centra el código QR dentro del recuadro y mantenlo quieto.</p>
        <div className="dialog-actions"><button type="button" className="button button-secondary" onClick={stop}><CameraOff size={17} /> Detener cámara</button></div>
      </div>
    </div>}
  </div>;
}

export function CameraIdle({ text = "La cámara se enciende cuando la actives" }: { text?: string }) {
  return <div className="camera-placeholder"><Camera size={30} aria-hidden="true" /><strong>{text}</strong><span>El navegador te pedirá permiso. Se abrirá en pantalla completa.</span></div>;
}
