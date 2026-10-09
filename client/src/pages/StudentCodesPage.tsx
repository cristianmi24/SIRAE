import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { Byline } from "../components/Byline";
import { DownloadPdfButton } from "../components/DownloadPdfButton";
import { api } from "../services/api";

// Tarjetas recortables con el nombre y el código de cada estudiante, para entregar en clase.
export function StudentCodesPage() {
  const [params] = useSearchParams();
  const courseId = params.get("curso") ?? "";
  const students = useQuery({ queryKey: ["students", "codes"], queryFn: () => api.getAllStudents("ACTIVO") });
  if (students.isLoading) return <LoadingState label="Preparando códigos…" />;
  if (students.error) return <div className="page"><ErrorPanel title="No se pudieron cargar los códigos" detail={students.error instanceof Error ? students.error.message : undefined} /></div>;
  const rows = (students.data?.items ?? []).filter((s) => !courseId || s.courseGroup?.id === courseId).sort((a, b) => (a.courseGroup?.label ?? "").localeCompare(b.courseGroup?.label ?? "") || a.lastName.localeCompare(b.lastName));
  const courseLabel = courseId ? rows[0]?.courseGroup?.label : undefined;
  return <div className="page report-page">
    <div className="report-toolbar no-print"><Link className="back-link" to="/students"><ArrowLeft size={16} /> Estudiantes</Link><DownloadPdfButton onDownload={() => api.downloadStudentCodesPdf(courseId || undefined)} label="Descargar PDF" /></div>
    <article className="report-sheet">
      <header className="report-header"><div className="report-brand"><img className="report-logo" src="/sirae-logo.webp" alt="SIRAE" width={96} height={63} /><div><strong>SIRAE</strong><small>Códigos de asistencia</small></div></div></header>
      <div className="report-title"><p className="report-kicker">Códigos de asistencia</p><h1>{courseLabel ? `Curso ${courseLabel.replace(" · ", " ")}` : "Todos los cursos"}</h1><p className="helper-text">Recorta y entrega a cada estudiante su código. Con él registra su asistencia en el enlace que abra el docente.</p></div>
      {rows.length ? <div className="code-cards">{rows.map((s) => <div className="code-card" key={s.id}><span>{s.fullName}</span><strong>{s.document}</strong><small>{s.courseGroup ? `Curso ${s.courseGroup.label.replace(" · ", " ")}` : "Sin curso"}</small></div>)}</div> : <p className="report-empty">No hay estudiantes activos.</p>}
      <div className="report-watermark"><Byline variant="print" /></div>
    </article>
  </div>;
}
