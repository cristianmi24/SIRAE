import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Camera, CameraOff, Clock3, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { api, type SessionDto } from "../services/api";
import { CodeLinkPanel } from "../features/attendance/CodeLinkPanel";
import { RosterList } from "../features/attendance/RosterList";
import { listQueuedAttendance, queueAttendance, removeQueuedAttendance, type PendingAttendance } from "../lib/offline-attendance";
import { LoadingState } from "../components/Feedback";
import { CameraIndicator } from "../components/CameraIndicator";
import { useQrScanner } from "../lib/use-qr-scanner";

const prefix = "aulanexo:student:v1:";
async function hashPayload(payload: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload)); return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
function dayKeyInZone(timezone: string, date = new Date()) { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const values = Object.fromEntries(parts.map((part) => [part.type, part.value])); return `${values.year}-${values.month}-${values.day}`; }
function weekdayOf(dateKey: string) { const [y, m, d] = dateKey.split("-").map(Number); const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); return day === 0 ? 7 : day; }

type Message = { tone: "info" | "success" | "error"; text: string };
type TimingIssue = { kind: "late" | "early" | "over"; minutes: number };

export function AttendancePage() {
  const client = useQueryClient();
  const context = useQuery({ queryKey: ["attendanceContext"], queryFn: api.getAttendanceContext });
  const timezone = context.data?.timezone ?? "America/Bogota";
  const clock = useCallback((iso?: string, seconds = false) => iso ? new Date(iso).toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}) }) : "", [timezone]);
  const [date, setDate] = useState(""); const [scheduleId, setScheduleId] = useState(""); const [sessionId, setSessionId] = useState("");
  const [message, setMessage] = useState<Message | null>(null); const [lastScan, setLastScan] = useState<{ name: string; label: string; status?: string; at: string } | null>(null);
  const [queued, setQueued] = useState<PendingAttendance[]>([]);
  const [mode, setMode] = useState<"code" | "qr">("code");
  const [timingIssue, setTimingIssue] = useState<TimingIssue | null>(null); const [todayTolerance, setTodayTolerance] = useState(""); const [editingTolerance, setEditingTolerance] = useState(false);
  const lastScannedRef = useRef("");
  useEffect(() => { if (!date && context.data?.timezone) setDate(dayKeyInZone(context.data.timezone)); }, [date, context.data?.timezone]);
  const sessions = useQuery({ queryKey: ["sessions", date], queryFn: () => api.getSessions(date), enabled: Boolean(date) });
  const roster = useQuery({ queryKey: ["roster", sessionId], queryFn: () => api.getRoster(sessionId), enabled: Boolean(sessionId), refetchInterval: 6000 });
  const selectedSession: SessionDto | undefined = (sessions.data?.items ?? []).find((x) => x.id === sessionId);
  const schedule = context.data?.schedules.find((s) => s.id === selectedSession?.scheduleId);
  const tolerance = selectedSession?.toleranceMinutes ?? schedule?.toleranceMinutes ?? 0;
  const groupLabel = (id: string) => context.data?.groups.find((g) => g.id === id)?.label ?? "Curso";
  const subjectLabel = (id: string) => context.data?.subjects.find((s) => s.id === id)?.name ?? "Materia";
  const fail = (fallback: string) => (error: unknown) => setMessage({ tone: "error", text: error instanceof Error ? error.message : fallback });

  const reloadQueue = useCallback(async () => { const scope = context.data?.queueScope; setQueued(scope ? await listQueuedAttendance(scope) : []); }, [context.data?.queueScope]);
  useEffect(() => { void reloadQueue(); }, [reloadQueue]);
  const syncOne = useCallback(async (item: PendingAttendance) => { if (!context.data?.queueScope || item.scope !== context.data.queueScope) return; try { await api.scanQr(item.sessionId, { tokenHash: item.tokenHash, clientEventId: item.clientEventId, deviceScannedAt: item.deviceScannedAt }); await removeQueuedAttendance(item.clientEventId); await client.invalidateQueries({ queryKey: ["roster", item.sessionId] }); setMessage({ tone: "info", text: "Registro sincronizado. Quedó por revisar porque se escaneó sin conexión." }); } catch (error) { setMessage({ tone: "error", text: error instanceof Error ? `${error.message} · El registro local se conservó.` : "No fue posible sincronizar; el registro local se conservó." }); } finally { await reloadQueue(); } }, [client, context.data?.queueScope, reloadQueue]);
  useEffect(() => { const scope = context.data?.queueScope; if (!scope) return; const onOnline = () => { void listQueuedAttendance(scope).then((items) => Promise.all(items.map(syncOne))); }; window.addEventListener("online", onOnline); return () => window.removeEventListener("online", onOnline); }, [context.data?.queueScope, syncOne]);

  const refreshSessions = async () => { await client.invalidateQueries({ queryKey: ["sessions"] }); await client.invalidateQueries({ queryKey: ["roster", sessionId] }); };
  const createSession = useMutation({ mutationFn: () => api.createSession(scheduleId, date), onSuccess: async ({ item }) => { setSessionId(item.id); setMessage(null); setTimingIssue(null); await client.invalidateQueries({ queryKey: ["sessions"] }); }, onError: fail("No se pudo abrir la clase.") });
  const closeSession = useMutation({ mutationFn: () => api.closeSession(sessionId), onSuccess: async ({ item }) => { stopScanner(); setMessage({ tone: "info", text: `Clase cerrada. ${item.absencesCreated} estudiantes sin registro quedaron como ausentes.` }); await refreshSessions(); }, onError: fail("No se pudo cerrar la clase.") });
  const adjust = useMutation({ mutationFn: (input: { startNow?: boolean; toleranceMinutes: number }) => api.adjustSession(sessionId, input), onSuccess: async (_data, input) => { setTimingIssue(null); setEditingTolerance(false); setMessage({ tone: "success", text: input.startNow ? `Listo: hoy la clase cuenta desde ahora, con ${input.toleranceMinutes} min de tolerancia. El horario semanal no cambió.` : `Tolerancia de hoy: ${input.toleranceMinutes} min.` }); await refreshSessions(); if (input.startNow) void startScanner(); }, onError: fail("No se pudo ajustar la hora de hoy.") });

  const handleQr = useCallback(async (payload: string) => {
    if (!sessionId || !selectedSession || selectedSession.state !== "OPEN" || payload === lastScannedRef.current) return;
    lastScannedRef.current = payload;
    try {
      if (!payload.startsWith(prefix) || payload.length > 160) { setMessage({ tone: "error", text: "Este QR no es un código de estudiante de SIRAE." }); return; }
      const tokenHash = await hashPayload(payload); const clientEventId = crypto.randomUUID(); const scannedAt = new Date().toISOString();
      const scope = context.data?.queueScope;
      if (!scope) { setMessage({ tone: "error", text: "No se pudo guardar el escaneo local." }); return; }
      const queueIt = async (text: string) => { await queueAttendance({ scope, clientEventId, sessionId, tokenHash, deviceScannedAt: scannedAt, queuedAt: new Date().toISOString() }); setMessage({ tone: "info", text }); setLastScan({ name: "Escaneo guardado sin conexión", label: "Por revisar", at: scannedAt }); await reloadQueue(); };
      if (!navigator.onLine) { await queueIt("Sin conexión: el escaneo se guardó en este dispositivo y se enviará al volver la red."); return; }
      try {
        const result = await api.scanQr(sessionId, { tokenHash, clientEventId });
        setMessage(null);
        setLastScan({ name: result.item.studentName ?? "Estudiante", label: result.duplicate ? `Ya registrado (${result.item.label ?? ""})` : result.item.label ?? "Registrado", status: result.item.status, at: result.item.recordedAt ?? scannedAt });
        await client.invalidateQueries({ queryKey: ["roster", sessionId] });
      } catch (error) {
        if (error instanceof TypeError || !navigator.onLine) await queueIt("No hubo conexión con el servidor; el escaneo se guardó y se reintentará.");
        else fail("No fue posible registrar el QR.")(error);
      }
    } catch (error) { fail("No se pudo procesar el QR.")(error); }
    finally { window.setTimeout(() => { if (lastScannedRef.current === payload) lastScannedRef.current = ""; }, 1400); }
  }, [sessionId, selectedSession, client, context.data?.queueScope, reloadQueue]);
  // La cámara solo se enciende al pulsar "Activar cámara" y se apaga al detenerla, al salir,
  // al ocultar la pestaña o tras 60 s sin leer códigos.
  const scanner = useQrScanner((text) => { void handleQr(text); });
  const scannerActive = scanner.active;
  const stopScanner = scanner.stop;
  const startScanner = scanner.start;
  useEffect(() => { if (scanner.error) setMessage({ tone: "error", text: `${scanner.error} También puedes marcar la asistencia a mano.` }); }, [scanner.error]);
  useEffect(() => { stopScanner(); }, [sessionId, stopScanner]);

  // Compara la hora actual con la hora de la clase antes de encender la cámara.
  const requestScanner = () => {
    if (!selectedSession || !context.data) return;
    const now = Date.now(); const start = new Date(selectedSession.startsAt).getTime(); const end = new Date(selectedSession.endsAt).getTime();
    const isToday = selectedSession.dateKey === dayKeyInZone(context.data.timezone);
    const minutesLate = Math.floor((now - start) / 60000);
    if (isToday && !selectedSession.adjustedAt) {
      if (now > end) { setTodayTolerance(String(tolerance)); setTimingIssue({ kind: "over", minutes: minutesLate }); return; }
      if (now < start - 60000) { setTodayTolerance(String(tolerance)); setTimingIssue({ kind: "early", minutes: Math.ceil((start - now) / 60000) }); return; }
      if (minutesLate > tolerance) { setTodayTolerance(String(tolerance)); setTimingIssue({ kind: "late", minutes: minutesLate }); return; }
    }
    void startScanner();
  };

  const markMutation = useMutation({ mutationFn: (input: { studentId: string; status: "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED"; reason?: string }) => api.markAttendance(sessionId, input), onSuccess: async () => { setMessage(null); await client.invalidateQueries({ queryKey: ["roster", sessionId] }); }, onError: fail("No se pudo actualizar la asistencia.") });
  if (context.isLoading) return <LoadingState label="Preparando asistencia…" />;
  const daySchedules = (context.data?.schedules ?? []).filter((s) => date && s.weekdays.includes(weekdayOf(date))).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const summary = roster.data?.summary;

  return <section className="page">
    <div className="page-heading"><div><h1>Tomar asistencia</h1><p className="page-subtitle">Elige la clase y registra la asistencia por código, con QR o marcando a mano. Cada registro guarda la hora exacta.</p></div></div>
    {message && <p className={`notice notice-${message.tone}`} role="status">{message.text}</p>}

    <article className="content-card">
      <div className="selector-row">
        <label className="form-field narrow-date"><span>Fecha</span><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSessionId(""); setScheduleId(""); stopScanner(); }} /></label>
        <label className="form-field"><span>Clase</span><select value={scheduleId} onChange={(e) => setScheduleId(e.target.value)}><option value="">{daySchedules.length ? "Elige la clase" : "No hay clases este día"}</option>{daySchedules.map((s) => <option key={s.id} value={s.id}>{s.startTime} · Curso {groupLabel(s.courseGroupId)} · {subjectLabel(s.subjectId)}</option>)}</select></label>
        <button className="button button-primary" disabled={!scheduleId || createSession.isPending} onClick={() => createSession.mutate()}>{createSession.isPending ? "Abriendo…" : "Abrir clase"}</button>
      </div>
      {!context.data?.schedules.length && <p className="helper-text">Primero arma el horario en <Link to="/academic/schedules">Horarios</Link>.</p>}
      {(sessions.data?.items ?? []).length > 0 && <div className="chip-filter session-chips">{(sessions.data?.items ?? []).map((s) => <button key={s.id} className={`filter-chip ${s.id === sessionId ? "is-active" : ""}`} onClick={() => { setSessionId(s.id); setScheduleId(s.scheduleId); setTimingIssue(null); stopScanner(); }}>{clock(s.startsAt)} · {groupLabel(s.courseGroupId)} · {subjectLabel(s.subjectId)}{s.state === "CLOSED" ? " (cerrada)" : ""}</button>)}</div>}
    </article>

    {selectedSession && <div className="attendance-columns">
      <article className="content-card scanner-card">
        <div className="card-title-row">
          <div><h2>Curso {groupLabel(selectedSession.courseGroupId)} · {subjectLabel(selectedSession.subjectId)}</h2>
            <p className="helper-text class-time"><Clock3 size={14} aria-hidden="true" /> {selectedSession.adjustedAt && selectedSession.scheduledStartsAt ? <>Hoy empezó a las <strong>{clock(selectedSession.startsAt)}</strong> (programada {clock(selectedSession.scheduledStartsAt)})</> : <>{clock(selectedSession.startsAt)} a {clock(selectedSession.endsAt)}</>} · tolerancia {tolerance} min{selectedSession.state === "OPEN" && !editingTolerance && <button className="link-button" onClick={() => { setTodayTolerance(String(tolerance)); setEditingTolerance(true); }}>cambiar hoy</button>}</p>
            {editingTolerance && <form className="tolerance-inline" onSubmit={(e) => { e.preventDefault(); adjust.mutate({ toleranceMinutes: Number(todayTolerance) }); }}><input type="number" min="0" max="180" value={todayTolerance} onChange={(e) => setTodayTolerance(e.target.value)} aria-label="Tolerancia de hoy en minutos" /> min <button className="button button-secondary compact-button" disabled={adjust.isPending}>Guardar</button><button type="button" className="link-button" onClick={() => setEditingTolerance(false)}>cancelar</button></form>}
          </div>
          <span className={`status-chip ${selectedSession.state === "OPEN" ? "status-activo" : "status-inactivo"}`}>{selectedSession.state === "OPEN" ? "Abierta" : "Cerrada"}</span>
        </div>

        {timingIssue && <div className="timing-alert" role="alertdialog" aria-labelledby="timing-title">
          <AlarmClock size={22} aria-hidden="true" />
          <div>
            <strong id="timing-title">{timingIssue.kind === "early" ? `Faltan ${timingIssue.minutes} min para que empiece esta clase` : timingIssue.kind === "over" ? "Según el horario, esta clase ya terminó" : `Estás abriendo el lector ${timingIssue.minutes} min después del inicio`}</strong>
            <p>La clase está programada a las {clock(selectedSession.scheduledStartsAt ?? selectedSession.startsAt)}. Si hoy empieza ahora, guarda este nuevo inicio: la tolerancia contará desde este momento. El horario semanal no se modifica.</p>
            <div className="timing-actions">
              <label className="tolerance-field">Tolerancia <input type="number" min="0" max="180" value={todayTolerance} onChange={(e) => setTodayTolerance(e.target.value)} /> min</label>
              <button className="button button-primary compact-button" disabled={adjust.isPending || todayTolerance === ""} onClick={() => adjust.mutate({ startNow: true, toleranceMinutes: Number(todayTolerance) })}>{adjust.isPending ? "Guardando…" : `Empezar desde ahora (${new Date().toLocaleTimeString("es-CO", { timeZone: timezone, hour: "2-digit", minute: "2-digit" })})`}</button>
              {timingIssue.kind === "late" && <button className="button button-ghost compact-button" onClick={() => { setTimingIssue(null); void startScanner(); }}>Usar el horario normal</button>}
              <button className="link-button" onClick={() => setTimingIssue(null)}>Cancelar</button>
            </div>
          </div>
        </div>}

        <div className="segmented mode-tabs" role="tablist" aria-label="Forma de registro">
          <button role="tab" aria-selected={mode === "code"} className={mode === "code" ? "is-active" : ""} onClick={() => { setMode("code"); stopScanner(); }}>Por código</button>
          <button role="tab" aria-selected={mode === "qr"} className={mode === "qr" ? "is-active" : ""} onClick={() => setMode("qr")}>Escanear QR</button>
        </div>
        {mode === "code" ? <CodeLinkPanel sessionId={selectedSession.id} open={selectedSession.state === "OPEN"} clock={clock} onMessage={setMessage} /> : <>
        {scannerActive && <CameraIndicator onStop={stopScanner} />}
        <div className="camera-frame"><video ref={scanner.videoRef} muted playsInline hidden={!scannerActive} aria-label="Cámara para escanear códigos QR" />{!scannerActive && <div className="camera-placeholder"><Camera size={30} aria-hidden="true" /><strong>La cámara se enciende cuando la actives</strong><span>El navegador te pedirá permiso.</span></div>}</div>
        {lastScan && <div className={`last-scan status-${(lastScan.status ?? "pending").toLowerCase()}`} aria-live="polite"><strong>{lastScan.name}</strong><span>{lastScan.label}</span><time>{clock(lastScan.at, true)}</time></div>}
        <div className="dialog-actions">
          {scannerActive ? <button className="button button-secondary" onClick={stopScanner}><CameraOff size={17} /> Detener cámara</button> : <button className="button button-primary" disabled={selectedSession.state !== "OPEN" || Boolean(timingIssue)} onClick={requestScanner}><Camera size={17} /> Activar cámara</button>}
          {queued.some((x) => x.sessionId === sessionId) && <button className="button button-ghost" disabled={!navigator.onLine} onClick={() => void Promise.all(queued.filter((x) => x.sessionId === sessionId).map(syncOne))}><RefreshCw size={16} /> Enviar pendientes ({queued.filter((x) => x.sessionId === sessionId).length})</button>}
        </div></>}
      </article>

      <article className="content-card roster-card">
        <div className="card-title-row">
          <div><h2>Lista del curso</h2>{summary && <div className="summary-pills compact-pills"><span className="pill pill-green">{summary.present} a tiempo</span><span className="pill pill-amber">{summary.late} tarde</span><span className="pill pill-coral">{summary.absent} ausentes</span><span className="pill">{summary.total} total</span></div>}</div>
          {selectedSession.state === "OPEN" && <button className="button button-danger compact-button" onClick={() => { if (window.confirm("¿Cerrar la clase? Quienes no tengan registro quedarán como ausentes.")) closeSession.mutate(); }} disabled={closeSession.isPending}>{closeSession.isPending ? "Cerrando…" : "Cerrar clase"}</button>}
        </div>
        <p className="helper-text">{selectedSession.state === "CLOSED" ? "Clase cerrada: para corregir un registro escribe el motivo." : "Toca el estado de cada estudiante para marcarlo a mano."}</p>
        {roster.isLoading ? <LoadingState label="Cargando lista…" /> : <RosterList rows={roster.data?.items ?? []} closed={selectedSession.state === "CLOSED"} saving={markMutation.isPending} clock={clock} onMark={(studentId, status, reason) => markMutation.mutate({ studentId, status, reason: reason || undefined })} />}
      </article>
    </div>}

    {queued.length > 0 && <article className="content-card"><h2>Escaneos guardados en este dispositivo</h2><p className="helper-text">Se enviarán al volver la conexión y quedarán por revisar.</p><ul className="simple-list">{queued.map((x) => <li key={x.clientEventId}>Leído a las {clock(x.deviceScannedAt, true)}{x.error && <span> · {x.error}</span>}</li>)}</ul></article>}
  </section>;
}
