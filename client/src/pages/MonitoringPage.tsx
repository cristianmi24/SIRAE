import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { ErrorPanel, LoadingState } from "../components/Feedback";
import { api, type PlatformOverviewDto } from "../services/api";

const dateFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
function relative(value?: string) {
  if (!value) return "Nunca";
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 2) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Hace ${days} ${days === 1 ? "día" : "días"}`;
  return dateFormat.format(new Date(value));
}
function activityTone(value?: string) {
  if (!value) return "idle";
  const days = (Date.now() - new Date(value).getTime()) / 86400000;
  return days <= 7 ? "active" : days <= 30 ? "recent" : "idle";
}

export function MonitoringPage() {
  const overview = useQuery({ queryKey: ["platformOverview"], queryFn: api.getPlatformOverview, refetchInterval: 60_000 });
  const [tab, setTab] = useState<"teachers" | "institutions">("teachers");
  const [search, setSearch] = useState("");
  if (overview.isLoading) return <LoadingState label="Cargando la actividad de la plataforma…" />;
  if (overview.error || !overview.data) return <div className="page"><ErrorPanel title="No se pudo cargar el monitoreo" detail={overview.error instanceof Error ? overview.error.message : undefined} /></div>;
  const data = overview.data;
  const t = data.totals;
  return <section className="page">
    <div className="page-heading"><div><h1>Monitoreo de la plataforma</h1><p className="page-subtitle">Quién usa SIRAE, cuántos estudiantes hay registrados y cuándo fue la última actividad de cada docente.</p></div></div>
    <section className="metric-grid four-cols" aria-label="Totales">
      <Metric tone="blue" label="Docentes registrados" value={t.teachers} hint={`${t.activeTeachers7d} activos esta semana`} />
      <Metric tone="green" label="Activos en 30 días" value={t.activeTeachers30d} hint={t.teachers ? `${Math.round(t.activeTeachers30d * 100 / t.teachers)}% de los docentes` : "Sin docentes aún"} />
      <Metric tone="violet" label="Aulas e instituciones" value={t.personalClassrooms + t.institutions} hint={`${t.personalClassrooms} aulas personales · ${t.institutions} instituciones`} />
      <Metric tone="amber" label="Estudiantes" value={t.students} hint={`${t.courses} cursos creados`} />
    </section>
    <div className="usage-strip"><span><strong>{t.sessions}</strong> clases con asistencia</span><span><strong>{t.grades}</strong> notas registradas</span><span><strong>{t.observations}</strong> observaciones</span></div>

    <article className="content-card">
      <div className="card-title-row">
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "teachers"} className={tab === "teachers" ? "is-active" : ""} onClick={() => setTab("teachers")}>Docentes ({data.teachers.length})</button>
          <button role="tab" aria-selected={tab === "institutions"} className={tab === "institutions" ? "is-active" : ""} onClick={() => setTab("institutions")}>Aulas e instituciones ({data.institutions.length})</button>
        </div>
        <label className="search-field compact-search"><Search size={16} aria-hidden="true" /><input aria-label="Buscar" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {tab === "teachers" ? <TeacherTable rows={data.teachers} search={search} /> : <InstitutionTable rows={data.institutions} search={search} />}
    </article>
  </section>;
}

function useFiltered<T>(rows: T[], search: string, text: (row: T) => string) {
  return useMemo(() => { const q = search.trim().toLowerCase(); return q ? rows.filter((row) => text(row).toLowerCase().includes(q)) : rows; }, [rows, search, text]);
}

const teacherText = (row: PlatformOverviewDto["teachers"][number]) => `${row.name} ${row.email} ${row.institutionName ?? ""}`;
function TeacherTable({ rows, search }: { rows: PlatformOverviewDto["teachers"]; search: string }) {
  const filtered = useFiltered(rows, search, teacherText);
  if (!filtered.length) return <p className="empty-state">{rows.length ? "Nadie coincide con la búsqueda." : "Todavía no se ha registrado ningún docente."}</p>;
  return <div className="table-scroll"><table className="data-table">
    <thead><tr><th>Docente</th><th>Aula</th><th className="num">Estudiantes</th><th className="num">Cursos</th><th className="num">Clases</th><th>Última vez</th><th>Registro</th></tr></thead>
    <tbody>{filtered.map((row) => <tr key={row.id}>
      <td><strong>{row.name}</strong><small className="cell-sub">{row.email}</small></td>
      <td>{row.institutionName ?? "Sin aula"}{row.institutionType === "INSTITUTION" && <small className="cell-sub">Institución</small>}</td>
      <td className="num">{row.students}</td><td className="num">{row.courses}</td><td className="num">{row.sessions}</td>
      <td><span className={`activity activity-${activityTone(row.lastSeenAt)}`}>{relative(row.lastSeenAt)}</span></td>
      <td className="muted">{row.createdAt ? dateFormat.format(new Date(row.createdAt)) : "—"}</td>
    </tr>)}</tbody>
  </table></div>;
}

const institutionText = (row: PlatformOverviewDto["institutions"][number]) => `${row.name} ${row.owner ?? ""}`;
function InstitutionTable({ rows, search }: { rows: PlatformOverviewDto["institutions"]; search: string }) {
  const filtered = useFiltered(rows, search, institutionText);
  if (!filtered.length) return <p className="empty-state">Nada coincide con la búsqueda.</p>;
  return <div className="table-scroll"><table className="data-table">
    <thead><tr><th>Nombre</th><th>Tipo</th><th className="num">Docentes</th><th className="num">Estudiantes</th><th className="num">Cursos</th><th className="num">Clases</th><th>Última actividad</th></tr></thead>
    <tbody>{filtered.map((row) => <tr key={row.id}>
      <td><strong>{row.name}</strong>{row.owner && <small className="cell-sub">{row.owner}</small>}</td>
      <td><span className={`course-tag ${row.type === "INSTITUTION" ? "tag-institution" : ""}`}>{row.type === "INSTITUTION" ? "Institución" : "Aula personal"}</span></td>
      <td className="num">{row.members}</td><td className="num">{row.students}</td><td className="num">{row.courses}</td><td className="num">{row.sessions}</td>
      <td><span className={`activity activity-${activityTone(row.lastActivityAt)}`}>{relative(row.lastActivityAt)}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) { return <article className={`metric-card tone-${tone}`}><div className="metric-label">{label}</div><div className="metric-value">{value}</div><div className="metric-hint">{hint}</div></article>; }
