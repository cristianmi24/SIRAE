import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 60_000;
const SCAN_INTERVAL_MS = 120;

// Cámara trasera (en el celular) o la cámara disponible (en el computador), en alta resolución:
// los QR impresos se leen mucho mejor y la vista se puede ampliar a toda la pantalla.
const RESOLUTION: MediaTrackConstraints = { width: { ideal: 1920 }, height: { ideal: 1080 } };
const VIDEO_CONSTRAINTS: MediaTrackConstraints = { facingMode: { ideal: "environment" }, ...RESOLUTION };

function cameraErrorMessage(reason: unknown): string {
  const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "No diste permiso para usar la cámara. Actívalo en el candado de la barra de direcciones (o en los ajustes del navegador) y vuelve a intentarlo.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "No se encontró una cámara disponible en este dispositivo.";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "La cámara está siendo usada por otra aplicación o pestaña. Ciérrala e inténtalo de nuevo.";
  return "No se pudo usar la cámara. Revisa el permiso del navegador e inténtalo de nuevo.";
}

async function listCameras(): Promise<MediaDeviceInfo[]> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "videoinput"); } catch { return []; }
}

// Pide la cámara; si el dispositivo no admite las preferencias (resolución o cámara trasera),
// reintenta con cualquier cámara disponible.
async function openCamera(deviceId?: string): Promise<MediaStream> {
  const preferred: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...RESOLUTION } : VIDEO_CONSTRAINTS;
  try { return await navigator.mediaDevices.getUserMedia({ video: preferred, audio: false }); }
  catch (reason) {
    const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
    if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") throw reason;
    return navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  }
}

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
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);

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

  const start = useCallback(async (deviceId?: unknown) => {
    setError("");
    const video = videoRef.current;
    if (!video || streamRef.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("La cámara solo funciona en una conexión segura (https)."); return; }
    // Si el navegador ya sabe que no hay ninguna cámara, se avisa sin pedir permiso.
    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]) ?? [];
    if (devices.length > 0 && !devices.some((device) => device.kind === "videoinput")) { setError("No se encontró una cámara en este dispositivo. Puedes registrar la asistencia por código o a mano."); return; }
    try {
      const stream = await openCamera(typeof deviceId === "string" ? deviceId : undefined);
      if (streamRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
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
      // Con el permiso concedido ya se conocen todas las cámaras (para poder cambiar entre ellas).
      void listCameras().then(setCameras);

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
      setError(cameraErrorMessage(reason));
    }
  }, [armIdle, handle, stop]);

  // Pasa a la siguiente cámara (por ejemplo, de la frontal a la trasera).
  const switchCamera = useCallback(async () => {
    if (cameras.length < 2) return;
    const current = streamRef.current?.getVideoTracks()[0]?.getSettings().deviceId;
    const index = cameras.findIndex((camera) => camera.deviceId === current);
    const next = cameras[(index + 1) % cameras.length]!;
    stop();
    await start(next.deviceId);
  }, [cameras, start, stop]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") stop(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", stop);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); stop(); };
  }, [stop]);

  return { videoRef, active, error, start, stop, armIdle, cameras: cameras.length, switchCamera };
}
