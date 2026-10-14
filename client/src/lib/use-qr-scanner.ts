import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_LIMIT_MS = 60_000;
const SCAN_INTERVAL_MS = 120;

// Proporción 4:3 (la nativa de casi todos los sensores): muestra más campo de visión que 16:9, que recorta los lados y se siente «muy cerca».
function resolutionConstraints(): MediaTrackConstraints {
  return window.innerHeight > window.innerWidth
    ? { width: { ideal: 1200 }, height: { ideal: 1600 }, aspectRatio: { ideal: 3 / 4 } }
    : { width: { ideal: 1600 }, height: { ideal: 1200 }, aspectRatio: { ideal: 4 / 3 } };
}

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
  const resolution = resolutionConstraints();
  const preferred: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId }, ...resolution } : { facingMode: { ideal: "environment" }, ...resolution };
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
  // Cada stop() invalida los start() que aún esperan (permiso o carga): así una cámara que llega tarde se apaga sola.
  const generationRef = useRef(0);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number; step: number; value: number } | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stop = useCallback(() => {
    generationRef.current += 1;
    window.clearTimeout(idleRef.current);
    try { stopLoopRef.current?.(); } catch { /* ya detenida */ }
    stopLoopRef.current = null;
    releaseVideo(videoRef.current, streamRef.current);
    streamRef.current = null;
    setTorchSupported(false); setTorchOn(false); setZoomRange(null);
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
    const generation = generationRef.current;
    const cancelled = () => generation !== generationRef.current;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { setError("La cámara solo funciona en una conexión segura (https)."); return; }
    // Si el navegador ya sabe que no hay ninguna cámara, se avisa sin pedir permiso.
    const devices = await navigator.mediaDevices.enumerateDevices?.().catch(() => [] as MediaDeviceInfo[]) ?? [];
    if (cancelled()) return;
    if (devices.length > 0 && !devices.some((device) => device.kind === "videoinput")) { setError("No se encontró una cámara en este dispositivo. Puedes registrar la asistencia por código o a mano."); return; }
    try {
      // Descarga ZXing mientras el navegador solicita/abre la cámara, para no retrasar el primer QR.
      const backendPromise = nativeDetector().then(async (detector) => detector ? { detector } : {
        modules: await Promise.all([import("@zxing/browser"), import("@zxing/library")]),
      });
      void backendPromise.catch(() => undefined);
      const stream = await openCamera(typeof deviceId === "string" ? deviceId : undefined);
      // Si se cerró la cámara o se salió de la página mientras esperaba el permiso, se apaga de inmediato.
      if (cancelled() || streamRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      // Enfoque continuo cuando el dispositivo lo permite.
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
      setTorchSupported(Boolean((caps as { torch?: boolean }).torch));
      // Zoom: se empieza en el mínimo (la vista más amplia) y se puede acercar con el control.
      const zoomCaps = (caps as { zoom?: { min: number; max: number; step?: number } }).zoom;
      if (zoomCaps && zoomCaps.max > zoomCaps.min) {
        await track!.applyConstraints({ advanced: [{ zoom: zoomCaps.min } as MediaTrackConstraintSet] }).catch(() => undefined);
        setZoomRange({ min: zoomCaps.min, max: zoomCaps.max, step: zoomCaps.step || 0.1, value: zoomCaps.min });
      }
      if (caps.focusMode?.includes("continuous")) await track!.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => undefined);
      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      await video.play();
      if (cancelled()) { releaseVideo(video, stream); streamRef.current = null; return; }
      setActive(true);
      armIdle();
      // Con el permiso concedido ya se conocen todas las cámaras (para poder cambiar entre ellas).
      void listCameras().then(setCameras);

      const backend = await backendPromise;
      if (cancelled()) return;
      if ("detector" in backend && backend.detector) {
        const detector = backend.detector;
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
      const [{ BrowserQRCodeReader }, { BarcodeFormat, DecodeHintType }] = backend.modules;
      const hints = new Map<unknown, unknown>([[DecodeHintType.TRY_HARDER, true], [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
      const reader = new BrowserQRCodeReader(hints as never, { delayBetweenScanAttempts: SCAN_INTERVAL_MS, delayBetweenScanSuccess: 600 });
      const controls = await reader.decodeFromStream(stream, video, (result) => { if (result) handle(result.getText()); });
      stopLoopRef.current = () => controls.stop();
    } catch (reason) {
      stop();
      setError(cameraErrorMessage(reason));
    }
  }, [armIdle, handle, stop]);

  // Linterna (si la cámara la tiene): ayuda a leer QR en salones con poca luz.
  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }); setTorchOn(next); } catch { setTorchSupported(false); }
  }, [torchOn]);

  const setZoom = useCallback(async (value: number) => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try { await track.applyConstraints({ advanced: [{ zoom: value } as MediaTrackConstraintSet] }); setZoomRange((current) => (current ? { ...current, value } : current)); } catch { /* sin zoom */ }
  }, []);

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
    window.addEventListener("beforeunload", stop);
    document.addEventListener("freeze", stop);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", stop); window.removeEventListener("beforeunload", stop); document.removeEventListener("freeze", stop); stop(); };
  }, [stop]);

  return { videoRef, active, error, start, stop, armIdle, cameras: cameras.length, switchCamera, torchSupported, torchOn, toggleTorch, zoom: zoomRange, setZoom };
}

/** Lee un QR desde una foto o captura de pantalla (como hacen los lectores desde la galería). */
export async function decodeQrFromImage(file: File): Promise<string | null> {
  const detector = await nativeDetector();
  if (detector) {
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas"); canvas.width = bitmap.width; canvas.height = bitmap.height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
      const codes = await (detector as unknown as { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }).detect(canvas);
      if (codes[0]?.rawValue) return codes[0].rawValue;
    } catch { /* se intenta con ZXing */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const [{ BrowserQRCodeReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
    const hints = new Map<unknown, unknown>([[DecodeHintType.TRY_HARDER, true], [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]]]);
    return (await new BrowserQRCodeReader(hints as never).decodeFromImageUrl(url)).getText();
  } catch { return null; } finally { URL.revokeObjectURL(url); }
}
