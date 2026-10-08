import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { FileBarChart2, Search, UserRound } from "lucide-react";
import { LoadingState } from "../components/Feedback";
import { useDraft } from "../lib/ui-hooks";
import { api, type ObservationDto } from "../services/api";

const priorityLabel = { HIGH: "Alta", NORMAL: "Normal", LOW: "Baja" } as const;
const statusLabel = { OPEN: "Abierta", IN_PROGRESS: "En seguimiento", CLOSED: "Cerrada" } as const;

export function ObservationsPage() {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const studentId = searchParams.get("studentId") ?? "";
  const [search, setSearch] = useState("");
  const [courseId, setCourseId] = useState("");
  const students = useQuery({ queryKey: ["students", "observations"], queryFn: () => api.getAllStudents("ACTIVO") });
  const allObservations = useQuery({ queryKey: ["observations", "all"], queryFn: () => api.getObservations() });
  const courses = useMemo(() => [...new Map((students.data?.items ?? []).filter((s) => s.courseGroup).map((s) => [s.courseGroup!.id, s.courseGroup!])).values()].sort((a, b) => a.label.localeCompare(b.label)), [students.data]);
  const openCount = useMemo(() => { const map = new Map<string, number>(); for (const o of allObservations.data?.items ?? []) if (o.status !== "CLOSED") map.set(o.studentId, (map.get(o.studentId) ?? 0) + 1); return map; }, [allObservations.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (students.data?.items ?? []).filter((s) => (!courseId || s.courseGroup?.id === courseId) && (!q || `${s.fullName} ${s.document}`.toLowerCase().includes(q)));
  }, [students.data, search, courseId]);
  const select = (id: string) => setSearchParams(id ? { studentId: id } : {});
  if (students.isLoading) return <LoadingState label="Cargando estudiantes…" />;
  if (students.error) return <section className="page"><p className="notice notice-error" role="alert">{students.error instanceof Error ? students.error.message : "No se pudo cargar la lista."}</p></section>;
  const selected = (students.data?.items ?? []).find((s) => s.id === studentId);

  return <section className="page">
    <div className="page-heading"><div><h1>Seguimiento</h1><p className="page-subtitle">Busca al estudiante, selecciónalo y registra la observación.</p></div></div>
    <div className="follow-layout">
      <aside className="content-card student-picker" aria-label="Estudiantes">
        <label className="search-field"><Search size={17} aria-hidden="true" /><input autoFocus aria-label="Buscar estudiante" placeholder="Buscar estudiante" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        {courses.length > 1 && <div className="chip-filter picker-courses"><button className={`filter-chip ${!courseId ? "is-active" : ""}`} onClick={() => setCourseId("")}>Todos</button>{courses.map((c) => <button key={c.id} className={`filter-chip ${courseId === c.id ? "is-active" : ""}`} onClick={() => setCourseId(c.id)}>{c.label.replace(" · ", " ")}</button>)}</div>}
        {filtered.length ? <ul className="picker-list">{filtered.map((s) => <li key={s.id}><button className={s.id === studentId ? "is-active" : ""} onClick={() => select(s.id)}>
          <span className="mini-avatar" aria-hidden="true">{s.firstName.charAt(0)}{s.lastName.charAt(0)}</span>
          <span><strong>{s.fullName}</strong><small>{s.courseGroup ? `Curso ${s.courseGroup.label.replace(" · ", " ")}` : "Sin curso"}</small></span>
          {openCount.get(s.id) ? <span className="picker-count" title="Observaciones abiertas">{openCount.get(s.id)}</span> : null}
        </button></li>)}</ul> : <p className="helper-text">Ningún estudiante coincide.</p>}
      </aside>
      <div className="follow-panel">
        {selected ? <StudentFollowUp key={selected.id} student={{ id: selected.id, name: selected.fullName, course: selected.courseGroup?.label, initials: `${selected.firstName.charAt(0)}${selected.lastName.charAt(0)}` }} onSaved={() => void client.invalidateQueries({ queryKey: ["observations"] })} />
          : <div className="content-card empty-state"><UserRound size={34} aria-hidden="true" /><strong>Selecciona un estudiante</strong><p>Busca por nombre o código en la lista para ver su historial y registrar una observación.</p></div>}
      </div>
    </div>
  </section>;
}

function StudentFollowUp({ student, onSaved }: { student: { id: string; name: string; course?: string; initials: string }; onSaved: () => void }) {
  const client = useQueryClient();
  const observations = useQuery({ queryKey: ["observations", student.id], queryFn: () => api.getObservations(student.id) });
  const [draft, setDraft, clearDraft] = useDraft(`aulanexo:observacion:${student.id}`, { type: "Académica", description: "", priority: "NORMAL" as "LOW" | "NORMAL" | "HIGH", followUp: "" });
  const { type, description, priority, followUp } = draft;
  const setType = (value: string) => setDraft((d) => ({ ...d, type: value }));
  const setDescription = (value: string) => setDraft((d) => ({ ...d, description: value }));
  const setPriority = (value: "LOW" | "NORMAL" | "HIGH") => setDraft((d) => ({ ...d, priority: value }));
  const setFollowUp = (value: string) => setDraft((d) => ({ ...d, followUp: value }));
  const [drafts, setDrafts] = useState<Record<string, { status: ObservationDto["status"]; followUp: string }>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => setNotice(null), [student.id]);
  const create = useMutation({
    mutationFn: () => api.createObservation({ studentId: student.id, type, description, priority, followUp: followUp.trim() || undefined }),
    onSuccess: async () => { clearDraft(); setNotice({ tone: "success", text: "Observación guardada." }); onSaved(); await client.invalidateQueries({ queryKey: ["analytics"] }); },
    onError: (error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudo guardar." }),
  });
  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: string; status: ObservationDto["status"]; followUp?: string }) => api.updateObservation(id, input),
    onSuccess: () => { setNotice({ tone: "success", text: "Seguimiento actualizado." }); setDrafts({}); onSaved(); },
    onError: (error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "No se pudo actualizar." }),
  });
  const rows = observations.data?.items ?? [];

  return <>
    <article className="content-card">
      <div className="follow-head">
        <span className="mini-avatar" aria-hidden="true">{student.initials}</span>
        <div><h2>{student.name}</h2><p className="helper-text">{student.course ? `Curso ${student.course.replace(" · ", " ")}` : "Sin curso"}</p></div>
        <Link className="button button-ghost compact-button" to={`/students/${student.id}`}>Ver perfil</Link>
        <Link className="button button-secondary compact-button" to={`/reports/students/${student.id}`}><FileBarChart2 size={15} /> Informe PDF</Link>
      </div>
      {notice && <p className={`notice notice-${notice.tone}`} role="status">{notice.text}</p>}
      <form className="form-grid compact-form follow-form" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <label className="form-field"><span>Tipo</span><select value={type} onChange={(e) => setType(e.target.value)}><option>Académica</option><option>Convivencia</option><option>Bienestar</option><option>Seguimiento</option><option>Otro</option></select></label>
        <div className="form-field"><span>Prioridad</span><div className="segmented">{(["LOW", "NORMAL", "HIGH"] as const).map((p) => <button type="button" key={p} className={priority === p ? "is-active" : ""} aria-pressed={priority === p} onClick={() => setPriority(p)}>{priorityLabel[p]}</button>)}</div></div>
        <label className="form-field form-full"><span>¿Qué pasó?</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} required rows={3} /></label>
        <label className="form-field form-full"><span>Próximo paso (opcional)</span><input value={followUp} onChange={(e) => setFollowUp(e.target.value)} maxLength={2000} placeholder="Ej. Citar al acudiente el viernes" /></label>
        <div className="form-full form-buttons"><button className="button button-primary" disabled={create.isPending || !description.trim()}>{create.isPending ? "Guardando…" : "Guardar observación"}</button>{(description || followUp) && <><span className="helper-text draft-hint">Borrador guardado en este equipo</span><button type="button" className="button button-ghost compact-button" onClick={() => { if (window.confirm("¿Descartar lo escrito?")) clearDraft(); }}>Descartar</button></>}</div>
      </form>
    </article>

    <article className="content-card">
      <div className="card-title-row"><h2>Historial</h2><span className="helper-text">{rows.length} {rows.length === 1 ? "observación" : "observaciones"}</span></div>
      {observations.isLoading ? <LoadingState label="Cargando historial…" /> : rows.length ? <div className="timeline-list">{rows.map((o) => {
        const draft = drafts[o.id] ?? { status: o.status, followUp: o.followUp ?? "" };
        const changed = draft.status !== o.status || draft.followUp !== (o.followUp ?? "");
        return <article className={`timeline-item priority-border-${o.priority.toLowerCase()}`} key={o.id}>
          <div className="timeline-top"><div><strong>{o.type}</strong><span className={`priority priority-${o.priority.toLowerCase()}`}>{priorityLabel[o.priority]}</span></div><time>{new Date(o.observedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })}</time></div>
          <p>{o.description}</p>
          <div className="timeline-controls">
            <select aria-label="Estado" value={draft.status} onChange={(e) => setDrafts((c) => ({ ...c, [o.id]: { ...draft, status: e.target.value as ObservationDto["status"] } }))}>{(Object.keys(statusLabel) as ObservationDto["status"][]).map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</select>
            <input aria-label="Próximo paso" placeholder="Próximo paso" value={draft.followUp} maxLength={2000} onChange={(e) => setDrafts((c) => ({ ...c, [o.id]: { ...draft, followUp: e.target.value } }))} />
            {changed && <button className="button button-secondary compact-button" onClick={() => update.mutate({ id: o.id, status: draft.status, followUp: draft.followUp.trim() || undefined })} disabled={update.isPending}>Guardar</button>}
          </div>
        </article>;
      })}</div> : <p className="empty-state">Este estudiante no tiene observaciones todavía.</p>}
    </article>
  </>;
}
