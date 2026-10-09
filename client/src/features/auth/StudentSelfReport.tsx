import { LogOut } from "lucide-react";
import { api, type StudentSelfReportDto } from "../../services/api";
import { DownloadPdfButton } from "../../components/DownloadPdfButton";
import { Byline } from "../../components/Byline";
import { ReportEmpty, ReportSection, fmtGrade } from "../reports/ReportParts";

// Historial del estudiante en formato de informe: asistencia (días y horas) y notas hasta hoy.
export function StudentSelfReport({ report: r, query, onExit }: { report: StudentSelfReportDto; query: { code?: string; tokenHash?: string }; onExit: () => void }) {
  const a = r.attendance;
  const metrics: [string, string | number][] = [["Clases", a.classes], ["Asistencia", a.percent === undefined ? "Sin datos" : `${a.percent}%`], ["A tiempo", a.present], ["Tarde", a.late], ["No llegó", a.absent], ["Justificadas", a.justified]];
  return <main className="page report-page self-report">
    <div className="report-toolbar no-print"><button className="button button-secondary" onClick={onExit}><LogOut size={17} /> Salir</button><DownloadPdfButton onDownload={() => api.downloadStudentSelfReport(query)} /></div>
    <article className="report-sheet">
      <header className="report-header">
        <div className="report-brand"><img className="report-logo" src="/sirae-logo.webp" alt="SIRAE" width={96} height={63} /><div><strong>{r.institution}</strong><small>Mi historial académico</small></div></div>
        <div className="report-generated"><small>Consultado</small><span>{new Date(r.generatedAt).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span></div>
      </header>
      <div className="report-title"><p className="report-kicker">Historial hasta hoy</p><h1>{r.student.name}</h1><div className="report-facts"><div><small>Código</small><span>{r.student.code}</span></div><div><small>Curso</small><span>{r.student.course ?? "Sin curso"}</span></div></div></div>

      <ReportSection number="01" title="Asistencia">
        <div className="report-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        {r.history.length ? <table className="report-table"><thead><tr><th>Día</th><th>Clase</th><th>Estado</th><th className="num">Hora de entrada</th></tr></thead>
          <tbody>{r.history.map((h, i) => <tr key={i}><td>{h.date}</td><td>{h.subject}</td><td><span className={`self-status status-${h.status.toLowerCase()}`}>{h.statusLabel}</span></td><td className="num">{h.time ?? "—"}</td></tr>)}</tbody></table>
          : <ReportEmpty>Todavía no hay asistencias registradas.</ReportEmpty>}
      </ReportSection>

      <ReportSection number="02" title="Notas">
        {r.grades.periods.length > 0 && <table className="report-table"><thead><tr><th>Periodo</th><th className="num">Promedio</th><th>Nivel</th></tr></thead><tbody>{r.grades.periods.map((p) => <tr key={p.name}><td>{p.name}</td><td className="num"><b>{fmtGrade(p.average)}</b></td><td>{p.performance ?? "—"}</td></tr>)}</tbody></table>}
        {r.grades.assessments.length ? <table className="report-table"><thead><tr><th>Nota</th><th>Asignatura</th><th>Periodo</th><th className="num">Valor</th></tr></thead><tbody>{r.grades.assessments.map((x, i) => <tr key={i}><td>{x.name}{x.feedback && <small className="report-note">{x.feedback}</small>}</td><td>{x.subject}</td><td>{x.period}</td><td className="num"><b>{fmtGrade(x.value)}</b></td></tr>)}</tbody></table> : <ReportEmpty>Todavía no tienes notas registradas.</ReportEmpty>}
        <div className="report-highlight"><span>Promedio del periodo más reciente</span><strong>{r.grades.average === undefined ? "Sin datos" : `${fmtGrade(r.grades.average)}${r.grades.performance ? ` · ${r.grades.performance}` : ""}`}</strong></div>
      </ReportSection>
      <footer className="report-footer"><span>Consulta personal y de solo lectura. Si ves un error, habla con tu docente. <a className="no-print" href="/legal#estudiantes" target="_blank" rel="noreferrer">Privacidad</a></span><span>{r.student.code}</span></footer>
      <div className="report-watermark"><Byline variant="print" /></div>
    </article>
  </main>;
}
