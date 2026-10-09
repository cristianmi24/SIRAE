import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { Byline } from "../components/Byline";
import { DownloadPdfButton } from "../components/DownloadPdfButton";
import { api } from "../services/api";
import { ReportEmpty, ReportHeader, ReportSection, fmtGrade } from "../features/reports/ReportParts";

export function CourseGradesReportPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const periodId = params.get("periodId") ?? "";
  const report = useQuery({ queryKey: ["courseGradesReport", id, periodId], queryFn: () => api.getCourseGradesReport(id, periodId || undefined), enabled: Boolean(id) });
  if (report.isLoading) return <LoadingState label="Preparando la planilla del curso…" />;
  if (report.error || !report.data) return <div className="page"><ErrorPanel title="No se pudo preparar la planilla" detail={report.error instanceof Error ? report.error.message : undefined} /></div>;
  const d = report.data;
  const band = (value?: number) => value === undefined ? undefined : d.period?.scale.bands.find((b) => value >= b.min && value <= b.max)?.label;
  const low = d.period ? d.period.scale.bands[0] : undefined;
  const graded = d.students.filter((s) => s.average !== undefined);
  const courseAverage = graded.length ? graded.reduce((sum, s) => sum + s.average!, 0) / graded.length : undefined;

  return <div className="page report-page">
    <div className="report-toolbar no-print"><Link className="back-link" to="/reports"><ArrowLeft size={16} /> Reportes</Link><DownloadPdfButton onDownload={() => api.downloadCourseGradesPdf(id, periodId || undefined)} /></div>
    <article className="report-sheet report-wide">
      <ReportHeader institution={d.institutionName} subtitle="Planilla de notas por curso" generatedAt={d.generatedAt} />
      <div className="report-title">
        <p className="report-kicker">Consolidado de definitivas</p>
        <h1>Curso {d.course.label}</h1>
        <div className="report-facts"><div><small>Periodo</small><span>{d.period?.name ?? "Todos los periodos"}</span></div><div><small>Año</small><span>{d.course.academicYear}</span></div><div><small>Estudiantes</small><span>{d.students.length}</span></div></div>
      </div>
      <ReportSection number="01" title="Definitivas por asignatura">
        {!d.students.length ? <ReportEmpty>Este curso no tiene estudiantes activos.</ReportEmpty> : !d.subjects.length ? <ReportEmpty>Este curso no tiene asignaturas.</ReportEmpty> :
          <table className="report-table grade-sheet"><thead><tr><th className="num">#</th><th>Estudiante</th>{d.subjects.map((s) => <th key={s.id} className="num">{s.name}</th>)}<th className="num">Promedio</th></tr></thead>
            <tbody>{d.students.map((s, i) => <tr key={s.id}><td className="num muted">{i + 1}</td><td>{s.name}<small className="report-note">{s.document}</small></td>{d.subjects.map((sub) => { const v = s.grades[sub.id]; return <td key={sub.id} className={`num ${low && v !== undefined && v <= low.max ? "is-low" : ""}`}>{fmtGrade(v)}</td>; })}<td className="num"><b>{fmtGrade(s.average)}</b>{band(s.average) && <small className="report-note">{band(s.average)}</small>}</td></tr>)}</tbody>
          </table>}
        <div className="report-highlight"><span>Promedio del curso</span><strong>{courseAverage === undefined ? "Sin datos" : fmtGrade(courseAverage)}</strong></div>
        {low && <p className="report-note">Las notas resaltadas están en el nivel {low.label} ({low.min} a {low.max}).</p>}
      </ReportSection>
      <footer className="report-footer"><span>Documento confidencial. Acceso según los permisos de {d.institutionName}.</span><span>Curso {d.course.label}</span></footer>
      <div className="report-watermark"><Byline variant="print" /></div>
    </article>
  </div>;
}
