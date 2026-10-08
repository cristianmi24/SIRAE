import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 60_000;
const SCAN_INTERVAL_MS = 120;

// Cámara trasera en buena resolución: los QR impresos se leen mucho mejor así.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } };

type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
declare global { interface Window { BarcodeDetector?: { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } } }

// Libera la cámara por completo: detiene cada pista de video y desconecta el elemento.
function releaseVideo(video: HTMLVideoElement | null, stream?: MediaStream | null) {
  const current = stream ?? (video?.srcObject instanceof MediaStream ? video.srcObject : null);
  current?.getTracks().forEach((track) => track.stop());
  if (video) { video.pause(); video.srcObject = null; video.removeAttribute("src"); video.load(); }
}

async function nativeDetector(): Promise<Detector | null> {
  if (!window.BarcodeDetector) return null;
  try {
    const formats = await window.BarcodeDetector.getSupportedFormats?.();
    if (formats && !formats.includes("qr_code")) return null;
    return new window.BarcodeDetector({ formats: ["qr_code"] });
  } catch { return null; }
}

/**
 * Control único de la cámara para leer QR.
 * - Solo se enciende cuando el usuario pulsa el botón (nunca automáticamente).
 * - Usa el lector nativo del navegador si existe (más rápido) y si no, ZXing en modo exhaustivo.
 * - Se apaga al leer un código (si se pide), al detenerla, al salir de la página,
 *   al ocultar la pestaña o tras 60 segundos sin leer nada.
 */
export function useQrScanner(onResult: (text: string) => void, options: { stopOnRead?: boolean } = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopLoopRef = useRef<(() => void) | null>(null);
  const idleRef = useRef<number | undefined>(undefined);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  const stop = useCallback(() => {
    window.clearTimeout(idleRef.current);
    try { stopLoopRef.current?.(); } catch { /* ya detenida */ }
    stopLoopRef.current = null;
    releaseVideo(videoRef.current, streamRef.current);
    streamRef.current = null;
    setActive(false);
  }, []);

  const armIdle = useCallback(() => {
    window.clearTimeout(idleRef.current);
    idleRef.current = window.setTimeout(() => { stop(); setError("La cámara se apagó por inactividad."); }, IDLE_LIMIT_MS);
  }, [stop]);

  const handle = useCallback((text: string) => {
    armIdle();
    if (options.stopOnRead) stop();
    resultRef.current(text);
  }, [armIdle, stop, options.stopOnRead]);

  const start = useCallback(async () => {
    setError("");
    const video = videoRef.current;
    if (!video || streamRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("La cámara solo funciona en una conexión segura (https)."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO_CONSTRAINTS, audio: false });
      streamRef.current = stream;
      // Enfoque continuo cuando el dispositivo lo permite.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
      if (caps.focusMode?.includes("continuous")) await track!.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      setActive(true);
      armIdle();

      const detector = await nativeDetector();
      if (detector) {
        let running = true;
        let timer: number | undefined;
        const tick = async () => {
          if (!running) return;
          if (video.readyState >= 2) {
            try { const codes = await detector.detect(video); const text = codes[0]?.rawValue; if (text && running) handle(text); } catch { /* cuadro sin código */ }
          }
          if (running) timer = window.setTimeout(() => void tick(), SCAN_INTERVAL_MS);
        };
        stopLoopRef.current = () => { running = false; window.clearTimeout(timer); };
        void tick();
        return;
      }
      const [{ BrowserQRCodeReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
      const hints = new Map<unknown, unknown>([[DecodeHintType.TRY_HARDER, true], [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
      const reader = new BrowserQRCodeReader(hints as never, { delayBetweenScanAttempts: SCAN_INTERVAL_MS, delayBetweenScanSuccess: 600 });
      const controls = await reader.decodeFromStream(stream, video, (result) => { if (result) handle(result.getText()); });
      stopLoopRef.current = () => controls.stop();
    } catch (reason) {
      stop();
      const name = reason instanceof DOMException ? reason.name : "";
      setError(name === "NotAllowedError" ? "No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones." : name === "NotFoundError" ? "No se encontró una cámara en este dispositivo." : "No se pudo usar la cámara. Revisa el permiso del navegador.");
    }
  }, [armIdle, handle, stop]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); stop(); };
  }, [stop]);

  return { videoRef, active, error, start, stop, armIdle };
}
