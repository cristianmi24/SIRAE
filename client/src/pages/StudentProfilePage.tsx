import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileBarChart2, Pencil, QrCode, UserRoundPlus, UserRoundX } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useParams } from "react-router-dom";
import { useState } from "react";
import type { StudentDto } from "../../../shared/types";
import { ErrorPanel, LoadingState, QrDialog, StatusChip } from "../components/Feedback";
import { StudentForm } from "../features/students/StudentForm";
import { ApiClientError, api, type QrDelivery } from "../services/api";

export function StudentProfilePage() {
  const { id = "" } = useParams();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [qr, setQr] = useState<{ student: StudentDto; result: QrDelivery }>();
  const student = useQuery({ queryKey: ["student", id], queryFn: () => api.getStudent(id), enabled: Boolean(id) });
  const analytics = useQuery({ queryKey: ["analytics", "student", id], queryFn: () => api.getAnalytics({ studentId: id }), enabled: Boolean(id) });
  const grades = useQuery({ queryKey: ["grades", "student", id], queryFn: () => api.getGrades({ studentId: id }), enabled: Boolean(id) });
  const observations = useQuery({ queryKey: ["observations", "student", id], queryFn: () => api.getObservations(id), enabled: Boolean(id) });
  const regenerate = useMutation({ mutationFn: () => api.regenerateStudentQr(id), onSuccess: async (result) => { await client.invalidateQueries({ queryKey: ["student", id] }); setQr({ student: result.student, result: result.qr }); }, onError: async () => { await client.invalidateQueries({ queryKey: ["student", id] }); } });
  const deactivate = useMutation({ mutationFn: () => api.deactivateStudent(id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["student", id] }); await client.invalidateQueries({ queryKey: ["students"] }); }, onError: async () => { await client.invalidateQueries({ queryKey: ["student", id] }); } });
  const reactivate = useMutation({ mutationFn: () => api.reactivateStudent(id), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["student", id] }); await client.invalidateQueries({ queryKey: ["students"] }); }, onError: async () => { await client.invalidateQueries({ queryKey: ["student", id] }); } });
  const actionError = (regenerate.error || deactivate.error || reactivate.error) as ApiClientError | null;

  if (student.isLoading) return <LoadingState label="Cargando el perfil del estudiante…" />;
  if (student.error || !student.data?.item) return <div className="page"><ErrorPanel title="No se encontró el perfil" detail={student.error?.message} /><Link className="button button-secondary" to="/students"><ArrowLeft size={18} /> Volver a estudiantes</Link></div>;

  const item = student.data.item;
  const metrics = analytics.data?.students.find((entry) => entry.id === id);
  const gradeRows = grades.data?.items ?? [];
  const obs = observations.data?.items ?? [];
  const active = item.status === "ACTIVO";
  return <div className="page">
    <Link className="back-link" to="/students"><ArrowLeft size={16} /> Estudiantes</Link>
    <section className="content-card profile-header"><div><h1>{item.fullName}</h1><div className="profile-meta"><span>Código: <strong className="code-tag">{item.document}</strong></span><span>{item.courseGroup?.label || "Curso y grupo sin asignar"}</span><StatusChip status={item.status} /></div></div>
      <div className="profile-actions"><button className="button button-secondary" onClick={() => setEditing(true)}><Pencil size={17} /> Editar</button><Link className="button button-secondary" to={`/reports/students/${id}`}><FileBarChart2 size={17} /> Informe PDF</Link>
        {active ? <><button className="button button-primary" onClick={() => { if (window.confirm("Regenerar el QR invalidará el código anterior. ¿Deseas continuar?")) regenerate.mutate(); }} disabled={regenerate.isPending}><QrCode size={17} />{regenerate.isPending ? "Generando…" : "Regenerar QR"}</button><button className="button button-danger" onClick={() => { if (window.confirm("El estudiante quedará inactivo, se invalidará el QR y no podrá registrar asistencia. ¿Deseas continuar?")) deactivate.mutate(); }} disabled={deactivate.isPending}><UserRoundX size={17} /> Desactivar</button></> : <button className="button button-primary" onClick={() => reactivate.mutate()} disabled={reactivate.isPending}><UserRoundPlus size={17} />{reactivate.isPending ? "Reactivando…" : "Reactivar estudiante"}</button>}
      </div>
    </section>
    {actionError && <ErrorPanel title="No se pudo completar la acción" detail={actionError.message} />}
    <section className="metric-grid four-cols profile-metrics" aria-label="Resumen del estudiante">
      <Metric label="Asistencia" value={metrics?.attendancePercent !== undefined ? `${metrics.attendancePercent}%` : "Sin datos"} hint={`${metrics?.present ?? 0} a tiempo · ${metrics?.late ?? 0} tardanzas`} />
      <Metric label="Ausencias" value={`${metrics?.absent ?? 0}`} hint={`${metrics?.justified ?? 0} justificadas · ${metrics?.pendingReview ?? 0} pendientes de revisión`} />
      <Metric label="Promedio" value={metrics?.average !== undefined ? String(metrics.average) : "Sin datos"} hint={metrics?.performance ?? "Aún no hay notas suficientes"} />
      <Metric label="Actividades calificadas" value={`${gradeRows.length}`} hint="Calificaciones almacenadas" />
    </section>
    <section className="dashboard-columns">
      <article className="content-card"><h2>Datos registrados</h2><dl className="details-list"><div><dt>Nombre completo</dt><dd>{item.fullName}</dd></div><div><dt>Código de asistencia</dt><dd>{item.document}</dd></div><div><dt>Curso / grupo</dt><dd>{item.courseGroup?.label || "No asignado"}</dd></div><div><dt>Código QR</dt><dd>{active ? `Versión ${item.qrVersion} · token opaco; se entrega al generarlo y no se conserva en texto recuperable.` : "El código anterior fue invalidado. Reactiva al estudiante y emite un QR nuevo."}</dd></div></dl></article>
      <article className="content-card"><h2>Resumen académico</h2><p className="helper-text">{metrics?.average !== undefined ? `Promedio ${metrics.average}${metrics.performance ? ` (${metrics.performance})` : ""} en las calificaciones disponibles. ` : "No hay calificaciones suficientes para calcular un promedio. "}{metrics?.totalSessions ? `${metrics.totalSessions} sesiones cerradas consideradas; asistencia ${metrics.attendancePercent ?? "sin dato"}%.` : "No hay sesiones cerradas para calcular asistencia."}</p><p className="helper-text">Esta síntesis describe los registros consultados; no atribuye causalidad entre asistencia y rendimiento.</p><Link className="student-name" to={`/observations?studentId=${encodeURIComponent(id)}`}>Abrir seguimientos del estudiante</Link></article>
    </section>

    <article className="content-card"><div className="card-title-row"><div><h2>Rendimiento por periodo académico</h2></div></div><p className="helper-text">Los promedios se muestran en la escala original de cada periodo y como porcentaje normalizado de su rango, para evitar comparar directamente escalas incompatibles.</p>
      {analytics.isLoading ? <LoadingState label="Calculando evolución…" /> : analytics.error ? <p className="notice notice-error" role="alert">{analytics.error instanceof Error ? analytics.error.message : "No se pudo calcular la evolución."}</p> : metrics?.periodTrend.length ? <><div className="chart-box"><ResponsiveContainer width="100%" height={270}><LineChart data={metrics.periodTrend}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaec" /><XAxis dataKey="periodName" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(value) => [`${value}%`, "Rendimiento normalizado"]} /><Line type="monotone" dataKey="performancePercent" name="Rendimiento normalizado" stroke="#173f5f" strokeWidth={3} connectNulls dot={{ r: 5 }} /></LineChart></ResponsiveContainer></div><div className="table-scroll"><table className="data-table"><thead><tr><th>Periodo</th><th>Promedio original</th><th>Nivel</th><th>Rango normalizado</th></tr></thead><tbody>{metrics.periodTrend.map((period) => <tr key={period.periodId}><td>{period.periodName}</td><td>{period.average}</td><td>{period.performance ?? "Sin nivel"}</td><td>{period.performancePercent === undefined ? "Sin datos" : `${period.performancePercent}%`}</td></tr>)}</tbody></table></div></> : <p className="empty-state">Todavía no hay actividades calificadas para construir una evolución.</p>}
    </article>

    <article className="content-card"><div className="card-title-row"><h2>Calificaciones e historial de actividades</h2><Link className="button button-secondary compact-button" to="/academic">Ir a notas</Link></div>{grades.isLoading ? <LoadingState label="Cargando calificaciones…" /> : grades.error ? <p className="notice notice-error" role="alert">{grades.error instanceof Error ? grades.error.message : "No se pudieron cargar las calificaciones."}</p> : gradeRows.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Actividad</th><th>Periodo</th><th>Nota</th><th>Retroalimentación</th></tr></thead><tbody>{gradeRows.map((entry) => <tr key={entry.id}><td>{entry.assessment.name}</td><td>{entry.assessment.periodName}</td><td><strong>{entry.value}</strong></td><td>{entry.feedback || "—"}</td></tr>)}</tbody></table></div> : <p className="helper-text">No hay calificaciones almacenadas para este estudiante.</p>}</article>

    <article className="content-card"><div className="card-title-row"><h2>Observaciones y seguimiento</h2><Link className="button button-secondary compact-button" to={`/observations?studentId=${encodeURIComponent(id)}`}>Ver historial</Link></div>{observations.isLoading ? <LoadingState label="Cargando observaciones…" /> : observations.error ? <p className="notice notice-error" role="alert">{observations.error instanceof Error ? observations.error.message : "No se pudieron cargar las observaciones."}</p> : obs.length ? <div className="timeline-list">{obs.slice(0, 8).map((observation) => <div className="timeline-item" key={observation.id}><div className="timeline-top"><strong>{observation.type}<span className={`priority priority-${observation.priority.toLowerCase()}`}>{observation.priority === "HIGH" ? "Alta" : observation.priority === "LOW" ? "Baja" : "Normal"}</span></strong><time>{new Date(observation.observedAt).toLocaleDateString()}</time></div><p>{observation.description}</p>{observation.followUp && <p className="helper-text">Seguimiento: {observation.followUp}</p>}</div>)}</div> : <p className="helper-text">No hay observaciones guardadas.</p>}</article>

    {editing && <StudentForm student={item} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); void client.invalidateQueries({ queryKey: ["students"] }); }} />}
    {qr && <QrDialog studentName={qr.student.fullName} result={qr.result} onClose={() => setQr(undefined)} />}
  </div>;
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) { return <article className="metric-card"><div className="metric-label">{label}</div><div className="metric-value profile-metric-value">{value}</div><div className="metric-hint">{hint}</div></article>; }
