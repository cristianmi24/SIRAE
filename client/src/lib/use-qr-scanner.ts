import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 60_000;

// Libera la cámara por completo: detiene cada pista de video y desconecta el elemento.
function releaseVideo(video: HTMLVideoElement | null) {
  const stream = video?.srcObject;
  if (stream instanceof MediaStream) stream.getTracks().forEach((track) => track.stop());
  if (video) { video.pause(); video.srcObject = null; video.removeAttribute("src"); video.load(); }
}

/**
 * Control único de la cámara para leer QR.
 * - Solo se enciende cuando el usuario pulsa el botón (nunca automáticamente).
 * - Se apaga al leer un código, al detenerla, al salir de la página, al ocultar la pestaña
 *   o tras 60 segundos sin leer nada.
 */
export function useQrScanner(onResult: (text: string) => void, options: { stopOnRead?: boolean } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const idleRef = useRef<number | undefined>(undefined);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    window.clearTimeout(idleRef.current);
    try { controlsRef.current?.stop(); } catch { /* ya detenida */ }
    controlsRef.current = null;
    releaseVideo(videoRef.current);
    setActive(false);
  }, []);

  const armIdle = useCallback(() => {
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => { stop(); setError("La cámara se apagó por inactividad."); }, IDLE_LIMIT_MS);
  }, [stop]);

  const start = useCallback(async () => {
    setError("");
    if (!videoRef.current || controlsRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("La cámara solo funciona en una conexión segura (https)."); return; }
    try {
      const { BrowserQRCodeReader } = await import("@zxing/browser");
      const controls = await new BrowserQRCodeReader().decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (!result) return;
        armIdle();
        if (options.stopOnRead) stop();
        resultRef.current(result.getText());
      });
      controlsRef.current = controls;
      setActive(true);
      armIdle();
    } catch {
      stop();
      setError("No se pudo usar la cámara. Revisa el permiso del navegador.");
    }
  }, [armIdle, stop, options.stopOnRead]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); stop(); };
  }, [stop]);

  return { videoRef, active, error, start, stop, armIdle };
}
