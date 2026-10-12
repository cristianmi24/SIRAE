import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Inbox, Mail } from "lucide-react";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { api, type ComplaintDto, type ComplaintStatus } from "../services/api";
import { complaintRoleLabel, complaintStatusLabel, complaintTypeLabel } from "../features/complaints/labels";

const when = (iso?: string) => iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
type Filter = "ALL" | ComplaintStatus;

// Bandeja del administrador de la plataforma con las quejas y solicitudes del formulario público.
export function PlatformComplaintsPage() {
  const complaints = useQuery({ queryKey: ["platformComplaints"], queryFn: api.getComplaints, refetchInterval: 60_000 });
  const [filter, setFilter] = useState<Filter>("NUEVA");
  const items = useMemo(() => (complaints.data?.items ?? []).filter((item) => filter === "ALL" || item.status === filter), [complaints.data, filter]);
  if (complaints.isLoading) return <LoadingState label="Cargando quejas…" />;
  if (complaints.error || !complaints.data) return <section className="page"><ErrorPanel detail={complaints.error instanceof Error ? complaints.error.message : undefined} /></section>;
  const counts = complaints.data.counts;
  const total = counts.NUEVA + counts.EN_REVISION + counts.RESUELTA;
  return <section className="page">
    <div className="page-heading"><div><h1>Quejas y solicitudes</h1><p className="page-subtitle">Mensajes enviados desde el formulario público, incluidas las solicitudes de eliminación de datos (Ley 1581 de 2012).</p></div></div>
    <div className="chip-filter" role="tablist" aria-label="Estado">
      {([["NUEVA", `Nuevas (${counts.NUEVA})`], ["EN_REVISION", `En revisión (${counts.EN_REVISION})`], ["RESUELTA", `Resueltas (${counts.RESUELTA})`], ["ALL", `Todas (${total})`]] as [Filter, string][]).map(([value, label]) =>
        <button key={value} role="tab" aria-selected={filter === value} className={`filter-chip ${filter === value ? "is-active" : ""}`} onClick={() => setFilter(value)}>{label}</button>)}
    </div>
    {items.length === 0 ? <article className="content-card empty-card"><Inbox size={28} aria-hidden="true" /><h2>No hay solicitudes en esta lista</h2></article>
      : <div className="complaint-list">{items.map((item) => <ComplaintCard key={item.id} item={item} />)}</div>}
  </section>;
}

function ComplaintCard({ item }: { item: ComplaintDto }) {
  const client = useQueryClient();
  const [note, setNote] = useState(item.adminNote ?? "");
  const save = useMutation({ mutationFn: (status: ComplaintStatus) => api.updateComplaint(item.id, { status, adminNote: note }), onSuccess: () => client.invalidateQueries({ queryKey: ["platformComplaints"] }) });
  const reply = `mailto:${item.email}?subject=${encodeURIComponent(`SIRAE · Respuesta a su solicitud ${item.ticket}`)}`;
  return <article className={`content-card complaint-card status-${item.status.toLowerCase()}`}>
    <header className="complaint-head">
      <div><span className={`complaint-type ${item.type === "ELIMINACION_DATOS" ? "is-deletion" : ""}`}>{complaintTypeLabel[item.type]}</span><h2>{item.name}</h2><small>{complaintRoleLabel[item.requesterRole]} · {when(item.createdAt)}</small></div>
      <span className="code-tag">{item.ticket}</span>
    </header>
    <dl className="complaint-meta">
      <div><dt>Correo</dt><dd><a href={reply}>{item.email}</a></dd></div>
      {item.phone && <div><dt>Teléfono</dt><dd>{item.phone}</dd></div>}
      {item.institutionName && <div><dt>Institución o docente</dt><dd>{item.institutionName}</dd></div>}
      {item.studentName && <div><dt>Estudiante</dt><dd>{item.studentName}</dd></div>}
    </dl>
    <p className="complaint-message">{item.message}</p>
    <label className="form-field"><span>Nota interna</span><textarea rows={2} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Qué se hizo o a quién se remitió" /></label>
    <div className="complaint-actions">
      <span className={`status-chip complaint-status-${item.status.toLowerCase()}`}>{complaintStatusLabel[item.status]}{item.resolvedAt ? ` · ${when(item.resolvedAt)}` : ""}</span>
      <a className="button button-secondary compact-button" href={reply}><Mail size={16} /> Responder</a>
      {item.status !== "EN_REVISION" && <button className="button button-secondary compact-button" disabled={save.isPending} onClick={() => save.mutate("EN_REVISION")}>En revisión</button>}
      {item.status !== "RESUELTA" ? <button className="button button-primary compact-button" disabled={save.isPending} onClick={() => save.mutate("RESUELTA")}>Marcar resuelta</button>
        : <button className="button button-ghost compact-button" disabled={save.isPending} onClick={() => save.mutate("NUEVA")}>Reabrir</button>}
      {note !== (item.adminNote ?? "") && <button className="link-button" disabled={save.isPending} onClick={() => save.mutate(item.status)}>Guardar nota</button>}
    </div>
    {save.error && <p className="notice notice-error" role="alert">{save.error instanceof Error ? save.error.message : "No se pudo guardar."}</p>}
  </article>;
}
