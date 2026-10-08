import { useState } from "react";
import { Clock3 } from "lucide-react";
import type { RosterLine } from "../../services/api";

type ManualStatus = "PRESENT" | "LATE" | "ABSENT" | "JUSTIFIED";
const buttons: { value: ManualStatus; label: string; short: string }[] = [
  { value: "PRESENT", label: "A tiempo", short: "A tiempo" },
  { value: "LATE", label: "Tarde", short: "Tarde" },
  { value: "ABSENT", label: "No llegó", short: "Ausente" },
  { value: "JUSTIFIED", label: "Justificada", short: "Justif." },
];
const sourceLabel: Record<string, string> = { QR: "QR", LINK: "código", MANUAL: "manual", OFFLINE: "sin conexión", SESSION_CLOSE: "al cerrar" };

// Marcado manual en un toque. En una clase cerrada, corregir exige escribir el motivo.
export function RosterList({ rows, closed, saving, clock, onMark }: { rows: RosterLine[]; closed: boolean; saving: boolean; clock: (iso?: string, seconds?: boolean) => string; onMark: (studentId: string, status: ManualStatus, reason?: string) => void }) {
  const [pending, setPending] = useState<{ studentId: string; status: ManualStatus } | null>(null);
  const [reason, setReason] = useState("");
  const choose = (row: RosterLine, status: ManualStatus) => {
    if (row.status === status) return;
    // Con la clase cerrada, marcar "Tarde" a quien quedó ausente al cerrar no pide motivo.
    const lateAfterClose = closed && status === "LATE" && (!row.hasRecord || (row.status === "ABSENT" && row.source === "SESSION_CLOSE"));
    if (!lateAfterClose && (closed || status === "JUSTIFIED")) { setPending({ studentId: row.studentId, status }); setReason(""); return; }
    onMark(row.studentId, status);
  };
  if (!rows.length) return <p className="empty-state">Este curso no tiene estudiantes activos.</p>;
  return <div className="roster-list">{rows.map((row) => <div className={`roster-row ${row.hasRecord ? "has-record" : ""}`} key={row.studentId}>
    <div className="roster-person"><strong>{row.studentName}</strong><small>{row.document}{row.requiresReview ? " · por revisar" : ""}</small></div>
    <div className="scan-time" title="Hora de registro">{row.recordedAt ? <><Clock3 size={13} aria-hidden="true" /> {clock(row.recordedAt, true)}{row.source && <small>{sourceLabel[row.source] ?? row.source}</small>}</> : <span className="muted">—</span>}</div>
    <div className="mark-buttons" role="group" aria-label={`Asistencia de ${row.studentName}`}>{buttons.map((b) => <button key={b.value} type="button" className={`mark-button mark-${b.value.toLowerCase()} ${row.hasRecord && row.status === b.value ? "is-active" : ""}`} aria-pressed={row.hasRecord && row.status === b.value} disabled={saving || (closed && !row.hasRecord && b.value !== "LATE")} onClick={() => choose(row, b.value)} title={b.label}>{b.short}</button>)}</div>
    {pending?.studentId === row.studentId && <form className="mark-reason" onSubmit={(e) => { e.preventDefault(); onMark(row.studentId, pending.status, reason.trim()); setPending(null); }}>
      <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={pending.status === "JUSTIFIED" ? "Motivo de la justificación" : "Motivo de la corrección"} aria-label="Motivo" required={closed} maxLength={300} />
      <button className="button button-primary compact-button" disabled={closed && !reason.trim()}>Guardar</button>
      <button type="button" className="button button-ghost compact-button" onClick={() => setPending(null)}>Cancelar</button>
    </form>}
  </div>)}</div>;
}
