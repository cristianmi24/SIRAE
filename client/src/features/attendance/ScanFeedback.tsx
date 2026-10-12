import { useEffect } from "react";
import { AlertTriangle, Check, CloudOff, X } from "lucide-react";

export type ScanFlash = { id: number; kind: "ok" | "late" | "duplicate" | "error" | "offline"; title: string; detail?: string; time?: string };

const SHOW_MS = 2200;
const icons = { ok: Check, late: Check, duplicate: AlertTriangle, error: X, offline: CloudOff };

// Tono corto y vibración para confirmar sin mirar la pantalla. Si el navegador no lo permite, no pasa nada.
function signal(kind: ScanFlash["kind"]) {
  try { navigator.vibrate?.(kind === "ok" || kind === "late" ? 80 : [60, 60, 60]); } catch { /* sin vibración */ }
  try {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator(); const gain = context.createGain();
    oscillator.frequency.value = kind === "ok" || kind === "late" ? 880 : kind === "error" ? 220 : 440;
    gain.gain.setValueAtTime(0.12, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => void context.close();
  } catch { /* sin audio */ }
}

// Confirmación grande sobre la cámara: check verde y nombre del estudiante al registrar.
export function ScanFeedback({ flash, onDone }: { flash: ScanFlash | null; onDone: () => void }) {
  useEffect(() => {
    if (!flash) return;
    signal(flash.kind);
    const timer = window.setTimeout(onDone, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [flash, onDone]);
  if (!flash) return null;
  const Icon = icons[flash.kind];
  return <div key={flash.id} className={`scan-flash scan-flash-${flash.kind}`} role="status" aria-live="assertive" onClick={onDone}>
    <div className="scan-flash-card">
      <span className="scan-flash-icon"><Icon size={58} strokeWidth={3.2} aria-hidden="true" /></span>
      <strong>{flash.title}</strong>
      {flash.detail && <span>{flash.detail}</span>}
      {flash.time && <time>{flash.time}</time>}
    </div>
  </div>;
}
