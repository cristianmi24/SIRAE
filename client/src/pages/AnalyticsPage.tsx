import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { LoadingState } from "../components/Feedback";
import { api } from "../services/api";

export function AnalyticsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [courseGroupId, setCourseGroupId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [studentId, setStudentId] = useState("");
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.getCourseGroups });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const periods = useQuery({ queryKey: ["periods"], queryFn: api.getPeriods });
  const students = useQuery({ queryKey: ["students", "analytics"], queryFn: () => api.getAllStudents("ACTIVO") });
  const filters = { ...(from ? { from } : {}), ...(to ? { to } : {}), ...(courseGroupId ? { courseGroupId } : {}), ...(subjectId ? { subjectId } : {}), ...(periodId ? { periodId } : {}), ...(studentId ? { studentId } : {}) };
  const result = useQuery({ queryKey: ["analytics", filters], queryFn: () => api.getAnalytics(filters) });
  if (result.isLoading) return <LoadingState label="Calculando indicadores…" />;
  if (result.error) return <section className="page"><p className="notice notice-error" role="alert">{result.error instanceof Error ? result.error.message : "No se pudieron calcular los indicadores."}</p></section>;
  const data = result.data!;
  const relationPoints = data.students.filter((student) => student.attendancePercent !== undefined && student.performancePercent !== undefined);
  const thresholds = data.thresholds;
  return <section className="page">
    <div className="page-heading"><div><h1>Análisis</h1><p className="page-subtitle">Cómo va la asistencia y el rendimiento. Filtra por curso, materia, periodo o estudiante.</p></div></div>
    <article className="content-card filter-card"><div className="filter-bar analytics-filters">
      <label className="form-field"><span>Desde</span><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="form-field"><span>Hasta</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <label className="form-field"><span>Estudiante</span><select value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Todos los estudiantes</option>{(students.data?.items ?? []).map((student) => <option key={student.id} value={student.id}>{student.fullName}</option>)}</select></label>
      <label className="form-field"><span>Curso</span><select value={courseGroupId} onChange={(event) => setCourseGroupId(event.target.value)}><option value="">Todos los cursos</option>{(groups.data?.items ?? []).map((group) => <option key={group.id} value={group.id}>{group.label}</option>)}</select></label>
      <label className="form-field"><span>Materia</span><select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Todas</option>{(subjects.data?.items ?? []).map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></label>
      <label className="form-field"><span>Periodo</span><select value={periodId} onChange={(event) => setPeriodId(event.target.value)}><option value="">Todos</option>{(periods.data?.items ?? []).map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}</select></label>
    </div></article>

    <div className="metric-grid four-cols" aria-label="Indicadores filtrados">
      <Metric label="Estudiantes" value={data.totals.students} hint="Con matrícula activa" />
      <Metric label="Presentes a tiempo" value={data.totals.present} hint="Sesiones cerradas" />
      <Metric label="Tardanzas" value={data.totals.late} hint="Llegadas registradas" />
      <Metric label="Ausentes" value={data.totals.absent} hint="Sesiones cerradas" />
      <Metric label="Justificadas" value={data.totals.justified} hint="Incluidas como asistencia" />
      <Metric label="Pendientes de revisión" value={data.students.reduce((total, student) => total + student.pendingReview, 0)} hint="Sin asignar hasta revisión docente" />
      <Metric label="Asistencia" value={`${data.totals.attendancePercent}%`} hint="Sobre sesiones evaluables" />
      <Metric label="Puntualidad" value={`${data.totals.punctualityPercent}%`} hint="Sobre registros a tiempo y tarde" />
    </div>

    <div className="analytics-columns">
      <article className="content-card chart-card"><div className="card-title-row"><h2>Tendencia de asistencia</h2><span className="helper-text">Sesiones cerradas · conteos por fecha</span></div>
        {data.trend.length ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><LineChart data={data.trend}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaec" /><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="present" name="A tiempo" stroke="#27815b" /><Line type="monotone" dataKey="late" name="Tarde" stroke="#d19b31" /><Line type="monotone" dataKey="absent" name="Ausente" stroke="#bd5e57" /><Line type="monotone" dataKey="justified" name="Justificada" stroke="#547a94" /><Line type="monotone" dataKey="pendingReview" name="Pendiente de revisión" stroke="#7c6ba3" strokeDasharray="4 4" /></LineChart></ResponsiveContainer></div> : <p className="helper-text">Aún no hay sesiones cerradas para graficar.</p>}
      </article>
      <article className="content-card chart-card"><div className="card-title-row"><h2>Relación observada</h2><span className="helper-text">Cada punto es un estudiante</span></div>
        {relationPoints.length ? <div className="chart-box"><ResponsiveContainer width="100%" height={300}><ScatterChart margin={{ top: 16, right: 22, bottom: 18, left: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#e3eaec" /><XAxis type="number" dataKey="attendancePercent" name="Asistencia" unit="%" domain={[0, 100]} label={{ value: "Asistencia (%)", position: "insideBottom", offset: -10 }} /><YAxis type="number" dataKey="performancePercent" name="Rendimiento normalizado" unit="%" domain={[0, 100]} /><ZAxis type="category" dataKey="name" name="Estudiante" /><Tooltip cursor={{ strokeDasharray: "3 3" }} /><Scatter name="Estudiante" data={relationPoints} fill="#173f5f" /></ScatterChart></ResponsiveContainer></div> : <p className="helper-text">Se requieren sesiones cerradas y notas registradas dentro de un periodo con escala definida para mostrar puntos comparables.</p>}
        <p className="notice notice-info">{data.interpretation} Una posible relación estadística no demuestra causalidad ni reemplaza la valoración docente.</p>
      </article>
    </div>

    <div className="analytics-columns">
      <article className="content-card"><h2>Alertas y seguimiento</h2><p className="helper-text">Umbrales: asistencia baja &lt; {thresholds.attendanceLowPercent}%; asistencia alta ≥ {thresholds.attendanceHighPercent}%; rendimiento normalizado bajo ≤ {thresholds.performanceLowPercent}%; alto ≥ {thresholds.performanceHighPercent}%; tardanzas ≥ {thresholds.lateCount}; ausencias consecutivas ≥ {thresholds.consecutiveAbsences}.</p>
        {data.alerts.length ? <ul className="alert-list">{data.alerts.map((alert, index) => <li key={`${alert.studentId}-${alert.type}-${index}`}><span className={`alert-indicator alert-${alert.type.toLowerCase()}`} /><div><strong><Link className="student-name" to={`/students/${alert.studentId}`}>{alert.studentName}</Link></strong><p>{alert.message}</p></div></li>)}</ul> : <p className="empty-state">No se detectaron alertas con los filtros elegidos.</p>}
      </article>
      <article className="content-card"><h2>Evolución normalizada</h2><p className="helper-text">La nota se lleva a un porcentaje del rango válido de cada periodo antes de comparar tendencias.</p>
        {data.students.some((student) => student.periodTrend.length) ? <div className="student-trends">{data.students.filter((student) => student.periodTrend.length).map((student) => <div className="student-trend" key={student.id}><strong><Link className="student-name" to={`/students/${student.id}`}>{student.name}</Link></strong><span>{student.periodTrend.map((period) => `${period.periodName}: ${period.performancePercent ?? "—"}%`).join(" → ")}</span></div>)}</div> : <p className="helper-text">Aún no hay notas suficientes para comparar periodos.</p>}
      </article>
    </div>

    <article className="content-card"><h2>Detalle por estudiante</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>Estudiante</th><th>Asistencia</th><th>Puntualidad</th><th>Promedio último periodo</th><th>Escala/desempeño</th><th>Patrón descriptivo</th></tr></thead><tbody>{data.students.map((student) => <tr key={student.id}><td><Link className="student-name" to={`/students/${student.id}`}>{student.name}</Link></td><td>{student.attendancePercent === undefined ? "Sin datos" : `${student.attendancePercent}%`}</td><td>{student.punctualityPercent === undefined ? "Sin datos" : `${student.punctualityPercent}%`}</td><td>{student.average === undefined ? "Sin datos" : student.average.toFixed(2)}</td><td>{student.performance ?? "—"}{student.performancePercent !== undefined ? ` · ${student.performancePercent}%` : ""}</td><td>{student.pattern === "LOW_ATTENDANCE_LOW_PERFORMANCE" ? "Posible atención" : student.pattern === "HIGH_ATTENDANCE_HIGH_PERFORMANCE" ? "Posible relación alta" : "—"}</td></tr>)}</tbody></table></div></article>
  </section>;
}

function Metric({ label, value, hint }: { label: string; value: string | number; hint: string }) { return <article className="metric-card"><span className="metric-label">{label}</span><div className="metric-value">{value}</div><p className="metric-hint">{hint}</p></article>; }
