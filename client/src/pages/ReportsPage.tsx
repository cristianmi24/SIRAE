import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, Search, Table2 } from "lucide-react";
import { api } from "../services/api";
import { LoadingState } from "../components/Feedback";

export function ReportsPage() {
  const navigate = useNavigate();
  const students = useQuery({ queryKey: ["students", "reports"], queryFn: () => api.getAllStudents("TODOS") });
  const periods = useQuery({ queryKey: ["periods"], queryFn: api.getPeriods });
  const subjects = useQuery({ queryKey: ["subjects"], queryFn: api.getSubjects });
  const groups = useQuery({ queryKey: ["groups"], queryFn: api.getCourseGroups });
  const [search, setSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [periodId, setPeriodId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [coursePeriodId, setCoursePeriodId] = useState("");
  const matches = useMemo(() => { const q = search.trim().toLowerCase(); return (students.data?.items ?? []).filter((s) => !q || `${s.fullName} ${s.document}`.toLowerCase().includes(q)).slice(0, 50); }, [students.data, search]);
  if (students.isLoading) return <LoadingState label="Cargando estudiantes…" />;
  const periodOptions = (periods.data?.items ?? []).map((p) => <option value={p.id} key={p.id}>{p.name}</option>);
  const openStudent = () => { const q = new URLSearchParams({ ...(periodId ? { periodId } : {}), ...(subjectId ? { subjectId } : {}) }); navigate(`/reports/students/${studentId}${q.size ? `?${q}` : ""}`); };

  return <section className="page">
    <div className="page-heading"><div><h1>Reportes PDF</h1><p className="page-subtitle">Arma el informe de un estudiante o la planilla de notas de un curso. Revisa la vista previa y descárgala en PDF.</p></div></div>
    <div className="feature-grid">
      <article className="content-card">
        <div className="card-title-row"><h2>Informe de un estudiante</h2><FileText size={18} className="muted" aria-hidden="true" /></div>
        <label className="search-field"><Search size={17} aria-hidden="true" /><input aria-label="Buscar estudiante" placeholder="Buscar por nombre o código" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <ul className="picker-list report-picker">{matches.map((s) => <li key={s.id}><button className={s.id === studentId ? "is-active" : ""} onClick={() => setStudentId(s.id)}><span className="mini-avatar" aria-hidden="true">{s.firstName.charAt(0)}{s.lastName.charAt(0)}</span><span><strong>{s.fullName}</strong><small>{s.courseGroup ? `Curso ${s.courseGroup.label.replace(" · ", " ")}` : s.document}</small></span></button></li>)}{!matches.length && <li className="helper-text">Ningún estudiante coincide.</li>}</ul>
        <div className="form-grid compact-form report-filters-form">
          <label className="form-field"><span>Periodo</span><select value={periodId} onChange={(e) => setPeriodId(e.target.value)}><option value="">Todos</option>{periodOptions}</select></label>
          <label className="form-field"><span>Asignatura</span><select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}><option value="">Todas</option>{(subjects.data?.items ?? []).map((s) => <option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
          <div className="form-full"><button className="button button-primary" disabled={!studentId} onClick={openStudent}>Ver informe</button></div>
        </div>
      </article>
      <article className="content-card">
        <div className="card-title-row"><h2>Notas por curso</h2><Table2 size={18} className="muted" aria-hidden="true" /></div>
        <p className="helper-text">Una tabla con la definitiva de cada estudiante en cada asignatura del curso.</p>
        <form className="form-grid compact-form" onSubmit={(e) => { e.preventDefault(); navigate(`/reports/courses/${courseId}${coursePeriodId ? `?periodId=${coursePeriodId}` : ""}`); }}>
          <label className="form-field"><span>Curso</span><select value={courseId} onChange={(e) => setCourseId(e.target.value)} required><option value="">Elige el curso</option>{(groups.data?.items ?? []).map((g) => <option value={g.id} key={g.id}>Curso {g.grade} {g.group}</option>)}</select></label>
          <label className="form-field"><span>Periodo</span><select value={coursePeriodId} onChange={(e) => setCoursePeriodId(e.target.value)}><option value="">Todos</option>{periodOptions}</select></label>
          <div className="form-full"><button className="button button-primary" disabled={!courseId}>Ver planilla</button></div>
        </form>
      </article>
    </div>
  </section>;
}
