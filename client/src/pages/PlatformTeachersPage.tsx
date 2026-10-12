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
  return days < 30 ? `Hace ${days} ${days === 1 ? "día" : "días"}` : dateFormat.format(new Date(value));
}
function tone(value?: string) {
  if (!value) return "idle";
  const days = (Date.now() - new Date(value).getTime()) / 86400000;
  return days <= 7 ? "active" : days <= 30 ? "recent" : "idle";
}
type Teacher = PlatformOverviewDto["teachers"][number];
type Filter = "ALL" | "INSTITUTION" | "PERSONAL" | "ACTIVE" | "IDLE";

export function PlatformTeachersPage() {
  const overview = useQuery({ queryKey: ["platformOverview"], queryFn: api.getPlatformOverview, refetchInterval: 60_000 });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const all = overview.data?.teachers;
  const recent = (row: Teacher) => Boolean(row.lastSeenAt && Date.now() - new Date(row.lastSeenAt).getTime() <= 7 * 86400000);
  const rows = useMemo(() => {
    const text = search.trim().toLowerCase();
    return (all ?? []).filter((row) => {
      if (filter === "INSTITUTION" && row.institutionType !== "INSTITUTION") return false;
      if (filter === "PERSONAL" && row.institutionType !== "PERSONAL") return false;
      if (filter === "ACTIVE" && !recent(row)) return false;
      if (filter === "IDLE" && recent(row)) return false;
      return !text || `${row.name} ${row.email} ${row.institutionName ?? ""}`.toLowerCase().includes(text);
    });
  }, [all, search, filter]);
  if (overview.isLoading) return <LoadingState label="Cargando docentes…" />;
  if (overview.error || !all) return <div className="page"><ErrorPanel title="No se pudieron cargar los docentes" detail={overview.error instanceof Error ? overview.error.message : undefined} /></div>;
  const count = (test: (row: Teacher) => boolean) => all.filter(test).length;
  const options: [Filter, string][] = [["ALL", `Todos (${all.length})`], ["INSTITUTION", `En instituciones (${count((r) => r.institutionType === "INSTITUTION")})`], ["PERSONAL", `Aula personal (${count((r) => r.institutionType === "PERSONAL")})`], ["ACTIVE", `Activos 7 días (${count(recent)})`], ["IDLE", `Sin actividad (${count((r) => !recent(r))})`]];

  return <section className="page">
    <div className="page-heading"><div><h1>Docentes</h1><p className="page-subtitle">Todas las cuentas de docentes, a qué aula o institución pertenecen y cuánto usan SIRAE.</p></div></div>
    <article className="content-card">
      <div className="card-title-row">
        <div className="segmented" role="tablist" style={{ flexWrap: "wrap" }}>{options.map(([value, text]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "is-active" : ""} onClick={() => setFilter(value)}>{text}</button>)}</div>
        <label className="search-field compact-search"><Search size={16} aria-hidden="true" /><input aria-label="Buscar" placeholder="Nombre, correo o aula" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      </div>
      {rows.length ? <div className="table-scroll"><table className="data-table">
        <thead><tr><th>Docente</th><th>Aula o institución</th><th>Rol</th><th className="num">Estudiantes</th><th className="num">Cursos</th><th className="num">Clases</th><th>Última vez</th><th>Registro</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td><strong>{row.name}</strong><small className="cell-sub">{row.email}{!row.active ? " · desactivada" : ""}</small></td>
          <td>{row.institutionName ?? "Sin aula"}{row.institutionType && <small className="cell-sub">{row.institutionType === "INSTITUTION" ? "Institución" : "Aula personal"}</small>}</td>
          <td>{row.role === "ADMIN" ? "Administrador" : row.role === "DOCENTE" ? "Docente" : "—"}</td>
          <td className="num">{row.students}</td><td className="num">{row.courses}</td><td className="num">{row.sessions}</td>
          <td><span className={`activity activity-${tone(row.lastSeenAt)}`}>{relative(row.lastSeenAt)}</span></td>
          <td className="muted">{row.createdAt ? dateFormat.format(new Date(row.createdAt)) : "—"}</td>
        </tr>)}</tbody>
      </table></div> : <p className="empty-state">{all.length ? "Nadie coincide con el filtro." : "Todavía no hay docentes registrados."}</p>}
    </article>
  </section>;
}
