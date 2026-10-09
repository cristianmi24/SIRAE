import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { Byline } from "../components/Byline";
import { DownloadPdfButton } from "../components/DownloadPdfButton";
import { api, type StudentReportDto } from "../services/api";
import { ReportHeader, ReportSection, ReportEmpty, fmtGrade } from "../features/reports/ReportParts";

const priorityLabel: Record<string, string> = { HIGH: "Prioridad alta", NORMAL: "Prioridad normal", LOW: "Prioridad baja" };
const statusLabel: Record<string, string> = { OPEN: "Abierta", IN_PROGRESS: "En seguimiento", CLOSED: "Cerrada" };

function subjectRows(data: StudentReportDto) {
  const map = new Map<string, { period: string; subject: string; total: number; weight: number }>();
  for (const c of data.grades.categories) {
    if (c.average === undefined || !c.weightPercent) continue;
    const key = `${c.periodId}|${c.subjectId}`;
    const row = map.get(key) ?? { period: c.periodName, subject: c.subjectName, total: 0, weight: 0 };
    row.total += c.average * c.weightPercent; row.weight += c.weightPercent; map.set(key, row);
  }
  return [...map.values()].map((row) => ({ period: row.period, subject: row.subject, average: row.total / row.weight }));
}

function synthesis(d: StudentReportDto) {
  const parts = [
    d.attendancePercent !== undefined ? `asistió al ${d.attendancePercent}% de las ${d.sessionCount} clases cerradas` : undefined,
    d.attendance.late ? `con ${d.attendance.late} ${d.attendance.late === 1 ? "llegada tarde" : "llegadas tarde"}` : undefined,
    d.grades.average !== undefined ? `su promedio del periodo más reciente es ${fmtGrade(d.grades.average)}${d.grades.performance ? ` (${d.grades.performance})` : ""}` : undefined,
    d.observations.length ? `tiene ${d.observations.length} ${d.observations.length === 1 ? "observación registrada" : "observaciones registradas"}` : undefined,
  ].filter(Boolean);
  if (!parts.length) return "";
  return `${d.studentName} ${parts.join(", ")}. Esta síntesis describe únicamente los datos registrados; una coincidencia entre asistencia y rendimiento no demuestra que una cause la otra.`;
}

export function StudentReportPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const filters = Object.fromEntries([...params.entries()].filter(([, v]) => v));
  const report = useQuery({ queryKey: ["studentReport", id, filters], queryFn: () => api.getStudentReport(id, filters), enabled: Boolean(id) });
  if (report.isLoading) return <LoadingState label="Preparando el informe…" />;
  if (report.error || !report.data) return <div className="page"><ErrorPanel title="No se pudo preparar el informe" detail={report.error instanceof Error ? report.error.message : undefined} /></div>;
  const d = report.data; const a = d.attendance;
  const total = a.present + a.late + a.absent + a.justified + a.pendingReview;
  const rows = subjectRows(d);
  const text = synthesis(d);
  const parts = [{ v: a.present, c: "var(--green)" }, { v: a.late, c: "var(--amber)" }, { v: a.justified, c: "var(--blue)" }, { v: a.absent, c: "var(--coral)" }, { v: a.pendingReview, c: "var(--slate)" }];

  return <div className="page report-page">
    <div className="report-toolbar no-print"><Link className="back-link" to="/reports"><ArrowLeft size={16} /> Reportes</Link><DownloadPdfButton onDownload={() => api.downloadReport(id, filters)} /></div>
    <article className="report-sheet">
      <ReportHeader institution={d.institutionName} subtitle="Informe académico individual" generatedAt={d.generatedAt} />
      <div className="report-title">
        <p className="report-kicker">Registro de desempeño estudiantil</p>
        <h1>{d.studentName}</h1>
        <div className="report-facts"><div><small>Código</small><span>{d.documentNumber}</span></div><div><small>Curso</small><span>{d.groupLabel}</span></div></div>
      </div>
      <div className="report-filters"><span><b>Periodo</b> {d.periodName}</span><span><b>Asignatura</b> {d.subjectName}</span><span><b>Rango</b> {d.fromKey ?? "Sin inicio"} – {d.toKey ?? "Sin fin"}</span></div>

      <ReportSection number="01" title="Asistencia">
        <div className="report-metrics">
          {[["Clases cerradas", d.sessionCount], ["Asistencia", d.attendancePercent === undefined ? "Sin datos" : `${d.attendancePercent}%`], ["A tiempo", a.present], ["Tarde", a.late], ["Ausencias", a.absent], ["Justificadas", a.justified], ["Por revisar", a.pendingReview]].map(([label, value]) => <div key={label as string}><strong>{value}</strong><span>{label}</span></div>)}
        </div>
        <div className="report-bar" role="img" aria-label="Distribución de la asistencia">{total ? parts.map((p, i) => p.v > 0 && <i key={i} style={{ width: `${(p.v / total) * 100}%`, background: p.c }} />) : <i className="empty" />}</div>
        {!total && <ReportEmpty>Aún no hay clases registradas para este filtro.</ReportEmpty>}
      </ReportSection>

      <ReportSection number="02" title="Rendimiento por periodo">
        {rows.length ? <table className="report-table"><thead><tr><th>Periodo</th><th>Asignatura</th><th className="num">Definitiva</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i}><td>{r.period}</td><td>{r.subject}</td><td className="num">{fmtGrade(r.average)}</td></tr>)}</tbody></table> : <ReportEmpty>No hay calificaciones registradas con los filtros elegidos.</ReportEmpty>}
        <div className="report-highlight"><span>Promedio del periodo más reciente</span><strong>{d.grades.average === undefined ? "Sin datos" : `${fmtGrade(d.grades.average)}${d.grades.performance ? ` · ${d.grades.performance}` : ""}`}</strong></div>
      </ReportSection>

      <ReportSection number="03" title="Notas registradas">
        {d.grades.assessments.length ? <table className="report-table"><thead><tr><th>Nota</th><th>Asignatura</th><th>Periodo</th><th className="num">Valor</th></tr></thead><tbody>{d.grades.assessments.map((x, i) => <tr key={i}><td>{x.name}{x.feedback && <small className="report-note">{x.feedback}</small>}</td><td>{x.subjectName}</td><td>{x.periodName}</td><td className="num"><b>{fmtGrade(x.value)}</b></td></tr>)}</tbody></table> : <ReportEmpty>No hay notas registradas con los filtros elegidos.</ReportEmpty>}
      </ReportSection>

      <ReportSection number="04" title="Observaciones y seguimiento">
        {d.observations.length ? <ol className="report-timeline">{d.observations.map((o, i) => <li key={i}><div className="report-meta">{new Date(o.observedAt).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" })} · {o.type} · {priorityLabel[o.priority] ?? o.priority} · {statusLabel[o.status] ?? o.status}</div><p>{o.description}</p>{o.followUp && <p className="report-note">Próximo paso: {o.followUp}</p>}</li>)}</ol> : <ReportEmpty>No hay observaciones en el rango elegido.</ReportEmpty>}
      </ReportSection>

      <ReportSection number="05" title="Síntesis">
        {text ? <p className="report-synthesis">{text}</p> : <ReportEmpty>Todavía no hay datos suficientes para escribir una síntesis.</ReportEmpty>}
      </ReportSection>
      <footer className="report-footer"><span>Documento confidencial. Acceso según los permisos de {d.institutionName}.</span><span>{d.documentNumber}</span></footer>
      <div className="report-watermark"><Byline variant="print" /></div>
    </article>
  </div>;
}
